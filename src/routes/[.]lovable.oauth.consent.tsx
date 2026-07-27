import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

type AuthorizationDetails = {
  client?: { name?: string | null } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Requisição sem authorization_id.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { modo: "entrar", next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <h1 className="text-lg font-semibold">Não foi possível carregar a autorização</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const cliente = details?.client?.name ?? "o aplicativo solicitante";

  async function decidir(aprovar: boolean) {
    setBusy(true);
    setErro(null);
    const api = oauthApi();
    const { data, error } = aprovar
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setErro(error.message);
      return;
    }
    const destino = data?.redirect_url ?? data?.redirect_to;
    if (!destino) {
      setBusy(false);
      setErro("O servidor de autorização não retornou um destino de redirecionamento.");
      return;
    }
    window.location.href = destino;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <div className="rounded-lg border border-border bg-card p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          DPE-RS · Ágora
        </p>
        <h1 className="mt-4 text-xl font-semibold">Conectar {cliente} à sua conta institucional</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Ao aprovar, {cliente} poderá usar as ferramentas do Ágora agindo como você, respeitando
          seus papéis, vínculos e políticas de acesso. Toda ação continuará registrada em auditoria.
        </p>
        <div className="mt-5 flex items-start gap-3 rounded-md border border-border/70 p-4 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4" aria-hidden />
          <p>
            Aprove apenas clientes reconhecidos institucionalmente. Você pode revogar o acesso a
            qualquer momento.
          </p>
        </div>
        {erro && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {erro}
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <Button disabled={busy} onClick={() => decidir(true)}>
            Aprovar acesso
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => decidir(false)}>
            Negar
          </Button>
        </div>
      </div>
    </main>
  );
}
