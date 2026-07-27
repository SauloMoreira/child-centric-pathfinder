import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createTeamMemberSchema,
  funcoesInternas,
  type CreateTeamMemberInput,
} from "@/lib/team-schemas";
import { useInviteTeamMember } from "@/hooks/use-team";
import { friendlyTeamError } from "@/lib/team-errors";
import { useEstadoInstitucional, isAdminTecnico } from "@/hooks/use-estado-institucional";

export function AddTeamMemberSheet({
  open,
  onOpenChange,
  overrideOrgaoId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  overrideOrgaoId?: string | null;
}) {
  const { data: estado } = useEstadoInstitucional();
  const tecnico = isAdminTecnico(estado);
  const showOrgSelector = tecnico && !!overrideOrgaoId;
  const invite = useInviteTeamMember();
  const [justificativa, setJustificativa] = useState("");

  const form = useForm<CreateTeamMemberInput>({
    resolver: zodResolver(createTeamMemberSchema),
    defaultValues: {
      nomeCompleto: "",
      email: "",
      matricula: "",
      funcaoInterna: "assessor",
      outraFuncao: "",
      telefone: "",
    },
  });

  const funcao = form.watch("funcaoInterna");
  const orgaoAtivoLabel = useMemo(() => {
    if (overrideOrgaoId) return "Órgão selecionado (acesso técnico)";
    if (estado?.orgao_ativo)
      return `${estado.orgao_ativo.nome}${estado.orgao_ativo.comarca ? " · " + estado.orgao_ativo.comarca : ""}`;
    return "Sem órgão ativo";
  }, [estado, overrideOrgaoId]);

  async function onSubmit(values: CreateTeamMemberInput) {
    try {
      await invite.mutateAsync({
        nomeCompleto: values.nomeCompleto,
        email: values.email,
        matricula: values.matricula || undefined,
        funcaoInterna: values.funcaoInterna,
        outraFuncao: values.outraFuncao || undefined,
        telefone: values.telefone || undefined,
        orgaoId: overrideOrgaoId ?? null,
        justificativa: showOrgSelector ? justificativa : null,
      });
      toast.success("Convite enviado", {
        description: `${values.email} receberá um e-mail para criar seu acesso.`,
      });
      form.reset();
      setJustificativa("");
      onOpenChange(false);
    } catch (err) {
      toast.error("Não foi possível convidar o membro", {
        description: friendlyTeamError(err),
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Adicionar membro de equipe</SheetTitle>
          <SheetDescription>
            O membro será vinculado ao seu órgão de execução e receberá um convite para criar o
            próprio acesso.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          <p className="font-mono uppercase tracking-[0.16em] text-muted-foreground">
            Órgão de destino
          </p>
          <p className="mt-1 text-sm font-medium">{orgaoAtivoLabel}</p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nomeCompleto">Nome completo</Label>
            <Input id="nomeCompleto" {...form.register("nomeCompleto")} />
            {form.formState.errors.nomeCompleto && (
              <p className="text-xs text-destructive">
                {form.formState.errors.nomeCompleto.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail institucional</Label>
            <Input id="email" type="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="matricula">Matrícula</Label>
              <Input id="matricula" {...form.register("matricula")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" {...form.register("telefone")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="funcaoInterna">Função interna</Label>
            <Select
              value={funcao}
              onValueChange={(v) =>
                form.setValue("funcaoInterna", v as CreateTeamMemberInput["funcaoInterna"])
              }
            >
              <SelectTrigger id="funcaoInterna">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {funcoesInternas.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {funcao === "outro" && (
            <div className="space-y-1.5">
              <Label htmlFor="outraFuncao">Descreva a função</Label>
              <Input id="outraFuncao" maxLength={100} {...form.register("outraFuncao")} />
              {form.formState.errors.outraFuncao && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.outraFuncao.message}
                </p>
              )}
            </div>
          )}

          {showOrgSelector && (
            <div className="space-y-1.5 rounded-md border border-institutional/40 bg-institutional/5 p-3">
              <Label
                htmlFor="justificativa"
                className="text-xs font-mono uppercase tracking-[0.16em] text-institutional"
              >
                Justificativa técnica (acesso global)
              </Label>
              <Textarea
                id="justificativa"
                minLength={10}
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Descreva o motivo institucional para criar o membro neste órgão."
              />
            </div>
          )}

          <SheetFooter className="mt-6 flex gap-2 sm:flex-row-reverse">
            <Button
              type="submit"
              disabled={invite.isPending || (showOrgSelector && justificativa.trim().length < 10)}
            >
              {invite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar convite
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={invite.isPending}
            >
              Cancelar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
