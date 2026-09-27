// Operações do mapa mental no quadro do Excalidraw. Tópico = retângulo arredondado com texto dentro e
// `customData.mm` ({ raiz, pai, lado, ordem, recolhido?, oculto? }); ligação = seta sem ponta presa aos dois
// tópicos, com `customData.mmLigacao` ({ raiz, filho }). A posição vem sempre de `organizar` (fluxoMapaMental).
import { CaptureUpdateAction, FONT_FAMILY, ROUNDNESS, convertToExcalidrawElements, getCommonBounds, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { lugarLivre, rotaDoConector } from "@/lib/fluxoConectores";
import {
  COR_RAIZ, corDoRamo, descendentes, ladoParaNovoFilho, organizar, type LadoMapa, type NoMapa,
} from "@/lib/fluxoMapaMental";
import { centroVisivel } from "./inserir";

type El = ExcalidrawElement;
export interface DadosNo {
  raiz: string;
  pai: string | null;
  lado: LadoMapa;
  ordem: number;
  /** Índice da cor do ramo de 1º nível (a raiz não tem) */
  cor?: number;
  recolhido?: boolean;
  /** Elementos do ramo recolhido (tópicos, textos e ligações), guardados até expandir */
  oculto?: El[];
}

const LARGURA = 180, ALTURA = 48, LARGURA_RAIZ = 240, ALTURA_RAIZ = 64;
const MARCA_EVENTO = "__mapaMental";

export const dadosDo = (e: El | undefined | null): DadosNo | undefined =>
  (e?.customData as { mm?: DadosNo } | undefined)?.mm;
export const ehTopico = (e: El | undefined | null): e is El => !!e && !e.isDeleted && !!dadosDo(e);
const ligacaoDe = (e: El) => (e.customData as { mmLigacao?: { raiz: string; filho: string } } | undefined)?.mmLigacao;
const novoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** O evento de teclado que nós mesmos disparamos (para o Excalidraw) não deve voltar para o nosso atalho. */
export function ehEventoNosso(e: Event): boolean {
  return !!(e as unknown as Record<string, unknown>)[MARCA_EVENTO];
}

function coresDo(dados: DadosNo) {
  if (dados.pai === null) return { traco: COR_RAIZ.traco, fundo: COR_RAIZ.fundo, texto: COR_RAIZ.texto };
  const c = corDoRamo(dados.cor ?? 0);
  return { traco: c.traco, fundo: c.fundo, texto: "#1e1e1e" };
}

function esqueletoTopico(id: string, texto: string, dados: DadosNo): ExcalidrawElementSkeleton & { id: string } {
  const raiz = dados.pai === null;
  const c = coresDo(dados);
  return {
    id, type: "rectangle", x: 0, y: 0, width: raiz ? LARGURA_RAIZ : LARGURA, height: raiz ? ALTURA_RAIZ : ALTURA,
    strokeColor: c.traco, backgroundColor: c.fundo, fillStyle: "solid", strokeWidth: 2, roughness: 0,
    roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS }, customData: { mm: dados },
    label: { text: texto, fontSize: raiz ? 24 : 18, fontFamily: FONT_FAMILY.Nunito, strokeColor: c.texto },
  };
}

function nosDoMapa(vivos: readonly El[], raiz: string): NoMapa[] {
  return vivos.filter((e) => ehTopico(e) && dadosDo(e)!.raiz === raiz).map((e) => {
    const d = dadosDo(e)!;
    return { id: e.id, pai: d.pai, lado: d.lado, ordem: d.ordem, largura: e.width, altura: e.height, recolhido: d.recolhido };
  });
}

/**
 * Recalcula posições e ligações de um mapa e grava tudo numa só alteração (um passo de desfazer).
 * `extras` entram na cena antes da conta (tópicos novos); `mudancas` ajustam elementos existentes (ex.: dados do tópico).
 */
export function organizarMapa(
  api: ExcalidrawImperativeAPI,
  raizId: string,
  extras: El[] = [],
  mudancas: Map<string, Partial<El>> = new Map(),
  selecionar?: string,
): void {
  let todos: El[] = [...api.getSceneElementsIncludingDeleted(), ...extras].map((e) => {
    const m = mudancas.get(e.id);
    return m ? newElementWith(e as never, m as never) : e;
  });
  const porId = new Map(todos.map((e) => [e.id, e]));
  const vivos = todos.filter((e) => !e.isDeleted);
  const raiz = porId.get(raizId);
  if (!raiz || raiz.isDeleted) return;
  const nos = nosDoMapa(vivos, raizId);
  const org = organizar(nos, raizId, { x: raiz.x, y: raiz.y });
  const pendentes = new Map<string, Record<string, unknown>>();
  const muda = (id: string, props: Record<string, unknown>) => pendentes.set(id, { ...(pendentes.get(id) ?? {}), ...props });
  const textoDe = new Map(vivos.filter((e) => e.type === "text" && (e as El & { containerId?: string }).containerId).map((e) => [(e as El & { containerId: string }).containerId, e]));

  for (const n of nos) {
    const pos = org.posicoes[n.id];
    const el = porId.get(n.id)!;
    if (!pos) continue;
    const dx = pos.x - el.x, dy = pos.y - el.y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
    muda(el.id, { x: pos.x, y: pos.y });
    const t = textoDe.get(el.id);
    if (t) muda(t.id, { x: t.x + dx, y: t.y + dy });
  }

  // Ligações: conectores cravados na lateral do pai e do filho (conectores.ts os mantém colados ao arrastar);
  // reaproveita a do filho (se houver) ou cria uma nova
  const ligacoes = new Map(vivos.filter((e) => e.type === "arrow" && ligacaoDe(e)?.raiz === raizId).map((e) => [ligacaoDe(e)!.filho, e]));
  const idsLigacoes = new Set([...ligacoes.values()].map((e) => e.id));
  const novas: El[] = [];
  const noDe = new Map(nos.map((n) => [n.id, n]));
  // Caixa do tópico já no lugar novo (a mesma que conectores.ts usa depois; assim a ligação não é refeita)
  const caixaNova = (id: string) => {
    const el = porId.get(id)!;
    const pos = org.posicoes[id] ?? el;
    return { x: pos.x, y: pos.y, width: el.width, height: el.height, angle: el.angle };
  };
  for (const l of org.ligacoes) {
    const direita = noDe.get(l.filho)!.lado === "dir";
    const saida = { x: direita ? 1 : -1, y: 0 };
    const pontos = rotaDoConector(
      { ponto: l.de, normal: saida, caixa: caixaNova(l.pai) },
      { ponto: l.para, normal: { x: -saida.x, y: 0 }, caixa: caixaNova(l.filho) },
      "curva",
      { inicio: false, fim: false },
    ).pontos.map((q) => [q.x - l.de.x, q.y - l.de.y] as [number, number]);
    const xs = pontos.map((q) => q[0]), ys = pontos.map((q) => q[1]);
    const conector = { de: { id: l.pai, lado: direita ? "direita" : "esquerda" }, para: { id: l.filho, lado: direita ? "esquerda" : "direita" } };
    const geometria = {
      x: l.de.x, y: l.de.y, points: pontos, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
      startBinding: null, endBinding: null,
    };
    const existente = ligacoes.get(l.filho);
    if (existente) {
      muda(existente.id, { ...geometria, customData: { ...(existente.customData ?? {}), conector } });
      continue;
    }
    const filho = porId.get(l.filho)!;
    const id = novoId();
    const [seta] = convertToExcalidrawElements([{
      id, type: "arrow", x: l.de.x, y: l.de.y, points: pontos as never, strokeColor: filho.strokeColor, strokeWidth: 2,
      roughness: 0, roundness: { type: ROUNDNESS.PROPORTIONAL_RADIUS }, startArrowhead: null, endArrowhead: null,
      customData: { mmLigacao: { raiz: raizId, filho: l.filho }, conector },
    }], { regenerateIds: false });
    novas.push(newElementWith(seta as never, geometria as never) as El);
  }
  // Tópicos não guardam mais as ligações como "presas" do Excalidraw (quadros de antes disto guardavam)
  for (const n of nos) {
    const el = porId.get(n.id)!;
    const sobra = (el.boundElements ?? []).filter((b) => !(b.type === "arrow" && idsLigacoes.has(b.id)));
    if (sobra.length !== (el.boundElements ?? []).length) muda(el.id, { boundElements: sobra });
  }

  todos = [...todos.map((e) => {
    const p = pendentes.get(e.id);
    return p ? newElementWith(e as never, p as never) : e;
  }), ...novas];
  api.updateScene({
    elements: todos,
    ...(selecionar ? { appState: { selectedElementIds: { [selecionar]: true }, selectedGroupIds: {}, editingGroupId: null } } : {}),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/** Abre a escrita no tópico (texto já selecionado: digitar substitui). */
export function editarTopico(api: ExcalidrawImperativeAPI, raizDom: HTMLElement, id: string): void {
  api.updateScene({ appState: { selectedElementIds: { [id]: true }, selectedGroupIds: {}, editingGroupId: null } });
  setTimeout(() => {
    const ev = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true });
    Object.defineProperty(ev, MARCA_EVENTO, { value: true });
    raizDom.dispatchEvent(ev);
    setTimeout(() => document.querySelector<HTMLTextAreaElement>(".excalidraw textarea.excalidraw-wysiwyg")?.select(), 40);
  }, 30);
}

/** Mapa novo (ideia central + 4 tópicos) no espaço livre mais perto do meio da tela. */
export function criarMapa(api: ExcalidrawImperativeAPI, raizDom: HTMLElement | null): string {
  const raiz = novoId();
  const topicos: [string, string, DadosNo][] = [
    [raiz, "Ideia central", { raiz, pai: null, lado: "dir", ordem: 0 }],
    ...([["Tópico 1", "dir"], ["Tópico 2", "dir"], ["Tópico 3", "esq"], ["Tópico 4", "esq"]] as const).map(
      ([t, lado], i) => [novoId(), t, { raiz, pai: raiz, lado, ordem: i, cor: i }] as [string, string, DadosNo],
    ),
  ];
  const els = convertToExcalidrawElements(topicos.map(([id, t, d]) => esqueletoTopico(id, t, d)), { regenerateIds: false });
  // Tamanho do mapa pronto (organizado a partir do 0,0) para achar um lugar livre para ele inteiro
  const org = organizar(nosDoMapa(els, raiz), raiz, { x: 0, y: 0 });
  const caixas = els.filter((e) => org.posicoes[e.id]).map((e) => ({ x: org.posicoes[e.id].x, y: org.posicoes[e.id].y, w: e.width, h: e.height }));
  const x1 = Math.min(...caixas.map((c) => c.x)), y1 = Math.min(...caixas.map((c) => c.y));
  const x2 = Math.max(...caixas.map((c) => c.x + c.w)), y2 = Math.max(...caixas.map((c) => c.y + c.h));
  const ocupadas = api.getSceneElements().map((e) => {
    const [a, b, c, d] = getCommonBounds([e]);
    return { x: a, y: b, width: c - a, height: d - b };
  });
  const canto = lugarLivre(centroVisivel(api), x2 - x1, y2 - y1, ocupadas);
  const dx = canto.x - x1, dy = canto.y - y1;
  const posRaiz = { x: org.posicoes[raiz].x + dx, y: org.posicoes[raiz].y + dy };
  const colocados = els.map((e) => ({ ...e, x: e.x + (e.id === raiz || (e as El & { containerId?: string }).containerId === raiz ? posRaiz.x : 0), y: e.y + (e.id === raiz || (e as El & { containerId?: string }).containerId === raiz ? posRaiz.y : 0) }));
  organizarMapa(api, raiz, colocados as El[], new Map(), raiz);
  const a = api.getAppState();
  const [nx1, ny1] = [canto.x, canto.y];
  if (nx1 < -a.scrollX || ny1 < -a.scrollY || nx1 + x2 - x1 > -a.scrollX + a.width / a.zoom.value || ny1 + y2 - y1 > -a.scrollY + a.height / a.zoom.value) {
    api.scrollToContent(api.getSceneElements().filter((e) => dadosDo(e)?.raiz === raiz), { animate: true, duration: 350 });
  }
  if (raizDom) editarTopico(api, raizDom, raiz);
  return raiz;
}

function topicoPorId(api: ExcalidrawImperativeAPI, id: string): El | undefined {
  return api.getSceneElements().find((e) => e.id === id && ehTopico(e));
}

/** Tópico filho (Tab), já com a escrita aberta. */
export function criarFilho(api: ExcalidrawImperativeAPI, raizDom: HTMLElement | null, paiId: string, lado?: LadoMapa): void {
  const pai = topicoPorId(api, paiId);
  if (!pai) return;
  const dp = dadosDo(pai)!;
  const vivos = api.getSceneElements();
  const nos = nosDoMapa(vivos, dp.raiz);
  const irmaos = nos.filter((n) => n.pai === paiId);
  const ladoNovo = dp.pai === null ? (lado ?? ladoParaNovoFilho(nos, paiId)) : dp.lado;
  const mudancas = new Map<string, Partial<El>>();
  // Filho de tópico recolhido: expande antes (senão o novo nasceria escondido)
  if (dp.recolhido) {
    expandir(api, paiId);
    return criarFilho(api, raizDom, paiId, lado);
  }
  const cor = dp.pai === null ? nos.filter((n) => n.pai === paiId).length : dp.cor ?? 0;
  const dados: DadosNo = { raiz: dp.raiz, pai: paiId, lado: ladoNovo, ordem: irmaos.reduce((m, n) => Math.max(m, n.ordem), -1) + 1, cor };
  const id = novoId();
  const novos = convertToExcalidrawElements([esqueletoTopico(id, "Novo tópico", dados)], { regenerateIds: false }) as El[];
  // Nasce já perto do pai (a organização coloca no lugar certo)
  const posicionados = novos.map((e) => ({ ...e, x: e.x + pai.x + pai.width + 72, y: e.y + pai.y }));
  organizarMapa(api, dp.raiz, posicionados as El[], mudancas, id);
  if (raizDom) editarTopico(api, raizDom, id);
}

/** Tópico irmão logo abaixo (Enter); na ideia central, vira filho. */
export function criarIrmao(api: ExcalidrawImperativeAPI, raizDom: HTMLElement | null, id: string): void {
  const el = topicoPorId(api, id);
  if (!el) return;
  const d = dadosDo(el)!;
  if (d.pai === null) return criarFilho(api, raizDom, id);
  const pai = topicoPorId(api, d.pai);
  if (!pai) return;
  const vivos = api.getSceneElements();
  const nos = nosDoMapa(vivos, d.raiz);
  const depois = nos.filter((n) => n.pai === d.pai && n.lado === d.lado && n.ordem > d.ordem).map((n) => n.ordem);
  const ordem = depois.length ? (d.ordem + Math.min(...depois)) / 2 : d.ordem + 1;
  const dados: DadosNo = { raiz: d.raiz, pai: d.pai, lado: d.lado, ordem, cor: dadosDo(pai)!.pai === null ? nos.filter((n) => n.pai === d.pai).length : d.cor };
  const novoIdTopico = novoId();
  const novos = convertToExcalidrawElements([esqueletoTopico(novoIdTopico, "Novo tópico", dados)], { regenerateIds: false }) as El[];
  const posicionados = novos.map((e) => ({ ...e, x: e.x + el.x, y: e.y + el.y + el.height + 20 }));
  organizarMapa(api, d.raiz, posicionados as El[], new Map(), novoIdTopico);
  if (raizDom) editarTopico(api, raizDom, novoIdTopico);
}

/** Ids a sair junto com um ramo: tópicos, textos deles e ligações que chegam neles. */
function idsDoRamo(api: ExcalidrawImperativeAPI, raiz: string, ids: Set<string>): Set<string> {
  const saida = new Set(ids);
  for (const e of api.getSceneElements()) {
    if (e.type === "text" && (e as El & { containerId?: string }).containerId && ids.has((e as El & { containerId: string }).containerId)) saida.add(e.id);
    const l = ligacaoDe(e);
    if (e.type === "arrow" && l?.raiz === raiz && ids.has(l.filho)) saida.add(e.id);
  }
  return saida;
}

/** Apaga o tópico e tudo abaixo dele (na ideia central, o mapa inteiro). Desfaz com Ctrl+Z. */
export function apagarRamo(api: ExcalidrawImperativeAPI, id: string): void {
  const el = topicoPorId(api, id);
  if (!el) return;
  const d = dadosDo(el)!;
  const nos = nosDoMapa(api.getSceneElements(), d.raiz);
  const ids = idsDoRamo(api, d.raiz, new Set([id, ...descendentes(nos, id)]));
  const mudancas = new Map<string, Partial<El>>([...ids].map((i) => [i, { isDeleted: true }]));
  if (d.pai === null) {
    api.updateScene({
      elements: api.getSceneElementsIncludingDeleted().map((e) => (ids.has(e.id) ? newElementWith(e as never, { isDeleted: true } as never) : e)),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    return;
  }
  organizarMapa(api, d.raiz, [], mudancas, d.pai);
}

/** Recolhe: o ramo sai do quadro (e da exportação) e fica guardado no tópico até expandir. */
export function recolher(api: ExcalidrawImperativeAPI, id: string): void {
  const el = topicoPorId(api, id);
  if (!el) return;
  const d = dadosDo(el)!;
  const nos = nosDoMapa(api.getSceneElements(), d.raiz);
  const abaixo = descendentes(nos, id);
  if (!abaixo.length) return;
  const ids = idsDoRamo(api, d.raiz, new Set(abaixo));
  const guardados = api.getSceneElements().filter((e) => ids.has(e.id)).map((e) => JSON.parse(JSON.stringify(e)) as El);
  const mudancas = new Map<string, Partial<El>>([...ids].map((i) => [i, { isDeleted: true }]));
  mudancas.set(id, { customData: { ...(el.customData ?? {}), mm: { ...d, recolhido: true, oculto: guardados } } });
  organizarMapa(api, d.raiz, [], mudancas, id);
}

export function expandir(api: ExcalidrawImperativeAPI, id: string): void {
  const el = topicoPorId(api, id);
  if (!el) return;
  const d = dadosDo(el)!;
  // Os guardados voltam: se a versão apagada ainda está na cena, ela é reativada; senão (quadro reaberto), entra de novo
  const naCena = new Set(api.getSceneElementsIncludingDeleted().map((e) => e.id));
  const extras: El[] = [];
  const mudancas = new Map<string, Partial<El>>();
  for (const g of d.oculto ?? []) {
    // Sem a versão antiga guardada: a reativada precisa ficar mais nova que a apagada
    const { version: _v, versionNonce: _n, ...campos } = g;
    if (naCena.has(g.id)) mudancas.set(g.id, { ...campos, isDeleted: false } as Partial<El>);
    else extras.push(newElementWith(g as never, { isDeleted: false } as never) as El);
  }
  const { oculto: _oculto, recolhido: _recolhido, ...resto } = d;
  mudancas.set(id, { customData: { ...(el.customData ?? {}), mm: resto } });
  organizarMapa(api, d.raiz, extras, mudancas, id);
}

export function alternarRecolher(api: ExcalidrawImperativeAPI, id: string): void {
  const el = topicoPorId(api, id);
  if (!el) return;
  if (dadosDo(el)!.recolhido) expandir(api, id);
  else recolher(api, id);
}

/**
 * Depois de arrastar um tópico: a posição vira ordem entre os irmãos (e troca de lado, se foi para o outro lado da
 * ideia central); arrastar a ideia central leva o mapa junto. Em seguida reorganiza.
 */
export function aposArrastar(api: ExcalidrawImperativeAPI, id: string): void {
  const el = topicoPorId(api, id);
  if (!el) return;
  const d = dadosDo(el)!;
  if (d.pai === null) return organizarMapa(api, d.raiz);
  const vivos = api.getSceneElements();
  const raiz = vivos.find((e) => e.id === d.raiz);
  if (!raiz) return;
  const mudancas = new Map<string, Partial<El>>();
  let lado = d.lado;
  if (dadosDo(vivos.find((e) => e.id === d.pai))?.pai === null) {
    lado = el.x + el.width / 2 < raiz.x + raiz.width / 2 ? "esq" : "dir";
  }
  const irmaos = vivos.filter((e) => ehTopico(e) && dadosDo(e)!.pai === d.pai && (e.id === id || dadosDo(e)!.lado === lado))
    .sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  irmaos.forEach((e, i) => {
    const di = dadosDo(e)!;
    const nova = { ...di, ordem: i, ...(e.id === id ? { lado } : {}) };
    if (nova.ordem !== di.ordem || nova.lado !== di.lado) mudancas.set(e.id, { customData: { ...(e.customData ?? {}), mm: nova } });
  });
  // Descendentes trocam de lado junto
  if (lado !== d.lado) {
    for (const f of descendentes(nosDoMapa(vivos, d.raiz), id)) {
      const e = vivos.find((x) => x.id === f)!;
      mudancas.set(f, { customData: { ...(e.customData ?? {}), mm: { ...dadosDo(e)!, lado } } });
    }
  }
  organizarMapa(api, d.raiz, [], mudancas);
}

export { ehTopico as ehTopicoDoMapa };
