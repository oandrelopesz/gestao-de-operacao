// HTTP mínimo (node:http, sem framework). Um job por vez: o segundo recebe 409 e o
// n8n tenta de novo no minuto seguinte.
import { createServer } from "node:http";
import { criarDrive as criarDriveReal, DriveIndisponivel } from "./drive.js";
import { comPastaTemp as comPastaTempReal } from "./tmp.js";
import { baixar as baixarReal } from "./jobs/download.js";
import { capturar as capturarReal } from "./jobs/lp.js";
import { publicarDownload as publicarDownloadReal, publicarLp as publicarLpReal } from "./publicar.js";
import { lerConfig } from "./config.js";

export async function executarJob(corpo, deps = {}) {
  const criarDrive = deps.criarDrive || criarDriveReal;
  const comPastaTemp = deps.comPastaTemp || comPastaTempReal;
  const baixar = deps.baixar || baixarReal;
  const capturar = deps.capturar || capturarReal;
  const publicarDownload = deps.publicarDownload || publicarDownloadReal;
  const publicarLp = deps.publicarLp || publicarLpReal;
  const config = deps.config;

  const { tipo, payload, ultima_tentativa: ultima } = corpo;
  const { link, nome_arquivo: base, drive_folder_id: paiId, rede } = payload;
  const drive = criarDrive({ supabaseUrl: config.supabaseUrl, swipeKey: config.swipeKey });

  try {
    const resultado = await comPastaTemp(`job-${corpo.id}`, async (dir) => {
      if (tipo === "lp") {
        const { arquivos } = await capturar({ link, dir, base }, {});
        return publicarLp(drive, { arquivos, base, paiId });
      }
      const { arquivos, modo } = await baixar({ link, rede, dir }, {});
      return publicarDownload(drive, { arquivos, modo, base, paiId });
    });
    return { ok: true, resultado };
  } catch (e) {
    if (e instanceof DriveIndisponivel) throw e; // 503: não conta tentativa
    const erro = String(e?.message || e).slice(0, 500);
    let docs = null;
    if (ultima) {
      const texto = [
        `Link: ${link}`,
        "",
        `Não foi possível baixar automaticamente em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`,
        `Motivo: ${erro}`,
        "",
        "Baixe manualmente e use o botão \"Enviar arquivo\" no card do swipe file.",
      ].join("\n");
      docs = await drive.criarDoc(paiId, base, texto)
        .then((d) => ({ drive_file_id: d.id, drive_web_link: d.webViewLink || null }))
        .catch(() => null);
    }
    return { ok: false, erro, docs };
  }
}

export function criarServidor({ config, executarJob: executar = executarJob }) {
  let ocupado = false;

  return createServer(async (req, res) => {
    const responder = (status, corpo) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(corpo));
    };

    if (req.url === "/health") return responder(200, { ok: true, busy: ocupado, versao: config.versao });
    if (req.url !== "/job" || req.method !== "POST") return responder(404, { ok: false, erro: "rota desconhecida" });
    if (req.headers["x-worker-key"] !== config.workerKey) return responder(401, { ok: false, erro: "chave inválida" });
    if (ocupado) return responder(409, { ok: false, erro: "ocupado" });

    let corpo;
    try {
      const pedacos = [];
      for await (const p of req) pedacos.push(p);
      corpo = JSON.parse(Buffer.concat(pedacos).toString("utf8") || "{}");
    } catch {
      return responder(400, { ok: false, erro: "corpo inválido" });
    }
    if (!corpo?.payload?.link || !corpo?.payload?.drive_folder_id) {
      return responder(400, { ok: false, erro: "payload precisa de link e drive_folder_id" });
    }

    // Um job por vez. A liberação acontece só no `finally`: soltar `ocupado` por relógio
    // deixaria um segundo job entrar com o primeiro ainda rodando, e os dois disputariam
    // a mesma pasta temporária e o mesmo disco. Quem limita o tempo são os timeouts de cada
    // comando (a captura de LP tem orçamento de 12 min, o download 13).
    ocupado = true;
    try {
      console.log(JSON.stringify({ evento: "job.inicio", id: corpo.id, tipo: corpo.tipo, link: corpo.payload.link }));
      const r = await executar(corpo, { config });
      console.log(JSON.stringify({ evento: "job.fim", id: corpo.id, ok: r.ok, erro: r.erro || null }));
      responder(200, r);
    } catch (e) {
      const infra = e instanceof DriveIndisponivel;
      console.error(JSON.stringify({ evento: "job.erro", id: corpo.id, infra, erro: String(e?.message || e) }));
      responder(infra ? 503 : 500, { ok: false, erro: String(e?.message || e).slice(0, 500) });
    } finally {
      ocupado = false;
    }
  });
}

// Boot: só quando chamado direto (`node src/server.js`), não nos testes.
if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  const config = lerConfig();
  criarServidor({ config }).listen(config.porta, () => {
    console.log(JSON.stringify({ evento: "worker.pronto", porta: config.porta, versao: config.versao }));
  });
}
