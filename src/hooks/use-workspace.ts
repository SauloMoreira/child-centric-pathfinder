import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FilterDefinition } from "@/lib/workspace/filters";

export type WorkspaceColumn = {
  id: string;
  title: string;
  description: string | null;
  color_token: string;
  custom_color: string | null;
  filter_definition: FilterDefinition;
  position: number;
  is_base_column: boolean;
  version: number;
  updated_at: string;
};

export type WorkspaceData = {
  workspace_id: string | null;
  context: "orgao" | "todos_orgaos";
  orgao_id: string | null;
  columns: WorkspaceColumn[];
};

export type AssistidoCard = {
  id: string;
  nome_completo: string;
  nome_social: string | null;
  idade: number;
  faixa_etaria: "crianca" | "adolescente";
  sexo_registral: string;
  foto_url: string | null;
  situacao_atual: string;
  orgao_execucao_id: string;
  orgao_nome?: string | null;
  orgao_comarca?: string | null;
  entidade_acolhimento: string | null;
  tipo_acolhimento: string | null;
  tempo_acolhimento_dias: number | null;
  proxima_reavaliacao: string | null;
  processos_ativos: number;
  prazo_processo_mais_proximo: string | null;
  providencias_pendentes: number;
  prazo_providencia_mais_proximo: string | null;
  total_familiares: number;
  total_irmaos: number;
  familiar_dpe: boolean | null;
  updated_at: string;
};

async function ensureWorkspace(context: "orgao" | "todos_orgaos", orgaoId: string | null) {
  const { error } = await supabase.rpc("ensure_default_workspace", {
    p_context: context,
    p_orgao_id: orgaoId,
  });
  if (error) throw error;
}

export function useWorkspace(context: "orgao" | "todos_orgaos" = "orgao", orgaoId: string | null = null) {
  const qc = useQueryClient();
  return useQuery<WorkspaceData>({
    queryKey: ["workspace", context, orgaoId],
    queryFn: async () => {
      await ensureWorkspace(context, orgaoId);
      const { data, error } = await supabase.rpc("listar_workspace", {
        p_context: context,
        p_orgao_id: orgaoId,
      });
      if (error) throw error;
      const result = data as unknown as WorkspaceData;
      // Aquece cache do primeiro carregamento
      qc.setQueryData(["workspace", context, orgaoId], result);
      return result;
    },
    staleTime: 30_000,
  });
}

export function useColumnAssistidos(columnId: string | null, limit = 20) {
  return useQuery<{ items: AssistidoCard[]; total: number }>({
    queryKey: ["workspace-column", columnId, limit],
    queryFn: async () => {
      if (!columnId) return { items: [], total: 0 };
      const { data, error } = await supabase.rpc("get_workspace_column_assistidos", {
        p_column_id: columnId,
        p_limit: limit,
        p_offset: 0,
      });
      if (error) throw error;
      const d = data as unknown as { items: AssistidoCard[]; total: number };
      return { items: d.items ?? [], total: Number(d.total ?? 0) };
    },
    enabled: !!columnId,
    staleTime: 15_000,
  });
}

export function useBuscaAssistidos(text: string, filter: FilterDefinition | null, orgaoId: string | null, enabled: boolean) {
  return useQuery<{ items: AssistidoCard[]; total: number }>({
    queryKey: ["workspace-search", text, filter, orgaoId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("buscar_assistidos", {
        p_text: text || null,
        p_filter: (filter ?? { version: 1, text: null, conditions: [] }) as unknown as never,
        p_orgao_id: orgaoId,
        p_limit: 20,
        p_offset: 0,
      });
      if (error) throw error;
      const d = data as unknown as { items: AssistidoCard[]; total: number };
      return { items: d.items ?? [], total: Number(d.total ?? 0) };
    },
    enabled,
    staleTime: 5_000,
  });
}

type ColumnFormPayload = {
  title: string;
  description: string | null;
  color_token: string;
  custom_color: string | null;
  filter: FilterDefinition;
};

export function useWorkspaceMutations(context: "orgao" | "todos_orgaos", orgaoId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["workspace", context, orgaoId] });
  const invalidateColumns = () => qc.invalidateQueries({ queryKey: ["workspace-column"] });

  const create = useMutation({
    mutationFn: async (p: ColumnFormPayload & { workspace_id: string }) => {
      const { error } = await supabase.rpc("create_workspace_column", {
        p_workspace_id: p.workspace_id,
        p_title: p.title,
        p_description: p.description,
        p_color_token: p.color_token,
        p_custom_color: p.custom_color,
        p_filter: p.filter as unknown as never,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      invalidateColumns();
    },
  });

  const update = useMutation({
    mutationFn: async (p: ColumnFormPayload & { column_id: string; version: number }) => {
      const { error } = await supabase.rpc("update_workspace_column", {
        p_column_id: p.column_id,
        p_version: p.version,
        p_title: p.title,
        p_description: p.description,
        p_color_token: p.color_token,
        p_custom_color: p.custom_color,
        p_filter: p.filter as unknown as never,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      invalidateColumns();
    },
  });

  const remove = useMutation({
    mutationFn: async (columnId: string) => {
      const { error } = await supabase.rpc("delete_workspace_column", { p_column_id: columnId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const duplicate = useMutation({
    mutationFn: async (columnId: string) => {
      const { error } = await supabase.rpc("duplicate_workspace_column", { p_column_id: columnId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      invalidateColumns();
    },
  });

  const reorder = useMutation({
    mutationFn: async (p: { workspace_id: string; ordered_ids: string[] }) => {
      const { error } = await supabase.rpc("reorder_workspace_columns", {
        p_workspace_id: p.workspace_id,
        p_ordered_ids: p.ordered_ids,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reset = useMutation({
    mutationFn: async (workspaceId: string) => {
      const { error } = await supabase.rpc("reset_workspace_to_default", {
        p_workspace_id: workspaceId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      invalidateColumns();
    },
  });

  return { create, update, remove, duplicate, reorder, reset };
}
