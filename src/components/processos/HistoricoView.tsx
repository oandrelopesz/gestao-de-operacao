import { useEffect, useMemo, useState } from "react";
import { format, isAfter, startOfYear, subDays } from "date-fns";
import { History, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { duracaoDias, type TipoProcesso } from "@/lib/processos";
import { fetchProcessos, fetchRoadmapsLigados, type Processo, type RoadmapLigado } from "@/lib/processosService";
import { Trilha } from "./Trilha";

interface HistoricoViewProps {
  tipo: TipoProcesso;
}

type Periodo = "30dias" | "ano" | "tudo";

const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as any).message) : "Erro ao carregar");

const naJanela = (dataISO: string, periodo: Periodo): boolean => {
  if (periodo === "tudo") return true;
  const data = new Date(dataISO);
  const limite = periodo === "30dias" ? subDays(new Date(), 30) : startOfYear(new Date());
  return isAfter(data, limite);
};

/** Aba de histórico (compartilhada entre Onboarding e Roadmap): processos concluídos/encerrados, com a trilha em somente-leitura. */
export function HistoricoView({ tipo }: HistoricoViewProps) {
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("30dias");
  const [selecionado, setSelecionado] = useState<Processo | null>(null);
  const [roadmaps, setRoadmaps] = useState<RoadmapLigado[]>([]);

  useEffect(() => {
    setLoading(true);
    fetchProcessos(tipo, "historico")
      .then((p) => { setProcessos(p); setErro(null); })
      .catch((e) => setErro(erroMsg(e)))
      .finally(() => setLoading(false));
  }, [tipo]);

  useEffect(() => {
    if (!selecionado) { setRoadmaps([]); return; }
    if (tipo !== "onboarding") { setRoadmaps([]); return; }
    let cancelado = false;
    fetchRoadmapsLigados(selecionado.passos.map((p) => p.id))
      .then((r) => { if (!cancelado) setRoadmaps(r); })
      .catch(() => { if (!cancelado) setRoadmaps([]); });
    return () => { cancelado = true; };
  }, [selecionado, tipo]);

  const filtrados = useMemo(() => {
    const buscaNorm = busca.trim().toLowerCase();
    return processos.filter((p) => {
      if (buscaNorm && !p.cliente?.nome?.toLowerCase().includes(buscaNorm)) return false;
      const dataRef = p.concluido_em ?? p.iniciado_em;
      if (!naJanela(dataRef, periodo)) return false;
      return true;
    });
  }, [processos, busca, periodo]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input placeholder="Buscar por cliente..." className="pl-10" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="sm:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30dias">Últimos 30 dias</SelectItem>
            <SelectItem value="ano">Este ano</SelectItem>
            <SelectItem value="tudo">Tudo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {!loading && filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <div className="bg-muted rounded-full p-4"><History size={32} className="text-muted-foreground" /></div>
          <h3 className="text-base font-medium">
            {processos.length === 0 ? "Nenhum processo no histórico ainda" : "Nenhum processo nesse filtro"}
          </h3>
          <p className="text-muted-foreground max-w-xs text-sm">
            {processos.length === 0
              ? "Processos concluídos ou encerrados aparecem aqui."
              : "Ajuste a busca ou o período para ver mais resultados."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Processo</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Conclusão</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Passos</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((p) => {
                const feitos = p.passos.filter((x) => x.concluido_em).length;
                return (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => setSelecionado(p)}>
                    <TableCell className="font-medium">{p.cliente?.nome ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(p.iniciado_em), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.concluido_em ? format(new Date(p.concluido_em), "dd/MM/yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {p.concluido_em ? `${duracaoDias(p.iniciado_em, p.concluido_em)}d` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{feitos}/{p.passos.length}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          p.status === "concluido"
                            ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "border-muted-foreground/30 bg-muted text-muted-foreground",
                        )}
                      >
                        {p.status === "concluido" ? "Concluído" : "Encerrado"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selecionado} onOpenChange={(o) => { if (!o) setSelecionado(null); }}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selecionado?.cliente?.nome} — {selecionado?.nome}</DialogTitle>
            <DialogDescription className="sr-only">Trilha do processo, somente leitura</DialogDescription>
          </DialogHeader>
          {selecionado && (
            <Trilha processo={selecionado} roadmaps={roadmaps} somenteLeitura onMudou={() => {}} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
