import type { MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/clientes";
import { cn } from "@/lib/utils";
import { nomeDoMes } from "@/lib/financeiro";
import { hojeBrasilia } from "@/lib/entrega";
import { INFO_SITUACAO, type Cobranca } from "@/lib/financeiroCobranca";
import { FormaBadge } from "@/components/financeiro/FormaBadge";

interface Props {
  cobranca: Cobranca;
  /** Mostra o mês ("setembro de 2026"): nas listas que misturam meses (atrasado). */
  mostrarMes?: boolean;
  onValorCheio: (cobranca: Cobranca) => void;
  onConfigurar: (cobranca: Cobranca) => void;
  onIsentar: (cobranca: Cobranca) => void;
  onDesfazer: (cobranca: Cobranca) => void;
  /** Uma gravação em andamento: trava os botões. */
  ocupado: boolean;
  /** Esconde o "Isentar" da linha (o card do pagamento único isenta pelo "Isentar este mês"). */
  semIsentar?: boolean;
}

/** "Recebido em dd/mm/aaaa" no dia de Brasília; nada se a data não existe ou não é válida. */
function textoDoRecebimento(dataConfirmacao: string | null | undefined): string | null {
  if (!dataConfirmacao) return null;
  const quando = new Date(dataConfirmacao);
  if (Number.isNaN(quando.getTime())) return null;
  const dia = hojeBrasilia(quando);
  return `Recebido em ${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
}

/** Uma parcela de um mês: valor, forma, situação (texto + cor) e as ações de acertar, isentar ou desfazer. */
export function CobrancaLinha({ cobranca: c, mostrarMes, onValorCheio, onConfigurar, onIsentar, onDesfazer, ocupado, semIsentar }: Props) {
  const info = INFO_SITUACAO[c.situacao];
  const parcelado = c.total > 1;
  // Quitada ou isenta: só desfazer. Parcial: ainda dá para acertar o resto e também desfazer (volta a não acertada)
  const quitadaOuIsenta = c.situacao === "recebido" || c.situacao === "isento";
  const mes = nomeDoMes(`${c.mes}-01`);
  const motivo = c.registro?.observacoes?.trim();

  let detalhe: string | null = null;
  if (c.situacao === "recebido") {
    detalhe = textoDoRecebimento(c.registro?.data_confirmacao);
  } else if (c.situacao === "parcial") {
    detalhe = [`Pago ${formatBRL(c.pago)} · falta ${formatBRL(c.falta)}`, textoDoRecebimento(c.registro?.data_confirmacao)]
      .filter(Boolean)
      .join(" · ");
  } else if (c.situacao === "isento") {
    detalhe = [
      c.pago > 0 ? `Pago ${formatBRL(c.pago)}` : null,
      c.abonado > 0 ? `Abonado ${formatBRL(c.abonado)}` : null,
      motivo ? `Motivo: ${motivo}` : null,
    ].filter(Boolean).join(" · ") || null;
  }

  // O clique não sobe: o card que contém a linha pode ter ação própria
  const acionar = (acao: (cobranca: Cobranca) => void) => (e: MouseEvent) => {
    e.stopPropagation();
    acao(c);
  };

  const rotulo = [mostrarMes ? mes : null, parcelado ? `parcela ${c.parcela} de ${c.total}` : null].filter(Boolean).join(", ");

  return (
    <div role="group" aria-label={rotulo ? `Cobrança: ${rotulo}` : "Cobrança"} className="space-y-2 rounded-md border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          {mostrarMes && <div className="font-semibold">{mes}</div>}
          {parcelado && <div className="text-xs text-muted-foreground">{`Parcela ${c.parcela}/${c.total} · dia ${c.dia}`}</div>}
          <div className="font-bold">{formatBRL(c.valor)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FormaBadge forma={c.forma} />
          <Badge variant="outline" className={cn("font-medium", info.classe)}>{info.label}</Badge>
        </div>
      </div>

      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}

      <div className="flex flex-wrap gap-1.5">
        {!quitadaOuIsenta && (
          <>
            <Button type="button" size="sm" disabled={ocupado} onClick={acionar(onValorCheio)}>Valor cheio</Button>
            <Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={acionar(onConfigurar)}>
              Configurar valor recebido
            </Button>
            {!semIsentar && (
              <Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={acionar(onIsentar)}>
                {parcelado ? "Isentar parcela" : "Isentar"}
              </Button>
            )}
          </>
        )}
        {(quitadaOuIsenta || c.situacao === "parcial") && (
          <Button type="button" variant="outline" size="sm" disabled={ocupado || !c.registro} onClick={acionar(onDesfazer)}>
            Desfazer
          </Button>
        )}
      </div>
    </div>
  );
}
