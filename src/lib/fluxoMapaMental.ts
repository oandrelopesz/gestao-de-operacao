// Mapa mental (estilo MindMeister) sobre o quadro: organização automática em árvore para os dois lados da raiz, com
// espaço proporcional ao tamanho de cada ramo; ramos recolhidos não contam. Cores por ramo de 1º nível. Sem dependências.

export type LadoMapa = "dir" | "esq";

export interface NoMapa {
  id: string;
  /** null = raiz */
  pai: string | null;
  lado: LadoMapa;
  /** Ordem entre os irmãos (de cima para baixo) */
  ordem: number;
  largura: number;
  altura: number;
  recolhido?: boolean;
}

export interface Ponto {
  x: number;
  y: number;
}

export interface Organizacao {
  posicoes: Record<string, Ponto>;
  /** Uma ligação por filho visível: da borda do pai até a borda do filho */
  ligacoes: { pai: string; filho: string; de: Ponto; para: Ponto }[];
}

/** Distância entre a borda do pai e a do filho */
export const ESPACO_X = 72;
/** Distância entre blocos de irmãos */
export const ESPACO_Y = 20;

function filhosDe(nos: NoMapa[], id: string): NoMapa[] {
  return nos.filter((n) => n.pai === id).sort((a, b) => a.ordem - b.ordem);
}

/**
 * Posições (canto de cima à esquerda) de todos os nós visíveis. A raiz fica em `origem`; filhos à direita/esquerda
 * dela conforme o `lado`; netos seguem o lado do pai.
 */
export function organizar(nos: NoMapa[], raizId: string, origem: Ponto): Organizacao {
  const porId = new Map(nos.map((n) => [n.id, n]));
  const raiz = porId.get(raizId);
  const saida: Organizacao = { posicoes: {}, ligacoes: [] };
  if (!raiz) return saida;
  const visiveis = (n: NoMapa) => (n.recolhido ? [] : filhosDe(nos, n.id));
  const alturas = new Map<string, number>();
  const bloco = (n: NoMapa): number => {
    const guardado = alturas.get(n.id);
    if (guardado !== undefined) return guardado;
    const filhos = visiveis(n);
    const soma = filhos.reduce((s, f) => s + bloco(f), 0) + ESPACO_Y * Math.max(0, filhos.length - 1);
    const h = Math.max(n.altura, soma);
    alturas.set(n.id, h);
    return h;
  };

  const posicionar = (pai: NoMapa, filhos: NoMapa[], lado: LadoMapa) => {
    const p = saida.posicoes[pai.id];
    const centroPai = p.y + pai.altura / 2;
    const total = filhos.reduce((s, f) => s + bloco(f), 0) + ESPACO_Y * Math.max(0, filhos.length - 1);
    let y = centroPai - total / 2;
    for (const f of filhos) {
      const h = bloco(f);
      const x = lado === "dir" ? p.x + pai.largura + ESPACO_X : p.x - ESPACO_X - f.largura;
      saida.posicoes[f.id] = { x, y: y + h / 2 - f.altura / 2 };
      const centroFilho = y + h / 2;
      saida.ligacoes.push({
        pai: pai.id,
        filho: f.id,
        de: { x: lado === "dir" ? p.x + pai.largura : p.x, y: centroPai },
        para: { x: lado === "dir" ? x : x + f.largura, y: centroFilho },
      });
      posicionar(f, visiveis(f), lado);
      y += h + ESPACO_Y;
    }
  };

  saida.posicoes[raiz.id] = { x: origem.x, y: origem.y };
  if (!raiz.recolhido) {
    const filhos = filhosDe(nos, raiz.id);
    posicionar(raiz, filhos.filter((f) => f.lado === "dir"), "dir");
    posicionar(raiz, filhos.filter((f) => f.lado === "esq"), "esq");
  }
  return saida;
}

/** Pontos (relativos ao início) de uma ligação em S: sai na horizontal do pai e chega na horizontal no filho. */
export function curvaDaLigacao(de: Ponto, para: Ponto): [number, number][] {
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  return [[0, 0], [dx * 0.4, 0], [dx * 0.6, dy], [dx, dy]];
}

/** Todos os nós abaixo de `id` (recolhidos ou não). */
export function descendentes(nos: NoMapa[], id: string): string[] {
  const saida: string[] = [];
  const fila = [id];
  while (fila.length) {
    const atual = fila.shift()!;
    for (const f of nos) if (f.pai === atual) { saida.push(f.id); fila.push(f.id); }
  }
  return saida;
}

/** Filho novo da raiz vai para o lado com menos tópicos; nos demais, segue o lado do pai. */
export function ladoParaNovoFilho(nos: NoMapa[], paiId: string): LadoMapa {
  const pai = nos.find((n) => n.id === paiId);
  if (!pai) return "dir";
  if (pai.pai !== null) return pai.lado;
  const filhos = nos.filter((n) => n.pai === paiId);
  const dir = filhos.filter((n) => n.lado === "dir").length;
  const esq = filhos.length - dir;
  return dir <= esq ? "dir" : "esq";
}

/** Índice do ramo de 1º nível ao qual o nó pertence (para a cor); a raiz é -1. */
export function indiceDoRamo(nos: NoMapa[], id: string): number {
  const porId = new Map(nos.map((n) => [n.id, n]));
  let atual = porId.get(id);
  if (!atual || atual.pai === null) return -1;
  while (atual && atual.pai !== null && porId.get(atual.pai)?.pai !== null) atual = porId.get(atual.pai);
  if (!atual || atual.pai === null) return -1;
  const irmaos = nos.filter((n) => n.pai === atual!.pai).sort((a, b) => a.ordem - b.ordem);
  return irmaos.findIndex((n) => n.id === atual!.id);
}

const PALETA = [
  { traco: "#1971c2", fundo: "#d0ebff" },
  { traco: "#2f9e44", fundo: "#d3f9d8" },
  { traco: "#e8590c", fundo: "#ffe8cc" },
  { traco: "#9c36b5", fundo: "#f3d9fa" },
  { traco: "#c2255c", fundo: "#ffdeeb" },
  { traco: "#0c8599", fundo: "#c5f6fa" },
  { traco: "#e67700", fundo: "#fff3bf" },
  { traco: "#5f3dc4", fundo: "#e5dbff" },
];

export const COR_RAIZ = { traco: "#343a40", fundo: "#343a40", texto: "#ffffff" };

export function corDoRamo(indice: number): { traco: string; fundo: string } {
  return PALETA[((indice % PALETA.length) + PALETA.length) % PALETA.length];
}
