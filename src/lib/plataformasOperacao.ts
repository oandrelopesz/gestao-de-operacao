// Regras puras sobre as plataformas de uma operação (sem banco e sem imports do app, para
// poder ser testada com `node --test`). Plataformas são referenciadas pelo NOME: em
// operacoes.plataformas / plataformas_config e em saldo_ads.plataformas.

export const MSG_ULTIMA_PLATAFORMA =
  "Esta é a única plataforma da operação. Para parar, desligue o tráfego no cadastro do cliente.";

/** O que esta lib precisa saber de uma operação do formulário do cliente (ClientFormValues) */
export interface OperacaoComPlataformas {
  id?: string;
  plataformas: string[];
  plataformas_config: Record<string, unknown>;
}

/**
 * Devolve os valores do cliente sem a(s) plataforma(s) na operação indicada, tirando-a(s) de
 * `plataformas` e de `plataformas_config` e deixando as outras operações e plataformas como estão.
 *
 * - `operacaoId` vazio = primeira operação (mesma regra do saveCliente para contas sem operação).
 * - Aceita uma lista porque contas antigas podem juntar várias plataformas na mesma linha.
 * - Lança erro, sem devolver nada, se a operação ou a plataforma não existem ou se a operação
 *   ficaria sem nenhuma plataforma (MSG_ULTIMA_PLATAFORMA).
 * - Não altera o objeto recebido.
 */
export function semPlataforma<V extends { operacoes: OperacaoComPlataformas[] }>(
  values: V,
  operacaoId: string | null | undefined,
  plataforma: string | string[],
): V {
  const indice = operacaoId ? values.operacoes.findIndex((op) => op.id === operacaoId) : values.operacoes.length > 0 ? 0 : -1;
  if (indice < 0) throw new Error("Não encontrei esta operação no cadastro do cliente.");
  const operacao = values.operacoes[indice];

  const alvo = new Set(Array.isArray(plataforma) ? plataforma : [plataforma]);
  const presentes = operacao.plataformas.filter((p) => alvo.has(p));
  if (presentes.length === 0) {
    throw new Error(`A plataforma "${Array.from(alvo).join(", ")}" não está no cadastro desta operação.`);
  }
  const restantes = operacao.plataformas.filter((p) => !alvo.has(p));
  if (restantes.length === 0) throw new Error(MSG_ULTIMA_PLATAFORMA);

  const config: Record<string, unknown> = {};
  Object.entries(operacao.plataformas_config || {}).forEach(([nome, valor]) => {
    if (!alvo.has(nome)) config[nome] = valor;
  });

  return {
    ...values,
    operacoes: values.operacoes.map((op, i) => (i === indice ? { ...op, plataformas: restantes, plataformas_config: config } : op)),
  };
}

/**
 * Renomeia a chave de uma plataforma num JSONB `plataformas_config`, mantendo o valor e a posição.
 * Devolve o MESMO objeto (quem chama pode comparar com `!==` para saber se há o que gravar) quando
 * a config não tem a chave antiga, quando o nome não muda ou quando o nome novo já existe: nunca
 * sobrescreve uma plataforma existente, para não perder dados.
 */
export function renomearChavePlataforma<T>(config: T, antigo: string, novo: string): T {
  if (!config || typeof config !== "object" || Array.isArray(config)) return config;
  if (antigo === novo) return config;
  const atual = config as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(atual, antigo)) return config;
  if (Object.prototype.hasOwnProperty.call(atual, novo)) return config;
  return Object.fromEntries(Object.entries(atual).map(([nome, valor]) => [nome === antigo ? novo : nome, valor])) as T;
}

/** O que a regra abaixo precisa saber de um registro de saldo_ads */
export interface ContaSaldoMetodo {
  operacao_id: string | null;
  plataformas: string[] | null;
  metodo_pagamento: string | null;
  ativo: boolean | null;
}

const METODOS_VALIDOS = ["cartao", "pix", "boleto"];

/**
 * A forma de pagamento pode ser editada direto na conta do Saldo (saldo_ads), sem passar pela operação.
 * Para o cadastro do cliente não desfazer essa edição ao salvar, o formulário carrega o método da conta
 * ativa da operação que cobre a plataforma; sem conta ativa, vale o da configuração da operação.
 *
 * - Só contas da operação indicada, ativas (`ativo !== false`) e de UMA plataforma entram: a conta antiga
 *   que juntava várias tinha um método só e não diz qual é o de cada plataforma.
 * - Método vazio ou desconhecido na conta é ignorado; com duas contas na mesma plataforma vale a primeira.
 * - Troca só o método: a verba (e qualquer outro campo) da configuração fica como está.
 * - Não altera o objeto recebido; devolve um novo.
 */
export function comMetodoDasContas<C extends { metodo_pagamento: string }>(
  config: Record<string, C>,
  contas: ContaSaldoMetodo[],
  operacaoId: string,
): Record<string, C> {
  const daOperacao = contas.filter((c) => c.ativo !== false && c.operacao_id === operacaoId && c.plataformas?.length === 1);
  const out: Record<string, C> = {};
  Object.entries(config).forEach(([nome, valor]) => {
    const conta = daOperacao.find(
      (c) => (c.plataformas || []).includes(nome) && c.metodo_pagamento && METODOS_VALIDOS.includes(c.metodo_pagamento),
    );
    out[nome] = conta ? { ...valor, metodo_pagamento: conta.metodo_pagamento as C["metodo_pagamento"] } : valor;
  });
  return out;
}

/**
 * Distribui as plataformas de uma operação pelas contas de saldo (saldo_ads) que já existem: UMA
 * plataforma por conta, para a recarga, a forma de pagamento e o alerta serem de cada plataforma.
 *
 * - Contas na ordem recebida (criação); cada uma fica com a primeira plataforma dela ainda não coberta.
 * - Conta antiga que juntava várias plataformas fica com a primeira (e o histórico de recargas);
 *   as outras viram contas novas (`novas`).
 * - Conta inativa da plataforma é reaproveitada (volta com o histórico); conta ativa que sobra é
 *   desativada (`desativar`), nunca apagada.
 */
export function contasPorPlataforma(
  contas: { id: string; plataformas: string[] | null; ativo?: boolean | null }[],
  plataformas: string[],
) {
  const cobertas = new Set<string>();
  const manter: { id: string; plataforma: string }[] = [];
  const desativar: string[] = [];
  for (const c of contas) {
    const plataforma = (c.plataformas || []).find((p) => plataformas.includes(p) && !cobertas.has(p));
    if (plataforma) {
      cobertas.add(plataforma);
      manter.push({ id: c.id, plataforma });
    } else if (c.ativo !== false) desativar.push(c.id);
  }
  return { manter, desativar, novas: plataformas.filter((p) => !cobertas.has(p)) };
}
