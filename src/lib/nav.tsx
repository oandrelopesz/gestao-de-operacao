// Menu lateral: grupos e links (a ordem/visibilidade configurável vem do menuConfig)
import {
  AudioLines,
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
  FileText,
  Rocket,
  Map as MapIcon,
  BarChart3,
  CalendarDays,
  Link2,
  NotebookPen,
} from "lucide-react";

export interface NavLink {
  label: string;
  icon: React.ReactNode;
  to: string;
}

// Navegação agrupada por contexto: operação do dia, comercial, pessoal, ferramentas e sistema
export const NAV_GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: "Operação",
    links: [
      { label: "Demandas", icon: <LayoutDashboard size={17} />, to: "/" },
      { label: "Agenda", icon: <CalendarDays size={17} />, to: "/agenda" },
      { label: "Onboarding", icon: <Rocket size={17} />, to: "/onboarding" },
      { label: "Roadmap", icon: <MapIcon size={17} />, to: "/roadmap" },
      { label: "Ideias", icon: <Lightbulb size={17} />, to: "/ideias" },
      { label: "Planilha/CRM", icon: <KeyRound size={17} />, to: "/acessos" },
      { label: "Saldo", icon: <Wallet size={17} />, to: "/saldo" },
      { label: "NPS de Clientes", icon: <MessageSquare size={17} />, to: "/nps" },
    ],
  },
  {
    title: "Comercial",
    links: [
      { label: "Clientes Ativos", icon: <Users size={17} />, to: "/clientes" },
      { label: "CRM", icon: <Target size={17} />, to: "/crm" },
    ],
  },
  {
    title: "Pessoal",
    links: [
      { label: "Financeiro", icon: <DollarSign size={17} />, to: "/financeiro" },
      { label: "Cursos", icon: <BookOpen size={17} />, to: "/cursos" },
      { label: "Livros", icon: <Book size={17} />, to: "/livros" },
      { label: "Habilidades", icon: <Gauge size={17} />, to: "/habilidades" },
      { label: "Ver depois", icon: <Bookmark size={17} />, to: "/ver-depois" },
    ],
  },
  {
    title: "Ferramentas",
    links: [
      { label: "Transcritor", icon: <AudioLines size={17} />, to: "/transcritor" },
      { label: "Fireflies", icon: <NotebookPen size={17} />, to: "/fireflies" },
      { label: "Swipe file", icon: <Images size={17} />, to: "/swipe" },
      { label: "Links", icon: <Link2 size={17} />, to: "/links" },
      { label: "Notas", icon: <StickyNote size={17} />, to: "/notas" },
      { label: "Arquivos", icon: <FileText size={17} />, to: "/arquivos" },
    ],
  },
  {
    title: "Sistema",
    links: [
      { label: "Dashboard", icon: <BarChart3 size={17} />, to: "/dashboard" },
      { label: "Admin", icon: <Settings size={17} />, to: "/admin" },
    ],
  },
];
