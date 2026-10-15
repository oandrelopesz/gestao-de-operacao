// Regras puras do Gerador de UTM: limpeza dos valores, montagem dos parâmetros e do link, leitura de um link com UTM.
// Sem dependências do navegador: roda no app e no `node --test`.
import { normalizarUrl } from "./linksTexto.ts";
import { canalPorId, destinoPorId, opcoesDoSlot, type Canal, type NomeSlot } from "./utmCanais.ts";

/** Variável da plataforma, como {{campaign.name}}, {campaignid} ou __AID_NAME__: nunca é limpa nem codificada. */
export const ehMacro = (v: string): boolean => /\{[^{}]+\}|__[A-Z0-9_]+__/.test(v);

/** Texto digitado → valor de UTM seguro: minúsculo, sem acento, `_` entre palavras, só a-z 0-9 . _ - */
export function limpar(texto: string): string {
  return texto
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_*-_*/g, "-")
    .replace(/_+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "");
}

const livre = (v: string): string => (ehMacro(v.trim()) ? v.trim() : limpar(v));

const MACRO = /\{\{[^{}]+\}\}|\{[^{}]+\}|__[A-Z0-9_]+__/g;

/** Como um dado de campanha entra no link: variável da plataforma, texto digitado ou fora. */
export type Captura = "dinamico" | "fixo" | "ausente";
const capturaDe = (v: string): Captura => (!v ? "ausente" : ehMacro(v) ? "dinamico" : "fixo");

function macrosDoCanal(canal: Canal): Set<string> {
  const s = new Set<string>();
  const add = (v: string) => { for (const m of v.match(MACRO) ?? []) s.add(m); };
  canal.sources.forEach((o) => add(o.valor));
  for (const n of ["campaign", "term", "content"] as const) canal[n].opcoes.forEach((o) => add(o.valor));
  if (canal.ids.utmId) add(canal.ids.utmId);
  canal.ids.extras.forEach(([, v]) => add(v));
  return s;
}

/** Rede de segurança: confere o texto final antes de liberar a cópia. Erro bloqueia; aviso só alerta. */
export function checarParametros(parametros: string, canal: Canal): { erros: string[]; avisos: string[] } {
  const erros: string[] = [];
  const avisos: string[] = [];
  const chaves = new Set<string>();
  for (const p of parametros.split("&")) {
    const k = p.split("=")[0].toLowerCase();
    if (!/^[A-Za-z0-9_]+=[^\s?&#=]+$/.test(p)) { erros.push(`Parâmetro quebrado: ${p || "(vazio)"}`); chaves.add(k); continue; }
    if (chaves.has(k)) erros.push(`Parâmetro repetido: ${k}`);
    chaves.add(k);
  }
  for (const k of ["utm_source", "utm_medium", "utm_campaign"]) if (!chaves.has(k)) erros.push(`Falta ${k}.`);
  if ((parametros.match(/\{/g) ?? []).length !== (parametros.match(/\}/g) ?? []).length) {
    erros.push("As chaves { } da variável estão desparelhadas.");
  }
  const conhecidas = macrosDoCanal(canal);
  const estranhas = [...new Set((parametros.match(MACRO) ?? []).filter((m) => !conhecidas.has(m)))];
  if (estranhas.length) avisos.push(`Variável fora do catálogo de ${canal.nome}: ${estranhas.join(", ")}. Confira o nome na documentação da plataforma.`);
  if (parametros.length > 1500) avisos.push("Os parâmetros ficaram longos: algumas plataformas cortam links acima de 2.000 caracteres.");
  return { erros, avisos };
}

/** Avisa quando a plataforma preencheria um dado sozinha e a escolha atual o deixa igual ou de fora. */
function avisosDeCaptura(canal: Canal, e: Entrada): string[] {
  const out: string[] = [];
  for (const n of ["campaign", "term", "content"] as const) {
    const slot = canal[n];
    const modo = e[n].modo;
    if (modo === slot.padrao || !slot.opcoes.some((o) => ehMacro(o.valor))) continue;
    if (modo === "fixo") out.push(`${slot.rotulo}: com texto fixo, todos os anúncios saem com o mesmo valor, e ${canal.nome} consegue preencher esse dado sozinha.`);
    if (modo === "nenhum") out.push(`${slot.rotulo}: fica fora do link, e ${canal.nome} consegue preencher esse dado sozinha.`);
  }
  if (!e.incluirIds && (canal.ids.utmId || canal.ids.extras.length)) {
    out.push("Sem os IDs fica mais difícil cruzar o link com o relatório da plataforma e com o CRM.");
  }
  return out;
}

export interface EscolhaSlot { modo: string; texto: string }
export interface Entrada {
  canalId: string;
  url: string;
  /** Tipo de destino (DESTINOS): sem link, a url é ignorada e só os parâmetros saem */
  destino: string;
  /** Nome do perfil (só nos canais com perfil, como a bio do Instagram): vai no utm_content */
  perfil: string;
  source: string;
  medium: string;
  campaign: EscolhaSlot;
  term: EscolhaSlot;
  content: EscolhaSlot;
  incluirIds: boolean;
}

export function entradaPadrao(canalId: string, url = ""): Entrada {
  const c = canalPorId(canalId);
  if (!c) throw new Error(`Canal desconhecido: ${canalId}`);
  return {
    canalId, url, destino: "site", perfil: "", source: c.source, medium: c.medium, incluirIds: true,
    campaign: { modo: c.campaign.padrao, texto: "" },
    term: { modo: c.term.padrao, texto: "" },
    content: { modo: c.content.padrao, texto: "" },
  };
}

export interface ResultadoUtm {
  canalId: string;
  canalNome: string;
  erros: string[];
  avisos: string[];
  campos: { utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string; utm_term: string };
  /** utm_source=...&utm_medium=... (sem `?`), para colar no campo da plataforma */
  parametros: string;
  /** URL de destino + `?` + parâmetros; null sem URL */
  linkCompleto: string | null;
  /** `{lpurl}?...` do Google Ads */
  modeloGoogle: string | null;
  /** Tem variáveis da plataforma (o link de teste não as preenche) */
  dinamico: boolean;
  /** Destino sem link (mensagens, formulário nativo): só os parâmetros */
  semLink: boolean;
  destino: string;
  /** Nome sugerido para guardar: canal e campanha, ou "Instagram (nome do perfil)" nas bios */
  nome: string;
  /** O que cada dado de campanha captura: variável da plataforma, texto fixo ou nada; e se os IDs entraram */
  captura: { campaign: Captura; term: Captura; content: Captura; ids: boolean };
  /** O que foi escolhido em cada dado: "Nome da campanha", "ID do anúncio"... (vazio se texto fixo ou não usado) */
  escolhas: { campaign: string; term: string; content: string };
}

function valorDoSlot(canal: Canal, nome: NomeSlot, esc: EscolhaSlot): string {
  const o = opcoesDoSlot(canal, nome).find((x) => x.id === esc.modo);
  if (!o || o.id === "nenhum") return "";
  if (o.id === "fixo") return limpar(esc.texto);
  return o.valor;
}

/** Põe os parâmetros no fim do link: troca UTM antiga, mantém o resto da query e a âncora (#). */
function anexar(url: string, parametros: string): { link: string; trocados: string[] } {
  const iHash = url.indexOf("#");
  const hash = iHash >= 0 ? url.slice(iHash) : "";
  const semHash = iHash >= 0 ? url.slice(0, iHash) : url;
  const iQ = semHash.indexOf("?");
  const caminho = (iQ >= 0 ? semHash.slice(0, iQ) : semHash).replace(/^(https?:\/\/[^/]+)$/i, "$1/");
  const partes = (iQ >= 0 ? semHash.slice(iQ + 1) : "").split("&").filter(Boolean);
  const novas = new Set(parametros.split("&").map((p) => p.split("=")[0].toLowerCase()));
  const chave = (p: string) => p.split("=")[0].toLowerCase();
  const mantidas = partes.filter((p) => !novas.has(chave(p)) && !chave(p).startsWith("utm_"));
  const trocados = partes.filter((p) => !mantidas.includes(p)).map(chave);
  return { link: `${caminho}?${[...mantidas, parametros].join("&")}${hash}`, trocados };
}

export function gerarUtm(e: Entrada): ResultadoUtm {
  const canal = canalPorId(e.canalId);
  const dest = destinoPorId(e.destino);
  const semLink = !!dest && !dest.comLink;
  const vazio = { utm_source: "", utm_medium: "", utm_campaign: "", utm_content: "", utm_term: "" };
  const base: ResultadoUtm = {
    canalId: e.canalId, canalNome: canal?.nome ?? e.canalId, erros: [], avisos: [], campos: vazio,
    parametros: "", linkCompleto: null, modeloGoogle: null, dinamico: false, semLink, destino: e.destino, nome: canal?.nome ?? e.canalId,
    captura: { campaign: "ausente", term: "ausente", content: "ausente", ids: false },
    escolhas: { campaign: "", term: "", content: "" },
  };
  if (!canal) return { ...base, erros: ["Canal desconhecido."] };

  const source = livre(e.source);
  const medium = livre(e.medium);
  const campaign = valorDoSlot(canal, "campaign", e.campaign);
  const content = canal.perfil ? canal.perfil.prefixo + limpar(e.perfil) : valorDoSlot(canal, "content", e.content);
  const term = valorDoSlot(canal, "term", e.term);

  const erros: string[] = [];
  if (!source) erros.push("Escolha a origem (utm_source).");
  if (!medium) erros.push("Escolha a mídia (utm_medium).");
  if (!campaign) erros.push("Digite o nome da campanha.");
  if (canal.perfil && !limpar(e.perfil)) erros.push(`Digite o ${canal.perfil.rotulo}: sem ele não dá para saber de qual perfil o clique veio.`);
  // Texto fixo vazio em conjunto ou anúncio deixaria o dado sumir sem ninguém perceber
  for (const [n, v] of [["term", term], ["content", content]] as const) {
    if (e[n].modo === "fixo" && !v) erros.push(`Digite o valor de ${canal[n].rotulo.toLowerCase()} ou escolha "Não usar".`);
  }
  const urlTexto = semLink ? "" : e.url.trim();
  const url = urlTexto ? normalizarUrl(urlTexto) : null;
  if (urlTexto && !url) erros.push("O link de destino não parece válido.");
  if (erros.length) return { ...base, erros };

  const pares: [string, string][] = [["utm_source", source], ["utm_medium", medium], ["utm_campaign", campaign]];
  if (content) pares.push(["utm_content", content]);
  if (term) pares.push(["utm_term", term]);
  if (e.incluirIds) {
    if (canal.ids.utmId) pares.push(["utm_id", canal.ids.utmId]);
    pares.push(...canal.ids.extras);
  }
  const parametros = pares.map(([k, v]) => `${k}=${v}`).join("&");

  const checagem = checarParametros(parametros, canal);
  if (checagem.erros.length) return { ...base, erros: checagem.erros };
  const avisos: string[] = [...checagem.avisos, ...avisosDeCaptura(canal, e)];
  let linkCompleto: string | null = null;
  if (url) {
    const r = anexar(url, parametros);
    linkCompleto = r.link;
    const utmAntigas = r.trocados.filter((k) => k.startsWith("utm_"));
    if (utmAntigas.length) avisos.push(`O link já tinha ${[...new Set(utmAntigas)].join(", ")}. Troquei pelos novos valores.`);
    if (/^http:\/\//i.test(url)) avisos.push("O link usa http e não https. Confira se o site abre com https.");
  }

  const rotulo = (n: NomeSlot) => {
    const o = opcoesDoSlot(canal, n).find((x) => x.id === e[n].modo);
    return o && ehMacro(o.valor) ? o.rotulo : "";
  };
  return {
    ...base, avisos, parametros, linkCompleto,
    nome: canal.perfil ? `${canal.perfil.nomeBase} (${e.perfil.trim()})` : nomeDaUtm(canal.nome, campaign),
    escolhas: { campaign: rotulo("campaign"), term: rotulo("term"), content: rotulo("content") },
    campos: { utm_source: source, utm_medium: medium, utm_campaign: campaign, utm_content: content, utm_term: term },
    modeloGoogle: canal.modeloGoogle ? `{lpurl}?${parametros}` : null,
    dinamico: ehMacro(parametros),
    captura: {
      campaign: capturaDe(campaign), term: capturaDe(term), content: capturaDe(content),
      ids: e.incluirIds && (!!canal.ids.utmId || canal.ids.extras.length > 0),
    },
  };
}

export interface UtmLida {
  /** Link completo, como foi colado (com https:// quando faltava) */
  url: string;
  /** Link sem as UTM, mantendo o resto da query e a âncora */
  base: string;
  /** Só as UTM: utm_source=...&utm_medium=... */
  parametros: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
}

const desfazer = (v: string): string => { try { return decodeURIComponent(v.replace(/\+/g, " ")); } catch { return v; } };

/** Lê um link que já tem UTM. `null` = não é link ou não tem nenhuma UTM. */
export function lerUtm(texto: string): UtmLida | null {
  // Link copiado de planilha ou digitado à mão pode ter espaço no valor (utm_campaign=Teste Manual): vira %20
  const url = normalizarUrl(texto.trim().replace(/\s+/g, "%20"));
  if (!url) return null;
  const iHash = url.indexOf("#");
  const hash = iHash >= 0 ? url.slice(iHash) : "";
  const semHash = iHash >= 0 ? url.slice(0, iHash) : url;
  const iQ = semHash.indexOf("?");
  const caminho = iQ >= 0 ? semHash.slice(0, iQ) : semHash;
  const partes = (iQ >= 0 ? semHash.slice(iQ + 1) : "").split("&").filter(Boolean);
  const utm = partes.filter((p) => /^utm_/i.test(p.split("=")[0]));
  if (!utm.length) return null;
  const resto = partes.filter((p) => !utm.includes(p));
  const pegar = (k: string) => {
    const p = utm.find((x) => x.split("=")[0].toLowerCase() === k);
    return p ? desfazer(p.slice(p.indexOf("=") + 1)) : "";
  };
  return {
    url, base: `${caminho}${resto.length ? `?${resto.join("&")}` : ""}${hash}`, parametros: utm.join("&"),
    source: pegar("utm_source"), medium: pegar("utm_medium"), campaign: pegar("utm_campaign"),
    content: pegar("utm_content"), term: pegar("utm_term"),
  };
}

/** Palpite do canal pela origem de uma UTM que já existe (para etiquetar ao adicionar na mão). */
export function sugerirCanal(source: string, medium: string): string | null {
  const s = source.trim().toLowerCase();
  const m = medium.trim().toLowerCase();
  if (s.includes("site_source_name") || ["facebook", "fb", "meta"].includes(s)) return "meta";
  if (s === "google") return m === "cpc" ? "google_ads" : m === "organic" ? "organico_busca" : null;
  const direto: Record<string, string> = {
    youtube: "youtube", tiktok: "tiktok", pinterest: "pinterest", linkedin: "linkedin", twitter: "x", x: "x",
    taboola: "taboola", outbrain: "outbrain", chatgpt: "chatgpt_ads", google_meu_negocio: "gmn",
  };
  return direto[s] ?? null;
}

/** Nome automático de uma UTM guardada: canal e, quando a campanha é um texto (não variável), o nome dela. */
export function nomeDaUtm(canalNome: string, campaign: string): string {
  return campaign && !ehMacro(campaign) ? `${canalNome} · ${campaign}` : canalNome;
}

/** Troca cada variável da plataforma por um valor de teste (teste_campaign.name), para abrir o link e conferir no GA4. */
export function linkDeTeste(link: string): string {
  return link.replace(MACRO, (m) => `teste_${limpar(m.replace(/^[{_]+|[}_]+$/g, ""))}`);
}
