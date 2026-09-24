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
      placeholder: ({ node }) => (node.type.name === "heading" ? "Título" : "Escreva aqui… cole prints com Ctrl+V, links viram clicáveis"),
      includeChildren: true,
    }),
  ];
}
