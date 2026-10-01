import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENDA_PADRAO, BRIEFING_VAZIO, ESQUEMA_CHECAGEM_IMAGEM, HORARIOS, PROMPT_CHECAGEM_IMAGEM, TEMAS, alternarDia,
  alternarImagem, base64ParaBytes, checarTexto, comUtm, decidirImagem, decisaoChecagem, descricaoDaFoto, escolherImagem,
  escolherPalavras, fotoDiretaDoDrive, idPastaDrive, linkDoGoogle, miniaturaGrande, ordemDeTentativa, tipoPelaAssinatura,
  mesmoHorario, montarMensagensBriefing, montarMensagensPost, montarPromptImagem, mudarHora, normalizarAgenda,
  normalizarBriefing, normalizarImagensSite, opcoesDaLogo, promptChecagemImagem, proximoTema, resumoAgenda, tamanhoBase64,
  type PosicaoLogo,
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
  assert.equal(checarTexto(textoBom + " Atendimento descontraído para diabetes descontrolada.", { termosProibidos: [], saude: true }).ok, true);
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
  assert.equal(checarTexto(textoBom + " Temos seminovos revisados.", { termosProibidos: ["seminovo"], saude: false }).ok, false);
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

test("fotoDiretaDoDrive: só JPG/PNG de até 5 MB vão direto; o resto usa a miniatura do Google", () => {
  assert.equal(fotoDiretaDoDrive("image/jpeg", 1_000_000), true);
  assert.equal(fotoDiretaDoDrive("image/png", 5 * 1024 * 1024), true);
  assert.equal(fotoDiretaDoDrive("image/png", 5 * 1024 * 1024 + 1), false);
  assert.equal(fotoDiretaDoDrive("image/heif", 900_000), false);
  assert.equal(fotoDiretaDoDrive("image/webp", 10), false);
});

test("miniaturaGrande: troca o tamanho do link de miniatura (ou acrescenta) por =s2048", () => {
  assert.equal(miniaturaGrande("https://lh3.googleusercontent.com/drive-storage/abc=s220"), "https://lh3.googleusercontent.com/drive-storage/abc=s2048");
  assert.equal(miniaturaGrande("https://lh3.googleusercontent.com/abc=w400-h300"), "https://lh3.googleusercontent.com/abc=s2048");
  assert.equal(miniaturaGrande("https://lh3.googleusercontent.com/abc"), "https://lh3.googleusercontent.com/abc=s2048");
});

test("miniaturaGrande: só troca o sufixo de tamanho no fim do caminho; query, fragmento e padding ficam intactos", () => {
  const h = "https://lh3.googleusercontent.com";
  assert.equal(miniaturaGrande(`${h}/abc=s220-c`), `${h}/abc=s2048`);
  assert.equal(miniaturaGrande(`${h}/abc=w220-h220-p-k-no-nu`), `${h}/abc=s2048`);
  assert.equal(miniaturaGrande(`${h}/abc=s220-p-k-no-nu`), `${h}/abc=s2048`);
  // query string e fragmento não são tocados (o tamanho vai no caminho)
  assert.equal(miniaturaGrande(`${h}/abc=s220?authuser=0`), `${h}/abc=s2048?authuser=0`);
  assert.equal(miniaturaGrande(`${h}/abc?id=7`), `${h}/abc=s2048?id=7`);
  assert.equal(miniaturaGrande(`${h}/abc=w400-h300#x`), `${h}/abc=s2048#x`);
  // id com "=" de padding: o padding fica; só o sufixo de tamanho sai
  assert.equal(miniaturaGrande(`${h}/abc==s220`), `${h}/abc==s2048`);
  assert.equal(miniaturaGrande(`${h}/abc==`), `${h}/abc===s2048`);
  // "=" que não é tamanho não é apagado
  assert.equal(miniaturaGrande(`${h}/abc=xyz`), `${h}/abc=xyz=s2048`);
  assert.equal(miniaturaGrande(`${h}/abc=s220`, 1024), `${h}/abc=s1024`);
});

test("linkDoGoogle: só https em googleusercontent.com ou google.com (e subdomínios) recebe o token", () => {
  assert.equal(linkDoGoogle("https://lh3.googleusercontent.com/drive-storage/abc=s220"), true);
  assert.equal(linkDoGoogle("https://docs.google.com/a/b"), true);
  assert.equal(linkDoGoogle("http://lh3.googleusercontent.com/abc"), false);
  assert.equal(linkDoGoogle("https://googleusercontent.com/abc"), false);
  assert.equal(linkDoGoogle("https://evilgoogleusercontent.com/abc"), false);
  assert.equal(linkDoGoogle("https://lh3.googleusercontent.com.evil.com/abc"), false);
  assert.equal(linkDoGoogle("https://evil.com/lh3.googleusercontent.com"), false);
  assert.equal(linkDoGoogle("https://usuario@evil.com/x"), false);
  assert.equal(linkDoGoogle("não é link"), false);
  assert.equal(linkDoGoogle(""), false);
});

test("tipoPelaAssinatura: JPEG (3 bytes) e PNG (8 bytes) completos; o resto, null", () => {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  assert.equal(tipoPelaAssinatura(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), "image/jpeg");
  assert.equal(tipoPelaAssinatura(Uint8Array.from([...png, 0x00, 0x00])), "image/png");
  assert.equal(tipoPelaAssinatura(Uint8Array.from([0xff, 0xd8])), null); // curto demais
  assert.equal(tipoPelaAssinatura(Uint8Array.from([0xff, 0xd8, 0x00])), null);
  assert.equal(tipoPelaAssinatura(Uint8Array.from([0x89, 0x50])), null); // só o começo do PNG
  assert.equal(tipoPelaAssinatura(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b])), null);
  assert.equal(tipoPelaAssinatura(new TextEncoder().encode("RIFF....WEBPVP8 ")), null); // WEBP
  assert.equal(tipoPelaAssinatura(new TextEncoder().encode("<svg xmlns=")), null);
  assert.equal(tipoPelaAssinatura(new Uint8Array(0)), null);
});

test("descricaoDaFoto: descrição do Drive vence; sem ela, o nome sem extensão e sem _-", () => {
  assert.equal(descricaoDaFoto("Fachada da loja à noite", "IMG_1.jpg"), "Fachada da loja à noite");
  assert.equal(descricaoDaFoto("", "fachada-da-loja_2024.HEIC"), "fachada da loja 2024");
  assert.equal(descricaoDaFoto(null, "Pátio coberto.png"), "Pátio coberto");
  assert.equal(descricaoDaFoto("  ", "Sala de espera.jpg"), "Sala de espera");
  // a descrição escrita pelo cliente vale mesmo que lembre um nome de câmera
  assert.equal(descricaoDaFoto("IMG 2024 da vitrine", "IMG_1.jpg"), "IMG 2024 da vitrine");
});

test("descricaoDaFoto: nome de câmera, de captura de tela ou quase só número não diz nada e vira vazio", () => {
  for (const nome of [
    "IMG_20240101_123456.jpg", "IMG_1234.HEIC", "DSC_0001.JPG", "DSCN0042.jpg", "DSCF1234.jpg", "PXL_20240101_123456789.MP.jpg",
    "MVIMG_20240101_123456.jpg", "WhatsApp Image 2024-01-01 at 10.20.30.jpeg", "WhatsApp Imagem 2024-01-01.jpeg",
    "Screenshot 2024-01-01 at 10.20.30.png", "Screenshot_20240101-123456.png", "Captura de tela 2026-09-24 113806.png",
    "20240101_123456.jpg", "123456.png", "2024-01-01 10.20.30.jpg", "a1.jpg", "",
  ]) {
    assert.equal(descricaoDaFoto("", nome), "", nome);
    assert.equal(descricaoDaFoto(undefined, nome), "", nome);
  }
  // nomes descritivos continuam valendo, mesmo com números
  for (const [nome, esperado] of [
    ["Fiat Argo 2024.jpg", "Fiat Argo 2024"], ["fachada-da-loja_2024.jpg", "fachada da loja 2024"], ["Sala 12.png", "Sala 12"],
    ["dsc fachada.jpg", "dsc fachada"], ["Vitrine.webp", "Vitrine"],
  ]) {
    assert.equal(descricaoDaFoto("", nome), esperado, nome);
  }
});

test("ordemDeTentativa: nunca usadas primeiro (na ordem), depois as usadas há mais tempo; até 3 e sem repetir", () => {
  assert.deepEqual(ordemDeTentativa([], {}), []);
  assert.deepEqual(ordemDeTentativa(["a", "b", "c", "d", "e"], {}), ["a", "b", "c"]);
  assert.deepEqual(ordemDeTentativa(["a", "b", "c", "d"], { a: "2026-09-03T00:00:00Z", c: "2026-09-01T00:00:00Z" }), ["b", "d", "c"]);
  assert.deepEqual(
    ordemDeTentativa(["a", "b", "c"], { a: "2026-09-03T00:00:00Z", b: "2026-09-01T00:00:00Z", c: "2026-09-02T00:00:00Z" }),
    ["b", "c", "a"],
  );
  assert.deepEqual(ordemDeTentativa(["a", "b"], {}), ["a", "b"]); // menos fotos que o máximo
  assert.deepEqual(ordemDeTentativa(["a", "b", "c"], {}, 1), ["a"]);
  assert.deepEqual(ordemDeTentativa(["a", "b", "c"], {}, 0), []);
  // o primeiro é sempre o que escolherImagem escolheria
  const usos = { a: "2026-09-02T00:00:00Z", b: "2026-09-01T00:00:00Z" };
  assert.equal(ordemDeTentativa(["a", "b"], usos)[0], escolherImagem(["a", "b"], usos));
});

test("normalizarAgenda: um item por dia, ordenado, descarta lixo", () => {
  assert.deepEqual(normalizarAgenda(null), []);
  assert.deepEqual(
    normalizarAgenda([
      { dia: 4, hora: "14:30" }, { dia: 2, hora: "09:00" }, { dia: 4, hora: "10:00" }, { dia: 7, hora: "09:00" },
      { dia: 1, hora: "25:00" }, "x", null,
    ]),
    [{ dia: 2, hora: "09:00", imagem: true }, { dia: 4, hora: "14:30", imagem: true }],
  );
  assert.deepEqual(
    normalizarAgenda(AGENDA_PADRAO),
    [{ dia: 2, hora: "09:00", imagem: true }, { dia: 4, hora: "09:00", imagem: true }],
  );
});

test("normalizarAgenda: imagem booleana é mantida; faltando ou de outro tipo vira true", () => {
  assert.deepEqual(
    normalizarAgenda([
      { dia: 1, hora: "09:00", imagem: false }, { dia: 2, hora: "09:00", imagem: true }, { dia: 3, hora: "09:00" },
      { dia: 4, hora: "09:00", imagem: "não" }, { dia: 5, hora: "09:00", imagem: 0 }, { dia: 6, hora: "09:00", imagem: null },
    ]),
    [
      { dia: 1, hora: "09:00", imagem: false }, { dia: 2, hora: "09:00", imagem: true }, { dia: 3, hora: "09:00", imagem: true },
      { dia: 4, hora: "09:00", imagem: true }, { dia: 5, hora: "09:00", imagem: true }, { dia: 6, hora: "09:00", imagem: true },
    ],
  );
  assert.equal(AGENDA_PADRAO.every((x) => x.imagem === true), true);
});

test("alternarDia liga com o horário do primeiro dia ligado e desliga; dia novo entra com imagem", () => {
  const a = [{ dia: 2, hora: "14:30", imagem: true }];
  assert.deepEqual(alternarDia(a, 5), [{ dia: 2, hora: "14:30", imagem: true }, { dia: 5, hora: "14:30", imagem: true }]);
  assert.deepEqual(alternarDia(a, 2), []);
  assert.deepEqual(alternarDia([], 0), [{ dia: 0, hora: "09:00", imagem: true }]);
  assert.deepEqual(
    alternarDia(alternarDia([], 3), 1),
    [{ dia: 1, hora: "09:00", imagem: true }, { dia: 3, hora: "09:00", imagem: true }],
  );
  // ligar um dia novo não mexe no "só texto" dos outros
  assert.deepEqual(
    alternarDia([{ dia: 2, hora: "09:00", imagem: false }], 4),
    [{ dia: 2, hora: "09:00", imagem: false }, { dia: 4, hora: "09:00", imagem: true }],
  );
});

test("alternarImagem inverte só o dia ligado; dia desligado fica igual", () => {
  const a = [{ dia: 2, hora: "09:00", imagem: true }, { dia: 4, hora: "14:30", imagem: true }];
  const b = alternarImagem(a, 4);
  assert.deepEqual(b, [{ dia: 2, hora: "09:00", imagem: true }, { dia: 4, hora: "14:30", imagem: false }]);
  assert.deepEqual(alternarImagem(b, 4), a);
  assert.deepEqual(alternarImagem(a, 5), a);
  assert.deepEqual(alternarImagem([], 1), []);
});

test("mudarHora, mesmoHorario, resumoAgenda e HORARIOS", () => {
  const a = [{ dia: 2, hora: "09:00", imagem: true }, { dia: 4, hora: "09:00", imagem: false }];
  const b = mudarHora(a, 4, "14:30");
  assert.deepEqual(b, [{ dia: 2, hora: "09:00", imagem: true }, { dia: 4, hora: "14:30", imagem: false }]);
  assert.deepEqual(mesmoHorario(b, "10:00"), [{ dia: 2, hora: "10:00", imagem: true }, { dia: 4, hora: "10:00", imagem: false }]);
  assert.equal(resumoAgenda(b), "Ter 09:00 · Qui 14:30 (só texto)");
  assert.equal(resumoAgenda(alternarImagem(b, 4)), "Ter 09:00 · Qui 14:30");
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
    palavras: ["seminovos brasília"], anteriores: ["Post antigo"], motivoReprovacao: null, contextoPosts: null,
  });
  assert.match(m.user, /Brazilian Car/);
  assert.match(m.user, /a melhor loja de Brasília/);
  assert.match(m.user, /Bairro ou região atendida/);
  assert.match(m.user, /seminovos brasília/);
  assert.match(m.user, /Post antigo/);
  assert.match(m.system, /telefone/i);
  assert.match(m.system, /entre 120 e 220 palavras/);
  assert.match(m.system, /sem markdown/);
  assert.doesNotMatch(m.system, /CFM/);
  const s = montarMensagensPost({
    nome: "Clínica", categoria: null, briefing, saude: true, tema: "servico", palavras: [], anteriores: [],
    motivoReprovacao: "contém telefone", contextoPosts: null,
  });
  assert.match(s.system, /CFM/);
  assert.match(s.system, /descontos/);
  assert.match(s.user, /contém telefone/);
});

test("montarMensagensPost sem contexto fica como era: sem bloco do contexto nem a regra dos guardrails", () => {
  const m = montarMensagensPost({
    nome: "Loja", categoria: null, briefing: BRIEFING_VAZIO, saude: false, tema: "servico", palavras: [], anteriores: [],
    motivoReprovacao: null, contextoPosts: null,
  });
  assert.doesNotMatch(m.user, /Contexto completo do cliente/);
  assert.doesNotMatch(m.system, /guardrails/);
  const vazio = montarMensagensPost({
    nome: "Loja", categoria: null, briefing: BRIEFING_VAZIO, saude: false, tema: "servico", palavras: [], anteriores: [],
    motivoReprovacao: null, contextoPosts: "   \n ",
  });
  assert.deepEqual(vazio, m);
});

test("montarMensagensPost com contexto: o contexto vem antes do briefing e o system manda seguir os guardrails", () => {
  const briefing = { ...BRIEFING_VAZIO, posicionamento: "loja de carros", cidade: "Brasília" };
  const m = montarMensagensPost({
    nome: "Brazilian Car", categoria: null, briefing, saude: false, tema: "servico", palavras: [], anteriores: [],
    motivoReprovacao: null, contextoPosts: "GUARDRAILS: nunca falar de leilão. Tom: direto e acolhedor.",
  });
  assert.match(m.user, /Contexto completo do cliente \(fonte principal; siga os guardrails dele\):\nGUARDRAILS: nunca falar de leilão/);
  assert.ok(m.user.indexOf("Contexto completo do cliente") < m.user.indexOf("Briefing:"));
  assert.ok(m.user.indexOf("Empresa: Brazilian Car") < m.user.indexOf("Contexto completo do cliente"));
  assert.match(
    m.system,
    /Siga à risca os guardrails, o tom de voz e o objetivo de SEO local do contexto do cliente; nunca contradiga o contexto\./,
  );
  const longo = montarMensagensPost({
    nome: "X", categoria: null, briefing, saude: false, tema: "servico", palavras: [], anteriores: [],
    motivoReprovacao: null, contextoPosts: "a".repeat(40000),
  });
  assert.ok(longo.user.includes("a".repeat(30000)));
  assert.ok(!longo.user.includes("a".repeat(30001)));
});

test("montarMensagensBriefing sem contexto e montarPromptImagem", () => {
  const b = montarMensagensBriefing({
    nome: "Brazilian Car", categoria: null, site: "https://brazilian.com.br", endereco: "SIA", nicho: "automotivo",
    briefingAtual: BRIEFING_VAZIO, textoDadosInternos: "Pergunta 1 - Resposta", contextoPosts: null,
  });
  assert.match(b.user, /Pergunta 1 - Resposta/);
  assert.match(b.user, /automotivo/);
  assert.doesNotMatch(b.user, /Contexto completo do cliente/);
  assert.doesNotMatch(b.system, /extra[ií]/i);
  const p = montarPromptImagem({
    nome: "Brazilian Car", categoria: "Loja de carros usados", briefing: BRIEFING_VAZIO, tema: "bastidores",
    contextoImagens: null, permitirPessoas: false, cantoLivre: null,
  });
  assert.match(p, /sem texto/i);
  assert.match(p, /Loja de carros usados/);
});

test("montarMensagensBriefing com contexto: extrai do texto, que vai no user (até 30.000 caracteres)", () => {
  const b = montarMensagensBriefing({
    nome: "Brazilian Car", categoria: null, site: null, endereco: null, nicho: null,
    briefingAtual: BRIEFING_VAZIO, textoDadosInternos: null,
    contextoPosts: "Identificação: loja de seminovos.\nDADOS PARA O SISTEMA\nPalavras-chave: seminovos brasília",
  });
  assert.match(b.user, /Identificação: loja de seminovos\./);
  assert.match(b.user, /DADOS PARA O SISTEMA/);
  assert.match(b.system, /extra/i);
  assert.match(b.system, /DADOS PARA O SISTEMA/);
  assert.match(b.system, /fonte da verdade/i);
  assert.match(b.system, /não invente/i);
  assert.match(b.system, /termos proibidos/i);
  const longo = montarMensagensBriefing({
    nome: "X", categoria: null, site: null, endereco: null, nicho: null, briefingAtual: BRIEFING_VAZIO,
    textoDadosInternos: null, contextoPosts: "b".repeat(35000),
  });
  assert.ok(longo.user.includes("b".repeat(30000)));
  assert.ok(!longo.user.includes("b".repeat(30001)));
});

test("montarPromptImagem sem pessoas (padrão): proíbe pessoas e traz as regras fixas", () => {
  const p = montarPromptImagem({
    nome: "Brazilian Car", categoria: "Loja de carros usados", briefing: BRIEFING_VAZIO, tema: "servico",
    contextoImagens: null, permitirPessoas: false, cantoLivre: null,
  });
  assert.match(p, /Sem pessoas: nenhum rosto, corpo, mão, silhueta ou reflexo de pessoa\./);
  assert.match(p, /sem texto, letras, números, preços ou slogans na arte/i);
  assert.match(p, /sem logos ou marcas de terceiros/i);
  assert.match(p, /sem placas de carro legíveis/i);
  assert.match(p, /aparência de fotografia real e profissional/i);
  assert.match(p, /formato paisagem/i);
  assert.doesNotMatch(p, /imagem de referência/);
  assert.doesNotMatch(p, /Diretrizes de imagem do cliente/);
});

test("montarPromptImagem com permitirPessoas não proíbe pessoas, mas mantém o resto", () => {
  const p = montarPromptImagem({
    nome: "Clínica", categoria: null, briefing: BRIEFING_VAZIO, tema: "bastidores",
    contextoImagens: null, permitirPessoas: true, cantoLivre: null,
  });
  assert.doesNotMatch(p, /Sem pessoas/);
  assert.match(p, /sem texto, letras, números, preços ou slogans na arte/i);
  assert.match(p, /sem placas de carro legíveis/i);
  assert.match(p, /formato paisagem/i);
});

test("montarPromptImagem com contexto das imagens: entra como diretrizes (até 8.000 caracteres), antes das regras fixas", () => {
  const p = montarPromptImagem({
    nome: "Loja", categoria: null, briefing: BRIEFING_VAZIO, tema: "servico",
    contextoImagens: "Fundo claro, carros prata, vitrine do SIA.", permitirPessoas: false, cantoLivre: null,
  });
  assert.match(p, /Diretrizes de imagem do cliente: Fundo claro, carros prata, vitrine do SIA\./);
  assert.ok(p.indexOf("Diretrizes de imagem do cliente") < p.indexOf("Sem pessoas"));
  const longo = montarPromptImagem({
    nome: "Loja", categoria: null, briefing: BRIEFING_VAZIO, tema: "servico",
    contextoImagens: "c".repeat(9000), permitirPessoas: false, cantoLivre: null,
  });
  assert.ok(longo.includes("c".repeat(8000)));
  assert.ok(!longo.includes("c".repeat(8001)));
  const vazio = montarPromptImagem({
    nome: "Loja", categoria: null, briefing: BRIEFING_VAZIO, tema: "servico",
    contextoImagens: "  ", permitirPessoas: false, cantoLivre: null,
  });
  assert.doesNotMatch(vazio, /Diretrizes de imagem do cliente/);
});

test("ESQUEMA_CHECAGEM_IMAGEM é estrito, com tem_pessoas e tem_texto obrigatórios", () => {
  assert.equal(ESQUEMA_CHECAGEM_IMAGEM.type, "object");
  assert.equal(ESQUEMA_CHECAGEM_IMAGEM.additionalProperties, false);
  assert.deepEqual([...ESQUEMA_CHECAGEM_IMAGEM.required].sort(), ["tem_pessoas", "tem_texto"]);
  assert.deepEqual(ESQUEMA_CHECAGEM_IMAGEM.properties, { tem_pessoas: { type: "boolean" }, tem_texto: { type: "boolean" } });
  assert.match(PROMPT_CHECAGEM_IMAGEM, /pessoa/i);
  assert.match(PROMPT_CHECAGEM_IMAGEM, /rosto/i);
  assert.match(PROMPT_CHECAGEM_IMAGEM, /m[aã]o/i);
  assert.match(PROMPT_CHECAGEM_IMAGEM, /silhueta/i);
  assert.match(PROMPT_CHECAGEM_IMAGEM, /texto/i);
  assert.match(PROMPT_CHECAGEM_IMAGEM, /n[uú]meros/i);
});

test("decidirImagem: sem imagem no dia nada; com pasta, Drive (sem cair para a IA); sem pasta, IA só se ligada", () => {
  assert.equal(decidirImagem({ comImagem: false, temPasta: true, usaIa: true }), null);
  assert.equal(decidirImagem({ comImagem: false, temPasta: false, usaIa: true }), null);
  assert.equal(decidirImagem({ comImagem: true, temPasta: true, usaIa: true }), "drive");
  assert.equal(decidirImagem({ comImagem: true, temPasta: true, usaIa: false }), "drive");
  assert.equal(decidirImagem({ comImagem: true, temPasta: false, usaIa: true }), "ia");
  assert.equal(decidirImagem({ comImagem: true, temPasta: false, usaIa: false }), null);
});

test("montarPromptImagem: com canto livre pede o canto limpo e nunca fala em desenhar a logo", () => {
  const base = { nome: "Loja", categoria: "Loja de carros", briefing: BRIEFING_VAZIO, tema: "servico" as const, contextoImagens: null, permitirPessoas: false };
  const com = montarPromptImagem({ ...base, cantoLivre: "inferior_direito" });
  assert.match(com, /Deixe o canto inferior direito da imagem limpo/);
  assert.match(com, /Sem texto, letras, números, preços ou slogans na arte\./);
  assert.doesNotMatch(com, /referência|aplique-a|exceto a própria logo/i);
  // A IA não fica sabendo da logo: o pedido do canto não a menciona (só "Sem logos ou marcas de terceiros" fala de logo).
  assert.doesNotMatch(com.replace("Sem logos ou marcas de terceiros.", ""), /logo/i);
  assert.doesNotMatch(com.match(/Deixe o canto[^.]*\./)?.[0] ?? "", /logo/i);
  const sem = montarPromptImagem({ ...base, cantoLivre: null });
  assert.doesNotMatch(sem, /Deixe o canto/);
  assert.match(sem, /Sem pessoas/);
});

test("montarPromptImagem: o canto livre segue a posição escolhida e as regras fixas valem com e sem logo", () => {
  const base = { nome: "Loja", categoria: null, briefing: BRIEFING_VAZIO, tema: "servico" as const, contextoImagens: null, permitirPessoas: false };
  const canto = (c: PosicaoLogo) => montarPromptImagem({ ...base, cantoLivre: c });
  assert.match(canto("superior_esquerdo"), /Deixe o canto superior esquerdo da imagem limpo, com fundo simples e sem nenhum objeto importante: esse espaço ficará reservado\./);
  assert.match(canto("superior_direito"), /Deixe o canto superior direito da imagem limpo/);
  assert.match(canto("inferior_esquerdo"), /Deixe o canto inferior esquerdo da imagem limpo/);
  for (const c of ["superior_esquerdo", "inferior_direito"] as const) {
    const p = canto(c);
    assert.match(p, /sem marcas d'água/i);
    assert.match(p, /sem logos ou marcas de terceiros/i);
    assert.match(p, /formato paisagem/i);
  }
  assert.match(montarPromptImagem({ ...base, cantoLivre: null }), /sem logos ou marcas de terceiros/i);
});

test("montarPromptImagem na nova tentativa diz o que a versão anterior tinha", () => {
  const base = { nome: "Loja", categoria: null, briefing: BRIEFING_VAZIO, tema: "servico" as const, contextoImagens: null, permitirPessoas: false, cantoLivre: null };
  assert.doesNotMatch(montarPromptImagem(base), /versão anterior/);
  assert.doesNotMatch(montarPromptImagem({ ...base, versaoAnterior: null }), /versão anterior/);
  assert.match(
    montarPromptImagem({ ...base, versaoAnterior: { tem_pessoas: true, tem_texto: false } }),
    /A versão anterior tinha pessoas; garanta que não haja nenhuma\./,
  );
  assert.match(
    montarPromptImagem({ ...base, versaoAnterior: { tem_pessoas: false, tem_texto: true } }),
    /A versão anterior tinha texto em destaque; garanta que não haja nenhum\./,
  );
  assert.match(
    montarPromptImagem({ ...base, versaoAnterior: { tem_pessoas: true, tem_texto: true } }),
    /A versão anterior tinha pessoas e texto em destaque; garanta que não haja nenhum\./,
  );
});

test("promptChecagemImagem: pessoas e texto em destaque, sem exceção de logo", () => {
  const p = promptChecagemImagem();
  assert.equal(PROMPT_CHECAGEM_IMAGEM, p);
  for (const re of [/pessoa/i, /rosto/i, /silhueta/i, /ao fundo/i, /leg[ií]vel e em destaque/i]) assert.match(p, re);
  assert.doesNotMatch(p, /segunda imagem|logo/i);
  for (const re of [/m[aã]o/i, /corpo/i, /reflexo/i, /frases/i, /pre[cç]os/i, /slogans/i, /letreiros/i, /placas de carro/i, /terceiros/i, /ilegíveis/i]) assert.match(p, re);
});

test("montarMensagensPost: com contexto a regra de não inventar vale para o contexto e o briefing; sem contexto fica como era", () => {
  const entrada = {
    nome: "Loja", categoria: null, briefing: BRIEFING_VAZIO, saude: false, tema: "servico" as const, palavras: [], anteriores: [],
    motivoReprovacao: null,
  };
  const com = montarMensagensPost({ ...entrada, contextoPosts: "Diferencial: revisão de 100 itens." });
  assert.match(com.system, /fatos que não estejam no contexto do cliente nem no briefing\./);
  assert.doesNotMatch(com.system, /fatos que não estejam no briefing\./);
  const sem = montarMensagensPost({ ...entrada, contextoPosts: null });
  assert.match(sem.system, /fatos que não estejam no briefing\./);
  assert.doesNotMatch(sem.system, /nem no briefing/);
});

test("decisaoChecagem: aceita limpo; repete uma vez se sobrar 45 s; senão desiste", () => {
  const limpo = { tem_pessoas: false, tem_texto: false };
  const pessoas = { tem_pessoas: true, tem_texto: false };
  const texto = { tem_pessoas: false, tem_texto: true };
  assert.equal(decisaoChecagem(1, limpo, 100_000, false), "aceitar");
  assert.equal(decisaoChecagem(2, limpo, 0, false), "aceitar");
  assert.equal(decisaoChecagem(2, limpo, -5, false), "aceitar");
  assert.equal(decisaoChecagem(1, pessoas, 100_000, false), "repetir");
  assert.equal(decisaoChecagem(1, texto, 100_000, false), "repetir");
  assert.equal(decisaoChecagem(1, { tem_pessoas: true, tem_texto: true }, 45_000, false), "repetir");
  assert.equal(decisaoChecagem(1, pessoas, 44_999, false), "desistir");
  assert.equal(decisaoChecagem(1, texto, 0, false), "desistir");
  assert.equal(decisaoChecagem(1, pessoas, -1, false), "desistir");
  assert.equal(decisaoChecagem(2, pessoas, 100_000, false), "desistir");
  assert.equal(decisaoChecagem(2, texto, 100_000, false), "desistir");
});

test("decisaoChecagem com pessoas permitidas: tem_pessoas é ignorado e só o texto em destaque reprova", () => {
  const pessoas = { tem_pessoas: true, tem_texto: false };
  const texto = { tem_pessoas: false, tem_texto: true };
  const ambos = { tem_pessoas: true, tem_texto: true };
  assert.equal(decisaoChecagem(1, pessoas, 100_000, true), "aceitar");
  assert.equal(decisaoChecagem(2, pessoas, 0, true), "aceitar");
  assert.equal(decisaoChecagem(1, { tem_pessoas: false, tem_texto: false }, 100_000, true), "aceitar");
  assert.equal(decisaoChecagem(1, texto, 100_000, true), "repetir");
  assert.equal(decisaoChecagem(1, ambos, 100_000, true), "repetir");
  assert.equal(decisaoChecagem(1, texto, 44_999, true), "desistir");
  assert.equal(decisaoChecagem(2, texto, 100_000, true), "desistir");
  assert.equal(decisaoChecagem(2, ambos, 100_000, true), "desistir");
});

test("base64ParaBytes decodifica como o Buffer (padding, quebras de linha e arquivo grande)", () => {
  assert.deepEqual([...base64ParaBytes("")], []);
  for (const n of [1, 2, 3, 4, 100, 1001]) {
    const orig = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
    assert.deepEqual([...base64ParaBytes(Buffer.from(orig).toString("base64"))], [...orig]);
  }
  assert.deepEqual([...base64ParaBytes("QU\r\nJD")], [65, 66, 67]); // o atob ignora quebras de linha
  const grande = Buffer.alloc(5 * 1024 * 1024, 200);
  const dec = base64ParaBytes(grande.toString("base64"));
  assert.equal(dec.length, grande.length);
  assert.equal(Buffer.compare(Buffer.from(dec), grande), 0);
  assert.throws(() => base64ParaBytes("***"));
});

test("tamanhoBase64 conta os bytes decodificados sem decodificar", () => {
  assert.equal(tamanhoBase64(""), 0);
  assert.equal(tamanhoBase64("QUJD"), 3);
  assert.equal(tamanhoBase64("QUI="), 2);
  assert.equal(tamanhoBase64("QQ=="), 1);
  assert.equal(tamanhoBase64("QUI"), 2); // sem padding
  assert.equal(tamanhoBase64("data:image/png;base64,QUJD"), 3);
  assert.equal(tamanhoBase64("QU\r\nJD QUJD"), 6); // quebras e espaços não contam
  assert.equal(tamanhoBase64(Buffer.alloc(5 * 1024 * 1024 + 1, 7).toString("base64")), 5 * 1024 * 1024 + 1);
  for (const n of [1, 2, 3, 10, 11, 12, 1000, 1001]) assert.equal(tamanhoBase64(Buffer.alloc(n, 9).toString("base64")), n);
});

test("opcoesDaLogo: valores válidos passam; o resto vira o padrão", () => {
  assert.deepEqual(opcoesDaLogo({}), { posicao: "inferior_direito", tamanho: "media", fundo: "nenhum" });
  assert.deepEqual(
    opcoesDaLogo({ logo_posicao: "superior_esquerdo", logo_tamanho: "grande", logo_fundo: "escuro" }),
    { posicao: "superior_esquerdo", tamanho: "grande", fundo: "escuro" },
  );
  assert.deepEqual(opcoesDaLogo({ logo_posicao: "meio", logo_tamanho: 3 }), { posicao: "inferior_direito", tamanho: "media", fundo: "nenhum" });
});

test("normalizarImagensSite: só itens completos, sem id repetido", () => {
  assert.deepEqual(normalizarImagensSite(null), []);
  assert.deepEqual(
    normalizarImagensSite([{ id: "a", url: "https://r2/a.jpg", origem_url: "https://s/a.jpg", descricao: "Pátio" }, { id: "a", url: "x" }, { url: "y" }, 3]),
    [{ id: "a", url: "https://r2/a.jpg", origem_url: "https://s/a.jpg", descricao: "Pátio" }],
  );
});
