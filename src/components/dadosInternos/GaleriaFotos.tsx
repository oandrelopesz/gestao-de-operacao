// Pasta de fotos do Catálogo: uma seção por produto (subpasta com 2+ fotos, ou foto solta "Produto.jpg"),
// miniaturas baixadas só quando aparecem na tela (4 por vez) e ampliação com setas e download.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FolderArchive, ImageOff, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ehImagem, ehPasta, formatosDeDownload, nomeDoProduto, type ItemDrive } from "@/lib/dadosInternos";
import { baixarOriginal, listarPasta, salvarItem } from "@/lib/driveLeitura";

// Fila compartilhada: no máximo 4 chamadas ao Drive ao mesmo tempo
const fila: Array<() => void> = [];
let ativos = 0;
function naFila<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const rodar = () => {
      ativos++;
      fn().then(resolve, reject).finally(() => {
        ativos--;
        fila.shift()?.();
      });
    };
    if (ativos < 4) rodar();
    else fila.push(rodar);
  });
}

interface Grupo {
  nome: string;
  /** Subpasta do produto (2+ fotos); null = foto solta na pasta */
  pasta: ItemDrive | null;
  fotos: ItemDrive[] | null;
}

const porNome = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR", { numeric: true });

export interface GaleriaFotosProps {
  itens: ItemDrive[];
  onBaixarZip: (pasta: Pick<ItemDrive, "id" | "name">) => void;
  onAbrirPasta: (item: ItemDrive) => void;
}

export function GaleriaFotos({ itens, onBaixarZip, onAbrirPasta }: GaleriaFotosProps) {
  const urls = useRef(new Map<string, Promise<string>>());
  const [subpastas, setSubpastas] = useState<Record<string, ItemDrive[] | "erro">>({});
  const [ampliada, setAmpliada] = useState<{ fotos: ItemDrive[]; indice: number } | null>(null);

  // Revoga as miniaturas ao sair da pasta
  useEffect(() => {
    const mapa = urls.current;
    return () => {
      for (const p of mapa.values()) void p.then((u) => URL.revokeObjectURL(u)).catch(() => {});
      mapa.clear();
    };
  }, []);

  const obterUrl = useCallback((item: ItemDrive): Promise<string> => {
    let p = urls.current.get(item.id);
    if (!p) {
      p = naFila(() => baixarOriginal(item.id)).then((b) => URL.createObjectURL(b));
      p.catch(() => urls.current.delete(item.id));
      urls.current.set(item.id, p);
    }
    return p;
  }, []);

  const pastas = useMemo(() => itens.filter(ehPasta), [itens]);
  useEffect(() => {
    let cancelado = false;
    for (const pasta of pastas) {
      naFila(() => listarPasta(pasta.id))
        .then((lista) => { if (!cancelado) setSubpastas((s) => ({ ...s, [pasta.id]: lista.filter(ehImagem).sort(porNome) })); })
        .catch(() => { if (!cancelado) setSubpastas((s) => ({ ...s, [pasta.id]: "erro" })); });
    }
    return () => { cancelado = true; };
  }, [pastas]);

  const grupos = useMemo<Grupo[]>(() => {
    const soltas = new Map<string, ItemDrive[]>();
    for (const f of itens.filter(ehImagem).sort(porNome)) {
      const nome = nomeDoProduto(f.name);
      soltas.set(nome, [...(soltas.get(nome) ?? []), f]);
    }
    const lista: Grupo[] = [...soltas].map(([nome, fotos]) => ({ nome, pasta: null, fotos }));
    for (const pasta of pastas) {
      const s = subpastas[pasta.id];
      lista.push({ nome: pasta.name, pasta, fotos: s === "erro" ? [] : s ?? null });
    }
    return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  }, [itens, pastas, subpastas]);

  const baixarFoto = async (foto: ItemDrive) => {
    try {
      await salvarItem(foto, formatosDeDownload(foto.mimeType)[0]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui baixar");
    }
  };

  return (
    <div className="space-y-4">
      {grupos.map((g) => (
        <Card key={g.pasta?.id ?? `solta-${g.nome}`} className="space-y-3 p-3">
          <div className="flex items-center gap-2">
            <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline disabled:hover:no-underline" disabled={!g.pasta} onClick={() => g.pasta && onAbrirPasta(g.pasta)}>
              {g.nome}
            </button>
            <span className="text-[11px] text-muted-foreground">{g.fotos ? `${g.fotos.length} foto${g.fotos.length === 1 ? "" : "s"}` : "…"}</span>
            {g.pasta ? (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => onBaixarZip(g.pasta!)}><FolderArchive size={14} /> .zip</Button>
            ) : g.fotos?.length === 1 ? (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void baixarFoto(g.fotos![0])}><Download size={14} /> Baixar</Button>
            ) : null}
          </div>
          {g.fotos === null ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Lendo as fotos…</div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
              {g.fotos.map((f, i) => (
                <Miniatura key={f.id} item={f} obterUrl={obterUrl} onClick={() => setAmpliada({ fotos: g.fotos!, indice: i })} />
              ))}
            </div>
          )}
        </Card>
      ))}
      <Ampliar estado={ampliada} obterUrl={obterUrl} onMudar={setAmpliada} onBaixar={(f) => void baixarFoto(f)} />
    </div>
  );
}

function Miniatura({ item, obterUrl, onClick }: { item: ItemDrive; obterUrl: (i: ItemDrive) => Promise<string>; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelado = false;
    const obs = new IntersectionObserver((entradas) => {
      if (!entradas.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      obterUrl(item).then((u) => { if (!cancelado) setUrl(u); }).catch(() => { if (!cancelado) setFalhou(true); });
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => { cancelado = true; obs.disconnect(); };
  }, [item, obterUrl]);
  return (
    <button ref={ref} type="button" onClick={onClick} title={item.name} className="relative aspect-square overflow-hidden rounded-md bg-muted">
      {url ? <img src={url} alt={item.name} className="h-full w-full object-cover" />
        : falhou ? <ImageOff size={18} className="absolute inset-0 m-auto text-muted-foreground" />
        : <Loader2 size={16} className="absolute inset-0 m-auto animate-spin text-muted-foreground" />}
    </button>
  );
}

function Ampliar({ estado, obterUrl, onMudar, onBaixar }: {
  estado: { fotos: ItemDrive[]; indice: number } | null;
  obterUrl: (i: ItemDrive) => Promise<string>;
  onMudar: (e: { fotos: ItemDrive[]; indice: number } | null) => void;
  onBaixar: (f: ItemDrive) => void;
}) {
  const foto = estado ? estado.fotos[estado.indice] : null;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!foto) return;
    let cancelado = false;
    obterUrl(foto).then((u) => { if (!cancelado) setUrl(u); }).catch(() => {});
    return () => { cancelado = true; };
  }, [foto, obterUrl]);
  const ir = (delta: number) => estado && onMudar({ ...estado, indice: (estado.indice + delta + estado.fotos.length) % estado.fotos.length });
  useEffect(() => {
    if (!estado) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "ArrowLeft") ir(-1); if (e.key === "ArrowRight") ir(1); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });
  return (
    <Dialog open={!!estado} onOpenChange={(o) => { if (!o) onMudar(null); }}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 p-0 sm:max-w-none [&>button:last-child]:hidden">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold">{foto?.name}</DialogTitle>
            <DialogDescription className="text-[11px]">{estado ? `${estado.indice + 1} de ${estado.fotos.length}` : ""}</DialogDescription>
          </div>
          {foto && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onBaixar(foto)}><Download size={14} /> Baixar</Button>}
          <Button size="sm" className="gap-1.5" onClick={() => onMudar(null)}><X size={14} /> Fechar</Button>
        </div>
        <div className="relative flex-1 bg-black/90">
          {url ? <img src={url} alt={foto?.name ?? ""} className="absolute inset-0 h-full w-full object-contain p-2" />
            : <Loader2 size={22} className="absolute inset-0 m-auto animate-spin text-white/70" />}
          {estado && estado.fotos.length > 1 && (
            <>
              <Button variant="secondary" size="icon" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full" onClick={() => ir(-1)} aria-label="Anterior"><ChevronLeft size={18} /></Button>
              <Button variant="secondary" size="icon" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full" onClick={() => ir(1)} aria-label="Próxima"><ChevronRight size={18} /></Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
