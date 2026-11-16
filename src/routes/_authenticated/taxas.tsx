import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Percent, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCachedState, hasCached } from "@/lib/pageCache";
import { CACHE_KEYS } from "@/lib/data";
import { formatBRL, maskBRLInput, parseBRLInput } from "@/lib/clientes";
import {
  calcularTaxa, formatarTaxa, lerTaxa, limparTaxa, taxaParaCampo, valorParaCopiar,
  type Direcao, type Metodo,
} from "@/lib/taxas";
import { excluirTaxa, fetchTaxas, salvarTaxa, traduzErroTaxa, type TaxaTemplate } from "@/lib/taxasGuardadas";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/taxas")({ component: TaxasPage });

const DIRECOES: Record<Direcao, { aba: string; valor: string; resultado: string; dica: string }> = {
  acrescentar: {
    aba: "Acrescentar taxa",
    valor: "Valor que você quer receber",
    resultado: "Valor com a taxa (para pagar)",
    dica: "Descobre quanto pagar (ex.: no PIX) para sobrar o valor desejado depois da taxa.",
  },
  descontar: {
    aba: "Descontar taxa",
    valor: "Valor pago, com a taxa",
    resultado: "Valor sem a taxa (o que sobra)",
    dica: "Descobre quanto sobra de um valor já pago depois de tirar a taxa.",
  },
};

const METODOS: Record<Metodo, { aba: string; dica: string }> = {
  fora: { aba: "Taxa por fora", dica: "A taxa soma por cima do valor: R$ 1.000 + 10% = R$ 1.100." },
  dentro: { aba: "Taxa por dentro", dica: "A taxa já está no total e é % do total: R$ 1.000 vira R$ 1.111,11 para a taxa de 10% sobrar R$ 1.000." },
};

function TaxasPage() {
  const [templates, setTemplates] = useCachedState<TaxaTemplate[]>(CACHE_KEYS.taxas, []);
  const [carregando, setCarregando] = useState(!hasCached(CACHE_KEYS.taxas));
  const [erro, setErro] = useState<string | null>(null);

  const [direcao, setDirecao] = useState<Direcao>("acrescentar");
  const [metodo, setMetodo] = useState<Metodo>("fora");
  const [valorTxt, setValorTxt] = useState("");
  const [taxaTxt, setTaxaTxt] = useState("");
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setTemplates(await fetchTaxas());
      setErro(null);
    } catch (e) {
      setErro(traduzErroTaxa(e));
    } finally {
      setCarregando(false);
    }
  }, [setTemplates]);
  useEffect(() => { carregar(); }, [carregar]);

  const valor = parseBRLInput(valorTxt);
  const taxa = lerTaxa(taxaTxt);
  const r = useMemo(() => calcularTaxa(valor, taxa, direcao, metodo), [valor, taxa, direcao, metodo]);
  const atual = templates.find((t) => t.taxa === taxa && t.metodo === metodo && taxaTxt !== "");
  const textos = DIRECOES[direcao];

  const aplicar = (t: TaxaTemplate) => { setTaxaTxt(taxaParaCampo(t.taxa)); setMetodo(t.metodo); };

  const salvar = async () => {
    if (!nome.trim() || !taxaTxt) return;
    setSalvando(true);
    try {
      const feito = await salvarTaxa({ nome, taxa, metodo }, templates);
      toast.success(feito === "criado" ? "Template salvo" : "Template atualizado");
      setNome("");
      await carregar();
    } catch (e) {
      toast.error(traduzErroTaxa(e));
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (t: TaxaTemplate) => {
    try {
      await excluirTaxa(t.id);
      await carregar();
      toast.success(`"${t.nome}" excluído`, {
        action: { label: "Desfazer", onClick: () => salvarTaxa(t, []).then(carregar).catch((e) => toast.error(traduzErroTaxa(e))) },
      });
    } catch (e) {
      toast.error(traduzErroTaxa(e));
    }
  };

  const copiar = async () => {
    if (!r) return;
    try {
      await navigator.clipboard.writeText(valorParaCopiar(r.resultado));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
          <Percent size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calculadora de taxas</h1>
          <p className="text-sm text-muted-foreground">Acrescente ou desconte uma taxa (PIX da Meta, gateway, imposto) sem fazer conta</p>
        </div>
      </div>

      {erro && <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{erro}</CardContent></Card>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <CardContent className="space-y-5 p-4 sm:p-5">
            <section className="space-y-2" aria-label="Templates de taxa">
              <Label className="text-xs text-muted-foreground">Templates</Label>
              {templates.length ? (
                <div className="flex flex-wrap gap-2">
                  {templates.map((t) => {
                    const ativo = atual?.id === t.id;
                    return (
                      <span
                        key={t.id}
                        className={cn(
                          "inline-flex items-center rounded-full border text-sm transition-colors",
                          ativo ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent",
                        )}
                      >
                        <button type="button" onClick={() => aplicar(t)} className="rounded-full py-1.5 pl-3 pr-2 text-left" aria-pressed={ativo}>
                          <span className="font-medium">{t.nome}</span>{" "}
                          <span className="tabular-nums text-muted-foreground">{formatarTaxa(t.taxa)}</span>
                        </button>
                        <button
                          type="button" onClick={() => excluir(t)} aria-label={`Excluir template ${t.nome}`}
                          className="mr-1 rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {carregando ? "Carregando..." : "Nenhum template ainda. Preencha a taxa e salve embaixo, ex.: \"Taxa do Meta\"."}
                </p>
              )}
            </section>

            <Tabs value={direcao} onValueChange={(v) => setDirecao(v as Direcao)} className="space-y-1.5">
              <TabsList className="grid w-full grid-cols-2">
                {(Object.keys(DIRECOES) as Direcao[]).map((d) => <TabsTrigger key={d} value={d}>{DIRECOES[d].aba}</TabsTrigger>)}
              </TabsList>
              <p className="text-xs text-muted-foreground">{textos.dica}</p>
            </Tabs>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <div className="space-y-1.5">
                <Label htmlFor="taxa-valor">{textos.valor}</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input
                    id="taxa-valor" inputMode="numeric" autoComplete="off" placeholder="0,00" autoFocus
                    className="h-12 pl-10 text-lg font-semibold tabular-nums"
                    value={valorTxt} onChange={(e) => setValorTxt(parseBRLInput(e.target.value) ? maskBRLInput(e.target.value) : "")}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="taxa-pct">Taxa</Label>
                <div className="relative">
                  <Input
                    id="taxa-pct" inputMode="decimal" autoComplete="off" placeholder="0"
                    className="h-12 pr-8 text-lg font-semibold tabular-nums"
                    value={taxaTxt} onChange={(e) => setTaxaTxt(limparTaxa(e.target.value))}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            <Tabs value={metodo} onValueChange={(v) => setMetodo(v as Metodo)} className="space-y-1.5">
              <TabsList className="grid w-full grid-cols-2">
                {(Object.keys(METODOS) as Metodo[]).map((m) => <TabsTrigger key={m} value={m}>{METODOS[m].aba}</TabsTrigger>)}
              </TabsList>
              <p className="text-xs text-muted-foreground">{METODOS[metodo].dica}</p>
            </Tabs>

            <form
              className="flex gap-2 border-t pt-4"
              onSubmit={(e) => { e.preventDefault(); salvar(); }}
            >
              <Input
                aria-label="Nome do template" placeholder='Nome do template, ex.: "Taxa do Meta"' maxLength={40}
                value={nome} onChange={(e) => setNome(e.target.value)}
              />
              <Button type="submit" variant="secondary" disabled={salvando || !nome.trim() || !taxaTxt} className="shrink-0 gap-1.5">
                <Save size={15} /> <span className="hidden sm:inline">Salvar template</span><span className="sm:hidden">Salvar</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="order-first border-primary/30 lg:sticky lg:top-4 lg:order-none" aria-live="polite">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{textos.resultado}</p>
              <p className={cn("mt-1 break-words text-4xl font-bold tabular-nums tracking-tight", !r && "text-muted-foreground/40")} data-testid="resultado">
                {formatBRL(r?.resultado ?? 0)}
              </p>
            </div>
            <Button onClick={copiar} disabled={!r} className="w-full gap-2">
              {copiado ? <Check size={16} /> : <Copy size={16} />}
              {copiado ? "Copiado" : r ? `Copiar ${valorParaCopiar(r.resultado)}` : "Copiar valor"}
            </Button>
            {r ? (
              <dl className="space-y-2 border-t pt-3 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Valor informado</dt><dd className="font-medium tabular-nums">{formatBRL(valor)}</dd></div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Taxa ({formatarTaxa(taxa)})</dt>
                  <dd className="font-medium tabular-nums" data-testid="taxa-reais">{direcao === "acrescentar" ? "+" : "−"} {formatBRL(r.taxaEmReais)}</dd>
                </div>
                <p className="border-t pt-2 text-xs tabular-nums text-muted-foreground">{r.formula} = {formatBRL(r.resultado)}</p>
              </dl>
            ) : (
              <p className="border-t pt-3 text-sm text-muted-foreground">Digite o valor e a taxa para ver o resultado.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
