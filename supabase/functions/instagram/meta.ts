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

/** Mensagem em português para uma resposta de erro da Graph API. */
export function erroMeta(corpo: any, status: number): string {
  const e = corpo?.error;
  if (!e) return `A Meta respondeu ${status}.`;
  if (e.code === 190) return "O token da Meta (META_TOKEN) é inválido ou expirou. Gere outro no usuário do sistema e troque o segredo no Lovable.";
  if (e.code === 10 || e.code === 200) return `Sem permissão na Meta: ${e.message}`;
  return `Meta: ${e.message ?? "erro"} (código ${e.code ?? "?"})`;
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
