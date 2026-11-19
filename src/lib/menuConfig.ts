// Menu lateral configurável pelo Admin: esconder abas e mudar a ordem dentro de cada grupo.
export interface MenuConfig { ocultas: string[]; ordem: Record<string, string[]> }

/** Demandas e Admin nunca somem do menu. */
export const MENU_FIXOS = ["/", "/admin"];

/** Abas que mudaram de endereço: a ordem e o "oculta" salvos com o endereço antigo continuam valendo. */
const ENDERECOS_ANTIGOS: Record<string, string> = { "/pdfs": "/arquivos", "/prospeccao": "/crm" };

export function normalizarMenu(cfg: MenuConfig | null): MenuConfig | null {
  if (!cfg) return cfg;
  const novo = (to: string) => ENDERECOS_ANTIGOS[to] ?? to;
  const semRepetir = (lista: string[]) => [...new Set(lista.map(novo))];
  return {
    ocultas: semRepetir(cfg.ocultas ?? []),
    ordem: Object.fromEntries(Object.entries(cfg.ordem ?? {}).map(([g, tos]) => [g, semRepetir(tos)])),
  };
}

export function aplicarMenu<L extends { to: string }>(
  grupos: { title: string; links: L[] }[],
  cfgBruta: MenuConfig | null,
): { title: string; links: L[] }[] {
  const cfg = normalizarMenu(cfgBruta);
  if (!cfg) return grupos;
  return grupos
    .map((g) => {
      const visiveis = g.links.filter((l) => MENU_FIXOS.includes(l.to) || !cfg.ocultas.includes(l.to));
      const ordem = cfg.ordem[g.title] ?? [];
      const pos = (to: string) => { const i = ordem.indexOf(to); return i < 0 ? ordem.length + g.links.findIndex((l) => l.to === to) : i; };
      return { title: g.title, links: [...visiveis].sort((a, b) => pos(a.to) - pos(b.to)) };
    })
    .filter((g) => g.links.length > 0);
}

/** Menu das aparências Painel e Editorial (a Clássica segue com os grupos do NAV_GROUPS). */
export const GRUPOS_NOVOS: { title: string; tos: string[] }[] = [
  { title: "Hoje", tos: ["/hoje", "/", "/agenda", "/dashboard"] },
  { title: "Clientes", tos: ["/clientes", "/onboarding", "/roadmap", "/saldo", "/nps", "/dados-internos", "/acessos", "/central", "/fireflies"] },
  { title: "Marketing e canais", tos: ["/instagram", "/conteudo", "/gmn", "/swipe", "/utm", "/transcritor"] },
  { title: "Comercial e dinheiro", tos: ["/crm", "/financeiro", "/taxas"] },
  { title: "Meu cérebro", tos: ["/notas", "/ideias", "/links", "/arquivos", "/fluxogramas", "/cursos", "/livros", "/habilidades", "/radar", "/ver-depois"] },
  { title: "Sistema", tos: ["/admin"] },
];

/** Redistribui os grupos já filtrados/ordenados pelo Admin nos grupos novos. Aba que não estiver
 *  no GRUPOS_NOVOS (aba criada depois) cai no último grupo, para nunca sumir do menu. */
export function reagrupar<L extends { to: string }>(grupos: { title: string; links: L[] }[], extras: L[] = []): { title: string; links: L[] }[] {
  const todos = [...extras, ...grupos.flatMap((g) => g.links)];
  const porTo = new Map(todos.map((l) => [l.to, l]));
  const usados = new Set(GRUPOS_NOVOS.flatMap((g) => g.tos));
  const sobras = todos.filter((l) => !usados.has(l.to));
  return GRUPOS_NOVOS.map((g, i) => ({
    title: g.title,
    links: [...g.tos.flatMap((to) => porTo.get(to) ?? []), ...(i === GRUPOS_NOVOS.length - 1 ? sobras : [])],
  })).filter((g) => g.links.length > 0);
}

export function moverNoGrupo(cfg: MenuConfig, grupo: string, tos: string[], to: string, delta: -1 | 1): MenuConfig {
  const lista = [...tos];
  const i = lista.indexOf(to);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= lista.length) return { ...cfg, ordem: { ...cfg.ordem, [grupo]: lista } };
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return { ...cfg, ordem: { ...cfg.ordem, [grupo]: lista } };
}

export function alternarOculta(cfg: MenuConfig, to: string): MenuConfig {
  if (MENU_FIXOS.includes(to)) return cfg;
  const ocultas = cfg.ocultas.includes(to) ? cfg.ocultas.filter((x) => x !== to) : [...cfg.ocultas, to];
  return { ...cfg, ocultas };
}
