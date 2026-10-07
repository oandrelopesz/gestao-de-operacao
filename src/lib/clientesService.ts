import { supabase } from "@/integrations/supabase/client";
import {
  diasDoPeriodo, totalDaOperacao, verbaMensalDaOperacao, novaOperacao,
  type ClientFormValues, type OperacaoFormValues, type PlataformaConfig,
} from "@/components/ClientForm";
import { fetchCotacoes, isMoeda, paraBRL } from "@/lib/moedas";
import { semPlataforma, comMetodoDasContas, contasPorPlataforma } from "@/lib/plataformasOperacao";

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
  if ((error?.code === "42703" || error?.code === "42P01" || /schema cache/i.test(msg)) && /operacoes|trafego_ativo|operacao_id/i.test(msg)) {
    return new Error(
      "O banco ainda não tem as tabelas de operações. " +
      "Rode a migration supabase/migrations/20260917140000_operacoes.sql no SQL Editor e tente de novo.",
    );
  }
  return error instanceof Error ? error : new Error(msg || "Erro ao salvar cliente");
}
export type ClienteFormInitial = Partial<ClientFormValues> & { id: string };

interface SaldoAdsRegistro {
  id: string;
  operacao_id: string | null;
  plataformas: string[];
  metodo_pagamento: PlataformaConfig["metodo_pagamento"] | null;
  verba_diaria: number | null;
  ativo: boolean;
}

interface OperacaoRegistro {
  id: string;
  nome: string;
  objetivo: string | null;
  ordem: number;
  ativa: boolean;
  tipo_verba: OperacaoFormValues["tipo_verba"];
  moeda: string;
  data_inicio_verba: string | null;
  data_limite_verba: string | null;
  plataformas_config: unknown;
  verba_diaria_manual: number | null;
}

/** Lê o JSONB plataformas_config com tolerância a formatos antigos/inválidos */
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
 * Carrega o cliente + operações + registros de saldo_ads no formato que o ClientForm espera.
 * Usado por qualquer aba que edite cliente (Clientes, Saldo...), para que o
 * formulário sempre abra com os dados completos e nunca sobrescreva com defaults.
 */
export async function loadClienteFormValues(clienteId: string): Promise<ClienteFormInitial> {
  const [{ data: cliente, error }, { data: ops, error: erroOps }, { data: registros, error: erroRegistros }] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", clienteId).single(),
    supabase
      .from("operacoes")
      .select("id, nome, objetivo, ordem, ativa, tipo_verba, moeda, data_inicio_verba, data_limite_verba, plataformas_config, verba_diaria_manual")
      .eq("cliente_id", clienteId)
      .eq("ativa", true)
      .order("ordem", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("saldo_ads")
      .select("id, operacao_id, plataformas, metodo_pagamento, verba_diaria, ativo")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: true }),
  ]);
  if (error || !cliente) throw error || new Error("Cliente não encontrado");
  // Sem isto uma falha parcial devolveria um cadastro incompleto (e quem salva em seguida apagaria dados)
  if (erroOps) throw erroOps;
  if (erroRegistros) throw erroRegistros;

  const saldos = ((registros || []) as SaldoAdsRegistro[]).filter((r) => r.ativo !== false);

  const operacoes: OperacaoFormValues[] = ((ops || []) as OperacaoRegistro[]).map((op) => {
    // Se a forma de pagamento foi editada direto na conta do Saldo, vale a da conta ativa (senão o
    // "Salvar" do cadastro devolveria, por exemplo, uma conta migrada para cartão a pix)
    const config = comMetodoDasContas(parsePlataformasConfig(op.plataformas_config), registros || [], op.id);
    const doSaldo = saldos.filter((r) => r.operacao_id === op.id);
    // Plataformas: as configuradas na operação + qualquer registro de saldo ainda não coberto
    const plataformas = Array.from(new Set([...Object.keys(config), ...doSaldo.flatMap((r) => r.plataformas || [])]));
    plataformas.forEach((p) => {
      if (!config[p]) {
        const registro = doSaldo.find((r) => (r.plataformas || []).includes(p));
        config[p] = { verba: 0, metodo_pagamento: registro?.metodo_pagamento || "pix" };
      }
    });
    return novaOperacao({
      id: op.id,
      nome: op.nome,
      objetivo: op.objetivo || "",
      moeda: isMoeda(op.moeda) ? op.moeda : "BRL",
      tipo_verba: op.tipo_verba || "mensal",
      data_inicio_verba: op.data_inicio_verba || "",
      data_limite_verba: op.data_limite_verba || "",
      plataformas,
      plataformas_config: config,
      verba_diaria: op.verba_diaria_manual ?? null,
    });
  });

  // Cadastro anterior às operações (sem nenhuma gravada): monta uma a partir dos campos legados
  if (operacoes.length === 0) {
    const legadoConfig = parsePlataformasConfig((cliente as any).plataformas_config);
    const plataformas = Array.from(new Set([...Object.keys(legadoConfig), ...saldos.flatMap((r) => r.plataformas || [])]));
    const tipoVerba = (cliente.tipo_verba || "mensal") as OperacaoFormValues["tipo_verba"];
    const legadoTotal = tipoVerba === "mensal" ? Number(cliente.verba_ads || 0) : Number(cliente.verba_total_contratada || 0);
    plataformas.forEach((p, i) => {
      if (!legadoConfig[p]) {
        const registro = saldos.find((r) => (r.plataformas || []).includes(p));
        legadoConfig[p] = { verba: Object.keys(legadoConfig).length === 0 && i === 0 ? legadoTotal : 0, metodo_pagamento: registro?.metodo_pagamento || "pix" };
      }
    });
    if (plataformas.length > 0 || legadoTotal > 0) {
      operacoes.push(novaOperacao({
        nome: "Principal",
        tipo_verba: tipoVerba,
        data_inicio_verba: tipoVerba === "total_periodo" ? cliente.data_inicio || "" : "",
        data_limite_verba: cliente.data_limite_verba || "",
        plataformas,
        plataformas_config: legadoConfig,
        verba_diaria: (cliente as any).verba_diaria_manual ?? null,
      }));
    }
  }

  return {
    id: cliente.id,
    nome: cliente.nome,
    agencia: cliente.agencia,
    nicho: cliente.nicho || "",
    data_inicio: cliente.data_inicio,
    observacoes: cliente.observacoes || "",
    em_onboarding: cliente.em_onboarding || false,
    status_operacional: (cliente.status_operacional || "ativo") as ClientFormValues["status_operacional"],
    trafego_ativo: (cliente as any).trafego_ativo ?? true,
    operacoes,
  };
}

/**
 * Cria ou atualiza um cliente com suas operações e mantém os registros de saldo_ads em
 * sincronia: cada plataforma de cada operação vira um registro próprio (forma de pagamento
 * e verba diária calculadas a partir da verba daquela plataforma), o que permite registrar
 * recargas por plataforma na aba Saldo. É o único caminho de gravação de cliente no app.
 * Retorna o id do cliente.
 */
export async function saveCliente(values: ClientFormValues, editingId?: string | null): Promise<string> {
  const [userId, cotacoes] = await Promise.all([getUserId(), fetchCotacoes()]);

  const operacoes = values.operacoes.map((op) => {
    const cfg: Record<string, PlataformaConfig> = {};
    op.plataformas.forEach((p) => { cfg[p] = op.plataformas_config?.[p] || { verba: 0, metodo_pagamento: "pix" }; });
    return { ...op, plataformas_config: cfg };
  });

  // Campos legados de clientes: mantidos como agregados em BRL para exportações e telas antigas
  const totalMensalBRL = values.trafego_ativo
    ? operacoes.reduce((acc, op) => acc + paraBRL(verbaMensalDaOperacao(op), op.moeda, cotacoes), 0)
    : 0;
  const totais = operacoes.filter((op) => op.tipo_verba === "total_periodo");
  const clientePayload: Record<string, unknown> = {
    nome: values.nome,
    agencia: values.agencia,
    nicho: values.nicho || null,
    data_inicio: values.data_inicio,
    observacoes: values.observacoes || null,
    em_onboarding: values.em_onboarding,
    status_operacional: values.status_operacional,
    trafego_ativo: values.trafego_ativo,
    verba_ads: Math.round(totalMensalBRL * 100) / 100,
    tipo_verba: operacoes.length > 0 && totais.length === operacoes.length ? "total_periodo" : "mensal",
    verba_total_contratada: totais.length
      ? Math.round(totais.reduce((acc, op) => acc + paraBRL(totalDaOperacao(op), op.moeda, cotacoes), 0) * 100) / 100
      : null,
    data_limite_verba: totais.length ? totais.map((op) => op.data_limite_verba).filter(Boolean).sort().at(-1) || null : null,
    plataformas_config: operacoes[0]?.plataformas_config ?? null,
    verba_diaria_manual: null,
  };

  let clienteId: string;
  if (editingId) {
    const { error } = await supabase.from("clientes").update(clientePayload as any).eq("id", editingId);
    if (error) throw traduzErroCliente(error, values.agencia);
    clienteId = editingId;
  } else {
    const { data, error } = await supabase
      .from("clientes")
      .insert([{ ...(clientePayload as any), user_id: userId }])
      .select("id")
      .single();
    if (error) throw traduzErroCliente(error, values.agencia);
    clienteId = data.id;
  }

  // ---- Operações: atualiza as existentes, cria as novas, desativa as removidas
  const { data: existentesOps, error: erroOps } = await supabase
    .from("operacoes")
    .select("id, ativa")
    .eq("cliente_id", clienteId);
  if (erroOps) throw traduzErroCliente(erroOps, values.agencia);
  const idsExistentes = new Set((existentesOps || []).map((o) => o.id));

  const { data: todosSaldos, error: erroSaldos } = await supabase
    .from("saldo_ads")
    .select("id, operacao_id, plataformas, metodo_pagamento, verba_diaria, ativo")
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: true });
  if (erroSaldos) throw erroSaldos;
  const saldos = (todosSaldos || []) as SaldoAdsRegistro[];

  const idsMantidos = new Set<string>();
  for (let i = 0; i < operacoes.length; i++) {
    const op = operacoes[i];
    const total = totalDaOperacao(op);
    const payloadOp = {
      cliente_id: clienteId,
      nome: op.nome.trim() || `Operação ${i + 1}`,
      objetivo: op.objetivo?.trim() || null,
      ordem: i,
      ativa: true,
      tipo_verba: op.tipo_verba,
      moeda: op.moeda,
      verba_ads: op.tipo_verba === "mensal" ? total : 0,
      verba_total_contratada: op.tipo_verba === "total_periodo" ? total : null,
      data_inicio_verba: op.tipo_verba === "total_periodo" ? op.data_inicio_verba || null : null,
      data_limite_verba: op.tipo_verba === "total_periodo" ? op.data_limite_verba || null : null,
      plataformas_config: op.plataformas_config,
      verba_diaria_manual: op.verba_diaria && Number(op.verba_diaria) > 0 ? Number(op.verba_diaria) : null,
    };

    let operacaoId: string;
    if (op.id && idsExistentes.has(op.id)) {
      const { error } = await supabase.from("operacoes").update(payloadOp).eq("id", op.id);
      if (error) throw traduzErroCliente(error, values.agencia);
      operacaoId = op.id;
    } else {
      const { data, error } = await supabase.from("operacoes").insert([payloadOp]).select("id").single();
      if (error) throw traduzErroCliente(error, values.agencia);
      operacaoId = data.id;
    }
    idsMantidos.add(operacaoId);

    // ---- saldo_ads da operação: um registro por plataforma
    const verbaDiariaPor = computeVerbaDiariaPorPlataforma(op.plataformas, op.plataformas_config, {
      tipo_verba: op.tipo_verba,
      data_inicio: op.data_inicio_verba,
      data_limite_verba: op.data_limite_verba,
      verba_diaria_manual: payloadOp.verba_diaria_manual,
    });
    // Registros sem operação (anteriores à migration) contam para a primeira operação
    const candidatos = saldos.filter((r) => r.operacao_id === operacaoId || (i === 0 && !r.operacao_id));
    // Uma plataforma por conta: a conta antiga que juntava várias fica com a primeira (e o histórico)
    const { manter, desativar, novas } = contasPorPlataforma(candidatos, op.plataformas);
    for (const id of desativar) {
      // Plataforma removida da operação: desativa (o histórico de recargas fica preservado)
      const { error } = await supabase.from("saldo_ads").update({ ativo: false, operacao_id: operacaoId }).eq("id", id);
      if (error) throw error;
    }
    for (const { id, plataforma } of manter) {
      const { error } = await supabase
        .from("saldo_ads")
        .update({
          operacao_id: operacaoId,
          plataformas: [plataforma],
          metodo_pagamento: op.plataformas_config[plataforma].metodo_pagamento,
          verba_diaria: verbaDiariaPor[plataforma] || 0,
          ativo: true,
        })
        .eq("id", id);
      if (error) throw error;
    }

    if (novas.length > 0) {
      const { error } = await supabase.from("saldo_ads").insert(novas.map((p) => ({
        cliente_id: clienteId,
        user_id: userId,
        operacao_id: operacaoId,
        plataformas: [p],
        metodo_pagamento: op.plataformas_config[p].metodo_pagamento,
        verba_diaria: verbaDiariaPor[p] || 0,
        ativo: true,
      })));
      if (error) throw error;
    }
  }

  // Operações removidas do formulário: ficam inativas (histórico de recargas preservado)
  const removidas = (existentesOps || []).filter((o) => !idsMantidos.has(o.id));
  for (const o of removidas) {
    if (o.ativa) {
      const { error } = await supabase.from("operacoes").update({ ativa: false }).eq("id", o.id);
      if (error) throw error;
    }
    const { error: erroSaldo } = await supabase.from("saldo_ads").update({ ativo: false }).eq("operacao_id", o.id).eq("ativo", true);
    if (erroSaldo) throw erroSaldo;
  }

  return clienteId;
}

/**
 * Tira uma plataforma da operação do cliente (menu "Remover plataforma" da aba Saldo): carrega o
 * cadastro, tira a plataforma da operação e grava pelo saveCliente, que recalcula a verba e deixa
 * a conta inativa (ativo = false) com as recargas guardadas. Nada é apagado. Se for a última
 * plataforma da operação, lança erro sem gravar nada.
 * `operacaoId` vazio = primeira operação; uma conta antiga pode juntar várias plataformas (lista).
 */
export async function removerPlataformaDaOperacao(
  clienteId: string,
  operacaoId: string | null | undefined,
  plataforma: string | string[],
): Promise<void> {
  const carregado = (await loadClienteFormValues(clienteId)) as ClientFormValues & { id: string };
  const values = semPlataforma(carregado, operacaoId, plataforma);
  await saveCliente(values, clienteId);
}

/** Liga/desliga o tráfego do cliente sem abrir o formulário (alavanca no card) */
export async function setTrafegoAtivo(clienteId: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from("clientes").update({ trafego_ativo: ativo } as any).eq("id", clienteId);
  if (error) throw traduzErroCliente(error);
}
