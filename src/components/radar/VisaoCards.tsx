import { CardAchado } from "@/components/radar/CardAchado";
import { ordenarAchados, rotuloDia } from "@/lib/radar";
import type { Achado, StatusAchado } from "@/lib/radar";

type Props = {
  achados: Achado[];
  onStatus: (id: string, s: StatusAchado) => void;
  onNota: (id: string, texto: string) => void;
};

export function VisaoCards({ achados, onStatus, onNota }: Props) {
  if (achados.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nenhum achado com esses filtros</p>;
  }

  const grupos = new Map<string, Achado[]>();
  for (const a of achados) {
    const grupo = grupos.get(a.data);
    if (grupo) grupo.push(a);
    else grupos.set(a.data, [a]);
  }
  const datas = [...grupos.keys()].sort().reverse();

  return (
    <div className="space-y-8">
      {datas.map((data) => (
        <section key={data} className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="shrink-0 text-sm font-semibold">{rotuloDia(data)}</h2>
            <div className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ordenarAchados(grupos.get(data) ?? []).map((a) => (
              <CardAchado key={a.id} achado={a} onStatus={onStatus} onNota={onNota} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
