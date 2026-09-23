import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { excluirNicho, resumoExclusaoNicho, erroAmigavel, type SwipeItem, type SwipeNicho } from "@/lib/swipe";

interface Props {
  nicho: SwipeNicho | null;
  nichos: SwipeNicho[];
  itens: SwipeItem[];
  onClose: () => void;
  onDeleted: (nicho: SwipeNicho) => Promise<void> | void;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Confirmação para excluir nicho/subnicho. Mostra o que vai junto:
 * - vazio: só apaga (e a pasta vazia vai para a Lixeira do Drive);
 * - nicho com itens: só dá para excluir junto com os itens;
 * - subnicho com itens: escolhe entre manter os itens no nicho pai ou excluí-los.
 */
export function ExcluirNichoDialog({ nicho, nichos, itens, onClose, onDeleted }: Props) {
  const [excluindo, setExcluindo] = useState<"manter" | "itens" | null>(null);
  const resumo = nicho ? resumoExclusaoNicho(nicho, nichos, itens) : null;
  const pai = nicho?.pai_id ? nichos.find((n) => n.id === nicho.pai_id) : undefined;
  const tipo = nicho?.pai_id ? "subnicho" : "nicho";
  const n = resumo?.itens.length ?? 0;

  const executar = async (excluirItens: boolean, botao: "manter" | "itens") => {
    if (!nicho) return;
    setExcluindo(botao);
    try {
      const pasta = await excluirNicho(nicho, nichos, itens, { excluirItens });
      const extra =
        pasta === "mantida" ? " A pasta no Drive foi mantida porque ainda tem arquivos."
        : pasta === "erro" ? " Não deu para mandar a pasta do Drive para a Lixeira (Drive desconectado?)."
        : "";
      toast.success(`${tipo === "nicho" ? "Nicho" : "Subnicho"} "${nicho.nome}" excluído.${extra}`);
      await onDeleted(nicho);
      onClose();
    } catch (e) {
      toast.error(erroAmigavel(e));
      await onDeleted(nicho); // recarrega: parte dos itens pode já ter ido para a Lixeira
    } finally {
      setExcluindo(null);
    }
  };

  let descricao = "";
  if (resumo) {
    const ns = resumo.subnichos.length;
    const subs = ns
      ? ` ${ns === 1 ? "O subnicho" : `Os ${ns} subnichos`} dele (${resumo.subnichos.map((x) => x.nome).join(", ")}) também ${ns === 1 ? "sai" : "saem"}.`
      : "";
    const lixeira = "os arquivos vão para a Lixeira do Drive (dá para recuperar por 30 dias)";
    if (!n) {
      descricao = `Não há itens nele.${subs} A pasta vazia no Drive vai para a Lixeira.`;
    } else if (resumo.podeManterItens) {
      descricao = n === 1
        ? `Tem 1 item. Você pode mantê-lo no nicho "${pai?.nome}" (sem subnicho) ou excluí-lo junto — ${lixeira}.`
        : `Tem ${n} itens. Você pode mantê-los no nicho "${pai?.nome}" (sem subnicho) ou excluí-los junto — ${lixeira}.`;
    } else {
      descricao = `${n === 1 ? "Tem 1 item, que será excluído" : `Tem ${n} itens, que serão excluídos`} junto — ${lixeira}.${subs}`;
    }
  }

  return (
    <AlertDialog open={!!nicho} onOpenChange={(o) => { if (!o && !excluindo) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir o {tipo} "{nicho?.nome}"?</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={!!excluindo}>Cancelar</AlertDialogCancel>
          {n > 0 && resumo?.podeManterItens && (
            <Button variant="outline" disabled={!!excluindo} onClick={() => executar(false, "manter")}>
              {excluindo === "manter" && <Loader2 size={14} className="mr-2 animate-spin" />}
              Manter itens em "{pai?.nome}"
            </Button>
          )}
          <Button variant="destructive" disabled={!!excluindo} onClick={() => executar(n > 0, "itens")}>
            {excluindo === "itens" && <Loader2 size={14} className="mr-2 animate-spin" />}
            {n > 0 ? `Excluir junto ${plural(n, "item", "itens")}` : `Excluir ${tipo}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
