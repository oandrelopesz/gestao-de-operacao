// Tabela do Banco de leads: colunas visíveis da aba (ou as comuns em "Todas"), nome fixo à esquerda, edição na
// célula, cores da planilha (verde = no CRM, vermelho = inválido) e seleção em massa. Spec §8.2.
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  colunasVisiveis,
  compararTexto,
  ehNao,
  ehSim,
  ehValido,
  linkDoTexto,
  linkInstagram,
  NAO,
  nomeDoLead,
  SIM,
  valorDoPapel,
  type AbaBanco,
  type LeadBanco,
  type Papel,
} from "@/lib/bancoLeads";
import { linkWhatsapp } from "@/lib/crmWhatsapp";
import { cn } from "@/lib/utils";

const POR_VEZ = 200;

interface ColunaTabela {
  chave: string;
  titulo: string;
  papel: Papel | null;
  valor: (l: LeadBanco) => string;
  editavel: boolean;
}

function colunasDaTabela(aba: AbaBanco | null, abasPorId: Map<string, AbaBanco>): ColunaTabela[] {
  if (aba) {
    return colunasVisiveis(aba)
      .filter((c) => c.papel !== "nome")
      .map((c) => ({ chave: c.chave, titulo: c.titulo, papel: c.papel, valor: (l) => l.dados[c.chave] ?? "", editavel: true }));
  }
  const de = (l: LeadBanco) => abasPorId.get(l.aba_id);
  return [
    { chave: "_empresa", titulo: "Empresa", papel: "empresa", valor: (l) => valorDoPapel(l, de(l), "empresa"), editavel: false },
    { chave: "_telefone", titulo: "Telefone", papel: "telefone", valor: (l) => valorDoPapel(l, de(l), "telefone"), editavel: false },
    { chave: "_instagram", titulo: "Instagram", papel: "instagram", valor: (l) => valorDoPapel(l, de(l), "instagram"), editavel: false },
    { chave: "_aba", titulo: "Aba", papel: null, valor: (l) => de(l)?.nome ?? "", editavel: false },
    { chave: "_valido", titulo: "Lead válido", papel: null, valor: (l) => (ehValido(l, de(l)) ? SIM : NAO), editavel: false },
    { chave: "_crm", titulo: "No CRM", papel: null, valor: (l) => (l.lead_crm_id ? SIM : NAO), editavel: false },
  ];
}

/** Célula de texto: clique para editar; Enter salva, Esc cancela, sair do campo salva. */
function CelulaEditavel({ valor, onSalvar }: { valor: string; onSalvar: (v: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  useEffect(() => {
    if (!editando) setTexto(valor);
  }, [valor, editando]);
  if (editando) {
    return (
      <input
        autoFocus
        aria-label="Editar valor"
        className="h-7 w-full min-w-[9rem] rounded border bg-background px-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setTexto(valor);
            setEditando(false);
          }
        }}
        onBlur={() => {
          setEditando(false);
          if (texto.trim() !== valor.trim()) onSalvar(texto);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      title={valor || "Clique para preencher"}
      className="-mx-1 block min-h-6 w-full max-w-[16rem] truncate rounded px-1 text-left hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {valor || <span className="text-muted-foreground/40">—</span>}
    </button>
  );
}

function SimNao({ valor, rotulo, onMudar }: { valor: string; rotulo: string; onMudar: (v: string) => void }) {
  const conhecido = ehSim(valor) || ehNao(valor);
  const atual = ehSim(valor) ? SIM : ehNao(valor) ? NAO : valor;
  return (
    <select
      aria-label={rotulo}
      value={atual}
      onChange={(e) => onMudar(e.target.value)}
      className={cn(
        "h-7 rounded-md border bg-background px-1.5 text-xs font-medium",
        ehSim(valor) && "text-emerald-700 dark:text-emerald-400",
        ehNao(valor) && "text-rose-700 dark:text-rose-400",
      )}
    >
      {!conhecido && <option value={valor}>{valor || "—"}</option>}
      <option value={SIM}>Sim</option>
      <option value={NAO}>Não</option>
    </select>
  );
}

function Selo({ sim }: { sim: boolean }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", sim ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
      {sim ? "Sim" : "Não"}
    </span>
  );
}

function Celula({ coluna, lead, onEditar }: { coluna: ColunaTabela; lead: LeadBanco; onEditar: (l: LeadBanco, chave: string, v: string) => void }) {
  const v = coluna.valor(lead);
  if (coluna.chave === "_valido" || coluna.chave === "_crm") return <Selo sim={v === SIM} />;
  if (coluna.editavel && (coluna.papel === "valido" || coluna.papel === "primeira_msg")) {
    return <SimNao valor={v} rotulo={coluna.titulo} onMudar={(x) => onEditar(lead, coluna.chave, x)} />;
  }
  const link =
    coluna.papel === "telefone" ? linkWhatsapp(v)
    : coluna.papel === "instagram" ? linkInstagram(v)
    : coluna.papel === "link_instagram" || coluna.papel === "site" ? linkDoTexto(v)
    : null;
  const Icone = coluna.papel === "telefone" ? MessageCircle : ExternalLink;
  return (
    <div className="flex items-center gap-1">
      {coluna.editavel ? (
        <CelulaEditavel valor={v} onSalvar={(x) => onEditar(lead, coluna.chave, x)} />
      ) : (
        <span className="block max-w-[16rem] truncate" title={v}>{v || <span className="text-muted-foreground/40">—</span>}</span>
      )}
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          title={coluna.papel === "telefone" ? "Abrir no WhatsApp" : "Abrir link"}
          aria-label={coluna.papel === "telefone" ? "Abrir no WhatsApp" : "Abrir link"}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icone size={13} />
        </a>
      )}
    </div>
  );
}

const fundoDaLinha = (noCrm: boolean, valido: boolean) =>
  noCrm ? "bg-emerald-50 dark:bg-emerald-950/40" : !valido ? "bg-rose-50 dark:bg-rose-950/40" : "bg-card";

export function BancoTabela({
  aba,
  abasPorId,
  leads,
  selecionados,
  onSelecionar,
  onAbrir,
  onEditar,
}: {
  aba: AbaBanco | null;
  abasPorId: Map<string, AbaBanco>;
  leads: LeadBanco[];
  selecionados: Set<string>;
  onSelecionar: Dispatch<SetStateAction<Set<string>>>;
  onAbrir: (id: string) => void;
  onEditar: (l: LeadBanco, chave: string, v: string) => void;
}) {
  const colunas = useMemo(() => colunasDaTabela(aba, abasPorId), [aba, abasPorId]);
  const [ordem, setOrdem] = useState<{ chave: string | null; direcao: "asc" | "desc" }>({ chave: null, direcao: "asc" });
  const [limite, setLimite] = useState(POR_VEZ);
  useEffect(() => {
    setOrdem({ chave: null, direcao: "asc" });
    setLimite(POR_VEZ);
  }, [aba?.id]);

  const ordenados = useMemo(() => {
    if (!ordem.chave) {
      if (aba) return [...leads].sort((a, b) => a.posicao - b.posicao);
      return leads;
    }
    const col = ordem.chave === "_nome" ? null : colunas.find((c) => c.chave === ordem.chave);
    const valor = (l: LeadBanco) => (col ? col.valor(l) : nomeDoLead(l, abasPorId.get(l.aba_id)));
    const r = [...leads].sort((a, b) => compararTexto(valor(a), valor(b)));
    return ordem.direcao === "asc" ? r : r.reverse();
  }, [leads, ordem, colunas, aba, abasPorId]);

  const visiveis = ordenados.slice(0, limite);
  const todosVisiveis = visiveis.length > 0 && visiveis.every((l) => selecionados.has(l.id));

  const ordenarPor = (chave: string) =>
    setOrdem((o) => (o.chave === chave ? { chave, direcao: o.direcao === "asc" ? "desc" : "asc" } : { chave, direcao: "asc" }));
  const marcar = (id: string, marcado: boolean) =>
    onSelecionar((prev) => {
      const s = new Set(prev);
      if (marcado) s.add(id);
      else s.delete(id);
      return s;
    });
  const marcarVisiveis = (marcado: boolean) =>
    onSelecionar((prev) => {
      const s = new Set(prev);
      for (const l of visiveis) {
        if (marcado) s.add(l.id);
        else s.delete(l.id);
      }
      return s;
    });

  const Cabecalho = ({ chave, titulo, fixo }: { chave: string; titulo: string; fixo?: boolean }) => {
    const ativo = ordem.chave === chave;
    const Seta = !ativo ? ArrowUpDown : ordem.direcao === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead
        aria-sort={ativo ? (ordem.direcao === "asc" ? "ascending" : "descending") : "none"}
        className={cn(
          "sticky top-0 whitespace-nowrap bg-card shadow-[inset_0_-1px_0_var(--color-border)]",
          fixo ? "left-10 z-20" : "z-10",
        )}
      >
        <button
          type="button"
          onClick={() => ordenarPor(chave)}
          title="Clique para ordenar"
          className={cn("inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring", ativo && "text-foreground")}
        >
          {titulo}
          <Seta size={12} className={cn("shrink-0", !ativo && "opacity-40")} aria-hidden />
        </button>
      </TableHead>
    );
  };

  return (
    <div className="min-w-0 space-y-2">
      <div className="max-h-[max(20rem,calc(100dvh-19rem))] w-full overflow-auto rounded-md border bg-card">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 top-0 z-20 w-10 bg-card shadow-[inset_0_-1px_0_var(--color-border)]">
                <Checkbox checked={todosVisiveis} onCheckedChange={(v) => marcarVisiveis(v === true)} disabled={visiveis.length === 0} aria-label="Selecionar todos os leads mostrados" />
              </TableHead>
              <Cabecalho chave="_nome" titulo="Lead" fixo />
              {colunas.map((c) => <Cabecalho key={c.chave} chave={c.chave} titulo={c.titulo} />)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colunas.length + 2} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum lead neste filtro.
                </TableCell>
              </TableRow>
            ) : (
              visiveis.map((l) => {
                const abaDoLead = abasPorId.get(l.aba_id);
                const fundo = fundoDaLinha(!!l.lead_crm_id, ehValido(l, abaDoLead));
                const marcado = selecionados.has(l.id);
                const nome = nomeDoLead(l, abaDoLead);
                return (
                  <TableRow key={l.id} data-state={marcado ? "selected" : undefined} className={cn("whitespace-nowrap", fundo)}>
                    <TableCell className={cn("sticky left-0 z-[1] w-10", fundo)}>
                      <Checkbox checked={marcado} onCheckedChange={(v) => marcar(l.id, v === true)} aria-label={`Selecionar ${nome}`} />
                    </TableCell>
                    <TableCell className={cn("sticky left-10 z-[1] shadow-[inset_-1px_0_0_var(--color-border)]", fundo)}>
                      <button
                        type="button"
                        onClick={() => onAbrir(l.id)}
                        title={`Abrir a ficha de ${nome}`}
                        className="block max-w-[14rem] truncate text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                      >
                        {nome}
                      </button>
                    </TableCell>
                    {colunas.map((c) => (
                      <TableCell key={c.chave} className="py-1.5">
                        <Celula coluna={c} lead={l} onEditar={onEditar} />
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </table>
      </div>
      {ordenados.length > limite && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setLimite((n) => n + POR_VEZ)}>
            Mostrar mais ({ordenados.length - limite} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}
