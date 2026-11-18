export type Classe = "excelente" | "bom" | "medio";
export type TipoAchado = "A" | "B" | "C";
export type Confianca = "alta" | "moderada" | "baixa";
export type StatusAchado = "novo" | "lido" | "testando" | "aplicado" | "descartado";
export type TipoEvento = "abertura" | "boletim" | "alerta" | "correcao" | "resposta" | "encerramento";
export type Visao = "dia" | "cards" | "tabela" | "calendario" | "kanban";

export const TEMAS: { slug: string; rotulo: string; cor: string }[] = [
  { slug: "marketing", rotulo: "Marketing", cor: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30" },
  { slug: "branding", rotulo: "Branding", cor: "bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30" },
  { slug: "performance", rotulo: "Performance", cor: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30" },
  { slug: "ia", rotulo: "IA", cor: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30" },
  { slug: "software_saas", rotulo: "Software/SaaS", cor: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30" },
  { slug: "dados_mensuracao", rotulo: "Dados & Mensuração", cor: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30" },
  { slug: "ciberseguranca", rotulo: "Cibersegurança", cor: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30" },
  { slug: "conteudo_social", rotulo: "Conteúdo & Social", cor: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30" },
];

export const CLASSES: Record<Classe, { emoji: string; rotulo: string; ordem: number; borda: string; selo: string; ponto: string }> = {
  excelente: {
    emoji: "🟣",
    rotulo: "Excelente",
    ordem: 0,
    borda: "border-l-violet-500",
    selo: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
    ponto: "bg-violet-500",
  },
  bom: {
    emoji: "🟢",
    rotulo: "Bom",
    ordem: 1,
    borda: "border-l-emerald-500",
    selo: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    ponto: "bg-emerald-500",
  },
  medio: {
    emoji: "🟡",
    rotulo: "Médio",
    ordem: 2,
    borda: "border-l-amber-500",
    selo: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    ponto: "bg-amber-500",
  },
};

export const TIPOS: Record<TipoAchado, string> = { A: "Aplicação", B: "Mudança", C: "Lançamento" };

export const STATUS: { valor: StatusAchado; rotulo: string }[] = [
  { valor: "novo", rotulo: "Novo" },
  { valor: "lido", rotulo: "Lido" },
  { valor: "testando", rotulo: "Testando" },
  { valor: "aplicado", rotulo: "Aplicado" },
  { valor: "descartado", rotulo: "Descartado" },
];

export const CONFIANCAS: { valor: Confianca; rotulo: string }[] = [
  { valor: "alta", rotulo: "Alta" },
  { valor: "moderada", rotulo: "Moderada" },
  { valor: "baixa", rotulo: "Baixa" },
];

export const VISOES: { valor: Visao; rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia" },
  { valor: "cards", rotulo: "Cards" },
  { valor: "tabela", rotulo: "Tabela" },
  { valor: "calendario", rotulo: "Calendário" },
  { valor: "kanban", rotulo: "Kanban" },
];

export interface RadarLink { tipo: string; url: string; rotulo?: string }
export interface Achado {
  id: string; data: string; titulo: string; classe: Classe; tipo: TipoAchado; tipo_motivo: string | null; alerta: boolean;
  temas: string[]; confianca: Confianca; estagio: string; prontidao: string | null; publicacao: string | null;
  primeira_descoberta: string; atualizacao: string | null; corpo: any; links: RadarLink[]; post_x_url: string | null;
  link_citado_x_url: string | null; texto_whatsapp: string; enviado_em: string | null; versao: number; corrigido: boolean;
  status: StatusAchado; status_em: string | null; nota_pessoal: string | null;
}
export interface Dia {
  data: string; edicao_id: string; revisao: string | null; abertura_texto: string | null; encerramento_texto: string | null;
  resumo: { por_classe?: Partial<Record<Classe, number>>; por_tema?: Record<string, number>; fora?: { id: string; motivo: string }[] };
  cobertura_parcial: string | null; total_confirmados: number;
}
export interface Evento { id: string; data: string; tipo: TipoEvento; achado_id: string | null; ocorrido_em: string; texto_whatsapp: string | null; dados: any }

export interface Filtros {
  dia?: string; de?: string; ate?: string; // AAAA-MM-DD
  classe: Classe[]; tema: string[]; tipo: TipoAchado[]; status: StatusAchado[]; confianca: Confianca[];
  alerta: boolean; q: string; view: Visao;
}

export const FILTROS_VAZIOS: Filtros = {
  classe: [], tema: [], tipo: [], status: [], confianca: [], alerta: false, q: "", view: "dia",
};

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUGS_TEMAS = TEMAS.map((t) => t.slug);
const CLASSES_ORDEM = (Object.keys(CLASSES) as Classe[]).sort((a, b) => CLASSES[a].ordem - CLASSES[b].ordem);
const TIPOS_ORDEM = Object.keys(TIPOS);
const STATUS_ORDEM = STATUS.map((s) => s.valor);
const CONFIANCAS_ORDEM = CONFIANCAS.map((c) => c.valor);

function listaDe(valor: unknown): string[] {
  const partes: unknown[] = Array.isArray(valor) ? valor : [valor];
  return partes.flatMap((p) => (typeof p === "string" ? p.split(",") : [])).map((s) => s.trim());
}

// Devolve só os valores permitidos, sem duplicar, na ordem da lista de referência.
function escolhidos(valor: unknown, permitidos: readonly string[]): string[] {
  const recebidos = listaDe(valor);
  return permitidos.filter((p) => recebidos.includes(p));
}

function dataValida(valor: unknown): string | undefined {
  return typeof valor === "string" && DATA_RE.test(valor) ? valor : undefined;
}

export function lerFiltros(search: Record<string, unknown>): Filtros {
  const f: Filtros = {
    classe: escolhidos(search.classe, CLASSES_ORDEM) as Classe[],
    tema: escolhidos(search.tema, SLUGS_TEMAS),
    tipo: escolhidos(search.tipo, TIPOS_ORDEM) as TipoAchado[],
    status: escolhidos(search.status, STATUS_ORDEM) as StatusAchado[],
    confianca: escolhidos(search.confianca, CONFIANCAS_ORDEM) as Confianca[],
    alerta: search.alerta === true || search.alerta === 1 || search.alerta === "1",
    q: typeof search.q === "string" ? search.q.trim() : "",
    view: VISOES.some((v) => v.valor === search.view) ? (search.view as Visao) : "dia",
  };
  const dia = dataValida(search.dia);
  const de = dataValida(search.de);
  const ate = dataValida(search.ate);
  if (dia) f.dia = dia;
  if (de) f.de = de;
  if (ate) f.ate = ate;
  return f;
}

export function filtrosParaSearch(f: Filtros): Record<string, string> {
  const saida: Record<string, string> = {};
  if (f.dia) saida.dia = f.dia;
  if (f.de) saida.de = f.de;
  if (f.ate) saida.ate = f.ate;
  const listas: [string, string[], string[]][] = [
    ["classe", f.classe, CLASSES_ORDEM],
    ["tema", f.tema, SLUGS_TEMAS],
    ["tipo", f.tipo, TIPOS_ORDEM],
    ["status", f.status, STATUS_ORDEM],
    ["confianca", f.confianca, CONFIANCAS_ORDEM],
  ];
  for (const [chave, valores, ordem] of listas) {
    const v = escolhidos(valores, ordem);
    if (v.length) saida[chave] = v.join(",");
  }
  if (f.alerta) saida.alerta = "1";
  if (f.q.trim()) saida.q = f.q.trim();
  if (f.view !== "dia") saida.view = f.view;
  return saida;
}

export function contarFiltros(f: Filtros): number {
  return [
    f.classe.length > 0,
    f.tema.length > 0,
    f.tipo.length > 0,
    f.status.length > 0,
    f.confianca.length > 0,
    f.alerta,
    f.q.trim() !== "",
    Boolean(f.de || f.ate),
  ].filter(Boolean).length;
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function bateFiltro(a: Achado, f: Filtros): boolean {
  if (f.classe.length && !f.classe.includes(a.classe)) return false;
  if (f.tema.length && !a.temas.some((t) => f.tema.includes(t))) return false;
  if (f.tipo.length && !f.tipo.includes(a.tipo)) return false;
  if (f.status.length && !f.status.includes(a.status)) return false;
  if (f.confianca.length && !f.confianca.includes(a.confianca)) return false;
  if (f.alerta && !a.alerta) return false;
  const palavras = normalizar(f.q).split(/\s+/).filter(Boolean);
  if (palavras.length) {
    const texto = normalizar(`${a.titulo} ${a.texto_whatsapp}`);
    if (!palavras.every((p) => texto.includes(p))) return false;
  }
  return true;
}

export function ordenarAchados(lista: Achado[]): Achado[] {
  return [...lista].sort(
    (x, y) =>
      Number(y.alerta) - Number(x.alerta) ||
      CLASSES[x.classe].ordem - CLASSES[y.classe].ordem ||
      (Date.parse(x.primeira_descoberta) - Date.parse(y.primeira_descoberta) || 0),
  );
}

// Intl com hourCycle h23 para o meia-noite não virar "24".
const FMT_SP = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function partesSP(d: Date): Record<string, string> {
  const p: Record<string, string> = {};
  for (const parte of FMT_SP.formatToParts(d)) p[parte.type] = parte.value;
  return p;
}

export function hojeSP(agora: Date = new Date()): string {
  const p = partesSP(agora);
  return `${p.year}-${p.month}-${p.day}`;
}

export function horaSP(iso: string): string {
  const p = partesSP(new Date(iso));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute} (Brasília)`;
}

export function soHoraSP(iso: string): string {
  const p = partesSP(new Date(iso));
  return `${p.hour}:${p.minute}`;
}

const NOMES_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function rotuloDia(data: string): string {
  const [a, m, d] = data.split("-").map(Number);
  const diaSemana = NOMES_DIA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${diaSemana}, ${pad(d)}/${pad(m)}/${a}`;
}

export function somarDias(data: string, n: number): string {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

export function boletimAindaNaoChegou(data: string, agora: Date = new Date()): boolean {
  if (hojeSP(agora) !== data) return false;
  const p = partesSP(agora);
  return Number(p.hour) * 60 + Number(p.minute) < 8 * 60 + 15;
}

export function edicaoDoDia(data: string): string {
  return `DIA-${data.replace(/-/g, "")}`;
}

export type Pedaco = { texto: string; negrito?: boolean; italico?: boolean; riscado?: boolean } | { quebra: true };

const MARCAS: Record<string, string> = { "*": "negrito", _: "italico", "~": "riscado" };

// Marcador só abre se houver o fechamento depois, com conteúdo, na mesma linha; senão fica literal.
export function pedacosWhatsapp(texto: string): Pedaco[] {
  const saida: Pedaco[] = [];
  const ativos: Record<string, boolean> = { "*": false, _: false, "~": false };
  let buf = "";
  const descarregar = () => {
    if (!buf) return;
    const p: { texto: string; negrito?: boolean; italico?: boolean; riscado?: boolean } = { texto: buf };
    if (ativos["*"]) p.negrito = true;
    if (ativos._) p.italico = true;
    if (ativos["~"]) p.riscado = true;
    saida.push(p);
    buf = "";
  };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === "\n") {
      descarregar();
      saida.push({ quebra: true });
      for (const k of Object.keys(ativos)) ativos[k] = false;
      continue;
    }
    if (Object.hasOwn(MARCAS, c)) {
      if (ativos[c]) {
        descarregar();
        ativos[c] = false;
        continue;
      }
      const quebra = texto.indexOf("\n", i);
      const fimLinha = quebra === -1 ? texto.length : quebra;
      const fecha = texto.indexOf(c, i + 2);
      if (fecha !== -1 && fecha < fimLinha) {
        descarregar();
        ativos[c] = true;
        continue;
      }
    }
    buf += c;
  }
  descarregar();
  return saida;
}

export function linkSeguro(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
