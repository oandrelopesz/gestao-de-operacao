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
