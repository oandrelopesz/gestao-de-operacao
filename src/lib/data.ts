import { supabase } from "@/integrations/supabase/client";
import { parseOperacoesResumo } from "@/lib/clientes";
import { formatMoeda } from "@/lib/moedas";
import { categoriaDoScore } from "@/lib/nps";
import { fetchDemandaColunas } from "@/lib/demandaColunas";
import { fetchCursoCategorias } from "@/lib/cursoCategorias";
import { fetchHabilidades } from "@/lib/habilidades";
import { fetchPdfBiblioteca } from "@/lib/pdfs";
import { CAMPOS_REUNIAO, normalizarReuniao, ordenar, type ReuniaoFireflies } from "@/lib/fireflies";
import type { Passo } from "@/lib/processosService";
import { hasCached, setCached } from "@/lib/pageCache";
import { carregarColunas as carregarColunasCrm, carregarEventos as carregarEventosCrm, carregarLeads as carregarLeadsCrm } from "@/lib/crmDados";
import { emLotes } from "@/lib/aquecimento";
import type { QueryClient } from "@tanstack/react-query";

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
  acessos: "acessos",
  financeiro: "financeiro",
  cursos: "cursos",
  cursoCategorias: "curso-categorias",
  livros: "livros",
  habilidades: "habilidades",
  pdfs: "pdfs",
  fireflies: "fireflies",
  crmColunas: "crm-colunas",
  crmLeads: "crm-leads",
  crmEventos: "crm-eventos",
  ideias: "ideias",
  /** Mesma chave de CACHE_CATEGORIAS_IDEIAS (src/lib/ideiasCategorias.ts) */
  ideiasCategorias: "ideias.categorias",
  links: "links.lista",
  linksTemas: "links.temas",
  notas: "notas.lista",
  notasTemas: "notas.temas",
  verDepois: "ver-depois",
  verDepoisTipos: "ver-depois.tipos",
  onboardingClientes: "onboarding.clientes",
  onboardingProcessos: "onboarding.processos",
  onboardingRoadmaps: "onboarding.roadmaps",
  roadmaps: "roadmap.lista",
  roadmapPassosOnboarding: "roadmap.passos-onboarding",
  transcritor: "transcritor.lista",
  swipeConfig: "swipe.config",
  swipeNichos: "swipe.nichos",
  swipeItens: "swipe.itens",
  swipeFila: "swipe.fila",
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

/**
 * clientes_view enriquecida com resumo de plataformas/verba (aba Clientes Ativos).
 * `arquivado` escolhe entre os clientes ativos (padrão, os do cache da aba) e os arquivados.
 */
async function buscarClientesView(arquivado: boolean) {
  const { data, error } = await supabase
    .from("clientes_view" as any)
    .select("*")
    .eq("arquivado", arquivado)
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
    // A view ainda calcula nps_status em 45/35/25; a escala oficial é a 40/30/20 (a mesma da aba NPS)
    return {
      ...cli,
      nps_status: categoriaDoScore(cli.ultima_nps_score),
      operacoes,
      saldo_ads_summary: summary,
      plataformas_ativas: uniquePlats,
    };
  });
}

/** Clientes ativos (não arquivados) para a aba Clientes Ativos */
export function loadClientesView() {
  return buscarClientesView(false);
}

/** Clientes arquivados, para a opção "Mostrar arquivados" (fora do cache dos ativos) */
export function loadClientesArquivados() {
  return buscarClientesView(true);
}

export async function loadSaldo() {
  const { data, error } = await supabase
    .from("saldo_ads_view")
    .select("*, clientes!inner(status_operacional, verba_ads)")
    .order("dias_restantes", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data || []) as any[];
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

/** Reuniões importadas do Fireflies (aba Fireflies): mais recente primeiro, sem data no fim. */
export async function loadFireflies(): Promise<ReuniaoFireflies[]> {
  const { data, error } = await supabase
    .from("fireflies_reunioes")
    .select(CAMPOS_REUNIAO)
    .order("data_hora", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return ordenar(((data || []) as unknown as Record<string, unknown>[]).map(normalizarReuniao));
}

// Os carregadores das abas abaixo vêm por import dinâmico: o código deles fica no pacote da própria aba
// (já baixado quando ela abre) e não pesa na abertura das outras telas.
const processos = () => import("@/lib/processosService");

/** Links "Ver depois": não vistos primeiro, mais novos no topo. */
export async function loadVerDepois() {
  const { data, error } = await supabase.from("ver_depois").select("*").order("visto").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as any[];
}

/** Onboarding → Em andamento: clientes em onboarding, processos ativos e os roadmaps ligados aos passos. */
export async function loadOnboardingAndamento() {
  const { fetchClientesEmOnboarding, fetchProcessos, fetchRoadmapsLigados } = await processos();
  const [clientes, lista] = await Promise.all([fetchClientesEmOnboarding(), fetchProcessos("onboarding", "ativos")]);
  const roadmaps = await fetchRoadmapsLigados(lista.flatMap((x) => x.passos.map((s) => s.id)));
  return { clientes, processos: lista, roadmaps };
}

/** Roadmap → Em andamento: roadmaps ativos e os passos de onboarding (para a ligação passo ↔ roadmap). */
export async function loadRoadmapAndamento() {
  const { fetchProcessos } = await processos();
  const [roadmaps, onboardings] = await Promise.all([fetchProcessos("roadmap", "ativos"), fetchProcessos("onboarding", "ativos")]);
  const passosOnboarding = new Map<string, Passo>();
  onboardings.forEach((p) => p.passos.forEach((s) => passosOnboarding.set(s.id, s)));
  return { roadmaps, passosOnboarding };
}

/** NPS de Clientes (React Query): mesmas chaves e consultas da aba, para o pré-aquecimento. */
export const NPS_CLIENTES_QUERY = {
  queryKey: ["clientes-ativos-nps"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nome, agencia, status_operacional, em_onboarding, nicho")
      .eq("arquivado", false)
      .order("nome");
    if (error) throw error;
    return data || [];
  },
};
export const NPS_AVALIACOES_QUERY = {
  queryKey: ["nps-avaliacoes"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("nps_avaliacoes_view")
      .select("*")
      .order("data_avaliacao", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
};

/**
 * Pré-aquece o cache de todas as abas em segundo plano, para que a primeira troca de aba já encontre o
 * conteúdo pronto. Na ordem do menu, em lotes pequenos (`lote`), esperando `antes()` (navegador ocioso)
 * antes de cada lote; o que já está no cache (a tela aberta acabou de carregar) não é buscado de novo.
 * Falhas são silenciosas: a própria página tenta de novo ao abrir.
 */
export async function warmAllCaches(
  queryClient?: QueryClient,
  opcoes: { lote?: number; antes?: () => Promise<void>; cancelado?: () => boolean } = {},
): Promise<void> {
  const jobs: [string, () => Promise<unknown>][] = [
    // Operação
    [CACHE_KEYS.demandas, loadDemandas],
    [CACHE_KEYS.colunas, loadColunas],
    [CACHE_KEYS.clientesLite, loadClientesLite],
    [
      CACHE_KEYS.onboardingProcessos,
      async () => {
        const { clientes, processos, roadmaps } = await loadOnboardingAndamento();
        setCached(CACHE_KEYS.onboardingClientes, clientes);
        setCached(CACHE_KEYS.onboardingRoadmaps, roadmaps);
        return processos;
      },
    ],
    [
      CACHE_KEYS.roadmaps,
      async () => {
        const { roadmaps, passosOnboarding } = await loadRoadmapAndamento();
        setCached(CACHE_KEYS.roadmapPassosOnboarding, passosOnboarding);
        return roadmaps;
      },
    ],
    [CACHE_KEYS.ideias, async () => (await import("@/lib/ideias")).fetchIdeias()],
    [CACHE_KEYS.ideiasCategorias, async () => (await import("@/lib/ideiasCategorias")).fetchCategoriasIdeias()],
    [CACHE_KEYS.acessos, loadAcessos],
    [CACHE_KEYS.saldo, loadSaldo],
    // Comercial
    [CACHE_KEYS.clientesView, loadClientesView],
    [CACHE_KEYS.crmColunas, carregarColunasCrm],
    [CACHE_KEYS.crmLeads, carregarLeadsCrm],
    [CACHE_KEYS.crmEventos, carregarEventosCrm],
    // Pessoal
    [CACHE_KEYS.financeiro, loadFinanceiro],
    [
      CACHE_KEYS.cursos,
      async () => {
        const { cursos, categorias } = await loadCursos();
        setCached(CACHE_KEYS.cursoCategorias, categorias);
        return cursos;
      },
    ],
    [CACHE_KEYS.livros, loadLivros],
    [CACHE_KEYS.habilidades, fetchHabilidades],
    [CACHE_KEYS.verDepois, loadVerDepois],
    [
      CACHE_KEYS.verDepoisTipos,
      async () => {
        // A aba só troca os 6 tipos padrão quando a tabela devolve algum
        const tipos = await (await import("@/lib/verDepoisTipos")).fetchTiposVerDepois();
        if (!tipos.length) throw new Error("sem tipos");
        return tipos;
      },
    ],
    // Ferramentas
    [CACHE_KEYS.transcritor, async () => (await import("@/lib/transcritor")).fetchTranscricoes()],
    [CACHE_KEYS.fireflies, loadFireflies],
    [
      CACHE_KEYS.swipeItens,
      async () => {
        // Mesmas consultas da aba (a fila é opcional: se falhar, fica vazia)
        const { fetchSwipeConfig, fetchNichos, fetchItens, fetchFila } = await import("@/lib/swipe");
        const [config, nichos, itens, fila] = await Promise.all([fetchSwipeConfig(), fetchNichos(), fetchItens(), fetchFila().catch(() => [])]);
        setCached(CACHE_KEYS.swipeConfig, config);
        setCached(CACHE_KEYS.swipeNichos, nichos);
        setCached(CACHE_KEYS.swipeFila, fila);
        return itens;
      },
    ],
    [CACHE_KEYS.links, async () => (await import("@/lib/links")).fetchLinks()],
    [CACHE_KEYS.linksTemas, async () => (await import("@/lib/links")).fetchTemas()],
    [CACHE_KEYS.notas, async () => (await import("@/lib/notas")).fetchNotas()],
    [CACHE_KEYS.notasTemas, async () => (await import("@/lib/notas")).fetchTemasNotas()],
    [CACHE_KEYS.pdfs, fetchPdfBiblioteca],
  ];

  const tarefas = jobs
    .filter(([key]) => !hasCached(key))
    .map(([key, load]) => async () => {
      try {
        setCached(key, await load());
      } catch {
        // tabela ausente ou sem permissão: a página mostra o próprio erro
      }
    });
  // NPS usa o React Query: pré-carrega nas mesmas chaves (a aba abre com os dados e atualiza por trás)
  if (queryClient) {
    if (queryClient.getQueryData(NPS_CLIENTES_QUERY.queryKey) === undefined) tarefas.push(() => queryClient.prefetchQuery(NPS_CLIENTES_QUERY));
    if (queryClient.getQueryData(NPS_AVALIACOES_QUERY.queryKey) === undefined) tarefas.push(() => queryClient.prefetchQuery(NPS_AVALIACOES_QUERY));
  }

  await emLotes(tarefas, opcoes.lote ?? tarefas.length, opcoes.antes ?? (async () => {}), opcoes.cancelado);
}
