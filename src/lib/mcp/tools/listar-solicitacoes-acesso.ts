import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { erro, naoAutenticado, supabaseForUser, texto } from "../supabase";

export default defineTool({
  name: "listar_solicitacoes_acesso",
  title: "Listar solicitações de acesso",
  description:
    "Lista solicitações de acesso institucional pendentes ou já decididas. Restrito a perfis administrativos.",
  inputSchema: {
    status: z
      .enum(["pendente", "aprovada", "rejeitada", "cancelada"])
      .optional()
      .describe("Filtro por situação da solicitação."),
    limite: z.number().int().min(1).max(100).optional().describe("Máximo de registros."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limite }, ctx) => {
    if (!ctx.isAuthenticated()) return naoAutenticado();
    const { data, error } = await supabaseForUser(ctx).rpc(
      "listar_solicitacoes_acesso",
      { p_status: status, p_limit: limite ?? 50 },
    );
    if (error) return erro(error.message);
    return {
      ...texto(data ?? []),
      structuredContent: { solicitacoes: data ?? [] },
    };
  },
});
