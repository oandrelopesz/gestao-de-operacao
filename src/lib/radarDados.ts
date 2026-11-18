import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  filtrosParaSearch,
  hojeSP,
  ordenarAchados,
  type Achado,
  type Dia,
  type Evento,
  type Filtros,
  type StatusAchado,
} from "@/lib/radar";

// Tabelas novas não estão nos tipos gerados.
const tabela = (nome: string) => supabase.from(nome as any) as any;

const COLUNAS_ACHADO =
  "id,data,titulo,classe,tipo,tipo_motivo,alerta,temas,confianca,estagio,prontidao,publicacao,primeira_descoberta,atualizacao,corpo,links,post_x_url,link_citado_x_url,texto_whatsapp,enviado_em,versao,corrigido,status,status_em,nota_pessoal";

const CINCO_MIN = 5 * 60 * 1000;

type DiaRadar = { dia: Dia | null; achados: Achado[]; eventos: Evento[] };

export function useDiaRadar(data: string) {
  return useQuery<DiaRadar>({
    queryKey: ["radar", "dia", data],
    refetchInterval: data === hojeSP() ? CINCO_MIN : false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [d, a, e] = await Promise.all([
        tabela("radar_dias").select("*").eq("data", data).maybeSingle(),
        tabela("radar_achados").select(COLUNAS_ACHADO).eq("data", data),
        tabela("radar_eventos").select("*").eq("data", data).order("ocorrido_em", { ascending: true }),
      ]);
      if (d.error) throw d.error;
      if (a.error) throw a.error;
      if (e.error) throw e.error;
      return {
        dia: (d.data ?? null) as Dia | null,
        achados: ordenarAchados((a.data ?? []) as Achado[]),
        eventos: (e.data ?? []) as Evento[],
      };
    },
  });
}

export function useAchadosRadar(f: Filtros, habilitado = true) {
  return useQuery<Achado[]>({
    queryKey: ["radar", "achados", filtrosParaSearch({ ...f, view: "dia" })],
    enabled: habilitado,
    queryFn: async () => {
      let q = tabela("radar_achados").select(COLUNAS_ACHADO);
      if (f.dia) q = q.eq("data", f.dia);
      else {
        if (f.de) q = q.gte("data", f.de);
        if (f.ate) q = q.lte("data", f.ate);
      }
      if (f.classe.length) q = q.in("classe", f.classe);
      if (f.tipo.length) q = q.in("tipo", f.tipo);
      if (f.status.length) q = q.in("status", f.status);
      if (f.confianca.length) q = q.in("confianca", f.confianca);
      if (f.tema.length) q = q.overlaps("temas", f.tema);
      if (f.alerta) q = q.eq("alerta", true);
      if (f.q.trim()) q = q.textSearch("busca", f.q.trim(), { type: "websearch", config: "portuguese" });
      // ponytail: limite fixo de 500; paginar se o histórico passar disso.
      const { data, error } = await q.order("data", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as Achado[];
    },
  });
}

export function useDiaAnteriorComConteudo(data: string) {
  return useQuery<string | null>({
    queryKey: ["radar", "dia-anterior", data],
    queryFn: async () => {
      const { data: r, error } = await tabela("radar_dias")
        .select("data")
        .lt("data", data)
        .order("data", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (r?.[0]?.data as string | undefined) ?? null;
    },
  });
}

type Mudanca = { id: string; status?: StatusAchado; nota_pessoal?: string | null };

export function useAtualizarAchado() {
  const qc = useQueryClient();
  return useMutation<void, Error, Mudanca, { snapshots: [readonly unknown[], unknown][] }>({
    mutationFn: async ({ id, ...campos }) => {
      const { error } = await tabela("radar_achados").update(campos).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, ...campos }) => {
      await qc.cancelQueries({ queryKey: ["radar"] });
      const snapshots = qc.getQueriesData({ queryKey: ["radar"] }) as [readonly unknown[], unknown][];
      const aplica = (a: Achado): Achado => (a.id === id ? { ...a, ...campos } : a);
      qc.setQueriesData({ queryKey: ["radar"] }, (antigo: unknown) => {
        if (Array.isArray(antigo)) {
          return antigo.some((x) => x && typeof x === "object" && "titulo" in x) ? (antigo as Achado[]).map(aplica) : antigo;
        }
        if (antigo && typeof antigo === "object" && Array.isArray((antigo as DiaRadar).achados)) {
          const d = antigo as DiaRadar;
          return { ...d, achados: d.achados.map(aplica) };
        }
        return antigo;
      });
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshots.forEach(([key, dados]) => qc.setQueryData(key, dados));
      toast.error("Não foi possível salvar");
    },
    onSuccess: (_d, v) => {
      if (v.status) toast.success("Status atualizado");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["radar"] });
    },
  });
}
