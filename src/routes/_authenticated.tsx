import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  Users,
  Wallet,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  PanelLeft,
  DollarSign,
  Target,
  BookOpen,
  Book,
  KeyRound,
  Settings,
  Sun,
  Moon,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";
import { AgenciasProvider } from "@/lib/agencias";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    return { session: null };
  },
  component: AuthenticatedLayout,
});

interface NavLink {
  label: string;
  icon: React.ReactNode;
  to: string;
}

// Navegação agrupada por contexto: operação do dia, comercial, pessoal e sistema
const NAV_GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: "Operação",
    links: [
      { label: "Demandas", icon: <LayoutDashboard size={17} />, to: "/" },
      { label: "Planilha/CRM", icon: <KeyRound size={17} />, to: "/acessos" },
      { label: "Saldo", icon: <Wallet size={17} />, to: "/saldo" },
      { label: "NPS de Clientes", icon: <MessageSquare size={17} />, to: "/nps" },
    ],
  },
  {
    title: "Comercial",
    links: [
      { label: "Clientes Ativos", icon: <Users size={17} />, to: "/clientes" },
      { label: "Prospecção", icon: <Target size={17} />, to: "/prospeccao" },
    ],
  },
  {
    title: "Pessoal",
    links: [
      { label: "Financeiro", icon: <DollarSign size={17} />, to: "/financeiro" },
      { label: "Cursos", icon: <BookOpen size={17} />, to: "/cursos" },
      { label: "Livros", icon: <Book size={17} />, to: "/livros" },
    ],
  },
  {
    title: "Sistema",
    links: [{ label: "Admin", icon: <Settings size={17} />, to: "/admin" }],
  },
];

const ALL_LINKS = NAV_GROUPS.flatMap((g) => g.links);

function AuthenticatedLayout() {
  const context = Route.useRouteContext() as any;
  const session = context?.session;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [userName, setUserName] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar-collapsed") === "1";
  });
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sidebar-collapsed", isDesktopCollapsed ? "1" : "0");
    }
  }, [isDesktopCollapsed]);

  const [topAlert, setTopAlert] = useState<{ status: string; id: string; cliente_id: string } | null>(null);

  useEffect(() => {
    const fetchTopAlert = async () => {
      try {
        const { data, error } = await supabase
          .from("saldo_ads_view" as any)
          .select("*")
          .in("status_alerta", ["alerta", "critico", "zerado"]);

        if (error) throw error;

        // Alertas dispensados pelo usuário não acendem a barra
        const rows = ((data as any[]) || []).filter((d) => !d.alerta_dispensado);
        if (rows.length > 0) {
          const sorted = [...rows].sort((a: any, b: any) => {
            const order: any = { zerado: 0, critico: 1, alerta: 2 };
            return (order[a.status_alerta] ?? 99) - (order[b.status_alerta] ?? 99);
          });
          setTopAlert({
            status: sorted[0].status_alerta,
            id: sorted[0].id,
            cliente_id: sorted[0].cliente_id,
          });
        } else {
          setTopAlert(null);
        }
      } catch (err) {
        console.error("Erro ao buscar top alerta:", err);
      }
    };

    fetchTopAlert();

    const channel = supabase
      .channel("top-alerta-global")
      .on("postgres_changes", { event: "*", schema: "public", table: "saldo_ads" }, () => fetchTopAlert())
      .on("postgres_changes", { event: "*", schema: "public", table: "recargas" }, () => fetchTopAlert())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const userEmail = (session as any)?.user?.email;
    setUserName(userEmail ? userEmail.split("@")[0] : "Admin");
  }, [session]);

  const currentPage =
    ALL_LINKS.find((l) => l.to === pathname) ??
    ALL_LINKS.find((l) => l.to !== "/" && pathname.startsWith(l.to));

  const getAlertColor = (status: string) => {
    if (status === "zerado") return "bg-red-700";
    if (status === "critico") return "bg-red-500";
    return "bg-amber-500";
  };

  return (
    <AgenciasProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        {/* Barra de alerta de saldo */}
        {topAlert && (
          <div
            className={cn(
              "fixed top-0 left-0 right-0 h-[3px] z-[100] cursor-pointer animate-pulse",
              getAlertColor(topAlert.status)
            )}
            onClick={() =>
              navigate({
                to: "/saldo",
                search: (prev: any) => ({ ...prev, cliente_id: topAlert.cliente_id, highlight: topAlert.id }),
              })
            }
            title="Clique para ver alertas de saldo"
          />
        )}

        {/* Overlay mobile */}
        {isSidebarOpen && (
          <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-300",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full",
            isDesktopCollapsed ? "lg:-translate-x-full" : "lg:translate-x-0"
          )}
        >
          <div className="h-16 px-5 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5 group" onClick={() => setIsSidebarOpen(false)}>
              <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-[oklch(0.62_0.2_300)] text-primary-foreground flex items-center justify-center shadow-sm shadow-primary/30 group-hover:scale-105 transition-transform">
                <Sparkles size={15} />
              </span>
              <span className="leading-tight">
                <span className="block text-[15px] font-semibold tracking-tight">Gestor Pro</span>
                <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Operação</span>
              </span>
            </Link>
            <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setIsSidebarOpen(false)}>
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex h-8 w-8 text-muted-foreground"
              onClick={() => setIsDesktopCollapsed(true)}
              title="Recolher menu"
            >
              <ChevronLeft size={16} />
            </Button>
          </div>

          <nav className="flex-1 px-3 pb-4 space-y-5 overflow-y-auto">
            {NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">{group.title}</p>
                <div className="space-y-0.5">
                  {group.links.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      activeOptions={{ exact: link.to === "/" }}
                      className="group/nav flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground data-[status=active]:shadow-[inset_2px_0_0_var(--color-primary)]"
                      onClick={() => setIsSidebarOpen(false)}
                    >
                      <span className="text-muted-foreground group-hover/nav:text-foreground group-data-[status=active]/nav:text-primary transition-colors">
                        {link.icon}
                      </span>
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="p-3 border-t border-sidebar-border">
            <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg">
              <Avatar className="h-8 w-8 ring-2 ring-background">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {userName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-medium truncate capitalize">{userName}</span>
                <span className="text-[11px] text-muted-foreground">Gestor de tráfego</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Conteúdo */}
        <main className={cn("flex-1 flex flex-col min-w-0 transition-[padding] duration-300", isDesktopCollapsed ? "lg:pl-0" : "lg:pl-64")}>
          <header className="h-14 border-b border-border/60 flex items-center justify-between px-4 lg:px-8 sticky top-0 glass z-30">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setIsSidebarOpen(true)}>
                <ChevronRight size={16} />
              </Button>
              {isDesktopCollapsed && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden lg:inline-flex h-8 w-8 text-muted-foreground"
                  onClick={() => setIsDesktopCollapsed(false)}
                  title="Mostrar menu"
                >
                  <PanelLeft size={16} />
                </Button>
              )}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground hidden sm:inline">Gestor Pro</span>
                <ChevronRight size={14} className="text-muted-foreground/50 hidden sm:inline" />
                <span className="font-medium flex items-center gap-1.5">
                  {currentPage?.icon && <span className="text-primary">{currentPage.icon}</span>}
                  {currentPage?.label ?? "Dashboard"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
                onClick={toggleTheme}
                title={theme === "dark" ? "Modo claro" : "Modo escuro"}
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </Button>
              <NotificationBell />
              <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-1 rounded-full">Beta</span>
            </div>
          </header>
          <div key={pathname} className="p-4 lg:p-8 page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </AgenciasProvider>
  );
}
