// Orquestrador do Transcritor: recebe arquivos (HTTP) e processa a fila `transcricoes`, uma por vez.
// Roda como serviço separado (mesma imagem do worker do swipe): node src/transcritor/main.js
import http from "node:http";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { lerConfigTranscritor } from "./config.js";
import { criarBanco } from "./banco.js";
import { criarVerificador } from "./auth.js";
import { aplicarCors, caminhoUpload, criarRotasUpload } from "./uploads.js";
import { ErroTranscricao, processar } from "./processar.js";
import { JobPausado, reiniciarParada, vigiarPausa } from "../parada.js";
import { postarLongo } from "./http.js";

export const MAX_TENTATIVAS = 2;
const EM_ANDAMENTO = ["baixando", "transcrevendo"];
const log = (evento, dados = {}) => console.log(JSON.stringify({ evento, ...dados }));

/** Processa a próxima da fila. Devolve false quando não há nada para fazer. */
export async function rodarUma({ banco, config, processarFn = processar, vigiar = vigiarPausa, removerUpload }) {
  const t = await banco.proxima();
  if (!t) return false;
  const reservada = await banco.atualizar(
    t.id,
    { status: "baixando", iniciado_em: new Date().toISOString(), tentativas: (t.tentativas || 0) + 1, erro: null, progresso: 0 },
    ["aguardando"],
  );
  if (!reservada) return true; // mudou no meio (pausada/cancelada): pega a próxima
  const apagarUpload = removerUpload || ((id) => rm(caminhoUpload(config.pasta, id), { force: true }));
  reiniciarParada();
  const pararVigia = vigiar({ jobId: t.id, tabela: "transcricoes", statusDeParada: ["pausada"], supabaseUrl: config.supabaseUrl, anonKey: config.anonKey });
  log("transcricao.inicio", { id: t.id, origem: t.origem, tentativa: reservada.tentativas });
  try {
    const glossario = await banco.glossario().catch(() => []);
    const r = await processarFn(reservada, { banco, config, glossario });
    await banco.atualizar(t.id, { status: "pronta", texto: r.texto, idioma: r.idioma, duracao_seg: r.duracao, progresso: 1, erro: null }, EM_ANDAMENTO);
    await apagarUpload(t.id);
    log("transcricao.pronta", { id: t.id, duracao: r.duracao, caracteres: r.texto.length });
  } catch (e) {
    if (e instanceof JobPausado) {
      // Pausada: mantém o arquivo enviado para retomar. Cancelada (linha apagada): apaga tudo.
      const atual = await banco.linha(t.id).catch(() => null);
      if (!atual) await apagarUpload(t.id);
      log(atual ? "transcricao.pausada" : "transcricao.cancelada", { id: t.id });
      return true;
    }
    const definitivo = e instanceof ErroTranscricao || reservada.tentativas >= MAX_TENTATIVAS;
    const mensagem = e instanceof ErroTranscricao ? e.message : `Erro ao transcrever: ${String(e?.message || e).slice(0, 200)}`;
    await banco.atualizar(t.id, definitivo ? { status: "falhou", erro: mensagem, progresso: 0 } : { status: "aguardando", erro: mensagem, progresso: 0 }, EM_ANDAMENTO);
    if (definitivo) await apagarUpload(t.id);
    log("transcricao.erro", { id: t.id, definitivo, erro: mensagem });
  } finally {
    pararVigia();
    reiniciarParada();
  }
  return true;
}

/** Apaga do disco o que não tem mais linha no banco e o que passou de 24 h. */
export async function faxina({ banco, config, emUso = () => null, agora = Date.now() }) {
  const ids = await banco.idsExistentes();
  for (const sub of ["uploads", "jobs"]) {
    const dir = join(config.pasta, sub);
    let itens = [];
    try { itens = await readdir(dir); } catch { continue; }
    for (const nome of itens) {
      const id = nome.replace(/\.bin$/, "");
      if (id === emUso()) continue;
      const caminho = join(dir, nome);
      const velho = await stat(caminho).then((s) => agora - s.mtimeMs > 24 * 60 * 60 * 1000).catch(() => false);
      if (!ids.has(id) || velho) {
        await rm(caminho, { recursive: true, force: true }).catch(() => {});
        log("faxina.apagado", { caminho });
      }
    }
  }
}

async function main() {
  const config = lerConfigTranscritor();
  const banco = criarBanco(config);
  const verificar = criarVerificador({ clientId: config.googleClientId, emailsPermitidos: config.emailsPermitidos });
  await mkdir(join(config.pasta, "uploads"), { recursive: true });
  await mkdir(join(config.pasta, "jobs"), { recursive: true });
  await banco.devolverInterrompidas().then((l) => log("fila.devolvidas", { qtd: l?.length ?? 0 })).catch((e) => log("fila.devolver_erro", { erro: String(e.message) }));

  let ocupado = false;
  let atual = null;
  // O Speaches só baixa o modelo quando pedido (idempotente): a fila espera ele ficar pronto
  let modeloPronto = false;
  const garantirModelo = async () => {
    try {
      const r = await postarLongo(`${config.speachesUrl}/v1/models/${encodeURIComponent(config.modelo)}`, {});
      if (r.ok || r.status === 409) {
        modeloPronto = true;
        log("modelo.pronto", { modelo: config.modelo });
        return;
      }
      log("modelo.aguardando", { status: r.status, corpo: (await r.text()).slice(0, 200) });
    } catch (e) {
      log("modelo.aguardando", { erro: String(e?.message || e) });
    }
    setTimeout(garantirModelo, 30000);
  };
  garantirModelo();
  const rotas = criarRotasUpload({ pasta: config.pasta, banco, verificar, origens: config.origens });
  http
    .createServer(async (req, res) => {
      try {
        if (await rotas(req, res)) return;
        aplicarCors(req, res, config.origens);
        if (req.url === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, modelo: modeloPronto ? "pronto" : "baixando", groq: Boolean(config.groqKey), ocupado, atual, versao: config.versao }));
          return;
        }
        res.writeHead(404);
        res.end();
      } catch (e) {
        log("http.erro", { erro: String(e?.message || e) });
        if (!res.headersSent) res.writeHead(500);
        res.end();
      }
    })
    .listen(config.porta, () => log("servidor.ouvindo", { porta: config.porta, versao: config.versao }));

  const laco = async () => {
    if (ocupado || !modeloPronto) return;
    ocupado = true;
    try {
      // Continua enquanto houver fila; `atual` só serve para o /health e a faxina
      for (;;) {
        const proxima = await banco.proxima();
        if (!proxima) break;
        atual = proxima.id;
        await rodarUma({ banco, config });
      }
    } catch (e) {
      log("fila.erro", { erro: String(e?.message || e) });
    } finally {
      atual = null;
      ocupado = false;
    }
  };
  setInterval(laco, 3000);
  laco();
  const limpar = () => faxina({ banco, config, emUso: () => atual }).catch((e) => log("faxina.erro", { erro: String(e.message) }));
  setInterval(limpar, 30 * 60 * 1000);
  limpar();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
