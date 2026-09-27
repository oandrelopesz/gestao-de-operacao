import test from "node:test";
import assert from "node:assert/strict";
import { contem, ladoOposto, pontoDoLado, posicaoAoLado } from "./fluxoConectores.ts";

const perto = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6, `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
};

test("pontos de conexão no meio de cada lado, afastados para fora", () => {
  const c = { x: 100, y: 50, width: 200, height: 100 };
  perto(pontoDoLado(c, "cima"), { x: 200, y: 50 });
  perto(pontoDoLado(c, "direita", 10), { x: 310, y: 100 });
  perto(pontoDoLado(c, "baixo", 10), { x: 200, y: 160 });
  perto(pontoDoLado(c, "esquerda"), { x: 100, y: 100 });
});

test("forma girada 90°: o ponto 'direita' vai para baixo do centro", () => {
  const c = { x: 0, y: 0, width: 200, height: 100, angle: Math.PI / 2 };
  perto(pontoDoLado(c, "direita"), { x: 100, y: 150 });
});

test("contem respeita a margem e o giro", () => {
  const c = { x: 0, y: 0, width: 100, height: 40 };
  assert.ok(contem(c, { x: 50, y: 20 }));
  assert.ok(!contem(c, { x: 50, y: 55 }));
  assert.ok(contem(c, { x: 50, y: 55 }, 20));
  const girada = { ...c, angle: Math.PI / 2 };
  assert.ok(contem(girada, { x: 50, y: -25 }));
});

test("cópia ao lado fica centrada no eixo e anda se o lugar estiver ocupado", () => {
  const origem = { x: 0, y: 0, width: 200, height: 100 };
  assert.deepEqual(posicaoAoLado(origem, 200, 100, "direita", []), { x: 280, y: 0 });
  assert.deepEqual(posicaoAoLado(origem, 100, 60, "baixo", []), { x: 50, y: 180 });
  const ocupada = { x: 280, y: 0, width: 200, height: 100 };
  const pos = posicaoAoLado(origem, 200, 100, "direita", [ocupada]);
  assert.equal(pos.y, 0);
  assert.ok(pos.x >= 280 + 200, `andou para a direita: ${pos.x}`);
  assert.equal(ladoOposto("direita"), "esquerda");
  assert.equal(ladoOposto("cima"), "baixo");
});

test("lugarLivre: centro vazio fica no centro; ocupado, vai para o espaço livre mais perto", async () => {
  const { lugarLivre } = await import("./fluxoConectores.ts");
  assert.deepEqual(lugarLivre({ x: 500, y: 300 }, 200, 100, []), { x: 400, y: 250 });
  const ocupada = { x: 380, y: 230, width: 240, height: 140 };
  const pos = lugarLivre({ x: 500, y: 300 }, 200, 100, [ocupada]);
  const caixa = { ...pos, width: 200, height: 100 };
  const sobrepoe = caixa.x < ocupada.x + ocupada.width + 24 && caixa.x + caixa.width + 24 > ocupada.x &&
    caixa.y < ocupada.y + ocupada.height + 24 && caixa.y + caixa.height + 24 > ocupada.y;
  assert.ok(!sobrepoe, JSON.stringify(pos));
  // O mais perto possível: não anda mais que a soma das metades + margem em nenhum eixo
  assert.ok(Math.abs(pos.x + 100 - 500) <= 260 && Math.abs(pos.y + 50 - 300) <= 160, JSON.stringify(pos));
});

test("ladoDeFrente: o lado do destino voltado para a origem; ladoPerto encaixa só perto da bolinha", async () => {
  const { ladoDeFrente, ladoPerto } = await import("./fluxoConectores.ts");
  const destino = { x: 400, y: 0, width: 200, height: 100 };
  assert.equal(ladoDeFrente({ x: 0, y: 0, width: 200, height: 100 }, destino), "esquerda");
  assert.equal(ladoDeFrente({ x: 400, y: 400, width: 200, height: 100 }, destino), "baixo");
  assert.equal(ladoDeFrente({ x: 420, y: -300, width: 100, height: 60 }, destino), "cima");
  assert.equal(ladoPerto(destino, { x: 605, y: 52 }, 20), "direita");
  assert.equal(ladoPerto(destino, { x: 500, y: 50 }, 20), null);
});

test("conector: normal do lado (com giro), lado mais próximo e saída pela borda real", async () => {
  const { normalDoLado, ladoMaisProximo, saidaDoPoligono, saidaDaElipse } = await import("./fluxoConectores.ts");
  assert.deepEqual(normalDoLado("direita"), { x: 1, y: 0 });
  const girada = normalDoLado("direita", Math.PI / 2);
  assert.ok(Math.abs(girada.x) < 1e-9 && Math.abs(girada.y - 1) < 1e-9);
  assert.equal(ladoMaisProximo({ x: 0, y: 0, width: 200, height: 100 }, { x: 190, y: 40 }), "direita");
  assert.equal(ladoMaisProximo({ x: 0, y: 0, width: 200, height: 100 }, { x: 90, y: 95 }), "baixo");
  // Faixa de funil (trapézio): saindo do centro para a direita, bate no lado inclinado, antes da caixa
  const trapezio = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 250, y: 100 }, { x: 50, y: 100 }];
  const s = saidaDoPoligono(trapezio, { x: 150, y: 50 }, { x: 1, y: 0 })!;
  assert.ok(Math.abs(s.x - 275) < 1e-6 && Math.abs(s.y - 50) < 1e-6, JSON.stringify(s));
  const e = saidaDaElipse({ x: 0, y: 0, width: 200, height: 100 }, { x: 100, y: 50 }, { x: 0, y: -1 })!;
  assert.ok(Math.abs(e.x - 100) < 1e-6 && Math.abs(e.y) < 1e-6, JSON.stringify(e));
});

// ---------------------------------------------------------------- Rota do conector

type P = { x: number; y: number };
type C = { x: number; y: number; width: number; height: number; angle?: number };
const cub = (p0: P, c1: P, c2: P, p3: P, t: number): P => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
  };
};

async function ferramentas() {
  const m = await import("./fluxoConectores.ts");
  const ponta = (c: C, lado: "cima" | "direita" | "baixo" | "esquerda") => ({ ponto: m.pontoDoLado(c, lado), normal: m.normalDoLado(lado, c.angle ?? 0), caixa: c });
  /** A curva como o Excalidraw a desenha (mesma conta do roughjs), bem amostrada */
  const desenho = (pts: P[]) => m.trechosDaCurva(pts).flatMap(([p0, c1, c2, p3]) => Array.from({ length: 24 }, (_, k) => cub(p0, c1, c2, p3, (k + 1) / 24)));
  const dentro = (c: C, pts: P[]) => pts.filter((p) => m.contem(c, p, -1));
  const direcao = (a: P, b: P) => { const l = Math.hypot(b.x - a.x, b.y - a.y); return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
  return { ...m, ponta, desenho, dentro, direcao };
}

test("desenho da curva: mesma conta do Excalidraw (Catmull-Rom com as pontas repetidas)", async () => {
  const { trechosDaCurva, caminhoDaCurva } = await ferramentas();
  const t = trechosDaCurva([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 24, y: 12 }]);
  assert.equal(t.length, 2);
  perto(t[0][1], { x: 2, y: 0 });
  perto(t[0][2], { x: 8, y: -2 });
  perto(t[0][3], { x: 12, y: 0 });
  assert.match(caminhoDaCurva([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 24, y: 12 }]), /^M0,0 C.+ C.+24,12$/);
  assert.equal(caminhoDaCurva([{ x: 0, y: 0 }, { x: 30, y: 5 }]), "M0,0 L30,5");
});

test("conector frente a frente: cravado nas bolinhas, sai e chega perpendicular, sem laço", async () => {
  const { rotaDoConector, ponta, desenho, trechosDaCurva, direcao } = await ferramentas();
  const A = { x: -200, y: -50, width: 200, height: 100 };
  const B = { x: 300, y: 50, width: 200, height: 100 };
  const r = rotaDoConector(ponta(A, "direita"), ponta(B, "esquerda"));
  assert.equal(r.contorna, false);
  perto(r.pontos[0], { x: 0, y: 0 });
  perto(r.pontos[r.pontos.length - 1], { x: 300, y: 100 });
  const t = trechosDaCurva(r.pontos);
  const sai = direcao(t[0][0], t[0][1]), chega = direcao(t[t.length - 1][2], t[t.length - 1][3]);
  assert.ok(sai.x > 0.9999, `sai na horizontal: ${JSON.stringify(sai)}`);
  assert.ok(chega.x > 0.9999, `chega na horizontal: ${JSON.stringify(chega)}`);
  const d = desenho(r.pontos);
  for (let i = 1; i < d.length; i++) assert.ok(d[i].x >= d[i - 1].x - 0.01, `sem laço (x sempre avança) em ${i}`);
  assert.ok(d.every((p) => p.y > -0.5 && p.y < 100.5), "não passa das alturas das duas bolinhas");
});

test("conector alinhado vira reta de 2 pontos", async () => {
  const { rotaDoConector, ponta } = await ferramentas();
  const r = rotaDoConector(ponta({ x: -200, y: -50, width: 200, height: 100 }, "direita"), ponta({ x: 300, y: -50, width: 200, height: 100 }, "esquerda"));
  assert.equal(r.pontos.length, 2);
});

test("destino de costas (entrar por cima vindo de baixo): contorna sem atravessar nenhuma das formas", async () => {
  const { rotaDoConector, ponta, desenho, dentro, trechosDaCurva, direcao } = await ferramentas();
  const A = { x: -200, y: -50, width: 200, height: 100 };
  const B = { x: 100, y: -300, width: 200, height: 100 };
  const r = rotaDoConector(ponta(A, "direita"), ponta(B, "cima"));
  assert.equal(r.contorna, true);
  perto(r.pontos[r.pontos.length - 1], { x: 200, y: -300 });
  const d = desenho(r.pontos);
  assert.deepEqual(dentro(A, d), []);
  assert.deepEqual(dentro(B, d), []);
  const t = trechosDaCurva(r.pontos);
  const chega = direcao(t[t.length - 1][2], t[t.length - 1][3]);
  assert.ok(chega.y > 0.9999, `entra por cima, descendo: ${JSON.stringify(chega)}`);
});

test("meia-volta (sai pela direita para uma forma à esquerda): contorna por fora", async () => {
  const { rotaDoConector, ponta, desenho, dentro } = await ferramentas();
  const A = { x: 400, y: -50, width: 200, height: 100 };
  const B = { x: 0, y: -50, width: 200, height: 100 };
  const r = rotaDoConector(ponta(A, "direita"), ponta(B, "esquerda"));
  assert.equal(r.contorna, true);
  const d = desenho(r.pontos);
  assert.deepEqual(dentro(A, d), []);
  assert.deepEqual(dentro(B, d), []);
});

test("ponta começando um pouco para dentro da caixa (faixa de funil) não força contorno", async () => {
  const { rotaDoConector, ponta } = await ferramentas();
  const A = { x: -200, y: -50, width: 200, height: 100 };
  const r = rotaDoConector({ ponto: { x: -15, y: 0 }, normal: { x: 1, y: 0 }, caixa: A }, ponta({ x: 300, y: 50, width: 200, height: 100 }, "esquerda"));
  assert.equal(r.contorna, false);
  perto(r.pontos[0], { x: -15, y: 0 });
});

test("ponta solta: termina no ponteiro e sai perpendicular; estilo reta tem só as pontas", async () => {
  const { rotaDoConector, ponta, trechosDaCurva, direcao } = await ferramentas();
  const A = { x: -200, y: -50, width: 200, height: 100 };
  const r = rotaDoConector(ponta(A, "direita"), { ponto: { x: 300, y: 200 }, normal: null, caixa: null });
  perto(r.pontos[r.pontos.length - 1], { x: 300, y: 200 });
  assert.ok(direcao(trechosDaCurva(r.pontos)[0][0], trechosDaCurva(r.pontos)[0][1]).x > 0.9999);
  const reta = rotaDoConector(ponta(A, "direita"), ponta({ x: 300, y: 50, width: 200, height: 100 }, "esquerda"), "reta");
  assert.deepEqual(reta.pontos, [{ x: 0, y: 0 }, { x: 300, y: 100 }]);
});

test("escolha automática do lado: o de frente ganha, o de costas perde", async () => {
  const { melhorPar, rotaDoConector, custoDaRota, ponta, LADOS } = await ferramentas();
  const A = { x: -200, y: -50, width: 200, height: 100 };
  const B = { x: 400, y: 150, width: 200, height: 100 };
  const fins = LADOS.map((l) => ponta(B, l));
  const { j } = melhorPar([ponta(A, "direita")], fins);
  assert.ok(["esquerda", "cima"].includes(LADOS[j]), LADOS[j]);
  const custos = fins.map((f) => custoDaRota(rotaDoConector(ponta(A, "direita"), f)));
  assert.equal(Math.max(...custos), custos[LADOS.indexOf("direita")]);
  // Destino bem à direita e na mesma altura: esquerda
  const C = { x: 500, y: -40, width: 200, height: 80 };
  assert.equal(LADOS[melhorPar([ponta(A, "direita")], LADOS.map((l) => ponta(C, l))).j], "esquerda");
});

test("ponta com seta: haste reta de 50 px (a ponta sai no tamanho cheio); sem seta, a curva segue direto", async () => {
  const { rotaDoConector, ponta } = await ferramentas();
  const A = { x: -200, y: -50, width: 200, height: 100 };
  const B = { x: 300, y: 150, width: 200, height: 100 };
  const trecho = (pts: P[], i: number, j: number) => Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
  const r = rotaDoConector(ponta(A, "direita"), ponta(B, "esquerda"));
  perto(r.pontos[r.pontos.length - 2], { x: 250, y: 200 });
  assert.ok(trecho(r.pontos, 0, 1) < 20, "no início (sem seta) o segundo ponto fica perto");
  const semSeta = rotaDoConector(ponta(A, "direita"), ponta(B, "esquerda"), "curva", { inicio: false, fim: false });
  assert.ok(trecho(semSeta.pontos, semSeta.pontos.length - 1, semSeta.pontos.length - 2) < 20);
  const duas = rotaDoConector(ponta(A, "direita"), ponta(B, "esquerda"), "curva", { inicio: true, fim: true });
  perto(duas.pontos[1], { x: 50, y: 0 });
  // Contornando, a haste também fica reta
  const costas = rotaDoConector(ponta(A, "direita"), ponta({ x: 100, y: -300, width: 200, height: 100 }, "cima"));
  perto(costas.pontos[costas.pontos.length - 2], { x: 200, y: -350 });
  // Ponta solta com seta: último trecho longo também
  const solta = rotaDoConector(ponta(A, "direita"), { ponto: { x: 400, y: 300 }, normal: null, caixa: null });
  assert.ok(trecho(solta.pontos, solta.pontos.length - 1, solta.pontos.length - 2) > 45);
});
