// Seletor de cliente com busca (tolerante a acento e erro de digitação), no lugar do dropdown simples.
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buscar } from "@/lib/search";
import { cn } from "@/lib/utils";

export function SeletorCliente({ clientes, valor, onChange, limpavel = false }: {
  clientes: { id: string; nome: string }[]; valor: string; onChange: (id: string) => void;
  /** Mostra a opção "Sem cliente" (o gerador funciona sem cliente; o diálogo de adicionar exige um) */
  limpavel?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const atual = clientes.find((c) => c.id === valor);
  const lista = useMemo(() => buscar(clientes, busca, (c) => [c.nome]).itens, [clientes, busca]);
  const escolher = (id: string) => { onChange(id); setAberto(false); setBusca(""); };

  return (
    <Popover open={aberto} onOpenChange={(o) => { setAberto(o); if (!o) setBusca(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button" role="combobox" aria-expanded={aberto} aria-label="Cliente"
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <span className={cn("truncate", !atual && "text-muted-foreground")}>{atual?.nome ?? "Escolha o cliente"}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-60 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar cliente..." value={busca} onValueChange={setBusca} />
          <CommandList className="max-h-64">
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandGroup>
              {limpavel && valor && !busca && (
                <CommandItem value="__sem_cliente__" onSelect={() => escolher("")} className="text-muted-foreground">Sem cliente (só gerar)</CommandItem>
              )}
              {lista.map((c) => (
                <CommandItem key={c.id} value={c.id} onSelect={() => escolher(c.id)}>
                  <Check className={cn("mr-2 h-4 w-4", valor === c.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{c.nome}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
