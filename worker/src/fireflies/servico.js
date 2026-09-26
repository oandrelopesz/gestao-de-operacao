// Fireflies no worker: importa reuniões (4 arquivos no bucket `fireflies` + linha em `fireflies_reunioes`),
// sincroniza o histórico, aplica os pedidos de renomear/excluir feitos na aba e manda o robô às reuniões com
// Meet da agenda da contato@ (a agenda dela não pode ser conectada no Fireflies, que aceita só a do cadastro).
// Tudo recebe `deps` ({ fireflies, banco, documentos, tokenGoogle, fetch, estado, log }): os testes usam falsos.
// Cota do plano Pro: 500 chamadas/dia na API do Fireflies — cada `listar`/`buscar`/mutação conta 1.
import { createHmac, timingSafeEqual } from "node:crypto";
import { criarFireflies, ErroFireflies, naoEncontrada } from "./api.js";
import { PREFIXO_TEMPORARIO, chaveConvite, criarBanco } from "./supabase.js";
import * as documentosReais from "./documentos.js";
import { duracaoMin, inicioDa, linkFireflies, participantesDa, tituloDa } from "./documentos.js";
import { tokenGoogle } from "../drive.js";

export const POR_PAGINA = 50; // máximo do `transcripts(limit)`
const MAX_PAGINAS = 200; // trava contra laço infinito (10 mil reuniões)
export const LIMITE_PADRAO = 40;
export const MAX_ROBOS_POR_VEZ = 3; // addToLiveMeeting: 3 a cada 20 min
export const MAX_EXCLUSOES_POR_VEZ = 8; // deleteTranscript: 10 por minuto (o cron roda a cada minuto)
export const MAX_RENOMEACOES_POR_VEZ = 10; // cada uma = renomear + buscar + 4 arquivos
const ANTES_MS = 5 * 60_000; // o robô entra em reunião que começou há até 5 min...
const DEPOIS_MS = 2 * 60_000; // ...ou que começa em até 2 min
const FOLGA_MIN = 10; // o robô fica até 10 min além do fim marcado (reunião que atrasa)
const AGENDA = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const ARQUIVOS = [
  { chave: "transcricao_pdf", nome: "transcricao.pdf", tipo: "application/pdf" },
  { chave: "transcricao_docx", nome: "transcricao.docx", tipo: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { chave: "resumo_pdf", nome: "resumo.pdf", tipo: "application/pdf" },
  { chave: "resumo_docx", nome: "resumo.docx", tipo: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
];

const logPadrao = (evento, dados = {}) => console.log(JSON.stringify({ evento, ...dados }));
const mensagem = (e, max = 300) => String(e?.message || e).slice(0, max);

/** Caminhos no bucket: { transcricao_pdf: "<id>/transcricao.pdf", ... } */
export function caminhosDa(id) {
  return Object.fromEntries(ARQUIVOS.map((a) => [a.chave, `${id}/${a.nome}`]));
}

/** Colunas de `fireflies_reunioes` que vêm do Fireflies (sem status/arquivos). */
export function linhaDaReuniao(reuniao) {
  const inicio = inicioDa(reuniao);
  return {
    id: reuniao.id,
    titulo: tituloDa(reuniao),
    data_hora: inicio ? inicio.toISOString() : null,
    duracao_min: duracaoMin(reuniao),
    participantes: participantesDa(reuniao),
    organizador: reuniao.organizer_email || null,
    link_meet: reuniao.meeting_link || null,
    link_fireflies: linkFireflies(reuniao.id),
  };
}

/** Gera os 4 arquivos e sobe no bucket (substituindo os antigos). Devolve o JSON da coluna `arquivos`. */
async function gerarESubir(reuniao, { banco, documentos = documentosReais }) {
  const conteudo = {
    transcricao_pdf: await documentos.gerarPdf(documentos.htmlTranscricao(reuniao)),
    resumo_pdf: await documentos.gerarPdf(documentos.htmlResumo(reuniao)),
    transcricao_docx: await documentos.gerarDocx(reuniao, "transcricao"),
    resumo_docx: await documentos.gerarDocx(reuniao, "resumo"),
  };
  const caminhos = caminhosDa(reuniao.id);
  for (const a of ARQUIVOS) await banco.subirArquivo(caminhos[a.chave], conteudo[a.chave], a.tipo);
  return caminhos;
}

/**
 * Importa (ou importa de novo) uma reunião: 1 chamada ao Fireflies. A linha aparece como "importando" já de
 * saída; `titulo` é obrigatório na tabela, então uma linha nova nasce com o nome da lista (`dica.titulo`, no
 * sincronizar) ou um provisório, trocado pelo de verdade assim que a transcrição chega.
 * Nunca lança: devolve { ok: true, id, titulo } ou { ok: false, id, erro } (e a linha fica com status 'erro').
 */
export async function importarReuniao(id, deps, dica = {}) {
  const { fireflies, banco } = deps;
  const documentos = deps.documentos || documentosReais;
  try {
    const existia = await banco.atualizar(id, { status: "importando", erro: null });
    if (!existia) {
      await banco.upsertReuniao({ id, titulo: dica.titulo || "Reunião do Fireflies", status: "importando", erro: null, link_fireflies: linkFireflies(id) });
    }
    const reuniao = { ...(await fireflies.buscar(id)), id };
    const linha = linhaDaReuniao(reuniao);
    await banco.upsertReuniao({ ...linha, status: "importando" });
    const arquivos = await gerarESubir(reuniao, { banco, documentos });
    await banco.upsertReuniao({ ...linha, arquivos, status: "pronto", erro: null });
    return { ok: true, id, titulo: linha.titulo };
  } catch (e) {
    const erro = mensagem(e);
    await banco.atualizar(id, { status: "erro", erro }).catch(() => {});
    return { ok: false, id, erro };
  }
}

/**
 * Importa as reuniões do Fireflies que ainda não estão prontas no banco, as mais recentes primeiro, até `limite`.
 * Economia de cota: enquanto `estado.historicoCompleto` for false (começa assim a cada restart), lê todas as
 * páginas; quando uma varredura completa não acha nenhuma reunião ausente do banco, passa a ler só a 1ª página
 * (as 50 mais recentes). `completo: true` força a varredura completa. Reunião com importação que falhou (ou
 * ficou pela metade num restart) entra de novo, mas não impede o histórico de ser considerado completo.
 */
export async function sincronizar({ limite = LIMITE_PADRAO, completo = false } = {}, deps) {
  const { fireflies, banco } = deps;
  const estado = deps.estado || { historicoCompleto: false };
  const log = deps.log || logPadrao;
  const n = limite == null || limite === "" ? NaN : Number(limite);
  const maximo = Number.isFinite(n) && n >= 0 ? Math.floor(n) : LIMITE_PADRAO;
  const varrerTudo = completo === true || !estado.historicoCompleto;

  const vistas = new Map();
  let paginasLidas = 0;
  let chegouAoFim = false;
  while (paginasLidas < MAX_PAGINAS) {
    const pagina = await fireflies.listar({ limit: POR_PAGINA, skip: paginasLidas * POR_PAGINA });
    paginasLidas++;
    for (const t of pagina) if (t?.id && !vistas.has(t.id)) vistas.set(t.id, t);
    if (pagina.length < POR_PAGINA) {
      chegouAoFim = true;
      break;
    }
    if (!varrerTudo) break;
  }

  const noBanco = await banco.reunioesIds();
  const lidas = [...vistas.values()];
  const ausentes = lidas.filter((t) => !noBanco.has(t.id));
  const repetir = lidas.filter((t) => noBanco.has(t.id) && noBanco.get(t.id) !== "pronto");
  const fila = [...ausentes, ...repetir].sort((a, b) => (Number(b.date) || 0) - (Number(a.date) || 0));
  const lote = fila.slice(0, maximo);

  let importados = 0;
  const falhas = [];
  for (const t of lote) {
    const r = await importarReuniao(t.id, deps, { titulo: t.title });
    log("fireflies.importar", { id: t.id, ok: r.ok, erro: r.erro || null });
    if (r.ok) importados++;
    else falhas.push({ id: t.id, erro: r.erro });
  }

  if (varrerTudo && chegouAoFim && ausentes.length === 0) estado.historicoCompleto = true;
  // Só a 1ª página e ela inteira fora do banco: pode haver mais atrás dela, então volta a varrer tudo
  if (!varrerTudo && ausentes.length >= POR_PAGINA) estado.historicoCompleto = false;

  return { ok: true, importados, falhas, restantes: fila.length - lote.length, paginasLidas, historicoCompleto: !!estado.historicoCompleto };
}

/** Erro que não adianta repetir a cada minuto (o Fireflies recusou de vez): desiste do pedido e mostra o erro. */
const definitivo = (e) => e instanceof ErroFireflies && !e.temporario;

/**
 * Aplica no Fireflies o que a aba pediu. Excluir: apaga no Fireflies (se já não existe lá, segue), os arquivos
 * e a linha. Renomear: renomeia no Fireflies, grava o título e gera os 4 arquivos de novo com o nome novo.
 * Erro numa linha não para as outras. Erro temporário (rede, limite de chamadas) deixa o pedido para o próximo
 * minuto; recusa definitiva do Fireflies desfaz o pedido e grava o motivo em `erro` (senão o cron de 1 min
 * gastaria a cota diária tentando de novo).
 */
export async function aplicarPendencias(deps) {
  const { fireflies, banco } = deps;
  const documentos = deps.documentos || documentosReais;
  let renomeados = 0;
  let excluidos = 0;
  let exclusoes = 0;
  let renomeacoes = 0;
  const erros = [];

  for (const linha of await banco.pendencias()) {
    const id = linha.id;
    if (linha.excluir) {
      if (exclusoes >= MAX_EXCLUSOES_POR_VEZ) continue;
      exclusoes++;
      try {
        try {
          await fireflies.excluir(id);
        } catch (e) {
          if (!naoEncontrada(e)) throw e; // já não existe no Fireflies: só falta limpar aqui
        }
        const caminhos = new Set([...Object.values(caminhosDa(id)), ...Object.values(linha.arquivos || {}).filter((c) => typeof c === "string" && c)]);
        await banco.apagarArquivos([...caminhos]);
        await banco.apagarLinha(id);
        excluidos++;
      } catch (e) {
        erros.push({ id, acao: "excluir", erro: mensagem(e) });
        if (definitivo(e)) await banco.atualizar(id, { excluir: false, erro: `Não foi possível excluir no Fireflies: ${mensagem(e, 250)}` }).catch(() => {});
      }
      continue;
    }

    const novo = String(linha.titulo_pendente || "").trim();
    try {
      if (!novo) {
        await banco.atualizar(id, { titulo_pendente: null });
        continue;
      }
      if (renomeacoes >= MAX_RENOMEACOES_POR_VEZ) continue;
      renomeacoes++;
      await fireflies.renomear(id, novo);
      await banco.atualizar(id, { titulo: novo, titulo_pendente: null, erro: null });
      renomeados++;
    } catch (e) {
      erros.push({ id, acao: "renomear", erro: mensagem(e) });
      if (definitivo(e)) await banco.atualizar(id, { titulo_pendente: null, erro: `Não foi possível renomear no Fireflies: ${mensagem(e, 250)}` }).catch(() => {});
      continue;
    }
    try {
      // Busca de novo para o conteúdo sair atual; o título é o que acabou de ser aplicado
      const reuniao = { ...(await fireflies.buscar(id)), id, title: novo };
      const arquivos = await gerarESubir(reuniao, { banco, documentos });
      await banco.atualizar(id, { arquivos });
    } catch (e) {
      erros.push({ id, acao: "arquivos", erro: mensagem(e) });
      await banco.atualizar(id, { erro: `Renomeada, mas os arquivos não foram gerados de novo: ${mensagem(e, 200)}` }).catch(() => {});
    }
  }
  return { ok: true, renomeados, excluidos, erros };
}

// ---------------------------------------------------------------- Robô nas reuniões da agenda

/** Link do Google Meet do evento: `hangoutLink` ou o ponto de entrada de vídeo do `conferenceData`. */
export function linkDoMeet(evento) {
  const ehMeet = (u) => typeof u === "string" && /^https:\/\/meet\.google\.com\//i.test(u);
  if (ehMeet(evento?.hangoutLink)) return evento.hangoutLink;
  // O Google chama o campo de `entryPointType`; `type` fica por garantia
  const video = (evento?.conferenceData?.entryPoints || []).find((p) => (p?.entryPointType || p?.type) === "video" && ehMeet(p?.uri));
  return video?.uri || null;
}

/**
 * Quais eventos da agenda recebem o robô agora: começam entre `agora` − 5 min e `agora` + 2 min (a consulta
 * do Google filtra pelo FIM, então uma reunião longa já em andamento também vem e é descartada aqui), têm link
 * do Meet, não foram cancelados nem recusados por mim, não são de dia inteiro e não estão em `jaEnviados`
 * (Set de `chaveConvite`). O mesmo link aparece uma vez só. → [{ evento_id, inicio, link_meet, titulo }]
 */
export function eventosParaRobo(eventos, agora, jaEnviados = new Set()) {
  const t = agora.getTime();
  const escolhidos = [];
  const links = new Set();
  for (const ev of eventos || []) {
    if (!ev?.id || ev.status === "cancelled") continue;
    const inicioTexto = ev.start?.dateTime; // dia inteiro só tem start.date
    if (!inicioTexto) continue;
    const inicio = new Date(inicioTexto).getTime();
    if (Number.isNaN(inicio) || inicio < t - ANTES_MS || inicio > t + DEPOIS_MS) continue;
    const eu = (ev.attendees || []).find((a) => a?.self);
    if (eu?.responseStatus === "declined") continue;
    const link = linkDoMeet(ev);
    if (!link) continue;
    if (jaEnviados.has(chaveConvite(ev.id, inicioTexto))) continue;
    const mesmoLink = link.split("?")[0].replace(/\/+$/, "").toLowerCase();
    if (links.has(mesmoLink)) continue;
    links.add(mesmoLink);
    const fim = new Date(ev.end?.dateTime || "").getTime();
    const duracao = fim > inicio ? Math.round((fim - inicio) / 60_000) + FOLGA_MIN : null;
    escolhidos.push({ evento_id: ev.id, inicio: new Date(inicio).toISOString(), link_meet: link, titulo: String(ev.summary || "").trim() || "Reunião", duracao });
  }
  return escolhidos;
}

/**
 * Cron de 1 min: manda o robô do Fireflies (addToLiveMeeting) às reuniões com Meet da agenda `primary` da
 * contato@ que estão começando. No máximo 3 por vez (limite do Fireflies: 3 a cada 20 min). Cada envio fica em
 * `fireflies_convites`; só a falha passageira (rede, limite) é tentada de novo no minuto seguinte.
 */
export async function enviarRoboAgenda({ agora = new Date() } = {}, deps) {
  const { fireflies, banco } = deps;
  const _fetch = deps.fetch || fetch;
  const token = await deps.tokenGoogle();
  const params = new URLSearchParams({
    timeMin: new Date(agora.getTime() - ANTES_MS).toISOString(),
    timeMax: new Date(agora.getTime() + DEPOIS_MS).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  const r = await _fetch(`${AGENDA}?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) deps.esquecerTokenGoogle?.();
    throw new Error(`Google Agenda respondeu ${r.status}${corpo?.error?.message ? `: ${corpo.error.message}` : ""}`);
  }
  const eventos = Array.isArray(corpo.items) ? corpo.items : [];

  const candidatos = eventosParaRobo(eventos, agora);
  const jaEnviados = candidatos.length ? await banco.convitesJaEnviados(candidatos) : new Set();
  const novos = eventosParaRobo(eventos, agora, jaEnviados).slice(0, MAX_ROBOS_POR_VEZ);

  const enviados = [];
  const falhas = [];
  for (const { duracao, ...c } of novos) {
    let ok = true;
    let erro = null;
    try {
      const resposta = await fireflies.adicionarAoVivo({ link: c.link_meet, titulo: c.titulo, duracao });
      if (!resposta?.success) {
        ok = false;
        erro = "O Fireflies não confirmou a entrada do robô (success = false)";
      }
    } catch (e) {
      ok = false;
      // Rede ou limite de chamadas: tenta de novo no minuto seguinte, enquanto a reunião estiver na janela
      erro = (e?.temporario ? PREFIXO_TEMPORARIO : "") + mensagem(e);
    }
    await banco.registrarConvite({ ...c, ok, erro });
    if (ok) enviados.push(c.titulo);
    else falhas.push({ titulo: c.titulo, erro });
  }
  return { ok: true, enviados, falhas, ignorados: eventos.length - novos.length };
}

// ---------------------------------------------------------------- Webhook

/**
 * Confere o `x-hub-signature` do webhook do Fireflies: HMAC SHA-256 (hex) do corpo cru com o segredo. Aceita
 * o valor com ou sem o prefixo "sha256=". Comparação em tempo constante.
 */
export function verificarAssinatura(corpoCru, assinatura, segredo) {
  if (!segredo || typeof corpoCru !== "string" || typeof assinatura !== "string") return false;
  const recebida = assinatura.trim().replace(/^sha256=/i, "").toLowerCase();
  const esperada = createHmac("sha256", segredo).update(corpoCru, "utf8").digest("hex");
  if (!/^[0-9a-f]+$/.test(recebida) || recebida.length !== esperada.length) return false;
  return timingSafeEqual(Buffer.from(recebida, "hex"), Buffer.from(esperada, "hex"));
}

// Webhooks V2 (docs.fireflies.ai/graphql-api/webhooks-v2): { event, timestamp, meeting_id, client_reference_id? }.
// A transcrição chega em "meeting.transcribed" e o resumo depois, em "meeting.summarized": os dois importam de
// novo (a linha pode já existir). Legado (V1): { meetingId, eventType: "Transcription completed" }.
// O resto é ignorado: "meeting.bot_joined" e o "test" do botão "Send Test Event" (meeting_id "test_00000000").
const EVENTOS_QUE_IMPORTAM = new Set(["meeting.transcribed", "meeting.summarized"]);

/** O que fazer com o corpo do webhook: { id, evento } para importar, ou { ignorar: true, evento, motivo }. */
export function interpretarWebhook(payload) {
  const v2 = payload?.event !== undefined;
  const evento = String((v2 ? payload.event : payload?.eventType) || "");
  const id = String((v2 ? payload.meeting_id : payload?.meetingId) || "").trim();
  const importa = v2 ? EVENTOS_QUE_IMPORTAM.has(evento) : /^transcription completed$/i.test(evento.trim());
  if (!importa) return { ignorar: true, evento, motivo: `evento ${evento || "vazio"}` };
  if (!id) return { ignorar: true, evento, motivo: "sem meeting_id" };
  return { id, evento };
}

// ---------------------------------------------------------------- Dependências reais

/** Clientes de verdade a partir da config do worker (o estado do histórico vive enquanto o processo vive). */
export function depsReais(config, { fetch: _fetch = fetch } = {}) {
  const cacheGoogle = {};
  return {
    fireflies: criarFireflies({ apiKey: config.firefliesApiKey, fetch: _fetch }),
    banco: criarBanco({ supabaseUrl: config.supabaseUrl, anonKey: config.supabaseAnonKey, fetch: _fetch }),
    documentos: documentosReais,
    tokenGoogle: () => tokenGoogle({ supabaseUrl: config.supabaseUrl, swipeKey: config.swipeKey, fetch: _fetch, cache: cacheGoogle }),
    esquecerTokenGoogle: () => { cacheGoogle.token = null; },
    fetch: _fetch,
    estado: { historicoCompleto: false },
    log: logPadrao,
  };
}

/** O que as rotas /fireflies/* chamam. */
export function criarRotinasFireflies(deps) {
  return {
    agenda: () => enviarRoboAgenda({}, deps),
    pendencias: () => aplicarPendencias(deps),
    sincronizar: ({ limite, completo } = {}) => sincronizar({ limite, completo }, deps),
    importar: (id) => importarReuniao(id, deps),
  };
}
