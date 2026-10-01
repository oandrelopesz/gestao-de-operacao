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
import { combinaBusca, pontuarBusca } from "@/lib/buscaTexto";
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
  disabled?: boolean;
  className?: string;
}

const VALOR_VAZIO = "__vazio__";
const valorCliente = (id: string) => `c:${id}`;
const valorExtra = (v: string) => `x:${v}`;

// O cmdk chama esta função com o `value` do item, o texto digitado e as `keywords` do item (nome e agência).
// Casa sem acento e sem maiúscula; achar pelo nome vale mais que achar só pela agência.
function filtrar(_valor: string, busca: string, palavras: string[] = []): number {
  const [nome = "", agencia = ""] = palavras;
  const nota = pontuarBusca(nome, busca);
  if (nota > 0) return nota;
  return agencia && combinaBusca(`${nome} ${agencia}`, busca) ? 0.25 : 0;
}

/**
 * Seletor de cliente com busca: no lugar do Select comum, o usuário pode digitar parte do nome (ou da agência)
 * para achar o cliente, sem acento e sem diferença de maiúscula. Popover + Command, funciona dentro de
 * Dialog/Sheet e no teclado (setas, Enter, Esc).
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
  disabled,
  className,
}: ClienteSelectProps) {
  const [open, setOpen] = useState(false);

  // A lista só é ordenada a partir da primeira abertura (e fica assim durante a animação de fechar): telas com
  // vários seletores (ex.: um por linha) não ordenam todos os clientes sem ninguém abrir.
  const jaAbriu = useRef(false);
  if (open) jaAbriu.current = true;
  const clientesOrdenados = useMemo(
    () => (jaAbriu.current ? [...clientes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientes, open]
  );

  const atual = value || null;
  const extraAtual = atual ? extras?.find((e) => e.value === atual) : undefined;
  const clienteAtual = atual && !extraAtual ? clientes.find((c) => c.id === atual) : undefined;
  const textoVazio = atual === null ? opcaoVazia : undefined;
  const textoBotao = extraAtual?.label ?? clienteAtual?.nome ?? textoVazio ?? placeholder;
  const mostraPlaceholder = !extraAtual && !clienteAtual && textoVazio === undefined;

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
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
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
        <Command filter={filtrar} label="Buscar cliente" loop>
          <CommandInput placeholder="Buscar cliente…" />
          <CommandList label="Clientes">
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandGroup>
              {opcaoVazia !== undefined && (
                <CommandItem value={VALOR_VAZIO} keywords={[opcaoVazia]} onSelect={() => escolher(null)}>
                  <span className="flex-1 truncate">{opcaoVazia}</span>
                  {atual === null && <Check aria-hidden="true" />}
                </CommandItem>
              )}
              {extras?.map((e) => (
                <CommandItem key={e.value} value={valorExtra(e.value)} keywords={[e.label]} onSelect={() => escolher(e.value)}>
                  <span className="flex-1 truncate">{e.label}</span>
                  {atual === e.value && <Check aria-hidden="true" />}
                </CommandItem>
              ))}
              {clientesOrdenados.map((c) => (
                <CommandItem
                  key={c.id}
                  value={valorCliente(c.id)}
                  keywords={c.agencia ? [c.nome, c.agencia] : [c.nome]}
                  onSelect={() => escolher(c.id)}
                >
                  <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                  {c.agencia ? <span className="shrink-0 text-xs text-muted-foreground">{c.agencia}</span> : null}
                  {atual === c.id && <Check aria-hidden="true" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
