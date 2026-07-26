import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { OrgaoCombobox, type OrgaoOption } from "@/components/orgao-combobox";
import { MfaChallengeDialog } from "@/components/mfa-challenge-dialog";
import { traduzirErroAtribuicao } from "@/lib/user-role-errors";
import { useEstadoInstitucional } from "@/hooks/use-estado-institucional";

export type AssignDefensorTarget = {
  user_id: string;
  nome_completo: string | null;
  email: string | null;
  matricula: string | null;
  status: string;
  role_atual: string | null;
  orgao_nome: string | null;
  orgao_comarca: string | null;
  email_confirmado: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: AssignDefensorTarget | null;
};

export function AssignDefensorDialog({ open, onOpenChange, target }: Props) {
  const qc = useQueryClient();
  const { data: estado } = useEstadoInstitucional();
  const isAdminTecnico = !!estado?.roles.includes("admin_tecnico");

  const [orgaoId, setOrgaoId] = useState<string | null>(null);
  const [matricula, setMatricula] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);

  const requerJustificativa = !!target?.role_atual && target.role_atual !== "sem_papel";
  const matriculaAtual = (matricula || target?.matricula || "").trim();
  const matriculaValida = matriculaAtual.length >= 1 && matriculaAtual !== "N/D";
  const justificativaValida = !requerJustificativa || justificativa.trim().length >= 10;
  // MFA não é exigido nesta fase — mantido apenas como sinalização informativa se necessário no futuro.
  const aal2Requerido = false;

  const orgaosQ = useQuery({
    queryKey: ["orgaos-execucao-lista"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orgaos_execucao")
        .select("id,nome,comarca")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as OrgaoOption[];
    },
  });

  const reset = () => {
    setOrgaoId(null);
    setMatricula("");
    setJustificativa("");
    setConfirm(false);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!target || !orgaoId) throw new Error("Dados incompletos");
      const idempotencyKey = crypto.randomUUID();
      const { data, error } = await supabase.rpc("admin_assign_defensor_role", {
        p_target_user_id: target.user_id,
        p_orgao_execucao_id: orgaoId,
        p_matricula: matriculaAtual || undefined,
        p_justificativa: requerJustificativa ? justificativa.trim() : undefined,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Papel de Defensor Público atribuído com sucesso.");
      qc.invalidateQueries({ queryKey: ["admin-tecnico", "usuarios"] });
      qc.invalidateQueries({ queryKey: ["admin", "usuarios"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: any) => {
      const info = traduzirErroAtribuicao(e?.message ?? "");
      if (info.needsMfa) {
        setMfaOpen(true);
        toast.warning(info.title, { description: info.description });
        return;
      }
      toast.error(info.title, { description: info.description });
    },
  });

  const podeSubmeter =
    !!target &&
    !!orgaoId &&
    matriculaValida &&
    justificativaValida &&
    confirm &&
    !aal2Requerido &&
    !mutation.isPending;

  const previewOrgao = useMemo(
    () => orgaosQ.data?.find((o) => o.id === orgaoId) ?? null,
    [orgaosQ.data, orgaoId],
  );

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) reset();
          onOpenChange(v);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Definir usuário como Defensor Público</DialogTitle>
            <DialogDescription>
              A atribuição concederá acesso ao ecossistema de informações do órgão de
              execução selecionado.
            </DialogDescription>
          </DialogHeader>

          {target && (
            <div className="rounded border border-border bg-muted/30 p-3 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{target.nome_completo ?? "—"}</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {target.role_atual ?? "sem_papel"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">{target.email ?? "—"}</div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-muted-foreground">
                <div>
                  Matrícula:{" "}
                  <span className="font-mono text-foreground">
                    {target.matricula ?? "—"}
                  </span>
                </div>
                <div>
                  Status:{" "}
                  <span className="font-mono text-foreground">{target.status}</span>
                </div>
                {target.orgao_nome && (
                  <div className="col-span-2">
                    Vínculo atual:{" "}
                    <span className="text-foreground">
                      {target.orgao_nome}
                      {target.orgao_comarca ? ` — ${target.orgao_comarca}` : ""}
                    </span>
                  </div>
                )}
                {!target.email_confirmado && (
                  <div className="col-span-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="inline h-3 w-3 mr-1" />
                    E-mail ainda não confirmado.
                  </div>
                )}
              </div>
            </div>
          )}

          {aal2Requerido && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Confirmação de segurança necessária</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  Para alterar o papel de um usuário, confirme sua autenticação de segurança.
                </p>
                <Button size="sm" variant="outline" onClick={() => setMfaOpen(true)}>
                  <ShieldCheck className="h-4 w-4 mr-1" /> Confirmar autenticação
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="orgao">Órgão de execução *</Label>
              <OrgaoCombobox
                id="orgao"
                value={orgaoId}
                onChange={setOrgaoId}
                options={orgaosQ.data ?? []}
                loading={orgaosQ.isLoading}
              />
              {previewOrgao && (
                <p className="text-xs text-muted-foreground">
                  Vínculo será criado como Defensor Público em{" "}
                  <span className="text-foreground">{previewOrgao.nome}</span>.
                </p>
              )}
            </div>

            {(!target?.matricula || target.matricula === "N/D") && (
              <div className="space-y-1.5">
                <Label htmlFor="matricula">Matrícula institucional *</Label>
                <Input
                  id="matricula"
                  value={matricula}
                  onChange={(e) => setMatricula(e.target.value)}
                  placeholder="Ex.: 12345-6"
                  maxLength={30}
                />
                <p className="text-xs text-muted-foreground">
                  Obrigatória para Defensor Público.
                </p>
              </div>
            )}

            {requerJustificativa && (
              <div className="space-y-1.5">
                <Label htmlFor="justificativa">Justificativa administrativa *</Label>
                <Textarea
                  id="justificativa"
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  rows={3}
                  minLength={10}
                  maxLength={2000}
                  placeholder="Registre o motivo institucional da alteração de papel."
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo de 10 caracteres. {justificativa.trim().length}/10
                </p>
              </div>
            )}

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={confirm}
                onCheckedChange={(v) => setConfirm(v === true)}
                id="confirm"
                className="mt-0.5"
              />
              <span>
                Confirmo que este usuário está autorizado a atuar como Defensor Público
                no órgão selecionado.
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={!podeSubmeter}
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirmar atribuição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MfaChallengeDialog
        open={mfaOpen}
        onOpenChange={setMfaOpen}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["estado-institucional"] });
        }}
      />
    </>
  );
}
