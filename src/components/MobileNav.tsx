import { Link, useRouterState } from "@tanstack/react-router";
import { AudioLines, CalendarDays, LayoutDashboard, Menu, StickyNote, type LucideIcon } from "lucide-react";
import { ATALHOS_MOBILE, atalhoAtivo } from "@/lib/navMobile";
import { cn } from "@/lib/utils";

const ICONES: Record<string, LucideIcon> = { "/": LayoutDashboard, "/agenda": CalendarDays, "/notas": StickyNote, "/transcritor": AudioLines };
const ITEM = "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:scale-95";

/** Barra inferior do celular: 4 atalhos + "Mais" (abre o menu lateral completo). Some a partir de lg. */
export function MobileNav({ onMais, maisAberto, novos }: { onMais: () => void; maisAberto: boolean; novos?: number }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const emAtalho = ATALHOS_MOBILE.some((a) => atalhoAtivo(pathname, a.to));
  return (
    <nav aria-label="Atalhos" className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="grid h-16 grid-cols-5">
        {ATALHOS_MOBILE.map((a) => {
          const Icone = ICONES[a.to];
          const ativo = !maisAberto && atalhoAtivo(pathname, a.to);
          return (
            <Link key={a.to} to={a.to} aria-current={ativo ? "page" : undefined} className={cn(ITEM, ativo ? "text-primary" : "text-muted-foreground")}>
              <Icone size={22} strokeWidth={ativo ? 2.2 : 1.8} />
              {a.rotulo}
            </Link>
          );
        })}
        <button type="button" onClick={onMais} className={cn(ITEM, maisAberto || !emAtalho ? "text-primary" : "text-muted-foreground")}>
          <span className="relative">
            <Menu size={22} strokeWidth={maisAberto || !emAtalho ? 2.2 : 1.8} />
            {!!novos && (
              <span aria-label={`${novos} novos`} className="absolute -right-2 -top-1.5 shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-primary-foreground">
                {novos > 99 ? "99+" : novos}
              </span>
            )}
          </span>
          Mais
        </button>
      </div>
    </nav>
  );
}
