import { Input } from "@/components/ui/input";
import { formatCpf, stripCpf } from "@/lib/validators/cpf";

export function CpfField({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (digits: string) => void;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const digits = stripCpf(value);
  const display = digits.length === 11 ? formatCpf(digits) : digits;
  return (
    <Input
      inputMode="numeric"
      autoComplete="off"
      placeholder="000.000.000-00"
      maxLength={14}
      value={display}
      onChange={(e) => onChange(stripCpf(e.target.value).slice(0, 11))}
      {...rest}
    />
  );
}
