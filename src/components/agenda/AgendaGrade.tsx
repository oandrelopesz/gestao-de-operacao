// Grade da Agenda (FullCalendar). Carregado só no navegador (import dinâmico na rota).
import { useEffect, useRef, type RefObject } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import ptBr from "@fullcalendar/core/locales/pt-br";
import type { EventApi, EventInput } from "@fullcalendar/core";

export type VisaoAgenda = "timeGridDay" | "timeGridWeek" | "dayGridMonth";

/** Até 45 min o evento é baixo demais para hora + nome em duas linhas: vai tudo numa linha só. */
const CURTO_MS = 45 * 60_000;

interface AgendaGradeProps {
  visao: VisaoAgenda;
  eventos: EventInput[];
  calRef: RefObject<FullCalendar | null>;
  onPeriodo: (inicio: Date, fim: Date, titulo: string) => void;
  onSelecionar: (inicio: Date, fim: Date, diaInteiro: boolean) => void;
  onClicar: (id: string) => void;
  /** Evento arrastado ou esticado. `reverter` devolve o evento ao lugar (cancelou ou deu erro). */
  onMover: (id: string, inicio: Date, fim: Date | null, diaInteiro: boolean, reverter: () => void) => void;
  /** Começou/terminou de arrastar (a recarga automática espera). */
  onArrastando: (arrastando: boolean) => void;
}

export default function AgendaGrade({ visao, eventos, calRef, onPeriodo, onSelecionar, onClicar, onMover, onArrastando }: AgendaGradeProps) {
  // O FullCalendar só se remede quando a janela muda; aqui ele acompanha o espaço real
  // (carregou com a aba em segundo plano, menu lateral recolhido, coluna das agendas...)
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caixa.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => calRef.current?.getApi().updateSize());
    ro.observe(el);
    const aoVoltar = () => { if (document.visibilityState === "visible") calRef.current?.getApi().updateSize(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { ro.disconnect(); document.removeEventListener("visibilitychange", aoVoltar); };
  }, [calRef]);

  const mover = (a: { event: EventApi; revert: () => void }) => {
    if (!a.event.start) { a.revert(); return; }
    onMover(a.event.id, a.event.start, a.event.end, a.event.allDay, a.revert);
  };

  return (
    <div ref={caixa} className="agenda-fc h-full">
      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={visao}
        locale={ptBr}
        headerToolbar={false}
        height="100%"
        events={eventos}
        nowIndicator
        selectable
        selectMirror
        editable
        dayMaxEvents
        allDayText="dia todo"
        slotDuration="00:30:00"
        scrollTime="07:00:00"
        eventMinHeight={18}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        datesSet={(a) => onPeriodo(a.start, a.end, a.view.title)}
        select={(a) => {
          onSelecionar(a.start, a.end, a.allDay);
          a.view.calendar.unselect();
        }}
        eventClick={(a) => {
          a.jsEvent.preventDefault();
          onClicar(a.event.id);
        }}
        eventDragStart={() => onArrastando(true)}
        eventDragStop={() => onArrastando(false)}
        eventResizeStart={() => onArrastando(true)}
        eventResizeStop={() => onArrastando(false)}
        eventDrop={mover}
        eventResize={mover}
        eventContent={(arg) => {
          const { start, end, allDay, title } = arg.event;
          const curto = !allDay && arg.view.type !== "dayGridMonth" && !!start && !!end && end.getTime() - start.getTime() <= CURTO_MS;
          if (!curto) return true; // visual padrão
          return (
            <div className="fc-evento-curto">
              <span className="fc-evento-curto-titulo">{title || "(sem título)"}</span>
              <span className="fc-evento-curto-hora">{arg.timeText}</span>
            </div>
          );
        }}
        eventDidMount={(arg) => {
          // Nome completo ao passar o mouse (eventos curtos ou estreitos cortam o texto)
          arg.el.title = arg.timeText ? `${arg.event.title} · ${arg.timeText}` : arg.event.title;
        }}
      />
    </div>
  );
}
