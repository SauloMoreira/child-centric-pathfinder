import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEstadoInstitucional } from "@/hooks/use-estado-institucional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/conta")({
  head: () => ({
    meta: [
      { title: "Minha conta — Reintegra Infância" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MinhaConta,
});

const passwordSchema = z
  .string()
  .min(10, "A senha deve ter no mínimo 10 caracteres.")
  .max(128);

function MinhaConta() {
  const { data: estado, refetch } = useEstadoInstitucional();
  const isAdmin = estado?.roles.includes("admin_institucional") ?? false;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 lg:p-8">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Conta institucional
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Minha conta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajuste dados de acesso e credenciais de segurança.
        </p>
      </div>

      <section className="surface-panel p-6">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-5 w-5 text-institutional" aria-hidden />
          <div className="flex-1">
            <h2 className="text-base font-semibold">Alterar senha</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Utilize uma senha inédita, com no mínimo 10 caracteres.
            </p>
          </div>
        </div>
        <AlterarSenhaForm />
      </section>

      <section className="surface-panel p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-institutional" aria-hidden />
          <div className="flex-1">
            <h2 className="text-base font-semibold">
              Autenticação em dois fatores (MFA)
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAdmin
                ? "Obrigatório para o Administrador Institucional. Necessária para aprovar ou rejeitar solicitações de acesso."
                : "Recomendado. Aumenta a segurança do seu acesso institucional."}
            </p>
          </div>
        </div>
        <MfaSetup onChange={() => refetch()} />
      </section>
    </div>
  );
}

function AlterarSenhaForm() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const r = passwordSchema.safeParse(pw);
    if (!r.success) return toast.error(r.error.issues[0].message);
    if (pw !== confirm) return toast.error("As senhas não coincidem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) {
      toast.error(
        error.message.toLowerCase().includes("pwned")
          ? "Esta senha aparece em vazamentos conhecidos. Escolha outra."
          : "Não foi possível alterar a senha.",
      );
      return;
    }
    setPw("");
    setConfirm("");
    toast.success("Senha alterada.");
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="new-pw">Nova senha</Label>
        <Input
          id="new-pw"
          type="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          minLength={10}
          maxLength={128}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-pw2">Confirmar senha</Label>
        <Input
          id="new-pw2"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={10}
          maxLength={128}
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          Salvar nova senha
        </Button>
      </div>
    </form>
  );
}

type Factor = { id: string; friendly_name?: string | null; status: string };

function MfaSetup({ onChange }: { onChange: () => void }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState<{
    factorId: string;
    qr: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");

  async function refreshFactors() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return;
    setFactors((data.totp ?? []) as Factor[]);
  }

  useEffect(() => {
    refreshFactors();
  }, []);

  async function iniciar() {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `TOTP-${Date.now()}`,
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível iniciar o MFA.");
      return;
    }
    setEnrolling({
      factorId: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
    });
  }

  async function verificar() {
    if (!enrolling) return;
    if (!/^\d{6}$/.test(code)) return toast.error("Informe o código de 6 dígitos.");
    setLoading(true);
    const challenge = await supabase.auth.mfa.challenge({
      factorId: enrolling.factorId,
    });
    if (challenge.error || !challenge.data) {
      setLoading(false);
      toast.error("Falha ao gerar desafio MFA.");
      return;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: enrolling.factorId,
      challengeId: challenge.data.id,
      code,
    });
    setLoading(false);
    if (error) return toast.error("Código inválido. Tente novamente.");
    setEnrolling(null);
    setCode("");
    await refreshFactors();
    onChange();
    toast.success("MFA ativado. A sessão foi elevada para AAL2.");
  }

  async function remover(id: string) {
    setLoading(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setLoading(false);
    if (error) return toast.error("Falha ao remover fator MFA.");
    await refreshFactors();
    onChange();
  }

  return (
    <div className="mt-5 space-y-4">
      {factors.length === 0 && !enrolling && (
        <Button onClick={iniciar} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          Configurar autenticador (TOTP)
        </Button>
      )}

      {enrolling && (
        <div className="rounded-md border border-border bg-canvas/50 p-4">
          <p className="text-sm">
            Leia o QR Code no aplicativo autenticador (Google Authenticator, 1Password, Authy).
          </p>
          <div className="mt-3 flex items-start gap-4">
            <img
              src={enrolling.qr}
              alt="QR Code do fator MFA"
              className="h-40 w-40 rounded-md bg-white p-2"
            />
            <div className="text-xs">
              <p className="text-muted-foreground">Ou insira o segredo manualmente:</p>
              <code className="mt-1 block break-all rounded bg-muted p-2 font-mono">
                {enrolling.secret}
              </code>
            </div>
          </div>
          <div className="mt-4 flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="otp">Código do aplicativo</Label>
              <Input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                className="font-mono tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <Button onClick={verificar} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Confirmar
            </Button>
          </div>
        </div>
      )}

      {factors.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {factors.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <p className="font-medium">{f.friendly_name ?? "Fator TOTP"}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Estado: {f.status}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => remover(f.id)} disabled={loading}>
                Remover
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
