import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type VerifiedFactor = { id: string; friendly_name?: string | null };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
  /** Se true, cancelar encerra a sessão (usado no fluxo pós-login). */
  signOutOnCancel?: boolean;
};

export function MfaChallengeDialog({ open, onOpenChange, onSuccess, signOutOnCancel }: Props) {
  const qc = useQueryClient();
  const [factor, setFactor] = useState<VerifiedFactor | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCode("");
      setError(null);
      setFactor(null);
      return;
    }
    let alive = true;
    setLoading(true);
    supabase.auth.mfa.listFactors().then(({ data, error: e }) => {
      if (!alive) return;
      setLoading(false);
      if (e) {
        setError("Não foi possível carregar os fatores MFA.");
        return;
      }
      const totp = (data?.totp ?? []).find((f) => f.status === "verified");
      if (!totp) {
        setError(
          "Nenhum fator MFA verificado. Configure a autenticação em dois fatores em Minha conta.",
        );
        return;
      }
      setFactor({ id: totp.id, friendly_name: totp.friendly_name });
    });
    return () => {
      alive = false;
    };
  }, [open]);

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    if (!factor) return;
    if (!/^\d{6}$/.test(code)) {
      setError("Informe o código de 6 dígitos.");
      return;
    }
    setError(null);
    setVerifying(true);
    const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error || !challenge.data) {
      setVerifying(false);
      setError("Falha ao gerar desafio MFA. Tente novamente.");
      return;
    }
    const { error: verr } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.data.id,
      code,
    });
    setVerifying(false);
    if (verr) {
      setError("Código inválido. Tente novamente.");
      return;
    }
    toast.success("MFA confirmado. Sessão elevada.");
    await qc.invalidateQueries({ queryKey: ["estado-institucional"] });
    onOpenChange(false);
    onSuccess?.();
  }

  async function handleCancel() {
    if (signOutOnCancel) {
      await supabase.auth.signOut();
    }
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) void handleCancel();
        else onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-institutional" aria-hidden />
            Confirmar autenticação em dois fatores
          </DialogTitle>
          <DialogDescription>
            Informe o código de 6 dígitos gerado pelo seu aplicativo autenticador para elevar esta
            sessão.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Carregando fator MFA…
          </div>
        )}

        {!loading && factor && (
          <form onSubmit={verificar} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mfa-code">Código do aplicativo</Label>
              <Input
                id="mfa-code"
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                className="font-mono tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              {factor.friendly_name && (
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Fator: {factor.friendly_name}
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={handleCancel} disabled={verifying}>
                {signOutOnCancel ? "Sair" : "Cancelar"}
              </Button>
              <Button type="submit" disabled={verifying || code.length !== 6}>
                {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Confirmar
              </Button>
            </DialogFooter>
          </form>
        )}

        {!loading && !factor && error && (
          <div className="space-y-4">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Retorna true se a sessão atual precisa de step-up MFA. */
export async function precisaStepUpMfa(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.currentLevel === "aal1" && data.nextLevel === "aal2";
}
