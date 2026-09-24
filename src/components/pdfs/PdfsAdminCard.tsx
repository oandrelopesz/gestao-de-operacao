import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileText, Folder, FolderPlus, Plus, Pencil, Trash2, ArrowUp, ArrowDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { fetchPdfBiblioteca, reordenarPastas, mensagemErroPdf, type PdfBiblioteca } from "@/lib/pdfs";
import { montarArvore, contarPdfsPorPasta, corDaPasta, type PastaNo, type PdfPasta } from "@/lib/pdfsArvore";
import { PastaDialog, ExcluirPastaDialog, type PastaDialogState } from "@/components/pdfs/PastaDialogs";

/**
 * Card da aba Admin para gerenciar os temas (pastas da raiz) e subpastas da aba Arquivos.
 * Os arquivos em si são enviados na própria aba.
 */
export function PdfsAdminCard() {
  const [bib, setBib] = useState<PdfBiblioteca>({ pastas: [], pdfs: [] });
  const [erro, setErro] = useState<string | null>(null);
  const [dialog, setDialog] = useState<PastaDialogState>(null);
  const [toDelete, setToDelete] = useState<PdfPasta | null>(null);

  const reload = async () => {
    try {
      setBib(await fetchPdfBiblioteca());
      setErro(null);
    } catch (e) {
      setErro(mensagemErroPdf(e));
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const arvore = useMemo(() => montarArvore(bib.pastas), [bib.pastas]);
  const contagem = useMemo(() => contarPdfsPorPasta(bib.pastas, bib.pdfs), [bib]);

  const mover = async (irmas: PastaNo[], idx: number, direcao: -1 | 1) => {
    const alvo = idx + direcao;
    if (alvo < 0 || alvo >= irmas.length) return;
    const reordenadas = [...irmas];
    [reordenadas[idx], reordenadas[alvo]] = [reordenadas[alvo], reordenadas[idx]];
    const novaOrdem = new Map(reordenadas.map((p, i) => [p.id, i]));
    setBib((prev) => ({ ...prev, pastas: prev.pastas.map((p) => (novaOrdem.has(p.id) ? { ...p, ordem: novaOrdem.get(p.id)! } : p)) }));
    try {
      await reordenarPastas(reordenadas);
    } catch (e) {
      toast.error(mensagemErroPdf(e));
      await reload();
    }
  };

  const linhas = (nos: PastaNo[], nivel: number): React.ReactNode[] =>
    nos.flatMap((no, idx) => {
      const c = contagem.get(no.id);
      return [
        <div key={no.id} className="flex items-center gap-2 py-1.5 pr-3" style={{ paddingLeft: 12 + nivel * 22 }}>
          <Folder size={nivel === 0 ? 16 : 14} className="shrink-0" style={{ color: corDaPasta(bib.pastas, no.id) }} />
          <div className="min-w-0 flex-1">
            <span className={nivel === 0 ? "font-medium" : "text-sm"}>{no.nome}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {c?.total ?? 0} {c?.total === 1 ? "arquivo" : "arquivos"}
            </span>
          </div>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => mover(nos, idx, -1)} title="Subir"><ArrowUp size={13} /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === nos.length - 1} onClick={() => mover(nos, idx, 1)} title="Descer"><ArrowDown size={13} /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDialog({ mode: "create", parentId: no.id })} title="Nova subpasta"><Plus size={13} /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDialog({ mode: "edit", pasta: no })} title="Renomear / mover / cor"><Pencil size={13} /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setToDelete(no)} title="Excluir"><Trash2 size={13} /></Button>
          </div>
        </div>,
        ...linhas(no.filhos, nivel + 1),
      ];
    });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><FileText size={18} /> Arquivos (temas e pastas)</CardTitle>
            <CardDescription>
              Temas e subpastas da aba Arquivos, em quantos níveis quiser. Os arquivos você envia{" "}
              <Link to="/arquivos" className="underline underline-offset-2 inline-flex items-center gap-1">na própria aba <ExternalLink size={11} /></Link>.
            </CardDescription>
          </div>
          <Button size="sm" className="gap-2 shrink-0" onClick={() => setDialog({ mode: "create", parentId: null })}>
            <FolderPlus size={14} /> Novo tema
          </Button>
        </CardHeader>
        <CardContent>
          {erro && <p className="text-sm text-destructive mb-3">{erro}</p>}
          <div className="divide-y rounded-md border">
            {linhas(arvore, 0)}
            {arvore.length === 0 && !erro && (
              <p className="px-3 py-6 text-sm text-muted-foreground text-center">Nenhum tema. Clique em "Novo tema" para criar o primeiro.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <PastaDialog state={dialog} pastas={bib.pastas} onClose={() => setDialog(null)} onSaved={reload} />
      <ExcluirPastaDialog pasta={toDelete} biblioteca={bib} onClose={() => setToDelete(null)} onDeleted={reload} />
    </>
  );
}
