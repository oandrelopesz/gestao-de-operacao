// Card do lead no Kanban (spec §9.2). `CardLead` arrasta (useSortable); `CardLeadView` é o visual puro,
// usado também no DragOverlay (o clone que segue o ponteiro).
import {
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
} from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, CalendarClock, Clock, Loader2, MessageCircle, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useCrm } from "@/components/crm/CrmContexto";
import { BotaoTentativa } from "@/components/crm/BotaoTentativa";
import { PontosContato, useAgoraMinuto } from "@/components/crm/PontosContato";
import { MoverMenu } from "@/components/crm/MoverMenu";
import { TIPOS_COM_PONTOS } from "@/lib/crmColunas";
import { textoCongelado } from "@/lib/crmTentativas";
import { urgenciaDoLead, type Urgencia } from "@/lib/crmUrgencia";
import { linkWhatsapp, problemaTelefone } from "@/lib/crmWhatsapp";
import { formatarDataHora, formatarReais } from "@/lib/crmFormato";
import { linkMeetNaConta } from "@/lib/agendaEvento";
import type { LeadCrm } from "@/lib/crmTipos";
import { cn } from "@/lib/utils";

const parar = (e: SyntheticEvent) => e.stopPropagation();

export interface CardLeadProps {
  lead: LeadCrm;
  selecionado: boolean;
  algumSelecionado: boolean;
  onSelecionar: (id: string, marcado: boolean) => void;
}

export interface SortableBindings {
  setNodeRef: (el: HTMLElement | null) => void;
  style: CSSProperties;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  isDragging: boolean;
}

/** Tarja à esquerda e cor do texto por urgência (o texto sempre aparece junto da cor). */
const URGENCIA: Record<Urgencia, { borda: string; texto: string; Icone: typeof Clock | null }> = {
  sem_contato: {
    borda: "border-l-red-500",
    texto: "text-red-600 dark:text-red-400",
    Icone: AlertTriangle,
  },
  contato_vencido: {
    borda: "border-l-amber-500",
    texto: "text-amber-600 dark:text-amber-400",
    Icone: Clock,
  },
  reuniao_proxima: {
    borda: "border-l-blue-500",
    texto: "text-blue-600 dark:text-blue-400",
    Icone: CalendarClock,
  },
  em_dia: { borda: "border-l-transparent", texto: "", Icone: null },
};

const ETIQUETA = "h-5 max-w-full rounded-md px-1.5 py-0 text-[10px] font-medium";

export function CardLead(props: CardLeadProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.lead.id,
  });
  return (
    <CardLeadView
      {...props}
      sortable={{
        setNodeRef,
        attributes,
        listeners,
        isDragging,
        style: { transform: CSS.Translate.toString(transform), transition },
      }}
    />
  );
}

export function CardLeadView({
  lead,
  selecionado,
  algumSelecionado,
  onSelecionar,
  sortable,
}: CardLeadProps & { sortable?: SortableBindings }) {
  const { colunas, colunaDoLead, abrirFicha, tentarAgendaDeNovo } = useCrm();
  const agora = useAgoraMinuto();
  const [tentandoAgenda, setTentandoAgenda] = useState(false);
  const coluna = colunaDoLead(lead);
  const tipo = coluna?.tipo ?? "padrao";
  const isDragging = sortable?.isDragging ?? false;
  const sobreposto = !sortable; // clone do DragOverlay

  const urgencia = urgenciaDoLead(lead, colunas, agora);
  const estilo = URGENCIA[urgencia.tipo];
  const congelado = textoCongelado(lead, tipo);
  const origem = [lead.utm_source, lead.utm_campaign].filter(Boolean).join(" · ");
  const whatsapp = linkWhatsapp(lead.telefone);
  const fimReuniao = lead.reuniao_em
    ? new Date(lead.reuniao_em).getTime() + (lead.reuniao_duracao_min ?? 30) * 60_000
    : null;
  const meetAtivo = !!lead.evento_meet_link && fimReuniao !== null && fimReuniao > agora.getTime();
  const valorProposta =
    (tipo === "proposta" || tipo === "follow_up_proposta") && Number(lead.valor_proposta) > 0;
  const valorFechado = tipo === "ganho" && Number(lead.valor_fechamento) > 0;
  const linhaEmpresa = [lead.empresa, lead.nicho].filter(Boolean).join(" · ");

  const abrir = (e: MouseEvent) => {
    if (sobreposto) return;
    // Ctrl/Cmd + clique marca/desmarca em vez de abrir
    if (e.ctrlKey || e.metaKey) {
      onSelecionar(lead.id, !selecionado);
      return;
    }
    abrirFicha(lead.id);
  };

  const teclar = (e: KeyboardEvent) => {
    if (sobreposto || e.target !== e.currentTarget) return;
    if (e.key === "Enter") {
      e.preventDefault();
      abrirFicha(lead.id);
    }
  };

  const tentarDeNovo = async (e: MouseEvent) => {
    e.stopPropagation();
    if (tentandoAgenda) return;
    setTentandoAgenda(true);
    try {
      await tentarAgendaDeNovo(lead);
    } finally {
      setTentandoAgenda(false);
    }
  };

  return (
    <div
      ref={sortable?.setNodeRef}
      style={sortable?.style}
      {...(sortable?.attributes ?? {})}
      {...(sortable?.listeners ?? {})}
      onClick={abrir}
      onKeyDown={teclar}
      className={cn(
        "group relative mb-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:select-none",
        sobreposto ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
    >
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-l-4 border-border/70 bg-card shadow-xs transition-[box-shadow,border-color] duration-150 hover:shadow-md",
          estilo.borda,
          selecionado && "bg-primary/5 ring-2 ring-primary/60",
          sobreposto && "shadow-xl",
        )}
      >
        <div className="space-y-1.5 p-2.5">
          {urgencia.texto && (
            <p
              className={cn(
                "flex items-center gap-1 text-[11px] font-medium leading-tight",
                estilo.texto,
              )}
            >
              {estilo.Icone && <estilo.Icone size={11} className="shrink-0" aria-hidden />}
              {urgencia.texto}
            </p>
          )}

          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h4 className="break-words text-sm font-medium leading-tight">{lead.nome}</h4>
              {linhaEmpresa && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{linhaEmpresa}</p>
              )}
            </div>
            <span onPointerDown={parar} onClick={parar} className="shrink-0 pt-0.5">
              <Checkbox
                checked={selecionado}
                onCheckedChange={(v) => onSelecionar(lead.id, v === true)}
                aria-label={selecionado ? `Desmarcar ${lead.nome}` : `Selecionar ${lead.nome}`}
                title={selecionado ? "Desmarcar" : "Selecionar (ou Ctrl + clique no card)"}
                className={cn(
                  "transition-opacity",
                  selecionado || algumSelecionado
                    ? "opacity-100"
                    : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100",
                )}
              />
            </span>
          </div>

          <div className="flex flex-wrap gap-1">
            <Badge
              variant="outline"
              className={cn(
                ETIQUETA,
                lead.trafego === "pago"
                  ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300"
                  : "text-muted-foreground",
              )}
            >
              {lead.trafego === "pago" ? "Pago" : "Orgânico"}
            </Badge>
            {origem && (
              <Badge
                variant="outline"
                className={cn(ETIQUETA, "text-muted-foreground")}
                title="Origem · campanha"
              >
                <span className="truncate">{origem}</span>
              </Badge>
            )}
            {lead.reuniao_em && urgencia.tipo !== "reuniao_proxima" && (
              <Badge variant="outline" className={ETIQUETA}>
                Reunião {formatarDataHora(lead.reuniao_em)}
              </Badge>
            )}
            {congelado && (
              <Badge variant="outline" className={cn(ETIQUETA, "text-muted-foreground")}>
                {congelado}
              </Badge>
            )}
            {valorProposta && (
              <Badge variant="outline" className={ETIQUETA}>
                Proposta {formatarReais(lead.valor_proposta)}
              </Badge>
            )}
            {valorFechado && (
              <Badge
                variant="outline"
                className={cn(
                  ETIQUETA,
                  "border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300",
                )}
              >
                Fechado {formatarReais(lead.valor_fechamento)}
              </Badge>
            )}
          </div>

          <BotaoTentativa lead={lead} compacto />
          {TIPOS_COM_PONTOS.includes(tipo) && <PontosContato lead={lead} compacto />}

          {lead.evento_status === "erro" && (
            <p
              className="text-[11px] leading-tight text-amber-600 dark:text-amber-400"
              title={lead.evento_erro ?? undefined}
            >
              Evento não criado —{" "}
              <button
                type="button"
                className="inline-flex items-center gap-1 font-medium underline underline-offset-2 disabled:opacity-60"
                disabled={tentandoAgenda}
                onPointerDown={parar}
                onClick={tentarDeNovo}
              >
                {tentandoAgenda && <Loader2 size={10} className="animate-spin" />}
                Tentar de novo
              </button>
            </p>
          )}

          <div className="-mx-1 flex flex-wrap items-center gap-1 pt-0.5">
            {whatsapp ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-emerald-700 dark:text-emerald-400"
              >
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  onPointerDown={parar}
                  onClick={parar}
                >
                  <MessageCircle size={12} /> WhatsApp
                </a>
              </Button>
            ) : (
              <span className="px-1 text-[11px] text-muted-foreground">
                {problemaTelefone(lead.telefone)}
              </span>
            )}
            {meetAtivo && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-blue-700 dark:text-blue-400"
              >
                <a
                  href={linkMeetNaConta(lead.evento_meet_link!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onPointerDown={parar}
                  onClick={parar}
                >
                  <Video size={12} /> Meet
                </a>
              </Button>
            )}
            <span className="ml-auto">
              <MoverMenu lead={lead} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
