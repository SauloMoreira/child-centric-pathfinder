import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  beforeLoad: async () => {
    // getSession() lê a sessão já restaurada localmente (localStorage +
    // autoRefreshToken), sem round-trip de rede — ao contrário de getUser().
    // Usar getUser() aqui fazia o guard depender de uma chamada de rede a
    // cada carregamento da rota, inclusive no F5 (justamente o momento de
    // maior contenção de rede/CPU), deslogando o usuário em qualquer falha
    // ou lentidão transitória dessa chamada.
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      throw redirect({ to: "/auth", search: {} });
    }
    return { user: data.session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
