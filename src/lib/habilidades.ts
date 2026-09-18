import { supabase } from "@/integrations/supabase/client";

export interface Subhabilidade {
  id: string;
  habilidade_id: string;
  nome: string;
  /** O que seria nota 10 nesta subhabilidade */
  criterios: string | null;
  nota: number;
  peso: number;
  ordem: number;
}

export type RecursoTipo = "livro" | "curso" | "newsletter" | "blog" | "perfil" | "artigo" | "podcast" | "doc";

export interface HabilidadeRecurso {
  id: string;
  habilidade_id: string;
  tipo: RecursoTipo;
  titulo: string;
  autor: string | null;
  link: string | null;
  observacao: string | null;
  ordem: number;
}

export interface Habilidade {
  id: string;
  nome: string;
  descricao: string | null;
  peso: number;
  ordem: number;
  subhabilidades: Subhabilidade[];
  recursos: HabilidadeRecurso[];
}

export const RECURSO_TIPOS: { id: RecursoTipo; label: string }[] = [
  { id: "livro", label: "Livro" },
  { id: "curso", label: "Curso / mentoria" },
  { id: "newsletter", label: "Newsletter" },
  { id: "blog", label: "Blog" },
  { id: "artigo", label: "Artigo" },
  { id: "perfil", label: "Perfil em rede social" },
  { id: "podcast", label: "Podcast / canal" },
  { id: "doc", label: "Documentação / ferramenta" },
];

// ---------------------------------------------------------------- Níveis

export type NivelId = "muito_baixo" | "baixo" | "medio" | "alto" | "muito_alto";

export interface Nivel {
  id: NivelId;
  label: string;
  /** Nota mínima (inclusiva) para entrar neste nível */
  min: number;
  hex: string;
}

export const NIVEIS: Nivel[] = [
  { id: "muito_baixo", label: "Muito baixo", min: 0, hex: "#ef4444" },
  { id: "baixo", label: "Baixo", min: 3, hex: "#f97316" },
  { id: "medio", label: "Médio", min: 5, hex: "#eab308" },
  { id: "alto", label: "Alto", min: 7, hex: "#22c55e" },
  { id: "muito_alto", label: "Muito alto", min: 8.5, hex: "#0ea5e9" },
];

export function nivelDaNota(nota: number | null): Nivel {
  if (nota === null || Number.isNaN(nota)) return NIVEIS[0];
  let atual = NIVEIS[0];
  for (const n of NIVEIS) if (nota >= n.min) atual = n;
  return atual;
}

export function proximoNivel(nivel: Nivel): Nivel | null {
  const idx = NIVEIS.findIndex((n) => n.id === nivel.id);
  return NIVEIS[idx + 1] ?? null;
}

// ---------------------------------------------------------------- Notas

function mediaPonderada(itens: { nota: number; peso: number }[]): number | null {
  const somaPesos = itens.reduce((acc, i) => acc + i.peso, 0);
  if (!somaPesos) return null;
  return itens.reduce((acc, i) => acc + i.nota * i.peso, 0) / somaPesos;
}

/** Nota da habilidade: média ponderada das subhabilidades (null se não tiver nenhuma) */
export function notaDaHabilidade(h: Pick<Habilidade, "subhabilidades">): number | null {
  return mediaPonderada(h.subhabilidades.map((s) => ({ nota: Number(s.nota), peso: Number(s.peso) })));
}

/** Nota geral: média ponderada das habilidades que já têm subhabilidades */
export function notaGeral(habilidades: Habilidade[]): number | null {
  const itens = habilidades
    .map((h) => ({ nota: notaDaHabilidade(h), peso: Number(h.peso) }))
    .filter((i): i is { nota: number; peso: number } => i.nota !== null);
  return mediaPonderada(itens);
}

export function formatNota(nota: number | null): string {
  if (nota === null) return "—";
  return nota.toFixed(1).replace(".", ",");
}

// ---------------------------------------------------------------- Dados

export async function fetchHabilidades(): Promise<Habilidade[]> {
  const [habRes, subRes, recRes] = await Promise.all([
    supabase.from("habilidades").select("id, nome, descricao, peso, ordem").order("ordem").order("nome"),
    supabase.from("subhabilidades").select("id, habilidade_id, nome, criterios, nota, peso, ordem").order("ordem").order("nome"),
    supabase.from("habilidade_recursos").select("id, habilidade_id, tipo, titulo, autor, link, observacao, ordem").order("ordem"),
  ]);
  if (habRes.error) throw habRes.error;
  if (subRes.error) throw subRes.error;
  if (recRes.error) throw recRes.error;

  const subs = (subRes.data || []).map((s) => ({ ...s, nota: Number(s.nota), peso: Number(s.peso) })) as Subhabilidade[];
  const recs = (recRes.data || []) as HabilidadeRecurso[];
  return (habRes.data || []).map((h) => ({
    ...h,
    peso: Number(h.peso),
    subhabilidades: subs.filter((s) => s.habilidade_id === h.id),
    recursos: recs.filter((r) => r.habilidade_id === h.id),
  }));
}

export async function createHabilidade(input: { nome: string; descricao?: string; peso: number }, habilidadesAtuais: Habilidade[]) {
  const ordem = habilidadesAtuais.length ? Math.max(...habilidadesAtuais.map((h) => h.ordem)) + 1 : 0;
  const { data, error } = await supabase
    .from("habilidades")
    .insert([{ nome: input.nome.trim(), descricao: input.descricao?.trim() || null, peso: input.peso, ordem }])
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateHabilidade(id: string, input: { nome: string; descricao?: string; peso: number }) {
  const { error } = await supabase
    .from("habilidades")
    .update({ nome: input.nome.trim(), descricao: input.descricao?.trim() || null, peso: input.peso })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteHabilidade(id: string) {
  const { error } = await supabase.from("habilidades").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderHabilidades(ordenadas: Habilidade[]) {
  const results = await Promise.all(ordenadas.map((h, i) => supabase.from("habilidades").update({ ordem: i }).eq("id", h.id)));
  const falha = results.find((r) => r.error);
  if (falha?.error) throw falha.error;
}

export async function createSubhabilidade(input: { habilidade_id: string; nome: string; criterios?: string; peso: number; nota?: number }, subsAtuais: Subhabilidade[]) {
  const ordem = subsAtuais.length ? Math.max(...subsAtuais.map((s) => s.ordem)) + 1 : 0;
  const { error } = await supabase.from("subhabilidades").insert([{
    habilidade_id: input.habilidade_id,
    nome: input.nome.trim(),
    criterios: input.criterios?.trim() || null,
    peso: input.peso,
    nota: input.nota ?? 0,
    ordem,
  }]);
  if (error) throw error;
}

export async function updateSubhabilidade(id: string, input: Partial<Pick<Subhabilidade, "nome" | "criterios" | "peso" | "nota">>) {
  const payload: { nome?: string; criterios?: string | null; peso?: number; nota?: number } = {};
  if (typeof input.nome === "string") payload.nome = input.nome.trim();
  if (input.criterios !== undefined) payload.criterios = input.criterios?.trim() || null;
  if (input.peso !== undefined) payload.peso = input.peso;
  if (input.nota !== undefined) payload.nota = input.nota;
  const { error } = await supabase.from("subhabilidades").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteSubhabilidade(id: string) {
  const { error } = await supabase.from("subhabilidades").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderSubhabilidades(ordenadas: Subhabilidade[]) {
  const results = await Promise.all(ordenadas.map((s, i) => supabase.from("subhabilidades").update({ ordem: i }).eq("id", s.id)));
  const falha = results.find((r) => r.error);
  if (falha?.error) throw falha.error;
}

export async function createRecurso(input: { habilidade_id: string; tipo: RecursoTipo; titulo: string; autor?: string; link?: string; observacao?: string }, recursosAtuais: HabilidadeRecurso[]) {
  const ordem = recursosAtuais.length ? Math.max(...recursosAtuais.map((r) => r.ordem)) + 1 : 0;
  const { error } = await supabase.from("habilidade_recursos").insert([{
    habilidade_id: input.habilidade_id,
    tipo: input.tipo,
    titulo: input.titulo.trim(),
    autor: input.autor?.trim() || null,
    link: input.link?.trim() || null,
    observacao: input.observacao?.trim() || null,
    ordem,
  }]);
  if (error) throw error;
}

export async function deleteRecurso(id: string) {
  const { error } = await supabase.from("habilidade_recursos").delete().eq("id", id);
  if (error) throw error;
}

/** Link do recurso ou, se não tiver, uma busca pelo título + autor */
export function linkDoRecurso(r: HabilidadeRecurso): string {
  if (r.link) return r.link;
  return `https://www.google.com/search?q=${encodeURIComponent([r.titulo, r.autor].filter(Boolean).join(" "))}`;
}

// ---------------------------------------------------------------- Prompt de pesquisa

/**
 * Subhabilidades que mais puxam a nota para baixo: todas abaixo de 7 (nível < alto),
 * da pior para a melhor. Se todas estiverem altas, as 2 piores mesmo assim.
 */
export function subsPrioritarias(h: Habilidade): Subhabilidade[] {
  const ordenadas = [...h.subhabilidades].sort((a, b) => a.nota - b.nota || b.peso - a.peso);
  const abaixo = ordenadas.filter((s) => s.nota < 7);
  return abaixo.length ? abaixo : ordenadas.slice(0, 2);
}

function linha(s: Subhabilidade): string {
  const nivel = nivelDaNota(s.nota).label;
  const crit = s.criterios ? ` — nota 10 seria: ${s.criterios}` : "";
  return `- ${s.nome}: ${formatNota(s.nota)}/10 (${nivel}, peso ${s.peso})${crit}`;
}

export function gerarPromptPesquisa(h: Habilidade): string {
  const nota = notaDaHabilidade(h);
  const nivel = nivelDaNota(nota);
  const proximo = proximoNivel(nivel);
  const prioritarias = subsPrioritarias(h);
  const fortes = h.subhabilidades.filter((s) => !prioritarias.some((p) => p.id === s.id) && s.nota >= 7);
  const meta = nota === null ? 7 : Math.min(10, Math.max(nota + 1.5, proximo?.min ?? nota + 1));
  const hoje = new Date().toLocaleDateString("pt-BR");
  const nomeArquivo = `Roadmap - ${h.nome} - ${new Date().toISOString().slice(0, 10)}.docx`;
  const minimoRecursos = Math.max(15, prioritarias.length * 8);

  const blocoPrioridades = prioritarias.length
    ? prioritarias.map((s, i) => `${i + 1}. ${s.nome} (${formatNota(s.nota)}/10, ${nivelDaNota(s.nota).label})`).join("\n")
    : "- (nenhuma subhabilidade cadastrada ainda; trate a habilidade como um todo)";

  const blocoFortes = fortes.length
    ? fortes.map((s) => `- ${s.nome} (${formatNota(s.nota)}/10)`).join("\n")
    : "- (nenhuma acima de 7 por enquanto)";

  return `# MISSÃO: pesquisa profunda de recursos para evoluir em ${h.nome.toUpperCase()}

Você é um pesquisador sênior, especialista em ${h.nome} e em curadoria de conteúdo educacional para profissionais de marketing digital e negócios. Você tem acesso ao navegador e DEVE usá-lo ativamente: abrir sites, ler avaliações, comparar edições, conferir se cursos ainda estão à venda, checar datas de publicação e testar cada link. Não responda de memória quando puder verificar. Trabalhe de forma extensa e densa: esta é uma pesquisa de horas, não uma lista rápida.

## 1. CONTEXTO SOBRE MIM
- Perfil: estrategista digital (tráfego pago, copy, CRM, vendas, IA e desenvolvimento de sistemas com IA). Português é minha língua; leio inglês sem problema.
- Habilidade avaliada: **${h.nome}**${h.descricao ? ` — ${h.descricao}` : ""}
- Nota atual da habilidade: **${formatNota(nota)}/10** (nível: **${nivel.label}**), calculada como média ponderada das subhabilidades abaixo.
- Data da avaliação: ${hoje}

### Auto-avaliação por subhabilidade (0 a 10)
${h.subhabilidades.length ? h.subhabilidades.map(linha).join("\n") : "- (sem subhabilidades cadastradas)"}

### PRIORIDADE DE MELHORIA (da pior nota para a melhor — o foco da pesquisa)
${blocoPrioridades}

### Pontos fortes (não preciso de material introdutório nestes; só avançado se for excepcional)
${blocoFortes}

## 2. OBJETIVO
Montar um plano de estudos curado, com os MELHORES recursos que existem, para levar as subhabilidades prioritárias ao nível seguinte e a habilidade "${h.nome}" de ${formatNota(nota)} para pelo menos ${formatNota(meta)}/10${proximo ? ` (nível ${proximo.label})` : ""}.

## 3. O QUE PESQUISAR — para CADA subhabilidade prioritária, separadamente
1. **Livros**: 3 a 6 por subhabilidade. Misture clássicos atemporais e lançamentos recentes; autores brasileiros e estrangeiros. Justifique cada um.
2. **Cursos, formações e mentorias**: 2 a 5 por subhabilidade. Pagos ou gratuitos, brasileiros e gringos. Verifique se ainda estão abertos/à venda.
3. **Newsletters**: 2 a 4 realmente boas e ativas (última edição nos últimos 60 dias).
4. **Artigos, posts de blog e guias**: 3 a 8 artigos individuais (link direto para o artigo, não para a home do blog).
5. **Perfis em redes sociais** (LinkedIn, X, Instagram, YouTube, TikTok): 3 a 6 perfis que publicam conteúdo de alto nível sobre o tema.
6. **Podcasts, canais e comunidades**: 2 a 4, incluindo episódios específicos quando fizer sentido.
7. **Documentação oficial, ferramentas e playgrounds**, quando o tema tiver (plataformas, APIs, simuladores).

## 4. CRITÉRIOS DE QUALIDADE (obrigatórios)
- Priorize quem tem resultado comprovado e reputação sólida: reviews, tempo de mercado, cases, citações por outros especialistas. Evite "gurus" sem histórico verificável.
- Adequação ao nível: para subhabilidade com nota abaixo de 5, inclua fundamentos; entre 5 e 7, intermediário e prática; acima de 7, apenas avançado.
- Em temas que mudam rápido (plataformas de anúncios, IA, tracking, ferramentas), prefira material dos últimos 12 a 24 meses. Clássicos só se continuarem relevantes, e diga por quê.
- Abra e verifique CADA link no navegador antes de incluir. Nada de link quebrado ou inventado.
- Cursos e mentorias: use SEMPRE o link da LANDING PAGE (página de apresentação/vendas). NUNCA link de checkout, carrinho, Hotmart/Kiwify pay, ou página de pagamento.
- Livros: link da página de compra (Amazon Brasil de preferência, senão editora ou Amazon.com). Informe se existe edição em português.
- Não repita um recurso em duas subhabilidades: liste uma vez e indique quais subhabilidades ele cobre.
- Para cada recurso, informe idioma, preço aproximado (ou "gratuito") e formato.
- Não invente. Se não encontrar algo bom em alguma categoria, escreva "não encontrei recurso de qualidade suficiente" e siga.

## 5. FORMATO DE SAÍDA (obrigatório): arquivo .docx
Nome do arquivo: **${nomeArquivo}**

Estrutura do documento:
1. **Resumo**: habilidade, nota atual, nível, lista das subhabilidades prioritárias e um parágrafo com a estratégia do plano.
2. **Uma seção por subhabilidade prioritária**, na ordem da pior nota para a melhor. Dentro de cada seção, uma tabela por tipo de recurso, com estas colunas:
   - Livros: Título | Autor | Ano | Idioma | Por que ler (1–2 frases) | Nível (iniciante/intermediário/avançado) | Link de compra
   - Cursos/Mentorias: Nome | Quem ensina | Formato (gravado/ao vivo/mentoria) | Idioma | Preço aprox. | Por que fazer | Link da landing page
   - Newsletters: Nome | Autor | Frequência | Idioma | Por que assinar | Link
   - Artigos/Blogs: Título | Autor ou site | Ano | Por que ler | Link direto
   - Perfis: Nome | Rede | O que publica | Por que seguir | Link do perfil
   - Podcasts/Canais/Comunidades: Nome | Plataforma | Por que | Link
   - Documentação/Ferramentas: Nome | O que é | Por que usar | Link
3. **Ordem de estudo sugerida**: plano de 30/60/90 dias dizendo o que consumir primeiro, o que praticar e como saber que evoluí (critério de nota 10 de cada subhabilidade como referência).
4. **Fontes consultadas** durante a pesquisa.

## 6. REGRAS FINAIS
- Idioma da resposta e do documento: português do Brasil (os recursos podem ser em inglês).
- Foque APENAS em "${h.nome}". Não inclua recursos de outras habilidades.
- Mínimo esperado: ${minimoRecursos} recursos no total, mas qualidade vem antes de quantidade.
- Ao terminar, entregue o arquivo .docx e um resumo curto (até 10 linhas) no chat com os 5 recursos mais importantes para começar.`;
}
