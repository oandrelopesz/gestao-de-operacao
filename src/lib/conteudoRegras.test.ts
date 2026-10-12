import test from "node:test";
import assert from "node:assert/strict";
import {
  ARQUIVO_LOG, aplicarAlteracoes, conferirCampos, conferirEstrutura, faltaParaGerar, fontFace, htmlParaRender,
  instanteBrasilia, laminasDaResposta, montarContexto, motivosDoTexto, mudancasCofre, postsDaSemana, preencherMolde,
  proximoPilar, recortarLog, segundaDaSemana, usosDeFotos, validarMolde,
} from "../../supabase/functions/conteudo/regras.ts";
import type {
  Alteracao, CampoMolde, Lamina, Molde, Moldes, RespostaTexto, TipoMolde,
} from "../../supabase/functions/conteudo/regras.ts";
import { motivosSaude } from "../../supabase/functions/gmn/regras.ts";
import { ESQUEMA_TEXTO, promptAjuste, promptMolde, promptTexto } from "../../supabase/functions/conteudo/prompts.ts";

const campos: CampoMolde[] = [
  { nome: "titulo", tipo: "texto", max: 20, exemplo: "" },
  { nome: "foto", tipo: "imagem", max: 0, exemplo: "" },
];
const alt = (a: Partial<Alteracao>): Alteracao =>
  ({ alvo: "campo", lamina: null, campo: null, valor: null, descricao: null, pasta_id: null, ajuste_css: null, ...a });
const molde = (c: CampoMolde[], aprovado = true): Molde =>
  ({ html: "", campos: c, versao: 1, aprovado_em: aprovado ? "2026-10-12T00:00:00Z" : null, previa_chave: null });
const t30: CampoMolde = { nome: "titulo", tipo: "texto", max: 30, exemplo: "" };
const moldesC: Moldes = {
  capa: molde([t30]),
  texto: molde([t30, { nome: "texto", tipo: "texto", max: 200, exemplo: "" }]),
  foto: molde([t30, { nome: "texto", tipo: "texto", max: 200, exemplo: "" }, { nome: "foto", tipo: "imagem", max: 0, exemplo: "" }]),
  cta: molde([t30]),
};
const lam = (m: TipoMolde, c: Record<string, string>, imagem_descricao: string | null = null): RespostaTexto["laminas"][number] =>
  ({ molde: m, campos: Object.entries(c).map(([nome, valor]) => ({ nome, valor })), imagem_descricao, pasta_id: null });

test("preencherMolde escapa texto, quebra linha e só aceita imagem data: ou https:", () => {
  assert.equal(
    preencherMolde('<h1>{{titulo}}</h1><img src="{{foto}}">', campos, { titulo: 'A <b> & "c"\nd', foto: "data:image/png;base64,AAA" }),
    '<h1>A &lt;b&gt; &amp; &quot;c&quot;<br>d</h1><img src="data:image/png;base64,AAA">',
  );
  assert.equal(preencherMolde('<img src="{{foto}}">{{nada}}', campos, { foto: "javascript:alert(1)" }), '<img src="">');
  assert.equal(preencherMolde('<img src="{{logo_clara}}">', [], { logo_clara: "data:image/png;base64,B" }), '<img src="data:image/png;base64,B">');
});

test("conferirCampos aponta vazio e acima do limite", () => {
  assert.deepEqual(conferirCampos(campos, { titulo: "x".repeat(21) }), ["titulo: 21 caracteres (máximo 20)"]);
  assert.deepEqual(conferirCampos(campos, { titulo: "  " }), ["titulo: vazio"]);
  assert.deepEqual(conferirCampos(campos, { titulo: "ok" }), []);
});

test("conferirEstrutura do carrossel e do estático", () => {
  assert.deepEqual(conferirEstrutura("carrossel", ["capa", "texto", "foto", "texto", "cta"]), []);
  assert.equal(conferirEstrutura("carrossel", ["capa", "texto", "cta"]).length, 1);
  assert.equal(conferirEstrutura("carrossel", ["texto", "texto", "texto", "texto", "cta"]).length, 1);
  assert.deepEqual(conferirEstrutura("estatico", ["estatico"]), []);
  assert.equal(conferirEstrutura("estatico", ["capa"]).length, 1);
});

test("validarMolde", () => {
  const ok: CampoMolde[] = [{ nome: "titulo", tipo: "texto", max: 60, exemplo: "Oi" }, { nome: "logo_clara", tipo: "logo", max: 0, exemplo: "" }];
  assert.deepEqual(validarMolde("capa", '<html><body><h1>{{titulo}}</h1><img src="{{logo_clara}}"></body></html>', ok, ["clara"]), []);
  assert.deepEqual(validarMolde("capa", '<h1>{{titulo}}</h1><img src="{{logo_clara}}">', ok, ["escura"]), ["logo logo_clara não existe no kit"]);
  assert.ok(validarMolde("texto", "<h1>{{titulo}}</h1>", [ok[0]], []).includes("falta o campo texto"));
  assert.ok(validarMolde("capa", "<h1>{{titulo}}</h1><script>x</script>", [ok[0]], []).includes("o molde não pode ter script"));
  assert.ok(validarMolde("capa", '<h1>{{titulo}}</h1><img src="https://x.com/a.png">', [ok[0]], []).includes("o molde não pode carregar nada de fora"));
  assert.deepEqual(validarMolde("capa", '<svg xmlns="http://www.w3.org/2000/svg"></svg><h1>{{titulo}}</h1>', [ok[0]], []), []);
});

test("proximoPilar: nunca usado primeiro, senão o usado há mais tempo", () => {
  const pilares = [{ nome: "Dica", descricao: "" }, { nome: "Prova", descricao: "" }, { nome: "Oferta", descricao: "" }];
  assert.equal(proximoPilar(pilares, ["Dica", "Prova"])?.nome, "Oferta");
  assert.equal(proximoPilar(pilares, ["Oferta", "Dica", "Prova", "Dica"])?.nome, "Prova");
  assert.equal(proximoPilar([], []), null);
});

test("datas da semana em Brasília", () => {
  assert.equal(segundaDaSemana("2026-10-18"), "2026-10-12");
  assert.equal(segundaDaSemana("2026-10-12"), "2026-10-12");
  assert.equal(segundaDaSemana("2026-10-11"), "2026-10-05");
  assert.equal(instanteBrasilia("2026-10-13", "09:00"), "2026-10-13T12:00:00.000Z");
  assert.deepEqual(postsDaSemana("2026-10-12", [{ dia: 0, hora: "18:30", formato: "estatico" }, { dia: 2, hora: "09:00", formato: "carrossel" }]), [
    { origem_data: "2026-10-13", agendado_para: "2026-10-13T12:00:00.000Z", formato: "carrossel" },
    { origem_data: "2026-10-18", agendado_para: "2026-10-18T21:30:00.000Z", formato: "estatico" },
  ]);
});

test("recortarLog fica só com os últimos 60 dias", () => {
  const log = "---\ntipo: log\n---\n# Log\n\n### 2026-07-01\n- velho (memória)\n\n### 2026-09-01\n- recente (memória)\n\n### 2026-10-10\n- novo (memória)\n";
  assert.equal(recortarLog(log, "2026-10-12"), "### 2026-09-01\n- recente (memória)\n\n### 2026-10-10\n- novo (memória)");
});

test("montarContexto: nota central, Log, documentos; corta no limite", () => {
  const r = montarContexto([
    { caminho: "Documentos/B.md", conteudo: "b" }, { caminho: ARQUIVO_LOG, conteudo: "log" },
    { caminho: "Kobe.md", conteudo: "central" }, { caminho: "Documentos/A.md", conteudo: "a" },
  ]);
  assert.equal(r, "=== Kobe.md ===\ncentral\n\n=== Log (60 dias) ===\nlog\n\n=== Documentos/A.md ===\na\n\n=== Documentos/B.md ===\nb");
  assert.ok(montarContexto([{ caminho: "X.md", conteudo: "1234567890" }], 12).length <= 12);
  assert.equal(montarContexto([]), "");
});

test("mudancasCofre envia novos e mudados, remove os que sumiram", () => {
  assert.deepEqual(mudancasCofre({ a: "1", b: "2" }, { a: "1", b: "x", c: "3" }), { enviar: ["b"], remover: ["c"] });
});

test("aplicarAlteracoes mexe só no pedido e não altera o original", () => {
  const laminas: Lamina[] = [
    { molde: "capa", campos: { titulo: "A" }, jpg_chave: "k1" },
    { molde: "texto", campos: { titulo: "B", texto: "b" }, jpg_chave: "k2" },
    { molde: "cta", campos: { titulo: "C" }, jpg_chave: "k3" },
  ];
  const r = aplicarAlteracoes(laminas, "L1", [
    alt({ alvo: "campo", lamina: 1, campo: "titulo", valor: "Novo" }),
    alt({ alvo: "imagem", lamina: 2, descricao: "salão", pasta_id: "p1" }),
    alt({ alvo: "legenda", valor: "L2" }),
    alt({ alvo: "campo", lamina: 9, campo: "titulo", valor: "x" }),
  ]);
  assert.equal(r.laminas[0].campos.titulo, "Novo");
  assert.equal(r.laminas[0].jpg_chave, null);
  assert.equal(r.laminas[1].molde, "foto");
  assert.deepEqual(r.laminas[1].imagem, { descricao: "salão", pasta_id: "p1", pendente: true });
  assert.equal(r.laminas[2].jpg_chave, "k3");
  assert.equal(r.legenda, "L2");
  assert.equal(r.imagens, true);
  assert.equal(laminas[0].campos.titulo, "A");
});

test("usosDeFotos guarda o uso mais recente de cada foto do Drive", () => {
  assert.deepEqual(usosDeFotos([
    { created_at: "2026-10-01T00:00:00Z", laminas: [{ molde: "foto", campos: {}, imagem: { descricao: "", drive_id: "a" }, jpg_chave: null }] },
    { created_at: "2026-10-05T00:00:00Z", laminas: [{ molde: "foto", campos: {}, imagem: { descricao: "", drive_id: "a" }, jpg_chave: null }, { molde: "capa", campos: {}, jpg_chave: null }] },
  ]), { a: "2026-10-05T00:00:00Z" });
});

test("faltaParaGerar", () => {
  const base: Parameters<typeof faltaParaGerar>[0] = { pasta_cofre: "Kobe Growth", ig_conta_id: "1", logos: [{ variante: "principal", chave: "k", largura: 1, altura: 1 }],
    moldes: { capa: molde([]), texto: molde([]), foto: molde([]), cta: molde([], false) } };
  assert.deepEqual(faltaParaGerar(base, "carrossel"), ["moldes aprovados (CTA final)"]);
  assert.deepEqual(faltaParaGerar({ ...base, ig_conta_id: null, logos: [] }, "estatico"), ["conta do Instagram", "logo", "moldes aprovados (Post estático)"]);
});

test("htmlParaRender: tamanho fixo, ajuste depois do molde e aviso de pronto no fim", () => {
  const doc = htmlParaRender("<html><head><style>h1{}</style></head><body><h1>x</h1></body></html>", { cssFontes: "@font-face{}", ajusteCss: "h1{color:red}" });
  assert.ok(doc.includes("width:1080px;height:1350px"));
  assert.ok(doc.indexOf("h1{color:red}") > doc.indexOf("h1{}"));
  assert.ok(doc.indexOf("data-pronto") > doc.indexOf("<h1>x</h1>"));
  assert.ok(htmlParaRender("<h1>y</h1>", { cssFontes: "" }).startsWith("<!doctype html>"));
});

test("fontFace embute a fonte com o peso", () => {
  assert.equal(fontFace('Clash "Display"', "woff2", "QUJD", 700),
    '@font-face{font-family:"Clash Display";src:url(data:font/woff2;base64,QUJD) format("woff2");font-weight:700;font-display:block}');
});

test("motivosDoTexto confere estrutura, limites, legenda e saúde", () => {
  const r: RespostaTexto = { tema: "t", legenda: "Legenda", laminas: [lam("capa", { titulo: "Oi" }), lam("texto", { titulo: "A", texto: "b" }),
    lam("texto", { titulo: "A", texto: "b" }), lam("texto", { titulo: "A", texto: "100% garantido" }), lam("cta", { titulo: "Fale" })] };
  assert.deepEqual(motivosDoTexto(r, "carrossel", { moldes: moldesC, saude: false }), []);
  assert.ok(motivosDoTexto(r, "carrossel", { moldes: moldesC, saude: true }).some((m) => m.startsWith("saúde:")));
  assert.deepEqual(motivosSaude("Resultado garantido"), ["promessa de resultado (garantido)"]);
});

test("laminasDaResposta marca a foto como pendente, com o título como reserva da descrição", () => {
  const ls = laminasDaResposta({ tema: "t", legenda: "l", laminas: [lam("foto", { titulo: "Salão", texto: "x" }), lam("texto", { titulo: "A", texto: "b" })] }, moldesC);
  assert.deepEqual(ls[0].imagem, { descricao: "Salão", pasta_id: null, pendente: true });
  assert.equal(ls[1].imagem, undefined);
  assert.equal(ls[0].jpg_chave, null);
});

test("promptTexto leva limites, tema fixo e subpastas", () => {
  const p = promptTexto({ formato: "carrossel", pilar: { nome: "Dica", descricao: "ensina" }, tema: "Buffet em julho", temasRecentes: ["x"],
    tomDeVoz: "direto", moldes: moldesC, pastas: [{ id: "p1", caminho: "Espaço", quantidade: 3 }], saude: false });
  assert.ok(p.pedido.includes("titulo (até 30 caracteres)"));
  assert.ok(p.pedido.includes('Use exatamente este tema: "Buffet em julho"'));
  assert.ok(p.pedido.includes('id "p1"'));
  assert.ok(!p.system.includes("CFM"));
  assert.ok(promptTexto({ formato: "estatico", pilar: null, tema: null, temasRecentes: [], tomDeVoz: "", moldes: { estatico: molde([t30]) }, pastas: [], saude: true }).system.includes("CFM"));
});

test("promptMolde cobra os campos do tipo e manda os moldes já criados", () => {
  const m = promptMolde({ tipo: "foto", designSystem: "azul", tomDeVoz: "", logos: [{ variante: "clara", chave: "k", largura: 600, altura: 200 }],
    fontes: [{ familia: "Satoshi", origem: "google" }], outros: [{ tipo: "capa", html: "<h1>capa</h1>" }] });
  assert.ok(m.user.includes("titulo, texto, foto"));
  assert.ok(m.user.includes("logo_clara"));
  assert.ok(m.user.includes("<h1>capa</h1>"));
});

test("promptAjuste numera as lâminas a partir de 1", () => {
  const m = promptAjuste({ laminas: [{ molde: "capa", campos: { titulo: "Oi" }, jpg_chave: "k" }], legenda: "L", moldes: moldesC, pastas: [], pedido: "mais curto" });
  assert.ok(m.user.includes('1. capa: titulo = "Oi" (até 30)'));
});

test("esquema do texto pede tema, legenda e lâminas", () => {
  assert.deepEqual(ESQUEMA_TEXTO.required, ["tema", "legenda", "laminas"]);
});

test("preencherMolde e htmlParaRender: nome herdado do Object e '$&' no CSS não quebram", () => {
  assert.equal(preencherMolde("{{constructor}}|{{__proto__}}", [], {}), "|");
  assert.ok(htmlParaRender("<html><head></head><body></body></html>", { cssFontes: "", ajusteCss: "a::after{content:'$&'}" }).includes("content:'$&'"));
});
