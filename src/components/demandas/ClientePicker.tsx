import React, { useMemo, useState } from "react";
import { Check, User } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface ClientePickerProps {
  clientes: { id: string; nome: string; agencia?: string }[];
  clienteIdAtual: string | null;
  pessoalAtual?: boolean;
  onEscolher: (valor: { cliente_id: string | null; pessoal: boolean }) => void;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}

/** Popover + Command (busca) para atribuir cliente, "Pessoal" ou "Sem cliente" a uma demanda. */
export function ClientePicker({
  clientes,
  clienteIdAtual,
  pessoalAtual,
  onEscolher,
  children,
  align = "start",
}: ClientePickerProps) {
  const [open, setOpen] = useState(false);

  const clientesOrdenados = useMemo(
    () => [...clientes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [clientes]
  );

  const escolher = (valor: { cliente_id: string | null; pessoal: boolean }) => {
    onEscolher(valor);
    setOpen(false);
  };

  const semCliente = !pessoalAtual && !clienteIdAtual;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-[240px] p-0"
        align={align}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Buscar cliente…" />
          <CommandList>
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="Pessoal" onSelect={() => escolher({ cliente_id: null, pessoal: true })}>
                <User size={14} className="text-violet-500" />
                <span className="flex-1">Pessoal</span>
                {pessoalAtual && <Check size={14} />}
              </CommandItem>
              <CommandItem value="Sem cliente" onSelect={() => escolher({ cliente_id: null, pessoal: false })}>
                <span className={cn("flex-1", semCliente ? "" : "text-zinc-500")}>Sem cliente</span>
                {semCliente && <Check size={14} />}
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Clientes">
              {clientesOrdenados.map((c) => (
                <CommandItem key={c.id} value={c.nome} onSelect={() => escolher({ cliente_id: c.id, pessoal: false })}>
                  <span className="flex-1 truncate">{c.nome}</span>
                  {!pessoalAtual && clienteIdAtual === c.id && <Check size={14} />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
