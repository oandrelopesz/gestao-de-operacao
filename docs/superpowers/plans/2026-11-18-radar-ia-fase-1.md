# Radar IA, Fase 1: plano tático

Spec aprovada (18/11/2026): `docs/superpowers/specs/2026-11-17-aba-radar-ia-design.md`. Especificação completa: `docs/radar-ia/prompt-aba-radar-ia.md`. Menu: depois de "Habilidades". Produção (migration, segredo, função, push) autorizada pelo André.

Regras para todo executor: textos da interface em português do Brasil; shadcn/ui de `@/components/ui/*`, ícones `lucide-react`, toasts `sonner`, `cn` de `@/lib/utils`, cliente `supabase` de `@/integrations/supabase/client`, `@tanstack/react-query`. Nada vindo do bot vira HTML (sem `dangerouslySetInnerHTML`). Nenhuma dependência nova. Não tocar em arquivo existente fora do seu `files:`.

## Contratos

### C-LIB: `src/lib/radar.ts` (puro, sem React, sem supabase)

```ts
export type Classe = "excelente" | "bom" | "medio";
export type TipoAchado = "A" | "B" | "C";
export type Confianca = "alta" | "moderada" | "baixa";
export type StatusAchado = "novo" | "lido" | "testando" | "aplicado" | "descartado";
export type TipoEvento = "abertura" | "boletim" | "alerta" | "correcao" | "resposta" | "encerramento";
export type Visao = "dia" | "cards" | "tabela" | "calendario" | "kanban";

export const TEMAS: { slug: string; rotulo: string; cor: string }[]; // ordem: marketing Marketing, branding Branding, performance Performance, ia IA, software_saas Software/SaaS, dados_mensuracao Dados & Mensuração, ciberseguranca Cibersegurança, conteudo_social Conteúdo & Social; cor = classes Tailwind de badge (fundo/texto/borda), legíveis no claro e no escuro
export const CLASSES: Record<Classe, { emoji: string; rotulo: string; ordem: number; borda: string; selo: string; ponto: string }>; // excelente 🟣 "Excelente" ordem 0 violet-500; bom 🟢 "Bom" 1 emerald-500; medio 🟡 "Médio" 2 amber-500. borda = "border-l-violet-500" etc., selo = classes do selo, ponto = "bg-violet-500" etc.
export const TIPOS: Record<TipoAchado, string>; // A "Aplicação", B "Mudança", C "Lançamento"
export const STATUS: { valor: StatusAchado; rotulo: string }[]; // Novo, Lido, Testando, Aplicado, Descartado (nessa ordem)
export const CONFIANCAS: { valor: Confianca; rotulo: string }[]; // Alta, Moderada, Baixa
export const VISOES: { valor: Visao; rotulo: string }[]; // Dia, Cards, Tabela, Calendário, Kanban

export interface RadarLink { tipo: string; url: string; rotulo?: string }
export interface Achado {
  id: string; data: string; titulo: string; classe: Classe; tipo: TipoAchado; tipo_motivo: string | null; alerta: boolean;
  temas: string[]; confianca: Confianca; estagio: string; prontidao: string | null; publicacao: string | null;
  primeira_descoberta: string; atualizacao: string | null; corpo: any; links: RadarLink[]; post_x_url: string | null;
  link_citado_x_url: string | null; texto_whatsapp: string; enviado_em: string | null; versao: number; corrigido: boolean;
  status: StatusAchado; status_em: string | null; nota_pessoal: string | null;
}
export interface Dia {
  data: string; edicao_id: string; revisao: string | null; abertura_texto: string | null; encerramento_texto: string | null;
  resumo: { por_classe?: Partial<Record<Classe, number>>; por_tema?: Record<string, number>; fora?: { id: string; motivo: string }[] };
  cobertura_parcial: string | null; total_confirmados: number;
}
export interface Evento { id: string; data: string; tipo: TipoEvento; achado_id: string | null; ocorrido_em: string; texto_whatsapp: string | null; dados: any }

export interface Filtros {
  dia?: string; de?: string; ate?: string; // AAAA-MM-DD
  classe: Classe[]; tema: string[]; tipo: TipoAchado[]; status: StatusAchado[]; confianca: Confianca[];
  alerta: boolean; q: string; view: Visao;
}
export const FILTROS_VAZIOS: Filtros; // listas vazias, alerta false, q "", view "dia", sem dia/de/ate
export function lerFiltros(search: Record<string, unknown>): Filtros; // tolerante: aceita "a,b" ou array; descarta valor fora da lista e duplicado; datas só /^\d{4}-\d{2}-\d{2}$/; alerta true com "1", 1 ou true; view padrão "dia"; q aparado (trim)
export function filtrosParaSearch(f: Filtros): Record<string, string>; // só chaves com valor; listas unidas por ","; alerta "1"; view omitida quando "dia"; ordem estável das listas (a da constante)
export function contarFiltros(f: Filtros): number; // grupos ativos: classe, tema, tipo, status, confianca, alerta, q, período (de/ate contam 1). Não conta dia nem view
export function bateFiltro(a: Achado, f: Filtros): boolean; // classe, tema (basta um em comum), tipo, status, confianca, alerta, q (sem acento e sem caixa, todas as palavras em titulo + texto_whatsapp). Ignora dia/de/ate/view
export function ordenarAchados(lista: Achado[]): Achado[]; // nova lista: alerta primeiro, depois CLASSES.ordem, depois primeira_descoberta crescente
export function hojeSP(agora?: Date): string; // AAAA-MM-DD em America/Sao_Paulo (Intl.DateTimeFormat)
export function horaSP(iso: string): string; // "17/11/2026 21:04 (Brasília)"
export function soHoraSP(iso: string): string; // "21:04"
export function rotuloDia(data: string): string; // "Terça, 17/11/2026" (dia da semana com inicial maiúscula)
export function somarDias(data: string, n: number): string; // aritmética de calendário, sem fuso
export function boletimAindaNaoChegou(data: string, agora?: Date): boolean; // data === hojeSP(agora) e hora de SP antes de 08:15
export function edicaoDoDia(data: string): string; // "2026-11-17" -> "DIA-20261117"
export type Pedaco = { texto: string; negrito?: boolean; italico?: boolean; riscado?: boolean } | { quebra: true };
export function pedacosWhatsapp(texto: string): Pedaco[]; // *negrito*, _itálico_, ~riscado~ (podem combinar), "\n" vira { quebra: true }; marcador sem par fica literal; "<script>" é texto comum
export function linkSeguro(url: string | null | undefined): string | null; // só http: e https: (new URL), senão null
```

### C-DADOS: `src/lib/radarDados.ts`

```ts
export function useDiaRadar(data: string): UseQueryResult<{ dia: Dia | null; achados: Achado[]; eventos: Evento[] }>;
// queryKey ["radar","dia",data]; lê radar_dias (eq data, maybeSingle), radar_achados (eq data) e radar_eventos (eq data, order ocorrido_em);
// achados ordenados com ordenarAchados; refetchInterval 5 min só quando data === hojeSP(); refetchOnWindowFocus true
export function useAchadosRadar(f: Filtros, habilitado = true): UseQueryResult<Achado[]>;
// queryKey ["radar","achados",filtrosParaSearch({...f, view:"dia"})]; filtro no servidor: f.dia -> eq data; senão de/ate -> gte/lte; in classe/tipo/status/confianca;
// overlaps temas; alerta -> eq true; q -> textSearch("busca", q, { type: "websearch", config: "portuguese" }); order data desc; limit 500 (comentário ponytail: paginar se passar disso)
export function useDiaAnteriorComConteudo(data: string): UseQueryResult<string | null>; // max data em radar_dias com data < data
export function useAtualizarAchado(): UseMutationResult<void, Error, { id: string; status?: StatusAchado; nota_pessoal?: string | null }>;
// update em radar_achados só das chaves enviadas; otimista em todas as queries ["radar", ...] (listas de Achado e o objeto do dia);
// toast.success("Status atualizado") quando status muda; erro: desfaz e toast.error; onSettled invalida ["radar"]
```
Tabelas novas não estão nos tipos gerados: `supabase.from("radar_achados" as any) as any`.

### C-UI: componentes em `src/components/radar/`

```ts
type MudarFiltros = (f: Filtros, opcoes?: { substituir?: boolean }) => void;
type AcoesAchado = { onStatus: (id: string, s: StatusAchado) => void; onNota: (id: string, texto: string) => void };

export function TextoWhatsapp(p: { texto: string; className?: string }): JSX.Element; // renderiza pedacosWhatsapp em <strong>/<em>/<s>/<br/>, whitespace preservado
export function CardAchado(p: { achado: Achado; destaque?: boolean } & AcoesAchado): JSX.Element;
export function BarraFiltros(p: { filtros: Filtros; onChange: MudarFiltros }): JSX.Element;
export function VisaoDia(p: { filtros: Filtros; onChange: MudarFiltros } & AcoesAchado): JSX.Element;
export function VisaoCards(p: { achados: Achado[] } & AcoesAchado): JSX.Element;
export function VisaoTabela(p: { achados: Achado[]; onAbrirDia: (data: string) => void }): JSX.Element;
export function VisaoCalendario(p: { filtros: Filtros; onChange: MudarFiltros }): JSX.Element;
export function VisaoKanban(p: { achados: Achado[]; onStatus: AcoesAchado["onStatus"] }): JSX.Element;
```
Um componente por arquivo, com o mesmo nome do export (`CardAchado.tsx` etc.).

## Itens

- [r] V1 | files: supabase/functions/radar/validar.ts,src/lib/radarValidar.test.ts | check: node --test src/lib/radarValidar.test.ts | exec: sonnet | Validação do envelope da ingestão (seções 5.3 e 5.5 da especificação), módulo puro sem Deno nem imports externos. Export `validarEnvelope(corpo: unknown): { ok: boolean; campos: { caminho: string; problema: string }[]; avisos: string[] }` e `TEMAS_RADAR` (os 8 slugs). Regras: schema_versao 1; tipo em boletim/alerta/correcao/resposta/encerramento; edicao_id ^DIA-\d{8}$ com data de calendário válida; revisao opcional ^R\d+$; ocorrido_em ISO com offset (Z ou ±hh:mm); achados array de 0 a 20 (boletim), exatamente 1 com alerta true (alerta), 0 ou 1 (correcao), ausente ou vazio nos demais; por achado: id ^RAD-\d{8}-\d{3}$, versao inteiro ≥1, titulo 1..300, classe/tipo/confianca nos enums, alerta boolean, temas 1..3 da lista sem repetição, estagio texto não vazio, publicacao null ou AAAA-MM-DD, primeira_descoberta ISO com offset, corpo objeto, links array de { tipo, url } com url http(s) até 2.000 caracteres, post_x_url e link_citado_x_url null ou http(s), texto_whatsapp 1..12.000, enviado_em null ou ISO com offset; correcao exige objeto correcao { achado_id RAD válido, dado_correto texto, texto_whatsapp texto, fontes array de URLs http(s) }; resposta exige resposta { pergunta texto, referencia null ou RAD, texto_whatsapp texto, fontes array de URLs }; encerramento exige dia.encerramento_texto texto; dia.fora opcional array de { id RAD, motivo texto }. Campo desconhecido no envelope ou no achado entra em avisos ("campo desconhecido: achados[0].xyz"), não em campos. caminho no estilo "achados[2].temas". Testes primeiro: envelope válido do exemplo da especificação passa; tema fora da lista, 4 temas, tema repetido, ID ruim, URL javascript:, data sem offset, 21 achados, alerta sem alerta true, correcao sem objeto, campo desconhecido vira aviso.
- [r] L1 | files: src/lib/radar.ts,src/lib/radar.test.ts | check: node --test src/lib/radar.test.ts | exec: haiku | Implementar exatamente o contrato C-LIB deste plano (nomes, assinaturas e comportamento), com testes primeiro em radar.test.ts (estilo dos testes de src/lib: node:test, assert/strict, import "./radar.ts"). Testar: lerFiltros com valores inválidos, duplicados e array; ida e volta lerFiltros(filtrosParaSearch(f)); contarFiltros; bateFiltro por classe, tema em comum, q sem acento; ordenarAchados; hojeSP com new Date("2026-11-18T01:30:00Z") devolve "2026-11-17"; boletimAindaNaoChegou às 08:00 e 08:20 de SP; rotuloDia("2026-11-17") = "Terça, 17/11/2026"; somarDias atravessando mês; pedacosWhatsapp com negrito, itálico, riscado, quebra, marcador sem par e "<script>"; linkSeguro com javascript: e https:.
- [r] U1 | files: src/components/ui/accordion.tsx | check: npx tsc --noEmit | exec: haiku | Criar o componente Accordion padrão do shadcn/ui (Accordion, AccordionItem, AccordionTrigger, AccordionContent) com @radix-ui/react-accordion (já instalado) e ChevronDown do lucide-react, no mesmo estilo dos outros arquivos de src/components/ui (import de cn em @/lib/utils). Se o tailwind do projeto não tiver as animações accordion-down/up, usar só transição simples sem quebrar. Só erros no seu arquivo contam para o check.
- [ ] M1 | files: supabase/migrations/20261118120000_radar_ia.sql | check: node tools/radar/conferir-migration.mjs | exec: opus | Sessão principal. Migration da seção 3.1 da spec (tabelas, enums, triggers, permissões so_andre estreitas, RPC radar_ingerir com idempotência, dry run e log na mesma transação).
- [ ] F1 | files: supabase/functions/radar/index.ts,supabase/config.toml,supabase/functions/_comum/acesso.ts | after: V1 | check: npx tsc --noEmit | exec: opus | Sessão principal. Edge function radar (seção 3.2 da spec) e export de iguais.
- [r] T1 | files: tools/radar/testar-api.mjs,tools/radar/payload-exemplo.json | check: node --check tools/radar/testar-api.mjs | exec: sonnet | Script de testes de integração da função radar (seção 6 da spec, parte "Integração"), em Node 24 sem dependências novas. payload-exemplo.json = o envelope completo da seção 5.3 da especificação (boletim, RAD-20261117-004). O script lê RADAR_INGEST_KEY de %USERPROFILE%/.gestao/radar.env (linha RADAR_INGEST_KEY=...; nunca imprime a chave), base https://uajusldnvzgakffofkhl.supabase.co/functions/v1/radar, e usa cópias do exemplo trocando datas e IDs para dias do ano 2000 (DIA-20000101 e RAD-20000101-00N, DIA-20000102 para o teste de 22h30). Cada teste imprime "OK <nome>" ou "FALHOU <nome>: <detalhe>" e o processo sai com código 1 se algum falhar. Testes: saúde sem chave 401 e com chave 200 chave "atual"; dry_run=1 devolve criados sem gravar (confirmar com segundo dry_run que ainda devolve criados); envio real do boletim com 2 achados cria e devolve criados; o mesmo envio repetido devolve replay true com o mesmo corpo; mesma Idempotency-Key com payload diferente 409 IDEMPOTENCIA_CONFLITO; alerta (RAD-20000101-003) no mesmo dia devolve data 2000-01-01; correção versao 2 de RAD-20000101-001 devolve atualizados e reenviar versao 1 com outro texto devolve 409 VERSAO_ANTIGA; 422 VALIDACAO com campos para tema fora da lista, 4 temas, ID ruim e URL javascript:; envio com ocorrido_em 2000-01-02T22:30:00-03:00 e edicao DIA-20000102 devolve data 2000-01-02; 61 requisições GET /saude seguidas e pelo menos uma 429 com header Retry-After (rodar por último, opção --limite). Idempotency-Key de teste sempre com prefixo "TESTE:" e um sufixo aleatório por execução (Date.now()) para o script poder rodar de novo depois da limpeza. Exportar nada; README curto no topo do arquivo em comentário. Os testes de banco (status preservado, anon, outro e-mail) ficam fora deste script.
- [r] D1 | files: src/lib/radarDados.ts | after: L1 | check: npx tsc --noEmit | exec: sonnet | Implementar exatamente o contrato C-DADOS deste plano, usando os tipos e funções de src/lib/radar.ts. Só erros no seu arquivo contam para o check.
- [r] C1 | files: src/components/radar/TextoWhatsapp.tsx,src/components/radar/CardAchado.tsx | after: L1,U1 | check: npx tsc --noEmit | exec: sonnet | TextoWhatsapp e CardAchado do contrato C-UI, conforme seção 7.4 da especificação. Card: borda esquerda e selo da classe (CLASSES), sempre emoji + texto; linha 1 selo, ID em fonte mono que copia ao clicar (toast "ID copiado"), título; linha 2 badges de tema (TEMAS.cor), tipo "A · Aplicação", confiança, 🚨 se alerta, "Corrigido" se corrigido; visíveis sem expandir: 🧸 Explicando fácil (corpo.explicando_facil: o_que_e pode ser string ou array, como_te_afeta, exemplo) e 👉 Próximo passo (corpo.proximos_passos lista numerada); Accordion fechado com: O que entrega, Por que importa, Evidência (fonte, limitações, confiança), Estágio e prontidão, Custo e esforço, Aplicações (corpo.aplicacoes[] com area, rotulo, cenario, ferramentas, voce_precisa_ter, como_usar, entrega_esperada, como_conferir) ou Mudança (corpo.mudanca com o_que_muda, quem_pode_ser_afetado, quando, o_que_muda_no_trabalho, o_que_fazer_agora, resultado_esperado) e Lançamento (corpo.lancamento), Links; seção só aparece se tiver conteúdo; corpo pode vir incompleto, nunca quebrar. Links como botões "Abrir fonte", "Post no X", "Link citado no post" e demais links com rótulo pelo tipo, só via linkSeguro, target _blank rel "noopener noreferrer nofollow". Ações: Select de status (STATUS) chamando onStatus; "Nota pessoal" (Textarea) com estado local e autosave 800 ms chamando onNota; "Copiar como WhatsApp" copia texto_whatsapp. destaque = anel de destaque (alerta novo). Alvos de toque de 44 px, aria-label nos botões de ícone. Todo texto do bot renderizado como texto (títulos com <script> aparecem literais).
- [ ] B1 | files: src/components/radar/BarraFiltros.tsx | after: L1 | check: npx tsc --noEmit | exec: haiku | BarraFiltros do contrato C-UI (seção 7.2 da especificação). Desktop (lg): botões alternáveis de classe com emoji+texto, Popover com checkboxes de temas, tipo, status e confiança, botão 🚨 Só alertas, dois <input type="date"> para período (de/ate; preencher apaga dia), busca com Input e debounce de 300 ms (chama onChange com { substituir: true }). Celular: botão "Filtros (n)" (n = contarFiltros) que abre o Sheet de @/components/ui/sheet com os mesmos controles; a busca fica sempre visível. Chips dos filtros ativos (cada um com × que remove só aquele valor) e "Limpar tudo" (FILTROS_VAZIOS mantendo view e dia). Cada mudança chama onChange com novo objeto Filtros. Alvos de 44 px no celular.
- [r] VD | files: src/components/radar/VisaoDia.tsx | after: D1,C1 | check: npx tsc --noEmit | exec: sonnet | VisaoDia do contrato C-UI (seção 7.3 item 1 e 7.5 da especificação). data = filtros.dia ?? hojeSP(). useDiaRadar(data). Cabeçalho "Terça, 17/11/2026 · DIA-20261117 · Revisão R1" (rotuloDia, edicaoDoDia, revisão só se houver), setas ← → (somarDias, onChange com dia) e atalhos j (anterior) e k (próximo) fora de campos de texto. Resumo: contagem por classe (resumo.por_classe), por tema e "x/20 do teto" (total_confirmados); se total < 4, aviso suave "Cobertura parcial" com cobertura_parcial. Abertura (TextoWhatsapp) e "Ficaram de fora" (id + motivo) recolhíveis. Cards (CardAchado) dos achados que batem com bateFiltro; se algum ficou oculto, linha "n achados ocultos pelo filtro · mostrar" que mostra todos localmente. Linha do tempo dos eventos com soHoraSP e rótulo por tipo, e encerramento. Botão "Ver como no WhatsApp" alterna para o texto exato (abertura + texto_whatsapp de cada achado + encerramento, separados por linha em branco) com botão Copiar. Estados: skeleton; sem dia: "O boletim de hoje chega por volta das 08h" se boletimAindaNaoChegou, senão "Sem edição neste dia", e link para o dia anterior com conteúdo (useDiaAnteriorComConteudo); filtro sem resultado: "Nenhum achado com esses filtros" + "Limpar filtros"; erro: mensagem + "Tentar de novo" (refetch). Alerta que chegou depois da primeira carga ganha destaque no card e aviso "1 alerta novo".
- [r] VC | files: src/components/radar/VisaoCards.tsx,src/components/radar/VisaoTabela.tsx | after: C1 | check: npx tsc --noEmit | exec: haiku | VisaoCards e VisaoTabela do contrato C-UI (seção 7.3 itens 2 e 3 da especificação). Cards: agrupar por data (desc) com separador rotuloDia, grade 1/2/3 colunas (sm:grid-cols-2 xl:grid-cols-3), CardAchado. Tabela (desktop, md+): colunas Data, ID, Classe (emoji+texto), Título, Temas, Tipo, Confiança, Estágio, Status, Links (contagem); clicar no cabeçalho ordena asc/desc; cabeçalho sticky; clicar na linha chama onAbrirDia(data). Celular: lista compacta (classe, ID, título, data). Lista vazia: "Nenhum achado com esses filtros".
- [r] VCal | files: src/components/radar/VisaoCalendario.tsx | after: D1 | check: npx tsc --noEmit | exec: haiku | VisaoCalendario do contrato C-UI (seção 7.3 item 4). Mês corrente a partir de filtros.dia ou hojeSP(), setas de mês; busca com useAchadosRadar({ ...filtros, dia: undefined, de: primeiro dia do mês, ate: último }); grade seg a dom em pt-BR; cada dia mostra o número de achados e um ponto por classe presente (CLASSES.ponto, com title/aria-label textual); clicar no dia chama onChange({ ...filtros, dia, de: undefined, ate: undefined, view: "dia" }). Abaixo, linha do tempo vertical das últimas 2 semanas até hoje (dias com achados: data, contagem por classe). Hoje destacado. Funciona em 375 px.
- [r] VK | files: src/components/radar/VisaoKanban.tsx | after: C1 | check: npx tsc --noEmit | exec: sonnet | VisaoKanban do contrato C-UI (seção 7.3 item 5). Colunas Novo, Lido, Testando, Aplicado, Descartado (STATUS) com contagem. Arrastar entre colunas com @dnd-kit/core (já instalado): use src/lib/useKanbanDnd.ts só se couber sem remendo (ele exige campo ordem); senão DndContext + useDraggable/useDroppable direto; ao soltar em outra coluna chama onStatus. Cada cartão compacto: selo da classe, ID, título, temas. No celular (e como alternativa de teclado) cada cartão tem menu "Mover para…" (DropdownMenu) com os outros status. Rolagem horizontal intencional no container do Kanban. Explique no relatório qual caminho de arrasto escolheu e por quê.
- [ ] RT | files: src/routes/_authenticated/radar.tsx,src/lib/nav.tsx,src/routeTree.gen.ts | after: VD,VC,VCal,VK,B1 | check: npx tsc --noEmit | exec: opus | Sessão principal. Rota /radar (validateSearch com lerFiltros/filtrosParaSearch, Tabs de visões, BarraFiltros, useAtualizarAchado), item no menu depois de Habilidades, routeTree regenerado.
