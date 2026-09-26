import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useState, type ComponentType } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// O Excalidraw só existe no navegador e é pesado: vem num pedaço separado, carregado ao abrir um quadro.
// No build do servidor o import some (import.meta.env.SSR é constante), para não pesar o worker com Excalidraw e mermaid.
const EditorFluxo = lazy<ComponentType<{ fluxoId: string }>>(() =>
  import.meta.env.SSR ? Promise.resolve({ default: () => null }) : import("@/components/fluxos/EditorFluxo"),
);

export const Route = createFileRoute("/_authenticated/fluxogramas/$id")({ component: QuadroPage });

function Carregando() {
  return (
    <div className="fluxo-editor flex flex-col gap-3 p-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="flex-1 rounded-xl" />
    </div>
  );
}

function QuadroPage() {
  const { id } = Route.useParams();
  const [noNavegador, setNoNavegador] = useState(false);
  useEffect(() => setNoNavegador(true), []);
  if (!noNavegador) return <Carregando />;
  return (
    <Suspense fallback={<Carregando />}>
      <EditorFluxo key={id} fluxoId={id} />
    </Suspense>
  );
}
