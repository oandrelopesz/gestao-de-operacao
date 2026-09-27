// Pontos de conexão das formas do quadro (as bolinhas nas bordas): onde ficam, se o ponteiro está sobre a forma e onde
// cai a cópia ligada ao clicar numa bolinha. Coordenadas da cena do Excalidraw; ângulo em radianos. Sem dependências.

export type Lado = "cima" | "direita" | "baixo" | "esquerda";
export const LADOS: Lado[] = ["cima", "direita", "baixo", "esquerda"];

export interface Caixa {
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
}
export interface Ponto {
  x: number;
  y: number;
}

const DIRECAO: Record<Lado, Ponto> = { cima: { x: 0, y: -1 }, direita: { x: 1, y: 0 }, baixo: { x: 0, y: 1 }, esquerda: { x: -1, y: 0 } };

export function centroDa(c: Caixa): Ponto {
  return { x: c.x + c.width / 2, y: c.y + c.height / 2 };
}

function girar(p: Ponto, centro: Ponto, angulo: number): Ponto {
  if (!angulo) return p;
  const cos = Math.cos(angulo), sin = Math.sin(angulo);
  const dx = p.x - centro.x, dy = p.y - centro.y;
  return { x: centro.x + dx * cos - dy * sin, y: centro.y + dx * sin + dy * cos };
}

/** Meio do lado da caixa (girada junto com a forma), afastado para fora `afastamento` unidades. */
export function pontoDoLado(c: Caixa, lado: Lado, afastamento = 0): Ponto {
  const centro = centroDa(c);
  const d = DIRECAO[lado];
  const meio = { x: centro.x + d.x * (c.width / 2 + afastamento), y: centro.y + d.y * (c.height / 2 + afastamento) };
  return girar(meio, centro, c.angle ?? 0);
}

/** O ponto está dentro da caixa (girada), com `margem` a mais em volta? */
export function contem(c: Caixa, p: Ponto, margem = 0): boolean {
  const local = girar(p, centroDa(c), -(c.angle ?? 0));
  return local.x >= c.x - margem && local.x <= c.x + c.width + margem && local.y >= c.y - margem && local.y <= c.y + c.height + margem;
}

function sobrepoe(a: Caixa, b: Caixa, folga: number): boolean {
  return a.x < b.x + b.width + folga && a.x + a.width + folga > b.x && a.y < b.y + b.height + folga && a.y + a.height + folga > b.y;
}

/**
 * Posição (canto de cima à esquerda) para uma forma nova de `largura` × `altura` ao lado de `origem`, centrada no eixo do
 * lado escolhido e a `vao` de distância. Se o lugar estiver ocupado, anda mais um passo na mesma direção (até 6 vezes).
 */
export function posicaoAoLado(origem: Caixa, largura: number, altura: number, lado: Lado, ocupadas: Caixa[], vao = 80): Ponto {
  const c = centroDa(origem);
  const d = DIRECAO[lado];
  const passoX = (origem.width + largura) / 2 + vao;
  const passoY = (origem.height + altura) / 2 + vao;
  let pos = { x: c.x + d.x * passoX - largura / 2, y: c.y + d.y * passoY - altura / 2 };
  for (let i = 0; i < 6; i++) {
    const caixa = { ...pos, width: largura, height: altura };
    if (!ocupadas.some((o) => sobrepoe(caixa, o, 12))) break;
    pos = { x: pos.x + d.x * (largura + vao / 2), y: pos.y + d.y * (altura + vao / 2) };
  }
  return { x: Math.round(pos.x), y: Math.round(pos.y) };
}

/** Lado da caixa que fica de frente para o lado escolhido na origem (direita ↔ esquerda, cima ↔ baixo). */
export function ladoOposto(lado: Lado): Lado {
  return lado === "cima" ? "baixo" : lado === "baixo" ? "cima" : lado === "direita" ? "esquerda" : "direita";
}

/**
 * Canto de cima à esquerda para uma forma nova de `largura` × `altura` o mais perto possível de `centro` sem encostar
 * (margem de 24) em nenhuma das `ocupadas`. Procura em anéis de `passo` em volta do centro; sem vaga, fica no centro.
 */
export function lugarLivre(centro: Ponto, largura: number, altura: number, ocupadas: Caixa[], passo = 40, aneis = 14): Ponto {
  const livre = (cx: number, cy: number) => {
    const caixa = { x: cx - largura / 2, y: cy - altura / 2, width: largura, height: altura };
    return !ocupadas.some((o) => sobrepoe(caixa, o, 24));
  };
  const canto = (cx: number, cy: number) => ({ x: Math.round(cx - largura / 2), y: Math.round(cy - altura / 2) });
  if (livre(centro.x, centro.y)) return canto(centro.x, centro.y);
  for (let anel = 1; anel <= aneis; anel++) {
    const candidatos: Ponto[] = [];
    for (let i = -anel; i <= anel; i++) {
      for (let j = -anel; j <= anel; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== anel) continue;
        candidatos.push({ x: centro.x + i * passo, y: centro.y + j * passo });
      }
    }
    candidatos.sort((a, b) => Math.hypot(a.x - centro.x, a.y - centro.y) - Math.hypot(b.x - centro.x, b.y - centro.y));
    const achado = candidatos.find((c) => livre(c.x, c.y));
    if (achado) return canto(achado.x, achado.y);
  }
  return canto(centro.x, centro.y);
}
