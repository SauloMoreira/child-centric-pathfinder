import { useRef, useState } from "react";
import { FileUp, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { gerarAtendimentoComIA, ATENDIMENTO_IA_MAX_FILE_BYTES } from "@/lib/reintegra-api";
import type { AtendimentoFormField } from "@/lib/reintegra-api";

interface AtendimentoIaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (result: { personName: string; context: string; campos: AtendimentoFormField[] }) => void;
}

function primeiroNome(nomeCompleto: string): string {
  return nomeCompleto.trim().split(/\s+/)[0] || "a pessoa atendida";
}

function formatarMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/** Mensagens amigáveis para os códigos de erro do Atendimento IA. */
function mensagemErroAtendimentoIA(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (msg.includes("INVALID_FILE_TYPE")) return "Só é possível anexar arquivos em PDF.";
  if (msg.includes("FILE_TOO_LARGE"))
    return `O arquivo excede o limite de ${formatarMB(ATENDIMENTO_IA_MAX_FILE_BYTES)}MB.`;
  if (msg.includes("RATE_LIMITED"))
    return "Muitas solicitações agora. Aguarde um instante e tente novamente.";
  if (msg.includes("AI_CREDITS_EXHAUSTED"))
    return "O saldo de IA do projeto no Lovable acabou. Verifique em Configurações → Cloud & AI balance.";
  if (msg.includes("UNAUTHENTICATED")) return "Sua sessão expirou. Recarregue a página.";
  if (msg.includes("AI_GATEWAY_UNREACHABLE"))
    return "Não foi possível contatar o serviço de IA (função indisponível ou não publicada). Detalhe técnico: " + msg;
  if (msg.includes("AI_GATEWAY_ERROR"))
    return "O serviço de IA retornou um erro. Detalhe técnico: " + msg;
  if (msg.includes("EMPTY_AI_RESPONSE") || msg.includes("INVALID_AI_JSON"))
    return "Não foi possível formular as perguntas a partir do documento. Tente novamente ou revise o contexto informado.";
  if (msg.includes("INVALID_PAYLOAD") || msg.includes("INVALID_JSON"))
    return "Preencha o nome, o contexto e anexe um documento antes de gerar.";
  return "Não foi possível gerar o atendimento agora. Detalhe técnico: " + (msg || "erro desconhecido");
}

/**
 * Bloco doc "IMPLEMENTAÇÃO DO ATENDIMENTO IA" — caixa de entrada: nome
 * completo da pessoa a ser atendida, contexto em texto livre e upload de
 * um único PDF (até 60MB). Ao clicar em "Gerar atendimento", a IA analisa
 * o documento e formula as perguntas do formulário. O arquivo nunca é
 * salvo — trafega só nessa chamada e é descartado.
 */
export function AtendimentoIaDialog({ open, onOpenChange, onGenerated }: AtendimentoIaDialogProps) {
  const [personName, setPersonName] = useState("");
  const [context, setContext] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [gerando, setGerando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetAndClose = () => {
    if (gerando) return;
    setPersonName("");
    setContext("");
    setFile(null);
    onOpenChange(false);
  };

  const handleFileChange = (f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    if (f.type !== "application/pdf") {
      toast.error("Só é possível anexar arquivos em PDF.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (f.size > ATENDIMENTO_IA_MAX_FILE_BYTES) {
      toast.error(`O arquivo excede o limite de ${formatarMB(ATENDIMENTO_IA_MAX_FILE_BYTES)}MB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(f);
  };

  const podeGerar = personName.trim() && context.trim() && file && !gerando;

  const handleGerar = async () => {
    if (!file || !personName.trim() || !context.trim()) {
      toast.error("Preencha o nome, o contexto e anexe um documento em PDF.");
      return;
    }
    setGerando(true);
    try {
      const campos = await gerarAtendimentoComIA({
        personName: personName.trim(),
        context: context.trim(),
        file,
      });
      toast.success("Formulário gerado pelo Atendimento IA");
      onGenerated({ personName: personName.trim(), context: context.trim(), campos });
      setPersonName("");
      setContext("");
      setFile(null);
      onOpenChange(false);
    } catch (e) {
      toast.error(mensagemErroAtendimentoIA(e));
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && resetAndClose()}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-lg flex-col gap-0 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-institutional" />
            Atendimento IA
          </DialogTitle>
          <DialogDescription>
            Anexe um documento (peça processual, minuta, ofício, e-mail etc.) e a IA formula um
            formulário de atendimento pertinente ao caso.
          </DialogDescription>
        </DialogHeader>

        {gerando ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-institutional" aria-hidden />
            <p className="max-w-xs text-sm text-muted-foreground">
              Analisando documento e formulando perguntas para {primeiroNome(personName)}…
            </p>
          </div>
        ) : (
          <div className="mt-4 flex-1 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="atendimento-ia-nome">Nome completo da pessoa a ser atendida</Label>
              <Input
                id="atendimento-ia-nome"
                className="bg-surface text-xs"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder="Ex.: Maria da Silva Santos"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="atendimento-ia-contexto">Contexto</Label>
              <Textarea
                id="atendimento-ia-contexto"
                className="resize-none bg-surface text-xs"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder='Ex.: "Se trata de atendimento para contestação, refutando os fatos narrados na petição inicial anexada."'
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="atendimento-ia-arquivo">Documento (PDF, até {formatarMB(ATENDIMENTO_IA_MAX_FILE_BYTES)}MB)</Label>
              {file ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs">
                  <FileUp className="h-3.5 w-3.5 shrink-0 text-institutional" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-muted-foreground">{formatarMB(file.size)}MB</span>
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                    aria-label="Remover arquivo"
                    onClick={() => handleFileChange(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="atendimento-ia-arquivo"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface px-3 py-4 text-xs text-muted-foreground hover:border-institutional/50 hover:text-foreground"
                >
                  <FileUp className="h-3.5 w-3.5" aria-hidden />
                  Selecionar arquivo PDF
                </label>
              )}
              <input
                ref={fileInputRef}
                id="atendimento-ia-arquivo"
                type="file"
                accept="application/pdf"
                className="sr-only"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
            </div>

            <p className="text-[10px] text-muted-foreground">
              O documento e as respostas não são salvos no sistema — tudo é descartado ao fechar
              esta caixa ou atualizar a página.
            </p>
          </div>
        )}

        <DialogFooter className="mt-6 shrink-0">
          <Button variant="outline" onClick={resetAndClose} disabled={gerando}>
            Cancelar
          </Button>
          <Button onClick={handleGerar} disabled={!podeGerar}>
            {gerando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Gerar atendimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
