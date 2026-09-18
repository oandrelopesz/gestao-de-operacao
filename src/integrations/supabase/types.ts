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
      acessos_clientes: {
        Row: {
          agencia: string
          created_at: string
          id: string
          link: string
          login: string | null
          nome: string
          observacoes: string | null
          senha: string | null
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agencia: string
          created_at?: string
          id?: string
          link: string
          login?: string | null
          nome: string
          observacoes?: string | null
          senha?: string | null
          tipo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agencia?: string
          created_at?: string
          id?: string
          link?: string
          login?: string | null
          nome?: string
          observacoes?: string | null
          senha?: string | null
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agencias: {
        Row: {
          ativa: boolean
          created_at: string
          hex: string
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          hex?: string
          id: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          hex?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      operacoes: {
        Row: {
          ativa: boolean
          cliente_id: string
          created_at: string
          data_inicio_verba: string | null
          data_limite_verba: string | null
          id: string
          moeda: string
          nome: string
          objetivo: string | null
          ordem: number
          plataformas_config: Json | null
          tipo_verba: Database["public"]["Enums"]["tipo_verba_enum"]
          updated_at: string
          verba_ads: number
          verba_diaria_manual: number | null
          verba_total_contratada: number | null
        }
        Insert: {
          ativa?: boolean
          cliente_id: string
          created_at?: string
          data_inicio_verba?: string | null
          data_limite_verba?: string | null
          id?: string
          moeda?: string
          nome?: string
          objetivo?: string | null
          ordem?: number
          plataformas_config?: Json | null
          tipo_verba?: Database["public"]["Enums"]["tipo_verba_enum"]
          updated_at?: string
          verba_ads?: number
          verba_diaria_manual?: number | null
          verba_total_contratada?: number | null
        }
        Update: {
          ativa?: boolean
          cliente_id?: string
          created_at?: string
          data_inicio_verba?: string | null
          data_limite_verba?: string | null
          id?: string
          moeda?: string
          nome?: string
          objetivo?: string | null
          ordem?: number
          plataformas_config?: Json | null
          tipo_verba?: Database["public"]["Enums"]["tipo_verba_enum"]
          updated_at?: string
          verba_ads?: number
          verba_diaria_manual?: number | null
          verba_total_contratada?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "operacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      plataformas_ads: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          agencia: string
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
          trafego_ativo: boolean
          updated_at: string
          user_id: string
          verba_ads: number
          verba_total_contratada: number | null
          plataformas_config: Json | null
          verba_diaria_manual: number | null
        }
        Insert: {
          agencia?: string
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
          trafego_ativo?: boolean
          updated_at?: string
          user_id: string
          verba_ads?: number
          verba_total_contratada?: number | null
          plataformas_config?: Json | null
          verba_diaria_manual?: number | null
        }
        Update: {
          agencia?: string
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
          trafego_ativo?: boolean
          updated_at?: string
          user_id?: string
          verba_ads?: number
          verba_total_contratada?: number | null
          plataformas_config?: Json | null
          verba_diaria_manual?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_agencia_fkey"
            columns: ["agencia"]
            isOneToOne: false
            referencedRelation: "agencias"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacoes: {
        Row: {
          created_at: string
          data: string
          fonte: string | null
          moeda: string
          valor: number
        }
        Insert: {
          created_at?: string
          data: string
          fonte?: string | null
          moeda: string
          valor: number
        }
        Update: {
          created_at?: string
          data?: string
          fonte?: string | null
          moeda?: string
          valor?: number
        }
        Relationships: []
      }
      curso_categorias: {
        Row: {
          cor: string | null
          created_at: string | null
          id: string
          nome: string
          ordem: number
          user_id: string
        }
        Insert: {
          cor?: string | null
          created_at?: string | null
          id?: string
          nome: string
          ordem?: number
          user_id: string
        }
        Update: {
          cor?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          ordem?: number
          user_id?: string
        }
        Relationships: []
      }
      cursos: {
        Row: {
          categoria_id: string | null
          created_at: string | null
          em_andamento: boolean | null
          id: string
          link_area_membros: string | null
          login: string | null
          nome: string
          observacoes: string | null
          ordem: number | null
          senha: string | null
          tema: Database["public"]["Enums"]["curso_tema"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          categoria_id?: string | null
          created_at?: string | null
          em_andamento?: boolean | null
          id?: string
          link_area_membros?: string | null
          login?: string | null
          nome: string
          observacoes?: string | null
          ordem?: number | null
          senha?: string | null
          tema?: Database["public"]["Enums"]["curso_tema"]
          updated_at?: string | null
          user_id?: string
        }
        Update: {
          categoria_id?: string | null
          created_at?: string | null
          em_andamento?: boolean | null
          id?: string
          link_area_membros?: string | null
          login?: string | null
          nome?: string
          observacoes?: string | null
          ordem?: number | null
          senha?: string | null
          tema?: Database["public"]["Enums"]["curso_tema"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cursos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "curso_categorias"
            referencedColumns: ["id"]
          },
        ]
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
      demanda_colunas: {
        Row: {
          created_at: string
          hex: string
          id: string
          ordem: number
          sistema: boolean
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hex?: string
          id: string
          ordem?: number
          sistema?: boolean
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hex?: string
          id?: string
          ordem?: number
          sistema?: boolean
          titulo?: string
          updated_at?: string
        }
        Relationships: []
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
          prospeccao_id: string | null
          proxima_execucao: string | null
          recorrente: boolean
          recorrente_pai_id: string | null
          status: string
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
          prospeccao_id?: string | null
          proxima_execucao?: string | null
          recorrente?: boolean
          recorrente_pai_id?: string | null
          status?: string
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
          prospeccao_id?: string | null
          proxima_execucao?: string | null
          recorrente?: boolean
          recorrente_pai_id?: string | null
          status?: string
          titulo?: string
          ultima_execucao?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demandas_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "demanda_colunas"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "demandas_prospeccao_id_fkey"
            columns: ["prospeccao_id"]
            isOneToOne: false
            referencedRelation: "prospeccao"
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
      google_oauth_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string
          id: string
          refresh_token: string
          scope: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at: string
          id?: string
          refresh_token: string
          scope?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          refresh_token?: string
          scope?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      habilidade_recursos: {
        Row: {
          autor: string | null
          created_at: string
          habilidade_id: string
          id: string
          link: string | null
          observacao: string | null
          ordem: number
          tipo: string
          titulo: string
        }
        Insert: {
          autor?: string | null
          created_at?: string
          habilidade_id: string
          id?: string
          link?: string | null
          observacao?: string | null
          ordem?: number
          tipo: string
          titulo: string
        }
        Update: {
          autor?: string | null
          created_at?: string
          habilidade_id?: string
          id?: string
          link?: string | null
          observacao?: string | null
          ordem?: number
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "habilidade_recursos_habilidade_id_fkey"
            columns: ["habilidade_id"]
            isOneToOne: false
            referencedRelation: "habilidades"
            referencedColumns: ["id"]
          },
        ]
      }
      habilidades: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          nome: string
          ordem: number
          peso: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
          peso?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
          peso?: number
          updated_at?: string
        }
        Relationships: []
      }
      livros: {
        Row: {
          autor: string
          created_at: string | null
          data_conclusao: string | null
          data_inicio: string | null
          em_andamento: boolean | null
          id: string
          lido: boolean | null
          nome: string
          observacoes: string | null
          ordem: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          autor: string
          created_at?: string | null
          data_conclusao?: string | null
          data_inicio?: string | null
          em_andamento?: boolean | null
          id?: string
          lido?: boolean | null
          nome: string
          observacoes?: string | null
          ordem?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Update: {
          autor?: string
          created_at?: string | null
          data_conclusao?: string | null
          data_inicio?: string | null
          em_andamento?: boolean | null
          id?: string
          lido?: boolean | null
          nome?: string
          observacoes?: string | null
          ordem?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      pendencias_clientes: {
        Row: {
          cliente_id: string
          created_at: string
          descricao: string | null
          id: string
          resolvida: boolean | null
          status: Database["public"]["Enums"]["status_pendencia"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          resolvida?: boolean | null
          status?: Database["public"]["Enums"]["status_pendencia"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          resolvida?: boolean | null
          status?: Database["public"]["Enums"]["status_pendencia"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pendencias_clientes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pendencias_clientes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_view"
            referencedColumns: ["id"]
          },
        ]
      }
      prospeccao: {
        Row: {
          agencia_destino: string | null
          cliente_id: string | null
          created_at: string | null
          data_fechamento: string | null
          data_lead: string | null
          data_perda: string | null
          data_proximo_contato: string | null
          etapa: Database["public"]["Enums"]["prospeccao_etapa"]
          id: string
          motivo_perda: string | null
          nicho: string | null
          nome: string
          observacoes: string | null
          ordem: number | null
          origem: Database["public"]["Enums"]["prospeccao_origem"] | null
          origem_detalhe: string | null
          probabilidade: number | null
          updated_at: string | null
          user_id: string
          valor_estimado: number | null
        }
        Insert: {
          agencia_destino?: string | null
          cliente_id?: string | null
          created_at?: string | null
          data_fechamento?: string | null
          data_lead?: string | null
          data_perda?: string | null
          data_proximo_contato?: string | null
          etapa?: Database["public"]["Enums"]["prospeccao_etapa"]
          id?: string
          motivo_perda?: string | null
          nicho?: string | null
          nome: string
          observacoes?: string | null
          ordem?: number | null
          origem?: Database["public"]["Enums"]["prospeccao_origem"] | null
          origem_detalhe?: string | null
          probabilidade?: number | null
          updated_at?: string | null
          user_id: string
          valor_estimado?: number | null
        }
        Update: {
          agencia_destino?: string | null
          cliente_id?: string | null
          created_at?: string | null
          data_fechamento?: string | null
          data_lead?: string | null
          data_perda?: string | null
          data_proximo_contato?: string | null
          etapa?: Database["public"]["Enums"]["prospeccao_etapa"]
          id?: string
          motivo_perda?: string | null
          nicho?: string | null
          nome?: string
          observacoes?: string | null
          ordem?: number | null
          origem?: Database["public"]["Enums"]["prospeccao_origem"] | null
          origem_detalhe?: string | null
          probabilidade?: number | null
          updated_at?: string | null
          user_id?: string
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prospeccao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospeccao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_view"
            referencedColumns: ["id"]
          },
        ]
      }
      prospeccao_interacoes: {
        Row: {
          created_at: string | null
          data_interacao: string | null
          descricao: string
          id: string
          prospeccao_id: string
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data_interacao?: string | null
          descricao: string
          id?: string
          prospeccao_id: string
          tipo: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          data_interacao?: string | null
          descricao?: string
          id?: string
          prospeccao_id?: string
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospeccao_interacoes_prospeccao_id_fkey"
            columns: ["prospeccao_id"]
            isOneToOne: false
            referencedRelation: "prospeccao"
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
          alerta_dispensado_em: string | null
          ativo: boolean
          cliente_id: string
          created_at: string
          id: string
          metodo_pagamento:
            | Database["public"]["Enums"]["metodo_pagamento_simplificado"]
            | null
          observacoes: string | null
          operacao_id: string | null
          plataformas: string[]
          updated_at: string
          user_id: string
          verba_diaria: number | null
        }
        Insert: {
          alerta_dispensado_em?: string | null
          ativo?: boolean
          cliente_id: string
          created_at?: string
          id?: string
          metodo_pagamento?:
            | Database["public"]["Enums"]["metodo_pagamento_simplificado"]
            | null
          observacoes?: string | null
          operacao_id?: string | null
          plataformas?: string[]
          updated_at?: string
          user_id: string
          verba_diaria?: number | null
        }
        Update: {
          alerta_dispensado_em?: string | null
          ativo?: boolean
          cliente_id?: string
          created_at?: string
          id?: string
          metodo_pagamento?:
            | Database["public"]["Enums"]["metodo_pagamento_simplificado"]
            | null
          observacoes?: string | null
          operacao_id?: string | null
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
      subhabilidades: {
        Row: {
          created_at: string
          criterios: string | null
          habilidade_id: string
          id: string
          nome: string
          nota: number
          ordem: number
          peso: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          criterios?: string | null
          habilidade_id: string
          id?: string
          nome: string
          nota?: number
          ordem?: number
          peso?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          criterios?: string | null
          habilidade_id?: string
          id?: string
          nome?: string
          nota?: number
          ordem?: number
          peso?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subhabilidades_habilidade_id_fkey"
            columns: ["habilidade_id"]
            isOneToOne: false
            referencedRelation: "habilidades"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      clientes_view: {
        Row: {
          agencia: string | null
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
          operacoes: Json | null
          qtd_operacoes: number | null
          trafego_ativo: boolean | null
          verba_mensal_brl: number | null
        }
        Insert: {
          agencia?: string | null
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
          agencia?: string | null
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
          cliente_agencia: string | null
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
          alerta_dispensado: boolean | null
          alerta_dispensado_em: string | null
          ativo: boolean | null
          cliente_agencia: string | null
          cliente_id: string | null
          cliente_nome: string | null
          cliente_status_operacional:
            | Database["public"]["Enums"]["status_operacional_type"]
            | null
          created_at: string | null
          data_prevista_fim: string | null
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
          valor_ultima_recarga: number | null
          verba_diaria: number | null
          verba_diaria_calc: number | null
          cliente_trafego_ativo: boolean | null
          cotacao_brl: number | null
          moeda: string | null
          operacao_id: string | null
          operacao_nome: string | null
          operacao_ordem: number | null
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
      cliente_nps_status:
        | "ancora"
        | "saudavel"
        | "em_risco"
        | "critico"
        | "sem_avaliacao"
      curso_tema:
        | "ia"
        | "trafego_pago"
        | "trackeamento"
        | "copywriting"
        | "gestao"
        | "vendas"
        | "multiplos_temas"
        | "outros"
      demanda_frequencia:
        | "diaria"
        | "semanal"
        | "quinzenal"
        | "mensal"
        | "customizada"
      demanda_prioridade: "baixa" | "media" | "alta" | "urgente"
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
      prospeccao_etapa:
        | "lead"
        | "contato_feito"
        | "reuniao_agendada"
        | "proposta_enviada"
        | "negociacao"
        | "fechado"
        | "perdido"
      prospeccao_origem:
        | "indicacao"
        | "instagram"
        | "anuncio"
        | "evento"
        | "inbound"
        | "outbound"
        | "parceiro"
        | "outros"
      status_operacional_type: "ativo" | "pausado" | "churn"
      status_pendencia: "onboarding" | "ongoing" | "offboard"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      cliente_nps_status: [
        "ancora",
        "saudavel",
        "em_risco",
        "critico",
        "sem_avaliacao",
      ],
      curso_tema: [
        "ia",
        "trafego_pago",
        "trackeamento",
        "copywriting",
        "gestao",
        "vendas",
        "multiplos_temas",
        "outros",
      ],
      demanda_frequencia: [
        "diaria",
        "semanal",
        "quinzenal",
        "mensal",
        "customizada",
      ],
      demanda_prioridade: ["baixa", "media", "alta", "urgente"],
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
      prospeccao_etapa: [
        "lead",
        "contato_feito",
        "reuniao_agendada",
        "proposta_enviada",
        "negociacao",
        "fechado",
        "perdido",
      ],
      prospeccao_origem: [
        "indicacao",
        "instagram",
        "anuncio",
        "evento",
        "inbound",
        "outbound",
        "parceiro",
        "outros",
      ],
      status_operacional_type: ["ativo", "pausado", "churn"],
      status_pendencia: ["onboarding", "ongoing", "offboard"],
      tipo_verba_enum: ["mensal", "total_periodo"],
    },
  },
} as const
