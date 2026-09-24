import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { toast } from "sonner";
import {
  Bold, Columns2, Columns3, Columns4, ExternalLink, Heading1, Heading2, Heading3, ImagePlus, Italic, Link as LinkIcon,
  List, ListChecks, ListOrdered, Loader2, Minus, Pilcrow, Quote, Redo2, Strikethrough, Underline, Undo2, Unlink, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { enviarImagemNota } from "@/lib/notas";
import { textoDoDoc, textoParaDoc, type NoDoc } from "@/lib/notasDoc";
import { extensoesNota } from "@/components/notas/extensoesNota";
import { MAX_COLUNAS, estadoColunas } from "@/components/notas/extensaoColunas";

interface Props {
  /** Documento salvo; nas notas antigas é null e o editor começa pelo texto */
  doc: NoDoc | null;
  textoAntigo: string;
  onChange: (doc: NoDoc, texto: string) => void;
  autoFocus?: boolean;
}

const imagensDe = (lista: FileList | null | undefined) => Array.from(lista ?? []).filter((f) => f.type.startsWith("image/"));

/** O que a barra de ferramentas mostra (marcado/desmarcado) na posição do cursor. */
function lerEstado(ed: Editor) {
  return {
    negrito: ed.isActive("bold"),
    italico: ed.isActive("italic"),
    sublinhado: ed.isActive("underline"),
    riscado: ed.isActive("strike"),
    nivel: ([1, 2, 3] as const).find((l) => ed.isActive("heading", { level: l })) ?? 0,
    lista: ed.isActive("bulletList"),
    numerada: ed.isActive("orderedList"),
    tarefas: ed.isActive("taskList"),
    citacao: ed.isActive("blockquote"),
    link: (ed.getAttributes("link").href as string | undefined) ?? null,
    colunas: estadoColunas(ed),
    podeDesfazer: ed.can().undo(),
    podeRefazer: ed.can().redo(),
  };
}

/** Editor da nota, no estilo Google Docs: formatação, listas, colunas (até 4), imagens e links. */
export function EditorNota({ doc, textoAntigo, onChange, autoFocus }: Props) {
  const [enviando, setEnviando] = useState(0);
  const [linkEditando, setLinkEditando] = useState<string | null>(null);
  const inputImagem = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // O editor é criado uma vez; colar/soltar imagem chama a versão atual desta função
  const subirRef = useRef<(arquivos: File[], pos?: number) => void>(() => {});

  const conteudoInicial = useMemo(() => doc ?? textoParaDoc(textoAntigo), []); // eslint-disable-line react-hooks/exhaustive-deps

  const editor = useEditor({
    extensions: extensoesNota(),
    content: conteudoInicial,
    // O editor só existe dentro do popup, aberto por clique: nunca renderiza no servidor. Criar já na
    // primeira renderização evita depender da atualização pós-montagem (que se perdia com a aba em
    // segundo plano e deixava o popup preso em "Abrindo o editor…").
    immediatelyRender: true,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: { class: "nota-editor-conteudo focus:outline-none", spellcheck: "true" },
      handlePaste: (_view, event) => {
        const imgs = imagensDe(event.clipboardData?.files);
        if (!imgs.length) return false;
        event.preventDefault();
        subirRef.current(imgs);
        return true;
      },
      handleDrop: (view: EditorView, event, _slice, movido) => {
        if (movido) return false;
        const imgs = imagensDe((event as DragEvent).dataTransfer?.files);
        if (!imgs.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })?.pos;
        subirRef.current(imgs, pos);
        return true;
      },
      handleClick: (_view, _pos, event) => {
        // Ctrl/Cmd + clique abre o link direto
        if (!(event.ctrlKey || event.metaKey)) return false;
        const a = (event.target as HTMLElement | null)?.closest("a");
        if (!a?.href) return false;
        window.open(a.href, "_blank", "noopener,noreferrer");
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON() as NoDoc;
      onChangeRef.current(json, textoDoDoc(json));
    },
  });

  subirRef.current = (arquivos: File[], pos?: number) => {
    if (!editor) return;
    for (const arquivo of arquivos) {
      setEnviando((n) => n + 1);
      enviarImagemNota(arquivo)
        .then((src) => {
          const conteudo = { type: "image", attrs: { src, alt: arquivo.name } };
          if (pos != null) editor.chain().focus().insertContentAt(pos, conteudo).run();
          else editor.chain().focus().insertContent(conteudo).run();
        })
        .catch((e) => toast.error(e instanceof Error ? e.message : "Não foi possível enviar a imagem"))
        .finally(() => setEnviando((n) => n - 1));
    }
  };

  // Troca de nota com o editor aberto: carrega o conteúdo novo
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const atual = JSON.stringify(editor.getJSON());
    const novo = doc ?? textoParaDoc(textoAntigo);
    if (JSON.stringify(novo) !== atual && !editor.isFocused) editor.commands.setContent(novo, { emitUpdate: false });
  }, [doc, textoAntigo, editor]);

  // O useEditorState só se atualiza a partir da primeira transação do editor; até lá (editor recém-
  // criado) o estado da barra é lido direto. Esperar por ele travaria: sem o editor na tela, não há
  // transação nenhuma.
  const estadoObservado = useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed ? lerEstado(ed) : null),
  });

  if (!editor) {
    return <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground"><Loader2 size={16} className="mr-2 animate-spin" /> Abrindo o editor…</div>;
  }
  const estado = estadoObservado ?? lerEstado(editor);

  const aplicarLink = () => {
    const url = (linkEditando ?? "").trim();
    const cadeia = editor.chain().focus().extendMarkRange("link");
    if (!url) cadeia.unsetLink().run();
    else cadeia.setLink({ href: /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}` }).run();
    setLinkEditando(null);
  };

  return (
    <div className="nota-editor flex min-h-0 flex-1 flex-col">
      {/* Barra de ferramentas */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b bg-background/95 px-1 py-1 backdrop-blur">
        <Botao titulo="Desfazer (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} desativado={!estado.podeDesfazer}><Undo2 size={15} /></Botao>
        <Botao titulo="Refazer (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} desativado={!estado.podeRefazer}><Redo2 size={15} /></Botao>
        <Separador />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" title="Estilo do texto">
              {estado.nivel ? `Título ${estado.nivel}` : "Texto normal"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => editor.chain().focus().setParagraph().run()}><Pilcrow size={14} className="mr-2" /> Texto normal</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={14} className="mr-2" /> Título 1</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={14} className="mr-2" /> Título 2</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={14} className="mr-2" /> Título 3</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Separador />
        <Botao titulo="Negrito (Ctrl+B)" ativo={estado.negrito} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></Botao>
        <Botao titulo="Itálico (Ctrl+I)" ativo={estado.italico} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></Botao>
        <Botao titulo="Sublinhado (Ctrl+U)" ativo={estado.sublinhado} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline size={15} /></Botao>
        <Botao titulo="Riscado" ativo={estado.riscado} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={15} /></Botao>
        <Separador />
        <Botao titulo="Lista" ativo={estado.lista} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={15} /></Botao>
        <Botao titulo="Lista numerada" ativo={estado.numerada} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></Botao>
        <Botao titulo="Checklist" ativo={estado.tarefas} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks size={15} /></Botao>
        <Botao titulo="Citação" ativo={estado.citacao} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={15} /></Botao>
        <Botao titulo="Linha divisória" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={15} /></Botao>
        <Separador />
        <Botao titulo="Link (selecione o texto)" ativo={!!estado.link} onClick={() => setLinkEditando(estado.link ?? "")}><LinkIcon size={15} /></Botao>
        <Botao titulo="Imagem (ou cole um print com Ctrl+V)" onClick={() => inputImagem.current?.click()}>
          {enviando ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
        </Botao>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant={estado.colunas.dentro ? "secondary" : "ghost"} size="sm" className="h-8 gap-1 px-2 text-xs" title="Colunas lado a lado">
              <Columns2 size={15} /> Colunas
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs">Inserir bloco de colunas</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => editor.chain().focus().inserirColunas(2).run()}><Columns2 size={14} className="mr-2" /> 2 colunas</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => editor.chain().focus().inserirColunas(3).run()}><Columns3 size={14} className="mr-2" /> 3 colunas</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => editor.chain().focus().inserirColunas(4).run()}><Columns4 size={14} className="mr-2" /> 4 colunas</DropdownMenuItem>
            {estado.colunas.dentro && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Este bloco · {estado.colunas.quantidade} colunas</DropdownMenuLabel>
                <DropdownMenuItem disabled={estado.colunas.quantidade >= MAX_COLUNAS} onSelect={() => editor.chain().focus().adicionarColuna().run()}>
                  Adicionar coluna {estado.colunas.quantidade >= MAX_COLUNAS && "(máx. 4)"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => editor.chain().focus().removerColuna().run()}>Remover esta coluna</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => editor.chain().focus().desfazerColunas().run()}>Desfazer colunas (texto fica embaixo)</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {enviando > 0 && <span className="ml-1 text-[11px] text-muted-foreground">Enviando {enviando > 1 ? `${enviando} imagens` : "imagem"}…</span>}
      </div>

      {/* Editar link */}
      {linkEditando !== null && (
        <form className="flex items-center gap-2 border-b bg-muted/40 px-2 py-1.5" onSubmit={(e) => { e.preventDefault(); aplicarLink(); }}>
          <LinkIcon size={14} className="shrink-0 text-muted-foreground" />
          <Input autoFocus value={linkEditando} onChange={(e) => setLinkEditando(e.target.value)} placeholder="Cole o endereço (ex.: site.com.br)" className="h-8 text-sm"
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setLinkEditando(null); } }} />
          <Button type="submit" size="sm" className="h-8">Aplicar</Button>
          {estado.link && <Button type="button" size="sm" variant="ghost" className="h-8 gap-1" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkEditando(null); }}><Unlink size={14} /> Tirar</Button>}
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setLinkEditando(null)} aria-label="Fechar"><X size={14} /></Button>
        </form>
      )}

      <input ref={inputImagem} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { const imgs = imagensDe(e.target.files); e.target.value = ""; if (imgs.length) subirRef.current(imgs); }} />

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-3" onClick={(e) => { if (e.target === e.currentTarget) editor.chain().focus("end").run(); }}>
        <EditorContent editor={editor} />
      </div>

      {/* Cursor em cima de um link: mostra para onde vai e abre com um clique */}
      {estado.link && linkEditando === null && (
        <div className="flex items-center gap-2 border-t bg-muted/40 px-2 py-1.5 text-xs">
          <LinkIcon size={13} className="shrink-0 text-primary" />
          <a href={estado.link} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-primary underline underline-offset-2">{estado.link}</a>
          <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" asChild>
            <a href={estado.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Abrir</a>
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setLinkEditando(estado.link ?? "")}>Editar</Button>
          <span className="hidden text-muted-foreground sm:inline">· Ctrl+clique abre direto</span>
        </div>
      )}
    </div>
  );
}

function Botao({ titulo, ativo, desativado, onClick, children }: { titulo: string; ativo?: boolean; desativado?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon" title={titulo} aria-label={titulo} aria-pressed={ativo} disabled={desativado}
      className={cn("h-8 w-8", ativo && "bg-primary/15 text-primary hover:bg-primary/20")}
      onMouseDown={(e) => e.preventDefault() /* não tira o foco do texto */} onClick={onClick}>
      {children}
    </Button>
  );
}

function Separador() {
  return <span className="mx-0.5 h-5 w-px bg-border" />;
}

export type { Editor };
