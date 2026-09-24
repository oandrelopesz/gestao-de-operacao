import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  eventoParaForm, linhasRecorrencia, moverInicio, temParticipantes, validarForm, type FormEvento,
} from "@/lib/agendaEvento";
import { AgendaConflitoError, podeEscrever, type AgendaGoogle } from "@/lib/googleCalendar";
import { excluirComEscopo, salvarComEscopo, type Escopo, type EventoAberto } from "@/lib/agendaSerie";
import { useEscolha, type OpcaoEscolha } from "./Escolha";
import { RecorrenciaCampo } from "./RecorrenciaCampo";
import { ParticipantesCampo } from "./ParticipantesCampo";
import { LembretesCampo } from "./LembretesCampo";

export type AberturaEvento = { tipo: "novo"; form: FormEvento } | { tipo: "editar"; aberto: EventoAberto };

interface Props {
  abertura: AberturaEvento | null;
  agendas: AgendaGoogle[];
  onClose: () => void;
  /** Algo mudou no Google: recarregar a grade. */
  onMudou: () => void;
}

const msgErro = (e: unknown) => (e instanceof Error ? e.message : "Erro ao falar com o Google Agenda");

export function EventoDialog({ abertura, agendas, onClose, onMudou }: Props) {
  const [form, setForm] = useState<FormEvento | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { elemento: perguntas, perguntar } = useEscolha();

  const inicial = useMemo(() => {
    if (!abertura) return null;
    if (abertura.tipo === "novo") return abertura.form;
    const { evento, calendarId, mestre } = abertura.aberto;
    return eventoParaForm(evento, calendarId, mestre?.recurrence);
  }, [abertura]);
  const regraInicial = useMemo(() => (inicial ? linhasRecorrencia(inicial).join("\n") : ""), [inicial]);

  useEffect(() => { setForm(inicial); }, [inicial]);

  const editando = abertura?.tipo === "editar" ? abertura.aberto : null;
  const agenda = agendas.find((a) => a.id === form?.calendarId);
  const somenteLeitura = !!editando && (() => {
    if (!agenda || !podeEscrever(agenda)) return true;
    const org = editando.evento.organizer;
    return !!org && !org.self && org.email !== editando.calendarId && !editando.evento.guestsCanModify;
  })();
  const gravaveis = agendas.filter(podeEscrever);
  const recorrente = !!editando?.mestre;

  const mudar = (patch: Partial<FormEvento>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const perguntarEscopo = async (acao: "Editar" | "Excluir", mudouRegra: boolean): Promise<Escopo | null> => {
    const opcoes: OpcaoEscolha[] = [
      ...(mudouRegra ? [] : [{ valor: "este", rotulo: "Este evento" }]),
      { valor: "seguintes", rotulo: "Este e os eventos seguintes" },
      { valor: "todos", rotulo: "Todos os eventos" },
    ];
    return (await perguntar(`${acao} evento recorrente`, opcoes, { confirmar: "OK" })) as Escopo | null;
  };

  const perguntarEnvio = async (titulo: string): Promise<boolean | null> => {
    const v = await perguntar(titulo, [{ valor: "nao", rotulo: "Não enviar" }, { valor: "sim", rotulo: "Enviar" }], {
      modo: "botoes",
      descricao: "O Google manda um e-mail para os participantes.",
    });
    return v === null ? null : v === "sim";
  };

  const salvar = async () => {
    if (!form || !abertura) return;
    const erro = validarForm(form);
    if (erro) { toast.error(erro); return; }
    let escopo: Escopo = "todos";
    if (recorrente) {
      const e = await perguntarEscopo("Editar", linhasRecorrencia(form).join("\n") !== regraInicial);
      if (!e) return;
      escopo = e;
    }
    let enviar = false;
    if (form.participantes.length > 0 || (editando && temParticipantes(editando.evento))) {
      const r = await perguntarEnvio(editando ? "Enviar a atualização aos participantes?" : "Enviar convite aos participantes?");
      if (r === null) return;
      enviar = r;
    }
    setSalvando(true);
    try {
      await salvarComEscopo(form, editando, escopo, enviar);
      toast.success(editando ? "Evento atualizado no Google Agenda" : "Evento criado no Google Agenda");
      onMudou();
      onClose();
    } catch (e) {
      toast.error(msgErro(e));
      if (e instanceof AgendaConflitoError) { onMudou(); onClose(); }
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!editando) return;
    let escopo: Escopo = "todos";
    if (recorrente) {
      const e = await perguntarEscopo("Excluir", false);
      if (!e) return;
      escopo = e;
    } else {
      const ok = await perguntar("Excluir este evento?", [{ valor: "sim", rotulo: "Excluir" }], { modo: "botoes" });
      if (!ok) return;
    }
    let enviar = false;
    if (temParticipantes(editando.evento)) {
      const r = await perguntarEnvio("Avisar os participantes do cancelamento?");
      if (r === null) return;
      enviar = r;
    }
    setSalvando(true);
    try {
      await excluirComEscopo(editando, escopo, enviar);
      toast.success("Evento excluído do Google Agenda");
      onMudou();
      onClose();
    } catch (e) {
      toast.error(msgErro(e));
      if (e instanceof AgendaConflitoError) { onMudou(); onClose(); }
    } finally {
      setSalvando(false);
    }
  };

  const copiarMeet = async () => {
    if (!form?.linkMeet) return;
    try { await navigator.clipboard.writeText(form.linkMeet); toast.success("Link do Meet copiado"); } catch { toast.error("Não foi possível copiar"); }
  };

  const titulo = !editando ? "Novo evento" : somenteLeitura ? "Evento" : "Editar evento";
  const htmlLink = editando?.evento.htmlLink;

  return (
    <>
      <Dialog open={!!abertura && !!form} onOpenChange={(o) => { if (!o && !salvando) onClose(); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>
              {somenteLeitura ? "Só leitura: este evento é de outra agenda ou de outro organizador." : "Salvo direto no seu Google Agenda."}
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-5">
              <Input
                autoFocus={!editando}
                value={form.titulo}
                onChange={(e) => mudar({ titulo: e.target.value })}
                placeholder="Adicionar título"
                className="h-11 text-base font-medium"
                disabled={somenteLeitura}
                autoComplete="off"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Agenda</Label>
                  <Select value={form.calendarId} onValueChange={(v) => mudar({ calendarId: v })} disabled={!!editando}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(editando ? agendas : gravaveis).map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.backgroundColor }} />
                            {a.summaryOverride ?? a.summary}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <Switch checked={form.diaInteiro} onCheckedChange={(v) => mudar({ diaInteiro: v })} disabled={somenteLeitura} />
                  Dia inteiro
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Início</Label>
                  <div className="flex gap-2">
                    <Input type="date" value={form.inicioData} disabled={somenteLeitura}
                      onChange={(e) => e.target.value && setForm(moverInicio(form, e.target.value, form.inicioHora))} />
                    {!form.diaInteiro && (
                      <Input type="time" step={900} value={form.inicioHora} className="w-32" disabled={somenteLeitura}
                        onChange={(e) => e.target.value && setForm(moverInicio(form, form.inicioData, e.target.value))} />
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Fim</Label>
                  <div className="flex gap-2">
                    <Input type="date" value={form.fimData} min={form.inicioData} disabled={somenteLeitura}
                      onChange={(e) => e.target.value && mudar({ fimData: e.target.value })} />
                    {!form.diaInteiro && (
                      <Input type="time" step={900} value={form.fimHora} className="w-32" disabled={somenteLeitura}
                        onChange={(e) => e.target.value && mudar({ fimHora: e.target.value })} />
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Repetição</Label>
                <RecorrenciaCampo form={form} onChange={mudar} disabled={somenteLeitura} />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Participantes</Label>
                <ParticipantesCampo valor={form.participantes} onChange={(v) => mudar({ participantes: v })} disabled={somenteLeitura} />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.meet} onCheckedChange={(v) => mudar({ meet: v })} disabled={somenteLeitura} />
                  <Video size={15} className="text-muted-foreground" /> Videoconferência do Google Meet
                </label>
                {form.meet && form.linkMeet && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                    <span className="truncate font-mono text-xs">{form.linkMeet}</span>
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1" onClick={copiarMeet}><Copy size={13} /> Copiar</Button>
                    <Button type="button" size="sm" className="h-7 gap-1" asChild>
                      <a href={form.linkMeet} target="_blank" rel="noopener noreferrer"><Video size={13} /> Entrar</a>
                    </Button>
                  </div>
                )}
                {form.meet && !form.linkMeet && <p className="text-xs text-muted-foreground">O link é criado pelo Google ao salvar.</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Notificações</Label>
                <LembretesCampo form={form} onChange={mudar} disabled={somenteLeitura} />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Local</Label>
                <Input value={form.local} onChange={(e) => mudar({ local: e.target.value })} placeholder="Adicionar local" disabled={somenteLeitura} />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Descrição</Label>
                <Textarea rows={3} value={form.descricao} onChange={(e) => mudar({ descricao: e.target.value })} placeholder="Adicionar descrição" disabled={somenteLeitura} />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:items-center sm:justify-between">
            <div className="flex gap-2">
              {editando && !somenteLeitura && (
                <Button type="button" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={excluir} disabled={salvando}>
                  <Trash2 size={14} /> Excluir
                </Button>
              )}
              {htmlLink && (
                <Button type="button" variant="ghost" className="gap-1.5" asChild>
                  <a href={htmlLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Abrir no Google Agenda</a>
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={salvando}>{somenteLeitura ? "Fechar" : "Cancelar"}</Button>
              {!somenteLeitura && (
                <Button type="button" onClick={salvar} disabled={salvando} className="gap-1.5">
                  {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {perguntas}
    </>
  );
}
