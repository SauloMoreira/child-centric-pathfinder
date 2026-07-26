import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import {
  MfaChallengeDialog,
  precisaStepUpMfa,
} from "@/components/mfa-challenge-dialog";

const authSearchSchema = z.object({
  modo: z.enum(["entrar", "cadastro", "recuperar"]).optional().default("entrar"),
  // Caminho relativo de mesma origem para retorno após autenticação
  // (usado pelo consentimento OAuth do servidor MCP).
  next: z.string().optional(),
});

/** Aceita apenas caminhos relativos de mesma origem. */
function caminhoSeguro(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}


export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acesso institucional — Reintegra Infância" },
      {
        name: "description",
        content:
          "Entrada institucional do sistema Reintegra Infância da Defensoria Pública do RS.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (s) => authSearchSchema.parse(s),
  component: AuthPage,
});

const emailSchema = z
  .string()
  .trim()
  .email({ message: "Informe um e-mail institucional válido." })
  .max(255);
const passwordSchema = z
  .string()
  .min(10, { message: "A senha deve ter no mínimo 10 caracteres." })
  .max(128);
const nomeSchema = z
  .string()
  .trim()
  .min(3, { message: "Informe seu nome completo." })
  .max(120);

function AuthPage() {
  const { modo, next } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const retorno = caminhoSeguro(next);

  // Se já estiver autenticado, retornar ao destino solicitado ou ao painel.
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) {
        if (retorno) window.location.replace(retorno);
        else navigate({ to: "/painel", replace: true });
      }
    });
    return () => {
      alive = false;
    };
  }, [navigate, retorno]);


  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-2">
        <aside className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-sidebar-muted hover:text-sidebar-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Voltar
            </Link>
            <div className="mt-16">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-sidebar-muted">
                DPE-RS · Reintegra Infância
              </p>
              <h1 className="mt-4 text-3xl font-semibold leading-tight">
                Acesso institucional restrito.
              </h1>
              <p className="mt-4 max-w-md text-sm text-sidebar-muted">
                Somente servidores autorizados podem operar a plataforma.
                Novos acessos passam por aprovação do Administrador
                Institucional.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-md border border-sidebar-border/60 p-4 text-xs text-sidebar-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-sidebar-foreground" aria-hidden />
            <p>
              Toda tentativa de acesso e ação sensível é registrada em
              auditoria institucional. Utilize apenas dados fictícios nesta
              etapa de homologação.
            </p>
          </div>
        </aside>

        <main className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">
            <Tabs
              value={modo}
              onValueChange={(v) =>
                navigate({
                  to: "/auth",
                  search: {
                    modo: v as "entrar" | "cadastro" | "recuperar",
                    next,
                  },
                  replace: true,
                })
              }

            >
              <TabsList className="w-full">
                <TabsTrigger value="entrar" className="flex-1">Entrar</TabsTrigger>
                <TabsTrigger value="cadastro" className="flex-1">Criar acesso</TabsTrigger>
                <TabsTrigger value="recuperar" className="flex-1">Recuperar</TabsTrigger>
              </TabsList>
              <TabsContent value="entrar" className="mt-6">
                <SignInForm />
              </TabsContent>
              <TabsContent value="cadastro" className="mt-6">
                <SignUpForm />
              </TabsContent>
              <TabsContent value="recuperar" className="mt-6">
                <RecoveryForm />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/auth" });
  const retorno = caminhoSeguro(next);

  function concluirRedirect() {
    if (retorno) {
      window.location.replace(retorno);
      return;
    }
    navigate({ to: "/painel", replace: true });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailR = emailSchema.safeParse(email);
    const passR = z.string().min(1, "Informe sua senha.").safeParse(password);
    if (!emailR.success) return toast.error(emailR.error.issues[0].message);
    if (!passR.success) return toast.error(passR.error.issues[0].message);

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: emailR.data,
      password,
    });
    if (error) {
      setLoading(false);
      // Mensagem genérica para não indicar existência de conta.
      toast.error("Não foi possível entrar. Verifique suas credenciais.");
      return;
    }
    // Se o usuário possui fator MFA verificado, a sessão ainda está em AAL1.
    // Solicitar step-up antes de concluir o login.
    const precisa = await precisaStepUpMfa();
    setLoading(false);
    if (precisa) {
      toast.message("Confirme seu código MFA para continuar.");
      setMfaOpen(true);
      return;
    }
    concluirRedirect();
  }



  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail institucional</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={255}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Senha</Label>
          <Link
            to="/auth"
            search={{ modo: "recuperar" }}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Esqueci minha senha
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={1}
          maxLength={128}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
        Entrar
      </Button>
    </form>
  );
}

function SignUpForm() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { next } = useSearch({ from: "/auth" });
  const retorno = caminhoSeguro(next);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nR = nomeSchema.safeParse(nome);
    const eR = emailSchema.safeParse(email);
    const pR = passwordSchema.safeParse(password);
    if (!nR.success) return toast.error(nR.error.issues[0].message);
    if (!eR.success) return toast.error(eR.error.issues[0].message);
    if (!pR.success) return toast.error(pR.error.issues[0].message);
    if (password !== confirm) return toast.error("As senhas não coincidem.");

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: eR.data,
      password,
      options: {
        emailRedirectTo: retorno
          ? `${window.location.origin}${retorno}`
          : `${window.location.origin}/auth`,
        data: { nome_completo: nR.data },
      },
    });

    setLoading(false);
    if (error) {
      toast.error(
        error.message.includes("weak") || error.message.toLowerCase().includes("pwned")
          ? "Esta senha aparece em vazamentos conhecidos. Escolha outra."
          : "Não foi possível criar o acesso agora. Tente novamente."
      );
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="surface-panel p-6 text-sm">
        <h2 className="text-base font-semibold">Confirme seu e-mail</h2>
        <p className="mt-2 text-muted-foreground">
          Enviamos um link de confirmação para o e-mail informado. Após confirmar,
          você poderá entrar e completar seus dados funcionais para solicitar
          acesso institucional ao sistema.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <p className="text-xs text-muted-foreground">
        A criação da conta é apenas o primeiro passo. O acesso operacional ao
        sistema depende de aprovação do Administrador Institucional.
      </p>
      <div className="space-y-2">
        <Label htmlFor="nome">Nome completo</Label>
        <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={120} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="su-email">E-mail institucional</Label>
        <Input
          id="su-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={255}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="su-pw">Senha</Label>
          <Input
            id="su-pw"
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
          <Label htmlFor="su-pw2">Confirmar senha</Label>
          <Input
            id="su-pw2"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={10}
            maxLength={128}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Utilize senha com no mínimo 10 caracteres. Senhas presentes em vazamentos
        conhecidos são recusadas automaticamente.
      </p>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
        Criar acesso
      </Button>
    </form>
  );
}

function RecoveryForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const r = emailSchema.safeParse(email);
    if (!r.success) return toast.error(r.error.issues[0].message);
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(r.data, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setLoading(false);
    // Mensagem indistinguível para não revelar existência de conta.
    setSent(true);
  }

  if (sent) {
    return (
      <div className="surface-panel p-6 text-sm">
        <h2 className="text-base font-semibold">Verifique seu e-mail</h2>
        <p className="mt-2 text-muted-foreground">
          Se houver uma conta associada a este endereço, um link de
          redefinição de senha foi enviado. O link expira em poucos minutos.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Enviaremos um link de redefinição para o e-mail informado, caso ele
        esteja cadastrado.
      </p>
      <div className="space-y-2">
        <Label htmlFor="rec-email">E-mail institucional</Label>
        <Input
          id="rec-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={255}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
        Enviar link de redefinição
      </Button>
    </form>
  );
}
