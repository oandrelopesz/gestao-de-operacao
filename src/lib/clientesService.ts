import { supabase } from "@/integrations/supabase/client";
import type { ClientFormValues } from "@/components/ClientForm";

// Mesmo fallback usado nas outras telas quando não há sessão (preview)
export const FALLBACK_USER_ID = "b34bdae5-7a67-4b63-a46f-8aad43a06c63";

export async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || FALLBACK_USER_ID;
}

// Verba diária estimada, usada para alimentar o monitor de saldo
export function computeVerbaDiaria(cli: {
  tipo_verba?: string | null;
  verba_total_contratada?: number | string | null;
  data_inicio?: string | null;
  data_limite_verba?: string | null;
  verba_ads?: number | null;
}): number {
  if (cli.tipo_verba === "total_periodo" && cli.verba_total_contratada && cli.data_inicio && cli.data_limite_verba) {
    const inicio = new Date(cli.data_inicio);
    const fim = new Date(cli.data_limite_verba);
    const dias = Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
    return Number(cli.verba_total_contratada) / dias;
  }
  return Number(cli.verba_ads || 0) / 30;
}

export type ClienteFormInitial = Partial<ClientFormValues> & { id: string };

/**
 * Carrega o cliente + registro de saldo_ads no formato que o ClientForm espera.
 * Usado por qualquer aba que edite cliente (Clientes, Saldo...), para que o
 * formulário sempre abra com os dados completos e nunca sobrescreva com defaults.
 */
export async function loadClienteFormValues(clienteId: string): Promise<ClienteFormInitial> {
  const [{ data: cliente, error }, { data: saldo }] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", clienteId).single(),
    supabase.from("saldo_ads").select("plataformas, metodo_pagamento").eq("cliente_id", clienteId).maybeSingle(),
  ]);
  if (error || !cliente) throw error || new Error("Cliente não encontrado");

  return {
    id: cliente.id,
    nome: cliente.nome,
    agencia: cliente.agencia,
    nicho: cliente.nicho || "",
    data_inicio: cliente.data_inicio,
    verba_ads: Number(cliente.verba_ads || 0),
    observacoes: cliente.observacoes || "",
    em_onboarding: cliente.em_onboarding || false,
    status_operacional: (cliente.status_operacional || "ativo") as ClientFormValues["status_operacional"],
    tipo_verba: (cliente.tipo_verba || "mensal") as ClientFormValues["tipo_verba"],
    verba_total_contratada: cliente.verba_total_contratada ?? null,
    data_limite_verba: cliente.data_limite_verba || "",
    metodo_pagamento: ((saldo?.metodo_pagamento || "pix") as ClientFormValues["metodo_pagamento"]),
    plataformas: saldo?.plataformas || [],
  };
}

/**
 * Cria ou atualiza um cliente e mantém o registro de saldo_ads em sincronia
 * (forma de pagamento, plataformas e verba diária). É o único caminho de
 * gravação de cliente no app, para que toda aba veja o mesmo resultado.
 * Retorna o id do cliente.
 */
export async function saveCliente(values: ClientFormValues, editingId?: string | null): Promise<string> {
  const userId = await getUserId();

  const payload: any = { ...values };

  if (typeof payload.verba_total_contratada === "string") {
    payload.verba_total_contratada = payload.verba_total_contratada === "" ? null : Number(payload.verba_total_contratada);
  }
  if (payload.tipo_verba === "mensal") {
    payload.verba_total_contratada = null;
    payload.data_limite_verba = null;
  } else {
    if (!payload.data_limite_verba) payload.data_limite_verba = null;
    if (payload.verba_total_contratada === undefined) payload.verba_total_contratada = null;
  }

  // Campos que pertencem ao saldo_ads, não à tabela clientes
  const { metodo_pagamento, plataformas, ...clientePayload } = payload;

  let clienteId: string;
  if (editingId) {
    const { error } = await supabase.from("clientes").update(clientePayload).eq("id", editingId);
    if (error) throw error;
    clienteId = editingId;
  } else {
    const { data, error } = await supabase
      .from("clientes")
      .insert([{ ...clientePayload, user_id: userId }])
      .select("id")
      .single();
    if (error) throw error;
    clienteId = data.id;
  }

  // Sincroniza saldo_ads: assim o cliente aparece na aba Saldo assim que é cadastrado
  if (metodo_pagamento) {
    const verbaDiaria = computeVerbaDiaria(payload);
    const { data: existente } = await supabase
      .from("saldo_ads")
      .select("id")
      .eq("cliente_id", clienteId)
      .maybeSingle();

    if (existente) {
      const { error } = await supabase
        .from("saldo_ads")
        .update({ plataformas: plataformas || [], metodo_pagamento, verba_diaria: verbaDiaria })
        .eq("id", existente.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("saldo_ads").insert([{
        cliente_id: clienteId,
        user_id: userId,
        plataformas: plataformas || [],
        metodo_pagamento,
        verba_diaria: verbaDiaria,
        ativo: true,
      }]);
      if (error) throw error;
    }
  }

  return clienteId;
}
