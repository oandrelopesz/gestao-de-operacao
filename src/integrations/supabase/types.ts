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
          id: string
          nicho: string | null
          nome: string
          observacoes: string | null
          updated_at: string
          user_id: string
          verba_ads: number
        }
        Insert: {
          agencia?: Database["public"]["Enums"]["agencia_enum"]
          arquivado?: boolean
          created_at?: string
          data_inicio?: string
          id?: string
          nicho?: string | null
          nome: string
          observacoes?: string | null
          updated_at?: string
          user_id: string
          verba_ads?: number
        }
        Update: {
          agencia?: Database["public"]["Enums"]["agencia_enum"]
          arquivado?: boolean
          created_at?: string
          data_inicio?: string
          id?: string
          nicho?: string | null
          nome?: string
          observacoes?: string | null
          updated_at?: string
          user_id?: string
          verba_ads?: number
        }
        Relationships: []
      }
      demandas: {
        Row: {
          cliente_id: string | null
          created_at: string
          descricao: string | null
          id: string
          ordem: number
          prazo: string | null
          prioridade: Database["public"]["Enums"]["demanda_prioridade"]
          status: Database["public"]["Enums"]["demanda_status"]
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          ordem?: number
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["demanda_prioridade"]
          status?: Database["public"]["Enums"]["demanda_status"]
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          ordem?: number
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["demanda_prioridade"]
          status?: Database["public"]["Enums"]["demanda_status"]
          titulo?: string
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
        ]
      }
      nps: {
        Row: {
          categoria: Database["public"]["Enums"]["nps_categoria"]
          cliente_id: string
          comentario: string | null
          created_at: string
          data_pesquisa: string
          id: string
          nota: number
          user_id: string
        }
        Insert: {
          categoria: Database["public"]["Enums"]["nps_categoria"]
          cliente_id: string
          comentario?: string | null
          created_at?: string
          data_pesquisa?: string
          id?: string
          nota: number
          user_id: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["nps_categoria"]
          cliente_id?: string
          comentario?: string | null
          created_at?: string
          data_pesquisa?: string
          id?: string
          nota?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nps_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_view"
            referencedColumns: ["id"]
          },
        ]
      }
      saldo: {
        Row: {
          cliente_id: string
          created_at: string
          data_recebimento: string | null
          data_vencimento: string | null
          id: string
          mes_referencia: string
          status_pagamento: Database["public"]["Enums"]["pagamento_status"]
          updated_at: string
          user_id: string
          valor_previsto: number
          valor_recebido: number
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_recebimento?: string | null
          data_vencimento?: string | null
          id?: string
          mes_referencia: string
          status_pagamento?: Database["public"]["Enums"]["pagamento_status"]
          updated_at?: string
          user_id: string
          valor_previsto?: number
          valor_recebido?: number
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_recebimento?: string | null
          data_vencimento?: string | null
          id?: string
          mes_referencia?: string
          status_pagamento?: Database["public"]["Enums"]["pagamento_status"]
          updated_at?: string
          user_id?: string
          valor_previsto?: number
          valor_recebido?: number
        }
        Relationships: [
          {
            foreignKeyName: "saldo_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saldo_cliente_id_fkey"
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
          created_at: string | null
          data_inicio: string | null
          demandas_ativas: number | null
          id: string | null
          nicho: string | null
          nome: string | null
          nps_status: Database["public"]["Enums"]["cliente_nps_status"] | null
          observacoes: string | null
          status_pagamento_mes:
            | Database["public"]["Enums"]["pagamento_status"]
            | null
          ultima_nps_data: string | null
          ultima_nps_nota: number | null
          updated_at: string | null
          user_id: string | null
          valor_previsto_mes: number | null
          valor_recebido_mes: number | null
          verba_ads: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      agencia_enum: "effect" | "spike" | "alt" | "pessoais"
      cliente_nps_status: "promotor" | "neutro" | "detrator" | "sem_avaliacao"
      demanda_prioridade: "baixa" | "media" | "alta" | "urgente"
      demanda_status:
        | "fazer_hoje"
        | "fazer_amanha"
        | "fazer_depois_amanha"
        | "standby"
        | "feito"
      nps_categoria: "promotor" | "neutro" | "detrator"
      pagamento_status: "em_dia" | "pendente" | "atrasado"
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
      cliente_nps_status: ["promotor", "neutro", "detrator", "sem_avaliacao"],
      demanda_prioridade: ["baixa", "media", "alta", "urgente"],
      demanda_status: [
        "fazer_hoje",
        "fazer_amanha",
        "fazer_depois_amanha",
        "standby",
        "feito",
      ],
      nps_categoria: ["promotor", "neutro", "detrator"],
      pagamento_status: ["em_dia", "pendente", "atrasado"],
    },
  },
} as const
