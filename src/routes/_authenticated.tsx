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
  User as UserIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

  useEffect(() => {
    if (session?.user?.email) {
      setUserName(session.user.email.split("@")[0]);
    }
  }, [session]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const navItems = [
    { label: "Demandas", icon: LayoutDashboard, to: "/" },
    { label: "Saldo", icon: Wallet, to: "/saldo" },
    { label: "NPS de Clientes", icon: MessageSquare, to: "/nps" },
    { label: "Clientes Ativos", icon: "/clientes" },
  ];

  // Fixed link mapping for icons and paths as requested
  const links = [
    { label: "Demandas", icon: <LayoutDashboard size={18} />, to: "/" },
    { label: "Saldo", icon: <Wallet size={18} />, to: "/saldo" },
    { label: "NPS de Clientes", icon: <MessageSquare size={18} />, to: "/nps" },
    { label: "Clientes Ativos", icon: <Users size={18} />, to: "/clientes" },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 border-r bg-card flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight">Gestor Pro</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground data-[status=active]:bg-accent data-[status=active]:text-accent-foreground"
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
      <main className="pl-64 flex-1">
        <header className="h-16 border-b flex items-center justify-between px-8 sticky top-0 bg-background/80 backdrop-blur-sm z-10">
          <h2 className="text-sm font-medium text-muted-foreground">
            {/* Breadcrumb would go here, for now just show current tab name logic can be added */}
          </h2>
          <div className="flex items-center gap-4">
             {/* Header actions can go here */}
          </div>
        </header>
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
