import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Archive, ArrowLeft, ChevronRight, Download, File, FileImage, Folder, FolderUp, Loader2, Pencil, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MensagemBusca } from "@/components/MensagemBusca";
import { useBusca } from "@/lib/useBusca";
import { cn } from "@/lib/utils";
import {
  apagarCentral, baixarCentral, baixarPastaZip, enviarCentral, fetchPastas, listarCentral, renomearCentral, urlMiniatura,
} from "@/lib/central";
import { doArrastar, dosArquivosDaPasta, type ArquivoComPasta } from "@/lib/centralArrastar";
import {
  arquivosDaPasta, conteudoDaPasta, contarPorCliente, dataDoCaminho, extensao, motivoRecusa, nomeOriginal, separarExtensao,
  tipoArquivo,
} from "@/lib/centralRegras";

const msg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");

/** Carrega uma vez ao montar; `recarregar` busca de novo. */
function useCarga<T>(fn: () => Promise<T>) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const recarregar = useCallback(async () => {
    try {
      setDados(await fn());
      setErro(null);
    } catch (e) {
      setErro(msg(e));
    }
  }, [fn]);
  useEffect(() => { void recarregar(); }, [recarregar]);
  return { dados, erro, recarregar };
}

/** Grade de pastas (clientes) com busca tolerante e contagem de arquivos. */
export function Pastas({ onAbrir }: { onAbrir: (id: string) => void }) {
  const [busca, setBusca] = useState("");
  const pastasQ = useCarga(fetchPastas);
  const listaQ = useCarga(listarCentral);
  const pastas = useMemo(() => pastasQ.dados ?? [], [pastasQ.dados]);
  const resultado = useBusca(pastas, busca, (p) => [p.nome]);
  const contagem = useMemo(() => contarPorCliente(listaQ.dados ?? []), [listaQ.dados]);
  const erro = pastasQ.erro || listaQ.erro;

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <MensagemBusca resultado={resultado} />
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {!pastasQ.dados && !pastasQ.erro && <Loader2 className="animate-spin text-muted-foreground" />}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {resultado.itens.map((p) => {
          const n = contagem[p.id] ?? 0;
          return (
            <button key={p.id} onClick={() => onAbrir(p.id)} className="text-left">
              <Card className="hover:bg-accent transition-colors h-full">
                <CardContent className="p-4 flex flex-col gap-2">
                  <Folder size={28} className="text-primary" />
                  <span className="font-medium truncate" title={p.nome}>{p.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {n === 0 ? "Vazia" : n === 1 ? "1 arquivo" : `${n} arquivos`}
                  </span>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Envio { nome: string; progresso: number }
const SIMULTANEOS = 4;

/** Pasta de um cliente (ou subpasta): envio de arquivos e pastas, subpastas clicáveis, arquivos com renomear e baixar. */
export function PastaAberta({
  clienteId, pasta, onIr, onVoltar,
}: { clienteId: string; pasta: string; onIr: (pasta: string) => void; onVoltar: () => void }) {
  const pastasQ = useCarga(fetchPastas);
  const listaQ = useCarga(listarCentral);
  const nomeCliente = pastasQ.dados?.find((p) => p.id === clienteId)?.nome ?? "Cliente";
  const todos = useMemo(() => listaQ.dados ?? [], [listaQ.dados]);
  const { pastas, arquivos } = useMemo(() => conteudoDaPasta(todos, clienteId, pasta), [todos, clienteId, pasta]);
  const [envios, setEnvios] = useState<Record<string, Envio>>({});
  const [lote, setLote] = useState<{ feitos: number; total: number } | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [apagar, setApagar] = useState<{ nome: string; caminhos: string[] } | null>(null);
  const [renomear, setRenomear] = useState<string | null>(null);
  const [zipando, setZipando] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const entradaPasta = useRef<HTMLInputElement>(null);
  const { recarregar } = listaQ;

  const enviar = useCallback(async (itens: ArquivoComPasta[]) => {
    const recusas: string[] = [];
    const validos = itens.filter(({ file }) => {
      const motivo = motivoRecusa(file.name, file.size);
      if (motivo) recusas.push(motivo);
      return !motivo;
    });
    if (recusas.length) toast.error(recusas.slice(0, 3).join(" ") + (recusas.length > 3 ? ` (e mais ${recusas.length - 3})` : ""));
    if (!validos.length) return;
    const id0 = Date.now();
    let feitos = 0;
    let proximo = 0;
    const falhas: string[] = [];
    setLote({ feitos: 0, total: validos.length });
    const trabalhador = async () => {
      while (proximo < validos.length) {
        const n = proximo++;
        const { file, pasta: sub } = validos[n];
        const id = `${id0}-${n}`;
        const destino = [pasta, sub].filter(Boolean).join("/");
        setEnvios((e) => ({ ...e, [id]: { nome: file.name, progresso: 0 } }));
        try {
          await enviarCentral(clienteId, file, destino, (p) => setEnvios((e) => ({ ...e, [id]: { nome: file.name, progresso: p } })));
        } catch (err) {
          falhas.push(`${file.name}: ${msg(err)}`);
        } finally {
          setEnvios((e) => { const resto = { ...e }; delete resto[id]; return resto; });
          setLote({ feitos: ++feitos, total: validos.length });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(SIMULTANEOS, validos.length) }, trabalhador));
    setLote(null);
    if (falhas.length) toast.error(falhas.slice(0, 3).join(" | ") + (falhas.length > 3 ? ` (e mais ${falhas.length - 3})` : ""));
    await recarregar();
  }, [clienteId, pasta, recarregar]);

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    void doArrastar(e.dataTransfer).then(enviar).catch((err) => toast.error(msg(err)));
  };

  const confirmarApagar = async () => {
    const a = apagar;
    setApagar(null);
    if (!a) return;
    try {
      await apagarCentral(a.caminhos);
      await recarregar();
    } catch (e) {
      toast.error(msg(e));
    }
  };

  const baixarZip = async (sub: string, nome: string) => {
    setZipando(sub);
    try {
      const falhas = await baixarPastaZip(todos, clienteId, sub, nome);
      if (falhas) toast.error(`${falhas} ${falhas === 1 ? "arquivo não veio" : "arquivos não vieram"} no .zip.`);
    } catch (e) {
      toast.error(msg(e));
    } finally {
      setZipando(null);
    }
  };

  const niveis = pasta ? pasta.split("/") : [];
  const nomeAtual = niveis.length ? niveis[niveis.length - 1] : nomeCliente;
  const total = arquivosDaPasta(todos, clienteId, pasta).length;

  return (
    <div
      className={cn("space-y-4 rounded-lg border-2 border-dashed border-transparent p-1 min-h-[50vh]", arrastando && "border-primary bg-primary/5")}
      onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false); }}
      onDrop={soltar}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={pasta ? () => onIr(niveis.slice(0, -1).join("/")) : onVoltar}>
          <ArrowLeft size={16} className="mr-1" />{pasta ? "Voltar" : "Todas as pastas"}
        </Button>
        <nav className="flex flex-wrap items-center gap-1 text-lg font-semibold min-w-0 flex-1">
          <button className="hover:underline truncate" onClick={() => onIr("")}>{nomeCliente}</button>
          {niveis.map((n, i) => (
            <span key={i} className="flex items-center gap-1 min-w-0">
              <ChevronRight size={16} className="text-muted-foreground shrink-0" />
              <button className="hover:underline truncate" onClick={() => onIr(niveis.slice(0, i + 1).join("/"))}>{n}</button>
            </span>
          ))}
        </nav>
        {total > 0 && (
          <Button variant="outline" size="sm" disabled={zipando !== null} onClick={() => baixarZip(pasta, nomeAtual)}>
            {zipando === pasta ? <Loader2 size={16} className="animate-spin mr-1" /> : <Archive size={16} className="mr-1" />}Baixar pasta (.zip)
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => entradaPasta.current?.click()}><FolderUp size={16} className="mr-1" />Enviar pasta</Button>
        <Button size="sm" onClick={() => entrada.current?.click()}><Upload size={16} className="mr-1" />Enviar arquivos</Button>
        <input
          ref={entrada} type="file" multiple className="hidden"
          onChange={(e) => { void enviar(Array.from(e.target.files ?? []).map((file) => ({ file, pasta: "" }))); e.target.value = ""; }}
        />
        <input
          ref={entradaPasta} type="file" multiple className="hidden"
          {...{ webkitdirectory: "" }}
          onChange={(e) => { void enviar(dosArquivosDaPasta(Array.from(e.target.files ?? []))); e.target.value = ""; }}
        />
      </div>

      {lote && (
        <div className="space-y-1">
          <p className="text-xs">Enviando {lote.feitos} de {lote.total}</p>
          <Progress value={Math.round((lote.feitos / lote.total) * 100)} />
        </div>
      )}
      {Object.entries(envios).map(([id, e]) => (
        <div key={id} className="space-y-1">
          <p className="text-xs truncate text-muted-foreground">{e.nome}</p>
          <Progress value={Math.round(e.progresso * 100)} />
        </div>
      ))}
      {listaQ.erro && <p className="text-sm text-destructive">{listaQ.erro}</p>}
      {!listaQ.dados && !listaQ.erro && <Loader2 className="animate-spin text-muted-foreground" />}
      {listaQ.dados && pastas.length === 0 && arquivos.length === 0 && (
        <p className="text-sm text-muted-foreground">Nada aqui ainda. Arraste arquivos ou pastas inteiras para cá, ou clique em Enviar.</p>
      )}

      {pastas.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {pastas.map((p) => (
            <Card key={p.caminho} className="hover:bg-accent transition-colors">
              <CardContent className="p-4 flex flex-col gap-2">
                <button className="text-left flex flex-col gap-2" onClick={() => onIr(p.caminho)}>
                  <Folder size={28} className="text-primary" />
                  <span className="font-medium truncate" title={p.nome}>{p.nome}</span>
                  <span className="text-xs text-muted-foreground">{p.total === 1 ? "1 arquivo" : `${p.total} arquivos`}</span>
                </button>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="flex-1 px-2" disabled={zipando !== null} onClick={() => baixarZip(p.caminho, p.nome)}>
                    {zipando === p.caminho ? <Loader2 size={14} className="animate-spin mr-1" /> : <Archive size={14} className="mr-1" />}.zip
                  </Button>
                  <Button
                    variant="outline" size="sm" className="px-2" aria-label={`Apagar a pasta ${p.nome}`}
                    onClick={() => setApagar({ nome: `a pasta ${p.nome} e os ${p.total} arquivos dentro dela`, caminhos: arquivosDaPasta(todos, clienteId, p.caminho) })}
                  ><Trash2 size={14} /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {arquivos.map((c) => (
          <CartaoArquivo
            key={c} caminho={c} onRenomear={() => setRenomear(c)}
            onApagar={() => setApagar({ nome: nomeOriginal(c), caminhos: [c] })}
          />
        ))}
      </div>

      <AlertDialog open={!!apagar} onOpenChange={(o) => !o && setApagar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar</AlertDialogTitle>
            <AlertDialogDescription>Apagar {apagar?.nome}? Não dá para desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarApagar}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RenomearDialogo caminho={renomear} existentes={todos} onFechar={() => setRenomear(null)} onFeito={recarregar} />
    </div>
  );
}

/** Troca só o nome; a extensão (o formato) aparece ao lado e não muda. */
function RenomearDialogo({
  caminho, existentes, onFechar, onFeito,
}: { caminho: string | null; existentes: string[]; onFechar: () => void; onFeito: () => Promise<void> }) {
  const [base, ext] = caminho ? separarExtensao(nomeOriginal(caminho)) : ["", ""];
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setNome(base); }, [caminho, base]);

  const salvar = async () => {
    if (!caminho || !nome.trim()) return;
    setSalvando(true);
    try {
      await renomearCentral(caminho, nome, existentes);
      onFechar();
      await onFeito();
    } catch (e) {
      toast.error(msg(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!caminho} onOpenChange={(o) => !o && !salvando && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Renomear arquivo</DialogTitle></DialogHeader>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
          <Input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
          {ext && <span className="text-sm text-muted-foreground shrink-0">{ext}</span>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !nome.trim()}>
            {salvando && <Loader2 size={14} className="animate-spin mr-1" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CartaoArquivo({ caminho, onApagar, onRenomear }: { caminho: string; onApagar: () => void; onRenomear: () => void }) {
  const nome = nomeOriginal(caminho);
  const data = dataDoCaminho(caminho);
  const [falhou, setFalhou] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const comImagem = tipoArquivo(nome) === "imagem" && !falhou;

  const baixar = async () => {
    setBaixando(true);
    try { await baixarCentral(caminho); } catch (e) { toast.error(msg(e)); } finally { setBaixando(false); }
  };

  return (
    <Card className="overflow-hidden">
      <div className="aspect-square bg-muted flex items-center justify-center">
        {comImagem ? (
          <img src={urlMiniatura(caminho)} alt={nome} loading="lazy" onError={() => setFalhou(true)} className="w-full h-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            {tipoArquivo(nome) === "outro" ? <File size={32} /> : <FileImage size={32} />}
            <span className="text-xs font-semibold uppercase">{extensao(nome)}</span>
          </div>
        )}
      </div>
      <CardContent className="p-2 space-y-1">
        <p className="text-sm truncate" title={nome}>{nome}</p>
        <p className="text-xs text-muted-foreground">{data ? data.toLocaleDateString("pt-BR") : ""}</p>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="flex-1 px-2" disabled={baixando} onClick={baixar}>
            {baixando ? <Loader2 size={14} className="animate-spin mr-1" /> : <Download size={14} className="mr-1" />}Baixar
          </Button>
          <Button variant="outline" size="sm" className="px-2" aria-label="Renomear" onClick={onRenomear}><Pencil size={14} /></Button>
          <Button variant="outline" size="sm" className="px-2" aria-label="Apagar" onClick={onApagar}><Trash2 size={14} /></Button>
        </div>
      </CardContent>
    </Card>
  );
}
