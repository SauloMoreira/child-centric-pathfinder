import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EstadoInstitucional = {
  user_id: string;
  profile: {
    nome_completo: string | null;
    matricula: string | null;
    cargo: string | null;
    telefone: string | null;
    status:
      | "aguardando_dados"
      | "aguardando_aprovacao"
      | "ativo"
      | "suspenso"
      | "inativo";
    ativo: boolean;
    created_at: string;
    updated_at: string;
  } | null;
  roles: Array<
    | "admin_tecnico"
    | "admin_institucional"
    | "defensor_publico"
    | "membro_equipe"
  >;
  aal2: boolean;
  orgao_ativo: { id: string; nome: string; comarca: string | null } | null;
  membership: { id: string; dataInicio: string; status: "ativo" | "encerrado" } | null;
  comarcas: Array<{ id: string; nome: string; principal: boolean }>;
  solicitacao_aberta: {
    id: string;
    status: "pendente" | "em_analise";
    version: number;
    created_at: string;
  } | null;
  is_admin_tecnico?: boolean;
};

export function useEstadoInstitucional() {
  return useQuery<EstadoInstitucional>({
    queryKey: ["estado-institucional"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("meu_estado_institucional");
      if (error) throw error;
      return data as EstadoInstitucional;
    },
    staleTime: 30_000,
  });
}

export function isAdminTecnico(estado?: EstadoInstitucional) {
  return !!estado?.roles.includes("admin_tecnico");
}
export function isAdmin(estado?: EstadoInstitucional) {
  // Reconhece Administrador Institucional OU Administrador Técnico como
  // administrador em áreas institucionais compartilhadas (solicitações, órgãos).
  return (
    !!estado?.roles.includes("admin_institucional") ||
    !!estado?.roles.includes("admin_tecnico")
  );
}
export function isAdminInstitucionalStrict(estado?: EstadoInstitucional) {
  return !!estado?.roles.includes("admin_institucional");
}
export function isDefensor(estado?: EstadoInstitucional) {
  return !!estado?.roles.includes("defensor_publico");
}
export function isMembroEquipe(estado?: EstadoInstitucional) {
  return !!estado?.roles.includes("membro_equipe");
}
export function isAtivo(estado?: EstadoInstitucional) {
  // Administrador Técnico não é obrigado a manter vínculo com órgão; profile ativo basta.
  return estado?.profile?.status === "ativo" && estado.profile.ativo;
}

