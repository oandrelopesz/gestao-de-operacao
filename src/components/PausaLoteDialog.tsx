import { useEffect, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Linha = { id: string; plataforma: string; pausado: boolean };

interface Props {
  clienteId: string | null;
  clienteNome: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Depois de gravar: a tela recarrega a própria lista */
  onDone: () => void;
}

/** Pausa ou retoma várias plataformas do cliente de uma vez. Grava em saldo_ads.pausado, como a pausa de uma plataforma só; o gatilho do banco congela o saldo e espelha em Clientes. */
export function PausaLoteDialog({ clienteId, clienteNome, open, onOpenChange, onDone }: Props) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open || !clienteId) return;
    setMarcadas(new Set());
    setCarregando(true);
    supabase
      .from("saldo_ads")
      .select("id, plataformas, pausado")
      .eq("cliente_id", clienteId)
      .eq("ativo", true)
      .then(({ data, error }) => {
        if (error) toast.error(error.message || "Erro ao carregar as plataformas");
        setLinhas((data ?? []).map((r) => ({ id: r.id, plataforma: (r.plataformas ?? []).join(", ") || "Plataforma", pausado: !!r.pausado })));
        setCarregando(false);
      });
  }, [open, clienteId]);

  const alternar = (id: string) =>
    setMarcadas((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const todasMarcadas = linhas.length > 0 && marcadas.size === linhas.length;
  const aPausar = linhas.filter((l) => marcadas.has(l.id) && !l.pausado);
  const aRetomar = linhas.filter((l) => marcadas.has(l.id) && l.pausado);

  const aplicar = async (pausado: boolean) => {
    const alvo = pausado ? aPausar : aRetomar;
    if (alvo.length === 0) return;
    setSalvando(true);
    const { error } = await supabase.from("saldo_ads").update({ pausado }).in("id", alvo.map((l) => l.id));
    setSalvando(false);
    if (error) {
      toast.error(error.message || "Erro ao atualizar o tráfego");
      return;
    }
    const nomes = alvo.map((l) => l.plataforma).join(", ");
    toast.success(pausado ? `Tráfego pausado em ${nomes}: o saldo fica congelado` : `Tráfego retomado em ${nomes}`);
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pausar ou retomar plataformas</DialogTitle>
          <DialogDescription>{clienteNome}: marque as plataformas e escolha a ação. Pode misturar rodando e pausadas.</DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>
        ) : linhas.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Este cliente não tem plataformas ativas.</p>
        ) : (
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={todasMarcadas} onCheckedChange={(v) => setMarcadas(v ? new Set(linhas.map((l) => l.id)) : new Set())} />
              Marcar todas
            </label>
            {linhas.map((l) => (
              <label key={l.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2">
                <Checkbox checked={marcadas.has(l.id)} onCheckedChange={() => alternar(l.id)} />
                <span className="flex-1 text-sm font-medium">{l.plataforma}</span>
                <Badge variant={l.pausado ? "secondary" : "outline"}>{l.pausado ? "Pausada" : "Rodando"}</Badge>
              </label>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" disabled={salvando || aRetomar.length === 0} onClick={() => aplicar(false)}>
            <Play size={14} className="mr-2" /> Retomar{aRetomar.length ? ` (${aRetomar.length})` : ""}
          </Button>
          <Button disabled={salvando || aPausar.length === 0} onClick={() => aplicar(true)}>
            <Pause size={14} className="mr-2" /> Pausar{aPausar.length ? ` (${aPausar.length})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
