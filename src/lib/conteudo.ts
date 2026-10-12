// Aba Conteúdo (spec docs/superpowers/specs/2026-10-12-conteudo-automatico-design.md): clientes ligados, posts, arquivos
// no R2 (módulo instagram, pasta conteudo/) e chamadas à função conteudo. As tabelas novas não estão no types.ts gerado.
import { supabase } from "@/integrations/supabase/client";
import { cabecalhosDeAcesso } from "@/lib/googleDrive";
import { normalizarFoto, normalizarLogo } from "@/lib/gmnImagem";
import { enviarR2 } from "@/lib/r2";
import {
  instanteBrasilia, remontarComMolde, somarDias, type Fonte, type Formato, type ItemAgenda, type Lamina, type Logo, type Molde, type Moldes,
  type PastaDrive, type Pilar, type StatusPost, type TipoMolde, type VarianteLogo,
} from "../../supabase/functions/conteudo/regras.ts";

export interface ClienteConteudo {
  id: string; cliente_id: string; pasta_cofre: string | null; ig_conta_id: string | null; ativo: boolean; oculto: boolean; logos: Logo[];
  tom_de_voz: string; design_system: string; fontes: Fonte[]; saude: boolean; ia_pode_pessoas: boolean; drive_url: string;
  drive_pastas: PastaDrive[]; pilares: Pilar[]; agenda: ItemAgenda[]; moldes: Moldes; created_at: string; updated_at: string;
  clientes: { nome: string } | null;
}
export interface PedidoMudanca { texto: string; em: string; resultado: string }
export interface PostConteudo {
  id: string; conteudo_cliente_id: string; formato: Formato; pilar: string | null; tema: string | null; agendado_para: string;
  origem_data: string | null; laminas: Lamina[]; legenda: string; pedidos: PedidoMudanca[]; status: StatusPost;
  processando_desde: string | null; erro_etapa: StatusPost | null; tentativas: number; erro: string | null; aviso: string | null;
  ig_post_id: string | null; created_at: string; updated_at: string;
}
export type CamposCliente = Partial<Omit<ClienteConteudo, "id" | "cliente_id" | "created_at" | "updated_at" | "clientes">>;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCAO = `${SUPABASE_URL}/functions/v1/conteudo`;
const clientesTab = () => supabase.from("conteudo_clientes" as any) as any;
const postsTab = () => supabase.from("conteudo_posts" as any) as any;

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(FUNCAO, { method: "POST", headers: await cabecalhosDeAcesso(), body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.erro ?? `A função conteudo respondeu ${r.status}.`);
  return j as T;
}

/** Endereço fixo de um arquivo do R2 (a função r2 redireciona para um link assinado). */
export const urlArquivo = (chave: string) => `${SUPABASE_URL}/functions/v1/r2?c=${encodeURIComponent(chave)}`;

export function haQuanto(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

// ------------------------------------------------------------------ clientes

export async function fetchClientes(): Promise<ClienteConteudo[]> {
  const { data, error } = await clientesTab().select("*, clientes(nome)").order("created_at");
  if (error) throw error;
  return (data ?? []) as ClienteConteudo[];
}

export async function ligarCliente(v: { cliente_id: string; pasta_cofre: string | null; ig_conta_id: string | null; ativo?: boolean }): Promise<void> {
  const { error } = await clientesTab().insert([v]);
  if (error) throw error;
}

export async function salvarCliente(id: string, campos: CamposCliente): Promise<void> {
  const { error } = await clientesTab().update({ ...campos, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function desligarCliente(id: string): Promise<void> {
  const { error } = await clientesTab().delete().eq("id", id);
  if (error) throw error;
}

/** Oculta ou mostra clientes: atualiza as linhas que já existem; ocultar cria a linha de quem ainda não tem. */
export async function ocultarClientes(ids: string[], oculto: boolean, linhas: ClienteConteudo[]): Promise<void> {
  const comLinha = new Set(linhas.map((l) => l.cliente_id));
  const existentes = ids.filter((id) => comLinha.has(id));
  const novos = ids.filter((id) => !comLinha.has(id));
  if (existentes.length) {
    const { error } = await clientesTab().update({ oculto, updated_at: new Date().toISOString() }).in("cliente_id", existentes);
    if (error) throw error;
  }
  if (oculto && novos.length) {
    const { error } = await clientesTab().insert(novos.map((cliente_id) => ({ cliente_id, oculto: true })));
    if (error) throw error;
  }
}

async function medidas(b: Blob): Promise<{ largura: number; altura: number }> {
  const img = await createImageBitmap(b);
  const m = { largura: img.width, altura: img.height };
  img.close();
  return m;
}

export async function enviarLogo(clienteId: string, variante: VarianteLogo, arquivo: File): Promise<Logo> {
  const png = await normalizarLogo(arquivo);
  const caminho = `conteudo/logos/${clienteId}-${variante}-${Date.now()}.png`;
  await enviarR2("instagram", caminho, png, "image/png");
  return { variante, chave: `instagram/${caminho}`, ...(await medidas(png)) };
}

export async function enviarFonte(clienteId: string, arquivo: File, familia: string, peso: number): Promise<Fonte> {
  const ext = (arquivo.name.split(".").pop() ?? "").toLowerCase();
  if (!["woff2", "woff", "ttf", "otf"].includes(ext)) throw new Error("Envie a fonte em WOFF2, WOFF, TTF ou OTF.");
  const caminho = `conteudo/fontes/${clienteId}-${Date.now()}.${ext}`;
  await enviarR2("instagram", caminho, arquivo, arquivo.type || `font/${ext}`);
  return { familia: familia.trim(), origem: "arquivo", chave: `instagram/${caminho}`, peso };
}

// ------------------------------------------------------------------ cofre e Drive

export const cofrePastas = () => chamar<{ pastas: string[]; sincronizado_em: string | null }>({ acao: "cofre_ler" });
export const cofreArquivos = (pasta: string) =>
  chamar<{ arquivos: { caminho: string; conteudo: string }[]; total: number; sincronizado_em: string | null }>({ acao: "cofre_ler", pasta });
export const lerPastasDrive = (clienteId: string) => chamar<{ pastas: PastaDrive[] }>({ acao: "drive_pastas", cliente_id: clienteId });
export const pilaresDoCofre = (clienteId: string) =>
  chamar<{ pilares: Pilar[]; origem: "nota" | "ia"; nota: string | null }>({ acao: "pilares_do_cofre", cliente_id: clienteId });

/** Com soFontes, o servidor devolve só `kit.fontes` e `kit.avisos`. */
export const kitDoCofre = (clienteId: string, soFontes = false) =>
  chamar<{ kit: { fontes: number; logos?: number; pilares?: number; conta?: boolean; drive?: boolean; avisos: string[] } }>({ acao: "kit_do_cofre", cliente_id: clienteId, so_fontes: soFontes });

// ------------------------------------------------------------------ moldes

export const criarMolde = (clienteId: string, tipo: TipoMolde) => chamar<{ molde: Molde }>({ acao: "molde", cliente_id: clienteId, tipo });
export const ajustarMolde = (clienteId: string, tipo: TipoMolde, pedido: string) =>
  chamar<{ molde: Molde }>({ acao: "molde_ajustar", cliente_id: clienteId, tipo, pedido });

async function moldesAtuais(clienteId: string): Promise<Moldes> {
  const { data, error } = await clientesTab().select("moldes").eq("id", clienteId).single();
  if (error) throw error;
  return (data?.moldes ?? {}) as Moldes;
}

/** Aprova o molde e remonta com ele os posts do cliente que ainda esperam aprovação. Devolve quantos posts vão remontar. */
export async function aprovarMolde(clienteId: string, tipo: TipoMolde): Promise<number> {
  const moldes = await moldesAtuais(clienteId);
  const m = moldes[tipo];
  if (!m) throw new Error("O molde não existe mais.");
  await salvarCliente(clienteId, { moldes: { ...moldes, [tipo]: { ...m, aprovado_em: new Date().toISOString() } } });
  const { data, error } = await postsTab().select("id, laminas").eq("conteudo_cliente_id", clienteId).eq("status", "aguardando");
  if (error) throw error;
  let remontados = 0;
  for (const p of data ?? []) {
    const laminas = remontarComMolde(p.laminas as Lamina[], tipo, m);
    if (!laminas) continue;
    // Post mexido em outra aba nesse meio tempo fica como está
    await mudarSe(p.id, "aguardando", { laminas, status: "montando" }).then(() => remontados++, () => {});
  }
  if (remontados) avancarFila();
  return remontados;
}

/** O ajuste de layout de uma lâmina passa a valer no molde (próximos posts). O molde segue aprovado. */
export async function usarAjusteNoMolde(clienteId: string, tipo: TipoMolde, css: string): Promise<void> {
  const moldes = await moldesAtuais(clienteId);
  const m = moldes[tipo];
  if (!m) throw new Error("O molde não existe mais.");
  const estilo = `<style>${css.replace(/<\/style/gi, "")}</style>`;
  const html = /<\/head>/i.test(m.html) ? m.html.replace(/<\/head>/i, () => `${estilo}</head>`) : estilo + m.html;
  await salvarCliente(clienteId, { moldes: { ...moldes, [tipo]: { ...m, html, versao: m.versao + 1 } } });
}

// ------------------------------------------------------------------ posts

/** Pede à função para avançar a fila agora, sem esperar o relógio (a ação passo é aberta). */
export function avancarFila(): void {
  fetch(FUNCAO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "passo" }) }).catch(() => {});
}

export async function gerarSemana(segunda: string, clienteId?: string): Promise<{ criados: number; pulados: { cliente: string; motivo: string }[]; clientes: number }> {
  const r = await chamar<{ criados: number; pulados: { cliente: string; motivo: string }[]; clientes: number }>({ acao: "semana", segunda, cliente_id: clienteId ?? null });
  if (r.criados) avancarFila();
  return r;
}

export async function novoPost(v: { conteudo_cliente_id: string; formato: Formato; agendado_para: string }): Promise<void> {
  const { error } = await postsTab().insert([{ ...v, status: "texto" }]);
  if (error) throw error;
  avancarFila();
}

export async function fetchPostsDaSemana(segunda: string): Promise<PostConteudo[]> {
  const { data, error } = await postsTab().select("*")
    .gte("agendado_para", instanteBrasilia(segunda, "00:00")).lt("agendado_para", instanteBrasilia(somarDias(segunda, 7), "00:00"))
    .neq("status", "descartado").order("agendado_para");
  if (error) throw error;
  return (data ?? []) as PostConteudo[];
}

export async function pedirMudanca(postId: string, pedido: string): Promise<{ resposta: string; status: string }> {
  const r = await chamar<{ resposta: string; status: string }>({ acao: "ajustar", post_id: postId, pedido });
  if (r.status !== "aguardando") avancarFila();
  return r;
}

export async function aprovarPost(postId: string, quando: string): Promise<void> {
  const { error } = await (supabase.rpc as any)("conteudo_aprovar", { p_post: postId, p_quando: quando });
  if (error) throw new Error(error.message);
}

/** Muda o post só se ele ainda estiver em `de` (outra aba ou a fila podem ter mexido nele). */
async function mudarSe(id: string, de: StatusPost, campos: Record<string, unknown>): Promise<void> {
  const { data, error } = await postsTab().update({ ...campos, updated_at: new Date().toISOString() }).eq("id", id).eq("status", de).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("O post mudou enquanto você mexia nele; abra de novo.");
}

export const descartarPost = (id: string) => mudarSe(id, "aguardando", { status: "descartado" });
export const trocarData = (id: string, quando: string) => mudarSe(id, "aguardando", { agendado_para: quando });

export async function trocarFormato(post: PostConteudo, formato: Formato): Promise<void> {
  await mudarSe(post.id, "aguardando", { formato, laminas: [], status: "texto", tentativas: 0, erro: null, aviso: null });
  avancarFila();
}

/** Textos editados à mão: só as lâminas com texto diferente são remontadas; mudar só a legenda não remonta nada. */
export async function salvarTextos(post: PostConteudo, laminas: Lamina[], legenda: string): Promise<void> {
  const novas = laminas.map((l, i) => (JSON.stringify(l.campos) !== JSON.stringify(post.laminas[i]?.campos) ? { ...l, jpg_chave: null } : l));
  const remontar = novas.some((l) => !l.jpg_chave);
  await mudarSe(post.id, "aguardando", { laminas: novas, legenda, ...(remontar ? { status: "montando" } : {}) });
  if (remontar) avancarFila();
}

export async function trocarFoto(post: PostConteudo, indice: number, arquivo: File): Promise<void> {
  const jpg = await normalizarFoto(arquivo);
  const caminho = `conteudo/fotos/envio-${crypto.randomUUID()}.jpg`;
  await enviarR2("instagram", caminho, jpg, "image/jpeg");
  const laminas = post.laminas.map((l, i) => (i !== indice ? l : {
    ...l, molde: l.molde === "texto" ? "foto" : l.molde,
    imagem: { descricao: l.imagem?.descricao ?? "", origem: "envio" as const, chave: `instagram/${caminho}` }, jpg_chave: null,
  }));
  await mudarSe(post.id, "aguardando", { laminas, status: "montando" });
  avancarFila();
}

export async function tentarDeNovo(post: PostConteudo): Promise<void> {
  await mudarSe(post.id, "erro", { status: post.erro_etapa ?? "texto", erro: null, tentativas: 0, processando_desde: null });
  avancarFila();
}
