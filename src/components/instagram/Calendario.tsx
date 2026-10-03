// Calendário do mês com os posts (agendados, na fila e publicados) em cada dia, no horário de Brasília.
import { useMemo, useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ContaInstagram, PostInstagram } from "@/lib/instagram";
import { LinhaPost, SITUACAO } from "./Posts";

/** Dia (AAAA-MM-DD) e hora (HH:mm) de Brasília. */
const diaBrasilia = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const horaBrasilia = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const quando = (p: PostInstagram) => p.publicado_em ?? p.agendado_para;

export function Calendario({ posts, contaPorId, onEditar }: {
  posts: PostInstagram[] | null;
  contaPorId: Map<string, ContaInstagram>;
  onEditar: (p: PostInstagram) => void;
}) {
  const [mes, setMes] = useState(() => startOfMonth(new Date()));
  const [dia, setDia] = useState<string | null>(null);
  const dias = eachDayOfInterval({ start: startOfWeek(mes), end: endOfWeek(endOfMonth(mes)) });
  const porDia = useMemo(() => {
    const m = new Map<string, PostInstagram[]>();
    for (const p of posts ?? []) {
      if (p.status === "cancelado") continue;
      const k = diaBrasilia(quando(p));
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    for (const lista of m.values()) lista.sort((a, b) => quando(a).localeCompare(quando(b)));
    return m;
  }, [posts]);
  const doDia = dia ? porDia.get(dia) ?? [] : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Mês anterior" onClick={() => setMes((m) => addMonths(m, -1))}><ChevronLeft size={16} /></Button>
        <h2 className="min-w-40 text-center font-semibold">{maiuscula(format(mes, "MMMM 'de' yyyy", { locale: ptBR }))}</h2>
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Próximo mês" onClick={() => setMes((m) => addMonths(m, 1))}><ChevronRight size={16} /></Button>
        <Button variant="ghost" size="sm" onClick={() => setMes(startOfMonth(new Date()))}>Hoje</Button>
      </div>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[11px] font-medium uppercase text-muted-foreground">
          {dias.slice(0, 7).map((d) => <div key={d.toISOString()} className="py-1.5">{format(d, "EEEEEE", { locale: ptBR })}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {dias.map((d) => {
            const k = format(d, "yyyy-MM-dd");
            const lista = porDia.get(k) ?? [];
            return (
              <button
                key={k}
                type="button"
                onClick={() => lista.length && setDia(k)}
                className={cn("flex min-h-16 flex-col items-start justify-start border-b border-r p-1 text-left sm:min-h-24", !isSameMonth(d, mes) && "bg-muted/30 text-muted-foreground", lista.length && "hover:bg-muted/50")}
                aria-label={`${format(d, "d 'de' MMMM", { locale: ptBR })}: ${lista.length} ${lista.length === 1 ? "post" : "posts"}`}
              >
                <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[11px]", isToday(d) && "bg-primary text-primary-foreground")}>{format(d, "d")}</span>
                <span className="mt-0.5 flex flex-wrap gap-0.5 sm:hidden">
                  {lista.slice(0, 4).map((p) => <span key={p.id} className={cn("h-1.5 w-1.5 rounded-full", SITUACAO[p.status]?.ponto)} />)}
                </span>
                <span className="mt-0.5 hidden w-full space-y-0.5 sm:block">
                  {lista.slice(0, 3).map((p) => (
                    <span key={p.id} className="flex items-center gap-1 truncate rounded bg-muted/70 px-1 text-[10px]">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", SITUACAO[p.status]?.ponto)} />
                      {horaBrasilia(quando(p))} @{contaPorId.get(p.conta_id)?.usuario ?? ""}
                    </span>
                  ))}
                  {lista.length > 3 && <span className="block px-1 text-[10px] text-muted-foreground">+{lista.length - 3} mais</span>}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Dialog open={!!dia} onOpenChange={(v) => !v && setDia(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl grid-cols-1 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dia && maiuscula(format(new Date(`${dia}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR }))}</DialogTitle>
          </DialogHeader>
          <div className="min-w-0 divide-y rounded-md border">
            {doDia.map((p) => <LinhaPost key={p.id} post={p} conta={contaPorId.get(p.conta_id)} onEditar={(x) => { setDia(null); onEditar(x); }} />)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
