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
   User as UserIcon,
   Bell
 } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Separator } from "@/components/ui/separator";
 import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
 import { NotificationBell } from "@/components/NotificationBell";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
    return { session };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const [userName, setUserName] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (session?.user?.email) {
      setUserName(session.user.email.split("@")[0]);
    }
  }, [session]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const links = [
    { label: "Demandas", icon: <LayoutDashboard size={18} />, to: "/" },
    { label: "Saldo", icon: <Wallet size={18} />, to: "/saldo" },
    { label: "NPS de Clientes", icon: <MessageSquare size={18} />, to: "/nps" },
    { label: "Clientes Ativos", icon: <Users size={18} />, to: "/clientes" },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
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
              <span className="text-xs text-muted-foreground truncate">{session?.user?.email}</span>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-start text-muted-foreground hover:text-destructive gap-3"
            onClick={handleLogout}
          >
            <LogOut size={16} />
            Sair
          </Button>
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

