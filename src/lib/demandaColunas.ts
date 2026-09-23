import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface KanbanColumnDef {
  id: string;
  title: string;
  color: string;
  hex: string;
  sistema: boolean;
}

// Fallback usado apenas se a tabela demanda_colunas não estiver disponível
export const DEFAULT_COLUMNS: KanbanColumnDef[] = [
  { id: "recorrentes", title: "Recorrentes", color: "slate-500", hex: "#64748b", sistema: true },
  { id: "fazer_hoje", title: "Fazer hoje", color: "red-500", hex: "#ef4444", sistema: false },
  { id: "fazer_amanha", title: "Fazer amanhã", color: "yellow-500", hex: "#eab308", sistema: false },
  { id: "fazer_depois_amanha", title: "Fazer depois de amanhã", color: "orange-500", hex: "#f97316", sistema: false },
  { id: "fazer_fim_de_semana", title: "Fazer no fim de semana", color: "violet-500", hex: "#8b5cf6", sistema: true },
  { id: "standby", title: "Standby", color: "blue-500", hex: "#3b82f6", sistema: false },
  { id: "feito", title: "Feito", color: "green-500", hex: "#22c55e", sistema: true },
];

export const COLUMN_COLORS = [
  "#64748b", "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899", "#78716c",
];

// Gera um id estável (valor gravado em demandas.status) a partir do título
export function slugifyColumnId(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30) || "coluna";
  return `${base}_${Math.random().toString(36).slice(2, 6)}`;
}

export async function fetchDemandaColunas(): Promise<KanbanColumnDef[]> {
  const { data, error } = await supabase
    .from("demanda_colunas")
    .select("id, titulo, hex, ordem, sistema")
    .order("ordem", { ascending: true });
  // Só cai no padrão se a tabela não existir; tabela vazia (colunas apagadas no Admin) = board vazio
  if (error) {
    console.error("Erro ao buscar colunas:", error);
    return DEFAULT_COLUMNS;
  }
  return (data || []).map((c) => ({ id: c.id, title: c.titulo, color: "", hex: c.hex, sistema: c.sistema }));
}

export function useDemandaColunas() {
  const [colunas, setColunas] = useState<KanbanColumnDef[]>([]);
  const reload = () => fetchDemandaColunas().then(setColunas);
  useEffect(() => {
    reload();
  }, []);
  return { colunas, reload };
}
