// Localização do post: busca pelo nome (se a Meta liberar), páginas das contas da BM, lugares já usados ou link/id colado.
import { useEffect, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buscarLocais, conferirLocal, fetchLocaisUsados, type ContaInstagram, type Lugar } from "@/lib/instagram";
import { refDaPagina } from "../../../supabase/functions/instagram/meta.ts";

const explicar = (e: unknown) => {
  const m = String((e as Error)?.message ?? e);
  return /Page Public|pages_read_engagement/.test(m)
    ? "A busca pelo nome ainda não foi liberada pela Meta para o app (falta pages_read_engagement no token ou a aprovação \"Page Public Metadata Access\"). Use as opções abaixo."
    : m;
};

function Lista({ titulo, itens, onEscolher }: { titulo: string; itens: Lugar[]; onEscolher: (l: Lugar) => void }) {
  if (!itens.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {itens.map((l) => (
        <button key={`${titulo}-${l.id}`} type="button" onClick={() => onEscolher(l)} className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
          <MapPin size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block truncate">{l.nome}</span>
            {l.endereco && <span className="block truncate text-xs text-muted-foreground">{l.endereco}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function EscolherLocal({ valor, onMudar, contas }: {
  valor: Lugar | null;
  onMudar: (l: Lugar | null) => void;
  contas: ContaInstagram[];
}) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Lugar[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [usados, setUsados] = useState<Lugar[]>([]);
  const [link, setLink] = useState("");
  const [conferindo, setConferindo] = useState(false);

  useEffect(() => { if (aberto) fetchLocaisUsados().then(setUsados).catch(() => {}); }, [aberto]);
  useEffect(() => {
    if (q.trim().length < 2) { setResultados([]); return; }
    const t = setTimeout(() => {
      setBuscando(true);
      buscarLocais(q).then((r) => { setResultados(r); setErro(r.length ? null : "Nenhum lugar com endereço encontrado com esse nome."); })
        .catch((e) => setErro(explicar(e))).finally(() => setBuscando(false));
    }, 450);
    return () => clearTimeout(t);
  }, [q]);

  const escolher = (l: Lugar) => { onMudar(l); setAberto(false); setErro(null); };
  const dasContas: Lugar[] = contas.filter((c) => c.pagina_tem_local && c.pagina_id).map((c) => ({ id: c.pagina_id as string, nome: c.nome, endereco: null }));

  async function usarLink() {
    const ref = refDaPagina(link);
    if (!ref) { setErro("Cole o link de uma página do Facebook (facebook.com/…) ou o número dela."); return; }
    setConferindo(true);
    try {
      const r = await conferirLocal(ref);
      if (!r.sem_conferir && !(r.lugar as Lugar & { tem_local?: boolean }).tem_local) {
        setErro("Esta página não tem endereço no mapa; o Instagram só aceita lugares com localização.");
      } else {
        escolher(r.lugar);
        setLink("");
      }
    } catch (e) {
      setErro(explicar(e));
    } finally {
      setConferindo(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="max-w-full gap-2">
            <MapPin size={14} /> <span className="truncate">{valor ? valor.nome : "Adicionar localização"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-[70vh] w-80 space-y-3 overflow-y-auto">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar lugar pelo nome" className="h-8 pl-8 text-sm" aria-label="Buscar lugar pelo nome" />
            {buscando && <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin" />}
          </div>
          {erro && <p className="text-xs text-amber-700 dark:text-amber-400">{erro}</p>}
          <Lista titulo="Resultados" itens={resultados} onEscolher={escolher} />
          <Lista titulo="Usados recentemente" itens={usados} onEscolher={escolher} />
          <Lista titulo="Páginas das suas contas" itens={dasContas} onEscolher={escolher} />
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Colar link ou id da página do lugar</p>
            <div className="flex gap-1">
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="facebook.com/…" className="h-8 text-sm" aria-label="Link ou id da página do lugar" />
              <Button type="button" size="sm" className="h-8" onClick={usarLink} disabled={conferindo || !link.trim()}>
                {conferindo ? <Loader2 size={14} className="animate-spin" /> : "Usar"}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {valor && (
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Tirar a localização" onClick={() => onMudar(null)}><X size={14} /></Button>
      )}
    </div>
  );
}
