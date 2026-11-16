// Menu lateral: grupos e links (a ordem/visibilidade configurável vem do menuConfig)
import {
  AudioLines,
  Inbox,
  Workflow,
  StickyNote,
  LayoutDashboard,
  Lightbulb,
  Users,
  Wallet,
  MessageSquare,
  DollarSign,
  Target,
  BookOpen,
  Book,
  KeyRound,
  Settings,
  Gauge,
  Bookmark,
  Images,
  FolderOpen,
  FileText,
  Rocket,
  Map as MapIcon,
  BarChart3,
  CalendarDays,
  Link2,
  NotebookPen,
  MapPin,
  Instagram,
  Sparkles,
  Tags,
  Percent,
} from "lucide-react";

export interface NavLink {
  label: string;
  icon: React.ReactNode;
  to: string;
  /** Sinônimos para a busca do menu (sem acento e com erro de digitação também funciona) */
  palavras?: string[];
}

// Navegação agrupada por contexto: operação do dia, comercial, pessoal, ferramentas e sistema
export const NAV_GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: "Operação",
    links: [
      { label: "Demandas", icon: <LayoutDashboard size={17} />, to: "/", palavras: ["tarefas", "pendências", "afazeres", "kanban"] },
      { label: "Agenda", icon: <CalendarDays size={17} />, to: "/agenda", palavras: ["calendário", "reuniões", "reunião", "eventos", "compromissos"] },
      { label: "Onboarding", icon: <Rocket size={17} />, to: "/onboarding", palavras: ["implantação", "novos clientes", "início"] },
      { label: "Roadmap", icon: <MapIcon size={17} />, to: "/roadmap", palavras: ["planejamento", "etapas", "trilha"] },
      { label: "Ideias", icon: <Lightbulb size={17} />, to: "/ideias", palavras: ["brainstorm", "sugestões"] },
      { label: "Planilha/CRM", icon: <KeyRound size={17} />, to: "/acessos", palavras: ["acessos", "senhas", "logins", "credenciais"] },
      { label: "Saldo", icon: <Wallet size={17} />, to: "/saldo", palavras: ["verba", "recarga", "anúncios", "ads", "créditos"] },
      { label: "NPS de Clientes", icon: <MessageSquare size={17} />, to: "/nps", palavras: ["satisfação", "pesquisa", "avaliação"] },
      { label: "Dados internos", icon: <Inbox size={17} />, to: "/dados-internos", palavras: ["briefing", "contrato", "catálogo", "formulários", "respostas", "drive", "e-commerce"] },
      { label: "Instagram", icon: <Instagram size={17} />, to: "/instagram", palavras: ["instagram", "posts", "reels", "carrossel", "agendar", "business suite", "meta", "redes sociais"] },
      { label: "Conteúdo", icon: <Sparkles size={17} />, to: "/conteudo", palavras: ["conteúdo", "posts", "carrossel", "design", "aprovação", "semana", "social media", "ia"] },
      { label: "Google Meu Negócio", icon: <MapPin size={17} />, to: "/gmn", palavras: ["gmn", "google", "perfil da empresa", "posts", "seo local", "google business"] },
    ],
  },
  {
    title: "Comercial",
    links: [
      { label: "Clientes Ativos", icon: <Users size={17} />, to: "/clientes", palavras: ["carteira", "contas", "cancelados", "saíram", "perdidos", "encerrados", "churn"] },
      { label: "CRM", icon: <Target size={17} />, to: "/crm", palavras: ["prospecção", "leads", "funil", "vendas", "pipeline", "comercial"] },
    ],
  },
  {
    title: "Pessoal",
    links: [
      { label: "Financeiro", icon: <DollarSign size={17} />, to: "/financeiro", palavras: ["faturamento", "receita", "dinheiro", "parcelas", "recebimentos"] },
      { label: "Cursos", icon: <BookOpen size={17} />, to: "/cursos", palavras: ["aulas", "estudos", "treinamentos"] },
      { label: "Livros", icon: <Book size={17} />, to: "/livros", palavras: ["leitura", "biblioteca"] },
      { label: "Habilidades", icon: <Gauge size={17} />, to: "/habilidades", palavras: ["competências", "skills", "desenvolvimento"] },
      { label: "Ver depois", icon: <Bookmark size={17} />, to: "/ver-depois", palavras: ["salvos", "vídeos", "assistir depois"] },
    ],
  },
  {
    title: "Ferramentas",
    links: [
      { label: "Transcritor", icon: <AudioLines size={17} />, to: "/transcritor", palavras: ["transcrição", "áudio", "vídeo", "legenda"] },
      { label: "Swipe file", icon: <Images size={17} />, to: "/swipe", palavras: ["referências", "criativos", "anúncios salvos", "inspiração"] },
      { label: "Gerador de UTM", icon: <Tags size={17} />, to: "/utm", palavras: ["utm", "utms", "rastreamento", "tracking", "link rastreável", "parâmetros", "campanha", "origem", "ga4"] },
      { label: "Calculadora de taxas", icon: <Percent size={17} />, to: "/taxas", palavras: ["taxa", "taxas", "pix", "meta", "imposto", "porcentagem", "percentual", "acrescimo", "desconto", "gateway", "recarga", "saldo"] },
      { label: "Fireflies", icon: <NotebookPen size={17} />, to: "/fireflies", palavras: ["reuniões gravadas", "reunião gravada", "gravações", "atas", "resumos"] },
      { label: "Arquivos", icon: <FileText size={17} />, to: "/arquivos", palavras: ["pdf", "documentos", "drive", "pdfs"] },
      { label: "Links", icon: <Link2 size={17} />, to: "/links", palavras: ["favoritos", "urls", "sites"] },
      { label: "Notas", icon: <StickyNote size={17} />, to: "/notas", palavras: ["anotações", "bloco de notas"] },
      { label: "Central de arquivos", icon: <FolderOpen size={17} />, to: "/central", palavras: ["fotos", "logos", "logo", "imagens", "marca", "clientes", "banco de imagens"] },
      { label: "Fluxogramas", icon: <Workflow size={17} />, to: "/fluxogramas", palavras: ["mapa mental", "miro", "quadro", "board", "funil", "diagrama", "canvas", "mindmap"] },
    ],
  },
  {
    title: "Sistema",
    links: [
      { label: "Dashboard", icon: <BarChart3 size={17} />, to: "/dashboard", palavras: ["métricas", "relatórios", "indicadores", "resultados"] },
      { label: "Admin", icon: <Settings size={17} />, to: "/admin", palavras: ["configurações", "ajustes", "sistema"] },
    ],
  },
];
