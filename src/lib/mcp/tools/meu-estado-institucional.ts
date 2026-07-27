import { defineTool } from "@lovable.dev/mcp-js";
import { erro, naoAutenticado, supabaseForUser, texto } from "../supabase";

export default defineTool({
  name: "meu_estado_institucional",
  title: "Meu estado institucional",
  description: "Retorna o perfil, papéis e vínculos institucionais do usuário conectado no Ágora.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return naoAutenticado();
    const { data, error } = await supabaseForUser(ctx).rpc("meu_estado_institucional");
    if (error) return erro(error.message);
    return { ...texto(data), structuredContent: { estado: data } };
  },
});
