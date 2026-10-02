// Ficha do lead do Banco de leads (painel lateral; tela cheia no celular): todos os campos visíveis da aba, atalhos,
// Lead válido, Primeira mensagem enviada (entra e sai do CRM), bloco do CRM e exclusão. Spec §8.2.
import { useEffect, useState } from "react";
import { AtSign, Globe, KanbanSquare, MessageCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
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
  colunasVisiveis,
  ehSim,
  ehValido,
  linkDoTexto,
  linkInstagram,
  NAO,
  nomeDoLead,
  SIM,
  valorDoPapel,
  type AbaBanco,
  type LeadBanco,
} from "@/lib/bancoLeads";
import { linkWhatsapp } from "@/lib/crmWhatsapp";
import { formatarData } from "@/lib/crmFormato";
import type { ColunaCrm, LeadCrm } from "@/lib/crmTipos";
import { cn } from "@/lib/utils";

function Campo({ titulo, valor, onSalvar }: { titulo: string; valor: string; onSalvar: (v: string) => void }) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  const longo = valor.length > 60 || valor.includes("\n");
  const salvar = () => {
    if (texto.trim() !== valor.trim()) onSalvar(texto);
  };
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{titulo}</span>
      {longo ? (
        <Textarea rows={4} className="text-sm" value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={salvar} />
      ) : (
        <Input className="h-9 text-sm" value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={salvar} />
      )}
    </label>
  );
}

function SimNaoBotoes({ rotulo, sim, onMudar }: { rotulo: string; sim: boolean; onMudar: (sim: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <span className="text-sm">{rotulo}</span>
      <div role="group" aria-label={rotulo} className="inline-flex rounded-lg border bg-background p-0.5">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={sim === v}
            onClick={() => sim !== v && onMudar(v)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              sim === v ? (v ? "bg-emerald-600 text-white" : "bg-rose-600 text-white") : "text-muted-foreground hover:bg-muted",
            )}
          >
            {v ? "Sim" : "Não"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BancoFicha({
  lead,
  aba,
  crmLead,
  crmColuna,
  onFechar,
  onEditar,
  onEnviarAoCrm,
  onTirarDoCrm,
  onExcluir,
  onAbrirNoCrm,
}: {
  lead: LeadBanco | null;
  aba: AbaBanco | null;
  crmLead: LeadCrm | null;
  crmColuna: ColunaCrm | null;
  onFechar: () => void;
  onEditar: (l: LeadBanco, chave: string, v: string) => void;
  onEnviarAoCrm: (l: LeadBanco) => void;
  onTirarDoCrm: (l: LeadBanco) => void;
  onExcluir: (l: LeadBanco) => void;
  onAbrirNoCrm: (crmId: string) => void;
}) {
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const aberto = !!lead && !!aba;
  const nome = lead && aba ? nomeDoLead(lead, aba) : "";
  const telefone = lead && aba ? valorDoPapel(lead, aba, "telefone") : "";
  const instagram = lead && aba ? linkInstagram(valorDoPapel(lead, aba, "instagram")) ?? linkDoTexto(valorDoPapel(lead, aba, "link_instagram")) : null;
  const site = lead && aba ? linkDoTexto(valorDoPapel(lead, aba, "site")) : null;
  const whatsapp = linkWhatsapp(telefone);
  const valido = lead && aba ? ehValido(lead, aba) : true;
  const campos = aba ? colunasVisiveis(aba).filter((c) => c.papel !== "valido" && c.papel !== "primeira_msg") : [];
  const chaveValido = aba?.colunas.find((c) => c.papel === "valido")?.chave ?? null;
  const chave1msg = aba?.colunas.find((c) => c.papel === "primeira_msg")?.chave ?? null;

  return (
    <Sheet open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {lead && aba && (
          <div className="flex flex-col">
            <div className="space-y-3 border-b bg-muted/30 p-4 pr-14 sm:p-6 sm:pr-14">
              <SheetTitle className="text-xl font-semibold leading-tight">{nome}</SheetTitle>
              <SheetDescription className="text-xs">Aba {aba.nome} da planilha · linha {lead.posicao}</SheetDescription>
              <div className="flex flex-wrap gap-2">
                {lead.lead_crm_id && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">No CRM</span>}
                {!valido && <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-900/50 dark:text-rose-300">Lead inválido</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild={!!whatsapp} variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!whatsapp}>
                  {whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a> : <span><MessageCircle size={14} /> WhatsApp</span>}
                </Button>
                <Button asChild={!!instagram} variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!instagram}>
                  {instagram ? <a href={instagram} target="_blank" rel="noreferrer"><AtSign size={14} /> Instagram</a> : <span><AtSign size={14} /> Instagram</span>}
                </Button>
                {site && (
                  <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <a href={site} target="_blank" rel="noreferrer"><Globe size={14} /> Site</a>
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-6 p-4 pb-10 sm:p-6">
              <section className="space-y-2">
                {chaveValido && (
                  <SimNaoBotoes rotulo="Lead válido" sim={valido} onMudar={(sim) => onEditar(lead, chaveValido, sim ? SIM : NAO)} />
                )}
                {chave1msg && (
                  <SimNaoBotoes
                    rotulo="Primeira mensagem enviada (no CRM)"
                    sim={ehSim(lead.dados[chave1msg]) || !!lead.lead_crm_id}
                    onMudar={(sim) => (sim ? onEnviarAoCrm(lead) : onTirarDoCrm(lead))}
                  />
                )}
              </section>

              {crmLead && (
                <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-emerald-50/60 p-3 dark:bg-emerald-950/30">
                  <div className="min-w-0 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">No CRM</p>
                    <p className="flex items-center gap-1.5 font-medium">
                      {crmColuna && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: crmColuna.hex }} aria-hidden />}
                      {crmColuna?.titulo ?? "Sem etapa"}
                      {crmLead.coluna_desde && <span className="font-normal text-muted-foreground"> desde {formatarData(crmLead.coluna_desde)}</span>}
                    </p>
                  </div>
                  <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => onAbrirNoCrm(crmLead.id)}>
                    <KanbanSquare size={14} /> Abrir no CRM
                  </Button>
                </section>
              )}

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dados da planilha</h3>
                {campos.map((c) => (
                  <Campo key={c.chave} titulo={c.titulo} valor={lead.dados[c.chave] ?? ""} onSalvar={(v) => onEditar(lead, c.chave, v)} />
                ))}
              </section>

              <section className="flex justify-end border-t pt-4">
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive" onClick={() => setConfirmarExcluir(true)}>
                  <Trash2 size={14} /> Excluir lead
                </Button>
              </section>
            </div>

            <AlertDialog open={confirmarExcluir} onOpenChange={setConfirmarExcluir}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir {nome}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A linha sai da aba {aba.nome} da planilha.
                    {lead.lead_crm_id ? " O lead continua no CRM (a origem passa a ser Sistema)." : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => {
                      setConfirmarExcluir(false);
                      onExcluir(lead);
                    }}
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
