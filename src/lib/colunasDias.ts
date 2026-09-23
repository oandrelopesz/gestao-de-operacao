// Colunas do Kanban "por dias da semana" (ex.: Fazer no fim de semana = sábado e domingo). No quadro,
// cada dia vira uma seção de drag-and-drop com id "coluna:dia". Aqui fica a tradução entre o banco
// (status + dia_semana, 0 = domingo … 6 = sábado) e esses containers.
export const NOMES_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const NOMES_DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function rotuloFazerNoDia(dia: number): string {
  const nome = NOMES_DIA[dia].toLowerCase();
  return dia === 0 || dia === 6 ? `Fazer no ${nome}` : `Fazer na ${nome}`;
}

export type MapaDias = Record<string, number[]>;

export interface ItemDia {
  id: string;
  status: string;
  ordem?: number | null;
  dia_semana?: number | null;
}

export const secaoId = (coluna: string, dia: number) => `${coluna}:${dia}`;

export function parseSecao(container: string): { coluna: string; dia: number } | null {
  const m = /^(.+):([0-6])$/.exec(container);
  return m ? { coluna: m[1], dia: Number(m[2]) } : null;
}

export function mapaDias(colunas: { id: string; dias: number[] }[]): MapaDias {
  const mapa: MapaDias = {};
  for (const c of colunas) if (c.dias.length) mapa[c.id] = c.dias;
  return mapa;
}

export function containerIdsDoQuadro(colunas: { id: string; dias: number[] }[]): string[] {
  return colunas.flatMap((c) => (c.dias.length ? c.dias.map((d) => secaoId(c.id, d)) : [c.id]));
}

export function diaEfetivo(d: ItemDia, mapa: MapaDias): number | null {
  const dias = mapa[d.status];
  if (!dias) return null;
  return d.dia_semana != null && dias.includes(d.dia_semana) ? d.dia_semana : dias[0];
}

export function containerDe(d: ItemDia, mapa: MapaDias): string {
  const dia = diaEfetivo(d, mapa);
  return dia == null ? d.status : secaoId(d.status, dia);
}

export function aplicarContainer<T extends ItemDia>(d: T, container: string): T {
  const secao = parseSecao(container);
  if (secao) return { ...d, status: secao.coluna, dia_semana: secao.dia };
  return { ...d, status: container, dia_semana: null };
}

const porOrdem = (a: ItemDia, b: ItemDia) => (a.ordem ?? 0) - (b.ordem ?? 0);

/** Leva o card para o fim do `dia` (na coluna dele) e renumera as duas seções. */
export function moverParaDia<T extends ItemDia>(lista: T[], id: string, dia: number, mapa: MapaDias): T[] {
  const card = lista.find((d) => d.id === id);
  if (!card) return lista;
  const origem = containerDe(card, mapa);
  const destino = secaoId(card.status, dia);
  if (origem === destino || !mapa[card.status]?.includes(dia)) return lista;
  const ordem = new Map<string, number>();
  lista.filter((d) => d.id !== id && containerDe(d, mapa) === origem).sort(porOrdem).forEach((d, i) => ordem.set(d.id, i));
  const doDia = lista.filter((d) => d.id !== id && containerDe(d, mapa) === destino).sort(porOrdem);
  doDia.forEach((d, i) => ordem.set(d.id, i));
  ordem.set(id, doDia.length);
  return lista.map((d) => {
    const base = d.id === id ? aplicarContainer(d, destino) : d;
    return ordem.has(d.id) ? { ...base, ordem: ordem.get(d.id) } : base;
  });
}

export function camposParaSalvar(d: ItemDia, mapa: MapaDias) {
  return { status: d.status, ordem: d.ordem ?? 0, dia_semana: diaEfetivo(d, mapa) };
}
