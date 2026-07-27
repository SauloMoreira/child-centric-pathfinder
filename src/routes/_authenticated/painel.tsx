import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel")({
  beforeLoad: () => {
    throw redirect({ to: "/area-de-trabalho", replace: true });
  },
});
