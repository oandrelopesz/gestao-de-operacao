import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AgenciaDef {
  id: string;
  label: string;
  hex: string;
  ordem: number;
  ativa: boolean;
}

// Fallback usado apenas se a tabela agencias não estiver disponível
export const DEFAULT_AGENCIAS: AgenciaDef[] = [
  { id: "effect", label: "Effect", hex: "#3b82f6", ordem: 0, ativa: true },
  { id: "spike", label: "Spike", hex: "#8b5cf6", ordem: 1, ativa: true },
  { id: "alt", label: "Alt", hex: "#f59e0b", ordem: 2, ativa: true },
  { id: "pessoais", label: "Pessoais", hex: "#10b981", ordem: 3, ativa: true },
  { id: "azo", label: "AZO", hex: "#f43f5e", ordem: 4, ativa: true },
];

export const AGENCIA_COLORS = [
  "#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#f43f5e",
  "#06b6d4", "#ef4444", "#84cc16", "#ec4899", "#64748b",
];

// Gera o id (valor gravado em clientes.agencia) a partir do nome
export function slugifyAgenciaId(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30) || "agencia";
}

export async function fetchAgencias(): Promise<AgenciaDef[]> {
  const { data, error } = await supabase
    .from("agencias")
    .select("id, nome, hex, ordem, ativa")
    .order("ordem", { ascending: true });
  if (error || !data || data.length === 0) {
    if (error) console.error("Erro ao buscar agências:", error);
    return DEFAULT_AGENCIAS;
  }
  return data.map((a) => ({ id: a.id, label: a.nome, hex: a.hex, ordem: a.ordem, ativa: a.ativa }));
}

interface AgenciasContextValue {
  /** Agências ativas, na ordem configurada */
  agencias: AgenciaDef[];
  /** Todas, inclusive inativas (para exibir clientes antigos e para o admin) */
  todasAgencias: AgenciaDef[];
  loaded: boolean;
  reload: () => Promise<void>;
  label: (id: string | null | undefined) => string;
  meta: (id: string | null | undefined) => AgenciaDef | undefined;
}

const AgenciasContext = createContext<AgenciasContextValue | null>(null);

export function AgenciasProvider({ children }: { children: ReactNode }) {
  const [todasAgencias, setTodasAgencias] = useState<AgenciaDef[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    setTodasAgencias(await fetchAgencias());
    setLoaded(true);
  }, []);

  useEffect(() => {
    reload();
    // Qualquer alteração feita no admin (ou em outra aba) reflete aqui na hora
    const channel = supabase
      .channel("agencias-global")
      .on("postgres_changes", { event: "*", schema: "public", table: "agencias" }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const value = useMemo<AgenciasContextValue>(() => {
    const meta = (id: string | null | undefined) => todasAgencias.find((a) => a.id === id);
    return {
      agencias: todasAgencias.filter((a) => a.ativa),
      todasAgencias,
      loaded,
      reload,
      meta,
      label: (id) => (id === "todos" ? "Todos os Clientes" : meta(id)?.label ?? (id || "—")),
    };
  }, [todasAgencias, loaded, reload]);

  return <AgenciasContext.Provider value={value}>{children}</AgenciasContext.Provider>;
}

const fallbackValue: AgenciasContextValue = {
  agencias: DEFAULT_AGENCIAS,
  todasAgencias: DEFAULT_AGENCIAS,
  loaded: true,
  reload: async () => {},
  meta: (id) => DEFAULT_AGENCIAS.find((a) => a.id === id),
  label: (id) => (id === "todos" ? "Todos os Clientes" : DEFAULT_AGENCIAS.find((a) => a.id === id)?.label ?? (id || "—")),
};

export function useAgencias(): AgenciasContextValue {
  return useContext(AgenciasContext) ?? fallbackValue;
}

// Tailwind não gera classes para cores dinâmicas, então a cor da agência vai inline
export function agenciaBadgeStyle(hex?: string): CSSProperties {
  if (!hex) return {};
  return { color: hex, borderColor: `${hex}66`, backgroundColor: `${hex}14` };
}

export function agenciaBorderStyle(hex?: string): CSSProperties {
  if (!hex) return {};
  return { borderLeftColor: hex };
}
