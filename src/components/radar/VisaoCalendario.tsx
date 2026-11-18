import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CLASSES, hojeSP, rotuloDia, somarDias } from "@/lib/radar";
import type { Achado, Classe, Filtros } from "@/lib/radar";
import { useAchadosRadar } from "@/lib/radarDados";

const CLASSES_ORDEM = Object.keys(CLASSES) as Classe[];
const SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const pad = (n: number) => String(n).padStart(2, "0");

// Mês em "AAAA-MM". Date.UTC só faz a aritmética; nada passa por fuso.
function deslocarMes(ym: string, n: number): string {
  const [a, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}

function ultimoDiaDoMes(ym: string): number {
  const [a, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

// Segunda = 0 ... domingo = 6.
function deslocamentoInicial(ym: string): number {
  const [a, m] = ym.split("-").map(Number);
  return (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7;
}

function nomeMes(ym: string): string {
  const [a, m] = ym.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(a, m - 1, 1)),
  );
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

function contarPorClasse(lista: Achado[]): Partial<Record<Classe, number>> {
  const por: Partial<Record<Classe, number>> = {};
  for (const a of lista) por[a.classe] = (por[a.classe] ?? 0) + 1;
  return por;
}

function agruparPorDia(lista: Achado[]): Map<string, Achado[]> {
  const mapa = new Map<string, Achado[]>();
  for (const a of lista) mapa.set(a.data, [...(mapa.get(a.data) ?? []), a]);
  return mapa;
}

export function VisaoCalendario({ filtros, onChange }: { filtros: Filtros; onChange: (f: Filtros, opcoes?: { substituir?: boolean }) => void }) {
  const hoje = hojeSP();
  const [mes, setMes] = useState(() => (filtros.dia ?? hoje).slice(0, 7));
  const ultimo = `${mes}-${pad(ultimoDiaDoMes(mes))}`;
  const grade = useAchadosRadar({ ...filtros, dia: undefined, de: `${mes}-01`, ate: ultimo });
  const linha = useAchadosRadar({ ...filtros, dia: undefined, de: somarDias(hoje, -13), ate: hoje });

  const abrirDia = (dia: string) => onChange({ ...filtros, dia, de: undefined, ate: undefined, view: "dia" });

  const porDia = agruparPorDia(grade.data ?? []);
  const celulas: (string | null)[] = [
    ...Array<null>(deslocamentoInicial(mes)).fill(null),
    ...Array.from({ length: ultimoDiaDoMes(mes) }, (_, i) => `${mes}-${pad(i + 1)}`),
  ];

  const porDiaLinha = agruparPorDia(linha.data ?? []);
  const diasLinha = [...porDiaLinha.keys()].sort().reverse();

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label="Mês anterior"
            onClick={() => setMes((m) => deslocarMes(m, -1))}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <h2 className="text-center text-base font-semibold" aria-live="polite">
            {nomeMes(mes)}
          </h2>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label="Próximo mês"
            onClick={() => setMes((m) => deslocarMes(m, 1))}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {grade.isError ? (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p>Não foi possível carregar o calendário.</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => grade.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : grade.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {SEMANA.map((s) => (
              <div key={s} className="py-1 text-center text-xs font-medium text-muted-foreground">
                {s}
              </div>
            ))}
            {celulas.map((d, i) => {
              if (!d) return <div key={`vazio-${i}`} />;
              const lista = porDia.get(d) ?? [];
              const por = contarPorClasse(lista);
              const presentes = CLASSES_ORDEM.filter((c) => por[c]);
              const resumo = lista.length
                ? `${lista.length} achados: ${presentes.map((c) => `${por[c]} ${CLASSES[c].rotulo}`).join(", ")}`
                : "sem achados";
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => abrirDia(d)}
                  aria-label={`${rotuloDia(d)}, ${resumo}`}
                  className={cn(
                    "flex min-h-11 flex-col items-center gap-0.5 rounded-md border p-1 text-xs hover:bg-muted",
                    d === hoje && "ring-2 ring-primary",
                    lista.length === 0 && "text-muted-foreground",
                  )}
                >
                  <span className="font-medium">{Number(d.slice(8))}</span>
                  {lista.length > 0 && <span className="text-[10px] font-semibold">{lista.length}</span>}
                  <span className="flex flex-wrap justify-center gap-0.5">
                    {presentes.map((c) => (
                      <span
                        key={c}
                        title={`${por[c]} ${CLASSES[c].rotulo}`}
                        aria-label={`${por[c]} ${CLASSES[c].rotulo}`}
                        className={cn("h-1.5 w-1.5 rounded-full", CLASSES[c].ponto)}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="linha-do-tempo">
        <h2 id="linha-do-tempo" className="text-base font-semibold">
          Últimos 14 dias
        </h2>
        {linha.isError ? (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p>Não foi possível carregar a linha do tempo.</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => linha.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : linha.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : diasLinha.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum achado nos últimos 14 dias.</p>
        ) : (
          <ol className="space-y-2 border-l pl-4">
            {diasLinha.map((d) => {
              const lista = porDiaLinha.get(d) ?? [];
              const por = contarPorClasse(lista);
              return (
                <li key={d} className="relative">
                  <span aria-hidden="true" className="absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full bg-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => abrirDia(d)}
                    className="flex min-h-11 w-full flex-col items-start rounded-md p-2 text-left hover:bg-muted"
                  >
                    <span className="text-sm font-medium">
                      {rotuloDia(d)}
                      {d === hoje && " · hoje"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {lista.length} {lista.length === 1 ? "achado" : "achados"} ·{" "}
                      {CLASSES_ORDEM.filter((c) => por[c])
                        .map((c) => `${CLASSES[c].emoji} ${por[c]}`)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
