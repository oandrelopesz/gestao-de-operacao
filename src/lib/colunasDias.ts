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
  /** Coroa: as prioritárias ficam no topo da coluna (ou da seção do dia), sem ranking entre si além da ordem */
  prioritaria?: boolean | null;
  /** Posição entre as normais quando ganhou a coroa: tirar a coroa devolve o card para lá */
  prioridade_pos?: number | null;
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

/**
 * Ordem do quadro: as prioritárias (coroa) primeiro, depois pela `ordem`. Usada na tela, no arrasto e nos
 * movimentos em massa, então qualquer card que chega a uma coluna (virada, "Mover para", arrasto de outra coluna)
 * já aparece no lugar certo sem renumerar no banco.
 */
export const porOrdem = (a: { ordem?: number | null; prioritaria?: boolean | null }, b: { ordem?: number | null; prioritaria?: boolean | null }) =>
  Number(!!b.prioritaria) - Number(!!a.prioritaria) || (a.ordem ?? 0) - (b.ordem ?? 0);

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
  return {
    status: d.status,
    ordem: d.ordem ?? 0,
    dia_semana: diaEfetivo(d, mapa),
    prioritaria: !!d.prioritaria,
    prioridade_pos: d.prioritaria ? d.prioridade_pos ?? null : null,
  };
}

/**
 * Depois de soltar um card na MESMA coluna, a coroa segue a posição: prioritária solta abaixo de uma normal perde a
 * coroa; normal solta acima de uma prioritária ganha. Entre colunas (outro dia) a marca não muda: a prioritária
 * continua prioritária e aparece no topo do destino. `lista` vem com a `ordem` do arrasto (onde o card caiu).
 */
export function prioridadeAoSoltar<T extends ItemDia>(lista: T[], id: string, origem: string, destino: string, mapa: MapaDias): T[] {
  if (origem !== destino) return lista;
  const coluna = lista.filter((d) => containerDe(d, mapa) === destino).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const i = coluna.findIndex((d) => d.id === id);
  if (i < 0) return lista;
  const card = coluna[i];
  const acima = coluna[i - 1];
  const abaixo = coluna[i + 1];
  let prioritaria = !!card.prioritaria;
  if (prioritaria && acima && !acima.prioritaria) prioritaria = false;
  else if (!prioritaria && abaixo?.prioritaria) prioritaria = true;
  if (prioritaria === !!card.prioritaria) return lista;
  return lista.map((d) => (d.id === id ? { ...d, prioritaria, prioridade_pos: null } : d));
}

/**
 * Coroa em um ou vários cards (`ligar`) ou tirar. Ligar leva o card para o fim das prioritárias do container e
 * guarda a posição dele entre as normais; tirar devolve o card para essa posição (ou para a última, se o container
 * encolheu). Renumera os containers mexidos.
 */
export function alternarPrioridade<T extends ItemDia>(lista: T[], ids: string[], ligar: boolean, mapa: MapaDias): T[] {
  const alvo = new Set(ids);
  const containers = new Set(lista.filter((d) => alvo.has(d.id) && !!d.prioritaria !== ligar).map((d) => containerDe(d, mapa)));
  if (!containers.size) return lista;
  const novos = new Map<string, T>();
  for (const c of containers) {
    const coluna = lista.filter((d) => containerDe(d, mapa) === c).sort(porOrdem);
    let prios = coluna.filter((d) => d.prioritaria);
    let normais = coluna.filter((d) => !d.prioritaria);
    if (ligar) {
      const sobem = normais.filter((d) => alvo.has(d.id));
      const pos = new Map(normais.map((d, i) => [d.id, i]));
      normais = normais.filter((d) => !alvo.has(d.id));
      prios = [...prios, ...sobem.map((d) => ({ ...d, prioritaria: true, prioridade_pos: pos.get(d.id) ?? 0 }))];
    } else {
      const descem = prios.filter((d) => alvo.has(d.id)).sort((a, b) => (a.prioridade_pos ?? 0) - (b.prioridade_pos ?? 0));
      prios = prios.filter((d) => !alvo.has(d.id));
      for (const d of descem) {
        const at = Math.min(Math.max(d.prioridade_pos ?? 0, 0), normais.length);
        normais = [...normais.slice(0, at), { ...d, prioritaria: false, prioridade_pos: null }, ...normais.slice(at)];
      }
    }
    [...prios, ...normais].forEach((d, i) => novos.set(d.id, { ...d, ordem: i }));
  }
  return lista.map((d) => novos.get(d.id) ?? d);
}

/**
 * Leva vários cards para o container `destino` (coluna ou seção "coluna:dia"), na ordem de `ids`,
 * logo depois de `depoisDe` (o card solto no arrasto) ou no fim do destino. Renumera o destino e as
 * origens. Usado na seleção em massa (arrastar o grupo ou "Mover para").
 */
export function moverVariosPara<T extends ItemDia>(lista: T[], ids: string[], destino: string, mapa: MapaDias, depoisDe?: string): T[] {
  const mover = new Set(ids.filter((id) => id !== depoisDe));
  const porId = new Map(lista.map((d) => [d.id, d]));
  const grupo = ids.filter((id) => mover.has(id)).map((id) => porId.get(id)).filter((d): d is T => !!d);
  if (!grupo.length) return lista;
  const origens = new Set(grupo.map((d) => containerDe(d, mapa)));
  const restoDestino = lista.filter((d) => !mover.has(d.id) && containerDe(d, mapa) === destino).sort(porOrdem);
  const idx = depoisDe ? restoDestino.findIndex((d) => d.id === depoisDe) : -1;
  const pos = idx >= 0 ? idx + 1 : restoDestino.length;
  const ordem = new Map<string, number>();
  [...restoDestino.slice(0, pos), ...grupo, ...restoDestino.slice(pos)].forEach((d, i) => ordem.set(d.id, i));
  for (const o of origens) {
    if (o === destino) continue;
    lista.filter((d) => !mover.has(d.id) && containerDe(d, mapa) === o).sort(porOrdem).forEach((d, i) => ordem.set(d.id, i));
  }
  return lista.map((d) => {
    const base = mover.has(d.id) ? aplicarContainer(d, destino) : d;
    return ordem.has(d.id) ? { ...base, ordem: ordem.get(d.id) } : base;
  });
}

/** Ordena ids como aparecem no quadro: pela posição do container, depois pela ordem dentro dele. */
export function ordenarPeloQuadro(lista: ItemDia[], ids: string[], containers: string[], mapa: MapaDias): string[] {
  const porId = new Map(lista.map((d) => [d.id, d]));
  const pos = (d: ItemDia) => containers.indexOf(containerDe(d, mapa));
  return ids
    .map((id) => porId.get(id))
    .filter((d): d is ItemDia => !!d)
    .sort((a, b) => pos(a) - pos(b) || porOrdem(a, b))
    .map((d) => d.id);
}
