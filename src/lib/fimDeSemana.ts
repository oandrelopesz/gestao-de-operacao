// Coluna "Fazer no fim de semana": no quadro ela vira duas seções de drag-and-drop (Sábado e
// Domingo). Aqui fica a tradução entre o que o banco guarda (status + dia_fim_de_semana) e o
// container do dnd-kit. Fora da coluna o card não tem dia.
export const COLUNA_FDS = "fazer_fim_de_semana";
export type DiaFds = "sabado" | "domingo";
export const DIAS_FDS: DiaFds[] = ["sabado", "domingo"];
export const ROTULO_DIA: Record<DiaFds, string> = { sabado: "Sábado", domingo: "Domingo" };

export interface ItemFds {
  id: string;
  status: string;
  ordem?: number | null;
  dia_fim_de_semana?: string | null;
}

const PREFIXO = `${COLUNA_FDS}:`;

export const secaoFds = (dia: DiaFds) => `${PREFIXO}${dia}`;
export const ehSecaoFds = (container: string) => container.startsWith(PREFIXO);
export const diaDaSecao = (container: string): DiaFds => (container === secaoFds("domingo") ? "domingo" : "sabado");

const diaDe = (d: ItemFds): DiaFds => (d.dia_fim_de_semana === "domingo" ? "domingo" : "sabado");

export function containerIdsDoQuadro(colunas: string[]): string[] {
  return colunas.flatMap((c) => (c === COLUNA_FDS ? DIAS_FDS.map(secaoFds) : [c]));
}

export function containerDe(d: ItemFds): string {
  return d.status === COLUNA_FDS ? secaoFds(diaDe(d)) : d.status;
}

export function aplicarContainer<T extends ItemFds>(d: T, container: string): T {
  if (ehSecaoFds(container)) return { ...d, status: COLUNA_FDS, dia_fim_de_semana: diaDaSecao(container) };
  return { ...d, status: container, dia_fim_de_semana: null };
}

const porOrdem = (a: ItemFds, b: ItemFds) => (a.ordem ?? 0) - (b.ordem ?? 0);

/** Leva o card para o fim do `dia` e renumera as duas seções. Já estando nele, devolve a mesma lista. */
export function moverParaDia<T extends ItemFds>(lista: T[], id: string, dia: DiaFds): T[] {
  const card = lista.find((d) => d.id === id);
  if (!card || containerDe(card) === secaoFds(dia)) return lista;
  const origem = containerDe(card);
  const destino = secaoFds(dia);
  const ordem = new Map<string, number>();
  lista.filter((d) => d.id !== id && containerDe(d) === origem).sort(porOrdem).forEach((d, i) => ordem.set(d.id, i));
  const doDia = lista.filter((d) => d.id !== id && containerDe(d) === destino).sort(porOrdem);
  doDia.forEach((d, i) => ordem.set(d.id, i));
  ordem.set(id, doDia.length);
  return lista.map((d) => {
    const base = d.id === id ? aplicarContainer(d, destino) : d;
    return ordem.has(d.id) ? { ...base, ordem: ordem.get(d.id) } : base;
  });
}

export function camposParaSalvar(d: ItemFds) {
  return {
    status: d.status,
    ordem: d.ordem ?? 0,
    dia_fim_de_semana: d.status === COLUNA_FDS ? diaDe(d) : null,
  };
}
