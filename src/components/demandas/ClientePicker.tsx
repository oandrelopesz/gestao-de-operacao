import React, { useMemo, useRef, useState } from "react";
import { Building2, Check, ListPlus, User } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAgencias, type AgenciaDef } from "@/lib/agencias";
import { alternarCliente, clientesDaDemanda } from "@/lib/clientesDaDemanda";

interface ClientePickerCliente {
  id: string;
  nome: string;
  agencia?: string;
}

/**
 * Dono de uma demanda: cliente(s), "Pessoal" ou uma agência (exclusivos; nenhum = "Sem cliente").
 * Com mais de um cliente, `cliente_id` é o principal e `clientes_extras` os demais.
 */
export type DonoDemanda = {
  cliente_id: string | null;
  pessoal: boolean;
  agencia_id: string | null;
  clientes_extras: string[];
};

interface ClientePickerProps {
  clientes: ClientePickerCliente[];
  clienteIdAtual: string | null;
  pessoalAtual?: boolean;
  agenciaIdAtual?: string | null;
  clientesExtrasAtuais?: string[] | null;
  onEscolher: (valor: DonoDemanda) => void;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  /** false esconde "Sem cliente" (ex.: dono de um roadmap: cliente ou Pessoal). */
  permitirSemCliente?: boolean;
  /** false esconde as agências (ex.: dono de um roadmap). */
  comAgencias?: boolean;
  /**
   * true oferece o botão "Selecionar mais de um": por padrão clicar no nome escolhe só ele e fecha; no modo vários
   * (ou se a demanda já tem mais de um cliente) clicar marca/desmarca e a lista fica aberta, com um botão "Pronto".
   */
  variosClientes?: boolean;
}

/** O que a lista mostra: "Pessoal", "Sem cliente", as agências e os clientes (todos entram na busca pelo rótulo). */
type Entrada =
  | { tipo: "pessoal" }
  | { tipo: "semCliente" }
  | { tipo: "agencia"; agencia: AgenciaDef }
  | { tipo: "cliente"; cliente: ClientePickerCliente };

const camposDaEntrada = (e: Entrada) =>
  e.tipo === "pessoal"
    ? ["Pessoal"]
    : e.tipo === "semCliente"
      ? ["Sem cliente"]
      : e.tipo === "agencia"
        ? [e.agencia.label]
        : [e.cliente.nome];

/** Popover + Command (busca) para atribuir cliente, "Pessoal", agência ou "Sem cliente" a uma demanda. */
export function ClientePicker({
  clientes,
  clienteIdAtual,
  pessoalAtual,
  agenciaIdAtual,
  clientesExtrasAtuais,
  onEscolher,
  children,
  align = "start",
  permitirSemCliente = true,
  comAgencias = true,
  variosClientes = false,
}: ClientePickerProps) {
  const { agencias } = useAgencias();
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

  const escolher = (valor: DonoDemanda) => {
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
          agencias={comAgencias ? agencias : []}
          permitirSemCliente={permitirSemCliente}
          clienteIdAtual={clienteIdAtual}
          pessoalAtual={pessoalAtual}
          agenciaIdAtual={agenciaIdAtual ?? null}
          clientesExtrasAtuais={clientesExtrasAtuais ?? []}
          variosClientes={variosClientes}
          escolher={escolher}
          alternar={onEscolher}
          fechar={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

interface ListaClientesProps {
  clientes: ClientePickerCliente[];
  agencias: AgenciaDef[];
  permitirSemCliente: boolean;
  clienteIdAtual: string | null;
  pessoalAtual?: boolean;
  agenciaIdAtual: string | null;
  clientesExtrasAtuais: string[];
  variosClientes: boolean;
  /** Escolhe e fecha */
  escolher: (valor: DonoDemanda) => void;
  /** Marca/desmarca um cliente a mais e deixa a lista aberta */
  alternar: (valor: DonoDemanda) => void;
  fechar: () => void;
}

/** Conteúdo do popover. O texto digitado mora aqui: ao fechar o popover o conteúdo sai da tela e a busca volta vazia. */
function ListaClientes({
  clientes,
  agencias,
  permitirSemCliente,
  clienteIdAtual,
  pessoalAtual,
  agenciaIdAtual,
  clientesExtrasAtuais,
  variosClientes,
  escolher,
  alternar,
  fechar,
}: ListaClientesProps) {
  const [texto, setTexto] = useState("");
  // Clientes marcados nesta abertura: a marcação é salva a cada clique, mas a lista não espera o banco responder
  const [marcados, setMarcados] = useState<string[]>(() =>
    pessoalAtual ? [] : clientesDaDemanda({ cliente_id: clienteIdAtual, clientes_extras: clientesExtrasAtuais })
  );
  // Os marcados ao abrir vêm primeiro na lista (sem pular de lugar enquanto marca e desmarca)
  const [marcadosAoAbrir] = useState(marcados);
  // Começa um cliente por vez; o botão libera marcar vários (já abre assim se a demanda tem mais de um)
  const [modoVarios, setModoVarios] = useState(marcados.length > 1);
  const varios = variosClientes && modoVarios;
  const entradas = useMemo<Entrada[]>(() => {
    const lista = variosClientes && marcadosAoAbrir.length
      ? [
          ...marcadosAoAbrir.map((id) => clientes.find((c) => c.id === id)).filter((c): c is ClientePickerCliente => !!c),
          ...clientes.filter((c) => !marcadosAoAbrir.includes(c.id)),
        ]
      : clientes;
    return [
      { tipo: "pessoal" as const },
      ...(permitirSemCliente ? [{ tipo: "semCliente" as const }] : []),
      ...agencias.map((agencia) => ({ tipo: "agencia" as const, agencia })),
      ...lista.map((cliente) => ({ tipo: "cliente" as const, cliente })),
    ];
  }, [permitirSemCliente, agencias, clientes, variosClientes, marcadosAoAbrir]);
  // Sem texto: Pessoal, Sem cliente, agências (na ordem do cadastro) e clientes por nome; com texto, na ordem da busca.
  const resultado = useBusca(entradas, texto, camposDaEntrada);

  const alternarCliente_ = (id: string) => {
    const novo = alternarCliente({ cliente_id: marcados[0] ?? null, clientes_extras: marcados.slice(1) }, id);
    setMarcados(clientesDaDemanda(novo));
    alternar({ ...novo, pessoal: false, agencia_id: null });
  };

  const temCliente = marcados.length > 0;
  const semCliente = !pessoalAtual && !temCliente && !agenciaIdAtual;
  const renderEntrada = (entrada: Entrada) => {
    if (entrada.tipo === "pessoal") {
      return (
        <CommandItem key="x:pessoal" value="x:pessoal" onSelect={() => escolher({ cliente_id: null, pessoal: true, agencia_id: null, clientes_extras: [] })}>
          <User size={14} className="text-violet-500" />
          <span className="flex-1">Pessoal</span>
          {pessoalAtual && !temCliente && <Check size={14} />}
        </CommandItem>
      );
    }
    if (entrada.tipo === "semCliente") {
      return (
        <CommandItem key="__vazio__" value="__vazio__" onSelect={() => escolher({ cliente_id: null, pessoal: false, agencia_id: null, clientes_extras: [] })}>
          <span className={cn("flex-1", semCliente ? "" : "text-zinc-500")}>Sem cliente</span>
          {semCliente && <Check size={14} />}
        </CommandItem>
      );
    }
    if (entrada.tipo === "agencia") {
      const a = entrada.agencia;
      return (
        <CommandItem key={`a:${a.id}`} value={`a:${a.id}`} onSelect={() => escolher({ cliente_id: null, pessoal: false, agencia_id: a.id, clientes_extras: [] })}>
          <Building2 size={14} style={{ color: a.hex }} />
          <span className="flex-1 truncate">{a.label}</span>
          {!pessoalAtual && !temCliente && agenciaIdAtual === a.id && <Check size={14} />}
        </CommandItem>
      );
    }
    const c = entrada.cliente;
    const marcado = marcados.includes(c.id);
    return (
      <CommandItem
        key={c.id}
        value={`c:${c.id}`}
        // Modo vários: o nome também marca/desmarca e a lista fica aberta; senão escolhe só ele e fecha
        onSelect={() => (varios ? alternarCliente_(c.id) : escolher({ cliente_id: c.id, pessoal: false, agencia_id: null, clientes_extras: [] }))}
      >
        {varios && (
          <span
            role="checkbox"
            aria-checked={marcado}
            aria-label={marcado ? `Tirar ${c.nome}` : `Juntar ${c.nome}`}
            className={cn(
              "h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center transition-colors",
              marcado
                ? "bg-primary border-primary text-primary-foreground"
                : "border-zinc-300 dark:border-zinc-600 hover:border-primary"
            )}
          >
            {marcado && <Check size={10} />}
          </span>
        )}
        <span className="flex-1 truncate">{c.nome}</span>
        {!varios && !pessoalAtual && clienteIdAtual === c.id && <Check size={14} />}
      </CommandItem>
    );
  };

  const fixos = resultado.itens.filter((e) => e.tipo === "pessoal" || e.tipo === "semCliente");
  const deAgencias = resultado.itens.filter((e) => e.tipo === "agencia");
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
            {deAgencias.length > 0 && <CommandGroup heading="Agências">{deAgencias.map(renderEntrada)}</CommandGroup>}
            {doResultado.length > 0 && (
              <CommandGroup heading={varios ? "Clientes · marque quantos quiser" : "Clientes"}>
                {doResultado.map(renderEntrada)}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
      {variosClientes && !varios && (
        <div className="border-t p-2">
          <Button type="button" variant="ghost" size="sm" className="h-7 w-full justify-start gap-1.5 text-xs" onClick={() => setModoVarios(true)}>
            <ListPlus size={13} /> Selecionar mais de um
          </Button>
        </div>
      )}
      {varios && (
        <div className="flex items-center justify-between gap-2 border-t p-2">
          <span className="text-xs text-muted-foreground">
            {marcados.length === 0 ? "Nenhum cliente" : marcados.length === 1 ? "1 cliente" : `${marcados.length} clientes`}
          </span>
          <Button type="button" size="sm" className="h-7" onClick={fechar}>Pronto</Button>
        </div>
      )}
    </Command>
  );
}
