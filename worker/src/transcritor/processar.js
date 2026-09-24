// Uma transcrição: mídia (link baixado ou arquivo enviado) → áudio leve → trechos cortados em
// silêncios → Speaches (faster-whisper) trecho a trecho → texto com parágrafos.
import { chmod, copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { openAsBlob } from "node:fs";
import { join } from "node:path";
import { rodar as rodarPadrao } from "../exec.js";
import { JobPausado, checarParada, registrar } from "../parada.js";
import { cookiesDe } from "../jobs/download.js";
import { glossarioParaPrompt, montarTexto } from "./texto.js";
import { TRECHO_ALVO_S, deslocarSegmentos, escolherCortes, lerSilencios, promptComContexto, trechos } from "./cortes.js";
import { caminhoUpload } from "./uploads.js";
import { postarLongo } from "./http.js";

/** Erro com mensagem para mostrar na aba (não adianta tentar de novo). */
export class ErroTranscricao extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroTranscricao";
  }
}

const YT_DLP = "/usr/local/bin/yt-dlp";
const TIMEOUT_TRECHO_MS = 45 * 60 * 1000;

const primeiraLinha = (s) => String(s || "").split(/\r?\n/).map((l) => l.replace(/^ERROR:\s*/, "").trim()).find(Boolean)?.slice(0, 160) || "erro desconhecido";

async function baixarLink(t, dir, { rodar, existe }) {
  const plataforma = t.plataforma || "outro";
  const original = cookiesDe(plataforma, existe);
  let cookies = null;
  if (original) {
    // yt-dlp regrava o cookies.txt e o config do Swarm é só leitura: usa uma cópia
    const copia = join(dir, ".cookies.txt");
    cookies = await copyFile(original, copia).then(() => chmod(copia, 0o600)).then(() => copia).catch(() => original);
  }
  const args = ["-f", "bestaudio/best", "--no-playlist", "--no-warnings", "--retries", "3", "--socket-timeout", "30", "-o", join(dir, "origem.%(ext)s")];
  if (cookies) args.push("--cookies", cookies);
  args.push(t.link);
  try {
    await rodar(YT_DLP, args, { cwd: dir, timeout: 60 * 60 * 1000 });
  } catch (e) {
    if (e instanceof JobPausado) throw e;
    const msg = `${e.stderr || ""}\n${e.message || ""}`;
    if (plataforma === "youtube" || /Sign in to confirm/i.test(msg)) {
      throw new ErroTranscricao("O YouTube bloqueia downloads pelo servidor. Baixe o vídeo e envie como arquivo.");
    }
    if (/private|login required|log in|not available|rate-limit|requested content is not available/i.test(msg)) {
      throw new ErroTranscricao("A plataforma pediu login ou o post é privado/indisponível. Baixe e envie como arquivo.");
    }
    if (/Unsupported URL/i.test(msg)) throw new ErroTranscricao("Esse link não é de vídeo/áudio que dê para baixar. Envie o arquivo.");
    // Post apagado ou fora do ar: o Instagram responde 400 na extração, os outros costumam dar 404
    if (/HTTP Error (400|404)|Video info extraction failed|content isn.t available|page not found/i.test(msg)) {
      throw new ErroTranscricao("Esse post não está disponível (pode ter sido apagado ou ser privado). Confira o link.");
    }
    throw new ErroTranscricao(`Não consegui baixar esse link (${primeiraLinha(e.stderr || e.message)})`);
  }
  const achados = (await readdir(dir)).filter((n) => n.startsWith("origem.") && !n.endsWith(".part"));
  if (!achados.length) throw new ErroTranscricao("O link não tem vídeo nem áudio para transcrever");
  return join(dir, achados[0]);
}

async function duracaoDe(arquivo, rodar) {
  const { stdout } = await rodar("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", arquivo], { timeout: 2 * 60 * 1000 });
  return Number.parseFloat(String(stdout).trim());
}

// Sem `hotwords`: junto com o prompt, faz o Whisper entrar em laço e, sozinho, tira a pontuação
// (testado na VPS em 24/09/2026). O glossário vai só no prompt.
async function transcreverTrecho({ arquivo, idioma, prompt }, { config, fetch: _fetch, abrirBlob }) {
  const form = new FormData();
  form.set("file", await abrirBlob(arquivo, { type: "audio/ogg" }), "audio.ogg");
  form.set("model", config.modelo);
  form.set("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.set("temperature", "0");
  if (idioma) form.set("language", idioma);
  if (prompt) form.set("prompt", prompt);
  const ac = new AbortController();
  let pausado = false;
  const soltar = registrar(() => { pausado = true; ac.abort(); });
  const limite = setTimeout(() => ac.abort(), TIMEOUT_TRECHO_MS);
  try {
    const r = await _fetch(`${config.speachesUrl}/v1/audio/transcriptions`, { method: "POST", body: form, signal: ac.signal });
    const corpo = await r.text();
    if (!r.ok) throw new Error(`Speaches ${r.status}: ${corpo.slice(0, 200)}`);
    return JSON.parse(corpo);
  } catch (e) {
    if (pausado) throw new JobPausado();
    if (ac.signal.aborted) throw new Error("A transcrição de um trecho passou de 45 minutos");
    throw e;
  } finally {
    clearTimeout(limite);
    soltar();
  }
}

/** Código de idioma curto ("pt", "en") para fixar nos próximos trechos; nome completo não serve. */
const codigoIdioma = (l) => (typeof l === "string" && /^[a-z]{2,3}$/.test(l) ? l : null);

/**
 * Transcreve `t` (linha de `transcricoes` já reservada, status "baixando").
 * Devolve `{ texto, idioma, duracao }`. Lança ErroTranscricao (mensagem para o usuário),
 * JobPausado (pausa/cancelamento) ou outro erro (tenta de novo).
 */
export async function processar(t, deps) {
  const { banco, config, glossario = [], rodar = rodarPadrao, fetch: _fetch = postarLongo, abrirBlob = openAsBlob, existe } = deps;
  const dir = join(config.pasta, "jobs", t.id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  try {
    const entrada = t.origem === "link" ? await baixarLink(t, dir, { rodar, existe }) : caminhoUpload(config.pasta, t.id);
    checarParada();

    const audio = join(dir, "audio.ogg");
    try {
      await rodar("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-i", entrada, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "32k", audio], { timeout: 2 * 60 * 60 * 1000 });
    } catch (e) {
      if (e instanceof JobPausado) throw e;
      const semAudio = /does not contain any stream|matches no streams|Output file .* does not contain/i.test(e.stderr || "");
      throw new ErroTranscricao(semAudio ? "Esse arquivo não tem áudio" : "Não consegui ler esse arquivo de áudio/vídeo");
    }
    const duracao = await duracaoDe(audio, rodar);
    if (!(duracao > 0)) throw new ErroTranscricao("Não consegui ler a duração do áudio");
    await banco.atualizar(t.id, { status: "transcrevendo", progresso: 0, duracao_seg: duracao }, ["baixando"]);
    checarParada();

    let cortes = [];
    if (duracao > TRECHO_ALVO_S * 1.1) {
      const { stderr } = await rodar("ffmpeg", ["-hide_banner", "-nostdin", "-i", audio, "-af", "silencedetect=noise=-35dB:d=0.4", "-f", "null", "-"], { timeout: 60 * 60 * 1000 });
      cortes = escolherCortes(lerSilencios(stderr), duracao);
    }
    const partes = trechos(cortes, duracao);

    const promptGlossario = glossarioParaPrompt(glossario);
    const segmentos = [];
    let idioma = null;
    let codigo = null;
    let textoAnterior = "";
    for (let i = 0; i < partes.length; i++) {
      checarParada();
      const p = partes[i];
      let arquivo = audio;
      if (partes.length > 1) {
        arquivo = join(dir, `trecho-${i}.ogg`);
        await rodar("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-ss", String(p.inicio), "-to", String(p.fim), "-i", audio, "-c", "copy", arquivo], { timeout: 10 * 60 * 1000 });
      }
      const r = await transcreverTrecho(
        { arquivo, idioma: codigo, prompt: promptComContexto(promptGlossario, textoAnterior) },
        { config, fetch: _fetch, abrirBlob },
      );
      idioma = idioma || r.language || null;
      codigo = codigo || codigoIdioma(r.language);
      const segs = Array.isArray(r.segments) && r.segments.length ? r.segments : [{ start: 0, end: p.fim - p.inicio, text: r.text || "" }];
      segmentos.push(...deslocarSegmentos(segs, p.inicio));
      textoAnterior = r.text || segs.map((s) => s.text).join(" ");
      await banco.atualizar(t.id, { progresso: Math.min(0.99, p.fim / duracao) }, ["transcrevendo"]);
      if (arquivo !== audio) await rm(arquivo, { force: true });
    }

    const texto = montarTexto(segmentos);
    if (!texto) throw new ErroTranscricao("Não encontrei fala nesse áudio");
    checarParada();
    return { texto, idioma, duracao };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
