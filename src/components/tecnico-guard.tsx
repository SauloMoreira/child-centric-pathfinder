import { Link } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { ShieldAlert, Terminal } from "lucide-react";
import {
  useEstadoInstitucional,
  isAdminTecnico,
} from "@/hooks/use-estado-institucional";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  eyebrow?: string;
  description?: string;
  /** Se true, exige AAL2 além do papel admin_tecnico. */
  requireAal2?: boolean;
  children: ReactNode;
};

/**
 * Gate client-side de rotas /admin-tecnico/*.
 *
 * A validação canônica está no servidor (RLS + funções SECURITY DEFINER que
 * validam auth.uid()/role/AAL2). Este componente evita apenas exposição
 * visual e navegação para usuários sem o papel; manipular a URL não concede
 * acesso — qualquer chamada de dados feita pela página será negada pelo banco.
 */
export function TecnicoPage({
  title,
  eyebrow = "Administração Técnica",
  description,
  requireAal2 = false,
  children,
}: Props) {
  const { data: estado, isLoading } = useEstadoInstitucional();

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-96" />
      </div>
    );
  }

  if (!isAdminTecnico(estado)) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <div className="surface-panel p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-6 w-6 text-destructive" aria-hidden />
            <div>
              <h1 className="text-lg font-semibold">Acesso restrito</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Esta área é exclusiva do Administrador Técnico. Toda tentativa
                de acesso é registrada em auditoria.
              </p>
            </div>
          </div>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/painel">Voltar ao painel</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (requireAal2 && !estado?.aal2) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <div className="surface-panel p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-6 w-6 text-warning" aria-hidden />
            <div>
              <h1 className="text-lg font-semibold">MFA obrigatório</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Esta operação exige sessão em AAL2. Configure e valide o segundo
                fator em <Link to="/conta" className="underline">Minha conta</Link>{" "}
                e retorne para continuar.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6 flex items-start gap-3">
        <div className="mt-1 rounded-md bg-institutional/10 p-2 text-institutional">
          <Terminal className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-institutional">
            {eyebrow}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
