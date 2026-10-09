import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { maskBRLInput, parseBRLInput } from "@/lib/clientes";
import { formatMoeda, simboloMoeda } from "@/lib/moedas";
import type { RecargaConta } from "@/components/RecargaForm";

const METODOS_VALIDOS = ["cartao", "pix", "boleto"];

export type RecargaLoteValues = {
  data_recarga: string;
  observacoes: string;
  /** Uma recarga por plataforma preenchida, com a forma de pagamento configurada nela */
  itens: { saldo_ads_id: string; valor: number; metodo_pagamento: "cartao" | "pix" | "boleto" | null }[];
};

interface Props {
  contas: RecargaConta[];
  onSubmit: (values: RecargaLoteValues) => void;
  loading?: boolean;
}

/** Recarrega várias plataformas do cliente de uma vez: uma data, um valor por plataforma, um clique. */
export function RecargaLoteForm({ contas, onSubmit, loading }: Props) {
  const [data, setData] = useState(() => new Date().toISOString().split("T")[0]);
  const [obs, setObs] = useState("");
  const [valores, setValores] = useState<Record<string, { texto: string; valor: number }>>({});
  const [erro, setErro] = useState<string | null>(null);

  const preenchidas = useMemo(() => contas.filter((c) => (valores[c.id]?.valor ?? 0) > 0), [contas, valores]);
  // Moedas diferentes não se somam: um total por moeda
  const totais = useMemo(() => {
    const por: Record<string, number> = {};
    preenchidas.forEach((c) => {
      const m = c.moeda || "BRL";
      por[m] = (por[m] ?? 0) + (valores[c.id]?.valor ?? 0);
    });
    return Object.entries(por);
  }, [preenchidas, valores]);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return setErro("Informe a data da recarga.");
    if (preenchidas.length === 0) return setErro("Preencha o valor de pelo menos uma plataforma.");
    setErro(null);
    onSubmit({
      data_recarga: data,
      observacoes: obs.trim(),
      itens: preenchidas.map((c) => ({
        saldo_ads_id: c.id,
        valor: valores[c.id].valor,
        metodo_pagamento: METODOS_VALIDOS.includes(c.metodo_pagamento || "") ? (c.metodo_pagamento as "cartao" | "pix" | "boleto") : null,
      })),
    });
  };

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="lote-data">Data da recarga</Label>
        <Input id="lote-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Quanto entrou em cada plataforma</Label>
        <p className="text-xs text-muted-foreground">Deixe em branco as plataformas que não recarregaram.</p>
        {contas.map((c) => {
          const simbolo = simboloMoeda(c.moeda || "BRL");
          return (
            <div key={c.id} className="grid grid-cols-[1fr_9rem] items-center gap-3 rounded-md border bg-background p-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{c.label}</span>
                  {c.pausada && <Badge variant="outline" className="py-0 text-[10px] text-amber-600">Pausada</Badge>}
                </p>
                {c.verba_diaria ? (
                  <p className="text-xs text-muted-foreground">Consumo de {formatMoeda(c.verba_diaria, c.moeda)}/dia</p>
                ) : null}
              </div>
              <Input
                inputMode="numeric"
                placeholder={`${simbolo} 0,00`}
                aria-label={`Valor da recarga em ${c.label}`}
                value={valores[c.id]?.texto ?? ""}
                onChange={(e) => {
                  const texto = maskBRLInput(e.target.value);
                  setValores((v) => ({ ...v, [c.id]: { texto, valor: parseBRLInput(e.target.value) } }));
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lote-obs">Observações</Label>
        <Textarea id="lote-obs" placeholder="Opcional..." value={obs} onChange={(e) => setObs(e.target.value)} />
      </div>

      {totais.length > 0 && (
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm">
          {preenchidas.length} {preenchidas.length === 1 ? "plataforma" : "plataformas"} · total{" "}
          <strong>{totais.map(([m, v]) => formatMoeda(v, m)).join(" + ")}</strong>
        </p>
      )}
      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Salvando..." : preenchidas.length > 1 ? `Registrar ${preenchidas.length} recargas` : "Registrar recarga"}
      </Button>
    </form>
  );
}
