import React, { useMemo, useRef, useState } from "react";
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
import { filtroCmdk } from "@/lib/buscaTexto";
import { cn } from "@/lib/utils";

interface ClientePickerProps {
  clientes: { id: string; nome: string; agencia?: string }[];
  clienteIdAtual: string | null;
  pessoalAtual?: boolean;
  onEscolher: (valor: { cliente_id: string | null; pessoal: boolean }) => void;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  /** false esconde "Sem cliente" (ex.: dono de um roadmap: cliente ou Pessoal). */
  permitirSemCliente?: boolean;
}

/** Popover + Command (busca) para atribuir cliente, "Pessoal" ou "Sem cliente" a uma demanda. */
export function ClientePicker({
  clientes,
  clienteIdAtual,
  pessoalAtual,
  onEscolher,
  children,
  align = "start",
  permitirSemCliente = true,
}: ClientePickerProps) {
  const [open, setOpen] = useState(false);

  // A lista só aparece com o popover aberto: ordena a partir da primeira abertura (e mantém durante a
  // animação de fechar). Cada card do Kanban tem um seletor; ordenar os clientes em todos pesava na aba de Demandas.
  const jaAbriu = useRef(false);
  if (open) jaAbriu.current = true;
  const clientesOrdenados = useMemo(
    () => (jaAbriu.current ? [...clientes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientes, open]
  );

  const escolher = (valor: { cliente_id: string | null; pessoal: boolean }) => {
    onEscolher(valor);
    setOpen(false);
  };

  const semCliente = !pessoalAtual && !clienteIdAtual;

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-[240px] p-0"
        align={align}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        // Teclas (espaço, Enter, setas) não podem chegar ao card: iniciariam o arrastar pelo teclado
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Busca sem acento e sem maiúscula, só pelo nome: o `value` dos itens carrega o id e não entra na busca */}
        <Command filter={filtroCmdk}>
          <CommandInput placeholder="Buscar cliente…" />
          <CommandList>
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="x:pessoal" keywords={["Pessoal"]} onSelect={() => escolher({ cliente_id: null, pessoal: true })}>
                <User size={14} className="text-violet-500" />
                <span className="flex-1">Pessoal</span>
                {pessoalAtual && <Check size={14} />}
              </CommandItem>
              {permitirSemCliente && (
                <CommandItem value="__vazio__" keywords={["Sem cliente"]} onSelect={() => escolher({ cliente_id: null, pessoal: false })}>
                  <span className={cn("flex-1", semCliente ? "" : "text-zinc-500")}>Sem cliente</span>
                  {semCliente && <Check size={14} />}
                </CommandItem>
              )}
            </CommandGroup>
            <CommandGroup heading="Clientes">
              {clientesOrdenados.map((c) => (
                <CommandItem key={c.id} value={`c:${c.id}`} keywords={[c.nome]} onSelect={() => escolher({ cliente_id: c.id, pessoal: false })}>
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
