import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

const AREAS = [
  "Infância e Juventude",
  "Infância e Família",
  "Atuação Regional",
  "Núcleo Especializado",
  "Outra",
] as const;

const schema = z.object({
  sigla: z
    .string()
    .trim()
    .max(30, "Máximo de 30 caracteres.")
    .optional()
    .or(z.literal("")),
  nome: z
    .string()
    .trim()
    .min(5, "Mínimo de 5 caracteres.")
    .max(200, "Máximo de 200 caracteres."),
  area_atuacao: z.enum(AREAS),
  area_outra: z.string().trim().max(120).optional().or(z.literal("")),
  comarca: z.string().trim().min(2, "Comarca obrigatória.").max(120),
  municipio: z.string().trim().min(2, "Município obrigatório.").max(120),
  descricao: z
    .string()
    .trim()
    .max(1000, "Máximo de 1.000 caracteres.")
    .optional()
    .or(z.literal("")),
  status: z.enum(["ativo", "inativo"]),
});

type FormValues = z.infer<typeof schema>;

type Duplicate = {
  id: string;
  nome: string;
  sigla: string | null;
  comarca: string | null;
  municipio: string | null;
  status: string;
};

type RpcResult =
  | { ok: true; orgao_id: string; idempotent?: boolean }
  | { ok: false; code: "possible_duplicates"; message: string; duplicates: Duplicate[] };

export function OrgaoNovoSheet({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null);
  const [override, setOverride] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const qc = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      sigla: "",
      nome: "",
      area_atuacao: "Infância e Juventude",
      area_outra: "",
      comarca: "",
      municipio: "",
      descricao: "",
      status: "ativo",
    },
  });

  const area = form.watch("area_atuacao");
  const descricao = form.watch("descricao") ?? "";
  const sigla = form.watch("sigla") ?? "";

  const areaResolved = useMemo(() => {
    if (area === "Outra") return form.getValues("area_outra")?.trim() || "Outra";
    return area;
  }, [area, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const areaFinal =
        values.area_atuacao === "Outra"
          ? (values.area_outra || "").trim() || "Outra"
          : values.area_atuacao;

      const { data, error } = await supabase.rpc(
        "admin_create_orgao_execucao" as never,
        {
          p_nome: values.nome,
          p_sigla: values.sigla?.trim() ? values.sigla.trim().toUpperCase() : null,
          p_comarca: values.comarca,
          p_municipio: values.municipio,
          p_estado: "RS",
          p_area_atuacao: areaFinal,
          p_descricao: values.descricao?.trim() || null,
          p_status: values.status,
          p_duplicate_override_reason: override.trim() || null,
          p_idempotency_key: idempotencyKey,
        } as never,
      );
      if (error) throw error;
      return data as unknown as RpcResult;
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Órgão criado com sucesso.");
        setDuplicates(null);
        setOverride("");
        form.reset();
        setOpen(false);
        qc.invalidateQueries({ queryKey: ["admin-tecnico", "orgaos"] });
        qc.invalidateQueries({ queryKey: ["orgaos-execucao-admin"] });
      } else if (result.code === "possible_duplicates") {
        setDuplicates(result.duplicates);
      }
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Falha ao criar órgão.");
    },
  });

  const onSubmit = form.handleSubmit((values) => mutation.mutate(values));

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setDuplicates(null);
          setOverride("");
        }
      }}
    >
      <SheetTrigger asChild>
        <Button disabled={disabled} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden />
          Novo órgão
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Novo órgão de execução</SheetTitle>
          <SheetDescription>
            Cadastre uma unidade institucional que poderá receber Defensores
            Públicos, membros de equipe e registros operacionais.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="mt-6 space-y-6">
          <section className="space-y-4">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Identificação
            </h3>
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <div className="space-y-1.5">
                <Label htmlFor="sigla">Sigla ou código</Label>
                <Input
                  id="sigla"
                  autoComplete="off"
                  className="uppercase"
                  placeholder="Opcional"
                  {...form.register("sigla")}
                  onChange={(e) => {
                    e.target.value = e.target.value.toUpperCase();
                    form.setValue("sigla", e.target.value, {
                      shouldValidate: true,
                    });
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Até 30 caracteres. {sigla.length}/30
                </p>
                {form.formState.errors.sigla && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.sigla.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome oficial</Label>
                <Input
                  id="nome"
                  placeholder="Ex.: 1ª Defensoria Pública da Infância e Juventude de Porto Alegre"
                  {...form.register("nome")}
                />
                {form.formState.errors.nome && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.nome.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Área de atuação</Label>
                <Select
                  value={area}
                  onValueChange={(v) =>
                    form.setValue("area_atuacao", v as FormValues["area_atuacao"], {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AREAS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {area === "Outra" && (
                <div className="space-y-1.5">
                  <Label htmlFor="area_outra">Descreva a área</Label>
                  <Input id="area_outra" {...form.register("area_outra")} />
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Localização
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="comarca">Comarca</Label>
                <Input id="comarca" {...form.register("comarca")} />
                {form.formState.errors.comarca && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.comarca.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="municipio">Município</Label>
                <Input id="municipio" {...form.register("municipio")} />
                {form.formState.errors.municipio && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.municipio.message}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Input value="Rio Grande do Sul — RS" disabled readOnly />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Informações complementares
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea
                id="descricao"
                rows={4}
                {...form.register("descricao")}
              />
              <p className="text-[11px] text-muted-foreground">
                {descricao.length}/1000
              </p>
              {form.formState.errors.descricao && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.descricao.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Situação inicial</Label>
              <Select
                value={form.watch("status")}
                onValueChange={(v) =>
                  form.setValue("status", v as "ativo" | "inativo", {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          {duplicates && duplicates.length > 0 && (
            <section className="rounded-md border border-warning/40 bg-warning/10 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 text-warning"
                  aria-hidden
                />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">
                    Encontramos órgãos possivelmente semelhantes.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Revise os registros antes de confirmar uma nova criação.
                  </p>
                  <ul className="space-y-1 text-xs">
                    {duplicates.map((d) => (
                      <li key={d.id} className="rounded border border-border bg-background p-2">
                        <p className="font-medium">
                          {d.sigla ? `${d.sigla} — ` : ""}
                          {d.nome}
                        </p>
                        <p className="text-muted-foreground">
                          {[d.comarca, d.municipio].filter(Boolean).join(" · ")}{" "}
                          · <span className="font-mono">{d.status}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                  <div className="space-y-1.5 pt-2">
                    <Label htmlFor="override">
                      Justificativa para prosseguir mesmo assim (mín. 10 caracteres)
                    </Label>
                    <Textarea
                      id="override"
                      rows={2}
                      value={override}
                      onChange={(e) => setOverride(e.target.value)}
                    />
                  </div>
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
                (duplicates !== null && override.trim().length < 10)
              }
            >
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              {duplicates ? "Confirmar criação" : "Criar órgão"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
