import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ExternalLink, Loader2, Pencil, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatMoeda, simboloMoeda } from "@/lib/moedas";
import { usePlataformas } from "@/lib/plataformas";
import { fetchVerbaPrincipal, salvarVerbaPrincipal, type VerbaPrincipal } from "@/lib/processosService";

interface VerbaOnboardingProps {
  clienteId: string;
  /** "cabecalho": bloco à direita do card; "linha": linha do resumo do diálogo de conclusão. */
  variante?: "cabecalho" | "linha";
  onSalvo?: (v: VerbaPrincipal) => void;
}

const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as any).message) : "Erro ao salvar");

/** Verba mensal da operação principal do cliente, editável num popover (plataforma + valor). */
export function VerbaOnboarding({ clienteId, variante = "cabecalho", onSalvo }: VerbaOnboardingProps) {
  const navigate = useNavigate();
  const { nomes } = usePlataformas();
  const [verba, setVerba] = useState<VerbaPrincipal | null>(null);
  const [aberto, setAberto] = useState(false);
  const [plataforma, setPlataforma] = useState("");
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try {
      setVerba(await fetchVerbaPrincipal(clienteId));
    } catch (e) {
      console.error("Erro ao buscar verba:", e);
      setVerba({ operacaoId: null, moeda: "BRL", plataforma: null, valor: 0, plataformasConfiguradas: [] });
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  // Ao abrir, preenche com o que já está salvo
  useEffect(() => {
    if (!aberto) return;
    setPlataforma(verba?.plataforma ?? nomes[0] ?? "");
    setValor(verba && verba.valor > 0 ? String(verba.valor) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const opcoes = Array.from(new Set([...(verba?.plataformasConfiguradas ?? []), ...nomes]));
  const numero = Number(valor.replace(",", "."));
  const valido = !!plataforma && valor.trim() !== "" && Number.isFinite(numero) && numero >= 0;

  const salvar = async () => {
    if (!valido || salvando) return;
    setSalvando(true);
    try {
      await salvarVerbaPrincipal(clienteId, plataforma, numero);
      const nova = await fetchVerbaPrincipal(clienteId);
      // Mostra a plataforma que acabou de ser editada, mesmo que não seja a primeira configurada
      const exibida = { ...nova, plataforma, valor: numero };
      setVerba(exibida);
      onSalvo?.(exibida);
      setAberto(false);
      toast.success("Verba mensal salva");
    } catch (e) {
      toast.error(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  };

  const temVerba = !!verba && !!verba.plataforma && verba.valor > 0;
  const carregando = verba === null;

  const gatilho = variante === "cabecalho" ? (
    <button
      type="button"
      className={cn(
        "group flex min-w-[9.5rem] items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors",
        temVerba ? "border-border/70 bg-muted/30 hover:bg-muted/60" : "border-dashed border-primary/40 text-primary hover:bg-primary/5",
      )}
    >
      <span className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
        temVerba ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary",
      )}>
        <Wallet size={15} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Verba mensal</span>
        {carregando ? (
          <span className="block h-4 w-16 animate-pulse rounded bg-muted" />
        ) : temVerba ? (
          <span className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold tabular-nums text-foreground">{formatMoeda(verba!.valor, verba!.moeda)}</span>
            <span className="truncate text-xs text-muted-foreground">{verba!.plataforma}</span>
          </span>
        ) : (
          <span className="block text-sm font-medium">Definir verba</span>
        )}
      </span>
      <Pencil size={12} className="ml-auto shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  ) : (
    <button
      type="button"
      className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 -mx-1.5 text-sm font-medium hover:bg-muted"
    >
      {carregando ? (
        <span className="h-4 w-16 animate-pulse rounded bg-muted" />
      ) : temVerba ? (
        <>
          <span className="tabular-nums">{formatMoeda(verba!.valor, verba!.moeda)}</span>
          <span className="text-xs font-normal text-muted-foreground">{verba!.plataforma}</span>
        </>
      ) : (
        <span className="text-primary">Definir verba</span>
      )}
      <Pencil size={12} className="text-muted-foreground" />
    </button>
  );

  return (
    <Popover open={aberto} onOpenChange={(o) => { if (!salvando) setAberto(o); }}>
      <PopoverTrigger asChild disabled={carregando}>{gatilho}</PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div>
          <p className="text-sm font-semibold">Verba mensal</p>
          <p className="text-xs text-muted-foreground">Quanto o cliente vai investir por mês em anúncios.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Plataforma</Label>
          <Select value={plataforma} onValueChange={setPlataforma}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Escolha a plataforma" /></SelectTrigger>
            <SelectContent>
              {opcoes.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Valor por mês ({simboloMoeda(verba?.moeda)})</Label>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvar(); } }}
            className="h-9"
            autoFocus
          />
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => { setAberto(false); navigate({ to: "/clientes" as any }); }}
          >
            Editar no cadastro <ExternalLink size={11} />
          </button>
          <Button size="sm" onClick={salvar} disabled={!valido || salvando} className="gap-1.5">
            {salvando && <Loader2 size={13} className="animate-spin" />}
            Salvar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
