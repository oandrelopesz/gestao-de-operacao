// Cópia de uma demanda (item "Duplicar" do menu do card e do painel lateral). Regras puras, sem
// banco e sem imports do app, para poder ser testada com `node --test`.

/** Coluna onde a cópia de uma demanda concluída entra (decisão do dono: concluída não volta como concluída) */
export const COLUNA_COPIA_DE_FEITO = "standby";

export const SUFIXO_COPIA = " (Cópia)";

/** Campos que identificam o registro: a cópia ganha os dela */
const CAMPOS_DO_REGISTRO = ["id", "created_at", "updated_at"];

/** Relações que o select do quadro traz junto (`clientes(nome, agencia)`): não são colunas da tabela */
const RELACOES_CONHECIDAS = ["clientes"];

/**
 * Colunas que a cópia não herda (ficam nulas):
 * - `processo_passo_id` tem restrição UNIQUE (migration 20260924100000_processos.sql);
 * - `recorrente_pai_id`: concluir a cópia de uma recorrente conta execução (migration 20261002120000),
 *   e a duplicata não deve contar de novo.
 * `roadmap_id` e as demais acompanham a cópia.
 */
const COLUNAS_UNICAS = ["processo_passo_id", "recorrente_pai_id"];

export type LinhaDemanda = Record<string, any> & { titulo: string; status: string; ordem: number };

/** Em que coluna a cópia entra: a mesma do original, menos Feito (vai para o Standby) */
export function colunaDaCopia(status: string): string {
  return status === "feito" ? COLUNA_COPIA_DE_FEITO : status;
}

/** `ordem` para uma demanda entrar no fim da coluna: maior ordem da coluna + 1 (coluna vazia = 0) */
export function proximaOrdem(demandas: { status: string; ordem?: number | null }[], status: string): number {
  let maior = -1;
  for (const d of demandas) {
    if (d.status === status && (d.ordem || 0) > maior) maior = d.ordem || 0;
  }
  return maior + 1;
}

function ehObjetoDeRelacao(valor: unknown): boolean {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Linha a inserir em `demandas` para duplicar `demanda`:
 * - sem id, created_at, updated_at e sem objetos de relação (`clientes`...);
 * - título com " (Cópia)" no fim;
 * - colunas únicas (`processo_passo_id`) nulas, senão a cópia de um card de onboarding não entra;
 * - se o original está em Feito, a cópia vai para o Standby, sem entrega (`prazo: null`) e sem dia;
 *   nos outros casos fica na mesma coluna e com a mesma entrega;
 * - `ordem` é a recebida (o chamador calcula com `proximaOrdem` na coluna de `colunaDaCopia`).
 * `user_id` segue o do original: o chamador sobrescreve com o usuário atual.
 * Não altera o objeto recebido.
 */
export function montarCopiaDemanda(
  demanda: { titulo: string; status: string } & Record<string, any>,
  ordem: number,
): LinhaDemanda {
  const linha: Record<string, any> = {};
  for (const [campo, valor] of Object.entries(demanda)) {
    if (CAMPOS_DO_REGISTRO.includes(campo) || RELACOES_CONHECIDAS.includes(campo)) continue;
    if (ehObjetoDeRelacao(valor)) continue;
    linha[campo] = valor;
  }
  for (const coluna of COLUNAS_UNICAS) linha[coluna] = null;
  linha.titulo = `${demanda.titulo}${SUFIXO_COPIA}`;
  linha.ordem = ordem;
  if (demanda.status === "feito") {
    linha.status = COLUNA_COPIA_DE_FEITO;
    linha.prazo = null;
    linha.dia_semana = null;
  }
  return linha as LinhaDemanda;
}
