import { useState } from "react";
import { toast } from "sonner";
import { Scale } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection } from "@/components/common/form-section";
import { FormActions } from "@/components/common/form-actions";
import { DateField } from "@/components/common/date-field";
import { VinculoAssistidoPicker } from "@/components/assistidos/vinculo-assistido-picker";
import { formatCnj, isValidCnj, stripCnj } from "@/lib/validators/cnj";
import { useCadastrarProcesso } from "@/hooks/use-cadastro-processo";

export function CadastrarProcessoSheet({
  open,
  onOpenChange,
  orgaoId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgaoId?: string | null;
}) {
  const [numero, setNumero] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [status, setStatus] = useState<string>("nenhum");
  const [assistidoIds, setAssistidoIds] = useState<string[]>([]);

  const cadastrar = useCadastrarProcesso();

  function reset() {
    setNumero(""); setDataInicio(""); setStatus("nenhum"); setAssistidoIds([]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const digits = stripCnj(numero);
    if (!isValidCnj(digits)) {
      toast.error("Número CNJ inválido. Verifique os 20 dígitos.");
      return;
    }
    if (!dataInicio) {
      toast.error("Informe a data de início.");
      return;
    }
    if (assistidoIds.length === 0) {
      toast.error("Vincule pelo menos um assistido.");
      return;
    }
    try {
      const res = await cadastrar.mutateAsync({
        numeroProcesso: formatCnj(digits),
        dataInicio,
        status: status === "nenhum" ? null : status,
        assistidoIds,
        orgaoId: orgaoId ?? null,
      });
      if (!res.ok && res.code === "PROCESS_ALREADY_EXISTS") {
        toast.error("Já existe processo com este número neste órgão.");
        return;
      }
      if (res.ok) {
        toast.success("Processo judicial cadastrado com sucesso.");
        reset();
        onOpenChange(false);
      }
    } catch {
      toast.error("Não foi possível concluir o cadastro. Tente novamente.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4" aria-hidden /> Cadastrar processo judicial
          </SheetTitle>
          <SheetDescription>
            Vincule o processo aos assistidos envolvidos. Um processo pode ter várias pessoas.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            <FormSection title="Identificação processual">
              <div>
                <Label htmlFor="cnj">Número do processo (CNJ) *</Label>
                <Input
                  id="cnj"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="0000000-00.0000.0.00.0000"
                  maxLength={25}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="di">Data de início *</Label>
                  <DateField id="di" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} required />
                </div>
                <div>
                  <Label>Situação</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue placeholder="Não informado" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Não informar</SelectItem>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="suspenso">Suspenso</SelectItem>
                      <SelectItem value="arquivado">Arquivado</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </FormSection>

            <FormSection
              title="Assistidos vinculados *"
              description="Selecione adultos, crianças ou adolescentes já cadastrados."
            >
              <VinculoAssistidoPicker
                categoria="todos"
                selectedIds={assistidoIds}
                onChange={setAssistidoIds}
                triggerLabel="Adicionar assistido"
              />
            </FormSection>
          </div>

          <FormActions
            onCancel={() => onOpenChange(false)}
            loading={cadastrar.isPending}
            disabled={assistidoIds.length === 0}
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}
