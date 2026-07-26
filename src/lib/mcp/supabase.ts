import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

/**
 * Cliente Supabase que atua como o usuário autenticado via OAuth (MCP).
 * O token verificado é encaminhado ao PostgREST para que a RLS avalie o
 * papel institucional real do usuário. Nunca usar service role aqui.
 */
export function supabaseForUser(ctx: ToolContext): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function naoAutenticado() {
  return {
    content: [
      {
        type: "text" as const,
        text: "Sessão institucional não autenticada. Conecte-se novamente.",
      },
    ],
    isError: true,
  };
}

export function erro(mensagem: string) {
  return { content: [{ type: "text" as const, text: mensagem }], isError: true };
}

export function texto(valor: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(valor, null, 2) }],
  };
}
