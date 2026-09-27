import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FORMULARIOS, abaInicial, contarPorFormulario, ehFormularioId, formularioPorId, nomeSeguro, type FormularioId, type ItemDrive,
} from "@/lib/dadosInternos";
import { marcarTodosVistos, marcarVistos, useAvisosFormularios } from "@/lib/formulariosEnvios";
import { salvarBlob } from "@/lib/driveLeitura";
import { zipDaPasta, type ProgressoZip } from "@/lib/driveZip";
import { BotoesLinks } from "@/components/dadosInternos/BotoesLinks";
import { AcessoGoogle, useAcessoDrive } from "@/components/dadosInternos/AcessoGoogle";
import { NavegadorPasta } from "@/components/dadosInternos/NavegadorPasta";
import { Visualizador } from "@/components/dadosInternos/Visualizador";

// Aba "Dados internos": respostas dos formulários públicos, lidas do Drive (somente leitura).
interface Busca {
  aba?: FormularioId;
  pasta?: string;
  arquivo?: string;
}

export const Route = createFileRoute("/_authenticated/dados-internos")({
  validateSearch: (s: Record<string, unknown>): Busca => ({
    ...(ehFormularioId(s.aba) ? { aba: s.aba } : {}),
    ...(typeof s.pasta === "string" && s.pasta ? { pasta: s.pasta } : {}),
    ...(typeof s.arquivo === "string" && s.arquivo ? { arquivo: s.arquivo } : {}),
  }),
  component: DadosInternosPage,
});

const CHAVE_ULTIMA = "dados-internos-aba";
function lerUltima(): FormularioId | null {
  try {
    const v = localStorage.getItem(CHAVE_ULTIMA);
    return ehFormularioId(v) ? v : null;
  } catch {
    return null;
  }
}
function guardarUltima(id: FormularioId) {
  try {
    localStorage.setItem(CHAVE_ULTIMA, id);
  } catch {
    // sem armazenamento: só não lembra a última sub-aba
  }
}

interface ZipEmAndamento {
  nome: string;
  progresso: ProgressoZip;
  cancelar: () => void;
}

function DadosInternosPage() {
  const busca = Route.useSearch();
  const navigate = useNavigate({ from: "/dados-internos" });
  const { naoVistos, carregado } = useAvisosFormularios();
  const acesso = useAcessoDrive();
  const contagem = useMemo(() => contarPorFormulario(naoVistos), [naoVistos]);

  // Sem ?aba=: primeira sub-aba com novidade (ou a última usada), assim que os avisos chegam
  useEffect(() => {
    if (busca.aba || !carregado) return;
    void navigate({ search: { aba: abaInicial(naoVistos, lerUltima()) }, replace: true });
  }, [busca.aba, carregado, naoVistos, navigate]);

  const aba: FormularioId = busca.aba ?? lerUltima() ?? FORMULARIOS[0].id;
  const formulario = formularioPorId(aba);
  useEffect(() => guardarUltima(aba), [aba]);
  const avisosDaAba = useMemo(() => naoVistos.filter((a) => a.formulario === aba), [naoVistos, aba]);

  const vistos = useCallback((ids: string[]) => {
    if (ids.length) marcarVistos(ids).catch(() => toast.error("Não consegui marcar como visto"));
  }, []);

  // Link direto (?pasta= / ?arquivo=): marca os avisos que apontam para esse item pelo id
  useEffect(() => {
    const alvos = [busca.pasta, busca.arquivo].filter(Boolean);
    if (alvos.length) vistos(naoVistos.filter((a) => a.drive_id && alvos.includes(a.drive_id)).map((a) => a.id));
  }, [busca.pasta, busca.arquivo, naoVistos, vistos]);

  const [zip, setZip] = useState<ZipEmAndamento | null>(null);
  const baixarZip = useCallback(async (pasta: Pick<ItemDrive, "id" | "name">) => {
    if (zip) { toast.info("Espere o .zip atual terminar"); return; }
    const controle = new AbortController();
    setZip({ nome: pasta.name, progresso: { feitos: 0, total: 0, fase: "listando" }, cancelar: () => controle.abort() });
    try {
      const r = await zipDaPasta(pasta, (progresso) => setZip((z) => (z ? { ...z, progresso } : z)), controle.signal);
      if (r.total === 0) { toast.info("A pasta está vazia"); return; }
      salvarBlob(r.blob, `${nomeSeguro(pasta.name)}.zip`);
      if (r.falhas.length) {
        toast.warning(`.zip salvo sem ${r.falhas.length} arquivo(s): ${r.falhas.slice(0, 3).join(", ")}${r.falhas.length > 3 ? "…" : ""}`);
      } else toast.success(".zip baixado");
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error(e instanceof Error ? e.message : "Não consegui montar o .zip");
    } finally {
      setZip(null);
    }
  }, [zip]);

  const irPara = (pastaId: string) =>
    void navigate({ search: { aba, ...(pastaId !== formulario.pastaId ? { pasta: pastaId } : {}) } });

  return (
    <div className="space-y-5 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <Inbox size={20} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dados internos</h1>
            <p className="text-sm text-muted-foreground">Respostas dos formulários, direto do Drive. Somente leitura.</p>
          </div>
        </div>
        <BotoesLinks />
      </div>

      <Tabs value={aba} onValueChange={(v) => { if (ehFormularioId(v)) void navigate({ search: { aba: v } }); }}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          {FORMULARIOS.map((f) => (
            <TabsTrigger key={f.id} value={f.id} className="gap-2">
              {f.aba}
              {contagem[f.id] > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">{contagem[f.id]}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {acesso.estado !== "pronto" ? (
        <AcessoGoogle acesso={acesso} />
      ) : (
        <NavegadorPasta
          key={formulario.id}
          formulario={formulario}
          pastaId={busca.pasta ?? formulario.pastaId}
          avisos={avisosDaAba}
          onAbrirPasta={(item, avisoIds) => { vistos(avisoIds); void navigate({ search: { aba, pasta: item.id } }); }}
          onAbrirArquivo={(item, avisoIds) => { vistos(avisoIds); void navigate({ search: { aba, pasta: busca.pasta, arquivo: item.id } }); }}
          onIrPara={irPara}
          onMarcarTudo={() => marcarTodosVistos(aba).catch(() => toast.error("Não consegui marcar como visto"))}
          onBaixarZip={(pasta) => void baixarZip(pasta)}
          onSemPermissao={acesso.semPermissao}
        />
      )}

      <Visualizador
        arquivoId={acesso.estado === "pronto" ? busca.arquivo ?? null : null}
        formulario={formulario}
        onFechar={() => void navigate({ search: { aba, pasta: busca.pasta } })}
        onAbrirArquivo={(id) => void navigate({ search: { aba, pasta: busca.pasta, arquivo: id } })}
      />

      {zip && (
        <Card className="fixed bottom-20 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] space-y-2 p-3 shadow-lg lg:bottom-4">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 size={14} className="animate-spin" />
            <span className="min-w-0 flex-1 truncate">
              {zip.progresso.fase === "listando" ? `Lendo as pastas de "${zip.nome}"…` : `"${zip.nome}": ${zip.progresso.feitos} de ${zip.progresso.total} arquivos`}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zip.cancelar} aria-label="Cancelar .zip"><X size={14} /></Button>
          </div>
          <Progress value={zip.progresso.total ? (zip.progresso.feitos / zip.progresso.total) * 100 : 0} />
        </Card>
      )}
    </div>
  );
}
