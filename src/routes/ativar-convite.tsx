import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useMyPendingInvitation, useCompleteOnboarding } from "@/hooks/use-team";
import { friendlyTeamError } from "@/lib/team-errors";

export const Route = createFileRoute("/ativar-convite")({
  head: () => ({
    meta: [
      { title: "Ativar convite — Reintegra" },
      {
        name: "description",
        content:
          "Defina sua senha institucional e conclua o ingresso em sua equipe.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AtivarConvitePage,
});

function AtivarConvitePage() {
  const navigate = useNavigate();
  const [sessaoOk, setSessaoOk] = useState<boolean | null>(null);
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [aceite, setAceite] = useState(false);
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [senhaDefinida, setSenhaDefinida] = useState(false);
  const conviteQuery = useMyPendingInvitation();
  const complete = useCompleteOnboarding();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSessaoOk(!!data.session);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessaoOk(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function definirSenha(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 10) {
      toast.error("A senha deve ter no mínimo 10 caracteres.");
      return;
    }
    if (senha !== senha2) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setSalvandoSenha(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      setSenhaDefinida(true);
      toast.success("Senha definida com sucesso");
    } catch (err) {
      toast.error("Não foi possível definir a senha", {
        description: (err as Error).message,
      });
    } finally {
      setSalvandoSenha(false);
    }
  }

  async function ativar() {
    try {
      await complete.mutateAsync({ aceiteTermos: aceite });
      toast.success("Conta ativada! Bem-vindo(a) à sua equipe.");
      navigate({ to: "/painel" });
    } catch (err) {
      toast.error("Não foi possível ativar a conta", {
        description: friendlyTeamError(err),
      });
    }
  }

  if (sessaoOk === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sessaoOk) {
    return (
      <div className="mx-auto max-w-md p-8">
        <Card>
          <CardHeader>
            <CardTitle>Link de convite inválido</CardTitle>
            <CardDescription>
              Abra novamente o link recebido por e-mail. Ele expira em 7 dias.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const convite = conviteQuery.data;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-6">
      <div className="w-full space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          <span className="font-mono uppercase tracking-[0.18em] text-[10px]">
            Reintegra — Ativação de conta
          </span>
        </div>

        {conviteQuery.isLoading ? (
          <Card>
            <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando convite...
            </CardContent>
          </Card>
        ) : !convite ? (
          <Card>
            <CardHeader>
              <CardTitle>Nenhum convite pendente</CardTitle>
              <CardDescription>
                Não encontramos um convite ativo para este e-mail. Solicite ao
                Defensor responsável um novo envio.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : convite.expirado ? (
          <Card>
            <CardHeader>
              <CardTitle>Convite expirado</CardTitle>
              <CardDescription>
                Este convite não é mais válido. Solicite reenvio ao Defensor
                responsável pela sua equipe.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Bem-vindo(a), {convite.nome_completo}</CardTitle>
              <CardDescription>
                Você foi convidado(a) para integrar a equipe de{" "}
                <b>{convite.orgao.nome}</b>
                {convite.orgao.comarca ? ` · ${convite.orgao.comarca}` : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!senhaDefinida ? (
                <form onSubmit={definirSenha} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="senha">Defina sua senha</Label>
                    <Input
                      id="senha"
                      type="password"
                      autoComplete="new-password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      minLength={10}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Mínimo de 10 caracteres.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="senha2">Confirme a senha</Label>
                    <Input
                      id="senha2"
                      type="password"
                      autoComplete="new-password"
                      value={senha2}
                      onChange={(e) => setSenha2(e.target.value)}
                      minLength={10}
                    />
                  </div>
                  <Button type="submit" disabled={salvandoSenha} className="w-full">
                    {salvandoSenha && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Definir senha
                  </Button>
                </form>
              ) : (
                <>
                  <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success-foreground">
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Senha
                    definida
                  </div>

                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="aceite"
                      checked={aceite}
                      onCheckedChange={(v) => setAceite(v === true)}
                    />
                    <Label
                      htmlFor="aceite"
                      className="text-xs leading-relaxed text-muted-foreground"
                    >
                      Declaro que li e aceito os termos institucionais de uso do
                      sistema Reintegra e o dever de sigilo funcional sobre os
                      dados acessados.
                    </Label>
                  </div>

                  <Button
                    className="w-full"
                    disabled={!aceite || complete.isPending}
                    onClick={ativar}
                  >
                    {complete.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Concluir ativação
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
