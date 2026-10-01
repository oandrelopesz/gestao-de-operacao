import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/clientes";
import { nomeDoMes } from "@/lib/financeiro";
import type { Cobranca } from "@/lib/financeiroCobranca";

/** parcela = uma parcela do parcelado; mes = o mês do pagamento único; mes_inteiro = as parcelas em aberto do mês. */
export type ModoIsencao = "parcela" | "mes" | "mes_inteiro";

export interface AlvoIsencao {
  modo: ModoIsencao;
  /** A parcela (modos parcela e mes) ou as parcelas do mês (mes_inteiro). */
  cobrancas: Cobranca[];
}

interface Props {
  /** O que será isentado; null = janela fechada. */
  alvo: AlvoIsencao | null;
  /** Gravação em andamento: trava o botão. */
  ocupado: boolean;
  onFechar: () => void;
  /** Motivo digitado (pode ser vazio). */
  onConfirmar: (motivo: string) => void;
}

const TITULOS: Record<ModoIsencao, string> = {
  parcela: "Isentar parcela",
  mes: "Isentar este mês",
  mes_inteiro: "Isentar mês inteiro",
};

/** O que será abonado: o que falta das parcelas ainda não quitadas nem isentas (o já pago continua contando). */
function textoDoAbono(alvo: AlvoIsencao): string {
  const abertas = alvo.cobrancas.filter((c) => c.situacao !== "recebido" && c.situacao !== "isento");
  const valor = formatBRL(abertas.reduce((t, c) => t + c.falta, 0));
  const mes = nomeDoMes(`${(abertas[0] ?? alvo.cobrancas[0]).mes}-01`);
  if (alvo.modo === "mes_inteiro") return `Serão abonados ${valor} das parcelas ainda não quitadas de ${mes}.`;
  if (alvo.modo === "parcela") {
    const c = abertas[0] ?? alvo.cobrancas[0];
    return `Será abonado ${valor} da parcela ${c.parcela}/${c.total} de ${mes}.`;
  }
  return `Será abonado ${valor} de ${mes}.`;
}

/** Isenta uma parcela, o mês ou o mês inteiro, com um motivo opcional. */
export function IsentarDialog({ alvo, ocupado, onFechar, onConfirmar }: Props) {
  const id = useId();
  const [motivo, setMotivo] = useState("");
  // O alvo fica guardado para a janela não esvaziar durante a animação de fechar
  const [fixo, setFixo] = useState<AlvoIsencao | null>(null);
  const [chaveAberta, setChaveAberta] = useState<string | null>(null);

  // Ao abrir (ou trocar de alvo), limpa o motivo
  const chave = alvo ? `${alvo.modo}|${alvo.cobrancas.map((c) => `${c.mes}:${c.parcela}`).join(",")}` : null;
  if (chave !== chaveAberta) {
    setChaveAberta(chave);
    if (alvo) {
      setFixo(alvo);
      setMotivo("");
    }
  }

  const a = alvo ?? fixo;

  return (
    <Dialog open={alvo !== null} onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogContent className="sm:max-w-[420px]">
        {a && a.cobrancas.length > 0 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!ocupado) onConfirmar(motivo.trim());
            }}
          >
            <DialogHeader>
              <DialogTitle>{TITULOS[a.modo]}</DialogTitle>
              <DialogDescription>{textoDoAbono(a)}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor={`${id}-motivo`}>Motivo (opcional)</Label>
              <Textarea
                id={`${id}-motivo`}
                rows={3}
                placeholder="Ex.: desconto combinado, cortesia, erro de cobrança..."
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
              <Button type="submit" disabled={ocupado}>{ocupado ? "Isentando..." : "Isentar"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
