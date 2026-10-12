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
export interface Fonte { familia: string; origem: "google" | "arquivo"; chave?: string; peso?: number }
export interface Pilar { nome: string; descricao: string }
/** dia: 0 = domingo ... 6 = sábado (como no GMN); hora "HH:MM" de Brasília. */
export interface ItemAgenda { dia: number; hora: string; formato: Formato }
export interface PastaDrive { id: string; caminho: string; quantidade: number }
export interface CampoMolde { nome: string; tipo: "texto" | "imagem" | "logo"; max: number; exemplo: string }
export interface Molde { html: string; campos: CampoMolde[]; versao: number; aprovado_em: string | null; previa_chave: string | null }
export type Moldes = Partial<Record<TipoMolde, Molde>>;
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
  `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGURA}" height="${ALTURA}"><rect width="100%" height="100%" fill="#9ca3af"/><text x="50%" y="50%" font-family="sans-serif" font-size="64" fill="#f3f4f6" text-anchor="middle">foto</text></svg>`,
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
    const v = valores[nome] ?? "";
    const tipo = tipos.get(nome) ?? (NOME_LOGO.test(nome) ? "logo" : "texto");
    if (tipo === "texto") return escaparHtml(v).replace(/\r?\n/g, "<br>");
    return /^(data:image\/|https:\/\/)/.test(v) ? escaparHtml(v) : "";
  });
}

/** Motivos para recusar os textos de uma lâmina: campo de texto vazio ou acima do limite do molde. */
export function conferirCampos(campos: CampoMolde[], valores: Record<string, string>): string[] {
  const motivos: string[] = [];
  for (const c of campos) {
    if (c.tipo !== "texto") continue;
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

/** Pilar da vez: o primeiro nunca usado; senão o usado há mais tempo. `usados`: do post mais novo para o mais velho. */
export function proximoPilar(pilares: Pilar[], usados: (string | null)[]): Pilar | null {
  if (!pilares.length) return null;
  const nunca = pilares.find((p) => !usados.includes(p.nome));
  if (nunca) return nunca;
  return [...pilares].sort((a, b) => usados.indexOf(b.nome) - usados.indexOf(a.nome))[0];
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
export function postsDaSemana(segunda: string, agenda: ItemAgenda[]): { origem_data: string; agendado_para: string; formato: Formato }[] {
  return agenda
    .map((a) => {
      const dia = somarDias(segunda, (a.dia + 6) % 7);
      return { origem_data: dia, agendado_para: instanteBrasilia(dia, a.hora), formato: a.formato };
    })
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
export function montarContexto(arquivos: { caminho: string; conteudo: string }[], limite = 100_000): string {
  const peso = (c: string) => (c === ARQUIVO_LOG ? 1 : c.includes("/") ? 2 : 0);
  const ordem = [...arquivos].sort((a, b) => peso(a.caminho) - peso(b.caminho) || a.caminho.localeCompare(b.caminho));
  let saida = "";
  for (const a of ordem) {
    const bloco = `\n\n=== ${a.caminho} ===\n${a.conteudo.trim()}`;
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
  const sem = MOLDES_DO_FORMATO[formato].filter((t) => !c.moldes[t]?.aprovado_em);
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
  doc = /<\/head>/i.test(doc) ? doc.replace(/<\/head>/i, `${cabeca}</head>`) : doc.replace(/<body[^>]*>/i, (m) => `${m}${cabeca}`);
  return /<\/body>/i.test(doc) ? doc.replace(/<\/body>/i, `${pronto}</body>`) : doc + pronto;
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
  return r.laminas.map((l) => {
    const campos = Object.fromEntries(l.campos.map((x) => [x.nome, x.valor]));
    const temFoto = !!moldes[l.molde]?.campos.some((c) => c.tipo === "imagem");
    const lamina: Lamina = { molde: l.molde, campos, jpg_chave: null };
    if (temFoto) lamina.imagem = { descricao: l.imagem_descricao?.trim() || campos.titulo || "foto do negócio", pasta_id: l.pasta_id, pendente: true };
    return lamina;
  });
}
