import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { erro, naoAutenticado, supabaseForUser, texto } from "../supabase";

export default defineTool({
  name: "listar_orgaos_execucao",
  title: "Listar órgãos de execução",
  description:
    "Lista os órgãos de execução visíveis para o usuário conectado, com busca opcional por nome ou comarca.",
  inputSchema: {
    busca: z
      .string()
      .trim()
      .max(120)
      .optional()
      .describe("Texto para filtrar por nome ou comarca."),
    limite: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Quantidade máxima de registros (padrão 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ busca, limite }, ctx) => {
    if (!ctx.isAuthenticated()) return naoAutenticado();
    let query = supabaseForUser(ctx)
      .from("orgaos_execucao")
      .select("id, nome, comarca, created_at")
      .order("nome", { ascending: true })
      .limit(limite ?? 50);

    if (busca) {
      // Escapa caracteres especiais do PostgREST no valor de busca antes de
      // interpolar no filtro OR (vírgula, parênteses e ponto e vírgula).
      const safe = busca.replace(/([,()\\;])/g, "\\$1");
      query = query.or(`nome.ilike.%${safe}%,comarca.ilike.%${safe}%`);
    }

    const { data, error } = await query;
    if (error) return erro(error.message);
    return { ...texto(data ?? []), structuredContent: { orgaos: data ?? [] } };
  },
});
