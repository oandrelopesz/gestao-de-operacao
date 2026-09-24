// Grade da Agenda (FullCalendar). Carregado só no navegador (import dinâmico na rota).
import type { RefObject } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import ptBr from "@fullcalendar/core/locales/pt-br";
import type { EventInput } from "@fullcalendar/core";

export type VisaoAgenda = "timeGridDay" | "timeGridWeek" | "dayGridMonth";

interface AgendaGradeProps {
  visao: VisaoAgenda;
  eventos: EventInput[];
  calRef: RefObject<FullCalendar | null>;
  onPeriodo: (inicio: Date, fim: Date, titulo: string) => void;
  onSelecionar: (inicio: Date, fim: Date, diaInteiro: boolean) => void;
  onClicar: (id: string) => void;
}

export default function AgendaGrade({ visao, eventos, calRef, onPeriodo, onSelecionar, onClicar }: AgendaGradeProps) {
  return (
    <div className="agenda-fc h-full">
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
        dayMaxEvents
        allDayText="dia todo"
        slotDuration="00:30:00"
        scrollTime="07:00:00"
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
      />
    </div>
  );
}
