import { useState } from "react";
import { toast } from "sonner";
import { Baby } from "lucide-react";
import { z } from "zod";
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
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormSection } from "@/components/common/form-section";
import { FormActions } from "@/components/common/form-actions";
import { DateField } from "@/components/common/date-field";
import { CpfField } from "@/components/common/cpf-field";
import { FotoAssistidoField } from "@/components/assistidos/foto-assistido-field";
import { VinculoAssistidoPicker } from "@/components/assistidos/vinculo-assistido-picker";
import { isValidCpf, stripCpf } from "@/lib/validators/cpf";
import { isMinorAtDate } from "@/lib/validators/age";
import { useCadastrarCrianca } from "@/hooks/use-cadastro-assistido";
import { useUploadFotoAssistido } from "@/hooks/use-upload-foto-assistido";

const schema = z.object({
  prenome: z.string().trim().min(2).max(100),
  sobrenome: z.string().trim().min(2).max(150),
  dataNascimento: z.string().min(1),
  sexoRegistral: z.enum(["feminino", "masculino", "nao_informado"]),
  genero: z.string().trim().max(100).optional().or(z.literal("")),
  cpf: z.string().optional().or(z.literal("")),
  nomeMae: z.string().trim().min(5).max(200),
  nomePai: z.string().trim().max(200).optional().or(z.literal("")),
  duplicateOverrideReason: z.string().optional(),
});

type Familiar = { assistidoId: string; tipo: "pai" | "mae" | "familia_extensa" };

export function CadastrarCriancaSheet({
  open,
  onOpenChange,
  orgaoId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgaoId?: string | null;
}) {
  const [form, setForm] = useState({
    prenome: "",
    sobrenome: "",
    dataNascimento: "",
    sexoRegistral: "nao_informado",
    genero: "",
    cpf: "",
    nomeMae: "",
    nomePai: "",
  });
  const [familiares, setFamiliares] = useState<Familiar[]>([]);
  const [irmaos, setIrmaos] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [duplicates, setDuplicates] = useState<Array<{ id: string; nome: string; data_nascimento: string }>>([]);
  const [overrideReason, setOverrideReason] = useState("");

  const cadastrar = useCadastrarCrianca();
  const upload = useUploadFotoAssistido();

  function reset() {
    setForm({
      prenome: "", sobrenome: "", dataNascimento: "",
      sexoRegistral: "nao_informado", genero: "", cpf: "", nomeMae: "", nomePai: "",
    });
    setFamiliares([]); setIrmaos([]); setFile(null); setDuplicates([]); setOverrideReason("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error("Verifique os campos obrigatórios.");
      return;
    }
    if (!isMinorAtDate(form.dataNascimento)) {
      toast.error("A data de nascimento deve resultar em menor de 18 anos.");
      return;
    }
    const cpfDigits = stripCpf(form.cpf);
    if (cpfDigits && !isValidCpf(cpfDigits)) {
      toast.error("CPF inválido.");
      return;
    }

    const payload = {
      prenome: form.prenome,
      sobrenome: form.sobrenome,
      dataNascimento: form.dataNascimento,
      sexoRegistral: form.sexoRegistral,
      genero: form.genero || null,
      cpf: cpfDigits || null,
      nomeMae: form.nomeMae,
      nomePai: form.nomePai || null,
      familiares,
      irmaos,
      orgaoId: orgaoId ?? null,
      duplicateOverrideReason: overrideReason || null,
    };

    try {
      const res = await cadastrar.mutateAsync(payload);
      if (!res.ok && res.code === "CPF_ALREADY_EXISTS") {
        toast.error("Já existe cadastro com este CPF.");
        return;
      }
      if (!res.ok && res.code === "POSSIBLE_DUPLICATE_ASSISTIDO") {
        setDuplicates(res.candidates);
        toast.warning("Encontramos possíveis cadastros correspondentes. Revise antes de continuar.");
        return;
      }
      if (res.ok) {
        toast.success("Criança ou adolescente cadastrado com sucesso.");
        if (file && orgaoId) {
          const up = await upload.mutateAsync({ assistidoId: res.id, orgaoId, file });
          if (!up.ok) {
            toast.info("O cadastro foi concluído, mas não foi possível enviar a foto. Você poderá adicioná-la depois.");
          }
        }
        reset();
        onOpenChange(false);
      }
    } catch (err) {
      toast.error("Não foi possível concluir o cadastro. Tente novamente.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Baby className="h-4 w-4" aria-hidden /> Cadastrar criança ou adolescente
          </SheetTitle>
          <SheetDescription>
            Registre os dados essenciais e, quando disponíveis, os vínculos familiares.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            {duplicates.length > 0 && (
              <Alert>
                <AlertDescription className="space-y-2">
                  <p className="text-sm font-medium">
                    Encontramos um cadastro possivelmente correspondente. Revise antes de criar um novo registro.
                  </p>
                  <ul className="list-disc pl-4 text-xs">
                    {duplicates.map((d) => (
                      <li key={d.id}>
                        {d.nome} · nascimento {d.data_nascimento}
                      </li>
                    ))}
                  </ul>
                  <div className="space-y-1">
                    <Label className="text-xs">Justificativa para prosseguir mesmo assim</Label>
                    <Textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Descreva por que este é um cadastro distinto…"
                      className="min-h-20 text-sm"
                    />
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <FormSection title="Identificação">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="prenome">Prenome *</Label>
                  <Input id="prenome" value={form.prenome}
                    onChange={(e) => setForm({ ...form, prenome: e.target.value })}
                    maxLength={100} required />
                </div>
                <div>
                  <Label htmlFor="sobrenome">Sobrenome *</Label>
                  <Input id="sobrenome" value={form.sobrenome}
                    onChange={(e) => setForm({ ...form, sobrenome: e.target.value })}
                    maxLength={150} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="dob">Data de nascimento *</Label>
                  <DateField id="dob" value={form.dataNascimento}
                    onChange={(e) => setForm({ ...form, dataNascimento: e.target.value })} required />
                </div>
                <div>
                  <Label>Sexo registral *</Label>
                  <Select value={form.sexoRegistral}
                    onValueChange={(v) => setForm({ ...form, sexoRegistral: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feminino">Feminino</SelectItem>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="nao_informado">Não informado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="genero">Identidade de gênero</Label>
                  <Input id="genero" value={form.genero}
                    onChange={(e) => setForm({ ...form, genero: e.target.value })} maxLength={100} />
                </div>
                <div>
                  <Label htmlFor="cpf">CPF (recomendado)</Label>
                  <CpfField id="cpf" value={form.cpf} onChange={(v) => setForm({ ...form, cpf: v })} />
                </div>
              </div>
            </FormSection>

            <FormSection title="Filiação">
              <div>
                <Label htmlFor="mae">Nome completo da mãe *</Label>
                <Input id="mae" value={form.nomeMae}
                  onChange={(e) => setForm({ ...form, nomeMae: e.target.value })}
                  maxLength={200} required />
              </div>
              <div>
                <Label htmlFor="pai">Nome completo do pai</Label>
                <Input id="pai" value={form.nomePai}
                  onChange={(e) => setForm({ ...form, nomePai: e.target.value })} maxLength={200} />
              </div>
            </FormSection>

            <FormSection title="Foto (opcional)">
              <FotoAssistidoField file={file} onChange={setFile} />
            </FormSection>

            <FormSection
              title="Vínculos familiares"
              description="Vincule adultos já cadastrados como pai, mãe ou família extensa."
            >
              <VinculoAssistidoPicker
                categoria="adulto"
                selectedIds={familiares.map((f) => f.assistidoId)}
                onChange={(ids) => {
                  setFamiliares((cur) => {
                    const map = new Map(cur.map((f) => [f.assistidoId, f.tipo]));
                    return ids.map((id) => ({ assistidoId: id, tipo: map.get(id) ?? "familia_extensa" }));
                  });
                }}
                triggerLabel="Adicionar familiar adulto"
              />
              {familiares.length > 0 && (
                <div className="space-y-1 rounded-md border border-border p-2">
                  {familiares.map((f) => (
                    <div key={f.assistidoId} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate font-mono">{f.assistidoId.slice(0, 8)}…</span>
                      <Select value={f.tipo}
                        onValueChange={(v) => setFamiliares((cur) => cur.map((x) => x.assistidoId === f.assistidoId ? { ...x, tipo: v as Familiar["tipo"] } : x))}>
                        <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mae">Mãe</SelectItem>
                          <SelectItem value="pai">Pai</SelectItem>
                          <SelectItem value="familia_extensa">Família extensa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </FormSection>

            <FormSection title="Irmãos" description="Vincule irmãos já cadastrados no sistema.">
              <VinculoAssistidoPicker
                categoria="crianca_adolescente"
                selectedIds={irmaos}
                onChange={setIrmaos}
                triggerLabel="Adicionar irmão"
              />
            </FormSection>
          </div>

          <FormActions
            onCancel={() => onOpenChange(false)}
            loading={cadastrar.isPending || upload.isPending}
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}
