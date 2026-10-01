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
import { MENSAGEM_NENHUM, MENSAGEM_PARECIDOS } from "@/lib/search";
import { useBusca } from "@/lib/useBusca";
import { cn } from "@/lib/utils";

interface ClientePickerCliente {
  id: string;
  nome: string;
  agencia?: string;
}

interface ClientePickerProps {
  clientes: ClientePickerCliente[];
  clienteIdAtual: string | null;
  pessoalAtual?: boolean;
  onEscolher: (valor: { cliente_id: string | null; pessoal: boolean }) => void;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  /** false esconde "Sem cliente" (ex.: dono de um roadmap: cliente ou Pessoal). */
  permitirSemCliente?: boolean;
}

/** O que a lista mostra: "Pessoal", "Sem cliente" e os clientes (todos entram na busca pelo rótulo). */
type Entrada =
  | { tipo: "pessoal" }
  | { tipo: "semCliente" }
  | { tipo: "cliente"; cliente: ClientePickerCliente };

const camposDaEntrada = (e: Entrada) =>
  e.tipo === "pessoal" ? ["Pessoal"] : e.tipo === "semCliente" ? ["Sem cliente"] : [e.cliente.nome];

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
        <ListaClientes
          clientes={clientesOrdenados}
          permitirSemCliente={permitirSemCliente}
          clienteIdAtual={clienteIdAtual}
          pessoalAtual={pessoalAtual}
          escolher={escolher}
        />
      </PopoverContent>
    </Popover>
  );
}

interface ListaClientesProps {
  clientes: ClientePickerCliente[];
  permitirSemCliente: boolean;
  clienteIdAtual: string | null;
  pessoalAtual?: boolean;
  escolher: (valor: { cliente_id: string | null; pessoal: boolean }) => void;
}

/** Conteúdo do popover. O texto digitado mora aqui: ao fechar o popover o conteúdo sai da tela e a busca volta vazia. */
function ListaClientes({ clientes, permitirSemCliente, clienteIdAtual, pessoalAtual, escolher }: ListaClientesProps) {
  const [texto, setTexto] = useState("");
  const entradas = useMemo<Entrada[]>(
    () => [
      { tipo: "pessoal" as const },
      ...(permitirSemCliente ? [{ tipo: "semCliente" as const }] : []),
      ...clientes.map((cliente) => ({ tipo: "cliente" as const, cliente })),
    ],
    [permitirSemCliente, clientes]
  );
  // Sem texto, a lista sai como hoje (Pessoal, Sem cliente, clientes por nome); com texto, na ordem da busca.
  const resultado = useBusca(entradas, texto, camposDaEntrada);

  const semCliente = !pessoalAtual && !clienteIdAtual;
  const renderEntrada = (entrada: Entrada) => {
    if (entrada.tipo === "pessoal") {
      return (
        <CommandItem key="x:pessoal" value="x:pessoal" onSelect={() => escolher({ cliente_id: null, pessoal: true })}>
          <User size={14} className="text-violet-500" />
          <span className="flex-1">Pessoal</span>
          {pessoalAtual && <Check size={14} />}
        </CommandItem>
      );
    }
    if (entrada.tipo === "semCliente") {
      return (
        <CommandItem key="__vazio__" value="__vazio__" onSelect={() => escolher({ cliente_id: null, pessoal: false })}>
          <span className={cn("flex-1", semCliente ? "" : "text-zinc-500")}>Sem cliente</span>
          {semCliente && <Check size={14} />}
        </CommandItem>
      );
    }
    const c = entrada.cliente;
    return (
      <CommandItem key={c.id} value={`c:${c.id}`} onSelect={() => escolher({ cliente_id: c.id, pessoal: false })}>
        <span className="flex-1 truncate">{c.nome}</span>
        {!pessoalAtual && clienteIdAtual === c.id && <Check size={14} />}
      </CommandItem>
    );
  };

  const fixos = resultado.itens.filter((e) => e.tipo !== "cliente");
  const doResultado = resultado.itens.filter((e) => e.tipo === "cliente");

  return (
    // A busca é nossa (sem acento, sem maiúscula e tolerante a erro de digitação): o cmdk só mostra os itens, na ordem que passamos
    <Command shouldFilter={false}>
      <CommandInput placeholder="Buscar cliente…" value={texto} onValueChange={setTexto} />
      <CommandList>
        <CommandEmpty>{MENSAGEM_NENHUM}</CommandEmpty>
        {resultado.modo === "parecidos" ? (
          <CommandGroup heading={MENSAGEM_PARECIDOS}>{resultado.itens.map(renderEntrada)}</CommandGroup>
        ) : (
          <>
            {fixos.length > 0 && <CommandGroup>{fixos.map(renderEntrada)}</CommandGroup>}
            {doResultado.length > 0 && <CommandGroup heading="Clientes">{doResultado.map(renderEntrada)}</CommandGroup>}
          </>
        )}
      </CommandList>
    </Command>
  );
}
