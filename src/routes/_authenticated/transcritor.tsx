import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AudioLines, Plus, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCachedState } from "@/lib/pageCache";
import { statusDoDrive } from "@/lib/googleDrive";
import { idTokenEmCache, loginSilencioso } from "@/lib/googleAuth";
import { BotaoGoogleLogin } from "@/components/swipe/BotaoGoogleLogin";
import { FilaComSelecao, type LinhaDaFila } from "@/components/fila/FilaComSelecao";
import { TranscreverDialog } from "@/components/transcritor/TranscreverDialog";
import { ListaTranscricoes } from "@/components/transcritor/ListaTranscricoes";
import {
  SemLoginGoogle, URL_TRANSCRITOR, criarDeArquivo, criarDeLinks, enviarArquivo, excluir, fetchTranscricoes, moverPara, pausar, reordenar, retomar,
  traduzErroTranscritor, type Transcricao,
} from "@/lib/transcritor";
import { formatarDuracao, nomeExibido, rotuloPlataforma, separarTranscricoes } from "@/lib/transcritorTexto";

export const Route = createFileRoute("/_authenticated/transcritor")({ component: TranscritorPage });

interface Envio { progresso: number; erro: string | null; controle: AbortController; arquivo: File }

function TranscritorPage() {
  const [lista, setLista] = useCachedState<Transcricao[] | null>("transcritor.lista", null);
  const [erro, setErro] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [envios, setEnvios] = useState<Record<string, Envio>>({});
  const [servidorOk, setServidorOk] = useState<boolean | null>(null);
  // Enviar arquivos exige o login do Google (o servidor só aceita a sua conta); links não
  const [clientId, setClientId] = useState<string | null>(null);
  const [logado, setLogado] = useState(() => !!idTokenEmCache());
  const enviosRef = useRef(envios);
  enviosRef.current = envios;

  const carregar = useCallback(async () => {
    try {
      setLista(await fetchTranscricoes());
      setErro(null);
    } catch (e) {
      setErro(traduzErroTranscritor(e));
    }
  }, [setLista]);

  useEffect(() => { carregar(); }, [carregar]);

  // O servidor da VPS está de pé? (só um aviso; a fila fica no banco de qualquer jeito)
  useEffect(() => {
    fetch(`${URL_TRANSCRITOR}/health`).then((r) => setServidorOk(r.ok)).catch(() => setServidorOk(false));
  }, []);

  useEffect(() => {
    statusDoDrive()
      .then(async (st) => {
        if (!st.client_id) return;
        setClientId(st.client_id);
        if (await loginSilencioso(st.client_id)) setLogado(true);
      })
      .catch(() => {});
  }, []);

  const partes = useMemo(() => separarTranscricoes(lista ?? []), [lista]);
  const temFila = partes.andamento.length + partes.aguardando.length > 0;

  // Enquanto houver algo na fila: atualiza a cada 5 s (com a aba visível)
  useEffect(() => {
    if (!temFila) return;
    const t = window.setInterval(() => { if (document.visibilityState === "visible") carregar(); }, 5000);
    return () => window.clearInterval(t);
  }, [temFila, carregar]);

  // Fechar a aba no meio do envio perde o arquivo: avisa
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (Object.values(enviosRef.current).some((x) => !x.erro && x.progresso < 1)) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, []);

  const iniciarEnvio = (id: string, arquivo: File) => {
    const controle = new AbortController();
    setEnvios((prev) => ({ ...prev, [id]: { progresso: 0, erro: null, controle, arquivo } }));
    enviarArquivo(id, arquivo, {
      signal: controle.signal,
      onProgresso: (p) => setEnvios((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], progresso: p } } : prev)),
    })
      .then(() => {
        setEnvios((prev) => { const { [id]: _feito, ...resto } = prev; return resto; });
        carregar();
      })
      .catch((e) => {
        if (controle.signal.aborted) return;
        if (e instanceof SemLoginGoogle) setLogado(false);
        const msg = traduzErroTranscritor(e);
        setEnvios((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], erro: msg } } : prev));
        if (!(e instanceof SemLoginGoogle)) toast.error(`Envio de "${arquivo.name}" parou: ${msg}`);
      });
  };

  // Entrou com o Google: os envios que pararam continuam de onde o servidor estava
  const aoEntrar = () => {
    setLogado(true);
    for (const [id, envio] of Object.entries(enviosRef.current)) if (envio.erro) iniciarEnvio(id, envio.arquivo);
  };

  const adicionarLinks = async (itens: { link: string; nome?: string }[]) => {
    try {
      await criarDeLinks(itens);
      toast.success(itens.length === 1 ? "Na fila para transcrever" : `${itens.length} links na fila`);
    } catch (e) {
      toast.error(traduzErroTranscritor(e));
      throw e;
    } finally {
      await carregar();
    }
  };

  const adicionarArquivos = async (itens: { arquivo: File; nome?: string }[]) => {
    try {
      for (const i of itens) {
        const id = await criarDeArquivo(i.arquivo, i.nome);
        iniciarEnvio(id, i.arquivo);
      }
      toast.success(itens.length === 1 ? "Enviando o arquivo…" : `Enviando ${itens.length} arquivos…`);
    } catch (e) {
      toast.error(traduzErroTranscritor(e));
      throw e;
    } finally {
      await carregar();
    }
  };

  const linha = (t: Transcricao): LinhaDaFila => {
    const envio = envios[t.id];
    const sub = [rotuloPlataforma(t), t.duracao_seg != null ? formatarDuracao(t.duracao_seg) : ""].filter(Boolean).join(" · ");
    const base = { id: t.id, titulo: nomeExibido(t), subtitulo: sub };
    if (t.status === "enviando") {
      if (envio?.erro && !logado) return { ...base, etapa: "Aguardando você entrar com o Google (botão acima) — o envio continua sozinho", progresso: envio.progresso, semPausa: true };
      if (envio?.erro) return { ...base, etapa: `Envio parou (${envio.erro}) — cancele e envie de novo`, progresso: envio.progresso, semPausa: true };
      if (!envio) return { ...base, etapa: "Envio interrompido (a página foi recarregada) — cancele e envie de novo", progresso: null, semPausa: true };
      return { ...base, etapa: `Enviando ${Math.round(envio.progresso * 100)}%`, progresso: envio.progresso, semPausa: true };
    }
    if (t.status === "baixando") return { ...base, etapa: t.origem === "link" ? "Baixando o link" : "Preparando o áudio", progresso: null };
    if (t.status === "transcrevendo") return { ...base, etapa: `Transcrevendo ${Math.round((t.progresso || 0) * 100)}%`, progresso: t.progresso || 0 };
    return { ...base, subtitulo: t.erro ? `${sub} · última tentativa: ${t.erro}` : sub };
  };

  const cancelar = async (ids: string[]) => {
    for (const id of ids) enviosRef.current[id]?.controle.abort();
    setEnvios((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.includes(id))));
    await excluir(ids);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <AudioLines size={20} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Transcritor</h1>
            <p className="text-sm text-muted-foreground">Links e arquivos de áudio/vídeo viram texto. Ficam 3 dias (ou o prazo que você escolher) e depois somem de vez.</p>
          </div>
        </div>
        <Button className="gap-2" onClick={() => setDialogo(true)}><Plus size={16} /> Transcrever</Button>
      </div>

      {servidorOk === false && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <ServerCrash size={18} className="shrink-0 text-amber-500" />
            O servidor de transcrição não respondeu agora. Os pedidos ficam na fila e começam assim que ele voltar.
          </CardContent>
        </Card>
      )}

      {!logado && clientId && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span className="text-muted-foreground">Para enviar <b className="text-foreground">arquivos</b>, entre com a sua conta Google (links funcionam sem isso).</span>
            <BotaoGoogleLogin clientId={clientId} onEntrou={aoEntrar} />
          </CardContent>
        </Card>
      )}

      {erro && <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{erro}</CardContent></Card>}

      {lista === null && !erro ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : (
        <>
          <FilaComSelecao
            titulo="Fila de transcrição"
            icone={<AudioLines size={16} className="text-primary" />}
            nomeItem={{ singular: "transcrição", plural: "transcrições", feminino: true }}
            andamento={partes.andamento.map(linha)}
            aguardando={partes.aguardando.map(linha)}
            pausados={partes.pausadas.map(linha)}
            onReordenar={(ids) => reordenar(partes.aguardando, ids)}
            onMover={(ids, destino) => moverPara(partes.aguardando, ids, destino)}
            onPausar={pausar}
            onRetomar={retomar}
            onCancelar={cancelar}
            onErro={traduzErroTranscritor}
            onMudou={carregar}
          />

          <ListaTranscricoes concluidas={partes.concluidas} onMudou={carregar} />

          {lista && lista.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><AudioLines size={26} /></span>
                <p className="text-base font-semibold">Nenhuma transcrição ainda</p>
                <p className="max-w-md text-sm text-muted-foreground">Cole um link do Instagram, TikTok, YouTube ou de um anúncio, ou envie um áudio/vídeo. Termos em inglês e de marketing são reconhecidos com o glossário do Admin.</p>
                <Button className="mt-1 gap-2" onClick={() => setDialogo(true)}><Plus size={16} /> Transcrever</Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <TranscreverDialog aberto={dialogo} onClose={() => setDialogo(false)} onLinks={adicionarLinks} onArquivos={adicionarArquivos} />
    </div>
  );
}
