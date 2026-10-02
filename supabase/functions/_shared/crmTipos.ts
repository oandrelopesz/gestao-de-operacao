// Tipos do CRM. Sem dependências (roda no `node --test`). Importe os tipos com `import type`.

export type TipoColuna =
  | "padrao" | "follow_up" | "reuniao" | "confirmacao" | "remarcacao" | "realizada"
  | "proposta" | "follow_up_proposta" | "ganho" | "perdido" | "desqualificado";

export interface ConfigColuna {
  /** Limite de tentativas (colunas de follow-up) */
  teto?: number;
  /** Motivos oferecidos (perdido/desqualificado) */
  motivos?: string[];
}

export interface ColunaCrm {
  id: string;
  titulo: string;
  hex: string;
  ordem: number;
  tipo: TipoColuna;
  config: ConfigColuna;
}

export type Trafego = "organico" | "pago";
export type MotivoRemarcacao = "no_show" | "nao_confirmou" | "pediu_remarcar";

/** Pontos de contato da reunião atual: `ref` = reuniao_em a que se referem; `feitos` = { "1": ISO, ... }. */
export interface PontosContatoEstado {
  ref?: string;
  marcada_em?: string;
  feitos?: Record<string, string>;
}

export interface LeadCrm {
  id: string;
  nome: string;
  empresa: string | null;
  nicho: string | null;
  cidade: string | null;
  telefone: string | null;
  email: string | null;
  site: string | null;
  instagram: string | null;
  google_meu_negocio: string | null;
  faturamento_faixa: string | null;
  investimento_faixa: string | null;
  /** Descrição do lead */
  observacoes: string | null;
  agencia_destino: string | null;
  trafego: Trafego;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  pagina_entrada: string | null;
  referencia: string | null;
  coluna_id: string | null;
  coluna_desde: string | null;
  ordem: number | null;
  proximo_contato_em: string | null;
  follow_up: number;
  follow_up_proposta: number;
  reuniao_em: string | null;
  reuniao_duracao_min: number | null;
  reuniao_marcada_em: string | null;
  evento_google_id: string | null;
  evento_meet_link: string | null;
  evento_status: string | null;
  evento_erro: string | null;
  pontos_contato: PontosContatoEstado | null;
  compareceu: boolean;
  no_shows: number;
  remarcacoes: number;
  motivo_remarcacao: string | null;
  valor_proposta: number | null;
  valor_fechamento: number | null;
  motivo_perda: string | null;
  motivo_desqualificacao: string | null;
  perdido_em: string | null;
  desqualificado_em: string | null;
  fechado_em: string | null;
  primeiro_contato_em: string | null;
  primeira_reuniao_marcada_em: string | null;
  primeira_reuniao_realizada_em: string | null;
  proposta_enviada_em: string | null;
  follow_ups_ate_reuniao: number | null;
  follow_ups_ate_fechamento: number | null;
  cliente_id: string | null;
  data_lead: string | null;
  created_at: string;
  updated_at: string | null;
}

export type TipoEvento =
  | "criacao" | "mudanca_coluna" | "tentativa" | "ponto_contato" | "reuniao" | "remarcacao" | "reuniao_resultado"
  | "agenda" | "nota" | "edicao" | "ganho" | "perda" | "desqualificacao" | "cliente_cadastrado" | "em_massa";

export interface EventoCrm {
  id: string;
  lead_id: string;
  tipo: TipoEvento;
  descricao: string;
  dados: Record<string, unknown>;
  created_at: string;
}

export interface NovoEvento {
  tipo: TipoEvento;
  descricao: string;
  dados?: Record<string, unknown>;
}

/** Lead com todos os campos vazios (base para testes e para leads novos). */
export function leadBase(over: Partial<LeadCrm> = {}): LeadCrm {
  return {
    id: "lead-1", nome: "Lead", empresa: null, nicho: null, cidade: null, telefone: null, email: null, site: null,
    instagram: null, google_meu_negocio: null, faturamento_faixa: null, investimento_faixa: null, observacoes: null,
    agencia_destino: null, trafego: "organico", utm_source: null, utm_medium: null, utm_campaign: null,
    utm_content: null, utm_term: null, fbclid: null, gclid: null, pagina_entrada: null, referencia: null,
    coluna_id: null, coluna_desde: null, ordem: 0, proximo_contato_em: null, follow_up: 0, follow_up_proposta: 0,
    reuniao_em: null, reuniao_duracao_min: 30, reuniao_marcada_em: null, evento_google_id: null,
    evento_meet_link: null, evento_status: null, evento_erro: null, pontos_contato: {}, compareceu: false,
    no_shows: 0, remarcacoes: 0, motivo_remarcacao: null, valor_proposta: null, valor_fechamento: null,
    motivo_perda: null, motivo_desqualificacao: null, perdido_em: null, desqualificado_em: null, fechado_em: null,
    primeiro_contato_em: null, primeira_reuniao_marcada_em: null, primeira_reuniao_realizada_em: null,
    proposta_enviada_em: null, follow_ups_ate_reuniao: null, follow_ups_ate_fechamento: null, cliente_id: null,
    data_lead: null, created_at: "2026-09-01T12:00:00.000Z", updated_at: null,
    ...over,
  };
}
