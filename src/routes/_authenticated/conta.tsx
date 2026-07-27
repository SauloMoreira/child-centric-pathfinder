import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEstadoInstitucional } from "@/hooks/use-estado-institucional";
import { useSelecionarContextoOrgao } from "@/hooks/use-selecionar-contexto-orgao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, KeyRound, Check, Landmark } from "lucide-react";
import { OrgaoCombobox, type OrgaoOption } from "@/components/orgao-combobox";

export const Route = createFileRoute("/_authenticated/conta")({
  head: () => ({
    meta: [
      { title: "Minha conta — Ágora" },
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
  const isAdmin = estado?.roles?.includes("admin_institucional") ?? false;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 lg:p-8">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Conta institucional
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Minha conta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajuste dados de acesso, credenciais de segurança e vínculos institucionais.
        </p>
      </div>

      <VinculosSection />

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

type AutoAttachResult =
  | {
      ok: true;
      code: "DEFENDER_SELF_ATTACHED";
      created: boolean;
      contextoAtual: { orgaoId: string; nome: string };
      version: number;
    }
  | { ok: false; code: string };

function VinculosSection() {
  const qc = useQueryClient();
  const { data: estado } = useEstadoInstitucional();
  const selecionar = useSelecionarContextoOrgao();
  const disponiveis = estado?.orgaosDisponiveis ?? [];
  const contexto = estado?.contextoAtual ?? null;
  const tecnico = !!estado?.roles?.includes("admin_tecnico");
  const defensor = !!estado?.roles?.includes("defensor_publico");
  const podeAutoVincular = defensor && !tecnico;

  const [orgaoEscolhido, setOrgaoEscolhido] = useState<string | null>(null);

  const orgaosQ = useQuery({
    queryKey: ["orgaos-execucao-lista"],
    enabled: podeAutoVincular,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orgaos_execucao")
        .select("id,nome,comarca")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as OrgaoOption[];
    },
  });

  const autovincular = useMutation({
    mutationFn: async (orgaoId: string): Promise<AutoAttachResult> => {
      const idempotencyKey =
        (globalThis.crypto as Crypto | undefined)?.randomUUID?.() ??
        crypto.randomUUID();
      const { data, error } = await supabase.rpc(
        "defensor_autovincular_orgao",
        { p_orgao_id: orgaoId, p_idempotency_key: idempotencyKey },
      );
      if (error) throw error;
      return data as unknown as AutoAttachResult;
    },
    onSuccess: async (r) => {
      if (!r.ok) {
        const map: Record<string, string> = {
          ORGANIZATION_NOT_FOUND: "Órgão não encontrado.",
          PROFILE_INACTIVE: "Sua conta institucional não está ativa.",
          FORBIDDEN: "Somente Defensores Públicos podem usar este atalho.",
          UNAUTHENTICATED: "Sessão expirada. Faça login novamente.",
        };
        toast.error(map[r.code] ?? "Não foi possível vincular ao órgão.");
        return;
      }
      qc.removeQueries({
        predicate: (q) => {
          const key = String(q.queryKey?.[0] ?? "");
          return [
            "workspace",
            "workspace-column",
            "workspace-search",
            "workspaces-list",
            "team-members",
            "team-invitations",
            "orgaos-acessiveis",
            "biblioteca",
            "biblioteca-categorias",
          ].includes(key);
        },
      });

      await qc.invalidateQueries({ queryKey: ["estado-institucional"] });
      toast.success(
        r.created
          ? `Vínculo criado e área de trabalho ajustada para "${r.contextoAtual.nome}".`
          : `Área de trabalho ajustada para "${r.contextoAtual.nome}".`,
      );
      setOrgaoEscolhido(null);
    },
    onError: () => toast.error("Não foi possível vincular ao órgão."),
  });

  const opcoes = orgaosQ.data ?? [];
  const jaVinculado = useMemo(() => {
    if (!orgaoEscolhido) return false;
    return disponiveis.some((o) => o.orgaoId === orgaoEscolhido);
  }, [disponiveis, orgaoEscolhido]);
  const jaEmUso = orgaoEscolhido && orgaoEscolhido === contexto?.orgaoId;
  const trocando = selecionar.isPending || autovincular.isPending;

  function handleUsarOrgao() {
    if (!orgaoEscolhido) return;
    if (jaVinculado) {
      selecionar.mutate({
        orgaoId: orgaoEscolhido,
        expectedVersion: estado?.contextVersion ?? null,
      });
    } else {
      autovincular.mutate(orgaoEscolhido);
    }
  }

  return (
    <section className="surface-panel p-6">
      <div className="flex items-start gap-3">
        <Landmark className="mt-0.5 h-5 w-5 text-institutional" aria-hidden />
        <div className="flex-1">
          <h2 className="text-base font-semibold">Órgão de execução</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A disposição da área de trabalho será alterada para aquela vinculada
            ao órgão de execução.
          </p>
        </div>
      </div>

      {tecnico && (
        <div className="mt-4 rounded-md border border-institutional/30 bg-institutional/5 p-3 text-xs text-institutional">
          Você possui <strong>acesso técnico global</strong>. Utilize o seletor
          da barra lateral para escolher o órgão em uso nas telas operacionais.
        </div>
      )}

      {podeAutoVincular && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="orgao-execucao-picker" className="text-xs">
              Selecionar órgão de execução
            </Label>
            <OrgaoCombobox
              id="orgao-execucao-picker"
              value={orgaoEscolhido}
              onChange={(id) => setOrgaoEscolhido(id)}
              options={opcoes}
              loading={orgaosQ.isLoading}
              placeholder="Pesquisar por nome ou comarca"
            />
            {orgaoEscolhido && !jaVinculado && (
              <p className="text-[11px] text-muted-foreground">
                Um novo vínculo do tipo <strong>defensor</strong> será criado
                automaticamente para este órgão. Os vínculos anteriores
                permanecem ativos.
              </p>
            )}
          </div>
          <Button
            type="button"
            onClick={handleUsarOrgao}
            disabled={!orgaoEscolhido || !!jaEmUso || trocando}
          >
            {trocando && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            )}
            {jaEmUso ? "Em uso" : "Usar este órgão"}
          </Button>
        </div>
      )}

      {!tecnico && !podeAutoVincular && disponiveis.length === 0 && (
        <p className="mt-4 rounded-md border border-border bg-canvas/40 p-4 text-sm text-muted-foreground">
          Nenhum órgão de execução está vinculado à sua conta. Contate a
          administração institucional para receber vínculo.
        </p>
      )}

      {disponiveis.length > 0 && (
        <div className="mt-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Vínculos ativos
          </p>
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {disponiveis.map((o) => {
              const atual = o.orgaoId === contexto?.orgaoId;
              return (
                <li
                  key={o.orgaoId}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{o.nome}</p>
                      {atual && (
                        <Badge
                          variant="outline"
                          className="border-institutional/50 bg-institutional/10 text-[10px] font-mono uppercase tracking-[0.14em] text-institutional"
                        >
                          <Check className="mr-1 h-3 w-3" aria-hidden />
                          Em uso
                        </Badge>
                      )}
                    </div>
                    {o.comarca && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Comarca: {o.comarca}
                      </p>
                    )}
                    {o.dataInicio && (
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Vinculado em{" "}
                        {new Date(o.dataInicio).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                  <Button
                    variant={atual ? "outline" : "default"}
                    size="sm"
                    disabled={atual || trocando}
                    onClick={() =>
                      selecionar.mutate({
                        orgaoId: o.orgaoId,
                        expectedVersion: estado?.contextVersion ?? null,
                      })
                    }
                  >
                    {selecionar.isPending && (
                      <Loader2
                        className="mr-2 h-3.5 w-3.5 animate-spin"
                        aria-hidden
                      />
                    )}
                    {atual ? "Selecionado" : "Usar este órgão"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
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
                  MFA configurado · Estado: {f.status}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Um fator verificado não eleva a sessão automaticamente. Ao
                  entrar, informe o código do aplicativo para elevar a sessão
                  ao nível AAL2.
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
