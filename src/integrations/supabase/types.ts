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
      assistido_acolhimentos: {
        Row: {
          assistido_id: string
          ativo: boolean | null
          created_at: string
          data_ingresso: string
          data_reavaliacao: string | null
          data_saida: string | null
          entidade_nome: string
          id: string
          motivo_encerramento: string | null
          tipo: Database["public"]["Enums"]["tipo_acolhimento_enum"]
          updated_at: string
        }
        Insert: {
          assistido_id: string
          ativo?: boolean | null
          created_at?: string
          data_ingresso: string
          data_reavaliacao?: string | null
          data_saida?: string | null
          entidade_nome: string
          id?: string
          motivo_encerramento?: string | null
          tipo: Database["public"]["Enums"]["tipo_acolhimento_enum"]
          updated_at?: string
        }
        Update: {
          assistido_id?: string
          ativo?: boolean | null
          created_at?: string
          data_ingresso?: string
          data_reavaliacao?: string | null
          data_saida?: string | null
          entidade_nome?: string
          id?: string
          motivo_encerramento?: string | null
          tipo?: Database["public"]["Enums"]["tipo_acolhimento_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistido_acolhimentos_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistido_acolhimentos_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "v_assistidos_card"
            referencedColumns: ["id"]
          },
        ]
      }
      assistido_familiares: {
        Row: {
          assistido_id: string
          assistido_pela_dpe: boolean
          created_at: string
          id: string
          nome: string
          observacoes: string | null
          parentesco: Database["public"]["Enums"]["parentesco_enum"]
          responsavel: boolean
        }
        Insert: {
          assistido_id: string
          assistido_pela_dpe?: boolean
          created_at?: string
          id?: string
          nome: string
          observacoes?: string | null
          parentesco: Database["public"]["Enums"]["parentesco_enum"]
          responsavel?: boolean
        }
        Update: {
          assistido_id?: string
          assistido_pela_dpe?: boolean
          created_at?: string
          id?: string
          nome?: string
          observacoes?: string | null
          parentesco?: Database["public"]["Enums"]["parentesco_enum"]
          responsavel?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "assistido_familiares_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistido_familiares_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "v_assistidos_card"
            referencedColumns: ["id"]
          },
        ]
      }
      assistido_processos: {
        Row: {
          assistido_id: string
          created_at: string
          extrajudicial: boolean
          id: string
          numero_processo: string | null
          prazo_proximo: string | null
          prioridade: Database["public"]["Enums"]["prioridade_enum"]
          situacao: Database["public"]["Enums"]["situacao_processo_enum"]
          tipo: string | null
          updated_at: string
        }
        Insert: {
          assistido_id: string
          created_at?: string
          extrajudicial?: boolean
          id?: string
          numero_processo?: string | null
          prazo_proximo?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade_enum"]
          situacao?: Database["public"]["Enums"]["situacao_processo_enum"]
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          assistido_id?: string
          created_at?: string
          extrajudicial?: boolean
          id?: string
          numero_processo?: string | null
          prazo_proximo?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade_enum"]
          situacao?: Database["public"]["Enums"]["situacao_processo_enum"]
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistido_processos_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistido_processos_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "v_assistidos_card"
            referencedColumns: ["id"]
          },
        ]
      }
      assistido_providencias: {
        Row: {
          assistido_id: string
          concluida_em: string | null
          created_at: string
          descricao: string
          id: string
          prazo: string | null
          prioridade: Database["public"]["Enums"]["prioridade_enum"]
          responsavel_user_id: string | null
        }
        Insert: {
          assistido_id: string
          concluida_em?: string | null
          created_at?: string
          descricao: string
          id?: string
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade_enum"]
          responsavel_user_id?: string | null
        }
        Update: {
          assistido_id?: string
          concluida_em?: string | null
          created_at?: string
          descricao?: string
          id?: string
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade_enum"]
          responsavel_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistido_providencias_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistido_providencias_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "v_assistidos_card"
            referencedColumns: ["id"]
          },
        ]
      }
      assistido_vinculos: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          destino_id: string
          id: string
          observacoes: string | null
          orgao_execucao_id: string
          origem_id: string
          tipo: Database["public"]["Enums"]["vinculo_enum"]
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          destino_id: string
          id?: string
          observacoes?: string | null
          orgao_execucao_id: string
          origem_id: string
          tipo: Database["public"]["Enums"]["vinculo_enum"]
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          destino_id?: string
          id?: string
          observacoes?: string | null
          orgao_execucao_id?: string
          origem_id?: string
          tipo?: Database["public"]["Enums"]["vinculo_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "assistido_vinculos_destino_id_fkey"
            columns: ["destino_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistido_vinculos_destino_id_fkey"
            columns: ["destino_id"]
            isOneToOne: false
            referencedRelation: "v_assistidos_card"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistido_vinculos_orgao_execucao_id_fkey"
            columns: ["orgao_execucao_id"]
            isOneToOne: false
            referencedRelation: "orgaos_execucao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistido_vinculos_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistido_vinculos_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "v_assistidos_card"
            referencedColumns: ["id"]
          },
        ]
      }
      assistidos: {
        Row: {
          categoria:
            | Database["public"]["Enums"]["assistido_categoria_enum"]
            | null
          cpf: string | null
          created_at: string
          created_by: string | null
          data_nascimento: string
          deleted_at: string | null
          foto_path: string | null
          foto_url: string | null
          genero: string | null
          id: string
          nome_completo: string
          nome_mae: string | null
          nome_pai: string | null
          nome_social: string | null
          observacoes: string | null
          orgao_execucao_id: string
          prenome: string | null
          responsavel_user_id: string | null
          search_text: string | null
          sexo_registral: Database["public"]["Enums"]["sexo_registral_enum"]
          situacao_atual: Database["public"]["Enums"]["situacao_atual_enum"]
          sobrenome: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          categoria?:
            | Database["public"]["Enums"]["assistido_categoria_enum"]
            | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_nascimento: string
          deleted_at?: string | null
          foto_path?: string | null
          foto_url?: string | null
          genero?: string | null
          id?: string
          nome_completo: string
          nome_mae?: string | null
          nome_pai?: string | null
          nome_social?: string | null
          observacoes?: string | null
          orgao_execucao_id: string
          prenome?: string | null
          responsavel_user_id?: string | null
          search_text?: string | null
          sexo_registral?: Database["public"]["Enums"]["sexo_registral_enum"]
          situacao_atual?: Database["public"]["Enums"]["situacao_atual_enum"]
          sobrenome?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          categoria?:
            | Database["public"]["Enums"]["assistido_categoria_enum"]
            | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_nascimento?: string
          deleted_at?: string | null
          foto_path?: string | null
          foto_url?: string | null
          genero?: string | null
          id?: string
          nome_completo?: string
          nome_mae?: string | null
          nome_pai?: string | null
          nome_social?: string | null
          observacoes?: string | null
          orgao_execucao_id?: string
          prenome?: string | null
          responsavel_user_id?: string | null
          search_text?: string | null
          sexo_registral?: Database["public"]["Enums"]["sexo_registral_enum"]
          situacao_atual?: Database["public"]["Enums"]["situacao_atual_enum"]
          sobrenome?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistidos_orgao_execucao_id_fkey"
            columns: ["orgao_execucao_id"]
            isOneToOne: false
            referencedRelation: "orgaos_execucao"
            referencedColumns: ["id"]
          },
        ]
      }
      comarcas: {
        Row: {
          created_at: string
          id: string
          nome: string
          nome_normalizado: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          nome_normalizado: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          nome_normalizado?: string
          updated_at?: string
        }
        Relationships: []
      }
      orgao_comarcas: {
        Row: {
          comarca_id: string
          created_at: string
          created_by: string
          is_principal: boolean
          orgao_execucao_id: string
        }
        Insert: {
          comarca_id: string
          created_at?: string
          created_by: string
          is_principal?: boolean
          orgao_execucao_id: string
        }
        Update: {
          comarca_id?: string
          created_at?: string
          created_by?: string
          is_principal?: boolean
          orgao_execucao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orgao_comarcas_comarca_id_fkey"
            columns: ["comarca_id"]
            isOneToOne: false
            referencedRelation: "comarcas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orgao_comarcas_orgao_execucao_id_fkey"
            columns: ["orgao_execucao_id"]
            isOneToOne: false
            referencedRelation: "orgaos_execucao"
            referencedColumns: ["id"]
          },
        ]
      }
      orgaos_execucao: {
        Row: {
          comarca: string
          comarca_normalizada: string
          created_at: string
          created_by: string | null
          id: string
          nome: string
          nome_normalizado: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          comarca: string
          comarca_normalizada: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          nome_normalizado: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          comarca?: string
          comarca_normalizada?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          nome_normalizado?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      processo_assistidos: {
        Row: {
          assistido_id: string
          created_at: string
          created_by: string
          processo_id: string
        }
        Insert: {
          assistido_id: string
          created_at?: string
          created_by: string
          processo_id: string
        }
        Update: {
          assistido_id?: string
          created_at?: string
          created_by?: string
          processo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processo_assistidos_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "assistidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processo_assistidos_assistido_id_fkey"
            columns: ["assistido_id"]
            isOneToOne: false
            referencedRelation: "v_assistidos_card"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processo_assistidos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      processos: {
        Row: {
          created_at: string
          created_by: string
          data_inicio: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          numero_processo: string
          numero_processo_normalizado: string
          observacoes: string | null
          orgao_execucao_id: string
          status: Database["public"]["Enums"]["situacao_processo_enum"] | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          data_inicio: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          numero_processo: string
          numero_processo_normalizado: string
          observacoes?: string | null
          orgao_execucao_id: string
          status?: Database["public"]["Enums"]["situacao_processo_enum"] | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          data_inicio?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          numero_processo?: string
          numero_processo_normalizado?: string
          observacoes?: string | null
          orgao_execucao_id?: string
          status?: Database["public"]["Enums"]["situacao_processo_enum"] | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processos_orgao_execucao_id_fkey"
            columns: ["orgao_execucao_id"]
            isOneToOne: false
            referencedRelation: "orgaos_execucao"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          cargo: string | null
          created_at: string
          funcao_interna: string | null
          inativado_em: string | null
          matricula: string | null
          motivo_bloqueio: string | null
          nome_completo: string | null
          outra_funcao: string | null
          status: Database["public"]["Enums"]["profile_status"]
          suspenso_em: string | null
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          cargo?: string | null
          created_at?: string
          funcao_interna?: string | null
          inativado_em?: string | null
          matricula?: string | null
          motivo_bloqueio?: string | null
          nome_completo?: string | null
          outra_funcao?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          suspenso_em?: string | null
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          cargo?: string | null
          created_at?: string
          funcao_interna?: string | null
          inativado_em?: string | null
          matricula?: string | null
          motivo_bloqueio?: string | null
          nome_completo?: string | null
          outra_funcao?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          suspenso_em?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_assistidos_card: {
        Row: {
          acolhimento_ativo_id: string | null
          data_nascimento: string | null
          entidade_acolhimento: string | null
          faixa_etaria: string | null
          familiar_dpe: boolean | null
          foto_url: string | null
          genero: string | null
          id: string | null
          idade: number | null
          nome_completo: string | null
          nome_social: string | null
          orgao_execucao_id: string | null
          prazo_processo_mais_proximo: string | null
          prazo_providencia_mais_proximo: string | null
          processos_ativos: number | null
          providencias_pendentes: number | null
          proxima_reavaliacao: string | null
          responsavel_user_id: string | null
          search_text: string | null
          sexo_registral:
            | Database["public"]["Enums"]["sexo_registral_enum"]
            | null
          situacao_atual:
            | Database["public"]["Enums"]["situacao_atual_enum"]
            | null
          tempo_acolhimento_dias: number | null
          tipo_acolhimento:
            | Database["public"]["Enums"]["tipo_acolhimento_enum"]
            | null
          total_familiares: number | null
          total_irmaos: number | null
          updated_at: string | null
        }
        Insert: {
          acolhimento_ativo_id?: never
          data_nascimento?: string | null
          entidade_acolhimento?: never
          faixa_etaria?: never
          familiar_dpe?: never
          foto_url?: string | null
          genero?: string | null
          id?: string | null
          idade?: never
          nome_completo?: string | null
          nome_social?: string | null
          orgao_execucao_id?: string | null
          prazo_processo_mais_proximo?: never
          prazo_providencia_mais_proximo?: never
          processos_ativos?: never
          providencias_pendentes?: never
          proxima_reavaliacao?: never
          responsavel_user_id?: string | null
          search_text?: string | null
          sexo_registral?:
            | Database["public"]["Enums"]["sexo_registral_enum"]
            | null
          situacao_atual?:
            | Database["public"]["Enums"]["situacao_atual_enum"]
            | null
          tempo_acolhimento_dias?: never
          tipo_acolhimento?: never
          total_familiares?: never
          total_irmaos?: never
          updated_at?: string | null
        }
        Update: {
          acolhimento_ativo_id?: never
          data_nascimento?: string | null
          entidade_acolhimento?: never
          faixa_etaria?: never
          familiar_dpe?: never
          foto_url?: string | null
          genero?: string | null
          id?: string | null
          idade?: never
          nome_completo?: string | null
          nome_social?: string | null
          orgao_execucao_id?: string | null
          prazo_processo_mais_proximo?: never
          prazo_providencia_mais_proximo?: never
          processos_ativos?: never
          providencias_pendentes?: never
          proxima_reavaliacao?: never
          responsavel_user_id?: string | null
          search_text?: string | null
          sexo_registral?:
            | Database["public"]["Enums"]["sexo_registral_enum"]
            | null
          situacao_atual?:
            | Database["public"]["Enums"]["situacao_atual_enum"]
            | null
          tempo_acolhimento_dias?: never
          tipo_acolhimento?: never
          total_familiares?: never
          total_irmaos?: never
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assistidos_orgao_execucao_id_fkey"
            columns: ["orgao_execucao_id"]
            isOneToOne: false
            referencedRelation: "orgaos_execucao"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_add_comarca_to_orgao: {
        Args: {
          p_comarca_nome: string
          p_idempotency_key?: string
          p_is_principal?: boolean
          p_orgao_id: string
        }
        Returns: Json
      }
      admin_add_defensor_org_membership: {
        Args: {
          p_idempotency_key?: string
          p_orgao_id: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_assign_defensor_role: {
        Args: {
          p_idempotency_key?: string
          p_justificativa?: string
          p_matricula?: string
          p_orgao_execucao_id: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_create_orgao_execucao: {
        Args: { p_comarca: string; p_idempotency_key?: string; p_nome: string }
        Returns: Json
      }
      admin_detalhar_usuario: { Args: { p_user_id: string }; Returns: Json }
      admin_end_defensor_org_membership: {
        Args: {
          p_idempotency_key?: string
          p_membership_id: string
          p_motivo?: string
        }
        Returns: Json
      }
      admin_list_defensor_memberships: {
        Args: { p_user_id: string }
        Returns: Json
      }
      admin_listar_usuarios: {
        Args: { p_limit?: number }
        Returns: {
          ativo: boolean
          cargo: string
          created_at: string
          email: string
          email_confirmado: boolean
          funcao_interna: string
          matricula: string
          membership_id: string
          nome_completo: string
          orgao_comarca: string
          orgao_id: string
          orgao_nome: string
          outra_funcao: string
          role_atual: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["profile_status"]
          telefone: string
          updated_at: string
          user_id: string
          vinculado_em: string
        }[]
      }
      admin_update_orgao_execucao: {
        Args: { p_comarca: string; p_id: string; p_nome: string }
        Returns: Json
      }
      aprovar_solicitacao_acesso: {
        Args: {
          p_criar_novo?: boolean
          p_novo_orgao?: Json
          p_orgao_final_id: string
          p_request_id: string
          p_version: number
        }
        Returns: Json
      }
      atualizar_anotacoes_assistido: {
        Args: { p_assistido_id: string; p_observacoes: string }
        Returns: Json
      }
      atualizar_assistido_adulto: {
        Args: { p_assistido_id: string; p_payload: Json }
        Returns: Json
      }
      atualizar_assistido_crianca: {
        Args: { p_assistido_id: string; p_payload: Json }
        Returns: Json
      }
      atualizar_membro_equipe: {
        Args: {
          p_funcao_interna: string
          p_matricula: string
          p_nome_completo: string
          p_outra_funcao: string
          p_telefone: string
          p_user_id: string
        }
        Returns: Json
      }
      atualizar_workspace_meta: {
        Args: { p_icone?: string; p_nome: string; p_workspace_id: string }
        Returns: Json
      }
      bloquear_membro_equipe: {
        Args: { p_motivo: string; p_user_id: string }
        Returns: Json
      }
      buscar_assistidos: {
        Args: {
          p_filter?: Json
          p_limit?: number
          p_offset?: number
          p_orgao_id?: string
          p_text?: string
        }
        Returns: Json
      }
      buscar_assistidos_picker: {
        Args: {
          p_categoria?: Database["public"]["Enums"]["assistido_categoria_enum"]
          p_exclude?: string[]
          p_limit?: number
          p_text?: string
        }
        Returns: Json
      }
      buscar_orgaos_execucao: {
        Args: { p_limit?: number; p_termo?: string }
        Returns: Json
      }
      cadastrar_assistido_adulto: { Args: { p_payload: Json }; Returns: Json }
      cadastrar_assistido_crianca: { Args: { p_payload: Json }; Returns: Json }
      cadastrar_processo: { Args: { p_payload: Json }; Returns: Json }
      cancelar_convite_equipe: {
        Args: { p_invitation_id: string; p_motivo: string }
        Returns: Json
      }
      cancelar_solicitacao_acesso: {
        Args: { p_request_id: string }
        Returns: Json
      }
      completar_onboarding_equipe: {
        Args: { p_aceite_termos: boolean }
        Returns: Json
      }
      create_workspace_column: {
        Args: {
          p_color_token?: string
          p_custom_color?: string
          p_description?: string
          p_filter?: Json
          p_title: string
          p_workspace_id: string
        }
        Returns: Json
      }
      criar_convite_equipe: {
        Args: {
          p_email: string
          p_funcao_interna: string
          p_idempotency_key: string
          p_justificativa: string
          p_matricula: string
          p_nome_completo: string
          p_orgao_id: string
          p_outra_funcao: string
          p_telefone: string
        }
        Returns: Json
      }
      criar_workspace: {
        Args: { p_icone?: string; p_nome: string; p_orgao_id: string }
        Returns: Json
      }
      defensor_alterar_orgao_ativo: {
        Args: {
          p_expected_current_membership_id?: string
          p_new_orgao_id: string
        }
        Returns: Json
      }
      defensor_autovincular_orgao: {
        Args: { p_idempotency_key?: string; p_orgao_id: string }
        Returns: Json
      }
      definir_workspace_padrao: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      delete_workspace_column: { Args: { p_column_id: string }; Returns: Json }
      duplicar_workspace: {
        Args: { p_nome?: string; p_workspace_id: string }
        Returns: Json
      }
      duplicate_workspace_column: {
        Args: { p_column_id: string }
        Returns: Json
      }
      encerrar_vinculo_membro: {
        Args: { p_motivo: string; p_user_id: string }
        Returns: Json
      }
      ensure_default_workspace: { Args: { p_orgao_id?: string }; Returns: Json }
      excluir_workspace: { Args: { p_workspace_id: string }; Returns: Json }
      get_workspace_column_assistidos: {
        Args: { p_column_id: string; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      listar_convites_equipe: {
        Args: { p_orgao_id?: string }
        Returns: {
          created_at: string
          email: string
          expires_at: string
          funcao_interna: string
          id: string
          invited_by: string
          matricula: string
          nome_completo: string
          orgao_execucao_id: string
          outra_funcao: string
          resend_count: number
          sent_at: string
          status: Database["public"]["Enums"]["team_invitation_status"]
          telefone: string
        }[]
      }
      listar_equipe: {
        Args: { p_orgao_id?: string }
        Returns: {
          ativo: boolean
          email: string
          funcao_interna: string
          matricula: string
          membership_id: string
          nome_completo: string
          orgao_id: string
          outra_funcao: string
          status: Database["public"]["Enums"]["profile_status"]
          telefone: string
          ultimo_acesso: string
          user_id: string
          vinculado_em: string
        }[]
      }
      listar_orgaos_acessiveis: {
        Args: { p_cursor?: string; p_limit?: number; p_termo?: string }
        Returns: Json
      }
      listar_solicitacoes_acesso: {
        Args: {
          p_limit?: number
          p_status?: Database["public"]["Enums"]["access_request_status"]
        }
        Returns: {
          cargo: string
          correlation_id: string
          created_at: string
          id: string
          matricula: string
          nome_completo: string
          orgao_id: string
          orgao_nome: string
          proposta_novo_orgao_cidade: string
          proposta_novo_orgao_comarca: string
          proposta_novo_orgao_nome: string
          proposta_novo_orgao_sigla: string
          status: Database["public"]["Enums"]["access_request_status"]
          telefone: string
          user_id: string
          version: number
        }[]
      }
      listar_workspace: {
        Args: { p_orgao_id?: string; p_workspace_id?: string }
        Returns: Json
      }
      listar_workspaces_orgao: { Args: { p_orgao_id?: string }; Returns: Json }
      meu_convite_pendente: { Args: never; Returns: Json }
      meu_estado_institucional: { Args: never; Returns: Json }
      promover_admin_tecnico: {
        Args: { p_justificativa: string; p_target_user_id: string }
        Returns: Json
      }
      reativar_membro_equipe: {
        Args: { p_motivo: string; p_user_id: string }
        Returns: Json
      }
      reenviar_convite_equipe: {
        Args: { p_invitation_id: string }
        Returns: Json
      }
      registrar_acesso_orgao_externo: {
        Args: { p_finalidade?: string; p_modulo: string; p_orgao_id: string }
        Returns: Json
      }
      registrar_break_glass: {
        Args: {
          p_chamado: string
          p_justificativa: string
          p_orgao_id: string
          p_prazo_minutos?: number
        }
        Returns: Json
      }
      registrar_envio_convite: {
        Args: {
          p_auth_user_id: string
          p_failure_code: string
          p_invitation_id: string
          p_status: Database["public"]["Enums"]["team_invitation_status"]
        }
        Returns: undefined
      }
      rejeitar_solicitacao_acesso: {
        Args: { p_motivo: string; p_request_id: string; p_version: number }
        Returns: Json
      }
      remover_foto_assistido: {
        Args: { p_assistido_id: string }
        Returns: Json
      }
      renomear_workspace: {
        Args: { p_nome: string; p_workspace_id: string }
        Returns: Json
      }
      reordenar_workspaces: {
        Args: { p_ordered_ids: string[]; p_orgao_id: string }
        Returns: Json
      }
      reorder_workspace_columns: {
        Args: { p_ordered_ids: string[]; p_workspace_id: string }
        Returns: Json
      }
      reset_workspace_to_default: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      selecionar_contexto_orgao: {
        Args: {
          p_expected_version?: number
          p_idempotency_key?: string
          p_orgao_id: string
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submeter_solicitacao_acesso: {
        Args: {
          p_aceite_termos: boolean
          p_cargo: string
          p_matricula: string
          p_nome_completo: string
          p_novo_orgao: Json
          p_orgao_id: string
          p_telefone: string
        }
        Returns: Json
      }
      tem_papel: {
        Args: { required_role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      update_workspace_column: {
        Args: {
          p_color_token?: string
          p_column_id: string
          p_custom_color?: string
          p_description?: string
          p_filter?: Json
          p_title: string
          p_version: number
        }
        Returns: Json
      }
      vincular_foto_assistido: {
        Args: { p_assistido_id: string; p_foto_path: string }
        Returns: Json
      }
    }
    Enums: {
      access_request_status:
        | "pendente"
        | "em_analise"
        | "aprovada"
        | "rejeitada"
        | "cancelada"
      app_role:
        | "admin_tecnico"
        | "admin_institucional"
        | "defensor_publico"
        | "membro_equipe"
      assistido_categoria_enum: "crianca_adolescente" | "adulto"
      audit_result: "sucesso" | "falha" | "negado"
      parentesco_enum:
        | "mae"
        | "pai"
        | "irmao"
        | "irma"
        | "avo"
        | "ava"
        | "tio"
        | "tia"
        | "padrasto"
        | "madrasta"
        | "responsavel_legal"
        | "outro"
      prioridade_enum: "baixa" | "media" | "alta" | "urgente"
      profile_status:
        | "aguardando_dados"
        | "aguardando_aprovacao"
        | "ativo"
        | "suspenso"
        | "inativo"
      sexo_registral_enum: "feminino" | "masculino" | "nao_informado"
      situacao_atual_enum:
        | "familia_natural"
        | "familia_extensa"
        | "familia_substituta"
        | "acolhimento_institucional"
        | "acolhimento_familiar"
        | "guarda_provisoria"
        | "adocao_acompanhamento"
        | "situacao_rua"
        | "nao_informado"
        | "outro"
      situacao_processo_enum: "ativo" | "suspenso" | "arquivado" | "concluido"
      team_invitation_status:
        | "preparando"
        | "enviado"
        | "aceito"
        | "expirado"
        | "cancelado"
        | "falhou"
      tipo_acolhimento_enum: "institucional" | "familiar"
      vinculo_enum: "pai" | "mae" | "familia_extensa" | "irmao"
      workspace_color_enum:
        | "neutral"
        | "green"
        | "blue"
        | "amber"
        | "burgundy"
        | "purple"
        | "slate"
        | "rose"
      workspace_context_enum: "orgao" | "todos_orgaos"
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
      access_request_status: [
        "pendente",
        "em_analise",
        "aprovada",
        "rejeitada",
        "cancelada",
      ],
      app_role: [
        "admin_tecnico",
        "admin_institucional",
        "defensor_publico",
        "membro_equipe",
      ],
      assistido_categoria_enum: ["crianca_adolescente", "adulto"],
      audit_result: ["sucesso", "falha", "negado"],
      parentesco_enum: [
        "mae",
        "pai",
        "irmao",
        "irma",
        "avo",
        "ava",
        "tio",
        "tia",
        "padrasto",
        "madrasta",
        "responsavel_legal",
        "outro",
      ],
      prioridade_enum: ["baixa", "media", "alta", "urgente"],
      profile_status: [
        "aguardando_dados",
        "aguardando_aprovacao",
        "ativo",
        "suspenso",
        "inativo",
      ],
      sexo_registral_enum: ["feminino", "masculino", "nao_informado"],
      situacao_atual_enum: [
        "familia_natural",
        "familia_extensa",
        "familia_substituta",
        "acolhimento_institucional",
        "acolhimento_familiar",
        "guarda_provisoria",
        "adocao_acompanhamento",
        "situacao_rua",
        "nao_informado",
        "outro",
      ],
      situacao_processo_enum: ["ativo", "suspenso", "arquivado", "concluido"],
      team_invitation_status: [
        "preparando",
        "enviado",
        "aceito",
        "expirado",
        "cancelado",
        "falhou",
      ],
      tipo_acolhimento_enum: ["institucional", "familiar"],
      vinculo_enum: ["pai", "mae", "familia_extensa", "irmao"],
      workspace_color_enum: [
        "neutral",
        "green",
        "blue",
        "amber",
        "burgundy",
        "purple",
        "slate",
        "rose",
      ],
      workspace_context_enum: ["orgao", "todos_orgaos"],
    },
  },
} as const
