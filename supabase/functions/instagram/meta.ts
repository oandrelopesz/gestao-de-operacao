// Graph API da Meta, usada só pela função instagram (o token vem do segredo META_TOKEN, nunca do navegador).
// deno-lint-ignore-file no-explicit-any

// ponytail: versão fixa da Graph API; trocar quando a Meta avisar que ela vai sair (cada versão dura cerca de 2 anos).
export const GRAPH = "https://graph.facebook.com/v23.0";

export interface PaginaMeta {
  id: string;
  name?: string;
  location?: { street?: string; city?: string } | null;
  instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string } | null;
}

export interface ContaIg {
  id: string;
  usuario: string;
  nome: string;
  foto_url: string | null;
  pagina_id: string;
  /** A página tem endereço: pode servir de localização dos posts */
  pagina_tem_local: boolean;
}

/** Contas de Instagram das páginas que o token enxerga. Página sem Instagram ligado fica de fora; conta repetida entra uma vez. */
export function contasDasPaginas(paginas: PaginaMeta[]): ContaIg[] {
  const vistas = new Set<string>();
  const saida: ContaIg[] = [];
  for (const p of paginas) {
    const ig = p.instagram_business_account;
    if (!ig?.id || vistas.has(ig.id)) continue;
    vistas.add(ig.id);
    saida.push({
      id: ig.id,
      usuario: ig.username ?? "",
      nome: ig.name || p.name || ig.username || ig.id,
      foto_url: ig.profile_picture_url ?? null,
      pagina_id: p.id,
      pagina_tem_local: !!(p.location && (p.location.street || p.location.city)),
    });
  }
  return saida;
}

// ------------------------------------------------------------------ posts

/** Pessoa marcada na imagem; x e y de 0 a 1 a partir do canto de cima à esquerda. */
export type Marcacao = { usuario: string; x: number; y: number };

export type Midia = {
  chave: string;
  tipo: "imagem" | "video";
  largura: number;
  altura: number;
  duracao?: number;
  alt_text?: string;
  marcacoes?: Marcacao[];
};

/** Opções avançadas do post (coluna `opcoes`). */
export interface OpcoesPost {
  comentarios_desativados?: boolean;
  colaboradores?: string[];
  capa_chave?: string; // imagem de capa do reels, no R2
  audio_nome?: string;
}

export interface PostIg {
  tipo: "foto" | "carrossel" | "reels" | "story";
  midias: Midia[];
  legenda: string;
  local_id: string | null;
  reels_no_feed: boolean;
  capa_ms: number | null;
  opcoes?: OpcoesPost | null;
}

export interface StatusContainer { status_code?: string; status?: string }

type Params = Record<string, string>;
/** Só entra no objeto quando há valor. */
const se = (cond: unknown, o: Params): Params => (cond ? o : {});
const comuns = (p: PostIg): Params => ({ ...(p.legenda ? { caption: p.legenda } : {}), ...(p.local_id ? { location_id: p.local_id } : {}) });
const alt = (m: Midia): Params => (m.tipo === "imagem" && m.alt_text ? { alt_text: m.alt_text } : {});
const marcacoes = (m: Midia): Params => (m.marcacoes?.length
  ? { user_tags: JSON.stringify(m.marcacoes.map((t) => ({ username: t.usuario, x: t.x, y: t.y }))) }
  : {});
const colaboradores = (p: PostIg): Params => (p.opcoes?.colaboradores?.length ? { collaborators: JSON.stringify(p.opcoes.colaboradores) } : {});

/** Contêiner de um item do carrossel (texto alternativo e marcações só nas imagens). */
export const paramsFilho = (m: Midia, url: string): Record<string, string> =>
  m.tipo === "video"
    ? { media_type: "VIDEO", video_url: url, is_carousel_item: "true" }
    : { image_url: url, is_carousel_item: "true", ...alt(m), ...marcacoes(m) };

/** Contêiner de foto, reels ou story. `capaUrl`: link da imagem de capa do reels (tem prioridade sobre o quadro). */
export function paramsUnico(p: PostIg, url: string, capaUrl?: string): Record<string, string> {
  const m = p.midias[0];
  if (p.tipo === "story") {
    const midia: Params = m?.tipo === "video" ? { video_url: url } : { image_url: url };
    return { media_type: "STORIES", ...midia, ...(m ? marcacoes(m) : {}) };
  }
  if (p.tipo === "reels") {
    return {
      ...comuns(p), media_type: "REELS", video_url: url, share_to_feed: String(p.reels_no_feed),
      ...(capaUrl ? { cover_url: capaUrl } : se(p.capa_ms != null, { thumb_offset: String(p.capa_ms) })),
      ...se(p.opcoes?.audio_nome, { audio_name: p.opcoes?.audio_nome ?? "" }),
      ...colaboradores(p),
    };
  }
  return { ...comuns(p), image_url: url, ...(m ? alt(m) : {}), ...(m ? marcacoes(m) : {}), ...colaboradores(p) };
}

/** Contêiner principal do carrossel, criado depois que os filhos ficaram prontos. */
export const paramsCarrossel = (p: PostIg, filhos: string[]): Record<string, string> =>
  ({ ...comuns(p), media_type: "CAROUSEL", children: filhos.join(","), ...colaboradores(p) });

// ------------------------------------------------------------------ Facebook (página ligada à conta)

const mensagem = (p: PostIg): Params => (p.legenda ? { message: p.legenda } : {});
/** Foto publicada direto (`POST /{pagina}/photos`). */
export const fbFoto = (p: PostIg, url: string): Record<string, string> => ({ url, ...mensagem(p) });
/** Foto enviada sem publicar, para entrar num álbum. */
export const fbFotoSolta = (url: string): Record<string, string> => ({ url, published: "false" });
/** Post com várias fotos (`POST /{pagina}/feed`). */
export const fbAlbum = (p: PostIg, ids: string[]): Record<string, string> =>
  ({ ...mensagem(p), ...Object.fromEntries(ids.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })])) });
/** Vídeo normal da página (`POST /{pagina}/videos`). */
export const fbVideo = (p: PostIg, url: string): Record<string, string> => ({ file_url: url, ...se(p.legenda, { description: p.legenda }) });
/** O `permalink_url` do Facebook às vezes vem sem o domínio. */
export const linkFacebook = (link?: string | null): string | null =>
  !link ? null : /^https?:\/\//.test(link) ? link : `https://www.facebook.com${link.startsWith("/") ? "" : "/"}${link}`;

/** Id ou nome de usuário da página a partir do que foi colado (id, link da página, profile.php, /pages/ ou /people/). */
export function refDaPagina(texto: string): string | null {
  const t = texto.trim();
  if (/^\d{5,}$/.test(t)) return t;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  if (!/(^|\.)facebook\.com$/.test(url.hostname)) return null;
  const id = url.searchParams.get("id");
  if (id && /^\d+$/.test(id)) return id;
  const partes = url.pathname.split("/").filter(Boolean);
  if ((partes[0] === "pages" || partes[0] === "people") && partes.length >= 3 && /^\d+$/.test(partes[2])) return partes[2];
  return partes[0] && partes[0] !== "profile.php" && /^[\w.-]+$/.test(partes[0]) ? partes[0] : null;
}

/** Subcódigos de erro da publicação de conteúdo, em português. */
const SUBCODIGOS: Record<number, string> = {
  2207001: "O Instagram teve um erro temporário. Clique em Tentar de novo.",
  2207003: "A Meta demorou demais para baixar o arquivo. Clique em Tentar de novo.",
  2207004: "A imagem passou de 8 MB.",
  2207005: "Formato de imagem não aceito: o Instagram só aceita JPG.",
  2207009: "Proporção não aceita: o feed aceita de 4:5 (em pé) a 1,91:1 (deitada).",
  2207026: "Vídeo em formato não aceito: use MP4 ou MOV (H.264 e AAC).",
  2207042: "Esta conta atingiu o limite diário de posts pela API (100 em 24 horas).",
  2207052: "A Meta não conseguiu baixar o arquivo do sistema. Clique em Tentar de novo.",
};

export function erroDoContainer(s: StatusContainer): string {
  if (s.status_code === "EXPIRED") return "O envio expirou na Meta (24 h sem publicar). Clique em Tentar de novo.";
  const codigo = Number(/(\d{7})/.exec(s.status ?? "")?.[1]);
  return SUBCODIGOS[codigo] ?? `A Meta recusou a mídia: ${s.status ?? "sem detalhe"}`;
}

/** Próximo passo de um post em processamento, pelo status dos contêineres na Meta. */
export function decidir(filhos: StatusContainer[], principal: StatusContainer | null) {
  const ruim = [...filhos, ...(principal ? [principal] : [])].find((s) => s.status_code === "ERROR" || s.status_code === "EXPIRED");
  if (ruim) return { acao: "erro" as const, erro: erroDoContainer(ruim) };
  if (filhos.some((s) => s.status_code !== "FINISHED")) return { acao: "esperar" as const };
  if (!principal) return { acao: "criar_carrossel" as const };
  return principal.status_code === "FINISHED" ? { acao: "publicar" as const } : { acao: "esperar" as const };
}

// ------------------------------------------------------------------ chamadas

/** Mensagem em português para uma resposta de erro da Graph API. */
export function erroMeta(corpo: any, status: number): string {
  const e = corpo?.error;
  if (!e) return `A Meta respondeu ${status}.`;
  if (e.code === 190) return "O token da Meta (META_TOKEN) é inválido ou expirou. Gere outro no usuário do sistema e troque o segredo no Lovable.";
  if (SUBCODIGOS[e.error_subcode]) return SUBCODIGOS[e.error_subcode];
  if (e.code === 10 || e.code === 200) return `Sem permissão na Meta: ${e.message}${e.error_subcode ? ` (subcódigo ${e.error_subcode})` : ""}`;
  if (e.code === 4 || e.code === 32 || e.code === 613) return "Muitas chamadas à Meta agora. Clique em Tentar de novo daqui a alguns minutos.";
  return `Meta: ${e.error_user_msg || e.message || "erro"} (código ${e.code ?? "?"})`;
}

/** Uma chamada à Graph API (GET/DELETE com parâmetros na URL, POST com corpo de formulário). Erro vira mensagem em português. */
export async function graph(metodo: "GET" | "POST" | "DELETE", caminho: string, token: string, params: Record<string, string> = {}): Promise<any> {
  const corpo = new URLSearchParams({ ...params, access_token: token });
  const r = metodo === "POST"
    ? await fetch(`${GRAPH}/${caminho}`, { method: "POST", body: corpo, signal: AbortSignal.timeout(60_000) })
    : await fetch(`${GRAPH}/${caminho}?${corpo}`, { method: metodo, signal: AbortSignal.timeout(30_000) });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.error) throw new Error(erroMeta(j, r.status));
  return j;
}

/** GET na Graph API juntando todas as páginas de resultado (`paging.next`). Prazo de 20 s por chamada. */
export async function listarTudo(url: string): Promise<any[]> {
  const itens: any[] = [];
  let proxima: string | undefined = url;
  for (let i = 0; proxima && i < 20; i++) {
    const r: Response = await fetch(proxima, { signal: AbortSignal.timeout(20_000) });
    const corpo = await r.json().catch(() => null);
    if (!r.ok) throw new Error(erroMeta(corpo, r.status));
    itens.push(...(corpo?.data ?? []));
    proxima = corpo?.paging?.next;
  }
  return itens;
}
