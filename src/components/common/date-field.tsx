import { Input } from "@/components/ui/input";
import { forwardRef } from "react";

/** Campo de data que armazena valor ISO YYYY-MM-DD. */
export const DateField = forwardRef<HTMLInputElement, React.ComponentProps<typeof Input>>(
  function DateField(props, ref) {
    return <Input type="date" ref={ref} max={new Date().toISOString().slice(0, 10)} {...props} />;
  },
);
