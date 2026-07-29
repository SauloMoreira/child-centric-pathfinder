import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AtendimentoFormField } from "@/lib/reintegra-api";
import {
  agruparEmEtapas,
  calcularValor,
  campoObrigatorioEfetivo,
  campoVisivel,
  construirValorOutro,
  ehValorOutro,
  formatarMoedaExibicao,
  textoDoValorOutro,
  type AtendimentoFormValues,
} from "@/components/atendimento/form-field-types";

type CampoValor = AtendimentoFormValues[string];

interface FormRendererProps {
  fields: AtendimentoFormField[];
  values: AtendimentoFormValues;
  onChange: (fieldId: string, value: CampoValor) => void;
  disabled?: boolean;
}

/**
 * Renderiza o formulário de um Atendimento para preenchimento. Estado
 * sempre em memória (values/onChange controlados pelo componente pai) —
 * nunca é enviado ao backend nem persiste entre sessões.
 *
 * Fase 2 — lógica condicional: campos e seções com `visibleIf` só aparecem
 * quando a condição é satisfeita pelas respostas já dadas. Uma seção cuja
 * condição não é satisfeita é pulada inteira (ela e os campos que a
 * seguem, até a próxima seção).
 *
 * Fase 5 — navegação por etapas: quando o formulário tem 2+ seções, o
 * preenchimento passa a ser uma seção por vez (Anterior/Próximo) em vez
 * de página única. A validação de obrigatórios continua centralizada em
 * "Concluir" (não bloqueia o avanço entre etapas).
 */
export function FormRenderer({ fields, values, onChange, disabled }: FormRendererProps) {
  const usaEtapas = fields.filter((f) => f.type === "section").length >= 2;
  const visiveis = fields.filter((f) => campoVisivel(f, values));
  const etapas = usaEtapas ? agruparEmEtapas(visiveis) : null;
  const [etapaAtual, setEtapaAtual] = useState(0);

  // Reinicia a etapa ao trocar de atendimento (nova identidade de `fields`).
  useEffect(() => {
    setEtapaAtual(0);
  }, [fields]);

  if (fields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Este atendimento ainda não tem campos de formulário definidos.
      </p>
    );
  }

  if (etapas) {
    const indice = Math.min(etapaAtual, Math.max(etapas.length - 1, 0));
    const etapa = etapas[indice];
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-institutional">
            {etapa?.titulo ?? "Início"}
          </p>
          <p className="shrink-0 text-[11px] text-muted-foreground">
            Etapa {indice + 1} de {etapas.length}
          </p>
        </div>
        <div className="space-y-4">
          {(etapa?.campos ?? []).map((field) =>
            field.type === "orientation" ? (
              <OrientacaoBox key={field.id} texto={field.label} />
            ) : (
              <CampoRenderizado
                key={field.id}
                field={field}
                value={values[field.id]}
                values={values}
                allFields={fields}
                onChange={onChange}
                disabled={disabled}
              />
            ),
          )}
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={indice === 0}
            onClick={() => setEtapaAtual((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={indice >= etapas.length - 1}
            onClick={() => setEtapaAtual((i) => Math.min(etapas.length - 1, i + 1))}
          >
            Próximo <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {visiveis.map((field, i) =>
        field.type === "section" ? (
          <div key={field.id} className={i === 0 ? "space-y-1.5" : "space-y-1.5 pt-2"}>
            {i > 0 && <Separator />}
            <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-institutional">
              {field.label || "(seção sem título)"}
            </p>
          </div>
        ) : field.type === "orientation" ? (
          <OrientacaoBox key={field.id} texto={field.label} />
        ) : (
          <CampoRenderizado
            key={field.id}
            field={field}
            value={values[field.id]}
            values={values}
            allFields={fields}
            onChange={onChange}
            disabled={disabled}
          />
        ),
      )}
    </div>
  );
}

/** Ajuste doc — nota de orientação do Defensor Público para quem preenche,
 *  em destaque no formulário (mesmo estilo da antiga descrição do
 *  Atendimento). Não é um campo de resposta: sem Label/FieldInput. */
function OrientacaoBox({ texto }: { texto: string }) {
  if (!texto) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-institutional/30 bg-institutional/[0.06] p-2.5">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-institutional" aria-hidden />
      <p className="whitespace-pre-wrap text-xs text-foreground">{texto}</p>
    </div>
  );
}

function CampoRenderizado({
  field,
  value,
  values,
  allFields,
  onChange,
  disabled,
}: {
  field: AtendimentoFormField;
  value: CampoValor | undefined;
  values: AtendimentoFormValues;
  allFields: AtendimentoFormField[];
  onChange: (fieldId: string, value: CampoValor) => void;
  disabled?: boolean;
}) {
  // Fase 7 — campo calculado: nunca editável, computado ao vivo a partir
  // dos campos que ele referencia. Não passa por FieldInput.
  if (field.type === "calculated") {
    const texto = calcularValor(field, allFields, values);
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{field.label || "(sem rótulo)"}</Label>
        <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs">
          {texto || <span className="text-muted-foreground">—</span>}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`campo-${field.id}`} className="text-xs">
        {field.label || "(sem rótulo)"}
        {campoObrigatorioEfetivo(field, values) && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <FieldInput field={field} value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: AtendimentoFormField;
  value: CampoValor | undefined;
  onChange: (fieldId: string, value: CampoValor) => void;
  disabled?: boolean;
}) {
  const id = `campo-${field.id}`;

  switch (field.type) {
    case "text_long":
      return (
        <Textarea
          id={id}
          className="bg-surface text-xs"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder ?? undefined}
          disabled={disabled}
          rows={3}
          required={field.required}
        />
      );
    case "radio": {
      const opts = field.options ?? [];
      const atual = (value as string) ?? "";
      const outroAtivo = field.allowOther && (atual === "" ? false : ehValorOutro(atual) || !opts.includes(atual));
      const radioValue = outroAtivo ? "__outro__" : atual;
      return (
        <div className="space-y-1.5 pt-0.5">
          <RadioGroup
            value={radioValue}
            onValueChange={(v) => onChange(field.id, v === "__outro__" ? construirValorOutro("") : v)}
          >
            {opts.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-${i}`} value={opt} disabled={disabled} />
                <Label htmlFor={`${id}-${i}`} className="text-xs font-normal">
                  {opt}
                </Label>
              </div>
            ))}
            {field.allowOther && (
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-outro`} value="__outro__" disabled={disabled} />
                <Label htmlFor={`${id}-outro`} className="text-xs font-normal">
                  Outro
                </Label>
              </div>
            )}
          </RadioGroup>
          {outroAtivo && (
            <Input
              className="ml-6 h-8 max-w-[240px] bg-surface text-xs"
              value={ehValorOutro(atual) ? textoDoValorOutro(atual) : ""}
              onChange={(e) => onChange(field.id, construirValorOutro(e.target.value))}
              placeholder="Especifique…"
              disabled={disabled}
            />
          )}
        </div>
      );
    }
    case "checkbox": {
      const opts = field.options ?? [];
      const selected = Array.isArray(value) ? value : [];
      const outroSelecionado = selected.find((v) => ehValorOutro(v));
      return (
        <div className="space-y-1.5 pt-0.5">
          {opts.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${i}`}
                checked={selected.includes(opt)}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  const next = checked ? [...selected, opt] : selected.filter((o) => o !== opt);
                  onChange(field.id, next);
                }}
              />
              <Label htmlFor={`${id}-${i}`} className="text-xs font-normal">
                {opt}
              </Label>
            </div>
          ))}
          {field.allowOther && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-outro`}
                  checked={!!outroSelecionado}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...selected, construirValorOutro("")]
                      : selected.filter((v) => !ehValorOutro(v));
                    onChange(field.id, next);
                  }}
                />
                <Label htmlFor={`${id}-outro`} className="text-xs font-normal">
                  Outro
                </Label>
              </div>
              {outroSelecionado && (
                <Input
                  className="ml-6 h-8 max-w-[240px] bg-surface text-xs"
                  value={textoDoValorOutro(outroSelecionado)}
                  onChange={(e) => {
                    const next = selected.map((v) =>
                      ehValorOutro(v) ? construirValorOutro(e.target.value) : v,
                    );
                    onChange(field.id, next);
                  }}
                  placeholder="Especifique…"
                  disabled={disabled}
                />
              )}
            </div>
          )}
        </div>
      );
    }
    case "dropdown": {
      const opts = field.options ?? [];
      const atual = (value as string) ?? "";
      const outroAtivo = field.allowOther && atual !== "" && (ehValorOutro(atual) || !opts.includes(atual));
      const selectValue = outroAtivo ? "__outro__" : atual || undefined;
      return (
        <div className="space-y-1.5">
          <Select
            value={selectValue}
            onValueChange={(v) => onChange(field.id, v === "__outro__" ? construirValorOutro("") : v)}
            disabled={disabled}
          >
            <SelectTrigger id={id} className="bg-surface text-xs">
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {opts.map((opt, i) => (
                <SelectItem key={i} value={opt} className="text-xs">
                  {opt}
                </SelectItem>
              ))}
              {field.allowOther && (
                <SelectItem value="__outro__" className="text-xs">
                  Outro
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {outroAtivo && (
            <Input
              className="h-8 max-w-[240px] bg-surface text-xs"
              value={ehValorOutro(atual) ? textoDoValorOutro(atual) : ""}
              onChange={(e) => onChange(field.id, construirValorOutro(e.target.value))}
              placeholder="Especifique…"
              disabled={disabled}
            />
          )}
        </div>
      );
    }
    case "currency":
      return (
        <Input
          id={id}
          className="bg-surface text-xs"
          inputMode="decimal"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.id, e.target.value)}
          onBlur={(e) => {
            const formatado = formatarMoedaExibicao(e.target.value);
            if (formatado !== e.target.value) onChange(field.id, formatado);
          }}
          placeholder={field.placeholder ?? "R$ 0,00"}
          disabled={disabled}
          required={field.required}
        />
      );
    case "matrix": {
      const linhas = field.matrixRows ?? [];
      const colunas = field.options ?? [];
      const registro = (value as Record<string, string>) ?? {};
      return (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="p-2 text-left font-medium"> </th>
                {colunas.map((c, ci) => (
                  <th key={ci} className="p-2 text-center font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, ri) => (
                <tr key={ri} className="border-b border-border last:border-0">
                  <td className="p-2">{linha}</td>
                  <td colSpan={colunas.length} className="p-0">
                    <RadioGroup
                      value={registro[String(ri)] ?? ""}
                      onValueChange={(v) => onChange(field.id, { ...registro, [String(ri)]: v })}
                      className="flex"
                    >
                      {colunas.map((c, ci) => (
                        <div key={ci} className="flex flex-1 items-center justify-center py-2">
                          <RadioGroupItem value={c} disabled={disabled} aria-label={c} />
                        </div>
                      ))}
                    </RadioGroup>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "table_fillable": {
      const colunas = field.tableColumns ?? [];
      const linhas = (value as Record<string, string>[]) ?? [];
      const setCelula = (ri: number, col: string, v: string) => {
        onChange(field.id, linhas.map((linha, i) => (i === ri ? { ...linha, [col]: v } : linha)));
      };
      const addLinha = () => onChange(field.id, [...linhas, {}]);
      const removeLinha = (ri: number) => onChange(field.id, linhas.filter((_, i) => i !== ri));
      return (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {colunas.map((c, ci) => (
                    <th key={ci} className="p-2 text-left font-medium">
                      {c}
                    </th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha, ri) => (
                  <tr key={ri} className="border-b border-border last:border-0">
                    {colunas.map((c, ci) => (
                      <td key={ci} className="p-1">
                        <Input
                          className="h-7 bg-surface text-xs"
                          value={linha[c] ?? ""}
                          onChange={(e) => setCelula(ri, c, e.target.value)}
                          disabled={disabled}
                        />
                      </td>
                    ))}
                    <td className="p-1 text-center">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remover linha"
                        disabled={disabled}
                        onClick={() => removeLinha(ri)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            disabled={disabled}
            onClick={addLinha}
          >
            <Plus className="h-3 w-3" aria-hidden /> Adicionar linha
          </Button>
        </div>
      );
    }
    case "repeat_group": {
      const subfields = field.repeatFields ?? [];
      const instancias = (value as Record<string, string>[]) ?? [];
      const setSub = (ii: number, subId: string, v: CampoValor) => {
        onChange(
          field.id,
          instancias.map((inst, i) => (i === ii ? { ...inst, [subId]: v as string } : inst)),
        );
      };
      const addInstancia = () => onChange(field.id, [...instancias, {}]);
      const removeInstancia = (ii: number) => onChange(field.id, instancias.filter((_, i) => i !== ii));
      return (
        <div className="space-y-2">
          {instancias.map((inst, ii) => (
            <div key={ii} className="space-y-2 rounded-md border border-border p-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground">Item {ii + 1}</p>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remover item"
                  disabled={disabled}
                  onClick={() => removeInstancia(ii)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {subfields.map((sf) => (
                <div key={sf.id} className="space-y-1">
                  <Label className="text-xs font-normal text-muted-foreground">
                    {sf.label || "(sem rótulo)"}
                  </Label>
                  <FieldInput
                    field={sf}
                    value={inst[sf.id] ?? ""}
                    onChange={(_, v) => setSub(ii, sf.id, v)}
                    disabled={disabled}
                  />
                </div>
              ))}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            disabled={disabled}
            onClick={addInstancia}
          >
            <Plus className="h-3 w-3" aria-hidden /> Adicionar {field.label || "item"}
          </Button>
        </div>
      );
    }
    case "email":
    case "phone":
    case "cpf_cnpj":
    case "date":
    case "time":
    case "number":
    case "text_short":
    default: {
      const htmlType: Record<string, string> = {
        email: "email",
        phone: "tel",
        date: "date",
        time: "time",
        number: "number",
      };
      const placeholder: Record<string, string> = {
        phone: "(00) 00000-0000",
        cpf_cnpj: "000.000.000-00",
      };
      return (
        <Input
          id={id}
          className="bg-surface text-xs"
          type={htmlType[field.type] ?? "text"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder ?? placeholder[field.type] ?? undefined}
          disabled={disabled}
          required={field.required}
        />
      );
    }
  }
}
