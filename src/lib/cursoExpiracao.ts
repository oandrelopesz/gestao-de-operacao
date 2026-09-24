// Data de expiração do acesso a um curso (regras puras: rodam no navegador e no `node --test`).
// A data é "até quando dá para acessar": o curso expira no dia seguinte a ela.

export type NivelExpiracao = "ok" | "atencao" | "urgente" | "expirado";

export interface EstadoExpiracao {
  nivel: NivelExpiracao;
  /** Dias até a data (0 = hoje, negativo = já passou) */
  dias: number;
  rotulo: string;
}

const ATENCAO_DIAS = 30;
const URGENTE_DIAS = 7;
const MOSTRAR_DIAS_ATE = 60;

/** "2026-10-04" → data local à meia-noite (sem pular de dia por fuso). */
function dataLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const formatar = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

export function estadoExpiracao(expiraEm: string | null | undefined, hoje: Date = new Date()): EstadoExpiracao | null {
  if (!expiraEm) return null;
  const fim = dataLocal(expiraEm);
  if (!fim) return null;
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = Math.round((fim.getTime() - inicioHoje.getTime()) / 86_400_000);

  if (dias < 0) return { nivel: "expirado", dias, rotulo: `Expirado em ${formatar(fim)}` };
  const nivel: NivelExpiracao = dias <= URGENTE_DIAS ? "urgente" : dias <= ATENCAO_DIAS ? "atencao" : "ok";
  if (dias === 0) return { nivel, dias, rotulo: "Expira hoje" };
  if (dias === 1) return { nivel, dias, rotulo: "Expira amanhã" };
  if (dias <= MOSTRAR_DIAS_ATE) return { nivel, dias, rotulo: `Expira em ${dias} dias` };
  return { nivel, dias, rotulo: `Expira em ${formatar(fim)}` };
}
