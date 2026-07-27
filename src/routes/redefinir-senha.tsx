import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — Ágora" },
      { name: "description", content: "Defina uma nova senha institucional." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

const passwordSchema = z
  .string()
  .min(10, { message: "A senha deve ter no mínimo 10 caracteres." })
  .max(128);

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // O link de recuperação do Supabase entrega a sessão via hash;
    // aguardamos o evento PASSWORD_RECOVERY ou uma sessão presente.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const r = passwordSchema.safeParse(password);
    if (!r.success) return toast.error(r.error.issues[0].message);
    if (password !== confirm) return toast.error("As senhas não coincidem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(
        error.message.toLowerCase().includes("pwned")
          ? "Esta senha aparece em vazamentos conhecidos. Escolha outra."
          : "Não foi possível redefinir a senha. Solicite um novo link.",
      );
      return;
    }
    toast.success("Senha redefinida. Você já está autenticado.");
    navigate({ to: "/painel", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-md">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          DPE-RS · Ágora
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Redefinir senha</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Escolha uma nova senha institucional. Senhas presentes em vazamentos conhecidos são
          recusadas automaticamente.
        </p>

        {!ready ? (
          <div className="mt-8 surface-panel p-6 text-sm text-muted-foreground">
            Validando link de recuperação…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="pw">Nova senha</Label>
              <Input
                id="pw"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={10}
                maxLength={128}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Confirmar senha</Label>
              <Input
                id="pw2"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={10}
                maxLength={128}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Salvar nova senha
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
