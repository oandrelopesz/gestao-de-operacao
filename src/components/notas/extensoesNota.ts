// Extensões do editor de notas. Ficam num módulo só para o editor e o "Copiar" (que gera o HTML
// da nota com generateHTML) usarem exatamente as mesmas.
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import type { Extensions } from "@tiptap/react";
import { Coluna, Colunas } from "@/components/notas/extensaoColunas";

export function extensoesNota(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        // Clicar só posiciona o cursor (dá para editar o texto do link); abrir é Ctrl+clique ou a barra do link
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" },
      },
    }),
    Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: "nota-imagem" } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Colunas,
    Coluna,
    Placeholder.configure({
      placeholder: ({ editor, node, pos }) => {
        if (node.type.name === "heading") return "Título";
        // Coluna é estreita: texto de ajuda curto (o longo quebrava e vazava da caixa da coluna)
        try {
          const $pos = editor.state.doc.resolve(pos);
          for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.name === "coluna") return "Escreva…";
        } catch {
          // posição fora do documento durante a atualização: vale o texto padrão
        }
        return "Escreva aqui… cole prints com Ctrl+V, links viram clicáveis";
      },
      includeChildren: true,
    }),
  ];
}
