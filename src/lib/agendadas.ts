// Demandas agendadas: tarefa com data marcada que espera fora do quadro (coluna de sistema escondida) e desce
// sozinha para "Fazer depois de amanhã" 2 dias antes da data. Quem move é o banco (gatilho e virada).
import { formatarDataCurta } from "./entrega.ts";
import { diferencaDias, somarDias } from "./recorrencia.ts";

/** Valor de demandas.status das agendadas. A coluna existe no banco, mas o front não a mostra no quadro. */
export const COLUNA_AGENDADAS = "agendadas";

/** Linha da lista: "em 12 dias · desce para o quadro em 23/01". */
export function resumoAgendada(prazo: string, hoje: string): string {
  const desce = somarDias(prazo, -2);
  const quando = desce === somarDias(hoje, 1) ? "amanhã" : `em ${formatarDataCurta(desce)}`;
  return `em ${diferencaDias(hoje, prazo)} dias · desce para o quadro ${quando}`;
}
