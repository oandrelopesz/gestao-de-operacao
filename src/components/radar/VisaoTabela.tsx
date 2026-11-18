import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CLASSES, CONFIANCAS, STATUS, TEMAS, TIPOS } from "@/lib/radar";
import type { Achado } from "@/lib/radar";

type Coluna = "data" | "id" | "classe" | "titulo" | "temas" | "tipo" | "confianca" | "estagio" | "status" | "links";
type Ordem = { coluna: Coluna; direcao: "asc" | "desc" };

const COLUNAS: { id: Coluna; rotulo: string }[] = [
  { id: "data", rotulo: "Data" },
  { id: "id", rotulo: "ID" },
  { id: "classe", rotulo: "Classe" },
  { id: "titulo", rotulo: "Título" },
  { id: "temas", rotulo: "Temas" },
  { id: "tipo", rotulo: "Tipo" },
  { id: "confianca", rotulo: "Confiança" },
  { id: "estagio", rotulo: "Estágio" },
  { id: "status", rotulo: "Status" },
  { id: "links", rotulo: "Links" },
];

const temasDe = (a: Achado) => a.temas.map((s) => TEMAS.find((t) => t.slug === s)?.rotulo ?? s).join(", ");
const classeDe = (a: Achado) => CLASSES[a.classe] ?? CLASSES.medio;
const dataBr = (data: string) => {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
};

const CHAVE: Record<Coluna, (a: Achado) => string | number> = {
  data: (a) => a.data,
  id: (a) => a.id,
  classe: (a) => CLASSES[a.classe]?.ordem ?? 99,
  titulo: (a) => a.titulo,
  temas: (a) => temasDe(a),
  tipo: (a) => a.tipo,
  confianca: (a) => CONFIANCAS.findIndex((c) => c.valor === a.confianca),
  estagio: (a) => a.estagio ?? "",
  status: (a) => STATUS.findIndex((s) => s.valor === a.status),
  links: (a) => a.links?.length ?? 0,
};

function ordenar(lista: Achado[], ordem: Ordem): Achado[] {
  const sinal = ordem.direcao === "asc" ? 1 : -1;
  const chave = CHAVE[ordem.coluna];
  return [...lista].sort((x, y) => {
    const cx = chave(x);
    const cy = chave(y);
    const cmp = typeof cx === "number" && typeof cy === "number" ? cx - cy : String(cx).localeCompare(String(cy), "pt-BR");
    return sinal * cmp || x.id.localeCompare(y.id);
  });
}

export function VisaoTabela({ achados, onAbrirDia }: { achados: Achado[]; onAbrirDia: (data: string) => void }) {
  const [ordem, setOrdem] = useState<Ordem>({ coluna: "data", direcao: "desc" });

  if (achados.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nenhum achado com esses filtros</p>;
  }

  const lista = ordenar(achados, ordem);

  const alternarOrdem = (coluna: Coluna) =>
    setOrdem((o) =>
      o.coluna === coluna
        ? { coluna, direcao: o.direcao === "asc" ? "desc" : "asc" }
        : { coluna, direcao: "asc" },
    );

  const ariaSort = (coluna: Coluna): "ascending" | "descending" | "none" =>
    ordem.coluna !== coluna ? "none" : ordem.direcao === "asc" ? "ascending" : "descending";

  const iconeOrdem = (coluna: Coluna) => {
    if (ordem.coluna !== coluna) return <ArrowUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />;
    return ordem.direcao === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
    );
  };

  return (
    <>
      {/* Desktop (md+): tabela com cabeçalho fixo dentro do próprio contêiner com rolagem. */}
      <div className="hidden max-h-[70vh] overflow-x-auto overflow-y-auto rounded-md border md:block">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              {COLUNAS.map((c) => (
                <TableHead key={c.id} aria-sort={ariaSort(c.id)} className="sticky top-0 z-10 bg-background whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => alternarOrdem(c.id)}
                    className="inline-flex items-center gap-1 rounded py-1 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {c.rotulo}
                    {iconeOrdem(c.id)}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.map((a) => {
              const classe = classeDe(a);
              return (
                <TableRow
                  key={a.id}
                  tabIndex={0}
                  onClick={() => onAbrirDia(a.data)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onAbrirDia(a.data);
                  }}
                  className="cursor-pointer focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <TableCell className="whitespace-nowrap">{dataBr(a.data)}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{a.id}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {classe.emoji} {classe.rotulo}
                  </TableCell>
                  <TableCell className="min-w-56 whitespace-normal">{a.titulo}</TableCell>
                  <TableCell className="min-w-40 whitespace-normal">{temasDe(a)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {a.tipo} · {TIPOS[a.tipo] ?? a.tipo}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {CONFIANCAS.find((c) => c.valor === a.confianca)?.rotulo ?? a.confianca}
                  </TableCell>
                  <TableCell className="min-w-32 whitespace-normal">{a.estagio}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {STATUS.find((s) => s.valor === a.status)?.rotulo ?? a.status}
                  </TableCell>
                  <TableCell className="text-center">{a.links?.length ?? 0}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </table>
      </div>

      {/* Celular (abaixo de md): lista compacta, cada item abre o dia. */}
      <ul className="space-y-2 md:hidden">
        {lista.map((a) => {
          const classe = classeDe(a);
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onAbrirDia(a.data)}
                className="flex min-h-11 w-full flex-col items-start gap-1 rounded-md border bg-card p-3 text-left text-card-foreground"
              >
                <span className="text-xs font-medium">
                  {classe.emoji} {classe.rotulo}
                </span>
                <span className="text-sm font-medium leading-snug">{a.titulo}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {a.id} · {dataBr(a.data)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
