// HTTP mínimo (node:http, sem framework). Um job por vez: o segundo recebe 409 e o
// n8n tenta de novo no minuto seguinte. As rotas /fireflies/* têm travas próprias (ver criarRotaFireflies).
import { createServer } from "node:http";
import { criarDrive as criarDriveReal, DriveIndisponivel } from "./drive.js";
import { comPastaTemp as comPastaTempReal } from "./tmp.js";
import { baixar as baixarReal } from "./jobs/download.js";
import { capturar as capturarReal } from "./jobs/lp.js";
import { publicarDownload as publicarDownloadReal, publicarLp as publicarLpReal } from "./publicar.js";
import { lerConfig } from "./config.js";
import { JobPausado, checarParada, paradaPedida, reiniciarParada, vigiarPausa as vigiarPausaReal } from "./parada.js";
import { criarRotinasFireflies, depsReais as depsFirefliesReais, interpretarWebhook, verificarAssinatura } from "./fireflies/servico.js";

const ROTAS_FIREFLIES = new Set(["/fireflies/agenda", "/fireflies/pendencias", "/fireflies/sincronizar", "/fireflies/importar", "/fireflies/webhook"]);
const log = (evento, dados = {}) => console.log(JSON.stringify({ evento, ...dados }));

async function lerJson(req) {
  const pedacos = [];
  for await (const p of req) pedacos.push(p);
  const corpo = JSON.parse(Buffer.concat(pedacos).toString("utf8") || "{}");
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) throw new Error("corpo não é objeto");
  return corpo;
}

export async function executarJob(corpo, deps = {}) {
  const criarDrive = deps.criarDrive || criarDriveReal;
  const comPastaTemp = deps.comPastaTemp || comPastaTempReal;
  const baixar = deps.baixar || baixarReal;
  const capturar = deps.capturar || capturarReal;
  const publicarDownload = deps.publicarDownload || publicarDownloadReal;
  const publicarLp = deps.publicarLp || publicarLpReal;
  const config = deps.config;
  const vigiarPausa = deps.vigiarPausa || vigiarPausaReal;

  const { tipo, payload, ultima_tentativa: ultima } = corpo;
  const { link, nome_arquivo: base, drive_folder_id: paiId, rede } = payload;
  const drive = criarDrive({ supabaseUrl: config.supabaseUrl, swipeKey: config.swipeKey });

  // Botão "Pausar" do app: marca o job como pausado no banco; a vigia percebe e derruba o que
  // estiver rodando. Um job por vez, então o estado de parada é zerado a cada job.
  reiniciarParada();
  const pararVigia = vigiarPausa({ jobId: corpo.id, supabaseUrl: config.supabaseUrl, anonKey: config.supabaseAnonKey });

  try {
    const resultado = await comPastaTemp(`job-${corpo.id}`, async (dir) => {
      if (tipo === "lp") {
        const { arquivos } = await capturar({ link, dir, base }, {});
        checarParada(); // pausado no fim da captura: não publica pela metade
        return publicarLp(drive, { arquivos, base, paiId });
      }
      const { arquivos, modo } = await baixar({ link, rede, dir, categoria: payload.categoria }, {});
      checarParada();
      return publicarDownload(drive, { arquivos, modo, base, paiId });
    });
    return { ok: true, resultado };
  } catch (e) {
    // Pausado pelo usuário: volta sem gastar tentativa e sem criar o Docs de falha. Qualquer erro
    // depois do pedido de parada é consequência dela (processo morto, navegador fechado).
    if (e instanceof JobPausado || paradaPedida()) return { ok: false, pausado: true, erro: "pausado pelo usuário" };
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
        .catch((docErr) => {
          // Drive fora do ar agora: melhor 503 e tentar tudo de novo depois do que gastar a
          // última tentativa e deixar o usuário sem o Docs com o link.
          if (docErr instanceof DriveIndisponivel) throw docErr;
          return null;
        });
    }
    return { ok: false, erro, docs };
  } finally {
    pararVigia();
  }
}

/**
 * Rotas /fireflies/* (crons e webhook pelo n8n, sempre com x-worker-key). Travas próprias, separadas da do
 * /job: uma sincronização do Fireflies nunca segura download do swipe; a agenda (robô que precisa entrar na
 * reunião na hora) e as pendências (renomear/excluir pedidos na aba, que o usuário espera ver em segundos) têm
 * as suas, para não esperar uma sincronização longa. Ocupado = 409 (o cron tenta de novo), menos no webhook,
 * que vai para a fila abaixo, e nas pendências, que ganham uma rodada extra assim que a atual terminar.
 */
function criarRotaFireflies({ config, rotinas, travas }) {
  // Webhook que chega com a trava ocupada entra nesta fila (sem repetir id) e é importado assim que ela soltar:
  // o "meeting.summarized" costuma chegar enquanto o "meeting.transcribed" ainda está importando, e perdê-lo
  // deixaria a reunião sem resumo (a sincronização não reimporta linha 'pronto'). Restart perde a fila; a
  // reunião que nem chegou a entrar no banco volta pela sincronização de hora em hora.
  const filaWebhook = new Set();
  // Pedido de pendências (a aba chama na hora pelo n8n) que chegou durante uma rodada: a rodada atual pode já ter
  // lido a lista antes do pedido novo, então roda mais uma vez logo depois (uma só, por mais pedidos que cheguem)
  let repetirPendencias = false;
  async function drenarFila() {
    while (filaWebhook.size && !travas.fireflies) {
      const [id] = filaWebhook;
      filaWebhook.delete(id);
      travas.fireflies = true;
      try {
        const x = await rotinas().importar(id);
        log("fireflies.importar", { id, ok: x.ok, erro: x.erro || null, origem: "webhook_fila" });
      } catch (e) {
        console.error(JSON.stringify({ evento: "fireflies.erro", rota: "/fireflies/webhook", id, erro: String(e?.message || e) }));
      } finally {
        travas.fireflies = false;
      }
    }
  }

  // Tarefas: { trava, evento, executar(), resumo(resultado) → dados do log (null = não loga) }
  function montar(caminho, corpo, r) {
    switch (caminho) {
      case "/fireflies/agenda":
        return {
          trava: "agenda",
          evento: "fireflies.agenda",
          executar: () => r.agenda(),
          resumo: (x) => (x.enviados?.length || x.falhas?.length ? { enviados: x.enviados, falhas: x.falhas } : null),
        };
      case "/fireflies/pendencias":
        return {
          trava: "pendencias",
          evento: "fireflies.pendencias",
          executar: () => r.pendencias(),
          resumo: (x) => (x.renomeados || x.excluidos || x.erros?.length ? { renomeados: x.renomeados, excluidos: x.excluidos, erros: x.erros } : null),
        };
      case "/fireflies/sincronizar":
        return {
          trava: "fireflies",
          evento: "fireflies.sincronizar",
          executar: () => r.sincronizar({ limite: corpo.limite, completo: corpo.completo === true }),
          resumo: (x) => ({ importados: x.importados, falhas: x.falhas?.length || 0, restantes: x.restantes, paginasLidas: x.paginasLidas, historicoCompleto: x.historicoCompleto }),
        };
      default: // /fireflies/importar
        return {
          trava: "fireflies",
          evento: "fireflies.importar",
          executar: () => r.importar(String(corpo.id)),
          resumo: (x) => ({ id: String(corpo.id), ok: x.ok, erro: x.erro || null, origem: "manual" }),
        };
    }
  }

  return async function rotaFireflies(caminho, req, responder) {
    if (req.headers["x-worker-key"] !== config.workerKey) return responder(401, { ok: false, erro: "chave inválida" });
    if (!config.firefliesApiKey || !config.supabaseAnonKey) return responder(503, { ok: false, erro: "Fireflies não configurado" });
    let corpo;
    try {
      corpo = await lerJson(req);
    } catch {
      return responder(400, { ok: false, erro: "corpo inválido" });
    }
    const r = rotinas();

    let tarefa;
    if (caminho === "/fireflies/webhook") {
      // O n8n repassa o corpo CRU (string) e o header X-Hub-Signature; qualquer reserialização quebra o HMAC
      if (!config.firefliesWebhookSecret) return responder(503, { ok: false, erro: "Segredo do webhook do Fireflies não configurado" });
      if (!verificarAssinatura(corpo.corpo, corpo.assinatura, config.firefliesWebhookSecret)) {
        log("fireflies.webhook_recusado", { motivo: "assinatura inválida" });
        return responder(401, { ok: false, erro: "assinatura inválida" });
      }
      let payload;
      try {
        payload = JSON.parse(corpo.corpo);
      } catch {
        return responder(400, { ok: false, erro: "corpo do webhook não é JSON" });
      }
      const w = interpretarWebhook(payload);
      if (w.ignorar) {
        log("fireflies.webhook_ignorado", { evento_webhook: w.evento, motivo: w.motivo });
        return responder(200, { ok: true, ignorado: true, evento: w.evento });
      }
      if (travas.fireflies) {
        filaWebhook.add(w.id);
        log("fireflies.webhook_na_fila", { id: w.id, evento_webhook: w.evento });
        return responder(202, { ok: true, enfileirado: true, id: w.id });
      }
      tarefa = {
        trava: "fireflies",
        evento: "fireflies.importar",
        // A importação que falha fica com status 'erro' na linha e volta na sincronização: o n8n recebe ok
        executar: async () => {
          const x = await r.importar(w.id);
          return { ok: true, id: w.id, importado: x.ok, erro: x.erro || null };
        },
        resumo: (x) => ({ id: w.id, ok: x.importado, erro: x.erro, origem: "webhook", evento_webhook: w.evento }),
      };
    } else {
      if (caminho === "/fireflies/importar" && !corpo.id) return responder(400, { ok: false, erro: "falta o id da reunião" });
      tarefa = montar(caminho, corpo, r);
    }

    // Checar e travar sem `await` no meio: duas requisições próximas não passam as duas
    if (travas[tarefa.trava]) {
      if (tarefa.trava !== "pendencias") return responder(409, { ok: false, erro: "ocupado" });
      repetirPendencias = true;
      return responder(202, { ok: true, agendado: true });
    }
    travas[tarefa.trava] = true;
    try {
      const resultado = await tarefa.executar();
      const dados = tarefa.resumo(resultado);
      if (dados) log(tarefa.evento, dados);
      responder(200, resultado);
    } catch (e) {
      const infra = e instanceof DriveIndisponivel;
      console.error(JSON.stringify({ evento: "fireflies.erro", rota: caminho, infra, erro: String(e?.message || e) }));
      responder(infra ? 503 : 500, { ok: false, erro: String(e?.message || e).slice(0, 500) });
    } finally {
      travas[tarefa.trava] = false;
      if (tarefa.trava === "fireflies" && filaWebhook.size) drenarFila();
      if (tarefa.trava === "pendencias" && repetirPendencias) rodadaExtra(tarefa);
    }
  };

  async function rodadaExtra(tarefa) {
    if (travas.pendencias) return;
    repetirPendencias = false;
    travas.pendencias = true;
    try {
      const dados = tarefa.resumo(await tarefa.executar());
      if (dados) log(tarefa.evento, { ...dados, origem: "rodada_extra" });
    } catch (e) {
      console.error(JSON.stringify({ evento: "fireflies.erro", rota: "/fireflies/pendencias", erro: String(e?.message || e) }));
    } finally {
      travas.pendencias = false;
      if (repetirPendencias) rodadaExtra(tarefa);
    }
  }
}

/** `fireflies`: rotinas { agenda, pendencias, sincronizar, importar } (testes); sem ela, as reais, criadas no 1º uso. */
export function criarServidor({ config, executarJob: executar = executarJob, fireflies = null }) {
  let ocupado = false;
  const travas = { fireflies: false, agenda: false, pendencias: false };
  let rotinas = fireflies;
  const rotaFireflies = criarRotaFireflies({
    config,
    travas,
    rotinas: () => (rotinas ||= criarRotinasFireflies(depsFirefliesReais(config))),
  });

  return createServer(async (req, res) => {
    const responder = (status, corpo) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(corpo));
    };

    if (req.url === "/health") return responder(200, { ok: true, busy: ocupado, versao: config.versao });
    const caminho = String(req.url || "").split("?")[0];
    if (ROTAS_FIREFLIES.has(caminho) && req.method === "POST") return rotaFireflies(caminho, req, responder);
    if (req.url !== "/job" || req.method !== "POST") return responder(404, { ok: false, erro: "rota desconhecida" });
    if (req.headers["x-worker-key"] !== config.workerKey) return responder(401, { ok: false, erro: "chave inválida" });
    if (ocupado) return responder(409, { ok: false, erro: "ocupado" });
    // Trava antes de ler o corpo: a leitura é assíncrona, e checar aqui mas só travar depois
    // deixaria duas requisições próximas passarem as duas pela checagem. A liberação acontece
    // só no `finally`: soltar `ocupado` por relógio deixaria um segundo job entrar com o
    // primeiro ainda rodando, e os dois disputariam a mesma pasta temporária e o mesmo disco.
    // Quem limita o tempo são os timeouts de cada comando (a captura de LP tem orçamento de
    // 12 min, o download 13).
    ocupado = true;
    try {
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

      console.log(JSON.stringify({ evento: "job.inicio", id: corpo.id, tipo: corpo.tipo, link: corpo.payload.link }));
      const r = await executar(corpo, { config });
      console.log(JSON.stringify({ evento: "job.fim", id: corpo.id, ok: r.ok, erro: r.erro || null }));
      responder(200, r);
    } catch (e) {
      const infra = e instanceof DriveIndisponivel;
      console.error(JSON.stringify({ evento: "job.erro", infra, erro: String(e?.message || e) }));
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
