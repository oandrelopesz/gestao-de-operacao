import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Link2, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarDataCurta } from "@/lib/entrega";
import {
  atualizarProcesso,
  fetchProcessos,
  fetchRoadmapsLigados,
  type Passo,
  type Processo,
} from "@/lib/processosService";

const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as any).message) : "Erro ao carregar");

export interface PassosDoOnboarding {
  /** Onboarding ativo do cliente (null = cliente sem onboarding ativo). */
  onboarding: Processo | null;
  /** Passos desse onboarding que ainda não têm roadmap ligado, na ordem da trilha. */
  livres: Passo[];
}

/**
 * Passos do onboarding ativo do cliente que ainda não têm roadmap ligado.
 * `ignorarRoadmapId`: o roadmap que está sendo religado não conta como "ocupando" o próprio passo.
 */
export async function fetchPassosLivres(clienteId: string, ignorarRoadmapId?: string): Promise<PassosDoOnboarding> {
  const onboarding = (await fetchProcessos("onboarding", "ativos")).find((p) => p.cliente_id === clienteId) ?? null;
  if (!onboarding) return { onboarding: null, livres: [] };
  const ligados = await fetchRoadmapsLigados(onboarding.passos.map((p) => p.id));
  const ocupados = new Set(ligados.filter((r) => r.id !== ignorarRoadmapId).map((r) => r.passo_onboarding_id));
  return { onboarding, livres: onboarding.passos.filter((p) => !ocupados.has(p.id)) };
}

/** Rótulo de um passo no Select: "3. Título · 12/10" (+ "concluído"). */
export function rotuloPasso(passo: Passo, onboarding: Processo): string {
  const n = onboarding.passos.findIndex((p) => p.id === passo.id) + 1;
  const partes = [`${n}. ${passo.titulo}`];
  if (passo.data) partes.push(formatarDataCurta(passo.data));
  if (passo.concluido_em) partes.push("concluído");
  return partes.join(" · ");
}

/** Select dos passos livres do onboarding. `valor` vazio = nenhum. */
export function PassoOnboardingSelect({
  dados,
  valor,
  onChange,
  permitirNenhum = true,
  disabled,
}: {
  dados: PassosDoOnboarding;
  valor: string;
  onChange: (id: string) => void;
  permitirNenhum?: boolean;
  disabled?: boolean;
}) {
  const { onboarding, livres } = dados;
  if (!onboarding) return null;
  return (
    <Select value={valor || "__nenhum"} onValueChange={(v) => onChange(v === "__nenhum" ? "" : v)} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder="Escolha um passo" />
      </SelectTrigger>
      <SelectContent>
        {permitirNenhum && <SelectItem value="__nenhum">Não ligar</SelectItem>}
        {!permitirNenhum && !valor && <SelectItem value="__nenhum" disabled>Escolha um passo</SelectItem>}
        {livres.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <span className="inline-flex items-center gap-1.5">
              {p.concluido_em && <CheckCircle2 size={13} className="text-emerald-600" />}
              {rotuloPasso(p, onboarding)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface LigarPassoDialogProps {
  aberto: boolean;
  roadmap: Processo | null;
  onClose: () => void;
  onMudou: () => void;
}

/** Liga um roadmap a um passo do onboarding ativo do mesmo cliente. */
export function LigarPassoDialog({ aberto, roadmap, onClose, onMudou }: LigarPassoDialogProps) {
  const [dados, setDados] = useState<PassosDoOnboarding | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [passoId, setPassoId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const requisicao = useRef(0);

  useEffect(() => {
    if (!aberto || !roadmap) return;
    const minha = ++requisicao.current;
    setDados(null);
    setErro(null);
    setPassoId("");
    // Roadmap pessoal não tem cliente, logo não tem onboarding
    if (!roadmap.cliente_id) { setDados({ onboarding: null, livres: [] }); return; }
    fetchPassosLivres(roadmap.cliente_id, roadmap.id)
      .then((d) => { if (minha === requisicao.current) setDados(d); })
      .catch((e) => { if (minha === requisicao.current) setErro(erroMsg(e)); });
  }, [aberto, roadmap]);

  const passoEscolhido = dados?.livres.find((p) => p.id === passoId) ?? null;

  const salvar = async () => {
    if (!roadmap || !passoId || salvando) return;
    setSalvando(true);
    try {
      await atualizarProcesso(roadmap.id, { passo_onboarding_id: passoId });
      toast.success(`Roadmap ligado ao passo "${passoEscolhido?.titulo ?? "do onboarding"}"`);
      onClose();
      onMudou();
    } catch (e) {
      toast.error(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !salvando) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ligar a um passo do onboarding</DialogTitle>
          <DialogDescription>
            O prazo final do roadmap passa a ser a data do passo, e mudar um muda o outro. Quando o roadmap chegar a 100%, o passo é concluído.
          </DialogDescription>
        </DialogHeader>

        {erro ? (
          <p className="text-sm text-destructive">{erro}</p>
        ) : !dados ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : !dados.onboarding ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center">
            <Rocket size={22} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {roadmap?.pessoal ? "Roadmap pessoal não tem onboarding." : `${roadmap?.cliente?.nome ?? "Este cliente"} não tem um onboarding ativo.`}
            </p>
          </div>
        ) : dados.livres.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center">
            <Link2 size={22} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Todos os passos do onboarding já têm um roadmap ligado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label className="text-xs">Passo do onboarding de {roadmap?.cliente?.nome ?? "cliente"}</Label>
            <PassoOnboardingSelect dados={dados} valor={passoId} onChange={setPassoId} permitirNenhum={false} />
            {passoEscolhido && (
              <p className="text-xs text-muted-foreground">
                {passoEscolhido.data
                  ? `O prazo final do roadmap passa a ser ${formatarDataCurta(passoEscolhido.data)} (data do passo).`
                  : roadmap?.prazo_final
                    ? `O passo está sem data: ele recebe o prazo final do roadmap (${formatarDataCurta(roadmap.prazo_final)}).`
                    : "O passo e o roadmap estão sem data — ao definir uma, a outra acompanha."}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={!passoId || salvando} className="gap-1.5">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            Ligar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
