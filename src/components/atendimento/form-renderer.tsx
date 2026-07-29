import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  campoObrigatorioEfetivo,
  campoVisivel,
  construirValorOutro,
  ehValorOutro,
  formatarMoedaExibicao,
  textoDoValorOutro,
  type AtendimentoFormValues,
} from "@/components/atendimento/form-field-types";

interface FormRendererProps {
  fields: AtendimentoFormField[];
  values: AtendimentoFormValues;
  onChange: (fieldId: string, value: string | string[]) => void;
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
          {(etapa?.campos ?? []).map((field) => (
            <CampoRenderizado
              key={field.id}
              field={field}
              value={values[field.id]}
              values={values}
              onChange={onChange}
              disabled={disabled}
            />
          ))}
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
        ) : (
          <CampoRenderizado
            key={field.id}
            field={field}
            value={values[field.id]}
            values={values}
            onChange={onChange}
            disabled={disabled}
          />
        ),
      )}
    </div>
  );
}

function CampoRenderizado({
  field,
  value,
  values,
  onChange,
  disabled,
}: {
  field: AtendimentoFormField;
  value: string | string[] | undefined;
  values: AtendimentoFormValues;
  onChange: (fieldId: string, value: string | string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`campo-${field.id}`}>
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
  value: string | string[] | undefined;
  onChange: (fieldId: string, value: string | string[]) => void;
  disabled?: boolean;
}) {
  const id = `campo-${field.id}`;

  switch (field.type) {
    case "text_long":
      return (
        <Textarea
          id={id}
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
                <Label htmlFor={`${id}-${i}`} className="font-normal">
                  {opt}
                </Label>
              </div>
            ))}
            {field.allowOther && (
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-outro`} value="__outro__" disabled={disabled} />
                <Label htmlFor={`${id}-outro`} className="font-normal">
                  Outro
                </Label>
              </div>
            )}
          </RadioGroup>
          {outroAtivo && (
            <Input
              className="ml-6 h-8 max-w-[240px] text-xs"
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
              <Label htmlFor={`${id}-${i}`} className="font-normal">
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
                <Label htmlFor={`${id}-outro`} className="font-normal">
                  Outro
                </Label>
              </div>
              {outroSelecionado && (
                <Input
                  className="ml-6 h-8 max-w-[240px] text-xs"
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
            <SelectTrigger id={id}>
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {opts.map((opt, i) => (
                <SelectItem key={i} value={opt}>
                  {opt}
                </SelectItem>
              ))}
              {field.allowOther && <SelectItem value="__outro__">Outro</SelectItem>}
            </SelectContent>
          </Select>
          {outroAtivo && (
            <Input
              className="h-8 max-w-[240px] text-xs"
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
