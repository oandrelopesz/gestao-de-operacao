// Aparência "Painel e vidro", computador: trilho flutuante com um ícone por grupo; clicar abre as abas do grupo ao lado.
import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Brain, LogOut, Megaphone, Search, Settings, Sparkles, Sun, Users, Wallet, type LucideIcon } from "lucide-react";
import type { NavLink } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONE_GRUPO: Record<string, LucideIcon> = {
  Hoje: Sun,
  Clientes: Users,
  "Marketing e canais": Megaphone,
  "Comercial e dinheiro": Wallet,
  "Meu cérebro": Brain,
  Sistema: Settings,
};

export function estaNaAba(pathname: string, to: string): boolean {
  // A ficha do cliente (/cliente/$id) pertence à aba Clientes.
  if (pathname.startsWith("/cliente/")) pathname = "/clientes";
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

interface Props {
  grupos: { title: string; links: NavLink[] }[];
  contadores?: Record<string, number>;
  onAbrirPaleta: () => void;
  onSair: () => void;
}

function Selo({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span aria-label={`${n} novos`} className="rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-4 tabular-nums text-primary-foreground">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function NavDoca({ grupos, contadores, onAbrirPaleta, onSair }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [aberto, setAberto] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const grupoAtual = grupos.find((g) => g.links.some((l) => estaNaAba(pathname, l.to)))?.title;
  const novos = (g: { links: NavLink[] }) => g.links.reduce((s, l) => s + (contadores?.[l.to] ?? 0), 0);

  // Fecha ao navegar, ao apertar Esc e ao clicar fora
  useEffect(() => setAberto(null), [pathname]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(null);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const grupoAberto = grupos.find((g) => g.title === aberto);
  const botao = "grid size-11 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground";

  return (
    <div ref={raiz} className="hidden lg:block">
      <nav aria-label="Menu" className="camada-vidro fixed left-4 top-1/2 z-40 grid -translate-y-1/2 gap-1 rounded-full p-2">
        <Link to="/" title="Gestor Pro" className="mb-1.5 grid size-11 place-items-center rounded-full bg-foreground text-background">
          <Sparkles size={17} />
        </Link>
        <button type="button" title="Buscar aba (Ctrl K)" aria-label="Buscar aba" onClick={onAbrirPaleta} className={botao}>
          <Search size={18} strokeWidth={1.6} />
        </button>
        <div className="mx-2 my-1 h-px bg-foreground/15" />
        {grupos.map((g) => {
          const Icone = ICONE_GRUPO[g.title] ?? Sparkles;
          const ativo = g.title === aberto || (!aberto && g.title === grupoAtual);
          const n = novos(g);
          return (
            <button
              key={g.title}
              type="button"
              title={g.title}
              aria-label={g.title}
              aria-expanded={g.title === aberto}
              onClick={() => setAberto((a) => (a === g.title ? null : g.title))}
              className={cn("relative grid size-11 place-items-center rounded-full transition-colors", ativo ? "bg-foreground text-background" : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground")}
            >
              <Icone size={18} strokeWidth={1.6} />
              {n > 0 && (
                <span className="absolute -right-0.5 -top-0.5">
                  <Selo n={n} />
                </span>
              )}
            </button>
          );
        })}
        <div className="mx-2 my-1 h-px bg-foreground/15" />
        <button type="button" title="Sair" aria-label="Sair" onClick={onSair} className={botao}>
          <LogOut size={17} strokeWidth={1.6} />
        </button>
      </nav>

      {grupoAberto && (
        <div className="camada-vidro camada-voo fixed left-[5.5rem] top-1/2 z-40 max-h-[80vh] w-60 -translate-y-1/2 overflow-y-auto rounded-[var(--radius)] p-2.5">
          <h2 className="mx-2.5 mb-2 mt-1.5 text-[13px] font-medium text-muted-foreground">{grupoAberto.title}</h2>
          {grupoAberto.links.map((l) => {
            const ativo = estaNaAba(pathname, l.to);
            return (
              <Link
                key={l.to}
                to={l.to}
                aria-current={ativo ? "page" : undefined}
                className={cn("flex items-center gap-2.5 rounded-[calc(var(--radius)-6px)] px-2.5 py-2 text-sm transition-colors", ativo ? "bg-foreground text-background" : "hover:bg-foreground/10")}
              >
                <span className="opacity-80">{l.icon}</span>
                <span className="min-w-0 flex-1 truncate">{l.label}</span>
                <Selo n={contadores?.[l.to] ?? 0} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
