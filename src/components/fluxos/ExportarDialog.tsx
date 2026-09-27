// Janela "Exportar" do editor de quadros: prévia, formato, escopo e opções; lembra as últimas escolhas neste navegador.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, FileImage, FileText, FileType2, Loader2, PenTool, Presentation } from "lucide-react";
import { toast } from "sonner";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PAPEIS, escalaSegura, paginasPdf } from "@/lib/fluxoExport";
import { cn } from "@/lib/utils";
import {
  MARGENS_PT, contarEscopo, exportarQuadro, medidasDaParte, partesDoEscopo, previaDaParte,
  type Escopo, type Formato, type Fundo, type OpcoesExportacao,
} from "./exportar";

const CHAVE = "fluxos-exportar";
const PADRAO: OpcoesExportacao = {
  formato: "pdf", escopo: "tudo", fundo: "claro", papel: "a4", orientacao: "auto", ajuste: "caber", margem: "pequena",
  escalaPng: 4, textosNoWord: true,
};

function lerPreferencias(): OpcoesExportacao {
  try {
    const salvo = JSON.parse(window.localStorage.getItem(CHAVE) || "null");
    return salvo && typeof salvo === "object" ? { ...PADRAO, ...salvo, escopo: "tudo" } : PADRAO;
  } catch {
    return PADRAO;
  }
}

const FORMATOS: { id: Formato; rotulo: string; detalhe: string; icone: ReactNode }[] = [
  { id: "pdf", rotulo: "PDF", detalhe: "Vetorial", icone: <FileText size={18} /> },
  { id: "png", rotulo: "PNG", detalhe: "Imagem", icone: <FileImage size={18} /> },
  { id: "svg", rotulo: "SVG", detalhe: "Vetor", icone: <PenTool size={18} /> },
  { id: "pptx", rotulo: "PowerPoint", detalhe: "Slides", icone: <Presentation size={18} /> },
  { id: "docx", rotulo: "Word", detalhe: "Documento", icone: <FileType2 size={18} /> },
];

/** Botões lado a lado, um ativo (pílula com transição). */
function Opcoes<T extends string | number>({
  valor, onChange, itens,
}: { valor: T; onChange: (v: T) => void; itens: { id: T; rotulo: string; desabilitado?: boolean; dica?: string }[] }) {
  return (
    <div className="grid gap-1 rounded-lg bg-muted p-1" style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}>
      {itens.map((i) => (
        <button
          key={String(i.id)}
          type="button"
          disabled={i.desabilitado}
          title={i.dica}
          onClick={() => onChange(i.id)}
          className={cn(
            "min-w-0 truncate rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200",
            valor === i.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            i.desabilitado && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
          )}
        >
          {i.rotulo}
        </button>
      ))}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {children}
    </div>
  );
}

const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");

export function ExportarDialog({
  open, onOpenChange, api, titulo,
}: { open: boolean; onOpenChange: (o: boolean) => void; api: ExcalidrawImperativeAPI | null; titulo: string }) {
  const [o, setO] = useState<OpcoesExportacao>(PADRAO);
  const [contagem, setContagem] = useState<Record<Escopo, number>>({ tudo: 0, molduras: 0, selecao: 0 });
  const [previa, setPrevia] = useState<string | null>(null);
  const [erroPrevia, setErroPrevia] = useState(false);
  const [andamento, setAndamento] = useState<string | null>(null);
  const muda = (parcial: Partial<OpcoesExportacao>) => setO((atual) => ({ ...atual, ...parcial }));

  // Ao abrir: preferências salvas, contagens e escopo que faz sentido (seleção, se houver algo selecionado)
  useEffect(() => {
    if (!open || !api) return;
    const c = contarEscopo(api);
    setContagem(c);
    const pref = lerPreferencias();
    setO({ ...pref, escopo: c.selecao > 0 ? "selecao" : "tudo" });
  }, [open, api]);

  useEffect(() => {
    if (!open) return;
    try {
      const { escopo: _escopo, ...resto } = o;
      window.localStorage.setItem(CHAVE, JSON.stringify(resto));
    } catch {
      // sem armazenamento: só não lembra na próxima vez
    }
  }, [o, open]);

  const partes = useMemo(
    () => (open && api ? partesDoEscopo(api, o.escopo, titulo).filter((p) => p.elementos.length > 0) : []),
    [open, api, o.escopo, titulo],
  );

  // Prévia da primeira parte (troca com o escopo e o fundo)
  useEffect(() => {
    if (!open || !api || !partes.length) {
      setPrevia(null);
      return;
    }
    let vivo = true;
    setPrevia(null);
    setErroPrevia(false);
    const t = setTimeout(() => {
      previaDaParte(api, partes[0], o.fundo === "transparente" && (o.formato === "pptx" || o.formato === "docx") ? "claro" : o.fundo)
        .then((url) => vivo && setPrevia(url))
        .catch(() => vivo && setErroPrevia(true));
    }, 120);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [open, api, partes, o.fundo, o.formato]);

  const semTransparente = o.formato === "pptx" || o.formato === "docx";
  useEffect(() => {
    if (semTransparente && o.fundo === "transparente") muda({ fundo: "claro" });
  }, [semTransparente, o.fundo]);

  const resumo = useMemo(() => {
    if (!partes.length) return o.escopo === "selecao" ? "Selecione algo no quadro." : "O quadro está vazio.";
    const n = partes.length;
    if (o.formato === "pdf") {
      const planos = partes.map((p) => paginasPdf(medidasDaParte(p), { papel: o.papel, orientacao: o.orientacao, margem: MARGENS_PT[o.margem], ajuste: o.ajuste }));
      const paginas = planos.reduce((s, p) => s + p.paginas.length, 0);
      const paisagem = planos[0].largura > planos[0].altura;
      return `${paginas} ${paginas === 1 ? "página" : "páginas"} ${PAPEIS[o.papel].rotulo} · ${paisagem ? "paisagem" : "retrato"} · texto e formas vetoriais`;
    }
    if (o.formato === "png") {
      const m = medidasDaParte(partes[0]);
      const e = escalaSegura(m.largura, m.altura, o.escalaPng);
      const tamanho = `${fmt(m.largura * e)} × ${fmt(m.altura * e)} px`;
      const reduzido = e < o.escalaPng ? ` (reduzido para ${e.toLocaleString("pt-BR")}×)` : "";
      return n > 1 ? `${n} imagens PNG em um .zip · a 1ª com ${tamanho}${reduzido}` : `${tamanho}${reduzido}`;
    }
    if (o.formato === "svg") return n > 1 ? `${n} arquivos SVG em um .zip · vetoriais` : "Vetorial: abre no navegador, Figma, Illustrator…";
    if (o.formato === "pptx") return `${n} ${n === 1 ? "slide" : "slides"} 16:9 com imagem em alta (4×)`;
    return `Documento com ${n} ${n === 1 ? "imagem" : "imagens"} em alta${o.textosNoWord ? " e os textos do quadro" : ""}`;
  }, [partes, o]);

  const exportar = async () => {
    if (!api || andamento) return;
    setAndamento("Preparando…");
    try {
      const r = await exportarQuadro(api, titulo, o, setAndamento);
      toast.success("Exportação pronta", { description: `${r.nome}${r.observacao ? ` — ${r.observacao}` : ""}` });
      onOpenChange(false);
    } catch (e) {
      toast.error("Não foi possível exportar", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setAndamento(null);
    }
  };

  const formatoAtual = FORMATOS.find((f) => f.id === o.formato)!;

  return (
    <Dialog open={open} onOpenChange={(v) => !andamento && onOpenChange(v)}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <div className="grid max-h-[92dvh] md:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-h-0 flex-col gap-3 border-b bg-muted/30 p-4 md:border-b-0 md:border-r md:p-5">
            <div
              className={cn(
                "relative flex min-h-[180px] flex-1 items-center justify-center overflow-hidden rounded-xl border md:min-h-[360px]",
                o.fundo === "transparente" ? "fluxo-xadrez" : "bg-background",
              )}
            >
              {previa ? (
                <img key={previa.length} src={previa} alt="Prévia da exportação" className="max-h-[46dvh] max-w-full object-contain p-3 animate-in fade-in zoom-in-95 duration-300" />
              ) : partes.length && !erroPrevia ? (
                <Loader2 className="animate-spin text-muted-foreground" size={22} />
              ) : (
                <p className="px-6 text-center text-sm text-muted-foreground">{erroPrevia ? "Não deu para montar a prévia, mas a exportação funciona." : resumo}</p>
              )}
              {partes.length > 1 && (
                <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium shadow-sm">
                  1 de {partes.length}: {partes[0].nome}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{resumo}</p>
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="space-y-4 overflow-y-auto p-4 md:p-5">
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle>Exportar</DialogTitle>
                <DialogDescription>Alta qualidade: no PDF e no SVG, texto e formas continuam nítidos em qualquer zoom.</DialogDescription>
              </DialogHeader>

              <Grupo titulo="Formato">
                <div className="grid grid-cols-5 gap-1.5">
                  {FORMATOS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => muda({ formato: f.id })}
                      aria-pressed={o.formato === f.id}
                      className={cn(
                        "flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center transition-all duration-200",
                        o.formato === f.id
                          ? "border-primary bg-primary/10 text-primary shadow-sm"
                          : "text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      {f.icone}
                      <span className="w-full truncate text-[11px] font-semibold">{f.rotulo}</span>
                      <span className="w-full truncate text-[10px] opacity-70">{f.detalhe}</span>
                    </button>
                  ))}
                </div>
              </Grupo>

              <Grupo titulo="O que exportar">
                <Opcoes<Escopo>
                  valor={o.escopo}
                  onChange={(escopo) => muda({ escopo })}
                  itens={[
                    { id: "tudo", rotulo: "Quadro todo" },
                    { id: "molduras", rotulo: `Molduras (${contagem.molduras})`, desabilitado: !contagem.molduras, dica: contagem.molduras ? "Cada moldura vira uma página/slide" : "Crie molduras (tecla F) para exportar por partes" },
                    { id: "selecao", rotulo: `Seleção (${contagem.selecao})`, desabilitado: !contagem.selecao, dica: contagem.selecao ? undefined : "Selecione formas no quadro antes de abrir" },
                  ]}
                />
              </Grupo>

              {o.formato === "pdf" && (
                <>
                  <Grupo titulo="Papel">
                    <Opcoes valor={o.papel} onChange={(papel) => muda({ papel })} itens={[{ id: "a4", rotulo: "A4" }, { id: "a3", rotulo: "A3" }, { id: "carta", rotulo: "Carta" }]} />
                  </Grupo>
                  <Grupo titulo="Orientação">
                    <Opcoes valor={o.orientacao} onChange={(orientacao) => muda({ orientacao })} itens={[{ id: "auto", rotulo: "Automática" }, { id: "retrato", rotulo: "Retrato" }, { id: "paisagem", rotulo: "Paisagem" }]} />
                  </Grupo>
                  <Grupo titulo="Tamanho">
                    <Opcoes valor={o.ajuste} onChange={(ajuste) => muda({ ajuste })} itens={[
                      { id: "caber", rotulo: "Caber em 1 página" },
                      { id: "real", rotulo: "Real, em várias", dica: "Tamanho real do quadro, dividido em quantas páginas precisar" },
                    ]} />
                  </Grupo>
                  <Grupo titulo="Margem">
                    <Opcoes valor={o.margem} onChange={(margem) => muda({ margem })} itens={[{ id: "nenhuma", rotulo: "Sem" }, { id: "pequena", rotulo: "Pequena" }, { id: "media", rotulo: "Média" }]} />
                  </Grupo>
                </>
              )}

              {o.formato === "png" && (
                <Grupo titulo="Qualidade">
                  <Opcoes<2 | 4 | 8> valor={o.escalaPng} onChange={(escalaPng) => muda({ escalaPng })} itens={[{ id: 2, rotulo: "2× (tela)" }, { id: 4, rotulo: "4× (impressão)" }, { id: 8, rotulo: "8× (máxima)" }]} />
                </Grupo>
              )}

              <Grupo titulo="Fundo">
                <Opcoes<Fundo>
                  valor={o.fundo}
                  onChange={(fundo) => muda({ fundo })}
                  itens={[
                    { id: "claro", rotulo: "Do quadro" },
                    { id: "escuro", rotulo: "Escuro" },
                    { id: "transparente", rotulo: "Transparente", desabilitado: semTransparente, dica: semTransparente ? "Slides e documentos usam fundo cheio" : undefined },
                  ]}
                />
              </Grupo>

              {o.formato === "docx" && (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={o.textosNoWord} onCheckedChange={(v) => muda({ textosNoWord: v === true })} />
                  Incluir os textos do quadro em lista
                </label>
              )}
            </div>

            <div className="mt-auto flex items-center justify-end gap-2 border-t p-4">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={!!andamento}>Cancelar</Button>
              <Button className="min-w-[11rem] gap-2" onClick={exportar} disabled={!partes.length || !!andamento}>
                {andamento ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                <span className="truncate">{andamento ?? `Exportar ${formatoAtual.rotulo}`}</span>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
