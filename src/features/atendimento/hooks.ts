// Hooks de dados para o recurso Atendimento — modelo de formulário
// reutilizável criado por um Defensor Público para orientar a equipe no
// atendimento presencial. Ver src/lib/reintegra-api.ts (RPCs) e a migração
// supabase/migrations/20260805000000_atendimento_schema_e_rpcs.sql.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  atualizarAtendimento,
  criarAtendimento,
  excluirAtendimento,
  listarCategoriasBiblioteca,
  obterAtendimentoDetalhe,
  type BibliotecaCategoria,
} from "@/lib/reintegra-api";

export const atendimentoKeys = {
  detalhe: (itemId: string) => ["atendimento", "detalhe", itemId] as const,
};

/** Categorias da Biblioteca — lista única, compartilhada entre Cota e Atendimento. */
export function useCategoriasBiblioteca() {
  return useQuery<BibliotecaCategoria[]>({
    queryKey: ["biblioteca-categorias"],
    queryFn: () => listarCategoriasBiblioteca(),
    staleTime: 30_000,
  });
}

export function useAtendimentoDetalhe(itemId: string | null) {
  return useQuery({
    queryKey: itemId ? atendimentoKeys.detalhe(itemId) : ["atendimento", "detalhe", "none"],
    queryFn: () => obterAtendimentoDetalhe(itemId!),
    enabled: !!itemId,
  });
}

export function useCriarAtendimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: criarAtendimento,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["biblioteca-itens"] });
    },
  });
}

export function useAtualizarAtendimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: atualizarAtendimento,
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: atendimentoKeys.detalhe(variables.itemId) });
      qc.invalidateQueries({ queryKey: ["biblioteca-itens"] });
    },
  });
}

export function useExcluirAtendimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: excluirAtendimento,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["biblioteca-itens"] });
    },
  });
}

/** Mensagens amigáveis para os códigos de erro estruturado das RPCs de Atendimento. */
export function mensagemErroAtendimento(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (msg.includes("CONCURRENT_CHANGE"))
    return "Este atendimento foi alterado em outra sessão. Recarregue para continuar.";
  if (msg.includes("NOT_OWNER"))
    return "Apenas o Defensor autor pode editar ou excluir este atendimento.";
  if (msg.includes("ATENDIMENTO_NOT_FOUND")) return "Atendimento não encontrado.";
  if (msg.includes("FORBIDDEN")) return "Você não tem acesso a este atendimento.";
  if (msg.includes("INVALID_TITLE")) return "Informe um título para o atendimento.";
  if (msg.includes("INVALID_FORM_SCHEMA")) return "O formulário do atendimento é inválido.";
  if (msg.includes("CATEGORY_REQUIRED")) return "Selecione ao menos uma categoria.";
  if (msg.includes("INVALID_CATEGORY")) return "Selecione categorias válidas.";
  return msg || fallback;
}
