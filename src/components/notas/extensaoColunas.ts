// Colunas lado a lado nas notas: um bloco "colunas" com 2 a 4 "coluna", cada uma aceita qualquer
// bloco (texto, lista, imagem...). A largura é igual e sai do CSS (grid com colunas automáticas),
// então adicionar/remover coluna não precisa guardar a quantidade.
import { Node, mergeAttributes, type Editor } from "@tiptap/react";
import { TextSelection, type EditorState } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";

export const MAX_COLUNAS = 4;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    colunas: {
      /** Bloco novo com `quantidade` colunas vazias (2 a 4) */
      inserirColunas: (quantidade: number) => ReturnType;
      /** Mais uma coluna depois da atual (até 4) */
      adicionarColuna: () => ReturnType;
      /** Tira a coluna onde está o cursor; com 2, desfaz o bloco e o texto da outra fica normal */
      removerColuna: () => ReturnType;
      /** Desfaz o bloco: o conteúdo das colunas fica um embaixo do outro */
      desfazerColunas: () => ReturnType;
    };
  }
}

/** Onde o cursor está em relação ao bloco de colunas (ou null, fora dele). */
export function colunasNoCursor(state: EditorState): { pos: number; no: PMNode; indice: number; profundidade: number } | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "colunas") {
      return { pos: $from.before(d), no: $from.node(d), indice: $from.index(d), profundidade: d };
    }
  }
  return null;
}

export function estadoColunas(editor: Editor | null): { dentro: boolean; quantidade: number } {
  if (!editor) return { dentro: false, quantidade: 0 };
  const c = colunasNoCursor(editor.state);
  return c ? { dentro: true, quantidade: c.no.childCount } : { dentro: false, quantidade: 0 };
}

export const Coluna = Node.create({
  name: "coluna",
  content: "block+",
  isolating: true,
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-type="coluna"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "coluna", class: "nota-coluna" }), 0];
  },
});

export const Colunas = Node.create({
  name: "colunas",
  group: "block",
  content: `coluna{2,${MAX_COLUNAS}}`,
  isolating: true,
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-type="colunas"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "colunas", class: "nota-colunas" }), 0];
  },

  addCommands() {
    return {
      inserirColunas:
        (quantidade) =>
        ({ commands }) => {
          const n = Math.min(MAX_COLUNAS, Math.max(2, Math.round(quantidade)));
          return commands.insertContent({
            type: "colunas",
            content: Array.from({ length: n }, () => ({ type: "coluna", content: [{ type: "paragraph" }] })),
          });
        },

      adicionarColuna:
        () =>
        ({ state, tr, dispatch }) => {
          const c = colunasNoCursor(state);
          if (!c || c.no.childCount >= MAX_COLUNAS) return false;
          if (dispatch) {
            const $from = state.selection.$from;
            const fimDaColuna = $from.after(c.profundidade + 1);
            const nova = state.schema.nodes.coluna.create(null, state.schema.nodes.paragraph.create());
            tr.insert(fimDaColuna, nova);
            tr.setSelection(TextSelection.near(tr.doc.resolve(fimDaColuna + 2)));
            dispatch(tr.scrollIntoView());
          }
          return true;
        },

      removerColuna:
        () =>
        ({ state, tr, dispatch }) => {
          const c = colunasNoCursor(state);
          if (!c) return false;
          if (dispatch) {
            const $from = state.selection.$from;
            if (c.no.childCount > 2) {
              tr.delete($from.before(c.profundidade + 1), $from.after(c.profundidade + 1));
            } else {
              // Sobra uma coluna só: o bloco some e o conteúdo dela vira texto normal
              const outra = c.no.child(c.indice === 0 ? 1 : 0);
              tr.replaceWith(c.pos, c.pos + c.no.nodeSize, outra.content);
            }
            tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(c.pos + 1, tr.doc.content.size))));
            dispatch(tr.scrollIntoView());
          }
          return true;
        },

      desfazerColunas:
        () =>
        ({ state, tr, dispatch }) => {
          const c = colunasNoCursor(state);
          if (!c) return false;
          if (dispatch) {
            const blocos: PMNode[] = [];
            c.no.forEach((coluna) => coluna.forEach((bloco) => blocos.push(bloco)));
            tr.replaceWith(c.pos, c.pos + c.no.nodeSize, blocos);
            tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(c.pos + 1, tr.doc.content.size))));
            dispatch(tr.scrollIntoView());
          }
          return true;
        },
    };
  },
});
