import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ErroTranscricao, processar } from "../src/transcritor/processar.js";
import { faxina, rodarUma } from "../src/transcritor/main.js";
import { textoDeMarcas } from "../src/transcritor/termos.js";
import { caminhoAudio } from "../src/transcritor/audio.js";
import { JobPausado, pedirParada, reiniciarParada } from "../src/parada.js";

const SILENCIOS = "[silencedetect] silence_start: 178\n[silencedetect] silence_end: 180 | silence_duration: 2\n";

function cenario({ duracao = 700, respostas, falhaYtDlp } = {}) {
  const chamadas = [];
  const rodar = async (cmd, args) => {
    chamadas.push({ cmd, args });
    if (cmd.endsWith("yt-dlp")) {
      if (falhaYtDlp) { const e = new Error("falhou"); e.stderr = falhaYtDlp; throw e; }
      const saida = args[args.indexOf("-o") + 1].replace("%(ext)s", "m4a");
      await writeFile(saida, "x");
      return { stdout: "", stderr: "" };
    }
    if (cmd === "ffprobe") return { stdout: `${duracao}\n`, stderr: "" };
    if (cmd === "ffmpeg" && args.includes("silencedetect=noise=-35dB:d=0.4")) return { stdout: "", stderr: SILENCIOS };
    if (cmd === "ffmpeg") { await writeFile(args.at(-1), "audio"); return { stdout: "", stderr: "" }; }
    throw new Error(`comando inesperado ${cmd}`);
  };
  const formularios = [];
  let n = 0;
  const fetchFake = async (url, init) => {
    assert.match(url, /\/v1\/audio\/transcriptions$/);
    formularios.push(init.body);
    const r = respostas ? respostas(n++) : { language: "pt", text: `Trecho ${n}.`, segments: [{ start: 0, end: 4, text: `Trecho ${++n}.` }] };
    return { ok: true, text: async () => JSON.stringify(r) };
  };
  const atualizacoes = [];
  const banco = { atualizar: async (id, campos, so) => { atualizacoes.push({ campos, so }); return { id, ...campos }; } };
  return { chamadas, rodar, fetchFake, formularios, atualizacoes, banco };
}

async function comPasta(fn) {
  const pasta = await mkdtemp(join(tmpdir(), "trp-"));
  try { return await fn(pasta); } finally { await rm(pasta, { recursive: true, force: true }); }
}

const config = (pasta) => ({ pasta, speachesUrl: "http://speaches:8000", modelo: "turbo" });
const abrirBlob = async () => new Blob(["audio"]);

test("link: baixa com yt-dlp, corta no silêncio perto de 3 min, transcreve em trechos com contexto e glossário", async () => {
  await comPasta(async (pasta) => {
    const c = cenario();
    const r = await processar(
      { id: "t1", origem: "link", link: "https://www.instagram.com/reel/x", plataforma: "instagram" },
      { banco: c.banco, config: config(pasta), glossario: ["ROAS", "CTR"], rodar: c.rodar, fetch: c.fetchFake, abrirBlob, existe: () => false },
    );
    assert.equal(r.duracao, 700);
    assert.equal(r.idioma, "pt");
    assert.equal(c.formularios.length, 4, "700 s viram 4 trechos (corte no silêncio de 179 s, depois em 360 e 540)");
    assert.equal(c.formularios[0].get("language"), null, "o 1º trecho detecta o idioma sozinho");
    assert.equal(c.formularios[1].get("language"), "pt", "os seguintes fixam o idioma detectado");
    assert.match(c.formularios[0].get("prompt"), /ROAS, CTR/);
    assert.match(c.formularios[1].get("prompt"), /Trecho/, "o 2º trecho recebe o final do 1º como contexto");
    // hotwords + prompt fazem o Whisper entrar em laço (testado na VPS, 24/09/2026): só o prompt vai
    assert.equal(c.formularios[0].get("hotwords"), null);
    assert.equal(c.formularios[0].get("response_format"), "verbose_json");
    const corte = c.chamadas.find((x) => x.cmd === "ffmpeg" && x.args.includes("-ss") && x.args.includes("-to"));
    assert.deepEqual([corte.args[corte.args.indexOf("-ss") + 1], corte.args[corte.args.indexOf("-to") + 1]], ["0", "179"]);
    assert.ok(c.atualizacoes.some((a) => a.campos.status === "transcrevendo" && a.campos.duracao_seg === 700));
    assert.ok(c.atualizacoes.some((a) => a.campos.progresso > 0.5 && a.campos.progresso < 0.6));
    // Cada trecho falso tem 4 s de fala e ~296 s de silêncio: pausa longa depois de fim de frase abre parágrafo
    assert.equal(r.texto, "Trecho 1.\n\nTrecho 2.\n\nTrecho 3.\n\nTrecho 4.");
    assert.deepEqual(await readdir(join(pasta, "jobs")), [], "a pasta temporária é apagada");
  });
});

test("arquivo curto: usa o upload, um trecho só, sem procurar silêncios", async () => {
  await comPasta(async (pasta) => {
    const c = cenario({ duracao: 90 });
    const r = await processar({ id: "t2", origem: "arquivo" }, { banco: c.banco, config: config(pasta), rodar: c.rodar, fetch: c.fetchFake, abrirBlob });
    assert.equal(c.formularios.length, 1);
    assert.ok(!c.chamadas.some((x) => x.cmd.endsWith("yt-dlp")));
    assert.ok(!c.chamadas.some((x) => x.args.includes("silencedetect=noise=-35dB:d=0.4")));
    const conv = c.chamadas.find((x) => x.cmd === "ffmpeg");
    assert.equal(conv.args[conv.args.indexOf("-i") + 1], join(pasta, "uploads", "t2.bin"));
    assert.ok(r.texto.length > 0);
  });
});

test("YouTube bloqueado vira mensagem clara (ErroTranscricao)", async () => {
  await comPasta(async (pasta) => {
    const c = cenario({ falhaYtDlp: "ERROR: Sign in to confirm you're not a bot" });
    await assert.rejects(
      () => processar({ id: "t3", origem: "link", link: "https://youtu.be/x", plataforma: "youtube" }, { banco: c.banco, config: config(pasta), rodar: c.rodar, fetch: c.fetchFake, abrirBlob, existe: () => false }),
      (e) => e instanceof ErroTranscricao && /envie como arquivo/.test(e.message),
    );
  });
});

test("post apagado do Instagram (400 na extração) vira mensagem clara", async () => {
  await comPasta(async (pasta) => {
    const c = cenario({ falhaYtDlp: "ERROR: [Instagram] C_x: Video info extraction failed: HTTP Error 400: Bad Request" });
    await assert.rejects(
      () => processar({ id: "t4", origem: "link", link: "https://www.instagram.com/reel/C_x/", plataforma: "instagram" }, { banco: c.banco, config: config(pasta), rodar: c.rodar, fetch: c.fetchFake, abrirBlob, existe: () => false }),
      (e) => e instanceof ErroTranscricao && /não está disponível/.test(e.message),
    );
  });
});

test("sem fala nenhuma vira ErroTranscricao", async () => {
  await comPasta(async (pasta) => {
    const c = cenario({ duracao: 30, respostas: () => ({ language: "pt", text: "", segments: [] }) });
    await assert.rejects(() => processar({ id: "t4", origem: "arquivo" }, { banco: c.banco, config: config(pasta), rodar: c.rodar, fetch: c.fetchFake, abrirBlob }), /Não encontrei fala/);
  });
});

// ---------------------------------------------------------------- fila (rodarUma)

function bancoFila({ linha = { id: "t9", origem: "arquivo", status: "aguardando", tentativas: 0 }, linhaDepois = "igual" } = {}) {
  const atualizacoes = [];
  let entregue = false;
  return {
    atualizacoes,
    proxima: async () => (entregue ? null : ((entregue = true), linha)),
    atualizar: async (id, campos, so) => { atualizacoes.push({ campos, so }); return { ...linha, ...campos }; },
    linha: async () => (linhaDepois === "igual" ? linha : linhaDepois),
    glossario: async () => ["CTR"],
    termos: async () => [],
    registrados: [],
    registrarTermos: async function (itens) { this.registrados.push(...itens); },
  };
}
const semVigia = () => () => {};

test("rodarUma: reserva, processa e grava 'pronta' com o texto; apaga o upload", async () => {
  const banco = bancoFila();
  const removidos = [];
  const r = await rodarUma({
    banco, config: { pasta: "/x" }, vigiar: semVigia, removerUpload: async (id) => removidos.push(id),
    processarFn: async (t, deps) => { assert.deepEqual(deps.glossario, ["CTR"]); return { texto: "Olá.", idioma: "pt", duracao: 12 }; },
  });
  assert.equal(r, true);
  assert.equal(banco.atualizacoes[0].campos.status, "baixando");
  assert.deepEqual(banco.atualizacoes[0].so, ["aguardando"]);
  const fim = banco.atualizacoes.at(-1);
  assert.equal(fim.campos.status, "pronta");
  assert.equal(fim.campos.texto, "Olá.");
  assert.deepEqual(removidos, ["t9"]);
});

test("rodarUma: fila vazia devolve false", async () => {
  assert.equal(await rodarUma({ banco: { proxima: async () => null }, config: {}, vigiar: semVigia }), false);
});

test("rodarUma: ErroTranscricao falha de vez com a mensagem", async () => {
  const banco = bancoFila();
  await rodarUma({ banco, config: { pasta: "/x" }, vigiar: semVigia, removerUpload: async () => {}, processarFn: async () => { throw new ErroTranscricao("Esse arquivo não tem áudio"); } });
  assert.deepEqual(banco.atualizacoes.at(-1).campos, { status: "falhou", erro: "Esse arquivo não tem áudio", progresso: 0 });
});

test("rodarUma: erro inesperado na 1ª tentativa volta para a fila; na 2ª falha", async () => {
  let banco = bancoFila();
  await rodarUma({ banco, config: { pasta: "/x" }, vigiar: semVigia, removerUpload: async () => {}, processarFn: async () => { throw new Error("Speaches 500"); } });
  assert.equal(banco.atualizacoes.at(-1).campos.status, "aguardando");
  banco = bancoFila({ linha: { id: "t9", origem: "arquivo", status: "aguardando", tentativas: 1 } });
  await rodarUma({ banco, config: { pasta: "/x" }, vigiar: semVigia, removerUpload: async () => {}, processarFn: async () => { throw new Error("Speaches 500"); } });
  assert.equal(banco.atualizacoes.at(-1).campos.status, "falhou");
});

test("rodarUma: pausada no meio não grava nada e mantém o upload; cancelada apaga o upload", async () => {
  let banco = bancoFila({ linhaDepois: { id: "t9", status: "pausada" } });
  const removidos = [];
  await rodarUma({ banco, config: { pasta: "/x" }, vigiar: semVigia, removerUpload: async (id) => removidos.push(id), processarFn: async () => { throw new JobPausado(); } });
  assert.equal(banco.atualizacoes.length, 1, "só a reserva");
  assert.deepEqual(removidos, []);
  banco = bancoFila({ linhaDepois: null });
  await rodarUma({ banco, config: { pasta: "/x" }, vigiar: semVigia, removerUpload: async (id) => removidos.push(id), processarFn: async () => { throw new JobPausado(); } });
  assert.deepEqual(removidos, ["t9"]);
});

test("pedido de parada no meio do processamento vira JobPausado", async () => {
  await comPasta(async (pasta) => {
    reiniciarParada();
    const c = cenario({ duracao: 700 });
    const fetchLento = async (url, init) => {
      pedirParada();
      return c.fetchFake(url, init);
    };
    await assert.rejects(
      () => processar({ id: "t5", origem: "arquivo" }, { banco: c.banco, config: config(pasta), rodar: c.rodar, fetch: fetchLento, abrirBlob }),
      (e) => e instanceof JobPausado,
    );
    reiniciarParada();
  });
});

const configGroq = (pasta) => ({ ...config(pasta), groqKey: "gsk_teste", groqUrl: "https://api.groq.com/openai", groqModelo: "whisper-large-v3-turbo" });

test("com a chave do Groq: o trecho vai ao Groq com a chave e o modelo dele (a VPS fica parada)", async () => {
  await comPasta(async (pasta) => {
    const c = cenario({ duracao: 90 });
    const pedidos = [];
    const fetchGroq = async (url, init) => { pedidos.push({ url, init }); return c.fetchFake(url, init); };
    await processar({ id: "g1", origem: "arquivo" }, { banco: c.banco, config: configGroq(pasta), rodar: c.rodar, fetch: fetchGroq, abrirBlob });
    assert.equal(pedidos.length, 1);
    assert.equal(pedidos[0].url, "https://api.groq.com/openai/v1/audio/transcriptions");
    assert.equal(pedidos[0].init.headers.Authorization, "Bearer gsk_teste");
    assert.equal(c.formularios[0].get("model"), "whisper-large-v3-turbo");
  });
});

test("Groq falhou (limite 429): o mesmo trecho vai ao Whisper da VPS, sem perder a transcrição", async () => {
  await comPasta(async (pasta) => {
    const c = cenario({ duracao: 90 });
    const urls = [];
    const fetchLimite = async (url, init) => {
      urls.push(url);
      if (url.includes("groq")) return { ok: false, status: 429, text: async () => '{"error":{"message":"Rate limit reached"}}' };
      return c.fetchFake(url, init);
    };
    const r = await processar({ id: "g2", origem: "arquivo" }, { banco: c.banco, config: configGroq(pasta), rodar: c.rodar, fetch: fetchLimite, abrirBlob });
    assert.deepEqual(urls, ["https://api.groq.com/openai/v1/audio/transcriptions", "http://speaches:8000/v1/audio/transcriptions"]);
    assert.equal(c.formularios.at(-1).get("model"), "turbo", "na VPS vale o modelo da VPS");
    assert.match(r.texto, /Trecho/);
  });
});

test("idioma por extenso (como o Groq devolve) vira código e fixa os próximos trechos", async () => {
  await comPasta(async (pasta) => {
    const c = cenario({ duracao: 700, respostas: (n) => ({ language: "Portuguese", text: `Parte ${n}.`, segments: [{ start: 0, end: 4, text: `Parte ${n}.` }] }) });
    const r = await processar({ id: "g3", origem: "arquivo" }, { banco: c.banco, config: configGroq(pasta), rodar: c.rodar, fetch: c.fetchFake, abrirBlob });
    assert.equal(r.idioma, "pt");
    assert.equal(c.formularios[1].get("language"), "pt");
  });
});

// ---------------------------------------------------------------- termos, marcas e áudio

const unico = (words, text = "Rói da campanha. Cê tê erre subiu.") => () => ({ language: "pt", text, words, segments: [{ start: 0, end: 6, text }] });
const PALAVRAS = [["Rói", 0, 1], ["da", 1, 1.5], ["campanha.", 1.5, 2.5], ["Cê", 3, 3.3], ["tê", 3.3, 3.6], ["erre", 3.6, 4], ["subiu.", 4, 5]]
  .map(([word, start, end]) => ({ word, start, end }));

test("palavras viram marcas com tempo e o texto é igual a textoDeMarcas", async () => {
  await comPasta(async (pasta) => {
    const c = cenario({ duracao: 90, respostas: unico(PALAVRAS) });
    const r = await processar({ id: "m1", origem: "arquivo" }, { banco: c.banco, config: config(pasta), rodar: c.rodar, fetch: c.fetchFake, abrirBlob });
    assert.equal(r.texto, textoDeMarcas(r.marcas));
    assert.equal(r.texto, "Rói da campanha. Cê tê erre subiu.");
    assert.deepEqual(r.marcas.p[0][0], ["Rói", 0, 1]);
    assert.deepEqual(r.marcas.p[0][3], ["Cê", 3, 3.3]);
    assert.deepEqual(r.correcoes, []);
    assert.match(String(c.formularios[0].getAll("timestamp_granularities[]")), /segment,word/);
  });
});

test("correção manual da memória é aplicada e o 'para' vai ao prompt antes do glossário", async () => {
  await comPasta(async (pasta) => {
    const c = cenario({ duracao: 90, respostas: unico(PALAVRAS) });
    const memoria = [{ de: "cê tê erre", para: "CTR", origem: "manual", vezes: 3 }, { de: "rói", para: "ROI", origem: "ia", vezes: 9 }];
    const r = await processar({ id: "m2", origem: "arquivo" }, { banco: c.banco, config: config(pasta), glossario: ["ROAS"], memoria, rodar: c.rodar, fetch: c.fetchFake, abrirBlob });
    assert.equal(r.texto, "Rói da campanha. CTR subiu.", "a da IA não é aplicada sozinha, só a manual");
    assert.match(c.formularios[0].get("prompt"), /Termos: CTR, ROAS./);
    assert.deepEqual(r.marcas.p[0].at(-2), ["CTR", 3, 4]);
  });
});

test("gera o áudio m4a em audios/<id>.m4a (aac 48k, faststart)", async () => {
  await comPasta(async (pasta) => {
    const c = cenario({ duracao: 90 });
    await processar({ id: "a1", origem: "arquivo" }, { banco: c.banco, config: config(pasta), rodar: c.rodar, fetch: c.fetchFake, abrirBlob });
    assert.deepEqual(await readdir(join(pasta, "audios")), ["a1.m4a"]);
    assert.equal(await readFile(caminhoAudio(pasta, "a1"), "utf8"), "audio");
    const cmd = c.chamadas.find((x) => x.args.includes("aac"));
    assert.ok(cmd.args.includes("48k") && cmd.args.includes("+faststart"));
  });
});

test("falha do ffmpeg do áudio só loga: a transcrição sai igual", async () => {
  await comPasta(async (pasta) => {
    const c = cenario({ duracao: 90 });
    const rodar = async (cmd, args, o) => { if (args.includes("aac")) throw new Error("sem codec"); return c.rodar(cmd, args, o); };
    const r = await processar({ id: "a2", origem: "arquivo" }, { banco: c.banco, config: config(pasta), rodar, fetch: c.fetchFake, abrirBlob });
    assert.ok(r.texto.length > 0);
    await assert.rejects(() => readdir(join(pasta, "audios")));
  });
});

test("com a chave do Groq a revisão por IA troca o termo e devolve as correções", async () => {
  await comPasta(async (pasta) => {
    const c = cenario({ duracao: 90, respostas: unico(PALAVRAS) });
    const pedidos = [];
    const fetchRevisao = async (url, init) => {
      pedidos.push({ url, corpo: JSON.parse(init.body) });
      return { ok: true, status: 429 === 0, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ correcoes: [{ de: "Rói", para: "ROI" }] }) } }] }) };
    };
    const r = await processar({ id: "r1", origem: "arquivo" }, { banco: c.banco, config: { ...configGroq(pasta), groqModeloRevisao: "modelo-x" }, rodar: c.rodar, fetch: c.fetchFake, fetchRevisao, abrirBlob });
    assert.equal(pedidos.length, 1);
    assert.equal(pedidos[0].corpo.model, "modelo-x");
    assert.equal(r.texto, "ROI da campanha. Cê tê erre subiu.");
    assert.deepEqual(r.correcoes, [{ de: "Rói", para: "ROI" }]);
  });
});

test("rodarUma: grava marcas e registra as correções da IA; falha no registro não derruba", async () => {
  const banco = bancoFila();
  banco.registrarTermos = async () => { throw new Error("rpc fora"); };
  const marcas = { v: 1, p: [[["Olá.", 0, 1]]] };
  await rodarUma({ banco, config: { pasta: "/x" }, vigiar: semVigia, removerUpload: async () => {}, processarFn: async () => ({ texto: "Olá.", idioma: "pt", duracao: 1, marcas, correcoes: [{ de: "rói", para: "ROI" }] }) });
  const fim = banco.atualizacoes.at(-1);
  assert.equal(fim.campos.status, "pronta");
  assert.deepEqual(fim.campos.marcas, marcas);
  const banco2 = bancoFila();
  await rodarUma({ banco: banco2, config: { pasta: "/x" }, vigiar: semVigia, removerUpload: async () => {}, processarFn: async () => ({ texto: "Olá.", idioma: "pt", duracao: 1, marcas, correcoes: [{ de: "rói", para: "ROI" }] }) });
  assert.deepEqual(banco2.registrados, [{ de: "rói", para: "ROI", origem: "ia" }]);
});

test("rodarUma: linha cancelada no meio ou gravação sem linha apaga o áudio", async () => {
  const apagados = [];
  const removerAudio = async (id) => apagados.push(id);
  let banco = bancoFila({ linhaDepois: null });
  await rodarUma({ banco, config: { pasta: "/x" }, vigiar: semVigia, removerUpload: async () => {}, removerAudio, processarFn: async () => { throw new JobPausado(); } });
  assert.deepEqual(apagados, ["t9"]);
  banco = bancoFila();
  banco.atualizar = async (id, campos) => (campos.status === "baixando" ? { id, tentativas: 1 } : null);
  await rodarUma({ banco, config: { pasta: "/x" }, vigiar: semVigia, removerUpload: async () => {}, removerAudio, processarFn: async () => ({ texto: "Olá.", idioma: "pt", duracao: 1, marcas: { v: 1, p: [] }, correcoes: [] }) });
  assert.deepEqual(apagados, ["t9", "t9"]);
});

test("faxina: apaga áudio de id inexistente e mantém o de linha existente", async () => {
  await comPasta(async (pasta) => {
    await mkdir(join(pasta, "audios"), { recursive: true });
    await writeFile(join(pasta, "audios", "vivo.m4a"), "x");
    await writeFile(join(pasta, "audios", "orfao.m4a"), "x");
    await faxina({ banco: { idsExistentes: async () => new Set(["vivo"]) }, config: { pasta } });
    assert.deepEqual(await readdir(join(pasta, "audios")), ["vivo.m4a"]);
  });
});
