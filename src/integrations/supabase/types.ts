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
      atendimento_ia_contextos: {
        Row: {
          created_at: string
          id: string
          nome: string
          texto: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          texto: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          texto?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      content_categories: {
        Row: {
          cor: string | null
          created_at: string
          created_by: string | null
          id: string
          nome: string
          nome_normalizado: string
          order_position: number
          updated_at: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          nome_normalizado: string
          order_position?: number
          updated_at?: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          nome_normalizado?: string
          order_position?: number
          updated_at?: string
        }
        Relationships: []
      }
      content_item_categories: {
        Row: {
          category_id: string
          created_at: string
          item_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          item_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_item_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "content_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_item_categories_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          category_id: string | null
          created_at: string
          current_published_version_id: string | null
          current_version_id: string | null
          deleted_at: string | null
          id: string
          kind: Database["public"]["Enums"]["content_kind"]
          optimistic_version: number
          orgao_id: string | null
          owner_user_id: string
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["content_visibility"]
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          current_published_version_id?: string | null
          current_version_id?: string | null
          deleted_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["content_kind"]
          optimistic_version?: number
          orgao_id?: string | null
          owner_user_id: string
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["content_visibility"]
        }
        Update: {
          category_id?: string | null
          created_at?: string
          current_published_version_id?: string | null
          current_version_id?: string | null
          deleted_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["content_kind"]
          optimistic_version?: number
          orgao_id?: string | null
          owner_user_id?: string
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["content_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "content_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "content_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_current_pub_version_fk"
            columns: ["current_published_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_orgao_id_fkey"
            columns: ["orgao_id"]
            isOneToOne: false
            referencedRelation: "orgaos_execucao"
            referencedColumns: ["id"]
          },
        ]
      }
      content_versions: {
        Row: {
          body_json: Json
          body_text: string
          created_at: string
          created_by: string
          form_schema: Json | null
          id: string
          is_published: boolean
          item_id: string
          orientacao: string | null
          orientacao_nivel: string
          published_at: string | null
          title: string
          version_number: number
        }
        Insert: {
          body_json: Json
          body_text?: string
          created_at?: string
          created_by: string
          form_schema?: Json | null
          id?: string
          is_published?: boolean
          item_id: string
          orientacao?: string | null
          orientacao_nivel?: string
          published_at?: string | null
          title: string
          version_number: number
        }
        Update: {
          body_json?: Json
          body_text?: string
          created_at?: string
          created_by?: string
          form_schema?: Json | null
          id?: string
          is_published?: boolean
          item_id?: string
          orientacao?: string | null
          orientacao_nivel?: string
          published_at?: string | null
          title?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_versions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      defensor_context: {
        Row: {
          defensor_user_id: string
          orgao_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          defensor_user_id: string
          orgao_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          defensor_user_id?: string
          orgao_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "defensor_context_orgao_id_fkey"
            columns: ["orgao_id"]
            isOneToOne: false
            referencedRelation: "orgaos_execucao"
            referencedColumns: ["id"]
          },
        ]
      }
      defensor_workspace_cards: {
        Row: {
          column_id: string
          created_at: string
          id: string
          item_id: string
          order_position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          column_id: string
          created_at?: string
          id?: string
          item_id: string
          order_position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          column_id?: string
          created_at?: string
          id?: string
          item_id?: string
          order_position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "defensor_workspace_cards_column_ws_fk"
            columns: ["column_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "defensor_workspace_columns"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "defensor_workspace_cards_item_fk"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defensor_workspace_cards_workspace_fk"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "defensor_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      defensor_workspace_columns: {
        Row: {
          cor: string | null
          cor_token: Database["public"]["Enums"]["workspace_color_enum"]
          created_at: string
          descricao: string | null
          id: string
          nome: string
          order_position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cor?: string | null
          cor_token?: Database["public"]["Enums"]["workspace_color_enum"]
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          order_position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cor?: string | null
          cor_token?: Database["public"]["Enums"]["workspace_color_enum"]
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          order_position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "defensor_workspace_columns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "defensor_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      defensor_workspaces: {
        Row: {
          archived_at: string | null
          created_at: string
          defensor_user_id: string
          icone: string | null
          id: string
          nome: string
          nome_normalizado: string | null
          optimistic_version: number
          order_position: number
          orgao_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          defensor_user_id: string
          icone?: string | null
          id?: string
          nome: string
          nome_normalizado?: string | null
          optimistic_version?: number
          order_position?: number
          orgao_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          defensor_user_id?: string
          icone?: string | null
          id?: string
          nome?: string
          nome_normalizado?: string | null
          optimistic_version?: number
          order_position?: number
          orgao_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "defensor_workspaces_orgao_id_fkey"
            columns: ["orgao_id"]
            isOneToOne: false
            referencedRelation: "orgaos_execucao"
            referencedColumns: ["id"]
          },
        ]
      }
      member_defensor_access_requests: {
        Row: {
          correlation_id: string
          created_at: string
          decision_reason: string | null
          defensor_user_id: string
          id: string
          idempotency_key: string | null
          member_user_id: string
          message: string | null
          optimistic_version: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          decision_reason?: string | null
          defensor_user_id: string
          id?: string
          idempotency_key?: string | null
          member_user_id: string
          message?: string | null
          optimistic_version?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          decision_reason?: string | null
          defensor_user_id?: string
          id?: string
          idempotency_key?: string | null
          member_user_id?: string
          message?: string | null
          optimistic_version?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      member_defensor_bonds: {
        Row: {
          created_at: string
          created_by: string
          defensor_user_id: string
          ended_at: string | null
          ended_by: string | null
          id: string
          member_user_id: string
          optimistic_version: number
          orgao_id: string | null
          status: Database["public"]["Enums"]["member_defensor_bond_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          defensor_user_id: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          member_user_id: string
          optimistic_version?: number
          orgao_id?: string | null
          status?: Database["public"]["Enums"]["member_defensor_bond_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          defensor_user_id?: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          member_user_id?: string
          optimistic_version?: number
          orgao_id?: string | null
          status?: Database["public"]["Enums"]["member_defensor_bond_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_defensor_bonds_orgao_id_fkey"
            columns: ["orgao_id"]
            isOneToOne: false
            referencedRelation: "orgaos_execucao"
            referencedColumns: ["id"]
          },
        ]
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
      [_ in never]: never
    }
    Functions: {
      adicionar_card_workspace: {
        Args: {
          p_column_id: string
          p_expected_workspace_version: number
          p_idempotency_key: string
          p_item_id: string
        }
        Returns: Json
      }
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
      admin_criar_categoria_biblioteca: {
        Args: { p_nome: string }
        Returns: string
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
      admin_excluir_categoria_biblioteca: {
        Args: { p_category_id: string }
        Returns: undefined
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
      admin_renomear_categoria_biblioteca: {
        Args: { p_category_id: string; p_nome: string }
        Returns: undefined
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
      aprovar_solicitacao_acesso_defensor: {
        Args: {
          p_expected_version: number
          p_idempotency_key?: string
          p_request_id: string
        }
        Returns: Json
      }
      arquivar_item: {
        Args: {
          p_expected_version: number
          p_idempotency_key: string
          p_item_id: string
        }
        Returns: Json
      }
      arquivar_painel: {
        Args: {
          p_expected_version: number
          p_idempotency_key: string
          p_panel_id: string
        }
        Returns: Json
      }
      atualizar_atendimento: {
        Args: {
          p_category_ids?: string[]
          p_descricao: string
          p_expected_version: number
          p_form_schema: Json
          p_idempotency_key: string
          p_item_id: string
          p_titulo: string
        }
        Returns: Json
      }
      atualizar_coluna_workspace: {
        Args: {
          p_column_id: string
          p_cor_custom?: string
          p_cor_token?: Database["public"]["Enums"]["workspace_color_enum"]
          p_descricao?: string
          p_expected_workspace_version: number
          p_idempotency_key: string
          p_nome: string
        }
        Returns: number
      }
      atualizar_cota: {
        Args: {
          p_body_json: Json
          p_body_text: string
          p_category_ids?: string[]
          p_expected_version: number
          p_idempotency_key: string
          p_item_id: string
          p_orientacao?: string
          p_orientacao_nivel?: string
          p_titulo: string
        }
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
      atualizar_rascunho: {
        Args: {
          p_body_json: Json
          p_body_text: string
          p_expected_version: number
          p_form_schema?: Json
          p_idempotency_key: string
          p_item_id: string
          p_title: string
        }
        Returns: Json
      }
      bloquear_membro_equipe: {
        Args: { p_motivo: string; p_user_id: string }
        Returns: Json
      }
      buscar_defensores_para_solicitacao: {
        Args: { p_termo?: string }
        Returns: Json
      }
      buscar_orgaos_execucao: {
        Args: { p_limit?: number; p_termo?: string }
        Returns: Json
      }
      buscar_usuarios_membro_equipe: {
        Args: { p_termo: string }
        Returns: Json
      }
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
      criar_atendimento: {
        Args: {
          p_category_ids?: string[]
          p_descricao: string
          p_form_schema: Json
          p_titulo: string
        }
        Returns: Json
      }
      criar_coluna_workspace: {
        Args: {
          p_cor_custom?: string
          p_cor_token?: Database["public"]["Enums"]["workspace_color_enum"]
          p_descricao?: string
          p_expected_workspace_version: number
          p_idempotency_key: string
          p_nome: string
          p_workspace_id: string
        }
        Returns: Json
      }
      criar_content_item: {
        Args: {
          p_category_id?: string
          p_kind: Database["public"]["Enums"]["content_kind"]
          p_title: string
          p_visibility?: Database["public"]["Enums"]["content_visibility"]
        }
        Returns: string
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
      criar_cota: {
        Args: {
          p_body_json: Json
          p_body_text: string
          p_category_ids?: string[]
          p_orientacao?: string
          p_orientacao_nivel?: string
          p_titulo: string
        }
        Returns: Json
      }
      criar_painel: {
        Args: {
          p_defensor_user_id: string
          p_expected_count?: number
          p_icone?: string
          p_idempotency_key?: string
          p_nome: string
        }
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
      encerrar_member_defensor_bond: {
        Args: {
          p_bond_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_reason: string
        }
        Returns: Json
      }
      encerrar_vinculo_membro: {
        Args: { p_motivo: string; p_user_id: string }
        Returns: Json
      }
      ensure_defensor_work_area: {
        Args: { p_defensor_user_id: string; p_idempotency_key?: string }
        Returns: Json
      }
      excluir_atendimento: {
        Args: {
          p_expected_version: number
          p_idempotency_key: string
          p_item_id: string
        }
        Returns: Json
      }
      excluir_coluna_workspace: {
        Args: {
          p_column_id: string
          p_destination_column_id: string
          p_expected_workspace_version: number
          p_idempotency_key: string
        }
        Returns: number
      }
      excluir_contexto_atendimento_ia: {
        Args: { p_context_id: string }
        Returns: undefined
      }
      excluir_cota: {
        Args: {
          p_expected_version: number
          p_idempotency_key: string
          p_item_id: string
        }
        Returns: Json
      }
      listar_area_trabalho_defensor: {
        Args: { p_defensor_user_id: string }
        Returns: Json
      }
      listar_biblioteca: {
        Args: {
          p_apenas_meus?: boolean
          p_category_id?: string
          p_kind?: Database["public"]["Enums"]["content_kind"]
          p_limit?: number
          p_offset?: number
          p_query?: string
        }
        Returns: {
          categoria_id: string
          categoria_nome: string
          categorias: Json
          id: string
          kind: Database["public"]["Enums"]["content_kind"]
          owner_user_id: string
          status: Database["public"]["Enums"]["content_status"]
          titulo: string
          updated_at: string
          visibility: Database["public"]["Enums"]["content_visibility"]
        }[]
      }
      listar_categorias_biblioteca: {
        Args: never
        Returns: {
          cor: string
          id: string
          nome: string
          order_position: number
        }[]
      }
      listar_contextos_atendimento_ia: {
        Args: never
        Returns: {
          id: string
          nome: string
          texto: string
        }[]
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
      listar_defensores_disponiveis_contexto: { Args: never; Returns: Json }
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
      listar_membros_do_defensor: {
        Args: { p_defensor_user_id?: string }
        Returns: Json
      }
      listar_minhas_solicitacoes_defensor: { Args: never; Returns: Json }
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
      listar_solicitacoes_defensor_pendentes: { Args: never; Returns: Json }
      listar_versoes_item: {
        Args: { p_item_id: string }
        Returns: {
          created_at: string
          created_by: string
          id: string
          is_current: boolean
          titulo: string
          version_number: number
        }[]
      }
      listar_workspace_completo: { Args: { p_panel_id: string }; Returns: Json }
      meu_convite_pendente: { Args: never; Returns: Json }
      meu_estado_institucional: { Args: never; Returns: Json }
      mover_card_workspace: {
        Args: {
          p_card_id: string
          p_expected_workspace_version: number
          p_idempotency_key: string
          p_new_position: number
          p_target_column_id: string
        }
        Returns: number
      }
      mover_coluna_workspace: {
        Args: {
          p_column_id: string
          p_direction: string
          p_expected_workspace_version: number
          p_idempotency_key: string
        }
        Returns: number
      }
      obter_atendimento_detalhe: { Args: { p_item_id: string }; Returns: Json }
      obter_cota_detalhe: { Args: { p_item_id: string }; Returns: Json }
      obter_item_biblioteca: {
        Args: { p_item_id: string }
        Returns: {
          body_json: Json
          categoria_id: string
          categoria_nome: string
          categorias: Json
          current_published_version_id: string
          current_version_id: string
          form_schema: Json
          id: string
          kind: Database["public"]["Enums"]["content_kind"]
          optimistic_version: number
          owner_user_id: string
          status: Database["public"]["Enums"]["content_status"]
          titulo: string
          updated_at: string
          version_number: number
          visibility: Database["public"]["Enums"]["content_visibility"]
        }[]
      }
      promover_admin_tecnico: {
        Args: { p_justificativa: string; p_target_user_id: string }
        Returns: Json
      }
      publicar_versao: {
        Args: {
          p_expected_version: number
          p_idempotency_key: string
          p_item_id: string
          p_visibility: Database["public"]["Enums"]["content_visibility"]
        }
        Returns: Json
      }
      reativar_membro_equipe: {
        Args: { p_motivo: string; p_user_id: string }
        Returns: Json
      }
      recusar_solicitacao_acesso_defensor: {
        Args: {
          p_expected_version: number
          p_idempotency_key?: string
          p_reason?: string
          p_request_id: string
        }
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
      remover_card_workspace: {
        Args: {
          p_card_id: string
          p_expected_workspace_version: number
          p_idempotency_key: string
        }
        Returns: number
      }
      renomear_painel: {
        Args: {
          p_expected_version: number
          p_icone: string
          p_idempotency_key: string
          p_nome: string
          p_panel_id: string
        }
        Returns: Json
      }
      reordenar_colunas_workspace: {
        Args: {
          p_expected_workspace_version: number
          p_idempotency_key: string
          p_ordered_column_ids: string[]
          p_workspace_id: string
        }
        Returns: number
      }
      reordenar_paineis_defensor: {
        Args: {
          p_defensor_user_id: string
          p_idempotency_key: string
          p_items: Json
        }
        Returns: Json
      }
      salvar_contexto_atendimento_ia: {
        Args: { p_nome: string; p_texto: string }
        Returns: string
      }
      selecionar_contexto_defensor: {
        Args: { p_defensor_user_id: string; p_idempotency_key: string }
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
      solicitar_acesso_defensor: {
        Args: {
          p_defensor_user_id: string
          p_idempotency_key?: string
          p_message?: string
        }
        Returns: Json
      }
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
      tem_papel_usuario: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: boolean
      }
      vincular_membro_defensor: {
        Args: { p_idempotency_key: string; p_member_user_id: string }
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
      audit_result: "sucesso" | "falha" | "negado"
      content_kind: "atendimento" | "cota"
      content_status: "rascunho" | "publicado" | "arquivado"
      content_visibility: "privado" | "orgao" | "institucional" | "equipe"
      member_defensor_bond_status: "ativo" | "encerrado"
      profile_status:
        | "aguardando_dados"
        | "aguardando_aprovacao"
        | "ativo"
        | "suspenso"
        | "inativo"
      team_invitation_status:
        | "preparando"
        | "enviado"
        | "aceito"
        | "expirado"
        | "cancelado"
        | "falhou"
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
      audit_result: ["sucesso", "falha", "negado"],
      content_kind: ["atendimento", "cota"],
      content_status: ["rascunho", "publicado", "arquivado"],
      content_visibility: ["privado", "orgao", "institucional", "equipe"],
      member_defensor_bond_status: ["ativo", "encerrado"],
      profile_status: [
        "aguardando_dados",
        "aguardando_aprovacao",
        "ativo",
        "suspenso",
        "inativo",
      ],
      team_invitation_status: [
        "preparando",
        "enviado",
        "aceito",
        "expirado",
        "cancelado",
        "falhou",
      ],
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
