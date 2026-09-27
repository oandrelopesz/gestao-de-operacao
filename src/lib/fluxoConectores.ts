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

/** Lado do destino voltado para a origem (pelo eixo em que eles estão mais afastados, proporcional ao tamanho). */
export function ladoDeFrente(origem: Caixa, destino: Caixa): Lado {
  const o = centroDa(origem), d = centroDa(destino);
  const dx = (o.x - d.x) / Math.max(1, destino.width), dy = (o.y - d.y) / Math.max(1, destino.height);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "direita" : "esquerda";
  return dy >= 0 ? "baixo" : "cima";
}

/** Lado cuja bolinha (meio do lado) está a até `limite` do ponto; senão null. */
export function ladoPerto(c: Caixa, p: Ponto, limite: number): Lado | null {
  let melhor: Lado | null = null;
  let menor = limite;
  for (const lado of LADOS) {
    const m = pontoDoLado(c, lado);
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d <= menor) { menor = d; melhor = lado; }
  }
  return melhor;
}

// ---------------------------------------------------------------- Conectores (estilo Miro)

/** Direção (unitária) para fora do lado, girada junto com a forma. */
export function normalDoLado(lado: Lado, angulo = 0): Ponto {
  const d = DIRECAO[lado];
  if (!angulo) return { x: d.x, y: d.y };
  const cos = Math.cos(angulo), sin = Math.sin(angulo);
  return { x: d.x * cos - d.y * sin, y: d.x * sin + d.y * cos };
}

/** Lado cuja bolinha (meio do lado) está mais perto do ponto. */
export function ladoMaisProximo(c: Caixa, p: Ponto): Lado {
  let melhor: Lado = "direita";
  let menor = Infinity;
  for (const lado of LADOS) {
    const m = pontoDoLado(c, lado);
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d < menor) { menor = d; melhor = lado; }
  }
  return melhor;
}

/** Onde um raio (origem + t·direção, t ≥ 0) sai de um polígono fechado: a interseção mais distante; null se não cruza. */
export function saidaDoPoligono(pontos: Ponto[], origem: Ponto, direcao: Ponto): Ponto | null {
  let melhor: number | null = null;
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i], b = pontos[(i + 1) % pontos.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const den = direcao.x * ey - direcao.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const ax = a.x - origem.x, ay = a.y - origem.y;
    const t = (ax * ey - ay * ex) / den;
    const u = (ax * direcao.y - ay * direcao.x) / den;
    if (t >= 0 && u >= -1e-9 && u <= 1 + 1e-9 && (melhor === null || t > melhor)) melhor = t;
  }
  return melhor === null ? null : { x: origem.x + direcao.x * melhor, y: origem.y + direcao.y * melhor };
}

/** Onde um raio sai de uma elipse (caixa sem giro); null se não cruza. */
export function saidaDaElipse(c: Caixa, origem: Ponto, direcao: Ponto): Ponto | null {
  const rx = c.width / 2, ry = c.height / 2;
  if (rx <= 0 || ry <= 0) return null;
  const cx = c.x + rx, cy = c.y + ry;
  const ox = (origem.x - cx) / rx, oy = (origem.y - cy) / ry;
  const dx = direcao.x / rx, dy = direcao.y / ry;
  const A = dx * dx + dy * dy, B = 2 * (ox * dx + oy * dy), C = ox * ox + oy * oy - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0 || A === 0) return null;
  const t = (-B + Math.sqrt(disc)) / (2 * A);
  return t < 0 ? null : { x: origem.x + direcao.x * t, y: origem.y + direcao.y * t };
}

export type EstiloConector = "curva" | "reta";

/** Uma ponta do conector: onde fica, para onde a borda aponta (null = ponta solta) e a forma que a linha não pode cortar. */
export interface Extremidade {
  ponto: Ponto;
  normal: Ponto | null;
  caixa: Caixa | null;
}

export interface Rota {
  /** Pontos da seta do Excalidraw (ele desenha a curva suave que passa por eles) */
  pontos: Ponto[];
  comprimento: number;
  /** Quanto a linha vira no total (radianos) */
  giro: number;
  /** Teve de dar a volta numa das formas (o lado escolhido está de costas para a outra ponta) */
  contorna: boolean;
}

/** Distâncias entre a linha que contorna e as formas: a maior que couber (formas muito perto pedem folga menor) */
const FOLGAS_CONTORNO = [36, 22, 12];
/** Raio máximo das curvas nos cantos do contorno */
const RAIO_CONTORNO = 56;
/** Espaço entre os pontos da seta: perto o bastante para o desenho do Excalidraw ficar igual à curva calculada */
const PASSO_DOS_PONTOS = 14;
/**
 * Haste reta nas pontas com seta: o Excalidraw faz a ponta da seta com no máximo metade do último trecho (e 25 px no
 * total), então esse trecho precisa de ~50 px para a ponta sair no tamanho normal — e fica reto, apontando certinho.
 */
const HASTE = 50;

/** Que pontas desenham seta (a haste reta só entra nelas); o padrão é o de um conector novo. */
export interface SetasDoConector {
  inicio: boolean;
  fim: boolean;
}
const SETAS_PADRAO: SetasDoConector = { inicio: false, fim: true };

const dist = (a: Ponto, b: Ponto) => Math.hypot(b.x - a.x, b.y - a.y);
const mais = (a: Ponto, v: Ponto, k: number): Ponto => ({ x: a.x + v.x * k, y: a.y + v.y * k });

function cubica(p0: Ponto, c1: Ponto, c2: Ponto, p3: Ponto, t: number): Ponto {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
  };
}

function comprimentoDe(pts: Ponto[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  return total;
}

function giroDe(pts: Ponto[]): number {
  let total = 0;
  let antes: number | null = null;
  for (let i = 1; i < pts.length; i++) {
    if (dist(pts[i - 1], pts[i]) < 1e-6) continue;
    const ang = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    if (antes !== null) {
      let d = ang - antes;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      total += Math.abs(d);
    }
    antes = ang;
  }
  return total;
}

/** Pontos da polilinha em `partes` trechos de mesmo comprimento, entre os comprimentos `de` e `ate` (inclusive). */
function amostrar(pts: Ponto[], de: number, ate: number, partes: number): Ponto[] {
  const acum = [0];
  for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + dist(pts[i - 1], pts[i]));
  const saida: Ponto[] = [];
  let j = 1;
  for (let k = 0; k <= partes; k++) {
    const alvo = de + ((ate - de) * k) / partes;
    while (j < pts.length - 1 && acum[j] < alvo) j++;
    const trecho = acum[j] - acum[j - 1];
    const t = trecho > 0 ? Math.min(1, Math.max(0, (alvo - acum[j - 1]) / trecho)) : 0;
    saida.push({ x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * t, y: pts[j - 1].y + (pts[j].y - pts[j - 1].y) * t });
  }
  return saida;
}

/**
 * Curva direta (como no Miro): Bézier que sai e chega pela normal de cada borda (depois da haste reta, onde houver);
 * ponta solta não puxa.
 */
function curvaDireta(ini: Extremidade, fim: Extremidade, hasteIni: number, hasteFim: number): Ponto[] {
  const a = ini.normal ? mais(ini.ponto, ini.normal, hasteIni) : ini.ponto;
  const b = fim.normal ? mais(fim.ponto, fim.normal, hasteFim) : fim.ponto;
  const k = Math.min(220, Math.max(24, dist(a, b) * 0.5));
  const c1 = ini.normal ? mais(a, ini.normal, k) : null;
  const c2 = fim.normal ? mais(b, fim.normal, k) : null;
  // Uma ponta solta: quadrática escrita como cúbica (controle nos 2/3 do caminho até o controle da outra ponta)
  const q1 = c1 ?? (c2 ? mais(a, { x: c2.x - a.x, y: c2.y - a.y }, 2 / 3) : a);
  const q2 = c2 ?? (c1 ? mais(b, { x: c1.x - b.x, y: c1.y - b.y }, 2 / 3) : b);
  const meio = Array.from({ length: 121 }, (_, i) => cubica(a, q1, q2, b, i / 120));
  return [...(hasteIni > 0 ? [ini.ponto] : []), ...meio, ...(hasteFim > 0 ? [fim.ponto] : [])];
}

const paraLocal = (c: Caixa, p: Ponto) => girar(p, centroDa(c), -(c.angle ?? 0));

/** A linha corta a forma fora da própria ponta? (a ponta pode ficar um pouco para dentro da caixa, como no funil) */
function atravessa(c: Caixa, pts: Ponto[], pontaNoInicio: boolean): boolean {
  const dentro = pts.map((p) => contem(c, p, -1));
  if (pontaNoInicio) {
    const saiu = dentro.indexOf(false);
    return saiu >= 0 && dentro.slice(saiu).some(Boolean);
  }
  return dentro.slice(0, dentro.lastIndexOf(false)).some(Boolean);
}

/** O segmento passa por dentro da caixa com `folga` em volta? (encostar na borda da folga vale) */
function cortaCaixa(c: Caixa, folga: number, a: Ponto, b: Ponto): boolean {
  const la = paraLocal(c, a), lb = paraLocal(c, b);
  const e = 0.5;
  const x0 = c.x - folga + e, x1 = c.x + c.width + folga - e, y0 = c.y - folga + e, y1 = c.y + c.height + folga - e;
  let t0 = 0, t1 = 1;
  const dx = lb.x - la.x, dy = lb.y - la.y;
  for (const [p, q] of [[-dx, la.x - x0], [dx, x1 - la.x], [-dy, la.y - y0], [dy, y1 - la.y]]) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t1 - t0 > 1e-9;
}

/** Onde o raio que sai da ponta pela normal deixa a caixa com folga. */
function saidaDaFolga(c: Caixa, folga: number, p: Ponto, n: Ponto): Ponto {
  const lp = paraLocal(c, p);
  const ln = girar(n, { x: 0, y: 0 }, -(c.angle ?? 0));
  let t = Infinity;
  if (ln.x > 1e-9) t = Math.min(t, (c.x + c.width + folga - lp.x) / ln.x);
  if (ln.x < -1e-9) t = Math.min(t, (c.x - folga - lp.x) / ln.x);
  if (ln.y > 1e-9) t = Math.min(t, (c.y + c.height + folga - lp.y) / ln.y);
  if (ln.y < -1e-9) t = Math.min(t, (c.y - folga - lp.y) / ln.y);
  return mais(p, n, Number.isFinite(t) && t > 0 ? t : folga);
}

function cantosComFolga(c: Caixa, folga: number): Ponto[] {
  const x0 = c.x - folga, x1 = c.x + c.width + folga, y0 = c.y - folga, y1 = c.y + c.height + folga;
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }].map((p) => girar(p, centroDa(c), c.angle ?? 0));
}

/**
 * Caminho mais curto por fora das formas (pelos cantos da folga): ponta, saída, cantos…, chegada, ponta. A saída de uma
 * ponta com haste vai além da folga, se couber, para a haste ficar reta.
 */
function caminhoPorFora(ini: Extremidade, fim: Extremidade, folga: number, hasteIni: number, hasteFim: number): Ponto[] | null {
  const caixas = [ini.caixa, fim.caixa].filter((c): c is Caixa => !!c);
  const livre = (p: Ponto, q: Ponto) => !caixas.some((c) => cortaCaixa(c, folga, p, q));
  // Cantos daquele lado empurrados até a saída estendida: dá para chegar nela em linha reta, sem cortar na diagonal
  const extras: Ponto[] = [];
  // Normal de cada saída que foi estendida: a linha chega nela reta (pela normal ou de lado), nunca na diagonal
  const estendida: (Ponto | null)[] = [null, null];
  const saida = (e: Extremidade, haste: number, qual: 0 | 1) => {
    if (!e.caixa || !e.normal) return e.ponto;
    const n = e.normal;
    const s = saidaDaFolga(e.caixa, folga, e.ponto, n);
    const longe = mais(e.ponto, n, haste + 12);
    if (!(haste > 0 && dist(e.ponto, s) < haste + 12 && livre(s, longe))) return s;
    const empurrao = dist(e.ponto, longe) - dist(e.ponto, s);
    const doLado = cantosComFolga(e.caixa, folga)
      .map((p) => ({ p, frente: (p.x - e.ponto.x) * n.x + (p.y - e.ponto.y) * n.y }))
      .sort((x, y) => y.frente - x.frente)
      .slice(0, 2);
    extras.push(...doLado.map(({ p }) => mais(p, n, empurrao)));
    estendida[qual] = n;
    return longe;
  };
  const a = saida(ini, hasteIni, 0);
  const b = saida(fim, hasteFim, 1);
  const nos = [a, b, ...caixas.flatMap((c) => cantosComFolga(c, folga)), ...extras];
  const reto = (i: number, j: number) => [0, 1].every((k) => {
    const n = estendida[k];
    if (!n || (i !== k && j !== k)) return true;
    const l = dist(nos[i], nos[j]);
    const c = l < 1e-9 ? 0 : Math.abs(((nos[j].x - nos[i].x) * n.x + (nos[j].y - nos[i].y) * n.y) / l);
    return c < 0.02 || c > 0.98;
  });
  // Dijkstra de a até b (poucos nós: as saídas e os cantos)
  const menorCaminho = (exigirReto: boolean): Ponto[] | null => {
    const custo = nos.map(() => Infinity);
    const veio = nos.map(() => -1);
    const feito = nos.map(() => false);
    custo[0] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < nos.length; i++) if (!feito[i] && custo[i] < Infinity && (u < 0 || custo[i] < custo[u])) u = i;
      if (u < 0 || u === 1) break;
      feito[u] = true;
      for (let v = 0; v < nos.length; v++) {
        if (feito[v]) continue;
        const c = custo[u] + dist(nos[u], nos[v]);
        if (c < custo[v] && (!exigirReto || reto(u, v)) && livre(nos[u], nos[v])) {
          custo[v] = c;
          veio[v] = u;
        }
      }
    }
    if (custo[1] === Infinity) return null;
    const caminho: Ponto[] = [];
    for (let i = 1; i >= 0; i = veio[i]) caminho.unshift(nos[i]);
    return caminho;
  };
  const caminho = menorCaminho(true) ?? menorCaminho(false);
  if (!caminho) return null;
  const pts = [ini.ponto, ...caminho, fim.ponto];
  return pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]) > 0.5);
}

/**
 * O caminho com os cantos arredondados (nunca passa do ponto nem volta para trás, ao contrário de uma spline). Nos trechos
 * que saem das pontas a curva pode usar quase o trecho todo (ali não há outro canto disputando o espaço), menos a haste.
 * Devolve também quanto sobra de reta junto de cada ponta.
 */
function arredondar(pts: Ponto[], hasteIni: number, hasteFim: number): { curva: Ponto[]; retoIni: number; retoFim: number } {
  const curva = [pts[0]];
  const ultimo = pts.length - 2;
  let retoIni = dist(pts[0], pts[1]), retoFim = dist(pts[pts.length - 1], pts[pts.length - 2]);
  const naPonta = (l: number, haste: number) => (haste > 0 ? Math.max(l - haste, Math.min(8, l * 0.85)) : l * 0.85);
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], v = pts[i], b = pts[i + 1];
    const la = dist(a, v), lb = dist(v, b);
    const r = Math.min(RAIO_CONTORNO, i === 1 ? naPonta(la, hasteIni) : la / 2, i === ultimo ? naPonta(lb, hasteFim) : lb / 2);
    if (i === 1) retoIni = la - r;
    if (i === ultimo) retoFim = lb - r;
    const p1 = mais(v, { x: (a.x - v.x) / la, y: (a.y - v.y) / la }, r);
    const p2 = mais(v, { x: (b.x - v.x) / lb, y: (b.y - v.y) / lb }, r);
    curva.push(p1);
    for (let k = 1; k <= 12; k++) {
      const t = k / 12, u = 1 - t;
      curva.push({ x: u * u * p1.x + 2 * u * t * v.x + t * t * p2.x, y: u * u * p1.y + 2 * u * t * v.y + t * t * p2.y });
    }
  }
  curva.push(pts[pts.length - 1]);
  return { curva, retoIni, retoFim };
}

/** Afastamento máximo da linha reta entre as pontas. */
function desvioDaReta(pts: Ponto[]): number {
  const a = pts[0], b = pts[pts.length - 1];
  const l = dist(a, b);
  if (l < 1e-9) return Math.max(...pts.map((p) => dist(p, a)));
  return Math.max(...pts.map((p) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / l));
}

/**
 * Rota do conector: curva direta (Bézier, como no Miro) ou, se ela cortaria uma das formas, uma curva que dá a volta por
 * fora delas. Os pontos saem da curva a cada ~14 px — com eles o Excalidraw desenha exatamente essa curva. A linha sai e
 * chega retinha pela normal: nas pontas com seta por uma haste de até 50 px (a ponta sai no tamanho certo e apontando
 * para a bolinha); nas outras, o segundo/penúltimo ponto fica na normal.
 */
export function rotaDoConector(ini: Extremidade, fim: Extremidade, estilo: EstiloConector = "curva", setas: SetasDoConector = SETAS_PADRAO): Rota {
  if (estilo === "reta") {
    const pontos = [ini.ponto, fim.ponto];
    return { pontos, comprimento: dist(ini.ponto, fim.ponto), giro: 0, contorna: false };
  }
  const distancia = dist(ini.ponto, fim.ponto);
  const hasteIni = setas.inicio && ini.normal ? Math.min(HASTE, distancia * 0.3) : 0;
  const hasteFim = setas.fim && fim.normal ? Math.min(HASTE, distancia * 0.3) : 0;
  let curva = curvaDireta(ini, fim, hasteIni, hasteFim);
  let retoIni = hasteIni, retoFim = hasteFim;
  let contorna = false;
  if ((ini.caixa && atravessa(ini.caixa, curva, true)) || (fim.caixa && atravessa(fim.caixa, curva, false))) {
    // A maior folga que não faça o caminho dar uma volta bem maior
    let melhor: { caminho: Ponto[]; custo: number } | null = null;
    for (const folga of FOLGAS_CONTORNO) {
      const caminho = caminhoPorFora(ini, fim, folga, hasteIni, hasteFim);
      if (!caminho || caminho.length < 3) continue;
      const custo = comprimentoDe(caminho) + (FOLGAS_CONTORNO[0] - folga) * 10;
      if (!melhor || custo < melhor.custo) melhor = { caminho, custo };
    }
    if (melhor) {
      ({ curva, retoIni, retoFim } = arredondar(melhor.caminho, hasteIni, hasteFim));
      contorna = true;
    }
  }
  const comprimento = comprimentoDe(curva);
  const giro = giroDe(curva);
  if (desvioDaReta(curva) < 0.75) return { pontos: [ini.ponto, fim.ponto], comprimento, giro, contorna };
  // Trecho reto junto de cada ponta que vira um trecho só da seta (haste), e o miolo em pontos a cada ~14 px
  const pontaSolta = (seta: boolean) => (seta ? Math.min(HASTE, comprimento * 0.3) : 0);
  const s0 = ini.normal ? Math.min(retoIni, hasteIni) : pontaSolta(setas.inicio);
  const e0 = fim.normal ? Math.min(retoFim, hasteFim) : pontaSolta(setas.fim);
  const partes = Math.min(78, Math.max(3, Math.round((comprimento - s0 - e0) / PASSO_DOS_PONTOS)));
  const pontos = [ini.ponto, ...amostrar(curva, s0, comprimento - e0, partes), fim.ponto]
    .filter((p, i, l) => i === 0 || dist(p, l[i - 1]) > 0.5);
  const n = pontos.length;
  if (n > 2 && ini.normal && s0 === 0) pontos[1] = mais(ini.ponto, ini.normal, dist(ini.ponto, pontos[1]));
  if (n > 2 && fim.normal && e0 === 0) pontos[n - 2] = mais(fim.ponto, fim.normal, dist(fim.ponto, pontos[n - 2]));
  pontos[0] = ini.ponto;
  pontos[n - 1] = fim.ponto;
  return { pontos, comprimento, giro, contorna };
}

/** Quanto pior a ligação: comprimento, voltas e contorno pesam (para escolher o lado sozinho). */
export function custoDaRota(r: Rota): number {
  return r.comprimento + (r.giro * 180) / Math.PI * 0.6 + (r.contorna ? 240 : 0);
}

/** Melhor par de pontas (a de menor custo) entre as opções de cada lado. */
export function melhorPar(inicios: Extremidade[], fins: Extremidade[], estilo: EstiloConector = "curva", setas: SetasDoConector = SETAS_PADRAO): { i: number; j: number; rota: Rota } {
  let melhor: { i: number; j: number; rota: Rota; custo: number } | null = null;
  inicios.forEach((a, i) => fins.forEach((b, j) => {
    const rota = rotaDoConector(a, b, estilo, setas);
    const custo = custoDaRota(rota);
    if (!melhor || custo < melhor.custo - 1e-6) melhor = { i, j, rota, custo };
  }));
  const { i, j, rota } = melhor!;
  return { i, j, rota };
}

/**
 * Trechos de Bézier da curva que o Excalidraw desenha por esses pontos (roughjs: Catmull-Rom com as pontas repetidas).
 * Serve para a prévia ficar idêntica ao resultado.
 */
export function trechosDaCurva(pontos: Ponto[]): [Ponto, Ponto, Ponto, Ponto][] {
  if (pontos.length < 3) return [];
  const p = [pontos[0], ...pontos, pontos[pontos.length - 1]];
  const trechos: [Ponto, Ponto, Ponto, Ponto][] = [];
  for (let i = 1; i + 2 < p.length; i++) {
    trechos.push([
      p[i],
      { x: p[i].x + (p[i + 1].x - p[i - 1].x) / 6, y: p[i].y + (p[i + 1].y - p[i - 1].y) / 6 },
      { x: p[i + 1].x - (p[i + 2].x - p[i].x) / 6, y: p[i + 1].y - (p[i + 2].y - p[i].y) / 6 },
      p[i + 1],
    ]);
  }
  return trechos;
}

/** Caminho SVG (atributo d) da curva que o Excalidraw desenha por esses pontos. */
export function caminhoDaCurva(pontos: Ponto[]): string {
  const f = (p: Ponto) => `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`;
  if (pontos.length < 3) return `M${f(pontos[0])} L${f(pontos[pontos.length - 1])}`;
  return `M${f(pontos[0])}` + trechosDaCurva(pontos).map(([, c1, c2, p]) => ` C${f(c1)} ${f(c2)} ${f(p)}`).join("");
}
