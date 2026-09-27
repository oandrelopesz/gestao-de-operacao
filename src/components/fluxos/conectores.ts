// Conectores no estilo Miro: cada ponta da seta fica cravada numa bolinha (lado) de uma forma — ou solta num ponto — e
// acompanha colada quando a forma se move. Guardado em `customData.conector` ({ de, para }); a seta não usa a amarração
// do Excalidraw (que mira o centro e faz a ponta escorregar pela borda). A geometria é sempre recalculada daqui, com a
// rota de fluxoConectores (curva direta ou contornando as formas).
import { CaptureUpdateAction, convertToExcalidrawElements, newElementWith, ROUNDNESS } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  LADOS, centroDa, contem, melhorPar, normalDoLado, pontoDoLado, rotaDoConector, saidaDaElipse, saidaDoPoligono,
  type Extremidade, type Lado, type Ponto, type SetasDoConector,
} from "@/lib/fluxoConectores";
import { MARCA_ANCORA } from "./inserir";

type El = ExcalidrawElement;
type Seta = El & {
  points: readonly [number, number][];
  startBinding: { elementId: string } | null;
  endBinding: { elementId: string } | null;
  elbowed?: boolean;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
};

export type Ponta = { id: string; lado: Lado } | { x: number; y: number };
export interface DadosConector {
  de: Ponta;
  para: Ponta;
}

/** Raio do "ímã" das bolinhas do destino (px na tela): soltar perto de uma escolhe aquele lado; longe, o melhor lado. */
export const RAIO_IMA = 26;

const LIGAVEIS = new Set(["rectangle", "ellipse", "diamond", "image"]);
export const podeLigar = (e: El | undefined | null): e is El => !!e && !e.isDeleted && LIGAVEIS.has(e.type);
export const dadosConector = (e: El): DadosConector | undefined => (e.customData as { conector?: DadosConector } | undefined)?.conector;
const ehAncora = (e: El) => !!(e.customData as Record<string, unknown> | undefined)?.[MARCA_ANCORA];
const ehSeta = (e: El): e is Seta => e.type === "arrow";
const novoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** Seta que é conector (o que o Excalidraw roteia em cotovelo fica de fora) — as alças dela são as nossas. */
export const ehConector = (e: El | undefined | null): e is Seta => !!e && !e.isDeleted && ehSeta(e) && !e.elbowed && !!dadosConector(e);

/** Lados que aceitam ligação: faixa de funil/pirâmide só esquerda e direita (em cima e embaixo estão as vizinhas). */
export function ladosDe(el: El, todos: readonly El[]): Lado[] {
  const grupo = ehAncora(el) ? el.groupIds[el.groupIds.length - 1] : undefined;
  const faixa = !!grupo && todos.filter((e) => !e.isDeleted && ehAncora(e) && e.groupIds.includes(grupo)).length > 1;
  return faixa ? ["direita", "esquerda"] : LADOS;
}

/** Ponto de conexão do lado (na borda real do desenho, nas formas extras) e a direção para fora. */
export function conexaoDe(el: El, lado: Lado, todos: readonly El[]): { ponto: Ponto; normal: Ponto } {
  const normal = normalDoLado(lado, el.angle);
  const base = pontoDoLado(el, lado, 0);
  if (!ehAncora(el)) return { ponto: base, normal };
  const grupo = el.groupIds[el.groupIds.length - 1];
  const centro = centroDa(el);
  let melhor: Ponto | null = null;
  let maior = -1;
  for (const d of todos) {
    if (d.isDeleted || d.id === el.id || !grupo || !d.groupIds.includes(grupo) || ehAncora(d)) continue;
    let s: Ponto | null = null;
    if (d.type === "line") {
      const pts = (d as Seta).points.map(([px, py]) => ({ x: d.x + px, y: d.y + py }));
      s = saidaDoPoligono(pts, centro, normal);
    } else if (d.type === "ellipse") {
      s = saidaDaElipse(d, centro, normal);
    }
    // Só a borda que está dentro desta âncora (no funil, a faixa de cima não conta para a de baixo)
    if (!s || !contem(el, s, 2)) continue;
    const dist = Math.hypot(s.x - centro.x, s.y - centro.y);
    if (dist > maior) { maior = dist; melhor = s; }
  }
  return { ponto: melhor ?? base, normal };
}

/** A ponta como a rota precisa: onde fica, a normal e a forma que a linha não pode cortar. */
export function extremidadeDe(el: El, lado: Lado, todos: readonly El[]): Extremidade {
  return { ...conexaoDe(el, lado, todos), caixa: el };
}

export function extremidadeDaPonta(p: Ponta, porId: Map<string, El>, todos: readonly El[]): Extremidade | null {
  if ("id" in p) {
    const el = porId.get(p.id);
    return el && !el.isDeleted ? extremidadeDe(el, p.lado, todos) : null;
  }
  return { ponto: { x: p.x, y: p.y }, normal: null, caixa: null };
}

/**
 * Lado do destino para uma ponta solta no `ponteiro`: o da bolinha perto dele (ímã); senão o que dá a ligação mais
 * limpa com a outra ponta.
 */
export function escolherLado(alvo: El, ponteiro: Ponto, zoom: number, outra: Extremidade, todos: readonly El[], outraEhInicio = true): { lado: Lado; ima: boolean } {
  const lados = ladosDe(alvo, todos);
  let perto: Lado | null = null;
  let menor = RAIO_IMA / zoom;
  for (const lado of lados) {
    const p = conexaoDe(alvo, lado, todos).ponto;
    const d = Math.hypot(p.x - ponteiro.x, p.y - ponteiro.y);
    if (d <= menor) { menor = d; perto = lado; }
  }
  if (perto) return { lado: perto, ima: true };
  const opcoes = lados.map((l) => extremidadeDe(alvo, l, todos));
  const par = outraEhInicio ? melhorPar([outra], opcoes) : melhorPar(opcoes, [outra]);
  return { lado: lados[outraEhInicio ? par.j : par.i], ima: false };
}

/** Que pontas da seta desenham ponta de seta (lá a linha chega por uma haste reta). */
export const setasDe = (e: El): SetasDoConector => ({ inicio: !!(e as Seta).startArrowhead, fim: !!(e as Seta).endArrowhead });

/** Pontos (absolutos) do conector entre duas pontas — os mesmos da seta que fica no quadro (a prévia usa isto). */
export function pontosEntre(de: Extremidade, para: Extremidade, reta = false, setas?: SetasDoConector): Ponto[] {
  return rotaDoConector(de, para, reta ? "reta" : "curva", setas).pontos;
}

type Geometria = { x: number; y: number; points: [number, number][]; width: number; height: number };

// Rota refeita só quando uma das formas (ou o estilo/as pontas) mudou: mover a tela e selecionar não custam nada
const cacheGeometria = new Map<string, { chave: string; g: Geometria | null }>();

/** Posição e pontos que o conector deve ter agora (null se uma das formas não está no quadro). */
export function geometriaDoConector(seta: El, dados: DadosConector, porId: Map<string, El>, todos: readonly El[]): Geometria | null {
  const versao = (p: Ponta) => ("id" in p ? `${p.id}:${porId.get(p.id)?.version ?? "x"}` : "");
  const setas = setasDe(seta);
  const chave = `${seta.roundness ? 1 : 0}|${+setas.inicio}${+setas.fim}|${JSON.stringify(dados)}|${versao(dados.de)}|${versao(dados.para)}`;
  const salvo = cacheGeometria.get(seta.id);
  if (salvo?.chave === chave) return salvo.g;
  const a = extremidadeDaPonta(dados.de, porId, todos);
  const b = extremidadeDaPonta(dados.para, porId, todos);
  let g: Geometria | null = null;
  if (a && b) {
    const pts = pontosEntre(a, b, !seta.roundness, setas);
    const x = pts[0].x, y = pts[0].y;
    const points = pts.map((p) => [p.x - x, p.y - y] as [number, number]);
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    g = { x, y, points, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
  if (cacheGeometria.size > 2000) cacheGeometria.clear();
  cacheGeometria.set(seta.id, { chave, g });
  return g;
}

function mudou(s: Seta, g: Geometria): boolean {
  if (Math.abs(s.x - g.x) > 0.25 || Math.abs(s.y - g.y) > 0.25 || s.points.length !== g.points.length) return true;
  return s.points.some((p, i) => Math.abs(p[0] - g.points[i][0]) > 0.25 || Math.abs(p[1] - g.points[i][1]) > 0.25);
}

/** Meio do caminho (onde o Excalidraw põe o texto de uma seta), para o texto acompanhar a seta. */
function meioDa(x: number, y: number, pts: readonly [number, number][]): Ponto {
  const i = Math.floor((pts.length - 1) / 2);
  const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
  return { x: x + (a[0] + b[0]) / 2, y: y + (a[1] + b[1]) / 2 };
}

const PONTO_FIXO: Record<Lado, [number, number]> = { direita: [1, 0.5], esquerda: [0, 0.5], cima: [0.5, 0], baixo: [0.5, 1] };

/**
 * Deixa cada conector colado nas suas formas. `pular`: setas que a pessoa está desenhando/arrastando agora.
 * Grava junto com a próxima ação que entra no desfazer (arrastar a forma e a seta voltam juntas).
 */
export function sincronizarConectores(api: ExcalidrawImperativeAPI, pular: Set<string>): void {
  const todos = api.getSceneElementsIncludingDeleted();
  const vivos = todos.filter((e) => !e.isDeleted);
  if (!vivos.some((e) => ehSeta(e) && dadosConector(e))) return;
  const porId = new Map(vivos.map((e) => [e.id, e]));
  const trocas = new Map<string, El>();
  const textoDaSeta = new Map(vivos.filter((e) => e.type === "text" && (e as El & { containerId?: string }).containerId).map((e) => [(e as El & { containerId: string }).containerId, e]));
  for (const e of vivos) {
    if (!ehSeta(e) || pular.has(e.id)) continue;
    const dados = dadosConector(e);
    if (!dados) continue;
    if (e.elbowed) {
      // Escolheu "cotovelo" no painel: vira seta em cotovelo nativa, presa nos mesmos pontos fixos (o Excalidraw roteia)
      const { conector: _c, ...resto } = (e.customData ?? {}) as Record<string, unknown>;
      const presa = (p: Ponta) => ("id" in p && porId.get(p.id) ? { elementId: p.id, focus: 0, gap: 0, fixedPoint: PONTO_FIXO[p.lado] } : null);
      trocas.set(e.id, newElementWith(e as never, { customData: resto, startBinding: presa(dados.de), endBinding: presa(dados.para) } as never) as El);
      for (const p of [dados.de, dados.para]) {
        if (!("id" in p)) continue;
        const f = trocas.get(p.id) ?? porId.get(p.id);
        if (f && !(f.boundElements ?? []).some((b) => b.id === e.id)) {
          trocas.set(p.id, newElementWith(f as never, { boundElements: [...(f.boundElements ?? []), { id: e.id, type: "arrow" }] } as never) as El);
        }
      }
      continue;
    }
    const g = geometriaDoConector(e, dados, porId, vivos);
    if (!g || !mudou(e, g)) continue;
    trocas.set(e.id, newElementWith(e as never, g as never) as El);
    const t = textoDaSeta.get(e.id);
    if (t) {
      const antes = meioDa(e.x, e.y, e.points), depois = meioDa(g.x, g.y, g.points);
      trocas.set(t.id, newElementWith(t as never, { x: t.x + depois.x - antes.x, y: t.y + depois.y - antes.y } as never) as El);
    }
  }
  if (!trocas.size) return;
  api.updateScene({ elements: todos.map((e) => trocas.get(e.id) ?? e), captureUpdate: CaptureUpdateAction.EVENTUALLY });
}

/** Forma ligável sob um ponto (a de cima primeiro), com margem. */
export function formaLigavelSob(vivos: readonly El[], p: Ponto, margem: number, ignorar?: string): El | null {
  let perto: El | null = null;
  for (let i = vivos.length - 1; i >= 0; i--) {
    const e = vivos[i];
    if (e.id === ignorar || !podeLigar(e)) continue;
    if (contem(e, p)) return e;
    if (!perto && contem(e, p, margem)) perto = e;
  }
  return perto;
}

/**
 * Transforma as setas em conectores pelas pontas: presa (pelo Excalidraw) ou em cima de uma forma → a bolinha perto do
 * ponto (ímã) ou, longe das bolinhas, o par de lados que dá a ligação mais limpa; fora das formas, ponta solta. Serve
 * para setas desenhadas com a ferramenta, coladas e quadros antigos.
 */
export function reavaliarPontas(api: ExcalidrawImperativeAPI, ids: string[]): void {
  if (!ids.length) return;
  const todos = api.getSceneElementsIncludingDeleted();
  const vivos = todos.filter((e) => !e.isDeleted);
  const porId = new Map(vivos.map((e) => [e.id, e]));
  const zoom = api.getAppState().zoom.value;
  const trocas = new Map<string, El>();
  const tirarDe = new Map<string, Set<string>>(); // forma → setas que saem do boundElements dela
  for (const id of ids) {
    const s = porId.get(id);
    if (!s || !ehSeta(s) || s.elbowed || s.points.length < 2) continue;
    const ini = { x: s.x + s.points[0][0], y: s.y + s.points[0][1] };
    const ult = s.points[s.points.length - 1];
    const fim = { x: s.x + ult[0], y: s.y + ult[1] };
    // Opções de cada ponta: a bolinha do ímã, todos os lados da forma, ou o próprio ponto (solta)
    const opcoes = (pt: Ponto, presa: { elementId: string } | null, outraForma?: string): Ponta[] => {
      const b = presa ? porId.get(presa.elementId) : undefined;
      const f = podeLigar(b) && b.id !== outraForma ? b : formaLigavelSob(vivos, pt, 12 / zoom, outraForma ?? s.id);
      if (!f) return [{ x: pt.x, y: pt.y }];
      const lados = ladosDe(f, vivos);
      const ima = lados.find((l) => { const c = conexaoDe(f, l, vivos).ponto; return Math.hypot(c.x - pt.x, c.y - pt.y) <= RAIO_IMA / zoom; });
      return (ima ? [ima] : lados).map((lado) => ({ id: f.id, lado }));
    };
    const deOpcoes = opcoes(ini, s.startBinding);
    const formaDe = "id" in deOpcoes[0] ? deOpcoes[0].id : undefined;
    const paraOpcoes = opcoes(fim, s.endBinding, formaDe);
    const ext = (p: Ponta) => extremidadeDaPonta(p, porId, vivos)!;
    const par = melhorPar(deOpcoes.map(ext), paraOpcoes.map(ext), s.roundness ? "curva" : "reta", setasDe(s));
    const dados: DadosConector = { de: deOpcoes[par.i], para: paraOpcoes[par.j] };
    for (const b of [s.startBinding, s.endBinding]) {
      if (b) tirarDe.set(b.elementId, (tirarDe.get(b.elementId) ?? new Set()).add(s.id));
    }
    const { conector: _c, ...resto } = (s.customData ?? {}) as Record<string, unknown>;
    const ligada = "id" in dados.de || "id" in dados.para;
    const base = { startBinding: null, endBinding: null, customData: ligada ? { ...resto, conector: dados } : resto };
    const provisoria = newElementWith(s as never, base as never) as El;
    const g = ligada ? geometriaDoConector(provisoria, dados, porId, vivos) : null;
    trocas.set(s.id, g ? (newElementWith(provisoria as never, g as never) as El) : provisoria);
  }
  for (const [formaId, setas] of tirarDe) {
    const f = porId.get(formaId);
    if (!f?.boundElements) continue;
    trocas.set(formaId, newElementWith(f as never, { boundElements: f.boundElements.filter((b) => !setas.has(b.id)) } as never) as El);
  }
  if (trocas.size) api.updateScene({ elements: todos.map((e) => trocas.get(e.id) ?? e), captureUpdate: CaptureUpdateAction.EVENTUALLY });
}

/** Setas presas do jeito do Excalidraw (desenhadas com a ferramenta, coladas, quadros antigos) que ainda não são conectores. */
export function setasParaConverter(vivos: readonly El[], pular: Set<string>): string[] {
  return vivos
    .filter((e) => ehSeta(e) && !e.elbowed && !pular.has(e.id) && (e.startBinding || e.endBinding))
    .map((e) => e.id);
}

/** Conector novo de uma bolinha até outra (ou até um ponto), já no lugar certo; uma alteração com desfazer. */
export function criarConector(api: ExcalidrawImperativeAPI, de: { id: string; lado: Lado }, para: Ponta): void {
  const todos = api.getSceneElementsIncludingDeleted();
  const vivos = todos.filter((e) => !e.isDeleted);
  const porId = new Map(vivos.map((e) => [e.id, e]));
  const id = novoId();
  const st = api.getAppState();
  const dados: DadosConector = { de, para };
  const [base] = convertToExcalidrawElements([{
    id, type: "arrow", x: 0, y: 0, points: [[0, 0], [1, 1]] as never, strokeColor: st.currentItemStrokeColor || "#1e1e1e",
    strokeWidth: 2, roughness: 0, roundness: { type: ROUNDNESS.PROPORTIONAL_RADIUS }, endArrowhead: "arrow", startArrowhead: null,
    customData: { conector: dados },
  }], { regenerateIds: false });
  const g = geometriaDoConector(base as El, dados, porId, vivos);
  if (!g) return;
  const seta = newElementWith(base as never, g as never) as El;
  api.updateScene({ elements: [...todos, seta], appState: { selectedElementIds: {}, selectedGroupIds: {} }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}

/**
 * Esconde (ou mostra de novo) um conector enquanto a pessoa arrasta uma ponta dele — a prévia desenha a versão nova.
 * Entra no desfazer junto com a mudança da ponta (que devolve a opacidade), então não sobra nada.
 */
export function esconderConector(api: ExcalidrawImperativeAPI, id: string, esconder: boolean, opacidade: number): void {
  const todos = api.getSceneElementsIncludingDeleted();
  api.updateScene({
    elements: todos.map((e) => (e.id === id ? (newElementWith(e as never, { opacity: esconder ? 0 : opacidade } as never) as El) : e)),
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  });
}

/** Troca uma ponta de um conector (arrastada para outra bolinha, outra forma ou para o vazio); uma alteração com desfazer. */
export function moverPonta(api: ExcalidrawImperativeAPI, id: string, qual: "de" | "para", nova: Ponta, opacidade: number): void {
  const todos = api.getSceneElementsIncludingDeleted();
  const vivos = todos.filter((e) => !e.isDeleted);
  const porId = new Map(vivos.map((e) => [e.id, e]));
  const s = porId.get(id);
  const dadosAntes = s ? dadosConector(s) : undefined;
  if (!s || !dadosAntes) return;
  const dados = { ...dadosAntes, [qual]: nova };
  const soltas = !("id" in dados.de) && !("id" in dados.para);
  const { conector: _c, ...resto } = (s.customData ?? {}) as Record<string, unknown>;
  const provisoria = newElementWith(s as never, { opacity: opacidade, customData: soltas ? resto : { ...resto, conector: dados } } as never) as El;
  // As duas soltas: vira uma seta comum, com a mesma curva de agora
  const g = geometriaDoConector(provisoria, dados, porId, vivos);
  const seta = g ? (newElementWith(provisoria as never, g as never) as El) : provisoria;
  api.updateScene({ elements: todos.map((e) => (e.id === id ? seta : e)), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}
