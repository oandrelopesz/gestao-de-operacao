import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { 
  LayoutDashboard, 
  Users, 
  Wallet, 
  MessageSquare, 
  LogOut,
  ChevronRight,
  ChevronLeft,
  PanelLeft,
  User as UserIcon,
  Bell,
  DollarSign,
  Target,
  BookOpen,
  Book,
  ClipboardList
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    return { session: null };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const context = Route.useRouteContext() as any;
  const session = context?.session;
  const navigate = useNavigate();
  const [userName, setUserName] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [topAlert, setTopAlert] = useState<{ status: string, id: string, cliente_id: string } | null>(null);

  useEffect(() => {
    const fetchTopAlert = async () => {
      try {
        const { data, error } = await supabase
          .from("saldo_ads_view" as any)
          .select("id, status_alerta, cliente_id")
          .filter("status_alerta", "in", '("alerta", "critico", "zerado")');

        if (error) throw error;
        
        if (data && (data as any[]).length > 0) {
          const sorted = [...(data as any[])].sort((a: any, b: any) => {
            const order: any = { zerado: 0, critico: 1, alerta: 2 };
            return (order[a.status_alerta] ?? 99) - (order[b.status_alerta] ?? 99);
          });
          setTopAlert({
            status: sorted[0].status_alerta,
            id: sorted[0].id,
            cliente_id: sorted[0].cliente_id
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
      .channel('top-alerta-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saldo_ads' }, () => fetchTopAlert())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recargas' }, () => fetchTopAlert())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const userEmail = (session as any)?.user?.email;
    if (userEmail) {
      setUserName(userEmail.split("@")[0]);
    } else {
      setUserName("Admin");
    }
  }, [session]);

  const handleLogout = async () => {
    // navigate({ to: "/login" });
  };

  const links = [
    { label: "Demandas", icon: <LayoutDashboard size={18} />, to: "/" },
    { label: "Pendências", icon: <ClipboardList size={18} />, to: "/pendencias" },
    { label: "Saldo", icon: <Wallet size={18} />, to: "/saldo" },
    { label: "NPS de Clientes", icon: <MessageSquare size={18} />, to: "/nps" },
    { label: "Clientes Ativos", icon: <Users size={18} />, to: "/clientes" },
    { label: "Prospecção", icon: <Target size={18} />, to: "/prospeccao" },
    { label: "Financeiro", icon: <DollarSign size={18} />, to: "/financeiro" },
    { label: "Cursos", icon: <BookOpen size={18} />, to: "/cursos" },
    { label: "Livros", icon: <Book size={18} />, to: "/livros" },
  ];

  const getAlertColor = (status: string) => {
    if (status === 'zerado') return 'bg-red-700';
    if (status === 'critico') return 'bg-red-500';
    return 'bg-amber-500';
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Top indicator bar */}
      {topAlert && (
        <div 
          className={cn(
            "fixed top-0 left-0 right-0 h-[3px] z-[100] cursor-pointer animate-pulse",
            getAlertColor(topAlert.status)
          )}
          onClick={() => navigate({ 
            to: "/saldo", 
            search: (prev: any) => ({ ...prev, cliente_id: topAlert.cliente_id, highlight: topAlert.id }) 
          })}
          title="Clique para ver alertas de saldo"
        />
      )}

      {/* Sidebar Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 border-r bg-card flex flex-col transition-transform duration-300
        lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Gestor Pro</h1>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsSidebarOpen(false)}>
            <ChevronRight className="rotate-180" size={18} />
          </Button>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground data-[status=active]:bg-accent data-[status=active]:text-accent-foreground"
              onClick={() => setIsSidebarOpen(false)}
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 mt-auto">
          <Separator className="mb-4" />
          <div className="flex items-center gap-3 px-2 mb-4">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {userName.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate capitalize">{userName}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="h-16 border-b flex items-center justify-between px-4 lg:px-8 sticky top-0 bg-background/80 backdrop-blur-sm z-30">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsSidebarOpen(true)}>
              <ChevronRight size={18} />
            </Button>
            <h2 className="text-sm font-medium text-muted-foreground">
              Dashboard
            </h2>
          </div>
          <div className="flex items-center gap-4">
             <NotificationBell />
             <div className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">Beta</div>
          </div>
        </header>
        <div className="p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
