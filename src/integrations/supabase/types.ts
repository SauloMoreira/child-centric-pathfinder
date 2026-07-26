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
      orgaos_execucao: {
        Row: {
          ativo: boolean
          cidade: string | null
          comarca: string | null
          created_at: string
          criado_por: string | null
          id: string
          nome: string
          sigla: string
          uf: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          comarca?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          nome: string
          sigla: string
          uf?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          comarca?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          nome?: string
          sigla?: string
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          cargo: string | null
          created_at: string
          inativado_em: string | null
          matricula: string | null
          motivo_bloqueio: string | null
          nome_completo: string | null
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
          inativado_em?: string | null
          matricula?: string | null
          motivo_bloqueio?: string | null
          nome_completo?: string | null
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
          inativado_em?: string | null
          matricula?: string | null
          motivo_bloqueio?: string | null
          nome_completo?: string | null
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
      cancelar_solicitacao_acesso: {
        Args: { p_request_id: string }
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
      meu_estado_institucional: { Args: never; Returns: Json }
      promover_admin_tecnico: {
        Args: { p_justificativa: string; p_target_user_id: string }
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
      rejeitar_solicitacao_acesso: {
        Args: { p_motivo: string; p_request_id: string; p_version: number }
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
      profile_status:
        | "aguardando_dados"
        | "aguardando_aprovacao"
        | "ativo"
        | "suspenso"
        | "inativo"
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
      profile_status: [
        "aguardando_dados",
        "aguardando_aprovacao",
        "ativo",
        "suspenso",
        "inativo",
      ],
    },
  },
} as const
