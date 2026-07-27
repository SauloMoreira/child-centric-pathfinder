import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OrgaoDisponivel = {
  orgaoId: string;
  membershipId: string | null;
  nome: string;
  comarca: string | null;
  dataInicio: string | null;
  selecionado: boolean;
};

export type ContextoOrgao = {
  orgaoId: string;
  nome: string;
  comarca: string | null;
  comarcas: Array<{ id: string; nome: string; principal: boolean }>;
};

export type EstadoInstitucional = {
  user_id: string;
  papel: "admin_tecnico" | "admin_institucional" | "defensor_publico" | "membro_equipe" | null;
  profile: {
    nome_completo: string | null;
    matricula: string | null;
    cargo: string | null;
    telefone: string | null;
    status: "aguardando_dados" | "aguardando_aprovacao" | "ativo" | "suspenso" | "inativo";
    ativo: boolean;
    created_at: string;
    updated_at: string;
  } | null;
  roles: Array<"admin_tecnico" | "admin_institucional" | "defensor_publico" | "membro_equipe">;
  aal2: boolean;
  acessoGlobal: boolean;
  contextoAtual: ContextoOrgao | null;
  contextVersion: number | null;
  orgaosDisponiveis: OrgaoDisponivel[] | null;
  /** @deprecated Use contextoAtual */
  orgao_ativo: { id: string; nome: string; comarca: string | null } | null;
  /** @deprecated */
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
  return !!estado?.roles?.includes("admin_tecnico");
}
export function isAdmin(estado?: EstadoInstitucional) {
  return (
    !!estado?.roles?.includes("admin_institucional") || !!estado?.roles?.includes("admin_tecnico")
  );
}
export function isAdminInstitucionalStrict(estado?: EstadoInstitucional) {
  return !!estado?.roles?.includes("admin_institucional");
}
export function isDefensor(estado?: EstadoInstitucional) {
  return !!estado?.roles?.includes("defensor_publico");
}
export function isMembroEquipe(estado?: EstadoInstitucional) {
  return !!estado?.roles?.includes("membro_equipe");
}
export function isAtivo(estado?: EstadoInstitucional) {
  return estado?.profile?.status === "ativo" && estado.profile.ativo;
}
