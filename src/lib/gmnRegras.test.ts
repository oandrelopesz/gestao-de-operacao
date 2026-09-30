import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENDA_PADRAO, BRIEFING_VAZIO, HORARIOS, TEMAS, alternarDia, checarTexto, comUtm, escolherImagem, escolherPalavras,
  idPastaDrive, mesmoHorario, montarMensagensBriefing, montarMensagensPost, montarPromptImagem, mudarHora, normalizarAgenda,
  normalizarBriefing, proximoTema, resumoAgenda,
} from "../../supabase/functions/gmn/regras.ts";

const textoBom =
  "Na Brazilian Car você encontra seminovos revisados em Brasília, com procedência conferida e atendimento " +
  "sem pressa. Venha conhecer nosso estoque no SIA e faça sua avaliação de troca com a nossa equipe.";

test("normalizarBriefing aceita lixo, texto com quebras e listas", () => {
  assert.deepEqual(normalizarBriefing(null), BRIEFING_VAZIO);
  const b = normalizarBriefing({ contexto: "  Loja ", servicos: "compra\n venda \n\n", bairros: ["SIA", "", 3], extra: 1 });
  assert.equal(b.contexto, "Loja");
  assert.deepEqual(b.servicos, ["compra", "venda"]);
  assert.deepEqual(b.bairros, ["SIA"]);
  assert.equal("extra" in b, false);
});

test("proximoTema segue a ordem e não repete os 3 últimos", () => {
  assert.equal(proximoTema([]), "servico");
  assert.equal(proximoTema(["servico"]), "duvida");
  assert.equal(proximoTema(["bastidores", "diferencial", "regiao"]), "servico");
  assert.equal(proximoTema(["duvida", "bastidores", "servico"]), "regiao");
  assert.equal(proximoTema([null, "tema-velho"]), "servico");
  assert.equal(TEMAS.length, 5);
});

test("escolherPalavras prefere as nunca usadas e depois as usadas há mais tempo", () => {
  const palavras = ["seminovos brasília", "carros usados df", "troca de carro", "financiamento"];
  const historico = [["carros usados df"], ["Seminovos Brasília", "financiamento"]]; // mais novo primeiro
  assert.deepEqual(escolherPalavras(palavras, historico), ["troca de carro", "seminovos brasília"]);
  assert.deepEqual(escolherPalavras([], historico), []);
  assert.deepEqual(escolherPalavras(["a", "b", "c"], [], 2), ["a", "b"]);
});

test("checarTexto aprova texto limpo", () => {
  assert.deepEqual(checarTexto(textoBom, { termosProibidos: [], saude: false }), { ok: true, motivos: [] });
});

test("checarTexto reprova tamanho, telefone, link e termo proibido", () => {
  assert.equal(checarTexto("curto", { termosProibidos: [], saude: false }).ok, false);
  assert.equal(checarTexto("x".repeat(1501), { termosProibidos: [], saude: false }).ok, false);
  const tel = checarTexto(textoBom + " Ligue (61) 99999-1234.", { termosProibidos: [], saude: false });
  assert.equal(tel.ok, false);
  assert.match(tel.motivos.join(), /telefone/);
  assert.equal(checarTexto(textoBom + " Acesse www.brazilian.com.br", { termosProibidos: [], saude: false }).ok, false);
  const proib = checarTexto(textoBom + " Carro de LEILÃO não entra.", { termosProibidos: ["leilao"], saude: false });
  assert.equal(proib.ok, false);
  assert.match(proib.motivos.join(), /leilao/);
});

test("checarTexto só aplica as regras de saúde em perfil de saúde", () => {
  const t = textoBom + " Somos a melhor clínica, resultado garantido e preço de R$ 200.";
  assert.equal(checarTexto(t, { termosProibidos: [], saude: false }).ok, true);
  const r = checarTexto(t, { termosProibidos: [], saude: true });
  assert.equal(r.ok, false);
  assert.ok(r.motivos.length >= 3);
  assert.match(checarTexto(textoBom + " Desconto de 20% nesta semana.", { termosProibidos: [], saude: true }).motivos.join(), /desconto/);
});

test("checarTexto: anos e números de carro não são telefone; telefone, 0800, WhatsApp e e-mail são pegos", () => {
  const ok = (s: string) => checarTexto(textoBom + " " + s, { termosProibidos: [], saude: false }).ok;
  for (const s of ["Modelos 2019-2020 e 2021.", "Fiat Argo 2024 2025.", "Safra 2023.2024.", "A partir de R$ 45.000.", "Só 10.000 km rodados."]) {
    assert.equal(ok(s), true, s);
  }
  for (const s of ["Ligue (61) 99999-1234.", "Fale no +55 61 3333-4444.", "Ligue 3333-4444.", "Ligue 0800 123 4567.", "Chame no wa.me/5561999991234.", "Escreva para contato@loja.com.br.", "Veja bit.ly/abc."]) {
    assert.equal(ok(s), false, s);
  }
});

test("checarTexto: termo proibido vale como palavra inteira, sem acento e sem repetir motivo", () => {
  assert.equal(checarTexto(textoBom + " Quem procura carro bom vem aqui.", { termosProibidos: ["cura"], saude: false }).ok, true);
  const r = checarTexto(textoBom + " Carro de leilão, LEILAO nunca.", { termosProibidos: ["Leilão", "leilao"], saude: false });
  assert.equal(r.ok, false);
  assert.equal(r.motivos.filter((m) => m.startsWith("termo proibido")).length, 2);
  assert.equal(checarTexto(textoBom, { termosProibidos: ["  "], saude: false }).ok, true);
});

test("escolherImagem: nunca usada primeiro, depois a usada há mais tempo", () => {
  assert.equal(escolherImagem([], {}), null);
  assert.equal(escolherImagem(["a", "b"], { a: "2026-09-01T00:00:00Z" }), "b");
  assert.equal(escolherImagem(["a", "b"], { a: "2026-09-02T00:00:00Z", b: "2026-09-01T00:00:00Z" }), "b");
});

test("normalizarAgenda: um item por dia, ordenado, descarta lixo", () => {
  assert.deepEqual(normalizarAgenda(null), []);
  assert.deepEqual(
    normalizarAgenda([
      { dia: 4, hora: "14:30" }, { dia: 2, hora: "09:00" }, { dia: 4, hora: "10:00" }, { dia: 7, hora: "09:00" },
      { dia: 1, hora: "25:00" }, "x", null,
    ]),
    [{ dia: 2, hora: "09:00" }, { dia: 4, hora: "14:30" }],
  );
  assert.deepEqual(normalizarAgenda(AGENDA_PADRAO), [{ dia: 2, hora: "09:00" }, { dia: 4, hora: "09:00" }]);
});

test("alternarDia liga com o horário do primeiro dia ligado e desliga", () => {
  const a = [{ dia: 2, hora: "14:30" }];
  assert.deepEqual(alternarDia(a, 5), [{ dia: 2, hora: "14:30" }, { dia: 5, hora: "14:30" }]);
  assert.deepEqual(alternarDia(a, 2), []);
  assert.deepEqual(alternarDia([], 0), [{ dia: 0, hora: "09:00" }]);
  assert.deepEqual(alternarDia(alternarDia([], 3), 1), [{ dia: 1, hora: "09:00" }, { dia: 3, hora: "09:00" }]);
});

test("mudarHora, mesmoHorario, resumoAgenda e HORARIOS", () => {
  const a = [{ dia: 2, hora: "09:00" }, { dia: 4, hora: "09:00" }];
  const b = mudarHora(a, 4, "14:30");
  assert.deepEqual(b, [{ dia: 2, hora: "09:00" }, { dia: 4, hora: "14:30" }]);
  assert.deepEqual(mesmoHorario(b, "10:00"), [{ dia: 2, hora: "10:00" }, { dia: 4, hora: "10:00" }]);
  assert.equal(resumoAgenda(b), "Ter 09:00 · Qui 14:30");
  assert.equal(resumoAgenda([]), "Sem dias");
  assert.equal(HORARIOS.length, 33);
  assert.equal(HORARIOS[0], "06:00");
  assert.equal(HORARIOS[1], "06:30");
  assert.equal(HORARIOS[HORARIOS.length - 1], "22:00");
  // hora inválida não apaga nada
  assert.deepEqual(mudarHora(a, 4, "25:00"), a);
  assert.deepEqual(mesmoHorario(a, ""), a);
});

test("comUtm acrescenta a UTM sem apagar parâmetros e recusa lixo", () => {
  assert.equal(
    comUtm("https://site.com/?a=1"),
    "https://site.com/?a=1&utm_source=google&utm_medium=organic&utm_campaign=gmn-post",
  );
  assert.equal(comUtm("site.com")?.startsWith("https://site.com/"), true);
  assert.equal(comUtm("https://site.com/?utm_source=x")?.includes("utm_source=x"), true);
  assert.equal(comUtm(""), null);
  assert.equal(comUtm("não é link"), null);
});

test("idPastaDrive lê os formatos de link do Drive", () => {
  assert.equal(idPastaDrive("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing"), "1AbCdEfGhIjKlMnOp");
  assert.equal(idPastaDrive("https://drive.google.com/drive/u/1/folders/1AbCdEfGhIjKlMnOp"), "1AbCdEfGhIjKlMnOp");
  assert.equal(idPastaDrive("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp"), "1AbCdEfGhIjKlMnOp");
  assert.equal(idPastaDrive("1AbCdEfGhIjKlMnOpQrStUv"), "1AbCdEfGhIjKlMnOpQrStUv");
  assert.equal(idPastaDrive("https://exemplo.com"), null);
});

test("montarMensagensPost leva briefing, tema, palavras, anteriores e regras de saúde", () => {
  const briefing = { ...BRIEFING_VAZIO, posicionamento: "a melhor loja de Brasília", cidade: "Brasília" };
  const m = montarMensagensPost({
    nome: "Brazilian Car", categoria: "Concessionária", briefing, saude: false, tema: "regiao",
    palavras: ["seminovos brasília"], anteriores: ["Post antigo"], motivoReprovacao: null,
  });
  assert.match(m.user, /Brazilian Car/);
  assert.match(m.user, /a melhor loja de Brasília/);
  assert.match(m.user, /Bairro ou região atendida/);
  assert.match(m.user, /seminovos brasília/);
  assert.match(m.user, /Post antigo/);
  assert.match(m.system, /telefone/i);
  assert.doesNotMatch(m.system, /CFM/);
  const s = montarMensagensPost({
    nome: "Clínica", categoria: null, briefing, saude: true, tema: "servico", palavras: [], anteriores: [],
    motivoReprovacao: "contém telefone",
  });
  assert.match(s.system, /CFM/);
  assert.match(s.user, /contém telefone/);
});

test("montarMensagensBriefing e montarPromptImagem", () => {
  const b = montarMensagensBriefing({
    nome: "Brazilian Car", categoria: null, site: "https://brazilian.com.br", endereco: "SIA", nicho: "automotivo",
    briefingAtual: BRIEFING_VAZIO, textoDadosInternos: "Pergunta 1 - Resposta",
  });
  assert.match(b.user, /Pergunta 1 - Resposta/);
  assert.match(b.user, /automotivo/);
  const p = montarPromptImagem({ nome: "Brazilian Car", categoria: "Loja de carros usados", briefing: BRIEFING_VAZIO, tema: "bastidores" });
  assert.match(p, /sem texto/i);
  assert.match(p, /Loja de carros usados/);
});
