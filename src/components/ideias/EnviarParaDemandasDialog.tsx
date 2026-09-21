import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchDemandaColunas, type KanbanColumnDef } from "@/lib/demandaColunas";
import { enviarIdeiaParaDemandas, mensagemErro, type Ideia } from "@/lib/ideias";
import { colunaPadrao, montarDescricaoDemanda } from "@/lib/ideiasTexto";
import { toast } from "sonner";

interface Props {
  ideia: Ideia | null;
  onClose: () => void;
  onEnviada: (demandaId: string, coluna: KanbanColumnDef) => void;
}

export function EnviarParaDemandasDialog({ ideia, onClose, onEnviada }: Props) {
  const [colunas, setColunas] = useState<KanbanColumnDef[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [colunaId, setColunaId] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Busca as colunas do banco a cada abertura: a lista é sempre a da aba Demandas
  useEffect(() => {
    if (!ideia) return;
    let ativo = true;
    setCarregando(true);
    fetchDemandaColunas()
      .then((cols) => {
        if (!ativo) return;
        setColunas(cols);
        setColunaId(colunaPadrao(cols));
      })
      .catch((e) => console.error("Erro ao buscar colunas:", e))
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => { ativo = false; };
  }, [ideia]);

  const enviar = async () => {
    if (!ideia || !colunaId) return;
    const coluna = colunas.find((c) => c.id === colunaId);
    if (!coluna) return;
    setEnviando(true);
    try {
      const demandaId = await enviarIdeiaParaDemandas(ideia, colunaId);
      onEnviada(demandaId, coluna);
      onClose();
    } catch (e: any) {
      toast.error(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  };

  const previa = ideia ? montarDescricaoDemanda(ideia) : null;

  return (
    <Dialog open={!!ideia} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Enviar para demandas</DialogTitle>
          <DialogDescription>
            "{ideia?.titulo}" vira uma demanda na coluna escolhida, já com a descrição e os links.
            {ideia?.demanda_id && " Essa ideia já foi enviada antes; será criada outra demanda."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ideia-coluna">Coluna</Label>
            <Select value={colunaId || undefined} onValueChange={setColunaId} disabled={carregando || colunas.length === 0}>
              <SelectTrigger id="ideia-coluna">
                <SelectValue placeholder={carregando ? "Carregando colunas..." : colunas.length === 0 ? "Nenhuma coluna no Kanban" : "Escolher"} />
              </SelectTrigger>
              <SelectContent>
                {colunas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.hex }} />
                      {c.title}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {previa && (
            <div className="space-y-1">
              <Label>Descrição da demanda</Label>
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground font-sans max-h-40 overflow-y-auto">{previa}</pre>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button type="button" onClick={enviar} disabled={enviando || carregando || !colunaId}>
            {enviando ? "Enviando..." : "Criar demanda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
