import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
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

export interface ClienteSelectCliente {
  id: string;
  nome: string;
  /** Nome (ou rótulo) da agência: aparece ao lado do cliente na lista e também entra na busca. */
  agencia?: string | null;
}

export interface ClienteSelectExtra {
  value: string;
  label: string;
}

export interface ClienteSelectProps {
  clientes: ClienteSelectCliente[];
  /** id do cliente, `value` de um extra, ou null (sem cliente / todos). "" vale como null. */
  value: string | null;
  /** Recebe o id do cliente, o `value` do extra escolhido, ou null na opção vazia. */
  onChange: (id: string | null) => void;
  placeholder?: string;
  /** Primeira opção da lista, que vira null ("Sem cliente", "Todos os clientes"). */
  opcaoVazia?: string;
  /** Entradas especiais além dos clientes (ex.: "Pessoal"). */
  extras?: ClienteSelectExtra[];
  id?: string;
  "aria-label"?: string;
  /** Repassados pelo FormControl do shadcn quando o seletor fica dentro de um FormField. */
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  disabled?: boolean;
  className?: string;
  /** false mantém a ordem recebida (ex.: lista por data); o padrão ordena por nome (pt-BR). Com texto na busca, vale a ordem da busca. */
  ordenar?: boolean;
  /** Texto do campo de busca (padrão "Buscar cliente…"). */
  textoBusca?: string;
  /** Texto quando não há nada para listar, sem busca (padrão "Nenhum cliente encontrado."). Busca sem resultado mostra "Nenhum resultado encontrado.". */
  textoNenhum?: string;
}

const VALOR_VAZIO = "__vazio__";
const valorCliente = (id: string) => `c:${id}`;
const valorExtra = (v: string) => `x:${v}`;
const TEXTO_FORA_DA_LISTA = "Cliente fora da lista (arquivado?)";

/** O que a lista mostra: a opção vazia, os extras e os clientes (todos entram na busca pelo rótulo). */
type Entrada =
  | { tipo: "vazio"; rotulo: string }
  | { tipo: "extra"; extra: ClienteSelectExtra }
  | { tipo: "cliente"; cliente: ClienteSelectCliente };

/** Campos da busca: o nome (ou rótulo) é o principal; a agência do cliente, secundário. */
const camposDaEntrada = (e: Entrada) =>
  e.tipo === "vazio" ? [e.rotulo] : e.tipo === "extra" ? [e.extra.label] : [e.cliente.nome, e.cliente.agencia];

const chaveDaEntrada = (e: Entrada) =>
  e.tipo === "vazio" ? VALOR_VAZIO : e.tipo === "extra" ? valorExtra(e.extra.value) : valorCliente(e.cliente.id);

/**
 * Seletor de cliente com busca: no lugar do Select comum, o usuário pode digitar parte do nome (ou da agência)
 * para achar o cliente, sem acento, sem diferença de maiúscula e com tolerância a erro de digitação. Popover + Command,
 * funciona dentro de Dialog/Sheet e no teclado (setas, Enter, Esc).
 */
export function ClienteSelect({
  clientes,
  value,
  onChange,
  placeholder = "Selecione o cliente",
  opcaoVazia,
  extras,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  disabled,
  className,
  ordenar = true,
  textoBusca = "Buscar cliente…",
  textoNenhum = "Nenhum cliente encontrado.",
}: ClienteSelectProps) {
  const [open, setOpen] = useState(false);

  // A lista só é ordenada a partir da primeira abertura (e fica assim durante a animação de fechar): telas com
  // vários seletores (ex.: um por linha) não ordenam todos os clientes sem ninguém abrir.
  const jaAbriu = useRef(false);
  if (open) jaAbriu.current = true;
  const clientesOrdenados = useMemo(
    () => (!jaAbriu.current ? [] : ordenar ? [...clientes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) : clientes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientes, ordenar, open]
  );

  const atual = value || null;
  const extraAtual = atual ? extras?.find((e) => e.value === atual) : undefined;
  const clienteAtual = atual && !extraAtual ? clientes.find((c) => c.id === atual) : undefined;
  // Valor definido que não está na lista (ex.: cliente arquivado). Com a lista ainda vazia (carregando), não avisa.
  const foraDaLista = !!atual && !extraAtual && !clienteAtual && clientes.length > 0;
  const textoVazio = atual === null ? opcaoVazia : undefined;
  const textoBotao = extraAtual?.label ?? clienteAtual?.nome ?? (foraDaLista ? TEXTO_FORA_DA_LISTA : textoVazio ?? placeholder);
  const mostraPlaceholder = !extraAtual && !clienteAtual && textoVazio === undefined;
  // Ao abrir, a linha do valor atual já vem destacada e à vista (o cmdk rola até ela)
  const valorInicial = extraAtual
    ? valorExtra(extraAtual.value)
    : clienteAtual
      ? valorCliente(clienteAtual.id)
      : atual === null && opcaoVazia !== undefined
        ? VALOR_VAZIO
        : undefined;

  const escolher = (novo: string | null) => {
    onChange(novo);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-expanded={open}
          disabled={disabled}
          // Como no Select antigo: seta para baixo ou para cima, com o botão em foco, abre a lista
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
            }
          }}
          data-placeholder={mostraPlaceholder ? "" : undefined}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <span className="min-w-0 flex-1 truncate">{textoBotao}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[220px] p-0"
        // Dentro de cartão ou linha clicável, o clique, o toque e as teclas da lista não podem chegar ao pai
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <ListaClientes
          clientes={clientesOrdenados}
          extras={extras}
          opcaoVazia={opcaoVazia}
          atual={atual}
          valorInicial={valorInicial}
          textoBusca={textoBusca}
          textoNenhum={textoNenhum}
          escolher={escolher}
        />
      </PopoverContent>
    </Popover>
  );
}

interface ListaClientesProps {
  clientes: ClienteSelectCliente[];
  extras?: ClienteSelectExtra[];
  opcaoVazia?: string;
  atual: string | null;
  valorInicial?: string;
  textoBusca: string;
  textoNenhum: string;
  escolher: (novo: string | null) => void;
}

/** Conteúdo do popover. O texto digitado mora aqui: ao fechar o popover o conteúdo sai da tela e a busca volta vazia. */
function ListaClientes({ clientes, extras, opcaoVazia, atual, valorInicial, textoBusca, textoNenhum, escolher }: ListaClientesProps) {
  const [texto, setTexto] = useState("");
  const entradas = useMemo<Entrada[]>(
    () => [
      ...(opcaoVazia !== undefined ? [{ tipo: "vazio" as const, rotulo: opcaoVazia }] : []),
      ...(extras ?? []).map((extra) => ({ tipo: "extra" as const, extra })),
      ...clientes.map((cliente) => ({ tipo: "cliente" as const, cliente })),
    ],
    [opcaoVazia, extras, clientes]
  );
  // Sem texto, a lista sai como recebida (vazio, extras, clientes); com texto, na ordem da busca.
  const resultado = useBusca(entradas, texto, camposDaEntrada);

  return (
    // A busca é nossa (tolerante a erro de digitação): o cmdk só mostra os itens, na ordem que passamos
    <Command shouldFilter={false} defaultValue={valorInicial} label={textoBusca.replace(/…$/, "")} loop>
      <CommandInput placeholder={textoBusca} value={texto} onValueChange={setTexto} />
      <CommandList label="Opções">
        <CommandEmpty>{resultado.modo === "nenhum" ? MENSAGEM_NENHUM : textoNenhum}</CommandEmpty>
        <CommandGroup heading={resultado.modo === "parecidos" ? MENSAGEM_PARECIDOS : undefined}>
          {resultado.itens.map((entrada) => {
            if (entrada.tipo === "vazio") {
              return (
                <CommandItem key={VALOR_VAZIO} value={VALOR_VAZIO} onSelect={() => escolher(null)}>
                  <span className="flex-1 truncate">{entrada.rotulo}</span>
                  {atual === null && <Check aria-hidden="true" />}
                </CommandItem>
              );
            }
            if (entrada.tipo === "extra") {
              const e = entrada.extra;
              return (
                <CommandItem key={chaveDaEntrada(entrada)} value={valorExtra(e.value)} onSelect={() => escolher(e.value)}>
                  <span className="flex-1 truncate">{e.label}</span>
                  {atual === e.value && <Check aria-hidden="true" />}
                </CommandItem>
              );
            }
            const c = entrada.cliente;
            return (
              <CommandItem key={chaveDaEntrada(entrada)} value={valorCliente(c.id)} onSelect={() => escolher(c.id)}>
                <span className="min-w-0 flex-1 break-words">{c.nome}</span>
                {c.agencia ? <span className="shrink-0 text-xs text-muted-foreground">{c.agencia}</span> : null}
                {atual === c.id && <Check aria-hidden="true" />}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
