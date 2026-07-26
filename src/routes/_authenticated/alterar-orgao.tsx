import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/alterar-orgao")({
  beforeLoad: () => {
    throw redirect({ to: "/conta" });
  },
  component: () => null,
});
