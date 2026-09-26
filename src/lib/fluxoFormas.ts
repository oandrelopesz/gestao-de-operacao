// Formas extras do quadro (funil, cone, cilindro…): geometria pura em "peças" que o editor converte em elementos do
// Excalidraw — polígono fechado (linha cujo último ponto repete o primeiro, preenchível), elipse e texto. Sem dependências.

export type FormaExtra =
  | "funil" | "piramide" | "cone" | "cilindro" | "trapezio" | "triangulo" | "hexagono" | "estrela" | "chevron" | "nuvem";

export type Peca =
  | { tipo: "poligono"; x: number; y: number; pontos: [number, number][] }
  | { tipo: "elipse"; x: number; y: number; largura: number; altura: number }
  | { tipo: "texto"; x: number; y: number; largura: number; texto: string };

export const FORMAS_EXTRAS: { id: FormaExtra; rotulo: string; largura: number; altura: number; etapas?: number }[] = [
  { id: "funil", rotulo: "Funil", largura: 360, altura: 300, etapas: 4 },
  { id: "piramide", rotulo: "Pirâmide", largura: 320, altura: 280, etapas: 3 },
  { id: "cone", rotulo: "Cone", largura: 180, altura: 220 },
  { id: "cilindro", rotulo: "Cilindro", largura: 160, altura: 200 },
  { id: "trapezio", rotulo: "Trapézio", largura: 220, altura: 120 },
  { id: "triangulo", rotulo: "Triângulo", largura: 200, altura: 170 },
  { id: "hexagono", rotulo: "Hexágono", largura: 200, altura: 170 },
  { id: "estrela", rotulo: "Estrela", largura: 200, altura: 190 },
  { id: "chevron", rotulo: "Etapa (chevron)", largura: 220, altura: 100 },
  { id: "nuvem", rotulo: "Nuvem", largura: 240, altura: 150 },
];

type P = [number, number];

/** Polígono em coordenadas da caixa → peça com o 1º ponto em (0,0) e fechada. */
function poligono(x0: number, y0: number, pts: P[]): Peca {
  const [ax, ay] = pts[0];
  const rel = pts.map(([px, py]) => [round(px - ax), round(py - ay)] as P);
  return { tipo: "poligono", x: round(x0 + ax), y: round(y0 + ay), pontos: [...rel, [0, 0]] };
}

const round = (n: number) => Math.round(n * 100) / 100;

function elipseAmostrada(cx: number, cy: number, rx: number, ry: number, de: number, ate: number, passos: number): P[] {
  return Array.from({ length: passos + 1 }, (_, i) => {
    const a = de + ((ate - de) * i) / passos;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as P;
  });
}

/** Faixas empilhadas de um triângulo cortado (funil = ponta embaixo; pirâmide = ponta em cima). */
function faixas(x0: number, y0: number, W: number, H: number, n: number, pontaEmCima: boolean, rotulos: string[]): Peca[] {
  const vao = 6;
  const h = (H - vao * (n - 1)) / n;
  const largura = (yFrac: number) => (pontaEmCima ? W * yFrac : W * (1 - 0.72 * yFrac));
  const pecas: Peca[] = [];
  for (let i = 0; i < n; i++) {
    const topo = i * (h + vao);
    const base = topo + h;
    const wT = largura(topo / H);
    const wB = largura(base / H);
    const pts: P[] = wT < 0.5
      ? [[W / 2, topo], [(W + wB) / 2, base], [(W - wB) / 2, base]]
      : [[(W - wT) / 2, topo], [(W + wT) / 2, topo], [(W + wB) / 2, base], [(W - wB) / 2, base]];
    pecas.push(poligono(x0, y0, pts));
  }
  for (let i = 0; i < n; i++) {
    const topo = i * (h + vao);
    // Faixa em ponta (topo da pirâmide): o rótulo desce para 2/3 da altura, onde o triângulo tem mais largura
    const emPonta = largura(topo / H) < 0.5;
    const centro = topo + (emPonta ? (h * 2) / 3 : h / 2);
    pecas.push({ tipo: "texto", x: round(x0), y: round(y0 + centro - 10), largura: W, texto: rotulos[i] ?? `Etapa ${i + 1}` });
  }
  return pecas;
}

export function pecasDa(
  forma: FormaExtra,
  x0: number,
  y0: number,
  opcoes: { largura?: number; altura?: number; etapas?: number; rotulos?: string[] } = {},
): Peca[] {
  const padrao = FORMAS_EXTRAS.find((f) => f.id === forma)!;
  const W = opcoes.largura ?? padrao.largura;
  const H = opcoes.altura ?? padrao.altura;
  const n = Math.max(2, Math.min(8, opcoes.etapas ?? padrao.etapas ?? 4));
  const rotulos = opcoes.rotulos ?? [];
  switch (forma) {
    case "funil":
      return faixas(x0, y0, W, H, n, false, rotulos);
    case "piramide":
      return faixas(x0, y0, W, H, n, true, rotulos);
    case "cone": {
      const eh = H * 0.18;
      return [
        poligono(x0, y0, [[W / 2, 0], [W, H - eh / 2], [0, H - eh / 2]]),
        { tipo: "elipse", x: round(x0), y: round(y0 + H - eh), largura: W, altura: round(eh) },
      ];
    }
    case "cilindro": {
      const eh = H * 0.2;
      const fundo = elipseAmostrada(W / 2, H - eh / 2, W / 2, eh / 2, Math.PI, 0, 16).reverse();
      return [
        poligono(x0, y0, [[0, eh / 2], [0, H - eh / 2], ...fundo.slice(1, -1), [W, H - eh / 2], [W, eh / 2]]),
        { tipo: "elipse", x: round(x0), y: round(y0), largura: W, altura: round(eh) },
      ];
    }
    case "trapezio":
      return [poligono(x0, y0, [[W * 0.2, 0], [W * 0.8, 0], [W, H], [0, H]])];
    case "triangulo":
      return [poligono(x0, y0, [[W / 2, 0], [W, H], [0, H]])];
    case "hexagono":
      return [poligono(x0, y0, [[W * 0.25, 0], [W * 0.75, 0], [W, H / 2], [W * 0.75, H], [W * 0.25, H], [0, H / 2]])];
    case "estrela": {
      const pts: P[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 1 : 0.42;
        pts.push([W / 2 + (W / 2) * r * Math.cos(a), H * 0.53 + H * 0.5 * r * Math.sin(a)]);
      }
      // Encaixa na caixa (a estrela não encosta embaixo)
      const ys = pts.map(([, y]) => y);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      return [poligono(x0, y0, pts.map(([x, y]) => [x, ((y - minY) / (maxY - minY)) * H] as P))];
    }
    case "chevron":
      return [poligono(x0, y0, [[0, 0], [W * 0.8, 0], [W, H / 2], [W * 0.8, H], [0, H], [W * 0.2, H / 2]])];
    case "nuvem": {
      const pts: P[] = [];
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const r = 0.86 + 0.14 * Math.abs(Math.sin(4 * a));
        pts.push([W / 2 + (W / 2) * r * Math.cos(a), H / 2 + (H / 2) * r * Math.sin(a)]);
      }
      return [poligono(x0, y0, pts)];
    }
  }
}
