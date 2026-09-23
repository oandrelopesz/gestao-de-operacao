import { supabase } from "@/integrations/supabase/client";
import { parseOperacoesResumo } from "@/lib/clientes";
import { formatMoeda } from "@/lib/moedas";
import { fetchDemandaColunas } from "@/lib/demandaColunas";
import { fetchCursoCategorias } from "@/lib/cursoCategorias";
import { fetchHabilidades } from "@/lib/habilidades";
import { fetchPdfBiblioteca } from "@/lib/pdfs";
import { setCached } from "@/lib/pageCache";

/**
 * Carregadores compartilhados entre as páginas e o pré-aquecimento do cache.
 * Cada função devolve exatamente o que a página correspondente exibe, para que
 * o conteúdo pré-carregado seja o mesmo que a página renderiza.
 */

export const CACHE_KEYS = {
  demandas: "demandas",
  clientesLite: "clientes-lite",
  colunas: "demanda-colunas",
  clientesView: "clientes-view",
  saldo: "saldo",
  leads: "leads",
  acessos: "acessos",
  financeiro: "financeiro",
  cursos: "cursos",
  cursoCategorias: "curso-categorias",
  livros: "livros",
  habilidades: "habilidades",
  pdfs: "pdfs",
} as const;

export async function loadDemandas() {
  const { data, error } = await supabase
    .from("demandas")
    .select("*, clientes(nome, agencia)")
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function loadClientesLite() {
  const { data, error } = await supabase.from("clientes").select("id, nome, agencia").order("nome");
  if (error) throw error;
  return (data || []) as { id: string; nome: string; agencia: string }[];
}

export const loadColunas = fetchDemandaColunas;

/** clientes_view enriquecida com resumo de plataformas/verba (aba Clientes Ativos) */
export async function loadClientesView() {
  const { data, error } = await supabase
    .from("clientes_view" as any)
    .select("*")
    .eq("arquivado", false)
    .order("nome");
  if (error) throw error;

  const { data: saldos, error: saldosError } = await supabase
    .from("saldo_ads_view")
    .select("cliente_id, plataformas, verba_diaria_calc, ativo, operacao_nome, moeda");
  if (saldosError) console.warn("Erro ao buscar saldos para enriquecimento:", saldosError);

  return ((data as any[]) || []).map((cli) => {
    const cliSaldos = (saldos || []).filter((s) => s.cliente_id === cli.id && s.ativo !== false);
    const operacoes = parseOperacoesResumo(cli.operacoes);
    // Resumo por plataforma (na moeda da operação); com mais de uma operação, prefixa o nome dela
    const summary = cliSaldos
      .map((s) => {
        const platNames = s.plataformas && s.plataformas.length > 0 ? s.plataformas.join(", ") : "Outras";
        const verba = (s.verba_diaria_calc || 0) * 30;
        const prefixo = operacoes.length > 1 && s.operacao_nome ? `${s.operacao_nome}: ` : "";
        return `${prefixo}${platNames} ${formatMoeda(verba, s.moeda)}`;
      })
      .join(" / ");
    const uniquePlats = Array.from(new Set(cliSaldos.flatMap((s) => s.plataformas || [])));
    return { ...cli, operacoes, saldo_ads_summary: summary, plataformas_ativas: uniquePlats };
  });
}

export async function loadSaldo() {
  const { data, error } = await supabase
    .from("saldo_ads_view")
    .select("*, clientes!inner(status_operacional, verba_ads)")
    .order("dias_restantes", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data || []) as any[];
}

export async function loadLeads() {
  const { data, error } = await supabase
    .from("prospeccao")
    .select("*")
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any[]) || [];
}

export async function loadAcessos() {
  const { data, error } = await supabase.from("acessos_clientes").select("*").order("nome");
  if (error) throw error;
  return (data || []) as any[];
}

export async function loadFinanceiro() {
  const { data, error } = await supabase.from("financeiro_view" as any).select("*").order("nome");
  if (error) throw error;
  return (data as any[]) || [];
}

export async function loadCursos() {
  const [cursosRes, catsRes] = await Promise.all([
    supabase.from("cursos").select("*, curso_categorias(id, nome, cor)").order("nome", { ascending: true }),
    fetchCursoCategorias(),
  ]);
  if (cursosRes.error) throw cursosRes.error;
  const cursos = (cursosRes.data || []).map((c) => ({ ...c, em_andamento: !!c.em_andamento }));
  return { cursos: cursos as any[], categorias: catsRes };
}

export async function loadLivros() {
  const { data, error } = await supabase.from("livros").select("*").order("nome");
  if (error) throw error;
  return (data as any[]) || [];
}

/**
 * Pré-aquece o cache de todas as abas logo após o app abrir, em segundo plano,
 * para que a primeira troca de aba já encontre o conteúdo pronto.
 * Falhas são silenciosas: a própria página tenta de novo ao abrir.
 */
export async function warmAllCaches(): Promise<void> {
  const jobs: [string, () => Promise<unknown>][] = [
    [CACHE_KEYS.demandas, loadDemandas],
    [CACHE_KEYS.colunas, loadColunas],
    [CACHE_KEYS.clientesLite, loadClientesLite],
    [CACHE_KEYS.clientesView, loadClientesView],
    [CACHE_KEYS.saldo, loadSaldo],
    [CACHE_KEYS.leads, loadLeads],
    [CACHE_KEYS.acessos, loadAcessos],
    [CACHE_KEYS.financeiro, loadFinanceiro],
    [CACHE_KEYS.livros, loadLivros],
    [CACHE_KEYS.habilidades, fetchHabilidades],
    [CACHE_KEYS.pdfs, fetchPdfBiblioteca],
    [
      CACHE_KEYS.cursos,
      async () => {
        const { cursos, categorias } = await loadCursos();
        setCached(CACHE_KEYS.cursoCategorias, categorias);
        return cursos;
      },
    ],
  ];

  await Promise.all(
    jobs.map(async ([key, load]) => {
      try {
        setCached(key, await load());
      } catch {
        // tabela ausente ou sem permissão: a página mostra o próprio erro
      }
    })
  );
}
