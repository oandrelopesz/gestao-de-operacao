import { useEffect, useMemo, useState } from "react";
import {
  categoriaMeta, erroAmigavel, pausarItens, retomarItens, reordenarFila, cancelarItens, moverJobs,
  type SwipeItem, type SwipeJob,
} from "@/lib/swipe";
import { separarFila } from "@/lib/swipeFila";
import { FilaComSelecao, type LinhaDaFila } from "@/components/fila/FilaComSelecao";

interface Props {
  jobs: SwipeJob[];
  itens: SwipeItem[];
  nomeNicho: (id: string | null | undefined) => string;
  onChange: () => Promise<void> | void;
}

function tempoDesde(iso: string | null, agora: number): string {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Fila de downloads do swipe file: o que está baixando, a ordem de quem espera e os pausados, com
 * cancelar (irreversível: o item sai do catálogo) e seleção em massa. Ids da fila = ids dos jobs;
 * pausar/retomar/cancelar agem no item do job.
 */
export function FilaDownloads({ jobs, itens, nomeNicho, onChange }: Props) {
  const { rodando, aguardando, pausados } = useMemo(() => separarFila(jobs), [jobs]);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (!rodando.length) return;
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [rodando.length]);

  const itemDe = (job: SwipeJob) => itens.find((i) => i.id === job.item_id);
  const jobPorId = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const itemIds = (ids: string[]) => ids.map((id) => jobPorId.get(id)?.item_id).filter((x): x is string => !!x);

  const linha = (job: SwipeJob): LinhaDaFila => {
    const item = itemDe(job);
    const cat = categoriaMeta(item?.categoria || String(job.payload?.categoria || ""));
    const nicho = item ? [nomeNicho(item.nicho_id), nomeNicho(item.subnicho_id)].filter(Boolean).join(" › ") : "";
    return {
      id: job.id,
      titulo: item?.player || String(job.payload?.nome_arquivo || "Item"),
      subtitulo: `${cat.singular}${nicho ? ` · ${nicho}` : ""}`,
      cor: cat.hex,
      etapa: job.status === "rodando" ? `Baixando agora · ${tempoDesde(job.iniciado_em, agora)}` : undefined,
      progresso: null,
    };
  };

  return (
    <FilaComSelecao
      titulo="Fila de downloads"
      nomeItem={{ singular: "download", plural: "downloads" }}
      andamento={rodando.map(linha)}
      aguardando={aguardando.map(linha)}
      pausados={pausados.map(linha)}
      onReordenar={(ids) => reordenarFila(aguardando, ids)}
      onMover={(ids, destino) => moverJobs(aguardando, ids, destino)}
      onPausar={(ids) => pausarItens(itemIds(ids))}
      onRetomar={(ids) => retomarItens(itemIds(ids))}
      onCancelar={(ids) => cancelarItens(itemIds(ids).map((id) => ({ id, drive_file_id: itens.find((i) => i.id === id)?.drive_file_id ?? null })))}
      onErro={erroAmigavel}
      onMudou={onChange}
    />
  );
}
