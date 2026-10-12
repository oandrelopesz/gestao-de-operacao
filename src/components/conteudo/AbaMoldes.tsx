// Moldes do cliente: criar (um por vez, cerca de 1 minuto cada), ver a prévia, aprovar, pedir mudança ou refazer.
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ajustarMolde, aprovarMolde, criarMolde, urlArquivo, type ClienteConteudo } from "@/lib/conteudo";
import { ROTULO_MOLDE, TIPOS_MOLDE, type TipoMolde } from "../../../supabase/functions/conteudo/regras.ts";

export function AbaMoldes({ cliente, recarregar }: { cliente: ClienteConteudo; recarregar: () => void }) {
  const [criando, setCriando] = useState<TipoMolde | null>(null);
  const [aberto, setAberto] = useState<TipoMolde | null>(null);
  const [pedido, setPedido] = useState("");
  const pronto = !!cliente.design_system.trim() && cliente.logos.length > 0;
  const faltam = TIPOS_MOLDE.filter((t) => !cliente.moldes[t]);

  async function criar(tipos: TipoMolde[]) {
    for (const t of tipos) {
      setCriando(t);
      try {
        await criarMolde(cliente.id, t);
        recarregar();
      } catch (e: any) {
        toast.error(`${ROTULO_MOLDE[t]}: ${e.message}`);
        break;
      }
    }
    setCriando(null);
  }
  async function ajustar(t: TipoMolde) {
    setCriando(t);
    try {
      await ajustarMolde(cliente.id, t, pedido);
      setPedido("");
      setAberto(null);
      recarregar();
      toast.success("Nova versão do molde pronta para aprovar.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCriando(null);
    }
  }
  async function aprovar(t: TipoMolde) {
    try {
      const remontados = await aprovarMolde(cliente.id, t);
      recarregar();
      toast.success(`${ROTULO_MOLDE[t]} aprovado.${remontados ? ` ${remontados} post${remontados > 1 ? "s" : ""} aguardando aprovação vão ser remontados com ele.` : ""}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-3">
      {!pronto && <p className="text-sm text-amber-600">Antes dos moldes, preencha o design system e envie pelo menos uma logo (aba Kit da marca).</p>}
      {faltam.length > 0 && (
        <div className="flex items-center gap-2">
          <Button disabled={!pronto || !!criando} onClick={() => criar(faltam)}>
            {criando ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Criando {ROTULO_MOLDE[criando].toLowerCase()}...</> : `Criar moldes (${faltam.length})`}
          </Button>
          <span className="text-xs text-muted-foreground">Cada molde leva cerca de 1 minuto.</span>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {TIPOS_MOLDE.map((t) => {
          const m = cliente.moldes[t];
          return (
            <Card key={t}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{ROTULO_MOLDE[t]}</span>
                  {m && (m.anterior
                    ? <Badge variant="outline">{`Nova versão aguardando aprovação (v${m.versao}); a v${m.anterior.versao} segue em uso`}</Badge>
                    : <Badge variant={m.aprovado_em ? "secondary" : "outline"}>{m.aprovado_em ? `Aprovado (v${m.versao})` : `Aguardando aprovação (v${m.versao})`}</Badge>)}
                </div>
                {m?.previa_chave && criando !== t
                  ? <img src={urlArquivo(m.previa_chave)} alt={`Prévia: ${ROTULO_MOLDE[t]}`} className="aspect-[4/5] w-full rounded border object-cover" />
                  : <div className="flex aspect-[4/5] w-full items-center justify-center rounded border bg-muted px-2 text-center text-sm text-muted-foreground">
                      {criando === t
                        ? <Loader2 className="h-5 w-5 animate-spin" />
                        : !m ? "Ainda não criado" : "Prévia não gerada. Clique em Refazer (sem custo de IA)."}
                    </div>}
                {m && (
                  <div className="flex flex-wrap gap-2">
                    {!m.aprovado_em && <Button size="sm" onClick={() => aprovar(t)} disabled={!!criando}>Aprovar</Button>}
                    <Button size="sm" variant="outline" onClick={() => { setAberto(aberto === t ? null : t); setPedido(""); }} disabled={!!criando}>Pedir mudança</Button>
                    <Button size="sm" variant="ghost" onClick={() => criar([t])} disabled={!!criando}>Refazer</Button>
                  </div>
                )}
                {aberto === t && (
                  <div className="space-y-2">
                    <Textarea rows={3} placeholder="Ex.: título maior, logo no canto de baixo" value={pedido} onChange={(e) => setPedido(e.target.value)} />
                    <Button size="sm" disabled={!pedido.trim() || !!criando} onClick={() => ajustar(t)}>Enviar pedido</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
