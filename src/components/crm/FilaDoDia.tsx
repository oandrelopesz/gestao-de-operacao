// Fila do dia: os leads que pedem ação agora, em blocos (spec §9.4). Cada lead aparece em um só bloco.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CalendarDays, Check, ListChecks, MessageCircle, UserPlus, Video, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/components/crm/CrmContexto";
import { BotaoTentativa } from "@/components/crm/BotaoTentativa";
import { PontosContato } from "@/components/crm/PontosContato";
import { MoverMenu } from "@/components/crm/MoverMenu";
import { montarFila, type BlocoFila, type ItemFila } from "@/lib/crmUrgencia";
import { TIPOS_COM_PONTOS } from "@/lib/crmColunas";
import { calcularPontos, resumoPontos } from "@/lib/crmPontos";
import { linkWhatsapp, problemaTelefone } from "@/lib/crmWhatsapp";
import type { LeadCrm } from "@/lib/crmTipos";
import { cn } from "@/lib/utils";

/** "Agora" que anda sozinho a cada minuto (motivos e pontos dependem do horário). */
function useAgora(): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return agora;
}

/** Ícone e cor de cada bloco. A cor acompanha sempre o título e o motivo escritos. */
const VISUAL: Record<BlocoFila, { icone: LucideIcon; cor: string; motivo: string }> = {
  atrasados: { icone: AlertTriangle, cor: "text-red-600 dark:text-red-400", motivo: "text-red-600 dark:text-red-400" },
  pontos_atrasados: { icone: ListChecks, cor: "text-amber-600 dark:text-amber-400", motivo: "text-amber-600 dark:text-amber-400" },
  novos: { icone: UserPlus, cor: "text-sky-600 dark:text-sky-400", motivo: "text-muted-foreground" },
  hoje: { icone: CalendarClock, cor: "text-primary", motivo: "text-muted-foreground" },
  reunioes_hoje: { icone: Video, cor: "text-blue-600 dark:text-blue-400", motivo: "text-blue-600 dark:text-blue-400" },
  reunioes_amanha: { icone: CalendarDays, cor: "text-violet-600 dark:text-violet-400", motivo: "text-muted-foreground" },
};

export function FilaDoDia({ leads }: { leads: LeadCrm[] }) {
  const { colunas } = useCrm();
  const agora = useAgora();
  const grupos = useMemo(() => montarFila(leads, colunas, agora), [leads, colunas, agora]);
  const total = grupos.reduce((s, g) => s + g.itens.length, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {total === 0
          ? "Nenhum lead pedindo ação agora."
          : `${total} ${total === 1 ? "lead pedindo ação" : "leads pedindo ação"}. Cada lead aparece só no bloco mais urgente.`}
      </p>
      {grupos.map((g) => {
        const v = VISUAL[g.bloco];
        const Icone = v.icone;
        return (
          <Card key={g.bloco} className="overflow-hidden">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <Icone size={16} className={cn("shrink-0", v.cor)} aria-hidden />
              <h2 className="text-sm font-semibold">{g.titulo}</h2>
              <Badge variant="secondary" className="ml-auto h-5 px-2 text-[11px] font-medium" aria-label={`${g.itens.length} leads`}>
                {g.itens.length}
              </Badge>
            </div>
            {g.itens.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Nada aqui agora</p>
            ) : (
              <ul className="divide-y">
                {g.itens.map((item) => (
                  <LinhaFila key={item.lead.id} item={item} corMotivo={v.motivo} agora={agora} />
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function LinhaFila({ item, corMotivo, agora }: { item: ItemFila; corMotivo: string; agora: Date }) {
  const { colunaDoLead, abrirFicha, marcarPonto } = useCrm();
  const { lead, motivo } = item;
  const coluna = colunaDoLead(lead);
  const whatsapp = linkWhatsapp(lead.telefone);
  const comPontos = !!lead.reuniao_em && !!coluna && TIPOS_COM_PONTOS.includes(coluna.tipo);

  // Ponto a marcar direto da fila: o atrasado mais recente ou, sem atraso, o próximo.
  const alvo = useMemo(() => {
    if (!comPontos) return null;
    const r = resumoPontos(calcularPontos(lead, agora));
    return r.atrasado ?? r.proximo;
  }, [comPontos, lead, agora]);
  const [marcando, setMarcando] = useState(false);

  const marcarFeito = async () => {
    if (!alvo) return;
    setMarcando(true);
    try {
      await marcarPonto(lead, alvo.n, true);
    } finally {
      setMarcando(false);
    }
  };

  return (
    <li className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <button
            type="button"
            onClick={() => abrirFicha(lead.id)}
            className="max-w-full truncate text-left text-sm font-medium hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {lead.nome}
          </button>
          {lead.empresa && <span className="min-w-0 truncate text-xs text-muted-foreground">{lead.empresa}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {coluna && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: coluna.hex }} aria-hidden />
              {coluna.titulo}
            </span>
          )}
          <span className={corMotivo}>{motivo}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
        {whatsapp ? (
          <Button asChild variant="outline" size="sm" className="h-7 gap-1 text-xs">
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={12} aria-hidden /> WhatsApp
            </a>
          </Button>
        ) : (
          <span className="text-[11px] text-muted-foreground">{problemaTelefone(lead.telefone)}</span>
        )}
        <BotaoTentativa lead={lead} compacto />
        {comPontos && <PontosContato lead={lead} compacto />}
        {alvo && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={marcando}
            onClick={marcarFeito}
            title={`Marcar como feito: ${alvo.nome}`}
          >
            <Check size={12} aria-hidden /> Marcar ponto feito
          </Button>
        )}
        <MoverMenu lead={lead} />
      </div>
    </li>
  );
}
