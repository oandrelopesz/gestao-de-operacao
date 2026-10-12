import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowLeft, Download, FileImage, Folder, Loader2, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MensagemBusca } from "@/components/MensagemBusca";
import { useBusca } from "@/lib/useBusca";
import { cn } from "@/lib/utils";
import { apagarCentral, baixarCentral, enviarCentral, fetchPastas, listarCentral, urlMiniatura } from "@/lib/central";
import {
  ACEITA, arquivosDoCliente, contarPorCliente, dataDoCaminho, extensao, motivoRecusa, nomeOriginal, tipoArquivo,
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

/** Pasta de um cliente: envio (botão ou arrastar) e grade de arquivos. */
export function PastaAberta({ clienteId, onVoltar }: { clienteId: string; onVoltar: () => void }) {
  const pastasQ = useCarga(fetchPastas);
  const listaQ = useCarga(listarCentral);
  const nomeCliente = pastasQ.dados?.find((p) => p.id === clienteId)?.nome ?? "Cliente";
  const arquivos = useMemo(() => arquivosDoCliente(listaQ.dados ?? [], clienteId), [listaQ.dados, clienteId]);
  const [envios, setEnvios] = useState<Record<string, Envio>>({});
  const [arrastando, setArrastando] = useState(false);
  const [apagar, setApagar] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const { recarregar } = listaQ;

  const enviar = useCallback(async (files: File[]) => {
    const validos = files.filter((f) => {
      const motivo = motivoRecusa(f.name, f.size);
      if (motivo) toast.error(motivo);
      return !motivo;
    });
    const lote = Date.now();
    await Promise.all(validos.map(async (f, i) => {
      const id = `${lote}-${i}`;
      setEnvios((e) => ({ ...e, [id]: { nome: f.name, progresso: 0 } }));
      try {
        await enviarCentral(clienteId, f, (p) => setEnvios((e) => ({ ...e, [id]: { nome: f.name, progresso: p } })));
      } catch (err) {
        toast.error(`${f.name}: ${msg(err)}`);
      } finally {
        setEnvios((e) => { const resto = { ...e }; delete resto[id]; return resto; });
      }
    }));
    if (validos.length) await recarregar();
  }, [clienteId, recarregar]);

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    void enviar(Array.from(e.dataTransfer.files));
  };

  const confirmarApagar = async () => {
    const c = apagar;
    setApagar(null);
    if (!c) return;
    try {
      await apagarCentral(c);
      await recarregar();
    } catch (e) {
      toast.error(msg(e));
    }
  };

  return (
    <div
      className={cn("space-y-4 rounded-lg border-2 border-dashed border-transparent p-1 min-h-[50vh]", arrastando && "border-primary bg-primary/5")}
      onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false); }}
      onDrop={soltar}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onVoltar}><ArrowLeft size={16} className="mr-1" />Todas as pastas</Button>
        <h2 className="text-lg font-semibold truncate flex-1 min-w-0">{nomeCliente}</h2>
        <Button size="sm" onClick={() => entrada.current?.click()}><Upload size={16} className="mr-1" />Enviar</Button>
        <input
          ref={entrada} type="file" multiple accept={ACEITA} className="hidden"
          onChange={(e) => { void enviar(Array.from(e.target.files ?? [])); e.target.value = ""; }}
        />
      </div>

      {Object.entries(envios).map(([id, e]) => (
        <div key={id} className="space-y-1">
          <p className="text-xs truncate">Enviando {e.nome}</p>
          <Progress value={Math.round(e.progresso * 100)} />
        </div>
      ))}
      {listaQ.erro && <p className="text-sm text-destructive">{listaQ.erro}</p>}
      {!listaQ.dados && !listaQ.erro && <Loader2 className="animate-spin text-muted-foreground" />}
      {listaQ.dados && arquivos.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum arquivo ainda. Arraste fotos e logos aqui ou clique em Enviar.</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {arquivos.map((c) => <CartaoArquivo key={c} caminho={c} onApagar={() => setApagar(c)} />)}
      </div>

      <AlertDialog open={!!apagar} onOpenChange={(o) => !o && setApagar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar arquivo</AlertDialogTitle>
            <AlertDialogDescription>Apagar {apagar && nomeOriginal(apagar)}? Não dá para desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarApagar}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CartaoArquivo({ caminho, onApagar }: { caminho: string; onApagar: () => void }) {
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
            <FileImage size={32} />
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
          <Button variant="outline" size="sm" className="px-2" aria-label="Apagar" onClick={onApagar}><Trash2 size={14} /></Button>
        </div>
      </CardContent>
    </Card>
  );
}
