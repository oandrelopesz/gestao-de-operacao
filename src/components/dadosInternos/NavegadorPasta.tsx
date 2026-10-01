// Uma pasta do Drive dentro da aba Dados internos: trilha, busca, lista com selo "Novo" e ações por item.
// Só leitura. Recarrega quando chega aviso novo do formulário desta sub-aba.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCheck, ChevronRight, Download, ExternalLink, Eye, Folder, FolderArchive, Home, Loader2, MoreVertical, RefreshCw, Search, Sheet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconeArquivo } from "@/components/pdfs/IconeArquivo";
import { GaleriaFotos } from "@/components/dadosInternos/GaleriaFotos";
import { cn } from "@/lib/utils";
import {
  MIME_DOC, MIME_PASTA, MIME_PLANILHA, ehImagem, ehPasta, formatarDataHora, formatosDeDownload, linkNoGoogle, novosNaLista,
  ordenarItens, rotuloDoItem, visivel, type AvisoFormulario, type Formulario, type ItemDrive,
} from "@/lib/dadosInternos";
import { DriveEscopoError, listarPasta, salvarItem, trilhaAte } from "@/lib/driveLeitura";
import { useBusca } from "@/lib/useBusca";
import { MensagemBusca } from "@/components/MensagemBusca";

export interface NavegadorPastaProps {
  formulario: Formulario;
  pastaId: string;
  /** Avisos não vistos deste formulário */
  avisos: AvisoFormulario[];
  onAbrirPasta: (item: ItemDrive, avisoIds: string[]) => void;
  onAbrirArquivo: (item: ItemDrive, avisoIds: string[]) => void;
  onIrPara: (pastaId: string) => void;
  onMarcarTudo: () => void;
  onBaixarZip: (pasta: Pick<ItemDrive, "id" | "name">) => void;
  onSemPermissao: () => void;
}

/** Nome com extensão só para escolher o ícone (Docs e Planilhas não têm extensão). */
function nomeParaIcone(i: ItemDrive): string {
  if (i.mimeType === MIME_DOC) return `${i.name}.docx`;
  if (i.mimeType === MIME_PLANILHA) return `${i.name}.xlsx`;
  return i.name;
}

export function NavegadorPasta(p: NavegadorPastaProps) {
  const [itens, setItens] = useState<ItemDrive[] | null>(null);
  const [trilha, setTrilha] = useState<ItemDrive[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const temLista = useRef(false);
  const naRaiz = p.pastaId === p.formulario.pastaId;
  const { onSemPermissao } = p;
  // Evita que uma resposta antiga (pasta trocada no meio do caminho) sobrescreva a pasta atual
  const req = useRef(0);

  const carregar = useCallback(async () => {
    const n = ++req.current;
    setCarregando(true);
    try {
      const [lista, caminho] = await Promise.all([
        listarPasta(p.pastaId),
        naRaiz ? Promise.resolve([] as ItemDrive[]) : trilhaAte(p.pastaId, p.formulario.pastaId),
      ]);
      if (n !== req.current) return;
      setItens(ordenarItens(lista.filter(visivel)));
      setTrilha(caminho);
      setErro(null);
      temLista.current = true;
    } catch (e) {
      if (n !== req.current) return;
      if (e instanceof DriveEscopoError) { onSemPermissao(); return; }
      const msg = e instanceof Error ? e.message : "Não consegui ler o Drive";
      if (temLista.current) toast.error(msg, { action: { label: "Tentar de novo", onClick: () => void carregar() } });
      else setErro(msg);
    } finally {
      if (n === req.current) setCarregando(false);
    }
  }, [p.pastaId, p.formulario.pastaId, naRaiz, onSemPermissao]);

  useEffect(() => {
    temLista.current = false;
    setItens(null);
    setErro(null);
    setBusca("");
    void carregar();
  }, [carregar]);

  // Chegou aviso novo deste formulário com a sub-aba aberta: relista a pasta
  const conhecidos = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(p.avisos.map((a) => a.id));
    const antes = conhecidos.current;
    conhecidos.current = ids;
    if (antes && [...ids].some((id) => !antes.has(id))) void carregar();
  }, [p.avisos, carregar]);

  const novos = useMemo(() => novosNaLista(itens ?? [], p.avisos), [itens, p.avisos]);
  // Lista estável enquanto ainda não chegou (null): o hook só reindexa quando a lista muda
  const daPasta = useMemo(() => itens ?? [], [itens]);
  // Busca tolerante (sem acento, com erro de digitação) no título mostrado do item
  const resultadoBusca = useBusca(daPasta, busca, (i) => [rotuloDoItem(i, p.formulario.id).titulo], { deps: [p.formulario.id] });
  const visiveis = resultadoBusca.itens;

  // Pasta só de fotos e subpastas (a pasta "Fotos" do Catálogo e as de cada produto): vira galeria
  const galeria = !!itens && itens.some(ehImagem) && itens.every((i) => ehImagem(i) || ehPasta(i));

  const pastaAtual = naRaiz ? { id: p.formulario.pastaId, name: p.formulario.pastaNome } : trilha[trilha.length - 1];

  const baixar = async (item: ItemDrive, indice = 0) => {
    const formato = formatosDeDownload(item.mimeType)[indice];
    if (!formato) return;
    const id = toast.loading(`Baixando ${item.name}…`);
    try {
      await salvarItem(item, formato);
      toast.success("Download pronto", { id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui baixar", { id });
    }
  };

  const abrir = (item: ItemDrive) => {
    const avisoIds = novos.get(item.id) ?? [];
    if (ehPasta(item)) p.onAbrirPasta(item, avisoIds);
    else p.onAbrirArquivo(item, avisoIds);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Pastas" className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
          <button type="button" onClick={() => p.onIrPara(p.formulario.pastaId)} className={cn("flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-muted", naRaiz && "font-semibold")}>
            <Home size={14} /> {p.formulario.pastaNome}
          </button>
          {trilha.map((t, i) => (
            <span key={t.id} className="flex items-center gap-1">
              <ChevronRight size={14} className="text-muted-foreground" />
              <button type="button" onClick={() => p.onIrPara(t.id)} disabled={i === trilha.length - 1} className={cn("truncate rounded px-1.5 py-0.5 hover:bg-muted disabled:hover:bg-transparent", i === trilha.length - 1 && "font-semibold")}>
                {t.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="relative w-full sm:w-56">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome" className="h-8 pl-8 text-sm" />
        </div>
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void carregar()} disabled={carregando} title="Atualizar">
          <RefreshCw size={14} className={cn(carregando && "animate-spin")} />
        </Button>
        {pastaAtual && (
          <>
            <Button variant="ghost" size="sm" onClick={() => window.open(linkNoGoogle({ id: pastaAtual.id, mimeType: MIME_PASTA }), "_blank", "noopener")} title="Abrir no Google">
              <ExternalLink size={14} />
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => p.onBaixarZip(pastaAtual)}>
              <FolderArchive size={14} /> Baixar pasta (.zip)
            </Button>
          </>
        )}
        {naRaiz && p.avisos.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={p.onMarcarTudo}>
            <CheckCheck size={14} /> Marcar tudo como visto
          </Button>
        )}
      </div>

      {!erro && itens !== null && resultadoBusca.modo === "parecidos" && <MensagemBusca resultado={resultadoBusca} />}

      {erro ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm">
          <p className="text-destructive">{erro}</p>
          <Button variant="outline" onClick={() => void carregar()}>Tentar de novo</Button>
        </Card>
      ) : itens === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 size={18} className="animate-spin" /> Lendo o Drive…
        </div>
      ) : galeria && !busca ? (
        <GaleriaFotos key={p.pastaId} itens={itens} onBaixarZip={p.onBaixarZip} onAbrirPasta={(item) => abrir(item)} />
      ) : visiveis.length === 0 ? (
        <Card className="px-6 py-12 text-center text-sm text-muted-foreground">
          {resultadoBusca.modo === "nenhum" && daPasta.length > 0 ? <MensagemBusca resultado={resultadoBusca} /> : "Nenhuma resposta ainda."}
        </Card>
      ) : (
        <Card className="divide-y overflow-hidden">
          {visiveis.map((item) => {
            const { titulo, data } = rotuloDoItem(item, p.formulario.id);
            const novo = novos.has(item.id);
            const formatos = formatosDeDownload(item.mimeType);
            return (
              <div key={item.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40">
                <button type="button" onClick={() => abrir(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  {ehPasta(item)
                    ? <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600"><Folder size={18} /></span>
                    : <IconeArquivo nome={nomeParaIcone(item)} tamanho={30} />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{titulo}</span>
                      {novo && <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">Novo</span>}
                      {item.mimeType === MIME_PLANILHA && <Sheet size={13} className="shrink-0 text-emerald-600" aria-label="Planilha" />}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">{formatarDataHora(data)}</span>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Ações de ${titulo}`}><MoreVertical size={16} /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => abrir(item)}>
                      {ehPasta(item) ? <><Folder size={14} className="mr-2" /> Abrir</> : <><Eye size={14} className="mr-2" /> Ver</>}
                    </DropdownMenuItem>
                    {ehPasta(item) ? (
                      <DropdownMenuItem onClick={() => p.onBaixarZip(item)}><FolderArchive size={14} className="mr-2" /> Baixar pasta (.zip)</DropdownMenuItem>
                    ) : formatos.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Baixar</DropdownMenuLabel>
                        {formatos.map((f, i) => (
                          <DropdownMenuItem key={f.rotulo} onClick={() => void baixar(item, i)}><Download size={14} className="mr-2" /> {f.rotulo}</DropdownMenuItem>
                        ))}
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => window.open(linkNoGoogle(item), "_blank", "noopener")}>
                      <ExternalLink size={14} className="mr-2" /> Abrir no Google
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
