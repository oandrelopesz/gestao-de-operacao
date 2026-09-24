import { PanelLeft, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConfig } from "@/lib/appConfig";
import { NAV_GROUPS } from "@/lib/nav";
import { MENU_FIXOS, moverNoGrupo, alternarOculta, type MenuConfig } from "@/lib/menuConfig";

const CFG_VAZIA: MenuConfig = { ocultas: [], ordem: {} };

// Mesma regra de ordenação do aplicarMenu, mas sem filtrar as ocultas: aqui elas
// continuam na lista (só ficam esmaecidas), para dar para reexibi-las.
function ordenarGrupo<L extends { to: string }>(links: L[], ordem: string[]): L[] {
  const pos = (to: string) => {
    const i = ordem.indexOf(to);
    return i < 0 ? ordem.length + links.findIndex((l) => l.to === to) : i;
  };
  return [...links].sort((a, b) => pos(a.to) - pos(b.to));
}

/**
 * Card da aba Admin para configurar o menu lateral: quais abas aparecem e a
 * ordem dentro de cada grupo. Demandas e Admin (MENU_FIXOS) nunca somem.
 */
export function MenuAdminCard() {
  const [cfg, salvarCfg] = useConfig<MenuConfig | null>("menu", null);
  const atual = cfg ?? CFG_VAZIA;

  const salvar = async (novo: MenuConfig) => {
    try {
      await salvarCfg(novo);
      window.dispatchEvent(new Event("menu-config"));
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar o menu");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PanelLeft size={18} /> Menu lateral</CardTitle>
        <CardDescription>Escolha quais abas aparecem e a ordem de cada grupo. Demandas e Admin ficam sempre visíveis.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {NAV_GROUPS.map((group) => {
          const ordem = atual.ordem[group.title] ?? [];
          const links = ordenarGrupo(group.links, ordem);
          const tos = links.map((l) => l.to);
          return (
            <div key={group.title}>
              <p className="px-1 mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">{group.title}</p>
              <div className="divide-y rounded-md border">
                {links.map((link, idx) => {
                  const fixo = MENU_FIXOS.includes(link.to);
                  const visivel = fixo || !atual.ocultas.includes(link.to);
                  return (
                    <div key={link.to} className={cn("flex items-center gap-3 px-3 py-2", !visivel && "opacity-50")}>
                      <span className="text-muted-foreground shrink-0">{link.icon}</span>
                      <span className="flex-1 text-sm font-medium truncate">{link.label}</span>
                      <Switch
                        checked={visivel}
                        disabled={fixo}
                        onCheckedChange={() => salvar(alternarOculta(atual, link.to))}
                        title={fixo ? "Sempre visível" : visivel ? "Ocultar do menu" : "Mostrar no menu"}
                      />
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={idx === 0}
                          onClick={() => salvar(moverNoGrupo(atual, group.title, tos, link.to, -1))}
                          title="Subir"
                        >
                          <ArrowUp size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={idx === links.length - 1}
                          onClick={() => salvar(moverNoGrupo(atual, group.title, tos, link.to, 1))}
                          title="Descer"
                        >
                          <ArrowDown size={14} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
