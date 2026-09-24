import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ErroTranscricao, processar } from "../src/transcritor/processar.js";
import { rodarUma } from "../src/transcritor/main.js";
import { JobPausado, pedirParada, reiniciarParada } from "../src/parada.js";

const SILENCIOS = "[silencedetect] silence_start: 299\n[silencedetect] silence_end: 301 | silence_duration: 2\n";

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

test("link: baixa com yt-dlp, corta no silêncio perto de 5 min, transcreve em trechos com contexto e glossário", async () => {
  await comPasta(async (pasta) => {
    const c = cenario();
    const r = await processar(
      { id: "t1", origem: "link", link: "https://www.instagram.com/reel/x", plataforma: "instagram" },
      { banco: c.banco, config: config(pasta), glossario: ["ROAS", "CTR"], rodar: c.rodar, fetch: c.fetchFake, abrirBlob, existe: () => false },
    );
    assert.equal(r.duracao, 700);
    assert.equal(r.idioma, "pt");
    assert.equal(c.formularios.length, 3, "700 s viram 3 trechos (cortes em 300 e 600)");
    assert.equal(c.formularios[0].get("language"), null, "o 1º trecho detecta o idioma sozinho");
    assert.equal(c.formularios[1].get("language"), "pt", "os seguintes fixam o idioma detectado");
    assert.match(c.formularios[0].get("prompt"), /ROAS, CTR/);
    assert.match(c.formularios[1].get("prompt"), /Trecho/, "o 2º trecho recebe o final do 1º como contexto");
    assert.equal(c.formularios[0].get("hotwords"), "ROAS CTR");
    assert.equal(c.formularios[0].get("response_format"), "verbose_json");
    const corte = c.chamadas.find((x) => x.cmd === "ffmpeg" && x.args.includes("-ss") && x.args.includes("-to"));
    assert.deepEqual([corte.args[corte.args.indexOf("-ss") + 1], corte.args[corte.args.indexOf("-to") + 1]], ["0", "300"]);
    assert.ok(c.atualizacoes.some((a) => a.campos.status === "transcrevendo" && a.campos.duracao_seg === 700));
    assert.ok(c.atualizacoes.some((a) => a.campos.progresso > 0.4 && a.campos.progresso < 0.5));
    // Cada trecho falso tem 4 s de fala e ~296 s de silêncio: pausa longa depois de fim de frase abre parágrafo
    assert.equal(r.texto, "Trecho 1.\n\nTrecho 2.\n\nTrecho 3.");
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
