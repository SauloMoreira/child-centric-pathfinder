import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { erro, naoAutenticado, supabaseForUser, texto } from "../supabase";

export default defineTool({
  name: "criar_orgao_execucao",
  title: "Criar órgão de execução",
  description:
    "Cria um órgão de execução (nome + comarca). Exige papel administrativo e sessão com MFA; a criação é auditada.",
  inputSchema: {
    nome: z.string().trim().min(3).max(180).describe("Nome do órgão de execução."),
    comarca: z.string().trim().min(2).max(120).describe("Comarca do órgão."),
    idempotency_key: z
      .string()
      .uuid()
      .optional()
      .describe("Chave de idempotência opcional (UUID)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ nome, comarca, idempotency_key }, ctx) => {
    if (!ctx.isAuthenticated()) return naoAutenticado();
    const { data, error } = await supabaseForUser(ctx).rpc(
      "admin_create_orgao_execucao",
      { p_nome: nome, p_comarca: comarca, p_idempotency_key: idempotency_key },
    );
    if (error) return erro(error.message);
    return { ...texto(data), structuredContent: { resultado: data } };
  },
});
