import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FolderTree, Trash2, ExternalLink, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchNichos, fetchItens, erroAmigavel, type SwipeItem, type SwipeNicho } from "@/lib/swipe";
import { ExcluirNichoDialog } from "@/components/swipe/ExcluirNichoDialog";

/**
 * Card do Admin para limpar nichos e subnichos do swipe file (eles são criados ao salvar itens;
 * aqui dá para tirar os que ficaram sem uso ou foram criados por engano).
 */
export function SwipeNichosAdminCard() {
  const [nichos, setNichos] = useState<SwipeNicho[]>([]);
  const [itens, setItens] = useState<SwipeItem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<SwipeNicho | null>(null);

  const reload = async () => {
    try {
      const [n, i] = await Promise.all([fetchNichos(), fetchItens()]);
      setNichos(n);
      setItens(i);
      setErro(null);
    } catch (e) {
      setErro(erroAmigavel(e));
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const raiz = useMemo(() => nichos.filter((n) => !n.pai_id), [nichos]);
  const qtd = (pred: (i: SwipeItem) => boolean) => itens.filter(pred).length;

  const linha = (n: SwipeNicho, total: number, sub: boolean) => (
    <div key={n.id} className={sub ? "flex items-center gap-3 pl-10 pr-3 py-1.5 bg-muted/30" : "flex items-center gap-3 px-3 py-2"}>
      <Folder size={sub ? 13 : 15} className="shrink-0 text-muted-foreground" />
      <span className={sub ? "text-sm truncate" : "font-medium truncate"}>{n.nome}</span>
      {total === 0
        ? <Badge variant="outline" className="text-[10px] h-5 text-amber-600 border-amber-600/40">vazio</Badge>
        : <span className="text-xs text-muted-foreground">{total} {total === 1 ? "item" : "itens"}</span>}
      <span className="flex-1" />
      {n.drive_folder_link && (
        <a href={n.drive_folder_link} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" title="Abrir pasta no Drive">
          <ExternalLink size={13} />
        </a>
      )}
      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setToDelete(n)} title={sub ? "Excluir subnicho" : "Excluir nicho"}>
        <Trash2 size={13} />
      </Button>
    </div>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FolderTree size={18} /> Nichos do swipe file</CardTitle>
          <CardDescription>
            Nichos e subnichos são criados ao salvar itens{" "}
            <Link to="/swipe" className="underline underline-offset-2 inline-flex items-center gap-1">no Swipe file <ExternalLink size={11} /></Link>.
            Exclua aqui os que ficaram vazios ou foram criados por engano.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {erro && <p className="text-sm text-destructive mb-3">{erro}</p>}
          <div className="divide-y rounded-md border">
            {raiz.map((n) => [
              linha(n, qtd((i) => i.nicho_id === n.id), false),
              ...nichos.filter((s) => s.pai_id === n.id).map((s) => linha(s, qtd((i) => i.subnicho_id === s.id), true)),
            ])}
            {raiz.length === 0 && !erro && (
              <p className="px-3 py-6 text-sm text-muted-foreground text-center">Nenhum nicho ainda.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <ExcluirNichoDialog nicho={toDelete} nichos={nichos} itens={itens} onClose={() => setToDelete(null)} onDeleted={reload} />
    </>
  );
}
