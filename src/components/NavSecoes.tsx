// Aparência "Editorial", computador: os grupos do menu viram seções no topo; as abas da seção ficam numa linha embaixo.
import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Search } from "lucide-react";
import type { NavLink } from "@/lib/nav";
import { estaNaAba } from "@/components/NavDoca";
import { cn } from "@/lib/utils";

interface Props {
  grupos: { title: string; links: NavLink[] }[];
  contadores?: Record<string, number>;
  onAbrirPaleta: () => void;
  onSair: () => void;
  /** Seletor de aparência e sino, que no Editorial sobem para o topo */
  acoes?: React.ReactNode;
}

function Selo({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span aria-label={`${n} novos`} className="ml-1.5 rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-4 tabular-nums text-primary-foreground">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function NavSecoes({ grupos, contadores, onAbrirPaleta, onSair, acoes }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const doAtual = grupos.find((g) => g.links.some((l) => estaNaAba(pathname, l.to)))?.title;
  // Seção escolhida à mão vale só na rota em que foi escolhida; ao navegar, volta a seguir a aba atual
  const [escolha, setEscolha] = useState<{ titulo: string; rota: string } | null>(null);
  const secao = escolha && escolha.rota === pathname ? escolha.titulo : (doAtual ?? grupos[0]?.title);
  const links = grupos.find((g) => g.title === secao)?.links ?? [];
  const data = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "short", timeZone: "America/Sao_Paulo" }).format(new Date());
  const novos = (g: { links: NavLink[] }) => g.links.reduce((s, l) => s + (contadores?.[l.to] ?? 0), 0);

  return (
    <div className="sticky top-0 z-30 hidden bg-background lg:block">
      <div className="editorial-mast grid grid-cols-[auto_1fr_auto] items-center gap-6 px-8 pb-3.5 pt-4">
        <Link to="/" className="whitespace-nowrap text-[17px] font-extrabold tracking-[-0.03em]">
          Gestor Pro
        </Link>
        <nav aria-label="Seções" className="flex gap-5 overflow-x-auto">
          {grupos.map((g) => (
            <button
              key={g.title}
              type="button"
              onClick={() => setEscolha({ titulo: g.title, rota: pathname })}
              aria-current={g.title === secao ? "true" : undefined}
              className={cn("whitespace-nowrap py-1 text-sm font-semibold transition-colors", g.title === secao ? "text-foreground underline decoration-2 underline-offset-[6px]" : "text-muted-foreground hover:text-foreground")}
            >
              {g.title}
              <Selo n={novos(g)} />
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2.5 whitespace-nowrap text-[13px] text-muted-foreground">
          <span className="capitalize">{data}</span>
          <button type="button" onClick={onAbrirPaleta} className="inline-flex h-8 items-center gap-1.5 border-[1.5px] border-foreground px-2.5 font-bold text-foreground transition-colors hover:bg-foreground hover:text-background">
            <Search size={14} strokeWidth={2} /> Ctrl K
          </button>
          {acoes}
          <button type="button" title="Sair" aria-label="Sair" onClick={onSair} className="grid size-8 place-items-center text-muted-foreground transition-colors hover:bg-foreground hover:text-background">
            <LogOut size={15} />
          </button>
        </div>
      </div>
      <nav aria-label="Abas da seção" className="editorial-abas flex gap-0.5 overflow-x-auto px-8 py-2.5">
        {links.map((l) => {
          const ativo = estaNaAba(pathname, l.to);
          return (
            <Link
              key={l.to}
              to={l.to}
              aria-current={ativo ? "page" : undefined}
              className={cn("inline-flex items-center whitespace-nowrap px-3 py-1.5 text-sm transition-colors", ativo ? "bg-foreground font-semibold text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {l.label}
              <Selo n={contadores?.[l.to] ?? 0} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
