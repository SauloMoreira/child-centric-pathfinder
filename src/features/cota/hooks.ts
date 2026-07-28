// Hooks de dados para o recurso Cota — modelo de texto reutilizável
// (negrito/itálico/sublinhado) criado por um Defensor Público para uso da
// equipe. Ver src/lib/reintegra-api.ts (RPCs) e a migração
// supabase/migrations/20260728000100_cota_schema_e_rpcs.sql.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminCriarCategoriaBiblioteca,
  adminRenomearCategoriaBiblioteca,
  atualizarCota,
  criarCota,
  excluirCota,
  listarCategoriasBiblioteca,
  obterCotaDetalhe,
  type BibliotecaCategoria,
} from "@/lib/reintegra-api";

export const cotaKeys = {
  categorias: ["cota", "categorias"] as const,
  detalhe: (itemId: string) => ["cota", "detalhe", itemId] as const,
};

export function useCategoriasCota() {
  return useQuery<BibliotecaCategoria[]>({
    queryKey: cotaKeys.categorias,
    queryFn: () => listarCategoriasBiblioteca("cota"),
    staleTime: 30_000,
  });
}

export function useCotaDetalhe(itemId: string | null) {
  return useQuery({
    queryKey: itemId ? cotaKeys.detalhe(itemId) : ["cota", "detalhe", "none"],
    queryFn: () => obterCotaDetalhe(itemId!),
    enabled: !!itemId,
  });
}

export function useCriarCota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: criarCota,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["biblioteca-itens"] });
    },
  });
}

export function useAtualizarCota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: atualizarCota,
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: cotaKeys.detalhe(variables.itemId) });
      qc.invalidateQueries({ queryKey: ["biblioteca-itens"] });
    },
  });
}

export function useExcluirCota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: excluirCota,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["biblioteca-itens"] });
    },
  });
}

export function useAdminCriarCategoriaBiblioteca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminCriarCategoriaBiblioteca,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cotaKeys.categorias });
      qc.invalidateQueries({ queryKey: ["biblioteca-categorias"] });
    },
  });
}

export function useAdminRenomearCategoriaBiblioteca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminRenomearCategoriaBiblioteca,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cotaKeys.categorias });
      qc.invalidateQueries({ queryKey: ["biblioteca-categorias"] });
    },
  });
}

/** Mensagens amigáveis para os códigos de erro estruturado das RPCs de Cota. */
export function mensagemErroCota(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (msg.includes("CONCURRENT_CHANGE"))
    return "Esta cota foi alterada em outra sessão. Recarregue para continuar.";
  if (msg.includes("NOT_OWNER")) return "Apenas o Defensor autor pode editar ou excluir esta cota.";
  if (msg.includes("COTA_NOT_FOUND")) return "Cota não encontrada.";
  if (msg.includes("FORBIDDEN")) return "Você não tem acesso a esta cota.";
  if (msg.includes("INVALID_TITLE")) return "Informe um título para a cota.";
  if (msg.includes("INVALID_BODY")) return "Informe o texto da cota.";
  if (msg.includes("CATEGORY_REQUIRED")) return "Selecione ao menos uma categoria.";
  if (msg.includes("INVALID_CATEGORY")) return "Selecione categorias válidas.";
  if (msg.includes("RESERVED_NAME") || msg.includes("RESERVED_CATEGORY"))
    return '"Sem categoria" é reservado pelo sistema.';
  if (msg.includes("CATEGORY_ALREADY_EXISTS")) return "Já existe uma categoria com esse nome.";
  return msg || fallback;
}
