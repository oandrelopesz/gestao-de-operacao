// Seleção no editor de notas.
// - Clique triplo pega só a linha. Texto colado costuma virar um parágrafo só, com as linhas separadas por
//   quebra (<br>); o padrão do ProseMirror selecionava o parágrafo, ou seja, a nota inteira.
// - Com algo já selecionado, Shift + mouse (arrastar, clique duplo ou triplo) soma um trecho novo em vez de
//   esticar a seleção. Negrito, itálico, sublinhado, riscado e link valem para todos os trechos de uma vez
//   (os comandos do TipTap percorrem `selection.ranges`). Sem nada selecionado, Shift+clique estica como sempre.
import { Extension } from "@tiptap/core";
import { Plugin, Selection, SelectionRange, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as NoPM } from "@tiptap/pm/model";
import type { Mappable } from "@tiptap/pm/transform";
import { juntarTrechos, limitesDaLinha, limitesDaPalavra } from "@/lib/notasDoc";

type Trecho = [number, number];

/** Vários trechos selecionados ao mesmo tempo. O navegador não desenha isso: os trechos viram decoração. */
class SelecaoMultipla extends Selection {
  constructor(ranges: SelectionRange[]) {
    super(ranges[0].$from, ranges[0].$to, ranges);
  }
  map(doc: NoPM, mapping: Mappable): Selection {
    return criarSelecao(doc, this.ranges.map((r): Trecho => [mapping.map(r.$from.pos), mapping.map(r.$to.pos)]));
  }
  eq(outra: Selection): boolean {
    return outra instanceof SelecaoMultipla && outra.ranges.length === this.ranges.length &&
      outra.ranges.every((r, i) => r.$from.pos === this.ranges[i].$from.pos && r.$to.pos === this.ranges[i].$to.pos);
  }
  // ponytail: copiar (Ctrl+C) e o JSON levam só o 1º trecho; juntar os trechos no copiar se fizer falta
  toJSON() {
    return { type: "text", anchor: this.$from.pos, head: this.$to.pos };
  }
}
SelecaoMultipla.prototype.visible = false; // esconde a seleção nativa (fica só no 1º trecho)

const trechosDe = (sel: Selection): Trecho[] => sel.ranges.map((r): Trecho => [r.$from.pos, r.$to.pos]);

/** Um trecho vira seleção de texto comum; dois ou mais, a múltipla. */
function criarSelecao(doc: NoPM, trechos: Trecho[]): Selection {
  const ranges = juntarTrechos(trechos).map(([a, b]) => {
    const s = TextSelection.between(doc.resolve(a), doc.resolve(b));
    return new SelectionRange(s.$from, s.$to);
  });
  if (ranges.length > 1) return new SelecaoMultipla(ranges);
  if (ranges.length === 1) return TextSelection.create(doc, ranges[0].$from.pos, ranges[0].$to.pos);
  return Selection.near(doc.resolve(Math.min(trechos[0]?.[0] ?? 0, doc.content.size)));
}

/** Linha ou palavra em volta de `pos`, dentro do bloco de texto (quebra de linha conta como "\n"). */
function trechoEm(doc: NoPM, pos: number, limites: (texto: string, i: number) => Trecho): Trecho | null {
  const $pos = doc.resolve(pos);
  if (!$pos.parent.inlineContent) return null;
  const inicio = $pos.start();
  const [a, b] = limites($pos.parent.textBetween(0, $pos.parent.content.size, undefined, "\n"), pos - inicio);
  return [inicio + a, inicio + b];
}

function selecionar(view: EditorView, sel: Selection) {
  if (!view.hasFocus()) view.focus();
  view.dispatch(view.state.tr.setSelection(sel).setMeta("pointer", true));
}

export const SelecaoNota = Extension.create({
  name: "selecaoNota",
  addProseMirrorPlugins() {
    // Trechos que já estavam selecionados quando a sequência de Shift+cliques começou (o 2º e o 3º clique
    // trocam o trecho novo, palavra e depois linha, em vez de somar outro)
    let base: Trecho[] = [];
    let baseEm = 0;
    return [
      new Plugin({
        props: {
          decorations: (state) =>
            state.selection instanceof SelecaoMultipla
              ? DecorationSet.create(state.doc, state.selection.ranges.map((r) => Decoration.inline(r.$from.pos, r.$to.pos, { class: "nota-selecao" })))
              : null,
          handleTripleClick: (view, pos) => {
            const linha = trechoEm(view.state.doc, pos, limitesDaLinha);
            if (!linha) return false;
            selecionar(view, TextSelection.create(view.state.doc, ...linha));
            return true;
          },
          handleDOMEvents: {
            mousedown: (view, event) => {
              // Shift (só com algo selecionado) ou Ctrl/Cmd (também a partir do cursor) somam trechos
              const soma = event.ctrlKey || event.metaKey;
              if (event.button !== 0 || !(event.shiftKey || soma)) return false;
              const vazia = view.state.selection.empty;
              // Shift sem seleção estica como sempre; Ctrl+clique em link abre o link (handleClick)
              if ((vazia && !soma) || (soma && event.detail <= 1 && (event.target as HTMLElement | null)?.closest("a"))) { baseEm = 0; return false; }
              const clicado = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (!clicado) return false;
              event.preventDefault();
              // O padrão do ProseMirror para Ctrl+clique é selecionar o bloco inteiro: aqui vira só o cursor
              if (vazia && event.detail <= 1) selecionar(view, TextSelection.create(view.state.doc, clicado.pos));
              if (event.detail <= 1 || Date.now() - baseEm > 1500) base = trechosDe(view.state.selection);
              baseEm = Date.now();
              const somar = (novo: Trecho) => { if (!view.isDestroyed) selecionar(view, criarSelecao(view.state.doc, [...base, novo])); };
              const p = clicado.pos;
              if (event.detail >= 2) {
                const t = trechoEm(view.state.doc, p, event.detail === 2 ? limitesDaPalavra : limitesDaLinha);
                if (t) somar(t);
                return true;
              }
              const mover = (e: MouseEvent) => {
                const c = view.posAtCoords({ left: e.clientX, top: e.clientY });
                if (c) somar([p, c.pos]);
              };
              const soltar = () => {
                window.removeEventListener("mousemove", mover);
                window.removeEventListener("mouseup", soltar);
              };
              window.addEventListener("mousemove", mover);
              window.addEventListener("mouseup", soltar);
              return true;
            },
          },
        },
      }),
    ];
  },
});
