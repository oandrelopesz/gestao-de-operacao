// Ctrl+K nas aparências Painel e Editorial: janela de busca de abas (a Clássica segue com a busca do menu lateral).
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { buscarAbas } from "@/lib/buscaAbas";
import type { NavLink } from "@/lib/nav";
import { MensagemBusca } from "@/components/MensagemBusca";
import { MENSAGEM_NENHUM } from "@/lib/search";
import { cn } from "@/lib/utils";

interface Props {
  grupos: { title: string; links: NavLink[] }[];
  aberta: boolean;
  onMudar: (aberta: boolean) => void;
}

export function PaletaAbas({ grupos, aberta, onMudar }: Props) {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [destaque, setDestaque] = useState(0);
  const itens = useMemo(() => grupos.flatMap((g) => g.links.map((l) => ({ ...l, grupo: g.title }))), [grupos]);
  const resultado = useMemo(() => buscarAbas(itens, busca), [itens, busca]);
  const buscando = busca.trim().length > 0;
  const lista = buscando ? resultado.itens : itens;

  useEffect(() => setDestaque(0), [busca]);
  useEffect(() => {
    if (!aberta) setBusca("");
  }, [aberta]);

  const ir = (to: string) => {
    onMudar(false);
    navigate({ to });
  };

  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestaque((i) => Math.min(i + 1, Math.max(lista.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestaque((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && lista[destaque]) {
      e.preventDefault();
      ir(lista[destaque].to);
    }
  };

  return (
    <Dialog open={aberta} onOpenChange={onMudar}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 p-0" onKeyDown={aoTeclar}>
        <DialogTitle className="sr-only">Buscar aba</DialogTitle>
        <DialogDescription className="sr-only">Digite o nome da aba e aperte Enter</DialogDescription>
        <div className="relative border-b border-border">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar aba…"
            aria-label="Buscar aba"
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full bg-transparent pl-11 pr-12 text-[15px] outline-none placeholder:text-muted-foreground/70"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2" role="listbox" aria-label="Abas encontradas">
          {buscando && resultado.modo === "parecidos" && <MensagemBusca resultado={resultado} className="px-3 pb-1.5 text-[12px]" />}
          {lista.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">{MENSAGEM_NENHUM}</p>
          ) : (
            lista.map((l, i) => (
              <button
                key={l.to}
                type="button"
                role="option"
                aria-selected={i === destaque}
                onMouseEnter={() => setDestaque(i)}
                onClick={() => ir(l.to)}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm", i === destaque ? "bg-foreground text-background" : "hover:bg-foreground/10")}
              >
                <span className="opacity-80">{l.icon}</span>
                <span className="min-w-0 flex-1 truncate">{l.label}</span>
                <span className="shrink-0 text-[11px] uppercase tracking-wider opacity-60">{l.grupo}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
