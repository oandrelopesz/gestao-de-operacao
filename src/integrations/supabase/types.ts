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
      alertas_saldo_enviados: {
        Row: {
          enviado_em: string
          id: string
          mensagem: string | null
          nivel: number
          recarga_ref: string | null
          saldo_ads_id: string
        }
        Insert: {
          enviado_em?: string
          id?: string
          mensagem?: string | null
          nivel: number
          recarga_ref?: string | null
          saldo_ads_id: string
        }
        Update: {
          enviado_em?: string
          id?: string
          mensagem?: string | null
          nivel?: number
          recarga_ref?: string | null
          saldo_ads_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_saldo_enviados_saldo_ads_id_fkey"
            columns: ["saldo_ads_id"]
            isOneToOne: false
            referencedRelation: "saldo_ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_saldo_enviados_saldo_ads_id_fkey"
            columns: ["saldo_ads_id"]
            isOneToOne: false
            referencedRelation: "saldo_ads_view"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          chave: string
          updated_at: string
          valor: Json
        }
        Insert: {
          chave: string
          updated_at?: string
          valor: Json
        }
        Update: {
          chave?: string
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      banco_leads: {
        Row: {
          aba_id: string
          created_at: string
          dados: Json
          hash: string | null
          id: string
          lead_crm_id: string | null
          na_planilha: boolean
          posicao: number
          updated_at: string
        }
        Insert: {
          aba_id: string
          created_at?: string
          dados?: Json
          hash?: string | null
          id?: string
          lead_crm_id?: string | null
          na_planilha?: boolean
          posicao?: number
          updated_at?: string
        }
        Update: {
          aba_id?: string
          created_at?: string
          dados?: Json
          hash?: string | null
          id?: string
          lead_crm_id?: string | null
          na_planilha?: boolean
          posicao?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "banco_leads_aba_id_fkey"
            columns: ["aba_id"]
            isOneToOne: false
            referencedRelation: "banco_leads_abas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banco_leads_lead_crm_id_fkey"
            columns: ["lead_crm_id"]
            isOneToOne: false
            referencedRelation: "prospeccao"
            referencedColumns: ["id"]
          },
        ]
      }
      banco_leads_abas: {
        Row: {
          ativa: boolean
          colunas: Json
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          colunas?: Json
          id: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          colunas?: Json
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
          onboarding_desde: string | null
          plataformas_config: Json | null
          status_operacional:
            | Database["public"]["Enums"]["status_operacional_type"]
            | null
          tipo_verba: Database["public"]["Enums"]["tipo_verba_enum"]
          trafego_ativo: boolean
          updated_at: string
          user_id: string
          verba_ads: number
          verba_diaria_manual: number | null
          verba_total_contratada: number | null
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
          onboarding_desde?: string | null
          plataformas_config?: Json | null
          status_operacional?:
            | Database["public"]["Enums"]["status_operacional_type"]
            | null
          tipo_verba?: Database["public"]["Enums"]["tipo_verba_enum"]
          trafego_ativo?: boolean
          updated_at?: string
          user_id: string
          verba_ads?: number
          verba_diaria_manual?: number | null
          verba_total_contratada?: number | null
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
          onboarding_desde?: string | null
          plataformas_config?: Json | null
          status_operacional?:
            | Database["public"]["Enums"]["status_operacional_type"]
            | null
          tipo_verba?: Database["public"]["Enums"]["tipo_verba_enum"]
          trafego_ativo?: boolean
          updated_at?: string
          user_id?: string
          verba_ads?: number
          verba_diaria_manual?: number | null
          verba_total_contratada?: number | null
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
      crm_colunas: {
        Row: {
          config: Json
          created_at: string
          hex: string
          id: string
          ordem: number
          tipo: string
          titulo: string
        }
        Insert: {
          config?: Json
          created_at?: string
          hex?: string
          id?: string
          ordem?: number
          tipo?: string
          titulo: string
        }
        Update: {
          config?: Json
          created_at?: string
          hex?: string
          id?: string
          ordem?: number
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      crm_eventos: {
        Row: {
          created_at: string
          dados: Json
          descricao: string
          id: string
          lead_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          dados?: Json
          descricao: string
          id?: string
          lead_id: string
          tipo: string
        }
        Update: {
          created_at?: string
          dados?: Json
          descricao?: string
          id?: string
          lead_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_eventos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "prospeccao"
            referencedColumns: ["id"]
          },
        ]
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
          aulas: Json
          categoria_id: string | null
          concluido_em: string | null
          created_at: string | null
          em_andamento: boolean | null
          expira_em: string | null
          id: string
          link_area_membros: string | null
          login: string | null
          nome: string
          observacoes: string | null
          ordem: number | null
          senha: string | null
          tema: Database["public"]["Enums"]["curso_tema"]
          tipo_acesso: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          aulas?: Json
          categoria_id?: string | null
          concluido_em?: string | null
          created_at?: string | null
          em_andamento?: boolean | null
          expira_em?: string | null
          id?: string
          link_area_membros?: string | null
          login?: string | null
          nome: string
          observacoes?: string | null
          ordem?: number | null
          senha?: string | null
          tema?: Database["public"]["Enums"]["curso_tema"]
          tipo_acesso?: string
          updated_at?: string | null
          user_id?: string
        }
        Update: {
          aulas?: Json
          categoria_id?: string | null
          concluido_em?: string | null
          created_at?: string | null
          em_andamento?: boolean | null
          expira_em?: string | null
          id?: string
          link_area_membros?: string | null
          login?: string | null
          nome?: string
          observacoes?: string | null
          ordem?: number | null
          senha?: string | null
          tema?: Database["public"]["Enums"]["curso_tema"]
          tipo_acesso?: string
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
      demanda_colunas: {
        Row: {
          created_at: string
          dias_semana: number[]
          hex: string
          id: string
          ordem: number
          regra_data: string
          sistema: boolean
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dias_semana?: number[]
          hex?: string
          id: string
          ordem?: number
          regra_data?: string
          sistema?: boolean
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dias_semana?: number[]
          hex?: string
          id?: string
          ordem?: number
          regra_data?: string
          sistema?: boolean
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      demanda_conclusoes: {
        Row: {
          agencia_id: string | null
          cliente_id: string | null
          clientes_extras: string[]
          concluida_em: string
          demanda_id: string | null
          id: string
          pessoal: boolean
          prazo: string | null
          titulo: string | null
        }
        Insert: {
          agencia_id?: string | null
          cliente_id?: string | null
          clientes_extras?: string[]
          concluida_em?: string
          demanda_id?: string | null
          id?: string
          pessoal?: boolean
          prazo?: string | null
          titulo?: string | null
        }
        Update: {
          agencia_id?: string | null
          cliente_id?: string | null
          clientes_extras?: string[]
          concluida_em?: string
          demanda_id?: string | null
          id?: string
          pessoal?: boolean
          prazo?: string | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demanda_conclusoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demanda_conclusoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demanda_conclusoes_demanda_id_fkey"
            columns: ["demanda_id"]
            isOneToOne: true
            referencedRelation: "demandas"
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
      demandas: {
        Row: {
          agencia_id: string | null
          cliente_id: string | null
          clientes_extras: string[]
          created_at: string
          descricao: string | null
          dia_fim_de_semana: string | null
          dia_referencia: string | null
          dia_semana: number | null
          frequencia: Database["public"]["Enums"]["demanda_frequencia"] | null
          frequencia_dia_mes: number | null
          frequencia_dias_semana: string[] | null
          frequencia_intervalo_dias: number | null
          frequencia_tipo: string | null
          id: string
          ordem: number
          pessoal: boolean
          prazo: string | null
          prioridade: Database["public"]["Enums"]["demanda_prioridade"]
          prioridade_pos: number | null
          prioritaria: boolean
          processo_passo_id: string | null
          prospeccao_id: string | null
          proxima_execucao: string | null
          recorrente: boolean
          recorrente_pai_id: string | null
          roadmap_id: string | null
          status: string
          titulo: string
          ultima_execucao: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agencia_id?: string | null
          cliente_id?: string | null
          clientes_extras?: string[]
          created_at?: string
          descricao?: string | null
          dia_fim_de_semana?: string | null
          dia_referencia?: string | null
          dia_semana?: number | null
          frequencia?: Database["public"]["Enums"]["demanda_frequencia"] | null
          frequencia_dia_mes?: number | null
          frequencia_dias_semana?: string[] | null
          frequencia_intervalo_dias?: number | null
          frequencia_tipo?: string | null
          id?: string
          ordem?: number
          pessoal?: boolean
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["demanda_prioridade"]
          prioridade_pos?: number | null
          prioritaria?: boolean
          processo_passo_id?: string | null
          prospeccao_id?: string | null
          proxima_execucao?: string | null
          recorrente?: boolean
          recorrente_pai_id?: string | null
          roadmap_id?: string | null
          status?: string
          titulo: string
          ultima_execucao?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agencia_id?: string | null
          cliente_id?: string | null
          clientes_extras?: string[]
          created_at?: string
          descricao?: string | null
          dia_fim_de_semana?: string | null
          dia_referencia?: string | null
          dia_semana?: number | null
          frequencia?: Database["public"]["Enums"]["demanda_frequencia"] | null
          frequencia_dia_mes?: number | null
          frequencia_dias_semana?: string[] | null
          frequencia_intervalo_dias?: number | null
          frequencia_tipo?: string | null
          id?: string
          ordem?: number
          pessoal?: boolean
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["demanda_prioridade"]
          prioridade_pos?: number | null
          prioritaria?: boolean
          processo_passo_id?: string | null
          prospeccao_id?: string | null
          proxima_execucao?: string | null
          recorrente?: boolean
          recorrente_pai_id?: string | null
          roadmap_id?: string | null
          status?: string
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
            foreignKeyName: "demandas_processo_passo_id_fkey"
            columns: ["processo_passo_id"]
            isOneToOne: true
            referencedRelation: "processo_passos"
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
          {
            foreignKeyName: "demandas_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandas_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "demanda_colunas"
            referencedColumns: ["id"]
          },
        ]
      }
      demandas_viradas: {
        Row: {
          dia: string
          executada_em: string
          movidas: number
        }
        Insert: {
          dia: string
          executada_em?: string
          movidas?: number
        }
        Update: {
          dia?: string
          executada_em?: string
          movidas?: number
        }
        Relationships: []
      }
      financeiro_fontes: {
        Row: {
          agencia_id: string | null
          ativo: boolean | null
          cobranca_desde: string
          created_at: string | null
          dia_recebimento: number
          forma_pagamento: string | null
          id: string
          nome: string
          observacoes: string | null
          parcelas: Json | null
          tipo: string
          updated_at: string | null
          user_id: string
          valor_mensal: number
        }
        Insert: {
          agencia_id?: string | null
          ativo?: boolean | null
          cobranca_desde?: string
          created_at?: string | null
          dia_recebimento: number
          forma_pagamento?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          parcelas?: Json | null
          tipo: string
          updated_at?: string | null
          user_id: string
          valor_mensal?: number
        }
        Update: {
          agencia_id?: string | null
          ativo?: boolean | null
          cobranca_desde?: string
          created_at?: string | null
          dia_recebimento?: number
          forma_pagamento?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          parcelas?: Json | null
          tipo?: string
          updated_at?: string | null
          user_id?: string
          valor_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_fontes_agencia_id_fkey"
            columns: ["agencia_id"]
            isOneToOne: false
            referencedRelation: "agencias"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_recebimentos: {
        Row: {
          created_at: string | null
          data_confirmacao: string | null
          fonte_id: string
          id: string
          isento: boolean
          mes_referencia: string
          observacoes: string | null
          parcela: number
          recebido: boolean | null
          user_id: string
          valor_devido: number | null
          valor_recebido: number | null
        }
        Insert: {
          created_at?: string | null
          data_confirmacao?: string | null
          fonte_id: string
          id?: string
          isento?: boolean
          mes_referencia: string
          observacoes?: string | null
          parcela?: number
          recebido?: boolean | null
          user_id: string
          valor_devido?: number | null
          valor_recebido?: number | null
        }
        Update: {
          created_at?: string | null
          data_confirmacao?: string | null
          fonte_id?: string
          id?: string
          isento?: boolean
          mes_referencia?: string
          observacoes?: string | null
          parcela?: number
          recebido?: boolean | null
          user_id?: string
          valor_devido?: number | null
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
      fireflies_convites: {
        Row: {
          enviado_em: string
          erro: string | null
          evento_id: string
          inicio: string
          link_meet: string | null
          ok: boolean | null
          titulo: string | null
        }
        Insert: {
          enviado_em?: string
          erro?: string | null
          evento_id: string
          inicio: string
          link_meet?: string | null
          ok?: boolean | null
          titulo?: string | null
        }
        Update: {
          enviado_em?: string
          erro?: string | null
          evento_id?: string
          inicio?: string
          link_meet?: string | null
          ok?: boolean | null
          titulo?: string | null
        }
        Relationships: []
      }
      fireflies_reunioes: {
        Row: {
          arquivos: Json
          created_at: string
          data_hora: string | null
          duracao_min: number | null
          erro: string | null
          excluir: boolean
          id: string
          link_fireflies: string | null
          link_meet: string | null
          organizador: string | null
          participantes: string[]
          status: string
          titulo: string
          titulo_pendente: string | null
          updated_at: string
        }
        Insert: {
          arquivos?: Json
          created_at?: string
          data_hora?: string | null
          duracao_min?: number | null
          erro?: string | null
          excluir?: boolean
          id: string
          link_fireflies?: string | null
          link_meet?: string | null
          organizador?: string | null
          participantes?: string[]
          status?: string
          titulo: string
          titulo_pendente?: string | null
          updated_at?: string
        }
        Update: {
          arquivos?: Json
          created_at?: string
          data_hora?: string | null
          duracao_min?: number | null
          erro?: string | null
          excluir?: boolean
          id?: string
          link_fireflies?: string | null
          link_meet?: string | null
          organizador?: string | null
          participantes?: string[]
          status?: string
          titulo?: string
          titulo_pendente?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fluxo_temas: {
        Row: {
          created_at: string
          hex: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          created_at?: string
          hex?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          created_at?: string
          hex?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      fluxo_vinculos: {
        Row: {
          alvo_id: string
          created_at: string
          elemento_id: string
          fluxo_id: string
          id: string
          tipo: string
        }
        Insert: {
          alvo_id: string
          created_at?: string
          elemento_id: string
          fluxo_id: string
          id?: string
          tipo: string
        }
        Update: {
          alvo_id?: string
          created_at?: string
          elemento_id?: string
          fluxo_id?: string
          id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_vinculos_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxos: {
        Row: {
          cena: Json
          created_at: string
          id: string
          miniatura: string | null
          modelo: string | null
          tema_id: string | null
          textos: string
          titulo: string
          updated_at: string
        }
        Insert: {
          cena?: Json
          created_at?: string
          id?: string
          miniatura?: string | null
          modelo?: string | null
          tema_id?: string | null
          textos?: string
          titulo?: string
          updated_at?: string
        }
        Update: {
          cena?: Json
          created_at?: string
          id?: string
          miniatura?: string | null
          modelo?: string | null
          tema_id?: string | null
          textos?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxos_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "fluxo_temas"
            referencedColumns: ["id"]
          },
        ]
      }
      formularios_envios: {
        Row: {
          chave: string
          drive_id: string | null
          formulario: string
          id: string
          recebido_em: string
          titulo: string
          visto_em: string | null
        }
        Insert: {
          chave: string
          drive_id?: string | null
          formulario: string
          id?: string
          recebido_em?: string
          titulo: string
          visto_em?: string | null
        }
        Update: {
          chave?: string
          drive_id?: string | null
          formulario?: string
          id?: string
          recebido_em?: string
          titulo?: string
          visto_em?: string | null
        }
        Relationships: []
      }
      gmn_imagens_uso: {
        Row: {
          origem: string
          perfil_id: string
          ref: string
          usado_em: string
        }
        Insert: {
          origem: string
          perfil_id: string
          ref: string
          usado_em?: string
        }
        Update: {
          origem?: string
          perfil_id?: string
          ref?: string
          usado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmn_imagens_uso_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "gmn_perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      gmn_perfis: {
        Row: {
          account_name: string | null
          agenda: Json
          ativo: boolean
          briefing: Json
          briefing_salvo_em: string | null
          categoria: string | null
          cliente_id: string | null
          contexto_imagens: string | null
          contexto_posts: string | null
          created_at: string
          cta_tipo: string
          cta_url: string | null
          drive_pasta_url: string | null
          endereco: string | null
          id: string
          imagens_site: Json
          location_name: string | null
          logo_fundo: string
          logo_origem_url: string | null
          logo_posicao: string
          logo_tamanho: string
          logo_url: string | null
          nome: string
          permitir_pessoas_ia: boolean
          saude: boolean
          sem_acesso: boolean
          sincronizado_em: string | null
          site: string | null
          telefone: string | null
          updated_at: string
          usa_fotos_site: boolean
          usa_ia_imagem: boolean
        }
        Insert: {
          account_name?: string | null
          agenda?: Json
          ativo?: boolean
          briefing?: Json
          briefing_salvo_em?: string | null
          categoria?: string | null
          cliente_id?: string | null
          contexto_imagens?: string | null
          contexto_posts?: string | null
          created_at?: string
          cta_tipo?: string
          cta_url?: string | null
          drive_pasta_url?: string | null
          endereco?: string | null
          id?: string
          imagens_site?: Json
          location_name?: string | null
          logo_fundo?: string
          logo_origem_url?: string | null
          logo_posicao?: string
          logo_tamanho?: string
          logo_url?: string | null
          nome: string
          permitir_pessoas_ia?: boolean
          saude?: boolean
          sem_acesso?: boolean
          sincronizado_em?: string | null
          site?: string | null
          telefone?: string | null
          updated_at?: string
          usa_fotos_site?: boolean
          usa_ia_imagem?: boolean
        }
        Update: {
          account_name?: string | null
          agenda?: Json
          ativo?: boolean
          briefing?: Json
          briefing_salvo_em?: string | null
          categoria?: string | null
          cliente_id?: string | null
          contexto_imagens?: string | null
          contexto_posts?: string | null
          created_at?: string
          cta_tipo?: string
          cta_url?: string | null
          drive_pasta_url?: string | null
          endereco?: string | null
          id?: string
          imagens_site?: Json
          location_name?: string | null
          logo_fundo?: string
          logo_origem_url?: string | null
          logo_posicao?: string
          logo_tamanho?: string
          logo_url?: string | null
          nome?: string
          permitir_pessoas_ia?: boolean
          saude?: boolean
          sem_acesso?: boolean
          sincronizado_em?: string | null
          site?: string | null
          telefone?: string | null
          updated_at?: string
          usa_fotos_site?: boolean
          usa_ia_imagem?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "gmn_perfis_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmn_perfis_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_view"
            referencedColumns: ["id"]
          },
        ]
      }
      gmn_posts: {
        Row: {
          agendado_para: string
          conferir_em: string | null
          created_at: string
          dia: string
          erro: string | null
          google_estado: string | null
          google_post_name: string | null
          google_url: string | null
          id: string
          imagem_origem: string | null
          imagem_ref: string | null
          imagem_url: string | null
          origem: string
          palavras_chave: string[]
          perfil_id: string
          status: string
          tema: string | null
          tentativas: number
          texto: string | null
          updated_at: string
        }
        Insert: {
          agendado_para?: string
          conferir_em?: string | null
          created_at?: string
          dia?: string
          erro?: string | null
          google_estado?: string | null
          google_post_name?: string | null
          google_url?: string | null
          id?: string
          imagem_origem?: string | null
          imagem_ref?: string | null
          imagem_url?: string | null
          origem: string
          palavras_chave?: string[]
          perfil_id: string
          status?: string
          tema?: string | null
          tentativas?: number
          texto?: string | null
          updated_at?: string
        }
        Update: {
          agendado_para?: string
          conferir_em?: string | null
          created_at?: string
          dia?: string
          erro?: string | null
          google_estado?: string | null
          google_post_name?: string | null
          google_url?: string | null
          id?: string
          imagem_origem?: string | null
          imagem_ref?: string | null
          imagem_url?: string | null
          origem?: string
          palavras_chave?: string[]
          perfil_id?: string
          status?: string
          tema?: string | null
          tentativas?: number
          texto?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmn_posts_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "gmn_perfis"
            referencedColumns: ["id"]
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
      ideia_categorias: {
        Row: {
          created_at: string
          hex: string
          id: string
          label: string
          ordem: number
          sistema: boolean
        }
        Insert: {
          created_at?: string
          hex?: string
          id: string
          label: string
          ordem?: number
          sistema?: boolean
        }
        Update: {
          created_at?: string
          hex?: string
          id?: string
          label?: string
          ordem?: number
          sistema?: boolean
        }
        Relationships: []
      }
      ideias: {
        Row: {
          agencia: string | null
          cliente_id: string | null
          concluida_em: string | null
          concluida_por: string | null
          created_at: string
          demanda_id: string | null
          descricao: string | null
          id: string
          links: string[]
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          cliente_id?: string | null
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          demanda_id?: string | null
          descricao?: string | null
          id?: string
          links?: string[]
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          cliente_id?: string | null
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          demanda_id?: string | null
          descricao?: string | null
          id?: string
          links?: string[]
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ideias_agencia_fkey"
            columns: ["agencia"]
            isOneToOne: false
            referencedRelation: "agencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideias_demanda_id_fkey"
            columns: ["demanda_id"]
            isOneToOne: false
            referencedRelation: "demandas"
            referencedColumns: ["id"]
          },
        ]
      }
      ig_contas: {
        Row: {
          ativa: boolean
          cliente_id: string | null
          created_at: string
          foto_url: string | null
          id: string
          nome: string
          pagina_id: string | null
          pagina_tem_local: boolean
          sincronizada_em: string
          usuario: string
        }
        Insert: {
          ativa?: boolean
          cliente_id?: string | null
          created_at?: string
          foto_url?: string | null
          id: string
          nome?: string
          pagina_id?: string | null
          pagina_tem_local?: boolean
          sincronizada_em?: string
          usuario?: string
        }
        Update: {
          ativa?: boolean
          cliente_id?: string | null
          created_at?: string
          foto_url?: string | null
          id?: string
          nome?: string
          pagina_id?: string | null
          pagina_tem_local?: boolean
          sincronizada_em?: string
          usuario?: string
        }
        Relationships: []
      }
      link_temas: {
        Row: {
          created_at: string
          hex: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          created_at?: string
          hex?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          created_at?: string
          hex?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      links: {
        Row: {
          created_at: string
          id: string
          nome: string
          tema_id: string | null
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          tema_id?: string | null
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          tema_id?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "links_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "link_temas"
            referencedColumns: ["id"]
          },
        ]
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
      nota_temas: {
        Row: {
          created_at: string
          hex: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          created_at?: string
          hex?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          created_at?: string
          hex?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      notas: {
        Row: {
          conteudo: string
          created_at: string
          doc: Json | null
          id: string
          tema_id: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          conteudo?: string
          created_at?: string
          doc?: Json | null
          id?: string
          tema_id?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          doc?: Json | null
          id?: string
          tema_id?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "nota_temas"
            referencedColumns: ["id"]
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
          conversao_vendas: number | null
          created_at: string
          data_avaliacao: string
          engajamento: number | null
          id: string
          observacoes: string | null
          potencial_crescimento: number | null
          relacionamento: number | null
          resultados_campanha: number | null
          score_total: number
          user_id: string
        }
        Insert: {
          cliente_id: string
          conversao_vendas?: number | null
          created_at?: string
          data_avaliacao?: string
          engajamento?: number | null
          id?: string
          observacoes?: string | null
          potencial_crescimento?: number | null
          relacionamento?: number | null
          resultados_campanha?: number | null
          score_total: number
          user_id: string
        }
        Update: {
          cliente_id?: string
          conversao_vendas?: number | null
          created_at?: string
          data_avaliacao?: string
          engajamento?: number | null
          id?: string
          observacoes?: string | null
          potencial_crescimento?: number | null
          relacionamento?: number | null
          resultados_campanha?: number | null
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
          {
            foreignKeyName: "operacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_view"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_pastas: {
        Row: {
          cor: string | null
          created_at: string
          id: string
          nome: string
          ordem: number
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdf_pastas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "pdf_pastas"
            referencedColumns: ["id"]
          },
        ]
      }
      pdfs: {
        Row: {
          arquivo_nome: string
          created_at: string
          id: string
          nome: string
          observacoes: string | null
          pasta_id: string | null
          player: string | null
          storage_path: string
          tamanho: number
          updated_at: string
        }
        Insert: {
          arquivo_nome: string
          created_at?: string
          id?: string
          nome: string
          observacoes?: string | null
          pasta_id?: string | null
          player?: string | null
          storage_path: string
          tamanho?: number
          updated_at?: string
        }
        Update: {
          arquivo_nome?: string
          created_at?: string
          id?: string
          nome?: string
          observacoes?: string | null
          pasta_id?: string | null
          player?: string | null
          storage_path?: string
          tamanho?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdfs_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "pdf_pastas"
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
      planilha_config: {
        Row: {
          chave: string | null
          id: string
          planilha_id: string
          ultima_conferencia_em: string | null
          ultima_conferencia_erro: string | null
          ultima_conferencia_ok: boolean | null
          ultimo_aviso_em: string | null
          updated_at: string
          webapp_url: string | null
        }
        Insert: {
          chave?: string | null
          id?: string
          planilha_id: string
          ultima_conferencia_em?: string | null
          ultima_conferencia_erro?: string | null
          ultima_conferencia_ok?: boolean | null
          ultimo_aviso_em?: string | null
          updated_at?: string
          webapp_url?: string | null
        }
        Update: {
          chave?: string | null
          id?: string
          planilha_id?: string
          ultima_conferencia_em?: string | null
          ultima_conferencia_erro?: string | null
          ultima_conferencia_ok?: boolean | null
          ultimo_aviso_em?: string | null
          updated_at?: string
          webapp_url?: string | null
        }
        Relationships: []
      }
      planilha_fila: {
        Row: {
          campos: string[] | null
          criado_em: string
          dados: Json | null
          entidade: string
          id: number
          op: string
          registro_id: string
        }
        Insert: {
          campos?: string[] | null
          criado_em?: string
          dados?: Json | null
          entidade: string
          id?: number
          op: string
          registro_id: string
        }
        Update: {
          campos?: string[] | null
          criado_em?: string
          dados?: Json | null
          entidade?: string
          id?: number
          op?: string
          registro_id?: string
        }
        Relationships: []
      }
      planilha_pendencias: {
        Row: {
          criado_em: string
          etapa_desejada: string
          falta: string
          lead_id: string
        }
        Insert: {
          criado_em?: string
          etapa_desejada: string
          falta: string
          lead_id: string
        }
        Update: {
          criado_em?: string
          etapa_desejada?: string
          falta?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planilha_pendencias_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "prospeccao"
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
      processo_passos: {
        Row: {
          concluido_em: string | null
          created_at: string
          data: string | null
          id: string
          observacoes: string | null
          ordem: number
          processo_id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          concluido_em?: string | null
          created_at?: string
          data?: string | null
          id?: string
          observacoes?: string | null
          ordem?: number
          processo_id: string
          titulo: string
          updated_at?: string
        }
        Update: {
          concluido_em?: string | null
          created_at?: string
          data?: string | null
          id?: string
          observacoes?: string | null
          ordem?: number
          processo_id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processo_passos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      processo_template_passos: {
        Row: {
          created_at: string
          id: string
          observacoes: string | null
          ordem: number
          template_id: string
          titulo: string
        }
        Insert: {
          created_at?: string
          id?: string
          observacoes?: string | null
          ordem?: number
          template_id: string
          titulo: string
        }
        Update: {
          created_at?: string
          id?: string
          observacoes?: string | null
          ordem?: number
          template_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "processo_template_passos_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "processo_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      processo_templates: {
        Row: {
          created_at: string
          id: string
          nome: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          tipo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      processos: {
        Row: {
          cliente_id: string | null
          concluido_em: string | null
          created_at: string
          id: string
          iniciado_em: string
          nome: string
          passo_onboarding_id: string | null
          pessoal: boolean
          prazo_final: string | null
          status: string
          template_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          concluido_em?: string | null
          created_at?: string
          id?: string
          iniciado_em?: string
          nome: string
          passo_onboarding_id?: string | null
          pessoal?: boolean
          prazo_final?: string | null
          status?: string
          template_id?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          concluido_em?: string | null
          created_at?: string
          id?: string
          iniciado_em?: string
          nome?: string
          passo_onboarding_id?: string | null
          pessoal?: boolean
          prazo_final?: string | null
          status?: string
          template_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_passo_onboarding_fk"
            columns: ["passo_onboarding_id"]
            isOneToOne: false
            referencedRelation: "processo_passos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "processo_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      prospeccao: {
        Row: {
          agencia_destino: string | null
          cidade: string | null
          cliente_id: string | null
          coluna_desde: string | null
          coluna_id: string | null
          compareceu: boolean
          created_at: string | null
          data_fechamento: string | null
          data_lead: string | null
          data_perda: string | null
          data_proximo_contato: string | null
          desqualificado_em: string | null
          email: string | null
          empresa: string | null
          etapa: Database["public"]["Enums"]["prospeccao_etapa"]
          evento_erro: string | null
          evento_google_id: string | null
          evento_meet_link: string | null
          evento_status: string | null
          faturamento_faixa: string | null
          fbclid: string | null
          fechado_em: string | null
          follow_up: number
          follow_up_proposta: number
          follow_ups_ate_fechamento: number | null
          follow_ups_ate_reuniao: number | null
          gclid: string | null
          google_meu_negocio: string | null
          id: string
          instagram: string | null
          investimento_faixa: string | null
          motivo_desqualificacao: string | null
          motivo_perda: string | null
          motivo_remarcacao: string | null
          nicho: string | null
          no_shows: number
          nome: string
          observacoes: string | null
          ordem: number | null
          origem: Database["public"]["Enums"]["prospeccao_origem"] | null
          origem_detalhe: string | null
          pagina_entrada: string | null
          perdido_em: string | null
          pontos_contato: Json
          primeira_reuniao_marcada_em: string | null
          primeira_reuniao_realizada_em: string | null
          primeiro_contato_em: string | null
          probabilidade: number | null
          proposta_enviada_em: string | null
          proximo_contato_em: string | null
          referencia: string | null
          remarcacoes: number
          reuniao_duracao_min: number
          reuniao_em: string | null
          reuniao_marcada_em: string | null
          site: string | null
          telefone: string | null
          trafego: string
          updated_at: string | null
          user_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          valor_estimado: number | null
          valor_fechamento: number | null
          valor_proposta: number | null
        }
        Insert: {
          agencia_destino?: string | null
          cidade?: string | null
          cliente_id?: string | null
          coluna_desde?: string | null
          coluna_id?: string | null
          compareceu?: boolean
          created_at?: string | null
          data_fechamento?: string | null
          data_lead?: string | null
          data_perda?: string | null
          data_proximo_contato?: string | null
          desqualificado_em?: string | null
          email?: string | null
          empresa?: string | null
          etapa?: Database["public"]["Enums"]["prospeccao_etapa"]
          evento_erro?: string | null
          evento_google_id?: string | null
          evento_meet_link?: string | null
          evento_status?: string | null
          faturamento_faixa?: string | null
          fbclid?: string | null
          fechado_em?: string | null
          follow_up?: number
          follow_up_proposta?: number
          follow_ups_ate_fechamento?: number | null
          follow_ups_ate_reuniao?: number | null
          gclid?: string | null
          google_meu_negocio?: string | null
          id?: string
          instagram?: string | null
          investimento_faixa?: string | null
          motivo_desqualificacao?: string | null
          motivo_perda?: string | null
          motivo_remarcacao?: string | null
          nicho?: string | null
          no_shows?: number
          nome: string
          observacoes?: string | null
          ordem?: number | null
          origem?: Database["public"]["Enums"]["prospeccao_origem"] | null
          origem_detalhe?: string | null
          pagina_entrada?: string | null
          perdido_em?: string | null
          pontos_contato?: Json
          primeira_reuniao_marcada_em?: string | null
          primeira_reuniao_realizada_em?: string | null
          primeiro_contato_em?: string | null
          probabilidade?: number | null
          proposta_enviada_em?: string | null
          proximo_contato_em?: string | null
          referencia?: string | null
          remarcacoes?: number
          reuniao_duracao_min?: number
          reuniao_em?: string | null
          reuniao_marcada_em?: string | null
          site?: string | null
          telefone?: string | null
          trafego?: string
          updated_at?: string | null
          user_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          valor_estimado?: number | null
          valor_fechamento?: number | null
          valor_proposta?: number | null
        }
        Update: {
          agencia_destino?: string | null
          cidade?: string | null
          cliente_id?: string | null
          coluna_desde?: string | null
          coluna_id?: string | null
          compareceu?: boolean
          created_at?: string | null
          data_fechamento?: string | null
          data_lead?: string | null
          data_perda?: string | null
          data_proximo_contato?: string | null
          desqualificado_em?: string | null
          email?: string | null
          empresa?: string | null
          etapa?: Database["public"]["Enums"]["prospeccao_etapa"]
          evento_erro?: string | null
          evento_google_id?: string | null
          evento_meet_link?: string | null
          evento_status?: string | null
          faturamento_faixa?: string | null
          fbclid?: string | null
          fechado_em?: string | null
          follow_up?: number
          follow_up_proposta?: number
          follow_ups_ate_fechamento?: number | null
          follow_ups_ate_reuniao?: number | null
          gclid?: string | null
          google_meu_negocio?: string | null
          id?: string
          instagram?: string | null
          investimento_faixa?: string | null
          motivo_desqualificacao?: string | null
          motivo_perda?: string | null
          motivo_remarcacao?: string | null
          nicho?: string | null
          no_shows?: number
          nome?: string
          observacoes?: string | null
          ordem?: number | null
          origem?: Database["public"]["Enums"]["prospeccao_origem"] | null
          origem_detalhe?: string | null
          pagina_entrada?: string | null
          perdido_em?: string | null
          pontos_contato?: Json
          primeira_reuniao_marcada_em?: string | null
          primeira_reuniao_realizada_em?: string | null
          primeiro_contato_em?: string | null
          probabilidade?: number | null
          proposta_enviada_em?: string | null
          proximo_contato_em?: string | null
          referencia?: string | null
          remarcacoes?: number
          reuniao_duracao_min?: number
          reuniao_em?: string | null
          reuniao_marcada_em?: string | null
          site?: string | null
          telefone?: string | null
          trafego?: string
          updated_at?: string | null
          user_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          valor_estimado?: number | null
          valor_fechamento?: number | null
          valor_proposta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prospeccao_agencia_destino_fkey"
            columns: ["agencia_destino"]
            isOneToOne: false
            referencedRelation: "agencias"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "prospeccao_coluna_id_fkey"
            columns: ["coluna_id"]
            isOneToOne: false
            referencedRelation: "crm_colunas"
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
          {
            foreignKeyName: "saldo_ads_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "operacoes"
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
      swipe_config: {
        Row: {
          conectado_em: string | null
          conta_google: string | null
          id: number
          root_folder_id: string | null
          root_folder_link: string | null
          updated_at: string
        }
        Insert: {
          conectado_em?: string | null
          conta_google?: string | null
          id?: number
          root_folder_id?: string | null
          root_folder_link?: string | null
          updated_at?: string
        }
        Update: {
          conectado_em?: string | null
          conta_google?: string | null
          id?: number
          root_folder_id?: string | null
          root_folder_link?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      swipe_itens: {
        Row: {
          categoria: string
          created_at: string
          drive_file_id: string | null
          drive_folder_id: string | null
          drive_web_link: string | null
          erro: string | null
          id: string
          link: string | null
          mime: string | null
          nicho_id: string
          nome_arquivo: string | null
          nota: string | null
          player: string
          rede: string
          status: string
          subnicho_id: string | null
          tags: string[]
          tamanho: number | null
          thumbnail_link: string | null
          updated_at: string
        }
        Insert: {
          categoria: string
          created_at?: string
          drive_file_id?: string | null
          drive_folder_id?: string | null
          drive_web_link?: string | null
          erro?: string | null
          id?: string
          link?: string | null
          mime?: string | null
          nicho_id: string
          nome_arquivo?: string | null
          nota?: string | null
          player: string
          rede?: string
          status?: string
          subnicho_id?: string | null
          tags?: string[]
          tamanho?: number | null
          thumbnail_link?: string | null
          updated_at?: string
        }
        Update: {
          categoria?: string
          created_at?: string
          drive_file_id?: string | null
          drive_folder_id?: string | null
          drive_web_link?: string | null
          erro?: string | null
          id?: string
          link?: string | null
          mime?: string | null
          nicho_id?: string
          nome_arquivo?: string | null
          nota?: string | null
          player?: string
          rede?: string
          status?: string
          subnicho_id?: string | null
          tags?: string[]
          tamanho?: number | null
          thumbnail_link?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "swipe_itens_nicho_id_fkey"
            columns: ["nicho_id"]
            isOneToOne: false
            referencedRelation: "swipe_nichos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipe_itens_subnicho_id_fkey"
            columns: ["subnicho_id"]
            isOneToOne: false
            referencedRelation: "swipe_nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      swipe_jobs: {
        Row: {
          concluido_em: string | null
          created_at: string
          erro: string | null
          id: string
          iniciado_em: string | null
          item_id: string
          payload: Json
          posicao: number
          status: string
          tentativas: number
          tipo: string
        }
        Insert: {
          concluido_em?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          iniciado_em?: string | null
          item_id: string
          payload?: Json
          posicao?: number
          status?: string
          tentativas?: number
          tipo: string
        }
        Update: {
          concluido_em?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          iniciado_em?: string | null
          item_id?: string
          payload?: Json
          posicao?: number
          status?: string
          tentativas?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "swipe_jobs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "swipe_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      swipe_nichos: {
        Row: {
          created_at: string
          drive_folder_id: string | null
          drive_folder_link: string | null
          id: string
          nome: string
          nome_normalizado: string
          ordem: number
          pai_id: string | null
        }
        Insert: {
          created_at?: string
          drive_folder_id?: string | null
          drive_folder_link?: string | null
          id?: string
          nome: string
          nome_normalizado: string
          ordem?: number
          pai_id?: string | null
        }
        Update: {
          created_at?: string
          drive_folder_id?: string | null
          drive_folder_link?: string | null
          id?: string
          nome?: string
          nome_normalizado?: string
          ordem?: number
          pai_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "swipe_nichos_pai_id_fkey"
            columns: ["pai_id"]
            isOneToOne: false
            referencedRelation: "swipe_nichos"
            referencedColumns: ["id"]
          },
        ]
      }
      transcricoes: {
        Row: {
          arquivo_nome: string | null
          concluido_em: string | null
          created_at: string
          duracao_seg: number | null
          erro: string | null
          expira_em: string | null
          id: string
          idioma: string | null
          iniciado_em: string | null
          link: string | null
          nome: string | null
          origem: string
          plataforma: string | null
          posicao: number
          progresso: number
          status: string
          tamanho: number | null
          tentativas: number
          texto: string | null
          validade_dias: number
        }
        Insert: {
          arquivo_nome?: string | null
          concluido_em?: string | null
          created_at?: string
          duracao_seg?: number | null
          erro?: string | null
          expira_em?: string | null
          id?: string
          idioma?: string | null
          iniciado_em?: string | null
          link?: string | null
          nome?: string | null
          origem: string
          plataforma?: string | null
          posicao?: number
          progresso?: number
          status?: string
          tamanho?: number | null
          tentativas?: number
          texto?: string | null
          validade_dias?: number
        }
        Update: {
          arquivo_nome?: string | null
          concluido_em?: string | null
          created_at?: string
          duracao_seg?: number | null
          erro?: string | null
          expira_em?: string | null
          id?: string
          idioma?: string | null
          iniciado_em?: string | null
          link?: string | null
          nome?: string | null
          origem?: string
          plataforma?: string | null
          posicao?: number
          progresso?: number
          status?: string
          tamanho?: number | null
          tentativas?: number
          texto?: string | null
          validade_dias?: number
        }
        Relationships: []
      }
      ver_depois: {
        Row: {
          created_at: string
          id: string
          link: string
          observacao: string | null
          ordem: number
          tipo: string
          titulo: string
          updated_at: string
          visto: boolean
          visto_em: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          link: string
          observacao?: string | null
          ordem?: number
          tipo: string
          titulo: string
          updated_at?: string
          visto?: boolean
          visto_em?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          link?: string
          observacao?: string | null
          ordem?: number
          tipo?: string
          titulo?: string
          updated_at?: string
          visto?: boolean
          visto_em?: string | null
        }
        Relationships: []
      }
      ver_depois_tipos: {
        Row: {
          created_at: string
          hex: string
          id: string
          label: string
          ordem: number
        }
        Insert: {
          created_at?: string
          hex?: string
          id: string
          label: string
          ordem?: number
        }
        Update: {
          created_at?: string
          hex?: string
          id?: string
          label?: string
          ordem?: number
        }
        Relationships: []
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
          operacoes: Json | null
          qtd_operacoes: number | null
          status_operacional:
            | Database["public"]["Enums"]["status_operacional_type"]
            | null
          status_pagamento_mes: string | null
          tipo_verba: Database["public"]["Enums"]["tipo_verba_enum"] | null
          trafego_ativo: boolean | null
          ultima_nps_data: string | null
          ultima_nps_score: number | null
          verba_ads: number | null
          verba_mensal_brl: number | null
          verba_total_contratada: number | null
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
          operacoes?: never
          qtd_operacoes?: never
          status_operacional?:
            | Database["public"]["Enums"]["status_operacional_type"]
            | null
          status_pagamento_mes?: never
          tipo_verba?: Database["public"]["Enums"]["tipo_verba_enum"] | null
          trafego_ativo?: boolean | null
          ultima_nps_data?: never
          ultima_nps_score?: never
          verba_ads?: number | null
          verba_mensal_brl?: never
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
          operacoes?: never
          qtd_operacoes?: never
          status_operacional?:
            | Database["public"]["Enums"]["status_operacional_type"]
            | null
          status_pagamento_mes?: never
          tipo_verba?: Database["public"]["Enums"]["tipo_verba_enum"] | null
          trafego_ativo?: boolean | null
          ultima_nps_data?: never
          ultima_nps_score?: never
          verba_ads?: number | null
          verba_mensal_brl?: never
          verba_total_contratada?: number | null
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
      financeiro_view: {
        Row: {
          agencia_id: string | null
          ativo: boolean | null
          cobranca_desde: string | null
          data_confirmacao: string | null
          dia_recebimento: number | null
          fonte_id: string | null
          forma_pagamento: string | null
          mes_atual: string | null
          nome: string | null
          observacoes: string | null
          parcelas: Json | null
          recebido_mes_atual: boolean | null
          recebimento_id: string | null
          recebimentos_mes: Json | null
          status_mes: string | null
          tipo: string | null
          user_id: string | null
          valor_mensal: number | null
          valor_recebido: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_fontes_agencia_id_fkey"
            columns: ["agencia_id"]
            isOneToOne: false
            referencedRelation: "agencias"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "clientes_agencia_fkey"
            columns: ["cliente_agencia"]
            isOneToOne: false
            referencedRelation: "agencias"
            referencedColumns: ["id"]
          },
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
          cliente_trafego_ativo: boolean | null
          cotacao_brl: number | null
          created_at: string | null
          data_prevista_fim: string | null
          data_ultima_recarga: string | null
          dias_restantes: number | null
          id: string | null
          metodo_pagamento:
            | Database["public"]["Enums"]["metodo_pagamento_simplificado"]
            | null
          moeda: string | null
          observacoes: string | null
          operacao_id: string | null
          operacao_nome: string | null
          operacao_ordem: number | null
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
        }
        Relationships: [
          {
            foreignKeyName: "clientes_agencia_fkey"
            columns: ["cliente_agencia"]
            isOneToOne: false
            referencedRelation: "agencias"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "saldo_ads_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      alertas_saldo_marcar: {
        Args: { p_mensagem?: string; p_nivel: number; p_saldo_ads_id: string }
        Returns: undefined
      }
      alertas_saldo_pendentes: {
        Args: never
        Returns: {
          cliente_nome: string
          dias_restantes: number
          mensagem: string
          nivel: number
          operacao_nome: string
          recarga_ref: string
          saldo_ads_id: string
          saldo_atual_estimado: number
        }[]
      }
      atualizar_conclusao_roadmap: {
        Args: { p_processo: string }
        Returns: undefined
      }
      banco_leads_definir: {
        Args: { p_chave: string; p_id: string; p_valor: string }
        Returns: undefined
      }
      banco_leads_ligar: {
        Args: { p_chave: string; p_crm: string; p_id: string; p_valor: string }
        Returns: undefined
      }
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
      calcular_saldo_atual: {
        Args: { p_saldo_ads_id: string; p_verba_diaria: number }
        Returns: number
      }
      coluna_do_passo: { Args: { p_data: string }; Returns: string }
      cotacao_brl: { Args: { p_moeda: string }; Returns: number }
      formatar_moeda: {
        Args: { p_moeda?: string; p_valor: number }
        Returns: string
      }
      get_nps_categoria: { Args: { score: number }; Returns: string }
      hoje_brt: { Args: never; Returns: string }
      limpar_transcricoes_vencidas: { Args: never; Returns: number }
      onboarding_janela: { Args: never; Returns: number }
      operacao_verba_mensal: {
        Args: { o: Database["public"]["Tables"]["operacoes"]["Row"] }
        Returns: number
      }
      planilha_avisar: { Args: never; Returns: undefined }
      planilha_canonico: { Args: { d: Json }; Returns: string }
      planilha_chave_papel: {
        Args: { p_aba: string; p_papel: string }
        Returns: string
      }
      planilha_origem: { Args: never; Returns: string }
      planilha_resumo: { Args: never; Returns: Json }
      planilha_status: { Args: never; Returns: Json }
      proximo_dia_semana: { Args: { p_dia: number }; Returns: string }
      registrar_envio_formulario: {
        Args: {
          p_chave: string
          p_drive_id?: string
          p_formulario: string
          p_titulo: string
        }
        Returns: undefined
      }
      rolar_colunas_por_dia: { Args: { p_hoje: string }; Returns: number }
      sincronizar_passo: {
        Args: { p_forcar?: boolean; p_passo: string }
        Returns: undefined
      }
      sincronizar_passos_onboarding: { Args: never; Returns: number }
      virar_dia_demandas: { Args: never; Returns: number }
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
