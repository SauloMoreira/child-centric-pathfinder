import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { precisaStepUpMfa } from "@/components/mfa-challenge-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SignInForm, SignUpForm } from "@/routes/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ágora" },
      {
        name: "description",
        content: "Ágora - sistema de Formulários e cotas",
      },
      { property: "og:title", content: "Ágora" },
      {
        property: "og:description",
        content: "Ágora - sistema de Formulários e cotas",
      },
    ],
  }),
  component: PublicLanding,
});

// Ajuste doc (PÁGINA INICIAL) — a página inicial deixou de ser uma landing
// page institucional (hero, lista de recursos, rodapé) e passou a ser
// enxuta: só o formulário de login/criação de conta, título do site e
// logo da Defensoria, no mesmo design do resto do sistema Ágora.
function PublicLanding() {
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive || !data.session) return;
      if (await precisaStepUpMfa()) return;
      navigate({ to: "/painel", replace: true });
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-12">
      <div className="flex flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-md bg-sidebar">
          <img src="/dpe-rs-logo-branco.png" alt="" aria-hidden className="h-8 w-8 object-contain" />
        </div>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          DPE-RS
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Ágora</h1>
      </div>

      <div className="mt-8 w-full max-w-md">
        <Tabs defaultValue="entrar">
          <TabsList className="w-full">
            <TabsTrigger value="entrar" className="flex-1">
              Entrar
            </TabsTrigger>
            <TabsTrigger value="cadastro" className="flex-1">
              Criar acesso
            </TabsTrigger>
          </TabsList>
          <TabsContent value="entrar" className="mt-6">
            <SignInForm />
          </TabsContent>
          <TabsContent value="cadastro" className="mt-6">
            <SignUpForm />
          </TabsContent>
        </Tabs>
      </div>

      <p className="mt-8 max-w-sm text-center text-xs text-muted-foreground">
        Acesso institucional restrito a servidores autorizados. Novos acessos passam por aprovação
        do Administrador Institucional.
      </p>
    </div>
  );
}
