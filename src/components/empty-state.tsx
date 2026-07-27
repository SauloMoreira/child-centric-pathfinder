import type React from "react";
import { UserPlus } from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted" aria-hidden>
        <UserPlus className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-base font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
