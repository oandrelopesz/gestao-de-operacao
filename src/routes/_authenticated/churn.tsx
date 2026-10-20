import { createFileRoute, redirect } from "@tanstack/react-router";

// Clientes em Churn virou sub-aba de Clientes Ativos; o endereço antigo segue funcionando.
export const Route = createFileRoute("/_authenticated/churn")({
  beforeLoad: () => {
    throw redirect({ to: "/clientes", search: { aba: "churn" } });
  },
});
