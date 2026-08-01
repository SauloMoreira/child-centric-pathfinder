import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileUp, Loader2, Save, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  gerarAtendimentoComIA,
  listarContextosAtendimentoIA,
  salvarContextoAtendimentoIA,
  excluirContextoAtendimentoIA,
  obterPreferenciasAtendimentoIA,
  salvarPreferenciasAtendimentoIA,
  ATENDIMENTO_IA_MAX_FILE_BYTES,
} from "@/lib/reintegra-api";
import type {
  AtendimentoFormField,
  AtendimentoIaContexto,
  AtendimentoIaPreferencias,
} from "@/lib/reintegra-api";

/** Valor reservado para a opção "criar um novo contexto" no seletor —
 * nenhum contexto salvo pode ter esse id (são uuids gerados pelo banco). */
const NOVO_CONTEXTO = "__novo__";

interface AtendimentoIaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (result: {
    personName: string;
    context: string;
    campos: AtendimentoFormField[];
    file: File;
  }) => void;
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

  // Contextos salvos pelo usuário (bloco doc: opções pré-estabelecidas,
  // selecionáveis, criáveis e excluíveis — sempre vinculadas ao usuário).
  const [contextos, setContextos] = useState<AtendimentoIaContexto[]>([]);
  const [contextosCarregando, setContextosCarregando] = useState(false);
  const [contextoSelecionadoId, setContextoSelecionadoId] = useState<string>(NOVO_CONTEXTO);
  const [salvarAberto, setSalvarAberto] = useState(false);
  const [nomeParaSalvar, setNomeParaSalvar] = useState("");
  const [salvandoContexto, setSalvandoContexto] = useState(false);
  const [contextoParaExcluir, setContextoParaExcluir] = useState<AtendimentoIaContexto | null>(null);
  // Ajuste doc (AJUSTE 5) — popover de seleção de contexto salvo, com
  // busca interna para quando houver muitos contextos.
  const [contextoPopoverAberto, setContextoPopoverAberto] = useState(false);
  const [buscaContexto, setBuscaContexto] = useState("");

  // Ajuste doc (AJUSTE 13) — "Configurações opcionais", persistidas por
  // usuário para se manterem em usos futuros.
  const [configOpen, setConfigOpen] = useState(false);
  const [prefs, setPrefs] = useState<AtendimentoIaPreferencias>({
    campoTipo: "curto",
    respostasObrigatorias: false,
    gerarSugestoes: true,
    exibirJustificativa: false,
  });

  useEffect(() => {
    if (!open) return;
    obterPreferenciasAtendimentoIA()
      .then(setPrefs)
      .catch(() => {
        // silencioso — mantém os padrões se falhar ao carregar
      });
  }, [open]);

  const atualizarPrefs = (patch: Partial<AtendimentoIaPreferencias>) => {
    const novo = { ...prefs, ...patch };
    setPrefs(novo);
    salvarPreferenciasAtendimentoIA(novo).catch(() => {
      toast.error("Não foi possível salvar a preferência.");
    });
  };

  const carregarContextos = async () => {
    setContextosCarregando(true);
    try {
      const lista = await listarContextosAtendimentoIA();
      setContextos(lista);
    } catch {
      toast.error("Não foi possível carregar os contextos salvos.");
    } finally {
      setContextosCarregando(false);
    }
  };

  useEffect(() => {
    if (open) carregarContextos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const resetAndClose = () => {
    if (gerando) return;
    setPersonName("");
    setContext("");
    setFile(null);
    setContextoSelecionadoId(NOVO_CONTEXTO);
    setSalvarAberto(false);
    setNomeParaSalvar("");
    onOpenChange(false);
  };

  const handleSelecionarContexto = (value: string) => {
    setContextoSelecionadoId(value);
    setSalvarAberto(false);
    if (value === NOVO_CONTEXTO) {
      setContext("");
      return;
    }
    const encontrado = contextos.find((c) => c.id === value);
    setContext(encontrado?.texto ?? "");
  };

  const handleContextChange = (value: string) => {
    setContext(value);
    // Editar o texto descola do contexto salvo selecionado — evita que o
    // usuário pense que está editando o registro salvo sem confirmar.
    if (contextoSelecionadoId !== NOVO_CONTEXTO) setContextoSelecionadoId(NOVO_CONTEXTO);
  };

  const handleConfirmarSalvarContexto = async () => {
    if (!nomeParaSalvar.trim() || !context.trim()) return;
    setSalvandoContexto(true);
    try {
      await salvarContextoAtendimentoIA({ nome: nomeParaSalvar.trim(), texto: context.trim() });
      toast.success("Contexto salvo para reutilização futura.");
      setSalvarAberto(false);
      setNomeParaSalvar("");
      await carregarContextos();
    } catch {
      toast.error("Não foi possível salvar o contexto. Tente novamente.");
    } finally {
      setSalvandoContexto(false);
    }
  };

  const handleExcluirContexto = async () => {
    if (!contextoParaExcluir) return;
    try {
      await excluirContextoAtendimentoIA({ contextId: contextoParaExcluir.id });
      toast.success("Contexto excluído.");
      if (contextoSelecionadoId === contextoParaExcluir.id) {
        setContextoSelecionadoId(NOVO_CONTEXTO);
        setContext("");
      }
      setContextoParaExcluir(null);
      await carregarContextos();
    } catch {
      toast.error("Não foi possível excluir o contexto.");
    }
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
      const camposBrutos = await gerarAtendimentoComIA({
        personName: personName.trim(),
        context: context.trim(),
        file,
        campoTipo: prefs.campoTipo,
        gerarSugestoes: prefs.gerarSugestoes,
      });
      // Ajuste doc (AJUSTE 13) — aplica a preferência de respostas
      // opcionais/obrigatórias (padrão: opcionais) já na geração.
      const campos = camposBrutos.map((c) => ({ ...c, required: prefs.respostasObrigatorias }));
      toast.success("Formulário gerado pelo Atendimento IA");
      onGenerated({ personName: personName.trim(), context: context.trim(), campos, file });
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
          {!gerando && (
            <DialogDescription>
              Anexe um documento (peça processual, ofício, decisão judicial, etc) para que, a partir
              do contexto indicado, seja elaborado o atendimento.
            </DialogDescription>
          )}
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
              <Label htmlFor="atendimento-ia-nome">Nome da pessoa a ser atendida</Label>
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
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="atendimento-ia-contexto">Contexto</Label>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-institutional disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!context.trim()}
                    title="Salvar contexto"
                    aria-label="Salvar contexto"
                    onClick={() => {
                      setNomeParaSalvar("");
                      setSalvarAberto(true);
                    }}
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <Popover
                    open={contextoPopoverAberto}
                    onOpenChange={(v) => {
                      setContextoPopoverAberto(v);
                      if (!v) setBuscaContexto("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Contextos salvos"
                        aria-label="Contextos salvos"
                      >
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-64 p-1.5">
                      {contextos.length > 3 && (
                        <Input
                          autoFocus
                          value={buscaContexto}
                          onChange={(e) => setBuscaContexto(e.target.value)}
                          placeholder="Buscar contexto salvo…"
                          className="mb-1.5 h-7 bg-surface text-xs"
                        />
                      )}
                      <div className="max-h-56 space-y-0.5 overflow-y-auto">
                        {contextosCarregando ? (
                          <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Carregando…</p>
                        ) : contextos.filter((c) =>
                            c.nome.toLowerCase().includes(buscaContexto.trim().toLowerCase()),
                          ).length === 0 ? (
                          <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                            {contextos.length === 0
                              ? "Nenhum contexto salvo ainda."
                              : "Nenhum contexto encontrado."}
                          </p>
                        ) : (
                          contextos
                            .filter((c) => c.nome.toLowerCase().includes(buscaContexto.trim().toLowerCase()))
                            .map((c) => (
                              <div
                                key={c.id}
                                className="group flex items-center gap-1 rounded hover:bg-muted"
                              >
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs"
                                  onClick={() => {
                                    handleSelecionarContexto(c.id);
                                    setContextoPopoverAberto(false);
                                  }}
                                >
                                  {c.nome}
                                </button>
                                <button
                                  type="button"
                                  className="mr-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                                  aria-label={`Excluir contexto ${c.nome}`}
                                  title="Excluir contexto salvo"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setContextoParaExcluir(c);
                                    setContextoPopoverAberto(false);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" aria-hidden />
                                </button>
                              </div>
                            ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <Textarea
                id="atendimento-ia-contexto"
                className="resize-none bg-surface text-xs"
                value={context}
                onChange={(e) => handleContextChange(e.target.value)}
                placeholder='Ex.: "Se trata de atendimento para contestação, refutando os fatos narrados na petição inicial anexada."'
                rows={5}
              />

              {salvarAberto && (
                <div className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    className="h-7 flex-1 bg-surface text-xs"
                    placeholder="Nome do contexto (ex.: Contestação de alimentos)"
                    value={nomeParaSalvar}
                    onChange={(e) => setNomeParaSalvar(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleConfirmarSalvarContexto()}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    disabled={!nomeParaSalvar.trim() || salvandoContexto}
                    onClick={handleConfirmarSalvarContexto}
                  >
                    {salvandoContexto ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setSalvarAberto(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>

            {/* Ajuste doc (AJUSTE 13) — Configurações opcionais, com
                preferências mantidas por usuário para usos futuros. */}
            <div className="space-y-1.5">
              <button
                type="button"
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setConfigOpen((v) => !v)}
              >
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", configOpen && "rotate-180")}
                  aria-hidden
                />
                Configurações opcionais
              </button>
              {configOpen && (
                <div className="space-y-2.5 rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="cfg-campo-tipo" className="text-[11px] font-normal">
                      Campos de resposta em texto curto ou longo
                    </Label>
                    <Select
                      value={prefs.campoTipo}
                      onValueChange={(v) => atualizarPrefs({ campoTipo: v as "curto" | "ambos" })}
                    >
                      <SelectTrigger id="cfg-campo-tipo" className="h-7 w-[220px] text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="curto">Sempre texto curto (compacto)</SelectItem>
                        <SelectItem value="ambos">Curto ou longo, conforme a pergunta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="cfg-obrigatorias" className="text-[11px] font-normal">
                      Respostas opcionais ou obrigatórias
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        {prefs.respostasObrigatorias ? "Obrigatórias" : "Opcionais"}
                      </span>
                      <Switch
                        id="cfg-obrigatorias"
                        checked={prefs.respostasObrigatorias}
                        onCheckedChange={(v) => atualizarPrefs({ respostasObrigatorias: v })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="cfg-sugestoes" className="text-[11px] font-normal">
                      Gerar respostas sugeridas
                    </Label>
                    <Switch
                      id="cfg-sugestoes"
                      checked={prefs.gerarSugestoes}
                      onCheckedChange={(v) => atualizarPrefs({ gerarSugestoes: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="cfg-justificativa" className="text-[11px] font-normal">
                      Exibir justificativa das perguntas
                    </Label>
                    <Switch
                      id="cfg-justificativa"
                      checked={prefs.exibirJustificativa}
                      onCheckedChange={(v) => atualizarPrefs({ exibirJustificativa: v })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="atendimento-ia-arquivo">Documento</Label>
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
                  Selecionar arquivo PDF (até {formatarMB(ATENDIMENTO_IA_MAX_FILE_BYTES)} MB)
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
          </div>
        )}

        <DialogFooter className="mt-6 shrink-0">
          <Button variant="outline" onClick={resetAndClose} disabled={gerando}>
            Cancelar
          </Button>
          <Button onClick={handleGerar} disabled={!podeGerar}>
            {gerando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Iniciar atendimento
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={!!contextoParaExcluir} onOpenChange={(o) => !o && setContextoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contexto salvo?</AlertDialogTitle>
            <AlertDialogDescription>
              O contexto “{contextoParaExcluir?.nome}” será excluído e não poderá mais ser
              reutilizado em futuros atendimentos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleExcluirContexto}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
