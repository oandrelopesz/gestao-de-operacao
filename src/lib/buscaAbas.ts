// Busca de abas do menu lateral: ignora acento e maiúscula, aceita erros de digitação (distância de edição
// com troca de letras vizinhas), acha por sinônimo e pelo nome do grupo. Sem dependências (roda no `node --test`).

export interface ItemBusca {
  to: string;
  label: string;
  grupo: string;
  /** Sinônimos e termos relacionados ("prospecção" → CRM) */
  palavras?: string[];
}

export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Distância de edição (Damerau-Levenshtein restrita): inserir, apagar, trocar e inverter letras vizinhas. */
export function distancia(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Letras da consulta aparecem em ordem dentro da palavra, começando pela primeira ("fnc" → financeiro). */
function subsequencia(q: string, palavra: string): boolean {
  if (q[0] !== palavra[0]) return false;
  let i = 0;
  for (const c of palavra) if (c === q[i]) i++;
  return i === q.length;
}

/** Pontos de 0 a 100 para uma consulta (já normalizada, uma palavra ou mais) contra um texto. */
function pontuar(q: string, texto: string): number {
  const t = normalizar(texto);
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 95;
  const palavras = t.split(" ");
  if (palavras.some((p) => p.startsWith(q))) return 90;
  if (t.includes(q)) return 80;
  const tolerancia = q.length <= 3 ? 0 : q.length <= 5 ? 1 : 2;
  if (tolerancia > 0) {
    let melhor = Infinity;
    for (const p of [...palavras, t.replace(/ /g, "")]) {
      melhor = Math.min(melhor, distancia(q, p));
      if (p.length > q.length) melhor = Math.min(melhor, distancia(q, p.slice(0, q.length)));
    }
    if (melhor <= tolerancia) return 70 - melhor * 10;
  }
  if (q.length >= 3 && palavras.some((p) => subsequencia(q, p))) return 50;
  return 0;
}

/** Melhor pontuação do item para um termo: nome > sinônimos > grupo. */
function pontosDoItem(q: string, item: ItemBusca): number {
  return Math.max(
    pontuar(q, item.label),
    ...(item.palavras ?? []).map((p) => Math.max(0, pontuar(q, p) - 5)),
    Math.max(0, pontuar(q, item.grupo) - 20),
  );
}

/** Abas que batem com a consulta, da mais parecida para a menos (empate: ordem original do menu). */
export function buscarAbas<T extends ItemBusca>(itens: T[], consulta: string): T[] {
  const q = normalizar(consulta);
  if (!q) return [];
  const termos = q.split(" ");
  return itens
    .map((item, ordem) => {
      const inteiro = pontosDoItem(q, item);
      // Várias palavras: todas precisam bater em algo do item
      const porTermo = termos.length > 1 ? Math.min(...termos.map((t) => pontosDoItem(t, item))) - 5 : 0;
      return { item, ordem, pontos: Math.max(inteiro, porTermo) };
    })
    .filter((r) => r.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem)
    .map((r) => r.item);
}
