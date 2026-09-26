// Leituras e gravações do CRM no Supabase e a ponte com o Google Agenda (calendário "primary" da contato@).
// As tabelas/colunas novas não estão no types.ts gerado pelo Lovable: por isso o `as any`.
import { supabase } from "@/integrations/supabase/client";
import { AgendaEventoSumiuError, atualizarEvento, criarEvento, excluirEvento, obterEvento } from "@/lib/googleCalendar";
import { SwipeKeyError } from "@/lib/googleDrive";
import type { EventoGoogle } from "@/lib/agendaEvento";
import type { ColunaCrm, EventoCrm, LeadCrm, NovoEvento } from "@/lib/crmTipos";
import { ordenarColunas } from "@/lib/crmColunas";
import type { AcaoAgenda, PlanoMovimento } from "@/lib/crmMovimento";
import { corpoConvidar, corpoMoverEvento, corpoNovoEvento, enviaConvite, linkMeetDoEvento } from "@/lib/crmAgenda";

const db = supabase as any;
const AGENDA = "primary";
const USUARIO_PADRAO = "b34bdae5-7a67-4b63-a46f-8aad43a06c63";

function numeroOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** numeric do Postgres chega como string: normaliza os campos numéricos. */
function normalizarLead(l: any): LeadCrm {
  return {
    ...l,
    valor_proposta: numeroOuNull(l.valor_proposta),
    valor_fechamento: numeroOuNull(l.valor_fechamento),
    follow_up: l.follow_up ?? 0,
    follow_up_proposta: l.follow_up_proposta ?? 0,
    no_shows: l.no_shows ?? 0,
    remarcacoes: l.remarcacoes ?? 0,
    pontos_contato: l.pontos_contato ?? {},
    trafego: l.trafego === "pago" ? "pago" : "organico",
  } as LeadCrm;
}

export async function carregarColunas(): Promise<ColunaCrm[]> {
  const { data, error } = await db.from("crm_colunas").select("*").order("ordem");
  if (error) throw error;
  return ordenarColunas(((data ?? []) as ColunaCrm[]).map((c) => ({ ...c, config: c.config ?? {} })));
}

export async function carregarLeads(): Promise<LeadCrm[]> {
  const { data, error } = await db
    .from("prospeccao")
    .select("*")
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map(normalizarLead);
}

export async function carregarEventos(): Promise<EventoCrm[]> {
  const { data, error } = await db.from("crm_eventos").select("*").order("created_at", { ascending: false }).limit(10000);
  if (error) throw error;
  return (data ?? []) as EventoCrm[];
}

export async function gravarEventos(leadId: string, eventos: NovoEvento[]): Promise<EventoCrm[]> {
  if (!eventos.length) return [];
  const base = Date.now();
  // created_at crescente preserva a ordem dos eventos gravados juntos
  const linhas = eventos.map((e, i) => ({
    lead_id: leadId,
    tipo: e.tipo,
    descricao: e.descricao,
    dados: e.dados ?? {},
    created_at: new Date(base + i).toISOString(),
  }));
  const { data, error } = await db.from("crm_eventos").insert(linhas).select("*");
  if (error) throw error;
  return (data ?? []) as EventoCrm[];
}

export async function atualizarLead(id: string, patch: Partial<LeadCrm>): Promise<void> {
  if (!Object.keys(patch).length) return;
  const { error } = await db.from("prospeccao").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function criarLead(dados: Partial<LeadCrm>, coluna: ColunaCrm): Promise<{ lead: LeadCrm; eventos: EventoCrm[] }> {
  const { data: auth } = await supabase.auth.getUser();
  const agora = new Date().toISOString();
  const { data, error } = await db
    .from("prospeccao")
    .insert([{ ...dados, user_id: auth?.user?.id ?? USUARIO_PADRAO, coluna_id: coluna.id, coluna_desde: agora, ordem: -Date.now() % 1_000_000 }])
    .select("*")
    .single();
  if (error) throw error;
  const lead = normalizarLead(data);
  const eventos = await gravarEventos(lead.id, [{ tipo: "criacao", descricao: "Lead cadastrado no CRM", dados: { coluna: coluna.id } }]);
  return { lead, eventos };
}

export async function excluirLeads(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await db.from("prospeccao").delete().in("id", ids);
  if (error) throw error;
}

export async function salvarOrdem(itens: { id: string; ordem: number }[]): Promise<void> {
  await Promise.all(itens.map((i) => db.from("prospeccao").update({ ordem: i.ordem }).eq("id", i.id)));
}

/** Grava a configuração das colunas; as removidas mandam os leads para a coluna escolhida. */
export async function salvarColunas(colunas: ColunaCrm[], remocoes: { id: string; destinoId: string }[]): Promise<void> {
  const linhas = colunas.map((c) => ({ id: c.id, titulo: c.titulo.trim(), hex: c.hex, ordem: c.ordem, tipo: c.tipo, config: c.config ?? {} }));
  const { error } = await db.from("crm_colunas").upsert(linhas);
  if (error) throw error;
  for (const r of remocoes) {
    const { data: afetados, error: e1 } = await db.from("prospeccao").select("id").eq("coluna_id", r.id);
    if (e1) throw e1;
    const agora = new Date().toISOString();
    if ((afetados ?? []).length) {
      const { error: e2 } = await db.from("prospeccao").update({ coluna_id: r.destinoId, coluna_desde: agora }).eq("coluna_id", r.id);
      if (e2) throw e2;
      const destino = colunas.find((c) => c.id === r.destinoId);
      await db.from("crm_eventos").insert(
        (afetados as { id: string }[]).map((a) => ({
          lead_id: a.id,
          tipo: "mudanca_coluna",
          descricao: `Coluna excluída → ${destino?.titulo ?? r.destinoId}`,
          dados: { de: r.id, para: r.destinoId, exclusao_coluna: true },
        })),
      );
    }
    const { error: e3 } = await db.from("crm_colunas").delete().eq("id", r.id);
    if (e3) throw e3;
  }
}

/**
 * Executa a ação no Google Agenda. Nunca lança: em caso de falha devolve evento_status "erro" e a mensagem,
 * para o movimento continuar valendo e o card oferecer "tentar de novo".
 */
export async function executarAgenda(
  antes: LeadCrm,
  depois: LeadCrm,
  acao: AcaoAgenda,
): Promise<{ patch: Partial<LeadCrm>; evento: NovoEvento | null }> {
  if (!acao) return { patch: {}, evento: null };
  const criar = async () => {
    const ev = await criarEvento(AGENDA, corpoNovoEvento(depois, crypto.randomUUID()) as unknown as EventoGoogle, enviaConvite(depois));
    return {
      patch: { evento_google_id: ev.id ?? null, evento_meet_link: linkMeetDoEvento(ev as any), evento_status: "ok", evento_erro: null },
      evento: {
        tipo: "agenda" as const,
        descricao: enviaConvite(depois)
          ? `Evento criado na agenda com Meet; convite enviado para ${depois.email}`
          : "Evento criado na agenda com Meet (sem convidado)",
        dados: { acao: "criar", evento_id: ev.id },
      },
    };
  };
  try {
    if (acao === "criar" || !antes.evento_google_id) return await criar();
    const id = antes.evento_google_id;
    if (acao === "cancelar") {
      await excluirEvento(AGENDA, id, enviaConvite(antes)).catch((e) => {
        if (!(e instanceof AgendaEventoSumiuError)) throw e;
      });
      return {
        patch: { evento_google_id: null, evento_meet_link: null, evento_status: null, evento_erro: null },
        evento: { tipo: "agenda", descricao: "Evento cancelado na agenda", dados: { acao, evento_id: id } },
      };
    }
    let atual: EventoGoogle;
    try {
      atual = await obterEvento(AGENDA, id);
    } catch (e) {
      if (e instanceof AgendaEventoSumiuError) return await criar();
      throw e;
    }
    if ((atual as any).status === "cancelled") return await criar();
    const convidados = ((atual as any).attendees ?? []) as { email?: string; self?: boolean }[];
    const corpo = acao === "mover" ? corpoMoverEvento(depois, convidados, antes.email) : corpoConvidar(depois, convidados, antes.email);
    const enviar = (corpo.attendees?.length ?? 0) > 0 || enviaConvite(antes);
    const ev = await atualizarEvento(AGENDA, id, corpo as unknown as EventoGoogle, enviar);
    return {
      patch: { evento_meet_link: linkMeetDoEvento(ev as any) ?? depois.evento_meet_link, evento_status: "ok", evento_erro: null },
      evento: {
        tipo: "agenda",
        descricao: acao === "mover" ? "Evento movido na agenda" : `Convite enviado para ${depois.email}`,
        dados: { acao, evento_id: id },
      },
    };
  } catch (e: any) {
    // Sem login do Google neste navegador: a mensagem original fala do swipe file
    const msg = e instanceof SwipeKeyError
      ? "entre com o Google neste navegador (aba Agenda) e use Tentar de novo"
      : String(e?.message ?? e).replace(/.+$/, "");
    return {
      patch: { evento_status: "erro", evento_erro: msg },
      evento: { tipo: "agenda", descricao: `Falha na agenda: ${msg}`, dados: { acao, erro: msg } },
    };
  }
}

/** Grava o plano (lança se o Supabase recusar), executa a agenda e grava o histórico. */
export async function aplicarPlano(lead: LeadCrm, plano: PlanoMovimento): Promise<{ lead: LeadCrm; eventos: EventoCrm[] }> {
  const depois = { ...lead, ...plano.patch } as LeadCrm;
  await atualizarLead(lead.id, plano.patch);
  const eventos: NovoEvento[] = [...plano.eventos];
  let final = depois;
  if (plano.agenda) {
    const r = await executarAgenda(lead, depois, plano.agenda);
    if (Object.keys(r.patch).length) {
      await atualizarLead(lead.id, r.patch);
      final = { ...depois, ...r.patch };
    }
    if (r.evento) eventos.push(r.evento);
  }
  const gravados = await gravarEventos(lead.id, eventos);
  return { lead: final, eventos: gravados };
}
