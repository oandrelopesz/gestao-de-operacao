// Ficha de uma fonte com recebimento por cliente: os clientes da agência que contam no mês, o valor de cada um
// (editável: salva um valor personalizado ou volta ao padrão) e a conta do mês.
import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL, maskBRLInput, parseBRLInput } from "@/lib/clientes";
import { textoDoValor } from "@/lib/financeiro";
import { calcularPorCliente, type LinhaCliente } from "@/lib/financeiroPorCliente";
import { salvarValorDoCliente, type DadosPorCliente } from "@/lib/financeiroPorClienteDados";

const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

function LinhaDoCliente({ linha, padrao, onSalvar }: { linha: LinhaCliente; padrao: number; onSalvar: (valor: number | null) => Promise<void> }) {
  const [texto, setTexto] = useState(textoDoValor(linha.valor));
  const [salvando, setSalvando] = useState(false);
  const novo = parseBRLInput(texto);
  const mudou = Math.round(novo * 100) !== Math.round(linha.valor * 100);
  const salvar = async (valor: number | null) => {
    setSalvando(true);
    try {
      await onSalvar(valor);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="space-y-1.5 rounded-lg border px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium">{linha.cliente.nome}</span>
        <span className="flex items-center gap-1.5">
          {linha.emChurn && (
            <Badge variant="outline" className="h-4 border-red-200 bg-red-50 py-0 text-[9px] text-red-700">
              Churn{linha.contrato_ate ? ` · contrato até ${dataBR(linha.contrato_ate)}` : ""}
            </Badge>
          )}
          {linha.personalizado && (
            <Badge variant="outline" className="h-4 border-amber-300 bg-amber-50 py-0 text-[9px] text-amber-800">Valor personalizado</Badge>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Valor de ${linha.cliente.nome}`}
          className="h-8 max-w-[9rem]"
          value={texto}
          disabled={salvando}
          onChange={(e) => setTexto(maskBRLInput(e.target.value))}
          onKeyDown={(e) => { if (e.key === "Enter" && mudou) salvar(novo === padrao ? null : novo); }}
        />
        {mudou && (
          <Button type="button" size="sm" className="h-8" disabled={salvando} onClick={() => salvar(novo === padrao ? null : novo)}>
            <Check className="mr-1 h-3.5 w-3.5" /> Salvar
          </Button>
        )}
        {linha.personalizado && !mudou && (
          <Button type="button" variant="ghost" size="sm" className="h-8" disabled={salvando} onClick={() => salvar(null)}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Voltar ao padrão ({formatBRL(padrao)})
          </Button>
        )}
      </div>
    </div>
  );
}

export function ClientesDaFonte({ fonteId, dados, mes, nomeMes, onSalvo }: {
  fonteId: string;
  dados: DadosPorCliente;
  /** "YYYY-MM" do mês da conta (o atual) */
  mes: string;
  nomeMes: string;
  /** Recarrega a aba depois de salvar */
  onSalvo: () => void | Promise<void>;
}) {
  const r = calcularPorCliente(dados.config, dados.clientes, dados.personalizados, mes);
  const padrao = dados.config.valor_por_cliente;
  const salvar = (clienteId: string) => async (valor: number | null) => {
    try {
      await salvarValorDoCliente(fonteId, clienteId, valor);
      toast.success(valor == null ? "Voltou ao valor padrão" : "Valor do cliente salvo");
      await onSalvo();
    } catch (error) {
      console.error("Erro ao salvar o valor do cliente:", error);
      toast.error("Não foi possível salvar. Tente de novo.");
    }
  };
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-bold">Clientes da agência ({nomeMes})</h4>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border bg-muted/50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Clientes</p>
          <p className="text-lg font-bold">{r.quantidade}</p>
        </div>
        <div className="rounded-lg border bg-muted/50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total do mês</p>
          <p className="text-lg font-bold">{formatBRL(r.total)}</p>
        </div>
        {dados.config.modelo === "fixo_variavel" && (
          <div className="rounded-lg border p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fixo</p>
            <p className="font-bold">{formatBRL(r.fixo)}</p>
          </div>
        )}
        <div className="rounded-lg border p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Variável ({formatBRL(padrao)} por cliente)</p>
          <p className="font-bold">{formatBRL(r.variavel)}</p>
        </div>
      </div>
      {r.clientes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          Nenhum cliente ativo nessa agência neste mês.
        </p>
      ) : (
        <div className="space-y-2">
          {r.clientes.map((l) => (
            <LinhaDoCliente key={`${l.cliente.id}-${l.valor}-${l.personalizado}`} linha={l} padrao={padrao} onSalvar={salvar(l.cliente.id)} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Cliente em churn sem contrato sai da conta na hora; com contrato, fica até o mês do fim dele. Meses já acertados não mudam.
      </p>
    </div>
  );
}
