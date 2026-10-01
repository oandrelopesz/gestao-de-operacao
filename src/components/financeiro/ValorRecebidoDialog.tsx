import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL, maskBRLInput, parseBRLInput } from "@/lib/clientes";
import { nomeDoMes, textoDoValor } from "@/lib/financeiro";
import { hojeBrasilia } from "@/lib/entrega";
import type { Cobranca } from "@/lib/financeiroCobranca";

interface Props {
  /** A parcela que está sendo acertada; null = janela fechada. */
  cobranca: Cobranca | null;
  /** Id da fonte (cliente) da parcela: a janela reinicia o formulário também ao trocar de cliente. */
  fonteId?: string;
  /** Gravação em andamento: trava os botões e ignora fechar (Cancelar, X e Esc). */
  ocupado: boolean;
  onFechar: () => void;
  /** `valor` = o recebido NO TOTAL da parcela; `data` = "YYYY-MM-DD". */
  onConfirmar: (valor: number, data: string) => void;
}

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

/** "Configurar valor recebido": o total recebido da parcela e a data. Valor menor que o devido deixa o resto em aberto. */
export function ValorRecebidoDialog({ cobranca, fonteId, ocupado, onFechar, onConfirmar }: Props) {
  const id = useId();
  const [valorTexto, setValorTexto] = useState("");
  const [data, setData] = useState("");
  // A parcela fica guardada para a janela não esvaziar durante a animação de fechar
  const [fixa, setFixa] = useState<Cobranca | null>(null);
  const [chaveAberta, setChaveAberta] = useState<string | null>(null);

  // Ao abrir (ou trocar de parcela), prepara o formulário: o já pago ou o valor cheio, e hoje
  const chave = cobranca ? `${fonteId ?? ""}|${cobranca.mes}|${cobranca.parcela}` : null;
  if (chave !== chaveAberta) {
    setChaveAberta(chave);
    if (cobranca) {
      setFixa(cobranca);
      setValorTexto(textoDoValor(cobranca.pago > 0 ? cobranca.pago : cobranca.valor));
      setData(hojeBrasilia());
    }
  }

  const c = cobranca ?? fixa;
  const valor = parseBRLInput(valorTexto);
  const podeSalvar = valor > 0 && DATA_VALIDA.test(data) && !ocupado;

  return (
    <Dialog open={cobranca !== null} onOpenChange={(aberto) => { if (!aberto && !ocupado) onFechar(); }}>
      <DialogContent className="sm:max-w-[420px]">
        {c && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (podeSalvar) onConfirmar(valor, data);
            }}
          >
            <DialogHeader>
              <DialogTitle>Configurar valor recebido</DialogTitle>
              <DialogDescription>
                {nomeDoMes(`${c.mes}-01`)}
                {c.total > 1 ? ` · parcela ${c.parcela}/${c.total}` : ""} · {formatBRL(c.valor)}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor={`${id}-valor`}>Valor recebido no total desta parcela</Label>
                <Input
                  id={`${id}-valor`}
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                  value={valorTexto}
                  onChange={(e) => setValorTexto(maskBRLInput(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-describedby={`${id}-ajuda`}
                />
                <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
                  Valor menor que {formatBRL(c.valor)} deixa o resto em aberto.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${id}-data`}>Data do recebimento</Label>
                <Input id={`${id}-data`} type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={ocupado} onClick={onFechar}>Cancelar</Button>
              <Button type="submit" disabled={!podeSalvar}>{ocupado ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
