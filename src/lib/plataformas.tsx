import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PlataformaDef {
  id: string;
  /** Nome exibido e valor gravado em saldo_ads.plataformas */
  nome: string;
  ordem: number;
  ativa: boolean;
}

// Gera o id a partir do nome (só para a chave da tabela)
export function slugifyPlataformaId(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30) || "plataforma";
}

// Fallback usado apenas se a tabela plataformas_ads não estiver disponível
export const DEFAULT_PLATAFORMAS: PlataformaDef[] = [
  "Meta", "Google", "Pinterest", "X Ads", "LinkedIn", "TikTok", "Taboola", "Outbrain",
].map((nome, i) => ({ id: slugifyPlataformaId(nome), nome, ordem: i, ativa: true }));

export async function fetchPlataformas(): Promise<PlataformaDef[]> {
  const { data, error } = await supabase
    .from("plataformas_ads")
    .select("id, nome, ordem, ativa")
    .order("ordem", { ascending: true });
  // Só cai no padrão se a tabela não existir; tabela vazia = nenhuma plataforma
  if (error) {
    console.error("Erro ao buscar plataformas:", error);
    return DEFAULT_PLATAFORMAS;
  }
  return (data || []).map((p) => ({ id: p.id, nome: p.nome, ordem: p.ordem, ativa: p.ativa }));
}

interface PlataformasContextValue {
  /** Plataformas ativas, na ordem configurada */
  plataformas: PlataformaDef[];
  /** Nomes das plataformas ativas (formato usado nos formulários) */
  nomes: string[];
  /** Todas, inclusive ocultas (para o admin) */
  todasPlataformas: PlataformaDef[];
  loaded: boolean;
  reload: () => Promise<void>;
}

const PlataformasContext = createContext<PlataformasContextValue | null>(null);

export function PlataformasProvider({ children }: { children: ReactNode }) {
  const [todasPlataformas, setTodasPlataformas] = useState<PlataformaDef[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    setTodasPlataformas(await fetchPlataformas());
    setLoaded(true);
  }, []);

  useEffect(() => {
    reload();
    // Alterações feitas no Admin (ou em outra aba) refletem aqui na hora
    const channel = supabase
      .channel("plataformas-global")
      .on("postgres_changes", { event: "*", schema: "public", table: "plataformas_ads" }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const value = useMemo<PlataformasContextValue>(() => {
    const ativas = todasPlataformas.filter((p) => p.ativa);
    return {
      plataformas: ativas,
      nomes: ativas.map((p) => p.nome),
      todasPlataformas,
      loaded,
      reload,
    };
  }, [todasPlataformas, loaded, reload]);

  return <PlataformasContext.Provider value={value}>{children}</PlataformasContext.Provider>;
}

const fallbackValue: PlataformasContextValue = {
  plataformas: DEFAULT_PLATAFORMAS,
  nomes: DEFAULT_PLATAFORMAS.map((p) => p.nome),
  todasPlataformas: DEFAULT_PLATAFORMAS,
  loaded: true,
  reload: async () => {},
};

export function usePlataformas(): PlataformasContextValue {
  return useContext(PlataformasContext) ?? fallbackValue;
}
