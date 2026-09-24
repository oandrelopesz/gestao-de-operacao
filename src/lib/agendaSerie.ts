// Salvar/excluir respeitando "Só este / Este e os seguintes / Todos" como o Google Agenda faz.
import { atualizarEvento, contarOcorrenciasAntes, criarEvento, excluirEvento } from "@/lib/googleCalendar";
import { ancorarNaSerie, dataDe, formParaEvento, type EventoGoogle, type FormEvento } from "@/lib/agendaEvento";
import { encerrarAntesDe } from "@/lib/recorrencia";

export type Escopo = "este" | "seguintes" | "todos";

/** Evento aberto no formulário: a ocorrência clicada e, se for de uma série, o evento mestre. */
export interface EventoAberto {
  calendarId: string;
  evento: EventoGoogle;
  mestre: EventoGoogle | null;
}

function regraDoMestre(mestre: EventoGoogle): { regra: string; outras: string[] } {
  const linhas = mestre.recurrence ?? [];
  const regra = linhas.find((l) => /^RRULE:/i.test(l));
  if (!regra) throw new Error("A série não tem regra de repetição");
  return { regra, outras: linhas.filter((l) => !/^RRULE:/i.test(l)) };
}

function ocorrenciaDe(evento: EventoGoogle): string {
  return dataDe(evento.originalStartTime ?? evento.start ?? {});
}

function ehPrimeira(aberto: EventoAberto): boolean {
  return !!aberto.mestre && ocorrenciaDe(aberto.evento) <= dataDe(aberto.mestre.start ?? {});
}

/** Mantém o mesmo link do Meet na série nova. */
function copiarConferencia(c: Record<string, unknown>): Record<string, unknown> {
  return { conferenceId: c.conferenceId, conferenceSolution: c.conferenceSolution, entryPoints: c.entryPoints };
}

export async function salvarComEscopo(f: FormEvento, aberto: EventoAberto | null, escopo: Escopo, enviar: boolean): Promise<EventoGoogle> {
  if (!aberto) return criarEvento(f.calendarId, formParaEvento(f), enviar);
  const { calendarId, evento, mestre } = aberto;
  if (!mestre) return atualizarEvento(calendarId, evento.id as string, formParaEvento(f, evento), enviar, evento.etag);

  if (escopo === "este") {
    const corpo = formParaEvento(f, evento);
    delete corpo.recurrence; // ocorrência não tem regra própria
    return atualizarEvento(calendarId, evento.id as string, corpo, enviar, evento.etag);
  }

  const ocorrencia = ocorrenciaDe(evento);
  if (escopo === "todos" || ehPrimeira(aberto)) {
    const g = ancorarNaSerie(f, dataDe(mestre.start ?? {}), ocorrencia);
    return atualizarEvento(calendarId, mestre.id as string, formParaEvento(g, mestre), enviar, mestre.etag);
  }

  // Este e os seguintes: a série antiga para no dia anterior; uma série nova começa nesta ocorrência
  const { regra, outras } = regraDoMestre(mestre);
  let nova: FormEvento = { ...f, outrasLinhas: [] };
  if (f.recorrencia?.fim.tipo === "vezes") {
    const antes = await contarOcorrenciasAntes(calendarId, mestre.id as string, evento.originalStartTime ?? evento.start ?? {});
    nova = { ...nova, recorrencia: { ...f.recorrencia, fim: { tipo: "vezes", n: Math.max(1, f.recorrencia.fim.n - antes) } } };
  }
  await atualizarEvento(
    calendarId, mestre.id as string,
    { recurrence: [encerrarAntesDe(regra, ocorrencia, !!mestre.start?.date), ...outras] },
    enviar, mestre.etag,
  );
  const corpo = formParaEvento(nova, mestre);
  if (nova.meet && mestre.conferenceData?.conferenceId) corpo.conferenceData = copiarConferencia(mestre.conferenceData);
  return criarEvento(calendarId, corpo, enviar);
}

export async function excluirComEscopo(aberto: EventoAberto, escopo: Escopo, enviar: boolean): Promise<void> {
  const { calendarId, evento, mestre } = aberto;
  if (!mestre || escopo === "este") return excluirEvento(calendarId, evento.id as string, enviar);
  if (escopo === "todos" || ehPrimeira(aberto)) return excluirEvento(calendarId, mestre.id as string, enviar);
  const { regra, outras } = regraDoMestre(mestre);
  await atualizarEvento(
    calendarId, mestre.id as string,
    { recurrence: [encerrarAntesDe(regra, ocorrenciaDe(evento), !!mestre.start?.date), ...outras] },
    enviar, mestre.etag,
  );
}
