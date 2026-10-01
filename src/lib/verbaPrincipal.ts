// Verba principal do Onboarding: regra pura sobre os valores do formulário do cliente (ClientFormValues),
// sem banco e sem imports do app, para poder ser testada com `node --test`. Quem grava é o
// `salvarVerbaPrincipal` (processosService), que passa pelo `saveCliente`: assim a conta do Saldo
// (saldo_ads, com a verba diária) e os campos legados do cliente ficam sempre em sincronia.

export const MSG_VERBA_TOTAL_PERIODO = "Esta operação é por período total. Ajuste a verba no cadastro do cliente.";

/** O que esta lib precisa saber de uma operação do formulário do cliente (OperacaoFormValues) */
export interface OperacaoComVerba {
  tipo_verba: string;
  plataformas: string[];
  plataformas_config: Record<string, unknown>;
}

/**
 * Operação nova com os padrões do formulário (`novaOperacao({ nome: "Principal" })` em ClientForm):
 * BRL, verba mensal, sem período e sem verba diária manual. Mantenha igual ao formulário.
 */
function operacaoPrincipalNova(): Record<string, unknown> {
  return {
    nome: "Principal",
    objetivo: "",
    moeda: "BRL",
    tipo_verba: "mensal",
    data_inicio_verba: "",
    data_limite_verba: "",
    plataformas: [],
    plataformas_config: {},
    verba_diaria: null,
  };
}

/**
 * Devolve os valores do cliente com a verba (mensal) da `plataforma` na operação principal:
 * - operação principal = a primeira; se o cliente não tem nenhuma, cria a "Principal";
 * - a plataforma entra em `plataformas` se faltar e `plataformas_config[plataforma]` recebe a verba,
 *   mantendo a forma de pagamento que já tinha ("pix" se for nova);
 * - não muda `tipo_verba`, moeda, verba diária manual, outras plataformas nem outras operações;
 * - operação por período total: lança erro (MSG_VERBA_TOTAL_PERIODO), pois "verba mensal" não existe
 *   nela e gravar viraria o tipo da operação em silêncio. Quem edita é o cadastro do cliente.
 * Não altera o objeto recebido.
 */
export function aplicarVerbaPrincipal<V extends { operacoes: OperacaoComVerba[] }>(
  values: V,
  plataforma: string,
  valor: number,
): V {
  const principal = (values.operacoes[0] ?? operacaoPrincipalNova()) as OperacaoComVerba;
  if (principal.tipo_verba === "total_periodo") throw new Error(MSG_VERBA_TOTAL_PERIODO);

  const existente = principal.plataformas_config?.[plataforma] as { metodo_pagamento?: string } | undefined;
  const atualizada: OperacaoComVerba = {
    ...principal,
    plataformas: principal.plataformas.includes(plataforma) ? principal.plataformas : [...principal.plataformas, plataforma],
    plataformas_config: {
      ...principal.plataformas_config,
      [plataforma]: { ...existente, verba: valor, metodo_pagamento: existente?.metodo_pagamento ?? "pix" },
    },
  };

  return { ...values, operacoes: [atualizada, ...values.operacoes.slice(1)] } as V;
}
