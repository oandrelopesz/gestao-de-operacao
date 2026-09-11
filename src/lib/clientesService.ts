import { supabase } from "@/integrations/supabase/client";
import { diasDoPeriodo, type ClientFormValues, type PlataformaConfig } from "@/components/ClientForm";

// Mesmo fallback usado nas outras telas quando não há sessão (preview)
export const FALLBACK_USER_ID = "b34bdae5-7a67-4b63-a46f-8aad43a06c63";

export async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || FALLBACK_USER_ID;
}

/**
 * Verba diária de cada plataforma, a partir da verba (mensal ou total do período) de cada uma.
 * Se o usuário informou um investimento diário total à mão, ele é distribuído entre as
 * plataformas na proporção da verba (ou por igual, se nenhuma verba foi informada).
 */
export function computeVerbaDiariaPorPlataforma(
  plataformas: string[],
  config: Record<string, PlataformaConfig>,
  opts: { tipo_verba: string; data_inicio?: string | null; data_limite_verba?: string | null; verba_diaria_manual?: number | null },
): Record<string, number> {
  const dias = opts.tipo_verba === "total_periodo" ? diasDoPeriodo(opts.data_inicio, opts.data_limite_verba) : 30;
  const base: Record<string, number> = {};
  plataformas.forEach((p) => {
    base[p] = dias ? (config[p]?.verba || 0) / dias : 0;
  });
  const manual = Number(opts.verba_diaria_manual || 0);
  if (manual <= 0 || plataformas.length === 0) return base;

  const somaBase = plataformas.reduce((acc, p) => acc + base[p], 0);
  const out: Record<string, number> = {};
  plataformas.forEach((p) => {
    out[p] = somaBase > 0 ? (base[p] / somaBase) * manual : manual / plataformas.length;
  });
  return out;
}

// Traduz erros do Postgres em mensagens acionáveis para o usuário
function traduzErroCliente(error: any, agencia?: string): Error {
  const msg: string = error?.message || "";
  // Enum antigo (agencia_enum) ou FK para agencias: a migration de agências não foi aplicada no banco
  if (/agencia_enum/i.test(msg) || (error?.code === "23503" && /agencia/i.test(msg))) {
    return new Error(
      `A agência "${agencia || ""}" ainda não existe no banco de dados. ` +
      "Rode a migration supabase/migrations/20260904140000_agencias.sql no SQL Editor do Supabase e tente de novo.",
    );
  }
  if (error?.code === "42703" && /plataformas_config|verba_diaria_manual/i.test(msg)) {
    return new Error(
      "O banco ainda não tem as colunas de verba por plataforma. " +
      "Rode a migration supabase/migrations/20260911120000_verba_por_plataforma.sql no SQL Editor e tente de novo.",
    );
  }
  return error instanceof Error ? error : new Error(msg || "Erro ao salvar cliente");
}
export type ClienteFormInitial = Partial<ClientFormValues> & { id: string };

interface SaldoAdsRegistro {
  id: string;
  plataformas: string[];
  metodo_pagamento: PlataformaConfig["metodo_pagamento"] | null;
  verba_diaria: number | null;
  ativo: boolean;
}

/** Lê o JSONB clientes.plataformas_config com tolerância a formatos antigos/inválidos */
function parsePlataformasConfig(raw: unknown): Record<string, PlataformaConfig> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, PlataformaConfig> = {};
  Object.entries(raw as Record<string, any>).forEach(([nome, cfg]) => {
    if (!cfg || typeof cfg !== "object") return;
    const metodo = ["cartao", "pix", "boleto"].includes(cfg.metodo_pagamento) ? cfg.metodo_pagamento : "pix";
    out[nome] = { verba: Number(cfg.verba || 0), metodo_pagamento: metodo };
  });
  return out;
}

/**
 * Carrega o cliente + registros de saldo_ads no formato que o ClientForm espera.
 * Usado por qualquer aba que edite cliente (Clientes, Saldo...), para que o
 * formulário sempre abra com os dados completos e nunca sobrescreva com defaults.
 */
export async function loadClienteFormValues(clienteId: string): Promise<ClienteFormInitial> {
  const [{ data: cliente, error }, { data: registros }] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", clienteId).single(),
    supabase
      .from("saldo_ads")
      .select("id, plataformas, metodo_pagamento, verba_diaria, ativo")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: true }),
  ]);
  if (error || !cliente) throw error || new Error("Cliente não encontrado");

  const ativos = ((registros || []) as SaldoAdsRegistro[]).filter((r) => r.ativo !== false);
  const plataformas = Array.from(new Set(ativos.flatMap((r) => r.plataformas || [])));
  const tipoVerba = (cliente.tipo_verba || "mensal") as ClientFormValues["tipo_verba"];

  const salvo = parsePlataformasConfig((cliente as any).plataformas_config);
  const legadoTotal = tipoVerba === "mensal" ? Number(cliente.verba_ads || 0) : Number(cliente.verba_total_contratada || 0);
  const config: Record<string, PlataformaConfig> = {};
  plataformas.forEach((p, i) => {
    const registro = ativos.find((r) => (r.plataformas || []).includes(p));
    config[p] = salvo[p] || {
      // Cadastro anterior à verba por plataforma: a verba total fica na primeira plataforma
      verba: Object.keys(salvo).length === 0 && i === 0 ? legadoTotal : 0,
      metodo_pagamento: registro?.metodo_pagamento || "pix",
    };
  });

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
    tipo_verba: tipoVerba,
    verba_total_contratada: cliente.verba_total_contratada ?? null,
    data_limite_verba: cliente.data_limite_verba || "",
    plataformas,
    plataformas_config: config,
    verba_diaria: (cliente as any).verba_diaria_manual ?? null,
  };
}

/**
 * Cria ou atualiza um cliente e mantém os registros de saldo_ads em sincronia:
 * cada plataforma selecionada vira um registro próprio (forma de pagamento e verba
 * diária calculadas a partir da verba daquela plataforma), o que permite registrar
 * recargas por plataforma na aba Saldo. É o único caminho de gravação de cliente
 * no app, para que toda aba veja o mesmo resultado. Retorna o id do cliente.
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
  const { plataformas, plataformas_config, verba_diaria, ...clientePayload } = payload;
  const selecionadas: string[] = plataformas || [];
  const config: Record<string, PlataformaConfig> = {};
  selecionadas.forEach((p) => {
    config[p] = plataformas_config?.[p] || { verba: 0, metodo_pagamento: "pix" };
  });
  clientePayload.plataformas_config = config;
  clientePayload.verba_diaria_manual = verba_diaria && Number(verba_diaria) > 0 ? Number(verba_diaria) : null;

  let clienteId: string;
  if (editingId) {
    const { error } = await supabase.from("clientes").update(clientePayload).eq("id", editingId);
    if (error) throw traduzErroCliente(error, clientePayload.agencia);
    clienteId = editingId;
  } else {
    const { data, error } = await supabase
      .from("clientes")
      .insert([{ ...clientePayload, user_id: userId }])
      .select("id")
      .single();
    if (error) throw traduzErroCliente(error, clientePayload.agencia);
    clienteId = data.id;
  }

  // Sincroniza saldo_ads: um registro por plataforma, assim o cliente aparece na aba Saldo
  // assim que é cadastrado e cada recarga pode ser lançada na plataforma certa.
  const verbaDiariaPor = computeVerbaDiariaPorPlataforma(selecionadas, config, {
    tipo_verba: payload.tipo_verba,
    data_inicio: payload.data_inicio,
    data_limite_verba: payload.data_limite_verba,
    verba_diaria_manual: clientePayload.verba_diaria_manual,
  });

  const { data: existentes, error: erroExistentes } = await supabase
    .from("saldo_ads")
    .select("id, plataformas, metodo_pagamento, verba_diaria, ativo")
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: true });
  if (erroExistentes) throw erroExistentes;

  const cobertas = new Set<string>();
  for (const registro of (existentes || []) as SaldoAdsRegistro[]) {
    // Registros antigos podem agrupar várias plataformas; mantemos o histórico de recargas deles
    const mantidas = (registro.plataformas || []).filter((p) => selecionadas.includes(p) && !cobertas.has(p));
    if (mantidas.length === 0) {
      // Plataforma removida do cliente: desativa (o histórico de recargas fica preservado)
      if (registro.ativo !== false) {
        const { error } = await supabase.from("saldo_ads").update({ ativo: false }).eq("id", registro.id);
        if (error) throw error;
      }
      continue;
    }
    mantidas.forEach((p) => cobertas.add(p));
    const { error } = await supabase
      .from("saldo_ads")
      .update({
        plataformas: mantidas,
        metodo_pagamento: config[mantidas[0]].metodo_pagamento,
        verba_diaria: mantidas.reduce((acc, p) => acc + (verbaDiariaPor[p] || 0), 0),
        ativo: true,
      })
      .eq("id", registro.id);
    if (error) throw error;
  }

  const novas = selecionadas.filter((p) => !cobertas.has(p));
  if (novas.length > 0) {
    const { error } = await supabase.from("saldo_ads").insert(novas.map((p) => ({
      cliente_id: clienteId,
      user_id: userId,
      plataformas: [p],
      metodo_pagamento: config[p].metodo_pagamento,
      verba_diaria: verbaDiariaPor[p] || 0,
      ativo: true,
    })));
    if (error) throw error;
  }

  return clienteId;
}
