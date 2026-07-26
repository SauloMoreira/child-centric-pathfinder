import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Building2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useEstadoInstitucional,
  isDefensor,
} from "@/hooks/use-estado-institucional";
import { useTeamMembers, useChangeDefenderOrg } from "@/hooks/use-team";
import { friendlyTeamError } from "@/lib/team-errors";

export const Route = createFileRoute("/_authenticated/alterar-orgao")({
  head: () => ({
    meta: [
      { title: "Alterar órgão de execução — Reintegra" },
      {
        name: "description",
        content:
          "Fluxo institucional para o Defensor Público alterar seu órgão de execução ativo.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AlterarOrgaoPage,
});

function AlterarOrgaoPage() {
  const { data: estado } = useEstadoInstitucional();
  const navigate = useNavigate();
  const defensor = isDefensor(estado);
  const team = useTeamMembers();
  const change = useChangeDefenderOrg();
  const [selectedId, setSelectedId] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const orgaosQ = useQuery({
    queryKey: ["orgaos-execucao-todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orgaos_execucao")
        .select("id, nome, comarca")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!defensor) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Sem acesso</CardTitle>
            <CardDescription>
              Somente Defensores Públicos podem alterar o próprio órgão de execução.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const orgaoAtual = estado?.orgao_ativo;
  const membrosCount = team.data?.length ?? 0;
  const selected =
    orgaosQ.data?.find((o) => o.id === selectedId) ?? null;

  async function confirmar() {
    if (!selectedId) return;
    try {
      await change.mutateAsync({
        newOrgaoId: selectedId,
        expectedCurrentMembershipId: null,
      });
      toast.success("Órgão alterado com sucesso");
      navigate({ to: "/painel" });
    } catch (err) {
      toast.error("Não foi possível alterar o órgão", {
        description: friendlyTeamError(err),
      });
    } finally {
      setConfirmOpen(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <Link
        to="/conta"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Voltar para Minha conta
      </Link>

      <h1 className="text-xl font-semibold">Alterar órgão de execução</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A alteração encerra seu vínculo atual e cria um novo vínculo ativo.
        Nenhum membro ou dado será transferido automaticamente.
      </p>

      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Órgão atual</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-start gap-3">
            <Building2
              className="mt-0.5 h-5 w-5 text-muted-foreground"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {orgaoAtual?.nome ?? "Sem órgão ativo"}
              </p>
              <p className="text-xs text-muted-foreground">
                {orgaoAtual?.comarca ?? "—"}
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {membrosCount} membro(s) na equipe atual
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Novo órgão</CardTitle>
          <CardDescription>
            Selecione o órgão de execução de destino.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="orgao-novo">Órgão de destino</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger id="orgao-novo">
                <SelectValue
                  placeholder={
                    orgaosQ.isLoading
                      ? "Carregando órgãos..."
                      : "Selecione um órgão"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {(orgaosQ.data ?? [])
                  .filter((o) => o.id !== orgaoAtual?.id)
                  .map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      <span className="font-medium">{o.nome}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {o.comarca}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selected && orgaoAtual && selected.id !== orgaoAtual.id && (
        <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 text-warning-foreground"
              aria-hidden
            />
            <div>
              <p className="font-medium text-warning-foreground">
                Impacto da alteração
              </p>
              <p className="mt-1 text-xs text-warning-foreground/90">
                Ao alterar seu órgão de execução, você deixará de administrar a
                equipe e os registros do órgão atual. Nenhum membro ou dado
                será transferido automaticamente. Os {membrosCount} membro(s)
                do órgão anterior permanecerão vinculados ao órgão de origem.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link to="/conta">Cancelar</Link>
        </Button>
        <Button
          disabled={!selectedId || change.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {change.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Confirmar alteração
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar alteração de órgão</AlertDialogTitle>
            <AlertDialogDescription>
              Você deixará <b>{orgaoAtual?.nome}</b> e passará a atuar em{" "}
              <b>{selected?.nome}</b>. Esta ação será registrada em auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmar();
              }}
            >
              Alterar órgão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
