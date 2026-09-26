import { createFileRoute, redirect } from "@tanstack/react-router";

// A aba Prospecção virou o CRM (/crm). Endereço antigo continua funcionando.
export const Route = createFileRoute("/_authenticated/prospeccao")({
  beforeLoad: () => {
    throw redirect({ to: "/crm" });
  },
});
