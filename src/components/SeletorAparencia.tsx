// Botão do cabeçalho: escolhe a aparência (Clássica, Painel e vidro ou Editorial) e alterna claro/escuro.
import { Check, Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAparencia, type Aparencia } from "@/lib/aparencia";
import { useTheme } from "@/lib/theme";

const OPCOES: { id: Aparencia; nome: string }[] = [
  { id: "classica", nome: "Clássica" },
  { id: "painel", nome: "Painel e vidro" },
  { id: "editorial", nome: "Editorial" },
];

export function SeletorAparencia() {
  const { aparencia, setAparencia } = useAparencia();
  const { theme, toggle } = useTheme();
  const escuro = theme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground" title="Aparência e tema">
          <Palette size={17} />
          <span className="hidden text-[13px] sm:inline">Aparência</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Aparência</DropdownMenuLabel>
        {OPCOES.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => setAparencia(o.id)} className="gap-2">
            <span className="flex-1">{o.nome}</span>
            {aparencia === o.id && <Check size={14} className="text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={toggle} className="gap-2">
          {escuro ? <Sun size={14} /> : <Moon size={14} />}
          <span>{escuro ? "Modo claro" : "Modo escuro"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
