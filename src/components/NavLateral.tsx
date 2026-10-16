// Menu lateral: busca de abas (sem acento e com erro de digitação, Ctrl+K) e grupos que recolhem até clicar de novo.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown, Search, X } from "lucide-react";
import { buscarAbas } from "@/lib/buscaAbas";
import type { NavLink } from "@/lib/nav";
import { MensagemBusca } from "@/components/MensagemBusca";
import { MENSAGEM_NENHUM } from "@/lib/search";
import { cn } from "@/lib/utils";

const CHAVE_RECOLHIDOS = "menu-grupos-recolhidos";

const CLASSE_LINK =
  "group/nav relative flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg text-muted-foreground transition-all hover:bg-sidebar-accent/70 hover:text-foreground hover:translate-x-px data-[status=active]:bg-gradient-to-r data-[status=active]:from-primary/20 data-[status=active]:to-transparent data-[status=active]:text-foreground data-[status=active]:shadow-[inset_2px_0_0_var(--color-primary),0_0_24px_-8px_var(--color-primary)]";

function lerRecolhidos(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(CHAVE_RECOLHIDOS) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function estaNaAba(pathname: string, to: string): boolean {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

interface NavLateralProps {
  grupos: { title: string; links: NavLink[] }[];
  /** Fecha o menu no celular depois de escolher uma aba */
  onNavegar: () => void;
  /** Ctrl+K com o menu escondido: mostra o menu antes de focar a busca */
  onAbrirMenu?: () => void;
  /** Número ao lado do link (ex.: respostas não vistas em "/dados-internos") */
  contadores?: Record<string, number>;
  /** Clique no número: limpa as notificações daquele link */
  onLimparContador?: (to: string) => void;
}

function Contador({ n, onLimpar }: { n?: number; onLimpar?: () => void }) {
  if (!n) return null;
  return (
    <span
      role={onLimpar ? "button" : undefined}
      title={onLimpar ? "Clique para limpar as notificações" : undefined}
      aria-label={`${n} novos${onLimpar ? ", clique para limpar" : ""}`}
      onClick={onLimpar ? (e) => { e.preventDefault(); e.stopPropagation(); onLimpar(); } : undefined}
      className={cn("ml-auto shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-primary-foreground", onLimpar && "cursor-pointer hover:bg-destructive")}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function NavLateral({ grupos, onNavegar, onAbrirMenu, contadores, onLimparContador }: NavLateralProps) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [busca, setBusca] = useState("");
  const [destaque, setDestaque] = useState(0);
  const [recolhidos, setRecolhidos] = useState<string[]>(() => (typeof window === "undefined" ? [] : lerRecolhidos()));
  const campo = useRef<HTMLInputElement>(null);

  const itens = useMemo(() => grupos.flatMap((g) => g.links.map((l) => ({ ...l, grupo: g.title }))), [grupos]);
  const resultado = useMemo(() => buscarAbas(itens, busca), [itens, busca]);
  const resultados = resultado.itens;
  const buscando = busca.trim().length > 0;

  useEffect(() => setDestaque(0), [busca]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAVE_RECOLHIDOS, JSON.stringify(recolhidos));
    } catch {
      // sem armazenamento: só não lembra entre visitas
    }
  }, [recolhidos]);

  // Ctrl+K (ou ⌘K) em qualquer lugar do sistema foca a busca do menu
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onAbrirMenu?.();
        setTimeout(() => campo.current?.focus(), 60);
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onAbrirMenu]);

  const alternarGrupo = (titulo: string) =>
    setRecolhidos((atual) => (atual.includes(titulo) ? atual.filter((t) => t !== titulo) : [...atual, titulo]));

  const irPara = (to: string) => {
    setBusca("");
    campo.current?.blur();
    navigate({ to });
    onNavegar();
  };

  const aoTeclarNaBusca = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestaque((i) => Math.min(i + 1, Math.max(resultados.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestaque((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const alvo = resultados[destaque];
      if (alvo) {
        e.preventDefault();
        irPara(alvo.to);
      }
    } else if (e.key === "Escape") {
      setBusca("");
      campo.current?.blur();
    }
  };

  return (
    <>
      <div className="px-3 pb-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={campo}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={aoTeclarNaBusca}
            placeholder="Buscar aba…"
            aria-label="Buscar aba do menu"
            role="combobox"
            aria-expanded={buscando}
            aria-controls="menu-busca-resultados"
            autoComplete="off"
            spellCheck={false}
            className="h-8 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/40 pl-8 pr-14 text-[13px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-colors focus:border-primary/60 focus:bg-sidebar-accent/70"
          />
          {buscando ? (
            <button
              type="button"
              onClick={() => {
                setBusca("");
                campo.current?.focus();
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X size={13} />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-sidebar-border px-1 font-mono text-[9px] text-muted-foreground max-lg:hidden">
              Ctrl K
            </kbd>
          )}
        </div>
      </div>

      <nav className="flex-1 px-3 pb-4 space-y-5 overflow-y-auto">
        {buscando ? (
          <div>
            {resultado.modo === "parecidos" && <MensagemBusca resultado={resultado} className="px-3 pb-1.5 text-[12px]" />}
            <div id="menu-busca-resultados" role="listbox" aria-label="Abas encontradas" className="space-y-0.5">
              {resultados.length === 0 ? (
                <p className="px-3 py-2 text-[12px] text-muted-foreground">{MENSAGEM_NENHUM}</p>
              ) : (
                resultados.map((link, i) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    role="option"
                    aria-selected={i === destaque}
                    activeOptions={{ exact: link.to === "/" }}
                    className={cn(CLASSE_LINK, i === destaque && "bg-sidebar-accent/70 text-foreground")}
                    onMouseEnter={() => setDestaque(i)}
                    onClick={() => {
                      setBusca("");
                      onNavegar();
                    }}
                  >
                    <span className="text-muted-foreground group-hover/nav:text-foreground group-data-[status=active]/nav:text-primary transition-colors">
                      {link.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{link.label}</span>
                    <Contador n={contadores?.[link.to]} onLimpar={onLimparContador && contadores?.[link.to] ? () => onLimparContador(link.to) : undefined} />
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">{link.grupo}</span>
                  </Link>
                ))
              )}
            </div>
          </div>
        ) : (
          grupos.map((group) => {
            const recolhido = recolhidos.includes(group.title);
            const temAtual = recolhido && group.links.some((l) => estaNaAba(pathname, l.to));
            return (
              <div key={group.title}>
                <button
                  type="button"
                  onClick={() => alternarGrupo(group.title)}
                  aria-expanded={!recolhido}
                  title={recolhido ? `Mostrar ${group.title}` : `Recolher ${group.title}`}
                  className="group/grupo mb-1.5 flex w-full items-center gap-1.5 rounded px-3 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  <span>{group.title}</span>
                  {recolhido && (
                    <span className="normal-case tracking-normal text-muted-foreground/60">
                      · {group.links.length}
                      {temAtual ? " · aba atual" : ""}
                      {(() => { const n = group.links.reduce((s, l) => s + (contadores?.[l.to] ?? 0), 0); return n ? ` · ${n} novo${n > 1 ? "s" : ""}` : ""; })()}
                    </span>
                  )}
                  <ChevronDown
                    size={12}
                    className={cn("ml-auto opacity-60 transition-transform group-hover/grupo:opacity-100", recolhido && "-rotate-90")}
                  />
                </button>
                {!recolhido && (
                  <div className="space-y-0.5">
                    {group.links.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        activeOptions={{ exact: link.to === "/" }}
                        className={CLASSE_LINK}
                        onClick={onNavegar}
                      >
                        <span className="text-muted-foreground group-hover/nav:text-foreground group-data-[status=active]/nav:text-primary transition-colors">
                          {link.icon}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{link.label}</span>
                        <Contador n={contadores?.[link.to]} onLimpar={onLimparContador && contadores?.[link.to] ? () => onLimparContador(link.to) : undefined} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </nav>
    </>
  );
}
