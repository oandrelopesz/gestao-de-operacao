// Menu lateral configurável pelo Admin: esconder abas e mudar a ordem dentro de cada grupo.
export interface MenuConfig { ocultas: string[]; ordem: Record<string, string[]> }

/** Demandas e Admin nunca somem do menu. */
export const MENU_FIXOS = ["/", "/admin"];

/** Abas que mudaram de endereço: a ordem e o "oculta" salvos com o endereço antigo continuam valendo. */
const ENDERECOS_ANTIGOS: Record<string, string> = { "/pdfs": "/arquivos" };

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
