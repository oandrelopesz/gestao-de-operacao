// Regras puras dos posts do Google Meu Negócio (spec 2026-09-29-gmn-posts-design.md).
// Sem imports e sem APIs de ambiente: roda na edge function (Deno), no navegador e no `node --test`.

// ------------------------------------------------------------------ briefing

export interface Briefing {
  contexto: string;
  objetivo: string;
  posicionamento: string;
  publico: string;
  tom_de_voz: string;
  servicos: string[];
  cidade: string;
  bairros: string[];
  palavras_chave: string[];
  diferenciais: string[];
  termos_proibidos: string[];
}

export const CAMPOS_TEXTO = ["contexto", "objetivo", "posicionamento", "publico", "tom_de_voz", "cidade"] as const;
export const CAMPOS_LISTA = ["servicos", "bairros", "palavras_chave", "diferenciais", "termos_proibidos"] as const;

export const BRIEFING_VAZIO: Briefing = {
  contexto: "", objetivo: "", posicionamento: "", publico: "", tom_de_voz: "", servicos: [], cidade: "",
  bairros: [], palavras_chave: [], diferenciais: [], termos_proibidos: [],
};

function lista(v: unknown): string[] {
  const itens = Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : [];
  return itens.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

/** Qualquer valor (jsonb do banco, resposta da IA) → Briefing completo, só com os campos conhecidos. */
export function normalizarBriefing(v: unknown): Briefing {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const b: Briefing = { ...BRIEFING_VAZIO };
  for (const c of CAMPOS_TEXTO) b[c] = typeof o[c] === "string" ? (o[c] as string).trim() : "";
  for (const c of CAMPOS_LISTA) b[c] = lista(o[c]);
  return b;
}

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// ------------------------------------------------------------------ temas e palavras-chave

export const TEMAS = ["servico", "duvida", "regiao", "diferencial", "bastidores"] as const;
export type Tema = (typeof TEMAS)[number];

export const ROTULO_TEMA: Record<Tema, string> = {
  servico: "Serviço ou produto em destaque",
  duvida: "Dúvida frequente de clientes",
  regiao: "Bairro ou região atendida",
  diferencial: "Diferencial da empresa",
  bastidores: "Bastidores e dia a dia",
};

/** Próximo tema do rodízio, depois do último usado e fora dos 3 últimos. `recentes`: mais novo primeiro. */
export function proximoTema(recentes: (string | null)[]): Tema {
  const ultimos = recentes.slice(0, 3);
  const ult = TEMAS.indexOf(recentes[0] as Tema);
  for (let i = 1; i <= TEMAS.length; i++) {
    const t = TEMAS[(ult + i + TEMAS.length) % TEMAS.length];
    if (!ultimos.includes(t)) return t;
  }
  return TEMAS[(ult + 1 + TEMAS.length) % TEMAS.length];
}

/**
 * Até `n` palavras-chave do briefing: primeiro as nunca usadas (na ordem do briefing), depois as usadas há
 * mais tempo. `historico`: palavras de cada post, do mais novo para o mais velho.
 */
export function escolherPalavras(palavras: string[], historico: string[][], n = 2): string[] {
  const ultimoUso = (p: string) => {
    const k = semAcento(p);
    const i = historico.findIndex((h) => h.some((x) => semAcento(x) === k));
    return i === -1 ? Infinity : i;
  };
  return palavras
    .map((p, ordem) => ({ p, u: ultimoUso(p), ordem }))
    .sort((a, b) => (a.u === b.u ? a.ordem - b.ordem : b.u - a.u))
    .slice(0, n)
    .map((x) => x.p);
}

// ------------------------------------------------------------------ checagem do texto

export const TEXTO_MIN = 100;
export const TEXTO_MAX = 1500;

// Telefone brasileiro (com ou sem +55 e DDD) e 0800. Não começa no meio de outro número.
const RE_TELEFONE = /(?<![\d.,])(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?9?\d{4}[\s.-]?\d{4}\b|\b0800[\s.-]?\d{3}[\s.-]?\d{4}\b/;
// Pares de anos ("2019-2020", "2024 2025", "2023.2024") parecem telefone de 8 dígitos: saem antes da checagem.
const RE_PAR_DE_ANOS = /\b(?:19|20)\d{2}\s?[-–/.\s]\s?(?:19|20)\d{2}\b/g;
const RE_LINK = /\bhttps?:\/\/|\bwww\.|\bwa\.me\b|[\w.+-]+@[\w-]+\.[a-z]{2,}|\b[a-z0-9-]+\.(?:com|net|org|br|digital|app|site|online|store|io|me|ly|ee|co|dev|link|shop)\b/i;

// Aplicadas ao texto sem acento e em minúsculas (perfis de saúde: CFM/CFO).
const REGRAS_SAUDE: { re: RegExp; motivo: string }[] = [
  { re: /garantid/, motivo: "promessa de resultado (garantido)" },
  { re: /100\s?%/, motivo: "promessa de resultado (100%)" },
  { re: /resultado definitivo/, motivo: "promessa de resultado definitivo" },
  { re: /\bcura(r|mos)?\b/, motivo: "promessa de cura" },
  { re: /antes e depois/, motivo: "antes e depois" },
  { re: /r\$\s?\d/, motivo: "preço de procedimento" },
  { re: /promoc/, motivo: "promoção" },
  { re: /descont|\bgratis\b|brinde/, motivo: "desconto, brinde ou grátis" },
  { re: /\b(o|a) melhor\b/, motivo: "superlativo (o melhor)" },
  { re: /\b(o|a) unic[oa]\b/, motivo: "superlativo (o único)" },
  { re: /numero 1|\bn[o°º]\.?\s?1\b/, motivo: "superlativo (número 1)" },
  { re: /mais barat/, motivo: "superlativo (mais barato)" },
];

const escaparRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function checarTexto(
  texto: string,
  o: { termosProibidos: string[]; saude: boolean },
): { ok: boolean; motivos: string[] } {
  const motivos: string[] = [];
  const t = texto.trim();
  if (t.length < TEXTO_MIN) motivos.push(`texto curto (${t.length} caracteres, mínimo ${TEXTO_MIN})`);
  if (t.length > TEXTO_MAX) motivos.push(`texto longo (${t.length} caracteres, máximo ${TEXTO_MAX})`);
  if (RE_TELEFONE.test(t.replace(RE_PAR_DE_ANOS, " "))) motivos.push("contém telefone");
  if (RE_LINK.test(t)) motivos.push("contém link ou site");
  const n = semAcento(t);
  for (const termo of o.termosProibidos) {
    const x = semAcento(termo.trim());
    if (!x) continue;
    // Palavra ou expressão inteira: "cura" não reprova "procura".
    const re = new RegExp("(^|[^a-z0-9])" + escaparRe(x) + "([^a-z0-9]|$)");
    if (re.test(n) && !motivos.includes(`termo proibido: ${termo.trim()}`)) motivos.push(`termo proibido: ${termo.trim()}`);
  }
  if (o.saude) for (const r of REGRAS_SAUDE) if (r.re.test(n)) motivos.push(r.motivo);
  return { ok: motivos.length === 0, motivos };
}

// ------------------------------------------------------------------ imagem, agenda e links

/** Imagem nunca usada (na ordem recebida) ou a usada há mais tempo. `usos`: ref → ISO do último uso. */
export function escolherImagem(candidatos: string[], usos: Record<string, string>): string | null {
  if (!candidatos.length) return null;
  const nunca = candidatos.find((c) => !usos[c]);
  if (nunca) return nunca;
  return [...candidatos].sort((a, b) => Date.parse(usos[a]) - Date.parse(usos[b]))[0];
}

// ------------------------------------------------------------------ agenda (dias e horários dos posts)

/** Um dia da semana com o horário do post. `dia`: 0 = domingo … 6 = sábado; `hora`: "HH:MM" (horário de Brasília). */
export interface ItemAgenda { dia: number; hora: string }

export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export const HORA_PADRAO = "09:00";
export const AGENDA_PADRAO: ItemAgenda[] = [{ dia: 2, hora: HORA_PADRAO }, { dia: 4, hora: HORA_PADRAO }];

/** Horários oferecidos na tela: de 30 em 30 minutos, das 06:00 às 22:00. */
export const HORARIOS: string[] = Array.from({ length: 33 }, (_, i) => {
  const min = 6 * 60 + i * 30;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
});

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Qualquer valor (jsonb do banco, estado da tela) → agenda válida: um item por dia (o primeiro vence), em ordem de dia. */
export function normalizarAgenda(v: unknown): ItemAgenda[] {
  const porDia = new Map<number, string>();
  for (const x of Array.isArray(v) ? v : []) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const dia = typeof o.dia === "number" ? o.dia : Number.NaN;
    const hora = typeof o.hora === "string" ? o.hora.trim() : "";
    if (Number.isInteger(dia) && dia >= 0 && dia <= 6 && RE_HORA.test(hora) && !porDia.has(dia)) porDia.set(dia, hora);
  }
  return [...porDia.entries()].sort((a, b) => a[0] - b[0]).map(([dia, hora]) => ({ dia, hora }));
}

/** Liga ou desliga um dia. Dia novo entra com o horário do primeiro dia já ligado (ou 09:00). */
export function alternarDia(agenda: ItemAgenda[], dia: number): ItemAgenda[] {
  const a = normalizarAgenda(agenda);
  if (a.some((x) => x.dia === dia)) return a.filter((x) => x.dia !== dia);
  return normalizarAgenda([...a, { dia, hora: a[0]?.hora ?? HORA_PADRAO }]);
}

/** Troca o horário de um dia já ligado. */
export function mudarHora(agenda: ItemAgenda[], dia: number, hora: string): ItemAgenda[] {
  if (!RE_HORA.test(hora)) return normalizarAgenda(agenda); // hora inválida não apaga o dia
  return normalizarAgenda(agenda.map((x) => (x.dia === dia ? { dia, hora } : x)));
}

/** O mesmo horário em todos os dias ligados. */
export function mesmoHorario(agenda: ItemAgenda[], hora: string): ItemAgenda[] {
  if (!RE_HORA.test(hora)) return normalizarAgenda(agenda);
  return normalizarAgenda(agenda.map((x) => ({ dia: x.dia, hora })));
}

/** "Ter 09:00 · Qui 14:30" (sem nenhum dia: "Sem dias"). */
export function resumoAgenda(agenda: ItemAgenda[]): string {
  const a = normalizarAgenda(agenda);
  return a.length ? a.map((x) => `${DIAS_CURTOS[x.dia]} ${x.hora}`).join(" · ") : "Sem dias";
}

export const UTM = { utm_source: "google", utm_medium: "organic", utm_campaign: "gmn-post" };

/** URL do botão com a UTM do GMN (mantém parâmetros e UTM já existentes). `null` se não for link. */
export function comUtm(url: string): string | null {
  const t = url.trim();
  if (!t || /\s/.test(t)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (!u.hostname.includes(".")) return null;
    for (const [k, v] of Object.entries(UTM)) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return null;
  }
}

/** Id da pasta a partir do link do Drive (ou o próprio id colado). */
export function idPastaDrive(link: string): string | null {
  const t = link.trim();
  const m = /\/folders\/([\w-]{10,})/.exec(t) ?? /[?&]id=([\w-]{10,})/.exec(t);
  if (m) return m[1];
  return /^[\w-]{20,}$/.test(t) ? t : null;
}

// ------------------------------------------------------------------ prompts

export interface Mensagens { system: string; user: string }

export interface EntradaPost {
  nome: string;
  categoria: string | null;
  briefing: Briefing;
  saude: boolean;
  tema: Tema;
  palavras: string[];
  anteriores: string[];
  motivoReprovacao: string | null;
}

function blocoBriefing(b: Briefing): string {
  const linhas: string[] = [];
  const add = (rotulo: string, v: string | string[]) => {
    const s = Array.isArray(v) ? v.join("; ") : v;
    if (s.trim()) linhas.push(`- ${rotulo}: ${s}`);
  };
  add("Contexto", b.contexto);
  add("Objetivo dos posts", b.objetivo);
  add("Posicionamento", b.posicionamento);
  add("Público-alvo", b.publico);
  add("Tom de voz", b.tom_de_voz);
  add("Serviços/produtos", b.servicos);
  add("Cidade", b.cidade);
  add("Bairros/região", b.bairros);
  add("Palavras-chave de SEO local", b.palavras_chave);
  add("Diferenciais", b.diferenciais);
  add("Nunca usar", b.termos_proibidos);
  return linhas.join("\n") || "- (briefing vazio)";
}

export function montarMensagensPost(e: EntradaPost): Mensagens {
  const regras = [
    "Você escreve posts para o Perfil da Empresa no Google (Google Meu Negócio) de negócios locais brasileiros.",
    "Escreva em português do Brasil, entre 120 e 220 palavras, no máximo 1.400 caracteres.",
    "Texto simples, sem markdown (sem asteriscos, títulos ou listas com marcadores).",
    "Otimize para SEO local: use a palavra-chave e a cidade ou bairro de forma natural, sem repetir à exaustão.",
    "Não inclua número de telefone, WhatsApp, e-mail, links ou nomes de site: o botão do post já leva ao contato.",
    "No máximo 3 hashtags, só se fizerem sentido. Sem emojis em excesso (no máximo 2).",
    "Siga o tom de voz e o posicionamento do briefing. Não invente preços, prêmios, números ou fatos que não estejam no briefing.",
    "Termine com uma chamada para ação coerente com o objetivo do briefing.",
    'Responda só com JSON: {"texto": "...", "palavras_chave": ["as palavras-chave que você usou"]}.',
  ];
  if (e.saude) {
    regras.push(
      "Este é um perfil da área da saúde: siga as regras de publicidade do CFM e do CFO. Não prometa resultado nem cura, " +
        "não use 'antes e depois', não cite preços, valores, descontos, brindes ou promoções, não use superlativos ('o melhor', 'o único', 'número 1', 'mais barato').",
    );
  }
  const partes = [
    `Empresa: ${e.nome}${e.categoria ? ` (${e.categoria})` : ""}`,
    `Briefing:\n${blocoBriefing(e.briefing)}`,
    `Tema deste post: ${ROTULO_TEMA[e.tema]}`,
    e.palavras.length ? `Palavras-chave para este post: ${e.palavras.join("; ")}` : "Palavras-chave: use as do briefing.",
    e.anteriores.length
      ? `Posts anteriores (não repita assunto, abertura nem frases):\n${e.anteriores.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "",
    e.motivoReprovacao ? `A versão anterior foi reprovada por: ${e.motivoReprovacao}. Corrija isso.` : "",
  ];
  return { system: regras.join("\n"), user: partes.filter(Boolean).join("\n\n") };
}

export interface EntradaBriefing {
  nome: string;
  categoria: string | null;
  site: string | null;
  endereco: string | null;
  nicho: string | null;
  briefingAtual: Briefing;
  textoDadosInternos: string | null;
}

export function montarMensagensBriefing(e: EntradaBriefing): Mensagens {
  const system = [
    "Você é estrategista de marketing local e monta o briefing de marca de um negócio para posts no Google Meu Negócio.",
    "Use apenas as informações recebidas; quando faltar algo, faça uma sugestão prudente e genérica, sem inventar fatos.",
    "Palavras-chave: de 5 a 10 buscas locais reais que o cliente faria (serviço + cidade/bairro), em minúsculas.",
    "Listas: itens curtos. Termos proibidos: só o que o material pedir para evitar (lista vazia se nada for dito).",
    "Mantenha o que já estiver preenchido no briefing atual, a menos que o material traga algo melhor.",
    "Responda só com o JSON do briefing.",
  ].join("\n");
  const user = [
    `Empresa: ${e.nome}`,
    e.categoria ? `Categoria no Google: ${e.categoria}` : "",
    e.site ? `Site: ${e.site}` : "",
    e.endereco ? `Endereço: ${e.endereco}` : "",
    e.nicho ? `Nicho: ${e.nicho}` : "",
    `Briefing atual:\n${blocoBriefing(e.briefingAtual)}`,
    e.textoDadosInternos ? `Respostas do formulário de briefing do cliente:\n${e.textoDadosInternos.slice(0, 20000)}` : "",
  ];
  return { system, user: user.filter(Boolean).join("\n\n") };
}

export function montarPromptImagem(e: { nome: string; categoria: string | null; briefing: Briefing; tema: Tema }): string {
  const negocio = e.categoria || e.briefing.servicos[0] || e.nome;
  const local = [e.briefing.cidade, ...e.briefing.bairros.slice(0, 1)].filter(Boolean).join(", ");
  return [
    `Fotografia realista e profissional para o post de um negócio local: ${negocio}${local ? ` em ${local}` : ""}.`,
    `Assunto: ${ROTULO_TEMA[e.tema]}${e.briefing.servicos.length ? ` — ${e.briefing.servicos.slice(0, 3).join(", ")}` : ""}.`,
    "Luz natural, cores agradáveis, composição limpa, aparência de foto real tirada no local.",
    "Sem texto, sem letras, sem logotipos, sem marcas d'água e sem rostos em destaque.",
  ].join(" ");
}

// ------------------------------------------------------------------ esquemas da OpenAI (strict)

export const ESQUEMA_POST = {
  type: "object",
  additionalProperties: false,
  required: ["texto", "palavras_chave"],
  properties: {
    texto: { type: "string" },
    palavras_chave: { type: "array", items: { type: "string" } },
  },
};

const TEXTO = { type: "string" };
const LISTA = { type: "array", items: { type: "string" } };

export const ESQUEMA_BRIEFING = {
  type: "object",
  additionalProperties: false,
  required: [...CAMPOS_TEXTO, ...CAMPOS_LISTA],
  properties: {
    contexto: TEXTO, objetivo: TEXTO, posicionamento: TEXTO, publico: TEXTO, tom_de_voz: TEXTO, cidade: TEXTO,
    servicos: LISTA, bairros: LISTA, palavras_chave: LISTA, diferenciais: LISTA, termos_proibidos: LISTA,
  },
};
