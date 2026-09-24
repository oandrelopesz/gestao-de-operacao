import { useState } from "react";
import { toast } from "sonner";
import { Loader2, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfig } from "@/lib/appConfig";
import { formatarDataCurta, hojeBrasilia } from "@/lib/entrega";
import { duracaoDias } from "@/lib/processos";
import { concluirOnboarding, type Processo } from "@/lib/processosService";
import { VerbaOnboarding } from "./VerbaOnboarding";

interface ConcluirOnboardingDialogProps {
  aberto: boolean;
  processo: Processo;
  onClose: () => void;
  onMudou: () => void;
}

const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as any).message) : "Erro ao concluir");

/** Data (YYYY-MM-DD) em Brasília de um timestamp ISO. */
export const dataBrasilia = (iso: string) => hojeBrasilia(new Date(iso));

/** Confirma o fim do onboarding: resumo, verba (editável) e o que acontece com o cliente. */
export function ConcluirOnboardingDialog({ aberto, processo, onClose, onMudou }: ConcluirOnboardingDialogProps) {
  const [ativaTrafego, , carregandoConfig] = useConfig<boolean>("onboarding_ativa_trafego", true);
  const [concluindo, setConcluindo] = useState(false);

  const hoje = hojeBrasilia();
  const inicio = dataBrasilia(processo.cliente?.onboarding_desde ?? processo.iniciado_em);
  const dias = Math.max(0, duracaoDias(inicio, hoje));
  const nomeCliente = processo.cliente?.nome ?? "cliente";

  const confirmar = async () => {
    if (concluindo || carregandoConfig) return;
    setConcluindo(true);
    try {
      await concluirOnboarding(processo, ativaTrafego !== false);
      toast.success(`Onboarding de ${nomeCliente} concluído 🎉`);
      onClose();
      onMudou();
    } catch (e) {
      toast.error(erroMsg(e));
    } finally {
      setConcluindo(false);
    }
  };

  const linha = (rotulo: string, valor: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="text-right text-sm font-medium">{valor}</dd>
    </div>
  );

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !concluindo) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <PartyPopper size={20} />
          </div>
          <DialogTitle>Concluir onboarding</DialogTitle>
          {carregandoConfig ? (
            <>
              <Skeleton className="h-4 w-full max-w-sm" />
              <DialogDescription className="sr-only">Carregando configuração</DialogDescription>
            </>
          ) : (
            <DialogDescription>
              {ativaTrafego !== false
                ? "O cliente sai do onboarding e passa a ter tráfego ativo com essa verba mensal."
                : "O cliente sai do onboarding."}
            </DialogDescription>
          )}
        </DialogHeader>

        <dl className="divide-y rounded-xl border bg-muted/20 px-4">
          {linha("Cliente", nomeCliente)}
          {linha("Entrou em", formatarDataCurta(inicio))}
          {linha("Concluído", `Hoje, ${formatarDataCurta(hoje)}`)}
          {linha("Duração", dias === 1 ? "1 dia" : `${dias} dias`)}
          {linha("Verba mensal", <VerbaOnboarding clienteId={processo.cliente_id} variante="linha" />)}
        </dl>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={concluindo}>Cancelar</Button>
          <Button onClick={confirmar} disabled={concluindo || carregandoConfig} className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600/90">
            {concluindo && <Loader2 size={14} className="animate-spin" />}
            Concluir onboarding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
