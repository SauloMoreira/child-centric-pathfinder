import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "@tanstack/react-router";
import { Loader2, Plus, AlertTriangle, Pencil, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ComarcaCombobox, normalizeComarca } from "@/components/comarca-combobox";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  useEstadoInstitucional,
  isAdminTecnico,
} from "@/hooks/use-estado-institucional";

const MFA_ERROR_PATTERNS = [
  "AAL2",
  "MFA",
  "aal2",
  "mfa",
  "insufficient_aal",
] as const;

const MFA_GUIDANCE_MESSAGE =
  "Para criar órgãos, o Administrador Técnico precisa concluir a autenticação em dois fatores (MFA). Ative ou confirme o MFA e tente novamente.";

function isMfaError(message: string): boolean {
  return MFA_ERROR_PATTERNS.some((p) => message.includes(p));
}

const orgaoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(5, "Informe o nome completo do órgão de execução.")
    .max(200, "O nome deve possuir no máximo 200 caracteres.")
    .transform((value) => value.replace(/\s+/g, " ")),
  comarca: z
    .string()
    .trim()
    .min(2, "Informe a comarca.")
    .max(120, "A comarca deve possuir no máximo 120 caracteres.")
    .transform((value) => value.replace(/\s+/g, " ")),
});

type FormValues = z.infer<typeof orgaoSchema>;

type RpcResult = {
  ok: true;
  idempotent?: boolean;
  orgao: { id: string; nome: string; comarca: string };
};

export type OrgaoBasico = {
  id: string;
  nome: string;
  comarca: string;
};

type Props = {
  disabled?: boolean;
  mode?: "create" | "edit";
  orgao?: OrgaoBasico;
  trigger?: React.ReactNode;
  comarcasSugeridas?: string[];
};

export function OrgaoNovoSheet({
  disabled,
  mode = "create",
  orgao,
  trigger,
  comarcasSugeridas = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [mfaBlocked, setMfaBlocked] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const qc = useQueryClient();
  const { data: estado } = useEstadoInstitucional();
  const isEdit = mode === "edit" && !!orgao;
  const requiresMfa = isAdminTecnico(estado) && !isEdit;
  const hasAal2 = !!estado?.aal2;
  const mfaMissing = requiresMfa && !hasAal2;

  const form = useForm<FormValues>({
    resolver: zodResolver(orgaoSchema),
    defaultValues: {
      nome: orgao?.nome ?? "",
      comarca: orgao?.comarca ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      setDuplicateId(null);
      setMfaBlocked(false);
      if (!isEdit) setIdempotencyKey(crypto.randomUUID());
      form.reset({
        nome: orgao?.nome ?? "",
        comarca: orgao?.comarca ?? "",
      });
    }
  }, [open, isEdit, orgao, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEdit) {
        const { data, error } = await supabase.rpc(
          "admin_update_orgao_execucao" as never,
          {
            p_id: orgao!.id,
            p_nome: values.nome,
            p_comarca: values.comarca,
          } as never,
        );
        if (error) throw error;
        return data as unknown as RpcResult;
      }
      const { data, error } = await supabase.rpc(
        "admin_create_orgao_execucao" as never,
        {
          p_nome: values.nome,
          p_comarca: values.comarca,
          p_idempotency_key: idempotencyKey,
        } as never,
      );
      if (error) throw error;
      return data as unknown as RpcResult;
    },
    onSuccess: () => {
      toast.success(
        isEdit ? "Órgão atualizado com sucesso." : "Órgão criado com sucesso.",
      );
      setDuplicateId(null);
      form.reset();
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-tecnico", "orgaos"] });
      qc.invalidateQueries({ queryKey: ["orgaos-execucao-admin"] });
      qc.invalidateQueries({ queryKey: ["orgaos-execucao"] });
      qc.invalidateQueries({ queryKey: ["orgaos-admin"] });
    },
    onError: (e: unknown) => {
      const err = e as { message?: string; hint?: string; code?: string };
      const msg = err?.message ?? "";
      if (msg.includes("ORGANIZATION_ALREADY_EXISTS")) {
        setDuplicateId(err.hint ?? null);
        toast.error(
          "Já existe um órgão de execução com este nome na comarca informada.",
        );
        return;
      }
      if (isMfaError(msg)) {
        setMfaBlocked(true);
        toast.error(MFA_GUIDANCE_MESSAGE);
        return;
      }
      toast.error(
        msg || (isEdit ? "Falha ao atualizar órgão." : "Falha ao criar órgão."),
      );
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    if (mfaMissing) {
      setMfaBlocked(true);
      toast.error(MFA_GUIDANCE_MESSAGE);
      return;
    }
    mutation.mutate(values);
  });

  const defaultTrigger = isEdit ? (
    <Button variant="ghost" size="sm" className="gap-1.5">
      <Pencil className="h-3.5 w-3.5" aria-hidden />
      Editar
    </Button>
  ) : (
    <Button disabled={disabled} className="gap-2">
      <Plus className="h-4 w-4" aria-hidden />
      Novo órgão
    </Button>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger ?? defaultTrigger}</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEdit ? "Editar órgão de execução" : "Novo órgão de execução"}
          </SheetTitle>
          <SheetDescription>
            Informe o nome oficial do órgão e a comarca à qual ele pertence.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="mt-6 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="nome">
              Nome do órgão de execução{" "}
              <span className="text-destructive" aria-hidden>
                *
              </span>
            </Label>
            <Input
              id="nome"
              autoComplete="off"
              placeholder="1ª Defensoria Pública da Infância e Juventude"
              maxLength={200}
              {...form.register("nome")}
            />
            {form.formState.errors.nome && (
              <p className="text-xs text-destructive">
                {form.formState.errors.nome.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comarca">
              Comarca{" "}
              <span className="text-destructive" aria-hidden>
                *
              </span>
            </Label>
            <Controller
              control={form.control}
              name="comarca"
              render={({ field, fieldState }) => (
                <ComarcaCombobox
                  id="comarca"
                  value={field.value}
                  onChange={field.onChange}
                  options={comarcasSugeridas}
                  aria-invalid={!!fieldState.error}
                />
              )}
            />
            {form.formState.errors.comarca && (
              <p className="text-xs text-destructive">
                {form.formState.errors.comarca.message}
              </p>
            )}
          </div>

          {duplicateId && (
            <section className="rounded-md border border-warning/40 bg-warning/10 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 text-warning"
                  aria-hidden
                />
                <div className="flex-1 space-y-2 text-xs">
                  <p className="font-medium">
                    Já existe um órgão de execução com este nome na comarca
                    informada.
                  </p>
                  <p className="text-muted-foreground">
                    Não é possível duplicar um órgão na mesma comarca. Você
                    pode consultar o registro existente.
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    ID: {duplicateId}
                  </p>
                </div>
              </div>
            </section>
          )}

          {(mfaMissing || mfaBlocked) && requiresMfa && (
            <section
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3"
            >
              <div className="flex items-start gap-2">
                <ShieldAlert
                  className="mt-0.5 h-4 w-4 text-destructive"
                  aria-hidden
                />
                <div className="flex-1 space-y-2 text-xs">
                  <p className="font-medium">
                    MFA obrigatório para esta operação
                  </p>
                  <p className="text-muted-foreground">
                    {MFA_GUIDANCE_MESSAGE}
                  </p>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    <Link to="/conta">Configurar MFA em Minha conta</Link>
                  </Button>
                </div>
              </div>
            </section>
          )}

          <SheetFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                mfaMissing ||
                !form.watch("nome")?.trim() ||
                !form.watch("comarca")?.trim()
              }
              title={
                mfaMissing
                  ? "Conclua o MFA (AAL2) para criar órgãos."
                  : undefined
              }
            >
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              {isEdit ? "Salvar alterações" : "Criar órgão"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
