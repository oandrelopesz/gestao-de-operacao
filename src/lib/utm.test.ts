import { test } from "node:test";
import assert from "node:assert/strict";
import { ehMacro, entradaPadrao, gerarUtm, lerUtm, limpar, nomeDaUtm, sugerirCanal } from "./utm.ts";
import { CANAIS, MEDIUMS, opcoesDoSlot } from "./utmCanais.ts";

test("limpar: minúsculo, sem acento, _ entre palavras, hífen colado", () => {
  assert.equal(limpar("  Black Friday 2026! "), "black_friday_2026");
  assert.equal(limpar("Promoção de Verão"), "promocao_de_verao");
  assert.equal(limpar("a - b"), "a-b");
  assert.equal(limpar("___x___"), "x");
  assert.equal(limpar("São Paulo / Centro"), "sao_paulo_centro");
});

test("ehMacro reconhece as variáveis das plataformas", () => {
  for (const v of ["{{campaign.name}}", "{campaignid}", "__AID_NAME__", "{{publisher_name}}_{{section_name}}"]) assert.ok(ehMacro(v), v);
  for (const v of ["google", "black_friday", "bio_pessoal"]) assert.ok(!ehMacro(v), v);
});

test("Meta: padrão dinâmico, identifica Facebook ou Instagram, variáveis sem codificar", () => {
  const r = gerarUtm(entradaPadrao("meta"));
  assert.deepEqual(r.erros, []);
  assert.equal(
    r.parametros,
    "utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&utm_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}",
  );
  assert.ok(r.dinamico);
  assert.equal(r.linkCompleto, null);
});

test("Meta: origem fixa e sem IDs", () => {
  const e = { ...entradaPadrao("meta", "https://site.com.br/lp"), source: "instagram", incluirIds: false };
  const r = gerarUtm(e);
  assert.equal(r.parametros, "utm_source=instagram&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}");
  assert.equal(r.linkCompleto, `https://site.com.br/lp?${r.parametros}`);
});

test("Google Ads: nome da campanha digitado, IDs nos extras e modelo de acompanhamento", () => {
  const e = entradaPadrao("google_ads");
  e.campaign = { modo: "fixo", texto: "Black Friday 2026" };
  const r = gerarUtm(e);
  assert.deepEqual(r.erros, []);
  assert.equal(
    r.parametros,
    "utm_source=google&utm_medium=cpc&utm_campaign=black_friday_2026&utm_content={creative}&utm_term={keyword}&utm_id={campaignid}&adgroup_id={adgroupid}&network={network}&device={device}",
  );
  assert.equal(r.modeloGoogle, `{lpurl}?${r.parametros}`);
});

test("campanha vazia, link inválido e canal sem nome de campanha geram erro e nenhum parâmetro", () => {
  const sem = gerarUtm(entradaPadrao("google_ads"));
  assert.deepEqual(sem.erros, ["Digite o nome da campanha."]);
  assert.equal(sem.parametros, "");
  const e = entradaPadrao("tiktok", "isso não é link");
  assert.deepEqual(gerarUtm(e).erros, ["O link de destino não parece válido."]);
});

test("link: mantém query e âncora, troca UTM antiga e avisa", () => {
  const e = entradaPadrao("google_ads", "site.com/lp?x=1&utm_source=velho&utm_foo=2#topo");
  e.campaign = { modo: "fixo", texto: "Oferta" };
  e.incluirIds = false;
  const r = gerarUtm(e);
  assert.equal(
    r.linkCompleto,
    "https://site.com/lp?x=1&utm_source=google&utm_medium=cpc&utm_campaign=oferta&utm_content={creative}&utm_term={keyword}#topo",
  );
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /utm_source, utm_foo/);
});

test("link sem caminho ganha a barra antes do ?, http gera aviso", () => {
  const r = gerarUtm(entradaPadrao("gmn", "http://clinica.com.br"));
  assert.equal(r.linkCompleto, "http://clinica.com.br/?utm_source=google_meu_negocio&utm_medium=organic&utm_campaign=perfil_gmn&utm_content=botao_site");
  assert.equal(r.avisos.length, 1);
  assert.ok(!r.dinamico);
});

test("bios do Instagram separam pessoal e profissional pelo utm_content", () => {
  assert.match(gerarUtm(entradaPadrao("ig_bio_pessoal", "https://a.com.br")).parametros, /utm_content=bio_pessoal$/);
  assert.match(gerarUtm(entradaPadrao("ig_bio_profissional", "https://a.com.br")).parametros, /utm_content=bio_profissional$/);
});

test("origem e mídia digitadas são limpas, variáveis digitadas ficam intactas", () => {
  const e = entradaPadrao("organico_busca", "https://a.com.br");
  e.source = "Duck Duck";
  e.medium = "Meu Medium";
  assert.match(gerarUtm(e).parametros, /^utm_source=duck_duck&utm_medium=meu_medium&/);
  e.source = "{{site_source_name}}";
  assert.match(gerarUtm(e).parametros, /^utm_source=\{\{site_source_name\}\}&/);
});

test("lerUtm: separa a UTM do resto do link", () => {
  const l = lerUtm("https://site.com/lp?x=1&utm_source=google&utm_medium=cpc&utm_campaign=Oferta%20Maio&utm_term={keyword}#topo");
  assert.ok(l);
  assert.equal(l.base, "https://site.com/lp?x=1#topo");
  assert.equal(l.parametros, "utm_source=google&utm_medium=cpc&utm_campaign=Oferta%20Maio&utm_term={keyword}");
  assert.equal(l.campaign, "Oferta Maio");
  assert.equal(l.term, "{keyword}");
  const comEspaco = lerUtm("  https://site.com/lp?utm_source=google&utm_campaign=Teste Manual#a ");
  assert.equal(comEspaco?.campaign, "Teste Manual");
  assert.equal(comEspaco?.url, "https://site.com/lp?utm_source=google&utm_campaign=Teste%20Manual#a");
  assert.equal(lerUtm("https://site.com/lp?x=1"), null);
  assert.equal(lerUtm("texto solto"), null);
});

test("lerUtm devolve o que gerarUtm montou", () => {
  const e = { ...entradaPadrao("meta", "https://site.com/lp?x=1"), incluirIds: false };
  const r = gerarUtm(e);
  const l = lerUtm(r.linkCompleto!);
  assert.ok(l);
  assert.equal(l.base, "https://site.com/lp?x=1");
  assert.equal(l.source, "{{site_source_name}}");
  // Os IDs extras (adset_id e outros) não são UTM: ficam no link base
  const comIds = lerUtm(gerarUtm(entradaPadrao("meta", "https://site.com/lp")).linkCompleto!);
  assert.match(comIds!.base, /^https:\/\/site\.com\/lp\?adset_id=/);
});

test("nomeDaUtm: usa a campanha só quando ela é um texto, não uma variável", () => {
  assert.equal(nomeDaUtm("Google Ads", "black_friday"), "Google Ads · black_friday");
  assert.equal(nomeDaUtm("Meta Ads", "{{campaign.name}}"), "Meta Ads");
  assert.equal(nomeDaUtm("Meta Ads", ""), "Meta Ads");
});

test("sugerirCanal pela origem", () => {
  assert.equal(sugerirCanal("{{site_source_name}}", "paid_social"), "meta");
  assert.equal(sugerirCanal("google", "cpc"), "google_ads");
  assert.equal(sugerirCanal("google", "organic"), "organico_busca");
  assert.equal(sugerirCanal("google_meu_negocio", "organic"), "gmn");
  assert.equal(sugerirCanal("newsletter", "email"), null);
});

test("catálogo: ids únicos, padrões existem e nenhum valor quebra a URL", () => {
  assert.equal(new Set(CANAIS.map((c) => c.id)).size, CANAIS.length);
  const mediums = new Set(MEDIUMS.map((m) => m.valor));
  const seguro = /^[^\s?&#=]+$/;
  for (const c of CANAIS) {
    assert.ok(c.sources.some((s) => s.valor === c.source), `${c.id}: source padrão fora da lista`);
    assert.ok(mediums.has(c.medium), `${c.id}: medium padrão fora da lista`);
    for (const s of c.sources) assert.match(s.valor, seguro, `${c.id}: source ${s.valor}`);
    for (const n of ["campaign", "term", "content"] as const) {
      const ids = opcoesDoSlot(c, n).map((o) => o.id);
      assert.ok(ids.includes(c[n].padrao), `${c.id}.${n}: padrão ${c[n].padrao} não existe`);
      assert.equal(new Set(ids).size, ids.length, `${c.id}.${n}: ids repetidos`);
      for (const o of c[n].opcoes) assert.match(o.valor, seguro, `${c.id}.${n}.${o.id}`);
    }
    for (const [k, v] of [...(c.ids.utmId ? [["utm_id", c.ids.utmId]] : []), ...c.ids.extras]) {
      assert.match(`${k}=${v}`, /^[a-z_]+=[^\s?&#=]+$/, `${c.id}: ${k}`);
    }
    const e = entradaPadrao(c.id, "https://a.com.br/pagina");
    e.campaign = c.campaign.padrao === "fixo" ? { modo: "fixo", texto: "Teste Campanha" } : e.campaign;
    const r = gerarUtm(e);
    assert.deepEqual(r.erros, [], `${c.id}: padrão gera erro`);
    assert.ok(!/\s|\?|#/.test(r.parametros), `${c.id}: parâmetros com caractere proibido`);
    assert.ok(r.linkCompleto!.startsWith("https://a.com.br/pagina?utm_source="), c.id);
    assert.equal(Boolean(r.modeloGoogle), Boolean(c.modeloGoogle));
  }
});
