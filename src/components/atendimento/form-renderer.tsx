import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { campoVisivel, type AtendimentoFormValues } from "@/components/atendimento/form-field-types";

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
 */
export function FormRenderer({ fields, values, onChange, disabled }: FormRendererProps) {
  const visiveis = fields.filter((f) => campoVisivel(f, values));

  if (fields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Este atendimento ainda não tem campos de formulário definidos.
      </p>
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
          <div key={field.id} className="space-y-1.5">
            <Label htmlFor={`campo-${field.id}`}>
              {field.label || "(sem rótulo)"}
              {field.required && <span className="ml-0.5 text-destructive">*</span>}
            </Label>
            <FieldInput field={field} value={values[field.id]} onChange={onChange} disabled={disabled} />
          </div>
        ),
      )}
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
    case "radio":
      return (
        <RadioGroup
          value={(value as string) ?? ""}
          onValueChange={(v) => onChange(field.id, v)}
          className="pt-0.5"
        >
          {(field.options ?? []).map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <RadioGroupItem id={`${id}-${i}`} value={opt} disabled={disabled} />
              <Label htmlFor={`${id}-${i}`} className="font-normal">
                {opt}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );
    case "checkbox": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-1.5 pt-0.5">
          {(field.options ?? []).map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${i}`}
                checked={selected.includes(opt)}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  const next = checked
                    ? [...selected, opt]
                    : selected.filter((o) => o !== opt);
                  onChange(field.id, next);
                }}
              />
              <Label htmlFor={`${id}-${i}`} className="font-normal">
                {opt}
              </Label>
            </div>
          ))}
        </div>
      );
    }
    case "dropdown":
      return (
        <Select
          value={(value as string) || undefined}
          onValueChange={(v) => onChange(field.id, v)}
          disabled={disabled}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder="Selecione…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt, i) => (
              <SelectItem key={i} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
