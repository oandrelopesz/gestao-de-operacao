// Barra flutuante das ações em massa do CRM (Kanban e Planilha) — spec §9.3, layout de
// src/components/demandas/SelecaoBarra.tsx. Vai para o <body> (portal) para ficar presa à tela.
import { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRightLeft, CheckSquare, Loader2, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrm } from "@/components/crm/CrmContexto";
import { emMassa, motivosDa } from "@/lib/crmColunas";
import type { ColunaCrm, Trafego } from "@/lib/crmTipos";

const ehOutro = (m: string) => m.trim().toLowerCase() === "outro";

export function SelecaoBarraCrm({
  selecionados,
  onLimpar,
}: {
  selecionados: string[];
  onLimpar: () => void;
}) {
  const { colunas, moverEmMassa, trafegoEmMassa, excluirLeads } = useCrm();
  const [ocupado, setOcupado] = useState(false);
  const [colunaMotivo, setColunaMotivo] = useState<ColunaCrm | null>(null);
  const [motivo, setMotivo] = useState("");
  const [outro, setOutro] = useState("");
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);

  const n = selecionados.length;
  const qtdLeads = `${n} ${n === 1 ? "lead" : "leads"}`;

  /** Roda a ação com os ids de agora e, ao terminar (dando certo ou não), limpa a seleção. */
  const executar = async (acao: (ids: string[]) => Promise<void>) => {
    if (ocupado || n === 0) return;
    const ids = [...selecionados];
    setOcupado(true);
    try {
      await acao(ids);
    } finally {
      setOcupado(false);
      setColunaMotivo(null);
      setConfirmarExcluir(false);
      onLimpar();
    }
  };

  const escolherColuna = (c: ColunaCrm) => {
    const modo = emMassa(c.tipo);
    if (modo === "nao") return;
    if (modo === "motivo") {
      setMotivo("");
      setOutro("");
      setColunaMotivo(c);
      return;
    }
    void executar((ids) => moverEmMassa(ids, c.id));
  };

  const motivoFinal = ehOutro(motivo) ? outro.trim() : motivo;
  const confirmarMotivo = () => {
    const c = colunaMotivo;
    if (!c || !motivoFinal) return;
    void executar((ids) => moverEmMassa(ids, c.id, motivoFinal));
  };

  const trafego = (t: Trafego) => void executar((ids) => trafegoEmMassa(ids, t));

  const barra = (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-200 max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-xl">
        <span className="flex items-center gap-1.5 pr-1 text-sm font-semibold" aria-live="polite">
          {ocupado ? (
            <Loader2 size={15} className="animate-spin text-primary" />
          ) : (
            <CheckSquare size={15} className="text-primary" />
          )}
          {n} {n === 1 ? "selecionado" : "selecionados"}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                disabled={ocupado}
              >
                <ArrowRightLeft size={13} /> Mover para…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="max-h-80 w-64 overflow-y-auto">
              <DropdownMenuLabel className="text-xs">Mover {qtdLeads} para</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {colunas.map((c) => {
                const modo = emMassa(c.tipo);
                return (
                  <DropdownMenuItem
                    key={c.id}
                    className="gap-2 text-xs"
                    disabled={modo === "nao"}
                    onSelect={() => escolherColuna(c)}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: c.hex }}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate">
                      {c.titulo}
                      {modo === "motivo" && "…"}
                    </span>
                    {modo === "nao" && (
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        (um por vez)
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            disabled={ocupado}
            onClick={() => trafego("organico")}
            title={`Marcar ${qtdLeads} como Orgânico`}
          >
            <Tag size={13} /> Orgânico
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs text-violet-700 dark:text-violet-300"
            disabled={ocupado}
            onClick={() => trafego("pago")}
            title={`Marcar ${qtdLeads} como Pago`}
          >
            <Tag size={13} /> Pago
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
            disabled={ocupado}
            onClick={() => setConfirmarExcluir(true)}
          >
            <Trash2 size={13} /> Excluir
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={onLimpar}
            disabled={ocupado}
            title="Limpar seleção (Esc)"
            aria-label="Limpar seleção"
          >
            <X size={15} />
          </Button>
        </div>
      </div>

      <Dialog
        open={!!colunaMotivo}
        onOpenChange={(aberto) => !aberto && !ocupado && setColunaMotivo(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Mover {qtdLeads} para {colunaMotivo?.titulo}
            </DialogTitle>
            <DialogDescription>
              O motivo escolhido vale para todos os selecionados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="crm-massa-motivo">Motivo</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger id="crm-massa-motivo">
                  <SelectValue placeholder="Escolha o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {(colunaMotivo ? motivosDa(colunaMotivo) : []).map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {ehOutro(motivo) && (
              <div className="space-y-1.5">
                <Label htmlFor="crm-massa-outro">Qual motivo?</Label>
                <Input
                  id="crm-massa-outro"
                  value={outro}
                  onChange={(e) => setOutro(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmarMotivo()}
                  placeholder="Descreva o motivo"
                  autoFocus
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setColunaMotivo(null)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarMotivo}
              disabled={!motivoFinal || ocupado}
              className="gap-1.5"
            >
              {ocupado && <Loader2 className="animate-spin" />}
              Mover {n}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmarExcluir}
        onOpenChange={(aberto) => !ocupado && setConfirmarExcluir(aberto)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {qtdLeads}?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga também o histórico e não tem volta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-destructive bg-none text-destructive-foreground shadow-none hover:bg-destructive/90"
              disabled={ocupado}
              onClick={(e) => {
                e.preventDefault();
                void executar((ids) => excluirLeads(ids));
              }}
            >
              {ocupado && <Loader2 className="animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return typeof document === "undefined" ? barra : createPortal(barra, document.body);
}
