export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      clientes: {
        Row: {
          agencia: Database["public"]["Enums"]["agencia_enum"]
          arquivado: boolean
          created_at: string
          data_inicio: string
          data_limite_verba: string | null
          em_onboarding: boolean | null
          id: string
          nicho: string | null
          nome: string
          observacoes: string | null
          status_operacional:
            | Database["public"]["Enums"]["status_operacional_type"]
            | null
          tipo_verba: Database["public"]["Enums"]["tipo_verba_enum"]
          updated_at: string
          user_id: string
          verba_ads: number
          verba_total_contratada: number | null
        }
        Insert: {
          agencia?: Database["public"]["Enums"]["agencia_enum"]
          arquivado?: boolean
          created_at?: string
          data_inicio?: string
          data_limite_verba?: string | null
          em_onboarding?: boolean | null
          id?: string
          nicho?: string | null
          nome: string
          observacoes?: string | null
          status_operacional?:
            | Database["public"]["Enums"]["status_operacional_type"]
            | null
          tipo_verba?: Database["public"]["Enums"]["tipo_verba_enum"]
          updated_at?: string
          user_id: string
          verba_ads?: number
          verba_total_contratada?: number | null
        }
        Update: {
          agencia?: Database["public"]["Enums"]["agencia_enum"]
          arquivado?: boolean
          created_at?: string
          data_inicio?: string
          data_limite_verba?: string | null
          em_onboarding?: boolean | null
          id?: string
          nicho?: string | null
          nome?: string
          observacoes?: string | null
          status_operacional?:
            | Database["public"]["Enums"]["status_operacional_type"]
            | null
          tipo_verba?: Database["public"]["Enums"]["tipo_verba_enum"]
          updated_at?: string
          user_id?: string
          verba_ads?: number
          verba_total_contratada?: number | null
        }
        Relationships: []
      }
      demanda_execucoes: {
        Row: {
          concluida: boolean | null
          created_at: string | null
          data_execucao: string
          demanda_id: string
          id: string
        }
        Insert: {
          concluida?: boolean | null
          created_at?: string | null
          data_execucao?: string
          demanda_id: string
          id?: string
        }
        Update: {
          concluida?: boolean | null
          created_at?: string | null
          data_execucao?: string
          demanda_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demanda_execucoes_demanda_id_fkey"
            columns: ["demanda_id"]
            isOneToOne: false
            referencedRelation: "demandas"
            referencedColumns: ["id"]
          },
        ]
      }
      demandas: {
        Row: {
          cliente_id: string | null
          created_at: string
          descricao: string | null
          dia_referencia: string | null
          frequencia: Database["public"]["Enums"]["demanda_frequencia"] | null
          frequencia_dia_mes: number | null
          frequencia_dias_semana: string[] | null
          frequencia_intervalo_dias: number | null
          frequencia_tipo: string | null
          id: string
          ordem: number
          prazo: string | null
          prioridade: Database["public"]["Enums"]["demanda_prioridade"]
          proxima_execucao: string | null
          recorrente: boolean
          recorrente_pai_id: string | null
          status: Database["public"]["Enums"]["demanda_status"]
          titulo: string
          ultima_execucao: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          descricao?: string | null
          dia_referencia?: string | null
          frequencia?: Database["public"]["Enums"]["demanda_frequencia"] | null
          frequencia_dia_mes?: number | null
          frequencia_dias_semana?: string[] | null
          frequencia_intervalo_dias?: number | null
          frequencia_tipo?: string | null
          id?: string
          ordem?: number
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["demanda_prioridade"]
          proxima_execucao?: string | null
          recorrente?: boolean
          recorrente_pai_id?: string | null
          status?: Database["public"]["Enums"]["demanda_status"]
          titulo: string
          ultima_execucao?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          descricao?: string | null
          dia_referencia?: string | null
          frequencia?: Database["public"]["Enums"]["demanda_frequencia"] | null
          frequencia_dia_mes?: number | null
          frequencia_dias_semana?: string[] | null
          frequencia_intervalo_dias?: number | null
          frequencia_tipo?: string | null
          id?: string
          ordem?: number
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["demanda_prioridade"]
          proxima_execucao?: string | null
          recorrente?: boolean
          recorrente_pai_id?: string | null
          status?: Database["public"]["Enums"]["demanda_status"]
          titulo?: string
          ultima_execucao?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demandas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandas_recorrente_pai_id_fkey"
            columns: ["recorrente_pai_id"]
            isOneToOne: false
            referencedRelation: "demandas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_fontes: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          dia_recebimento: number
          id: string
          nome: string
          observacoes: string | null
          tipo: string
          updated_at: string | null
          user_id: string
          valor_mensal: number
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          dia_recebimento: number
          id?: string
          nome: string
          observacoes?: string | null
          tipo: string
          updated_at?: string | null
          user_id: string
          valor_mensal?: number
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          dia_recebimento?: number
          id?: string
          nome?: string
          observacoes?: string | null
          tipo?: string
          updated_at?: string | null
          user_id?: string
          valor_mensal?: number
        }
        Relationships: []
      }
      financeiro_recebimentos: {
        Row: {
          created_at: string | null
          data_confirmacao: string | null
          fonte_id: string
          id: string
          mes_referencia: string
          observacoes: string | null
          recebido: boolean | null
          user_id: string
          valor_recebido: number | null
        }
        Insert: {
          created_at?: string | null
          data_confirmacao?: string | null
          fonte_id: string
          id?: string
          mes_referencia: string
          observacoes?: string | null
          recebido?: boolean | null
          user_id: string
          valor_recebido?: number | null
        }
        Update: {
          created_at?: string | null
          data_confirmacao?: string | null
          fonte_id?: string
          id?: string
          mes_referencia?: string
          observacoes?: string | null
          recebido?: boolean | null
          user_id?: string
          valor_recebido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_recebimentos_fonte_id_fkey"
            columns: ["fonte_id"]
            isOneToOne: false
            referencedRelation: "financeiro_fontes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_recebimentos_fonte_id_fkey"
            columns: ["fonte_id"]
            isOneToOne: false
            referencedRelation: "financeiro_view"
            referencedColumns: ["fonte_id"]
          },
        ]
      }
      notificacoes_config: {
        Row: {
          alerta_dias_antes: number
          ativo: boolean
          created_at: string
          horario_notificacao_matinal: string | null
          id: string
          notificacao_matinal_ativa: boolean | null
          nps_override_dia_semana: boolean | null
          telegram_bot_token: string | null
          telegram_chat_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alerta_dias_antes?: number
          ativo?: boolean
          created_at?: string
          horario_notificacao_matinal?: string | null
          id?: string
          notificacao_matinal_ativa?: boolean | null
          nps_override_dia_semana?: boolean | null
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alerta_dias_antes?: number
          ativo?: boolean
          created_at?: string
          horario_notificacao_matinal?: string | null
          id?: string
          notificacao_matinal_ativa?: boolean | null
          nps_override_dia_semana?: boolean | null
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nps_avaliacoes: {
        Row: {
          cliente_id: string
          conversao_vendas: number
          created_at: string
          data_avaliacao: string
          engajamento: number
          id: string
          observacoes: string | null
          potencial_crescimento: number
          relacionamento: number
          resultados_campanha: number
          score_total: number
          user_id: string
        }
        Insert: {
          cliente_id: string
          conversao_vendas: number
          created_at?: string
          data_avaliacao?: string
          engajamento: number
          id?: string
          observacoes?: string | null
          potencial_crescimento: number
          relacionamento: number
          resultados_campanha: number
          score_total: number
          user_id: string
        }
        Update: {
          cliente_id?: string
          conversao_vendas?: number
          created_at?: string
          data_avaliacao?: string
          engajamento?: number
          id?: string
          observacoes?: string | null
          potencial_crescimento?: number
          relacionamento?: number
          resultados_campanha?: number
          score_total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nps_avaliacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_avaliacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_view"
            referencedColumns: ["id"]
          },
        ]
      }
      recargas: {
        Row: {
          created_at: string
          data_recarga: string
          id: string
          metodo_pagamento:
            | Database["public"]["Enums"]["metodo_pagamento_simplificado"]
            | null
          observacoes: string | null
          saldo_ads_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          data_recarga?: string
          id?: string
          metodo_pagamento?:
            | Database["public"]["Enums"]["metodo_pagamento_simplificado"]
            | null
          observacoes?: string | null
          saldo_ads_id: string
          valor?: number
        }
        Update: {
          created_at?: string
          data_recarga?: string
          id?: string
          metodo_pagamento?:
            | Database["public"]["Enums"]["metodo_pagamento_simplificado"]
            | null
          observacoes?: string | null
          saldo_ads_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "recargas_saldo_ads_id_fkey"
            columns: ["saldo_ads_id"]
            isOneToOne: false
            referencedRelation: "saldo_ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recargas_saldo_ads_id_fkey"
            columns: ["saldo_ads_id"]
            isOneToOne: false
            referencedRelation: "saldo_ads_view"
            referencedColumns: ["id"]
          },
        ]
      }
      saldo_ads: {
        Row: {
          ativo: boolean
          cliente_id: string
          created_at: string
          id: string
          metodo_pagamento:
            | Database["public"]["Enums"]["metodo_pagamento_simplificado"]
            | null
          observacoes: string | null
          plataformas: string[]
          updated_at: string
          user_id: string
          verba_diaria: number | null
        }
        Insert: {
          ativo?: boolean
          cliente_id: string
          created_at?: string
          id?: string
          metodo_pagamento?:
            | Database["public"]["Enums"]["metodo_pagamento_simplificado"]
            | null
          observacoes?: string | null
          plataformas?: string[]
          updated_at?: string
          user_id: string
          verba_diaria?: number | null
        }
        Update: {
          ativo?: boolean
          cliente_id?: string
          created_at?: string
          id?: string
          metodo_pagamento?:
            | Database["public"]["Enums"]["metodo_pagamento_simplificado"]
            | null
          observacoes?: string | null
          plataformas?: string[]
          updated_at?: string
          user_id?: string
          verba_diaria?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "saldo_ads_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saldo_ads_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_view"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      clientes_view: {
        Row: {
          agencia: Database["public"]["Enums"]["agencia_enum"] | null
          arquivado: boolean | null
          data_inicio: string | null
          data_limite_verba: string | null
          demandas_ativas: number | null
          em_onboarding: boolean | null
          id: string | null
          nicho: string | null
          nome: string | null
          nps_status: string | null
          observacoes: string | null
          status_operacional:
            | Database["public"]["Enums"]["status_operacional_type"]
            | null
          status_pagamento_mes: string | null
          tipo_verba: Database["public"]["Enums"]["tipo_verba_enum"] | null
          ultima_nps_data: string | null
          ultima_nps_score: number | null
          verba_ads: number | null
          verba_total_contratada: number | null
        }
        Insert: {
          agencia?: Database["public"]["Enums"]["agencia_enum"] | null
          arquivado?: boolean | null
          data_inicio?: string | null
          data_limite_verba?: string | null
          demandas_ativas?: never
          em_onboarding?: boolean | null
          id?: string | null
          nicho?: string | null
          nome?: string | null
          nps_status?: never
          observacoes?: string | null
          status_operacional?:
            | Database["public"]["Enums"]["status_operacional_type"]
            | null
          status_pagamento_mes?: never
          tipo_verba?: Database["public"]["Enums"]["tipo_verba_enum"] | null
          ultima_nps_data?: never
          ultima_nps_score?: never
          verba_ads?: number | null
          verba_total_contratada?: number | null
        }
        Update: {
          agencia?: Database["public"]["Enums"]["agencia_enum"] | null
          arquivado?: boolean | null
          data_inicio?: string | null
          data_limite_verba?: string | null
          demandas_ativas?: never
          em_onboarding?: boolean | null
          id?: string | null
          nicho?: string | null
          nome?: string | null
          nps_status?: never
          observacoes?: string | null
          status_operacional?:
            | Database["public"]["Enums"]["status_operacional_type"]
            | null
          status_pagamento_mes?: never
          tipo_verba?: Database["public"]["Enums"]["tipo_verba_enum"] | null
          ultima_nps_data?: never
          ultima_nps_score?: never
          verba_ads?: number | null
          verba_total_contratada?: number | null
        }
        Relationships: []
      }
      financeiro_view: {
        Row: {
          ativo: boolean | null
          data_confirmacao: string | null
          dia_recebimento: number | null
          fonte_id: string | null
          mes_atual: string | null
          nome: string | null
          observacoes: string | null
          recebido_mes_atual: boolean | null
          recebimento_id: string | null
          status_mes: string | null
          tipo: string | null
          user_id: string | null
          valor_mensal: number | null
          valor_recebido: number | null
        }
        Relationships: []
      }
      nps_avaliacoes_view: {
        Row: {
          categoria: string | null
          cliente_agencia: Database["public"]["Enums"]["agencia_enum"] | null
          cliente_em_onboarding: boolean | null
          cliente_id: string | null
          cliente_nicho: string | null
          cliente_nome: string | null
          cliente_status_operacional:
            | Database["public"]["Enums"]["status_operacional_type"]
            | null
          conversao_vendas: number | null
          created_at: string | null
          data_avaliacao: string | null
          engajamento: number | null
          id: string | null
          observacoes: string | null
          potencial_crescimento: number | null
          relacionamento: number | null
          resultados_campanha: number | null
          score_total: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_avaliacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_avaliacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_view"
            referencedColumns: ["id"]
          },
        ]
      }
      saldo_ads_view: {
        Row: {
          ativo: boolean | null
          cliente_agencia: Database["public"]["Enums"]["agencia_enum"] | null
          cliente_id: string | null
          cliente_nome: string | null
          cliente_status_operacional:
            | Database["public"]["Enums"]["status_operacional_type"]
            | null
          created_at: string | null
          data_ultima_recarga: string | null
          dias_restantes: number | null
          id: string | null
          metodo_pagamento:
            | Database["public"]["Enums"]["metodo_pagamento_simplificado"]
            | null
          observacoes: string | null
          plataformas: string[] | null
          qtd_recargas: number | null
          saldo_atual_estimado: number | null
          saldo_total_acumulado: number | null
          status_alerta: string | null
          updated_at: string | null
          user_id: string | null
          verba_diaria: number | null
          verba_diaria_calc: number | null
        }
        Relationships: [
          {
            foreignKeyName: "saldo_ads_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saldo_ads_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_view"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calcular_proxima_execucao: {
        Args: {
          p_data_referencia?: string
          p_dia_mes: number
          p_dias_semana: string[]
          p_intervalo_dias: number
          p_tipo: string
          p_ultima_execucao: string
        }
        Returns: string
      }
      get_nps_categoria: { Args: { score: number }; Returns: string }
    }
    Enums: {
      agencia_enum: "effect" | "spike" | "alt" | "pessoais"
      cliente_nps_status:
        | "ancora"
        | "saudavel"
        | "em_risco"
        | "critico"
        | "sem_avaliacao"
      demanda_frequencia:
        | "diaria"
        | "semanal"
        | "quinzenal"
        | "mensal"
        | "customizada"
      demanda_prioridade: "baixa" | "media" | "alta" | "urgente"
      demanda_status:
        | "recorrentes"
        | "fazer_hoje"
        | "fazer_amanha"
        | "fazer_depois_amanha"
        | "standby"
        | "feito"
      metodo_pagamento_enum:
        | "dinheiro"
        | "cartao_credito"
        | "cartao_debito"
        | "pix"
        | "boleto"
        | "outros"
      metodo_pagamento_simplificado: "cartao" | "pix" | "boleto"
      nps_score_categoria: "ancora" | "saudavel" | "em_risco" | "critico"
      pagamento_status: "em_dia" | "pendente" | "atrasado"
      plataforma_enum: "meta" | "google" | "tiktok" | "outras"
      status_operacional_type: "ativo" | "pausado" | "churn"
      tipo_verba_enum: "mensal" | "total_periodo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agencia_enum: ["effect", "spike", "alt", "pessoais"],
      cliente_nps_status: [
        "ancora",
        "saudavel",
        "em_risco",
        "critico",
        "sem_avaliacao",
      ],
      demanda_frequencia: [
        "diaria",
        "semanal",
        "quinzenal",
        "mensal",
        "customizada",
      ],
      demanda_prioridade: ["baixa", "media", "alta", "urgente"],
      demanda_status: [
        "recorrentes",
        "fazer_hoje",
        "fazer_amanha",
        "fazer_depois_amanha",
        "standby",
        "feito",
      ],
      metodo_pagamento_enum: [
        "dinheiro",
        "cartao_credito",
        "cartao_debito",
        "pix",
        "boleto",
        "outros",
      ],
      metodo_pagamento_simplificado: ["cartao", "pix", "boleto"],
      nps_score_categoria: ["ancora", "saudavel", "em_risco", "critico"],
      pagamento_status: ["em_dia", "pendente", "atrasado"],
      plataforma_enum: ["meta", "google", "tiktok", "outras"],
      status_operacional_type: ["ativo", "pausado", "churn"],
      tipo_verba_enum: ["mensal", "total_periodo"],
    },
  },
} as const
