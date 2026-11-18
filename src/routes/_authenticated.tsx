import { createFileRoute, Outlet, Link, useNavigate, useRouterState, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { ChevronRight, ChevronLeft, PanelLeft, Sun, Moon, Sparkles, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";
import { AgenciasProvider } from "@/lib/agencias";
import { MobileNav } from "@/components/MobileNav";
import { NavLateral } from "@/components/NavLateral";
import { AtualizarAoVoltar } from "@/components/AtualizarAoVoltar";
import { PlataformasProvider } from "@/lib/plataformas";
import { useTheme } from "@/lib/theme";
import { warmAllCaches } from "@/lib/data";
import { depoisDoLoad, emLotes, esperarOcioso, pausa } from "@/lib/aquecimento";
import { getConfig } from "@/lib/appConfig";
import { aplicarMenu, type MenuConfig } from "@/lib/menuConfig";
import { NAV_GROUPS } from "@/lib/nav";
import { toast } from "sonner";
import { limparIdToken } from "@/lib/googleAuth";
import { marcarTodosVistos, useAvisosFormularios } from "@/lib/formulariosEnvios";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    return { session: null };
  },
  component: LoginObrigatorio,
});

// Login obrigatório (só Google). A sessão do Supabase fica no navegador e se renova sozinha;
// só some ao deslogar ou limpar os dados do site. Sem sessão, vai para /login.
function LoginObrigatorio() {
  const navigate = useNavigate();
  const [sessao, setSessao] = useState<any>(undefined);
  useEffect(() => {
    let vivo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      if (data.session) setSessao(data.session);
      else navigate({ to: "/login", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === "SIGNED_OUT") navigate({ to: "/login", replace: true });
      else if (s) setSessao(s);
    });
    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, [navigate]);
  if (!sessao) return <div className="min-h-screen bg-background" />;
  return <AuthenticatedLayout session={sessao} />;
}

const ALL_LINKS = NAV_GROUPS.flatMap((g) => g.links);

function AuthenticatedLayout({ session }: { session: any }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Tela que está de fato montada (rota já carregada). O endereço muda no clique, antes de a rota nova
  // entrar; usar ele na chave remontava a tela antiga por um instante (refazendo as consultas dela).
  const telaMontada = useRouterState({ select: (s) => s.matches[s.matches.length - 1]?.pathname ?? s.location.pathname });
  const [userName, setUserName] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Sobe quando o celular volta de um tempo em segundo plano: remonta a tela para buscar dados frescos
  const [recarga, setRecarga] = useState(0);
  const recarregarPagina = useCallback(() => setRecarga((n) => n + 1), []);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar-collapsed") === "1";
  });
  const { theme, toggle: toggleTheme } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Config do menu lateral (Admin): quais abas aparecem e a ordem de cada grupo.
  // Guardada num estado local (e não só no useConfig) para recarregar assim que o
  // Admin salvar, via o evento "menu-config" disparado pelo MenuAdminCard.
  const [menuCfg, setMenuCfg] = useState<MenuConfig | null>(null);
  useEffect(() => {
    let vivo = true;
    const carregarMenuCfg = () => {
      getConfig<MenuConfig | null>("menu", null).then((v: any) => {
        if (!vivo) return;
        // Normaliza a forma: um valor malformado salvo em app_config nunca pode derrubar o sidebar.
        setMenuCfg(v ? { ocultas: Array.isArray(v?.ocultas) ? v.ocultas : [], ordem: v?.ordem && typeof v.ordem === "object" ? v.ordem : {} } : null);
      });
    };
    carregarMenuCfg();
    window.addEventListener("menu-config", carregarMenuCfg);
    return () => {
      vivo = false;
      window.removeEventListener("menu-config", carregarMenuCfg);
    };
  }, []);
  const grupos = useMemo(() => aplicarMenu(NAV_GROUPS, menuCfg), [menuCfg]);
  const { naoVistos: avisosNaoVistos } = useAvisosFormularios();
  const contadoresMenu = useMemo(() => ({ "/dados-internos": avisosNaoVistos.length }), [avisosNaoVistos]);
  const fecharMenuCelular = useCallback(() => setIsSidebarOpen(false), []);
  // Ctrl+K com o menu escondido: no computador reabre o menu recolhido; no celular abre a gaveta
  const abrirMenu = useCallback(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) setIsDesktopCollapsed(false);
    else setIsSidebarOpen(true);
  }, []);

  // Aquecimento para a troca de aba ser instantânea: o cache de dados de cada aba e o código de todas as
  // rotas. A tela aberta tem prioridade total — só começa depois que ela carregou (load + 1,5 s + navegador
  // ocioso) e segue em passos pequenos, sempre no ocioso: dados em lotes de 3 consultas, código uma rota por
  // vez, na ordem do menu. Antes disso, passar o mouse/tocar num link já baixa aquela aba (preload "intent").
  useEffect(() => {
    let cancelado = false;
    const parou = () => cancelado;
    const ocioso = () => esperarOcioso();
    (async () => {
      await depoisDoLoad();
      await pausa(1500);
      if (cancelado) return;
      await Promise.all([
        warmAllCaches(queryClient, { lote: 3, antes: ocioso, cancelado: parou }),
        (async () => {
          await emLotes(ALL_LINKS.map((l) => () => router.preloadRoute({ to: l.to as any })), 1, ocioso, parou);
          // Pedaços carregados à parte (grade da Agenda, editor das Notas, histórico do NPS): baixam também,
          // um por vez, para a aba abrir e o clique responder na hora
          await emLotes(
            [
              () => import("@/components/agenda/AgendaGrade"),
              () => import("@/components/notas/EditorNota"),
              () => import("@/components/NPSHistoryDrawer"),
            ],
            1,
            ocioso,
            parou,
          );
        })(),
      ]);
    })();
    return () => { cancelado = true; };
  }, [router, queryClient]);

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
    <PlataformasProvider>
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

        {/* Faixa escura atrás da barra de status do iPhone (app instalado); 0 px no navegador e no desktop */}
        <div aria-hidden className="lg:hidden fixed inset-x-0 top-0 z-[60] h-[env(safe-area-inset-top)] bg-sidebar" />

        {/* Overlay mobile */}
        {isSidebarOpen && (
          <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            "dark fixed inset-y-0 left-0 z-50 w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-300",
            "max-lg:pt-[env(safe-area-inset-top)] max-lg:pb-[env(safe-area-inset-bottom)]",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full",
            isDesktopCollapsed ? "lg:-translate-x-full" : "lg:translate-x-0"
          )}
        >
          <div className="h-16 px-5 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5 group" onClick={() => setIsSidebarOpen(false)}>
              <span className="relative h-9 w-9 rounded-xl btn-glow text-primary-foreground flex items-center justify-center group-hover:scale-105 transition-transform">
                <Sparkles size={16} />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-sidebar animate-glow" title="Online" />
              </span>
              <span className="leading-tight">
                <span className="block font-display text-[15px] font-semibold tracking-tight">Gestor Pro</span>
                <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">command center</span>
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

          <NavLateral grupos={grupos} onNavegar={fecharMenuCelular} onAbrirMenu={abrirMenu} contadores={contadoresMenu} onLimparContador={() => { marcarTodosVistos().catch(() => toast.error("Não consegui limpar as notificações")); }} />

          <div className="p-3 border-t border-sidebar-border">
            <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg">
              <Avatar className="h-8 w-8 ring-2 ring-background">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {userName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-medium truncate capitalize">{userName}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">estrategista digital</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-8 w-8 text-muted-foreground hover:text-foreground"
                title="Sair"
                onClick={async () => {
                  await supabase.auth.signOut();
                  limparIdToken();
                }}
              >
                <LogOut size={16} />
              </Button>
            </div>
          </div>
        </aside>

        {/* Conteúdo */}
        <main className={cn("flex-1 flex flex-col min-w-0 transition-[padding] duration-300", isDesktopCollapsed ? "lg:pl-0" : "lg:pl-64")}>
          <header className="h-14 max-lg:h-[calc(3.5rem+env(safe-area-inset-top))] max-lg:pt-[env(safe-area-inset-top)] border-b border-border/60 flex items-center justify-between px-4 lg:px-8 sticky top-0 glass glow-line z-30">
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
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground hidden sm:inline">Gestor Pro</span>
                <ChevronRight size={14} className="text-muted-foreground/40 hidden sm:inline" />
                <span className="font-display font-semibold flex items-center gap-1.5">
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
            </div>
          </header>
          <div key={`${telaMontada}#${recarga}`} className="p-4 lg:p-8 max-lg:pb-[calc(5.5rem+env(safe-area-inset-bottom))] page-enter">
            <Outlet />
          </div>
          <MobileNav onMais={() => setIsSidebarOpen(true)} maisAberto={isSidebarOpen} novos={avisosNaoVistos.length} />
          <AtualizarAoVoltar onRecarregarPagina={recarregarPagina} />
        </main>
      </div>
    </PlataformasProvider>
    </AgenciasProvider>
  );
}
