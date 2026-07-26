import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useEstadoInstitucional } from "@/hooks/use-estado-institucional";
import { useChangeDefenderOrg } from "@/hooks/use-team";
import { friendlyTeamError } from "@/lib/team-errors";

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

export function ChangeOrgSheet({ open, onOpenChange }: Props) {
  const { data: estado, refetch } = useEstadoInstitucional();
  const change = useChangeDefenderOrg();
  const [selectedId, setSelectedId] = useState("");
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
    enabled: open,
  });

  const currentId = estado?.orgao_ativo?.id ?? null;
  const disponiveis = (orgaosQ.data ?? []).filter((o) => o.id !== currentId);
  const alvo = disponiveis.find((o) => o.id === selectedId) ?? null;

  async function confirmar() {
    try {
      await change.mutateAsync({
        newOrgaoId: selectedId,
        expectedCurrentMembershipId: estado?.membership?.id ?? null,
      });
      toast.success("Órgão de execução alterado.");
      setConfirmOpen(false);
      setSelectedId("");
      onOpenChange(false);
      await refetch();
    } catch (e) {
      toast.error(friendlyTeamError(e as Error));
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Alterar órgão de execução</SheetTitle>
            <SheetDescription>
              A alteração é imediata. Sua nova área de trabalho refletirá o
              novo órgão. Nenhum cadastro é apagado; apenas seu vínculo ativo
              muda.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            <div className="rounded-md border border-border bg-canvas/40 p-4 text-sm">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Vínculo atual
              </p>
              <p className="mt-1 font-medium">
                {estado?.orgao_ativo?.nome ?? "Sem vínculo"}
              </p>
              {estado?.orgao_ativo?.comarca && (
                <p className="text-xs text-muted-foreground">
                  Comarca de {estado.orgao_ativo.comarca}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="novo-orgao">Novo órgão</Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger id="novo-orgao">
                  <SelectValue placeholder={orgaosQ.isLoading ? "Carregando..." : "Selecione"} />
                </SelectTrigger>
                <SelectContent>
                  {disponiveis.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nome}
                      {o.comarca ? ` — ${o.comarca}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              <p className="text-muted-foreground">
                Após a alteração, sua Área de trabalho passará a exibir o
                quadro do novo órgão. O quadro anterior permanece disponível
                para os demais membros daquele órgão.
              </p>
            </div>
          </div>

          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!alvo || change.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              {change.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              <Building2 className="mr-2 h-4 w-4" aria-hidden />
              Alterar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar alteração de órgão?</AlertDialogTitle>
            <AlertDialogDescription>
              Você passará a atuar em <strong>{alvo?.nome}</strong>
              {alvo?.comarca ? ` (Comarca de ${alvo.comarca})` : ""}. A ação é
              registrada em auditoria e efetiva imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmar}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
