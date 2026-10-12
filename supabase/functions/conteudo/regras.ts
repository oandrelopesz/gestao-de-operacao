// Aba Conteúdo (spec docs/superpowers/specs/2026-10-12-conteudo-automatico-design.md): tipos e regras puras, sem rede.
// Rodam na função `conteudo` (Deno), na tela, no script do cofre e no `node --test`. Só sintaxe de tipos que o Node apaga
// sozinho (sem enum, namespace ou parameter properties).
import { motivosSaude } from "../gmn/regras.ts";

export type Formato = "carrossel" | "estatico";
export type TipoMolde = "capa" | "texto" | "foto" | "cta" | "estatico";
export type VarianteLogo = "principal" | "icone" | "clara" | "escura";
export type StatusPost = "texto" | "imagens" | "montando" | "aguardando" | "aprovado" | "descartado" | "erro";

export const TIPOS_MOLDE: TipoMolde[] = ["capa", "texto", "foto", "cta", "estatico"];
export const MOLDES_DO_FORMATO: Record<Formato, TipoMolde[]> = { carrossel: ["capa", "texto", "foto", "cta"], estatico: ["estatico"] };
export const ROTULO_MOLDE: Record<TipoMolde, string> = {
  capa: "Capa", texto: "Lâmina de texto", foto: "Lâmina com foto", cta: "CTA final", estatico: "Post estático",
};
export const ROTULO_FORMATO: Record<Formato, string> = { carrossel: "Carrossel", estatico: "Estático" };
export const VARIANTES_LOGO: VarianteLogo[] = ["principal", "icone", "clara", "escura"];
export const ROTULO_VARIANTE: Record<VarianteLogo, string> = {
  principal: "Principal", icone: "Ícone", clara: "Clara (para fundo escuro)", escura: "Escura (para fundo claro)",
};
export const ROTULO_STATUS: Record<StatusPost, string> = {
  texto: "Escrevendo", imagens: "Buscando imagens", montando: "Montando", aguardando: "Aguardando aprovação",
  aprovado: "Aprovado", descartado: "Descartado", erro: "Erro",
};
export const ETAPAS_DA_FILA: StatusPost[] = ["texto", "imagens", "montando"];
export const LARGURA = 1080;
export const ALTURA = 1350;
export const CAMPO_FOTO = "foto";
export const ARQUIVO_LOG = "Log (60 dias)";
export const LEGENDA_MAX = 2200;

export interface Logo { variante: VarianteLogo; chave: string; largura: number; altura: number }
export interface Fonte { familia: string; origem: "google" | "fontshare" | "arquivo"; chave?: string; peso?: number }
export interface Pilar { nome: string; descricao: string }
/** dia: 0 = domingo ... 6 = sábado (como no GMN); hora "HH:MM" de Brasília. */
export interface ItemAgenda { dia: number; hora: string; formato: Formato }
export interface PastaDrive { id: string; caminho: string; quantidade: number }
export interface CampoMolde { nome: string; tipo: "texto" | "imagem" | "logo"; max: number; exemplo: string }
/** Versão da direção de arte dos moldes: só moldes da versão atual servem de referência de estilo para os outros. */
export const DIRECAO_ARTE = 2;
export interface Molde { html: string; campos: CampoMolde[]; versao: number; aprovado_em: string | null; previa_chave: string | null; direcao?: number; /** Última versão aprovada, guardada enquanto uma nova espera aprovação. */ anterior?: Molde }
export type Moldes = Partial<Record<TipoMolde, Molde>>;

/** Moldes que valem para gerar: o aprovado; senão o anterior aprovado; senão o tipo fica de fora. */
export function moldesEmUso(moldes: Moldes): Moldes {
  const uso: Moldes = {};
  for (const t of Object.keys(moldes) as TipoMolde[]) {
    const m = moldes[t];
    if (m?.aprovado_em) uso[t] = m;
    else if (m?.anterior?.aprovado_em) uso[t] = m.anterior;
  }
  return uso;
}
export interface ImagemLamina {
  descricao: string;
  pasta_id?: string | null;
  pendente?: boolean;
  origem?: "drive" | "ia" | "envio";
  drive_id?: string;
  chave?: string;
}
export interface Lamina { molde: TipoMolde; campos: Record<string, string>; imagem?: ImagemLamina; ajuste_css?: string; jpg_chave: string | null }
export interface Alteracao {
  alvo: "campo" | "imagem" | "legenda" | "layout";
  lamina: number | null; // começa em 1, como o André conta
  campo: string | null;
  valor: string | null;
  descricao: string | null;
  pasta_id: string | null;
  ajuste_css: string | null;
}
export interface RespostaTexto {
  tema: string;
  legenda: string;
  laminas: { molde: TipoMolde; campos: { nome: string; valor: string }[]; imagem_descricao: string | null; pasta_id: string | null }[];
}

/** Erro com o status HTTP que a função devolve (400, 404, 409...). */
export class ErroHttp extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

/** Campos obrigatórios por molde. Texto e foto têm os mesmos textos: a lâmina de foto vira de texto se a imagem falhar. */
export const CAMPOS_OBRIGATORIOS: Record<TipoMolde, string[]> = {
  capa: ["titulo"], texto: ["titulo", "texto"], foto: ["titulo", "texto", CAMPO_FOTO], cta: ["titulo"], estatico: ["titulo"],
};
const NOME_LOGO = /^logo_(principal|icone|clara|escura)$/;

/** Imagem cinza usada na prévia dos moldes. */
export const IMAGEM_EXEMPLO = `data:image/svg+xml,${encodeURIComponent(
  // Tons do claro ao escuro, para logo ou texto posto sobre a foto aparecer como problema já na prévia do molde
  `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGURA}" height="${ALTURA}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5efe6"/><stop offset=".35" stop-color="#c9a46a"/><stop offset=".65" stop-color="#5b6f8c"/><stop offset="1" stop-color="#151515"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="50%" font-family="sans-serif" font-size="64" fill="#ffffff" text-anchor="middle">foto</text></svg>`,
)}`;

export function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Troca cada {{campo}} pelo valor: texto escapado (quebra de linha vira <br>); imagem e logo só com `data:` ou `https:`.
 * Marcação sem valor some.
 */
export function preencherMolde(html: string, campos: CampoMolde[], valores: Record<string, string>): string {
  const tipos = new Map(campos.map((c) => [c.nome, c.tipo]));
  return html.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, nome: string) => {
    const v = typeof valores[nome] === "string" ? valores[nome] : ""; // "constructor" e afins não são campos
    const tipo = tipos.get(nome) ?? (NOME_LOGO.test(nome) ? "logo" : "texto");
    if (tipo === "texto") return escaparHtml(v).replace(/\r?\n/g, "<br>");
    return /^(data:image\/|https:\/\/)/.test(v) ? escaparHtml(v) : "";
  });
}

/** Motivos para recusar os textos de uma lâmina: campo de texto vazio ou acima do limite do molde. */
/** Campo de texto que o sistema preenche com a posição da lâmina no carrossel (01/06); a IA não escreve. */
export const CAMPO_NUMERO = "numero";

export function conferirCampos(campos: CampoMolde[], valores: Record<string, string>): string[] {
  const motivos: string[] = [];
  for (const c of campos) {
    if (c.tipo !== "texto" || c.nome === CAMPO_NUMERO) continue;
    const v = (valores[c.nome] ?? "").trim();
    if (!v) motivos.push(`${c.nome}: vazio`);
    else if (v.length > c.max) motivos.push(`${c.nome}: ${v.length} caracteres (máximo ${c.max})`);
  }
  return motivos;
}

/** Carrossel: capa, de 3 a 6 lâminas de texto ou foto e o CTA. Estático: uma lâmina do molde estatico. */
export function conferirEstrutura(formato: Formato, moldes: TipoMolde[]): string[] {
  if (formato === "estatico") {
    return moldes.length === 1 && moldes[0] === "estatico" ? [] : ["o post estático tem uma lâmina só, do molde estatico"];
  }
  const meio = moldes.slice(1, -1);
  const ok = moldes[0] === "capa" && moldes[moldes.length - 1] === "cta" && meio.length >= 3 && meio.length <= 6 &&
    meio.every((m) => m === "texto" || m === "foto");
  return ok ? [] : ["o carrossel precisa de capa, de 3 a 6 lâminas de texto ou foto e o CTA no fim"];
}

/** Molde devolvido pela IA: obrigatórios, nomes únicos, logos do kit, cada campo marcado, sem script nem nada de fora. */
export function validarMolde(tipo: TipoMolde, html: string, campos: CampoMolde[], variantes: VarianteLogo[]): string[] {
  const motivos: string[] = [];
  const nomes = campos.map((c) => c.nome);
  if (new Set(nomes).size !== nomes.length) motivos.push("campos com nome repetido");
  for (const n of CAMPOS_OBRIGATORIOS[tipo]) if (!nomes.includes(n)) motivos.push(`falta o campo ${n}`);
  for (const c of campos) {
    if (!html.includes(`{{${c.nome}}}`)) motivos.push(`o campo ${c.nome} não está marcado no HTML`);
    if (c.tipo === "logo") {
      const m = NOME_LOGO.exec(c.nome);
      if (!m || !variantes.includes(m[1] as VarianteLogo)) motivos.push(`logo ${c.nome} não existe no kit`);
    }
    if (c.tipo === "imagem" && c.nome !== CAMPO_FOTO) motivos.push(`a imagem se chama ${CAMPO_FOTO}`);
    if (c.tipo === "texto" && !(c.max > 0)) motivos.push(`o campo ${c.nome} precisa de um limite`);
  }
  if (/<script/i.test(html)) motivos.push("o molde não pode ter script");
  if (/\bhttps?:\/\//i.test(html.replace(/http:\/\/www\.w3\.org\/[^"'\s]*/g, ""))) motivos.push("o molde não pode carregar nada de fora");
  return motivos;
}

/** Minúsculas, sem acento, só [a-z0-9]: "Kobe Growth (teste)" vira "kobegrowthteste". */
export function normalizarNome(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Nome da família no Fontshare: "Clash Display" vira "clash-display". */
export function slugFontshare(familia: string): string {
  return familia.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Largura e altura de PNG, JPEG ou SVG; outro formato (ou arquivo cortado) dá null. */
export function dimensoesImagem(bytes: Uint8Array): { largura: number; altura: number } | null {
  const u16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  const u32 = (i: number) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  if (bytes.length >= 24 && u32(0) === 0x89504e47 && u32(4) === 0x0d0a1a0a) return { largura: u32(16), altura: u32(20) };
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 8 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const m = bytes[i + 1];
      if (m === 0xff) { i++; continue; }
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
        return { largura: u16(i + 7), altura: u16(i + 5) };
      }
      i += m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) ? 2 : 2 + u16(i + 2);
    }
    return null;
  }
  const tag = /<svg[^>]*>/i.exec(new TextDecoder().decode(bytes.subarray(0, 4096)));
  if (!tag) return null;
  const num = (re: RegExp) => {
    const m = re.exec(tag[0]);
    return m ? Number(m[1]) : NaN;
  };
  const l = num(/\swidth\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i);
  const a = num(/\sheight\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i);
  if (l > 0 && a > 0) return { largura: l, altura: a };
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(tag[0]);
  return vb && Number(vb[1]) > 0 && Number(vb[2]) > 0 ? { largura: Number(vb[1]), altura: Number(vb[2]) } : null;
}

/** Variante da logo pelo nome do arquivo (clara, escura, ícone; senão principal). */
export function varianteDoNome(nome: string): VarianteLogo {
  const n = normalizarNome(nome);
  if (/fundoclaro|fundobranco|lightbg/.test(n)) return "escura";
  if (/fundoescuro|fundopreto|darkbg/.test(n)) return "clara";
  if (/pretoebranco|pretobranco|monocrom/.test(n)) return "principal";
  if (/clar|branc|negativ|white|light/.test(n)) return "clara";
  if (/escur|dark|pret|black/.test(n)) return "escura";
  if (/icone|icon|simbolo|symbol/.test(n)) return "icone";
  return "principal";
}

/** Imagem de logo na pasta Anexos do cofre (o nome do arquivo tem "logo"). */
export function ehLogoDoCofre(caminho: string): boolean {
  return /^Anexos\/[^/]*logo[^/]*\.(png|jpe?g|webp|svg)$/i.test(caminho);
}

/** Arquivo de fonte na pasta Anexos ou Fontes do cofre. */
export function ehFonteDoCofre(caminho: string): boolean {
  return /^(Anexos|Fontes)\/[^/]+\.(woff2|woff|ttf|otf)$/i.test(caminho);
}

/** Peso pelo nome do arquivo ("Satoshi-SemiBold" vira 600); sem pista, 400. A ordem importa: extra e semi antes de light e bold. */
export function pesoDoNome(nome: string): number {
  const n = normalizarNome(nome);
  if (/thin|hairline/.test(n)) return 100;
  if (/extralight|ultralight/.test(n)) return 200;
  if (/light/.test(n)) return 300;
  if (/medium/.test(n)) return 500;
  if (/semibold|demibold/.test(n)) return 600;
  if (/extrabold|ultrabold/.test(n)) return 800;
  if (/black|heavy/.test(n)) return 900;
  if (/bold/.test(n)) return 700;
  return 400;
}

/** Fontes da família entre os arquivos do cofre: sem itálico, um arquivo por peso (woff2 primeiro), em ordem de peso. */
export function fontesDoCofre(familia: string, arquivos: { caminho: string; chave: string }[]): Fonte[] {
  const prefixo = normalizarNome(familia);
  const ordemExt = ["woff2", "woff", "ttf", "otf"];
  const ext = (c: string) => ordemExt.indexOf((c.split(".").pop() ?? "").toLowerCase());
  const nomeSem = (c: string) => (c.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
  const porPeso = new Map<number, { caminho: string; chave: string }>();
  for (const a of arquivos) {
    if (!ehFonteDoCofre(a.caminho)) continue;
    const n = normalizarNome(nomeSem(a.caminho));
    if (!prefixo || !n.startsWith(prefixo) || n.includes("italic")) continue;
    const peso = pesoDoNome(n.slice(prefixo.length));
    const atual = porPeso.get(peso);
    if (!atual || ext(a.caminho) < ext(atual.caminho)) porPeso.set(peso, a);
  }
  return [...porPeso.entries()].sort((x, y) => x[0] - y[0]).map(([peso, a]) => ({ familia, origem: "arquivo", chave: a.chave, peso }));
}

/** Id da conta do Instagram do cliente pelo nome; só se houver exatamente uma candidata. */
export function casarConta(nomeCliente: string, contas: { id: string; usuario: string; nome: string }[]): string | null {
  const n = normalizarNome(nomeCliente);
  if (n.length < 3) return null;
  const candidatas = contas.filter((c) => {
    const u = normalizarNome(c.usuario);
    return u.includes(n) || normalizarNome(c.nome).includes(n) || (u.length >= 4 && n.includes(u));
  });
  return candidatas.length === 1 ? candidatas[0].id : null;
}

/** Primeiro link de pasta do Google Drive do texto. */
export function linkDrive(texto: string): string | null {
  return /https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/[\w-]+/.exec(texto)?.[0] ?? null;
}

/** Agenda de quem ainda não tem: segunda 09:00 carrossel, quarta 12:00 estático, sexta 18:00 carrossel. */
export const AGENDA_PADRAO: ItemAgenda[] = [
  { dia: 1, hora: "09:00", formato: "carrossel" }, { dia: 3, hora: "12:00", formato: "estatico" }, { dia: 5, hora: "18:00", formato: "carrossel" },
];

/** Pilar da vez: o primeiro nunca usado; senão o usado há mais tempo. `usados`: do post mais novo para o mais velho. */
export function proximoPilar(pilares: Pilar[], usados: (string | null)[]): Pilar | null {
  if (!pilares.length) return null;
  const nunca = pilares.find((p) => !usados.includes(p.nome));
  if (nunca) return nunca;
  return [...pilares].sort((a, b) => usados.indexOf(b.nome) - usados.indexOf(a.nome))[0];
}

/** Pilares dos n posts de uma semana, em rodízio a partir dos usados (mais recente primeiro). */
export function pilaresDaSemana(pilares: Pilar[], usados: (string | null)[], n: number): (string | null)[] {
  const fila = [...usados];
  return Array.from({ length: n }, () => {
    const p = proximoPilar(pilares, fila);
    if (p) fila.unshift(p.nome);
    return p?.nome ?? null;
  });
}

export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Segunda-feira (AAAA-MM-DD) da semana do dia dado. */
export function segundaDaSemana(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  return somarDias(dia, -((d.getUTCDay() + 6) % 7));
}

/** Instante UTC de um dia e hora de Brasília (UTC-3; sem horário de verão desde 2019). */
export function instanteBrasilia(dia: string, hora: string): string {
  return new Date(`${dia}T${hora}:00-03:00`).toISOString();
}

/** Posts da agenda na semana que começa na segunda `segunda`, em ordem de horário. */
export function postsDaSemana(segunda: string, agenda: ItemAgenda[], depoisDe = 0): { origem_data: string; agendado_para: string; formato: Formato }[] {
  return agenda
    .map((a) => {
      const dia = somarDias(segunda, (a.dia + 6) % 7);
      return { origem_data: dia, agendado_para: instanteBrasilia(dia, a.hora), formato: a.formato };
    })
    .filter((p) => Date.parse(p.agendado_para) > depoisDe)
    .sort((x, y) => x.agendado_para.localeCompare(y.agendado_para));
}

/** Só as entradas do Log (cabeçalhos "### AAAA-MM-DD") dos últimos `dias` dias até `hoje`. */
export function recortarLog(texto: string, hoje: string, dias = 60): string {
  const limite = somarDias(hoje, -dias);
  return texto
    .split(/^(?=### \d{4}-\d{2}-\d{2})/m)
    .filter((parte) => {
      const m = /^### (\d{4}-\d{2}-\d{2})/.exec(parte);
      return m !== null && m[1] >= limite;
    })
    .join("")
    .trim();
}

/** Contexto do cliente para a IA: nota central, Log recente e documentos, nessa ordem, até `limite` caracteres. */
/** Quanto esperar num 429 do Cloudflare: o limite por minuto do plano grátis (1 captura a cada 10 s) pede poucos segundos; espera até 3 vezes. 0 = desistir (limite longo). */
export function esperaDoCloudflare(retryAfter: string | null, tentativa: number): number {
  const s = Number(retryAfter);
  return tentativa < 3 && s > 0 && s <= 15 ? s * 1000 : 0;
}

export type NotaDoKit = "design_system" | "tom_de_voz" | "pilares" | "direcao_de_arte" | "padrao_de_imagem";

/** Nota do kit pelo nome do arquivo, ignorando hífen, espaço e acento ("R-Salon-Design-System.md"). */
export function notaDoKit(caminho: string): NotaDoKit | null {
  if (!caminho.toLowerCase().endsWith(".md")) return null;
  const n = normalizarNome(caminho.split("/").pop() ?? "");
  if (n.includes("designsystem")) return "design_system";
  if (n.includes("tomdevoz")) return "tom_de_voz";
  if (n.includes("pilar")) return "pilares";
  if (n.includes("direcaodearte")) return "direcao_de_arte";
  if (n.includes("padrao") && (n.includes("imagem") || n.includes("foto"))) return "padrao_de_imagem";
  return null;
}

/** Pilares da nota "Pilares de Conteúdo" do cofre: cada "## " é um pilar; a descrição é a linha "Descrição:" ou o primeiro parágrafo. Sem IA. */
export function pilaresDaNota(md: string): Pilar[] {
  const pilares: Pilar[] = [];
  for (const bloco of md.split(/^## /m).slice(1)) {
    const [titulo, ...resto] = bloco.split("\n");
    const nome = titulo.replace(/^(pilar\s*)?\d*\s*[:.)\-–]?\s*/i, "").trim();
    if (!nome || pilares.some((p) => p.nome.toLowerCase() === nome.toLowerCase())) continue;
    const linhas = resto.map((l) => l.trim()).filter(Boolean);
    const rotulada = linhas.find((l) => /^descri[cç][aã]o\s*:/i.test(l));
    const descricao = rotulada ? rotulada.replace(/^descri[cç][aã]o\s*:\s*/i, "") : linhas.find((l) => !/^[-*#>]|^\w[\w\s]*:\s*$/.test(l)) ?? "";
    pilares.push({ nome, descricao: descricao.trim() });
  }
  return pilares;
}

// Documentos que dizem quem é o cliente e o que ele vende vêm antes de dossiês, calendários e relatórios
const DOC_DO_NEGOCIO = ["pilar", "posicionamento", "contexto", "icp", "persona", "publico", "tomdevoz", "tema", "pauta", "preco", "tabela", "servico", "oferta", "produto", "direcaodearte", "designsystem", "marca", "briefing"];
const NOTA_MAX = 60_000;

/** Contexto do cliente para o Claude: notas da raiz, documentos do negócio, Log e o resto; cada nota até 60 mil caracteres. */
export function montarContexto(arquivos: { caminho: string; conteudo: string }[], limite = 250_000): string {
  const peso = (c: string) => {
    if (c === ARQUIVO_LOG) return 2;
    if (!c.includes("/")) return 0;
    const n = normalizarNome(c.split("/").pop() ?? "");
    return DOC_DO_NEGOCIO.some((k) => n.includes(k)) ? 1 : 3;
  };
  const ordem = arquivos.filter((a) => !a.caminho.startsWith("Anexos/") && !ehFonteDoCofre(a.caminho)).sort((a, b) => peso(a.caminho) - peso(b.caminho) || a.caminho.localeCompare(b.caminho));
  let saida = "";
  for (const a of ordem) {
    const texto = a.conteudo.trim();
    const bloco = `\n\n=== ${a.caminho} ===\n${texto.length > NOTA_MAX ? `${texto.slice(0, NOTA_MAX)}\n(nota cortada)` : texto}`;
    if (saida.length + bloco.length > limite) {
      saida += bloco.slice(0, Math.max(0, limite - saida.length));
      break;
    }
    saida += bloco;
  }
  return saida.trim();
}

/** O que o script do cofre envia e remove: arquivos novos ou com hash diferente; os que sumiram do cofre. */
export function mudancasCofre(locais: Record<string, string>, remotos: Record<string, string>): { enviar: string[]; remover: string[] } {
  return {
    enviar: Object.keys(locais).filter((c) => remotos[c] !== locais[c]).sort(),
    remover: Object.keys(remotos).filter((c) => !(c in locais)).sort(),
  };
}

/**
 * Aplica o pedido de mudança: só as lâminas tocadas perdem o JPG (são remontadas). Foto pedida numa lâmina de texto
 * troca o molde para foto. Lâmina inexistente é ignorada. Não altera as listas recebidas.
 */
export function aplicarAlteracoes(laminas: Lamina[], legenda: string, alteracoes: Alteracao[]): { laminas: Lamina[]; legenda: string; imagens: boolean } {
  const novas: Lamina[] = laminas.map((l) => ({ ...l, campos: { ...l.campos }, ...(l.imagem ? { imagem: { ...l.imagem } } : {}) }));
  let novaLegenda = legenda;
  let imagens = false;
  for (const a of alteracoes) {
    if (a.alvo === "legenda") {
      if (a.valor !== null) novaLegenda = a.valor;
      continue;
    }
    const l = a.lamina !== null ? novas[a.lamina - 1] : undefined;
    if (!l) continue;
    if (a.alvo === "campo" && a.campo && a.campo !== CAMPO_FOTO && a.valor !== null) l.campos[a.campo] = a.valor;
    else if (a.alvo === "imagem" && a.descricao) {
      if (l.molde === "texto") l.molde = "foto";
      l.imagem = { descricao: a.descricao, pasta_id: a.pasta_id, pendente: true };
      imagens = true;
    } else if (a.alvo === "layout" && a.ajuste_css !== null) l.ajuste_css = a.ajuste_css;
    else continue;
    l.jpg_chave = null;
  }
  return { laminas: novas, legenda: novaLegenda, imagens };
}

/** Último uso de cada foto do Drive nos posts dados (id da foto → data do post). */
export function usosDeFotos(posts: { created_at: string; laminas: Lamina[] }[]): Record<string, string> {
  const usos: Record<string, string> = {};
  for (const p of posts) {
    for (const l of p.laminas ?? []) {
      const id = l?.imagem?.drive_id;
      if (id && (!usos[id] || usos[id] < p.created_at)) usos[id] = p.created_at;
    }
  }
  return usos;
}

/** O que falta para o cliente gerar posts de um formato. */
export function faltaParaGerar(
  c: { pasta_cofre: string | null; ig_conta_id: string | null; logos: Logo[]; moldes: Moldes },
  formato: Formato,
): string[] {
  const falta: string[] = [];
  if (!c.ig_conta_id) falta.push("conta do Instagram");
  if (!c.pasta_cofre) falta.push("pasta do cofre");
  if (!c.logos.length) falta.push("logo");
  const uso = moldesEmUso(c.moldes);
  const sem = MOLDES_DO_FORMATO[formato].filter((t) => !uso[t]);
  if (sem.length) falta.push(`moldes aprovados (${sem.map((t) => ROTULO_MOLDE[t]).join(", ")})`);
  return falta;
}

/** Documento final para o navegador da Cloudflare: tamanho fixo, fontes, ajuste da lâmina e o aviso de pronto. */
export function htmlParaRender(html: string, o: { cssFontes: string; ajusteCss?: string }): string {
  const base = `<style>html,body{margin:0;padding:0;width:${LARGURA}px;height:${ALTURA}px;overflow:hidden}</style>`;
  const ajuste = o.ajusteCss ? `<style>${o.ajusteCss.replace(/<\/style/gi, "")}</style>` : "";
  const cabeca = `${base}<style>${o.cssFontes}</style>${ajuste}`;
  const pronto = `<script>Promise.all([document.fonts.ready,...Array.from(document.images).map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r}))]).then(()=>document.body.setAttribute("data-pronto","1"))</script>`;
  let doc = /<html[\s>]/i.test(html) ? html : `<!doctype html><html><head></head><body>${html}</body></html>`;
  doc = /<\/head>/i.test(doc) ? doc.replace(/<\/head>/i, () => `${cabeca}</head>`) : doc.replace(/<body[^>]*>/i, (m) => `${m}${cabeca}`);
  return /<\/body>/i.test(doc) ? doc.replace(/<\/body>/i, () => `${pronto}</body>`) : doc + pronto;
}

const FORMATO_FONTE: Record<string, [string, string]> = {
  woff2: ["font/woff2", "woff2"], woff: ["font/woff", "woff"], ttf: ["font/ttf", "truetype"], otf: ["font/otf", "opentype"],
};

export function extensaoFonte(chave: string): string | null {
  const e = (chave.split(".").pop() ?? "").toLowerCase();
  return e in FORMATO_FONTE ? e : null;
}

export function fontFace(familia: string, ext: string, base64: string, peso = 400): string {
  const [mime, formato] = FORMATO_FONTE[ext];
  return `@font-face{font-family:"${familia.replace(/["\\]/g, "")}";src:url(data:${mime};base64,${base64}) format("${formato}");font-weight:${peso};font-display:block}`;
}

/** Motivos para recusar o texto que a IA devolveu: estrutura, limites, legenda e, na saúde, as regras do CFM/CFO. */
export function motivosDoTexto(r: RespostaTexto, formato: Formato, c: { moldes: Moldes; saude: boolean }): string[] {
  const motivos = conferirEstrutura(formato, r.laminas.map((l) => l.molde));
  r.laminas.forEach((l, i) => {
    const m = c.moldes[l.molde];
    if (!m) {
      motivos.push(`lâmina ${i + 1}: molde ${l.molde} não existe`);
      return;
    }
    const valores = Object.fromEntries(l.campos.map((y) => [y.nome, y.valor]));
    for (const x of conferirCampos(m.campos, valores)) motivos.push(`lâmina ${i + 1}, ${x}`);
  });
  if (!r.legenda.trim()) motivos.push("legenda vazia");
  if (r.legenda.length > LEGENDA_MAX) motivos.push(`legenda com ${r.legenda.length} caracteres (máximo ${LEGENDA_MAX})`);
  if (c.saude) {
    const todo = [r.legenda, ...r.laminas.flatMap((l) => l.campos.map((x) => x.valor))].join("\n");
    motivos.push(...motivosSaude(todo).map((m) => `saúde: ${m}`));
  }
  return motivos;
}

/** Lâminas a partir da resposta da IA: molde com foto sempre ganha imagem pendente (descrição ou, na falta, o título). */
export function laminasDaResposta(r: RespostaTexto, moldes: Moldes): Lamina[] {
  const dois = (n: number) => String(n).padStart(2, "0");
  return r.laminas.map((l, i) => {
    const campos = Object.fromEntries(l.campos.map((x) => [x.nome, x.valor]));
    if (moldes[l.molde]?.campos.some((c) => c.nome === CAMPO_NUMERO)) campos[CAMPO_NUMERO] = `${dois(i + 1)}/${dois(r.laminas.length)}`;
    const temFoto = !!moldes[l.molde]?.campos.some((c) => c.tipo === "imagem");
    const lamina: Lamina = { molde: l.molde, campos, jpg_chave: null };
    if (temFoto) lamina.imagem = { descricao: l.imagem_descricao?.trim() || campos.titulo || "foto do negócio", pasta_id: l.pasta_id, pendente: true };
    return lamina;
  });
}

/** Molde `tipo` aprovado em nova versão: lâminas desse tipo que têm todos os textos e a foto que ele pede voltam a montar (numeração refeita); null = nada a remontar. */
export function remontarComMolde(laminas: Lamina[], tipo: TipoMolde, molde: Molde): Lamina[] | null {
  const textos = molde.campos.filter((c) => c.tipo === "texto" && c.nome !== CAMPO_NUMERO).map((c) => c.nome);
  const pedeFoto = molde.campos.some((c) => c.tipo === "imagem");
  const temNumero = molde.campos.some((c) => c.nome === CAMPO_NUMERO);
  let mudou = false;
  const novas = laminas.map((l, i) => {
    if (l.molde !== tipo || !textos.every((n) => (l.campos[n] ?? "").trim()) || (pedeFoto && !l.imagem?.chave)) return l;
    mudou = true;
    const campos = temNumero ? { ...l.campos, [CAMPO_NUMERO]: `${String(i + 1).padStart(2, "0")}/${String(laminas.length).padStart(2, "0")}` } : l.campos;
    return { ...l, campos, jpg_chave: null };
  });
  return mudou ? novas : null;
}
