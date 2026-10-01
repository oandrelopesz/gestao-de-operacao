import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, ExternalLink, Copy, Trash2, Upload, FolderOpen, ChevronDown, ChevronRight, Folder, Image as ImageIcon,
  Video, LayoutTemplate, Globe, FileText, GalleryHorizontal, Tag, AlertTriangle, RefreshCw, RotateCcw, Pause, Play, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useCachedState, hasCached } from "@/lib/pageCache";
import { CACHE_KEYS } from "@/lib/data";
import { toast } from "sonner";
import {
  CATEGORIAS, REDES, STATUS_META, categoriaMeta, redeLabel, fetchNichos, fetchItens, fetchSwipeConfig, excluirItem, erroAmigavel, temChave,
  fetchFila, pausarItem, retomarItem, tentarDeNovo,
  type SwipeItem, type SwipeNicho, type SwipeConfig, type SwipeCategoria, type SwipeJob,
} from "@/lib/swipe";
import { podeTentarDeNovo } from "@/lib/swipeFila";
import { useBusca } from "@/lib/useBusca";
import { MensagemBusca } from "@/components/MensagemBusca";
import { FilaDownloads } from "@/components/swipe/FilaDownloads";
import { statusDoDrive } from "@/lib/googleDrive";
import { loginSilencioso } from "@/lib/googleAuth";
import { SwipeAddDialog } from "@/components/swipe/SwipeAddDialog";
import { BotaoGoogleLogin } from "@/components/swipe/BotaoGoogleLogin";
import { ExcluirNichoDialog } from "@/components/swipe/ExcluirNichoDialog";

export const Route = createFileRoute("/_authenticated/swipe")({
  component: SwipePage,
});

const ICONE_CATEGORIA: Record<SwipeCategoria, React.ReactNode> = {
  oferta: <Tag size={12} />,
  video_organico: <Video size={12} />,
  video_anuncio: <Video size={12} />,
  anuncio_estatico: <ImageIcon size={12} />,
  post_estatico: <ImageIcon size={12} />,
  carrossel: <GalleryHorizontal size={12} />,
  landing_page: <LayoutTemplate size={12} />,
  site: <Globe size={12} />,
};

interface Selecao {
  nicho_id?: string;
  subnicho_id?: string;
  categoria?: SwipeCategoria;
}

function SwipePage() {
  // Cache em memória: voltar para a aba mostra os itens na hora e atualiza por trás
  const [config, setConfig] = useCachedState<SwipeConfig | null>(CACHE_KEYS.swipeConfig, null);
  const [nichos, setNichos] = useCachedState<SwipeNicho[]>(CACHE_KEYS.swipeNichos, []);
  const [itens, setItens] = useCachedState<SwipeItem[]>(CACHE_KEYS.swipeItens, []);
  const [fila, setFila] = useCachedState<SwipeJob[]>(CACHE_KEYS.swipeFila, []);
  const [itemOcupado, setItemOcupado] = useState<string | null>(null);
  const [loading, setLoading] = useState(!hasCached(CACHE_KEYS.swipeItens));
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroRede, setFiltroRede] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [selecao, setSelecao] = useState<Selecao>({});
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ completar?: SwipeItem; preset?: Selecao } | null>(null);
  const [toDelete, setToDelete] = useState<SwipeItem | null>(null);
  const [nichoToDelete, setNichoToDelete] = useState<SwipeNicho | null>(null);
  const [driveReady, setDriveReady] = useState<boolean>(temChave());
  const [driveChecado, setDriveChecado] = useState(false);
  const [googleInfo, setGoogleInfo] = useState<{ login: boolean; clientId: string | null }>({ login: false, clientId: null });

  const load = async () => {
    try {
      const [c, n, i, f] = await Promise.all([fetchSwipeConfig(), fetchNichos(), fetchItens(), fetchFila().catch(() => [] as SwipeJob[])]);
      setConfig(c);
      setNichos(n);
      setItens(i);
      setFila(f);
      setErro(null);
    } catch (e) {
      setErro(erroAmigavel(e));
    } finally {
      setLoading(false);
    }
  };

  // Descobre como liberar o Drive neste navegador: chave já configurada, ou login Google (que
  // funciona em qualquer dispositivo). Tenta o login silencioso (One Tap) antes de pedir clique.
  const checarDrive = async () => {
    try {
      if (temChave()) { setDriveReady(true); return; }
      const st = await statusDoDrive();
      setGoogleInfo({ login: !!st.google_login, clientId: st.client_id });
      if (st.google_login && st.client_id) {
        const idToken = await loginSilencioso(st.client_id);
        if (idToken) setDriveReady(true);
      }
    } catch {
      // sem status: mantém não-pronto; o aviso orienta o usuário
    } finally {
      // O aviso "Falta liberar o Drive" só vale depois da primeira checagem (com ou sem erro): antes disso
      // ele piscaria para quem já tem acesso liberado e abriu a aba com os itens em cache
      setDriveChecado(true);
    }
  };

  useEffect(() => {
    load();
    checarDrive();
    // O serviço de download muda o status: reflete na hora
    const channel = supabase
      .channel("swipe-itens")
      .on("postgres_changes", { event: "*", schema: "public", table: "swipe_itens" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // A fila muda sem mexer nos itens (reordenar, job começando): enquanto houver algo na fila,
  // atualiza a cada 5 s com a aba visível.
  const filaAtiva = fila.some((j) => j.status === "aguardando" || j.status === "rodando");
  useEffect(() => {
    if (!filaAtiva) return;
    const t = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 5000);
    return () => window.clearInterval(t);
  }, [filaAtiva]);

  const acaoNoItem = async (item: SwipeItem, fn: () => Promise<void>, sucesso: string) => {
    setItemOcupado(item.id);
    try {
      await fn();
      toast.success(sucesso);
    } catch (e) {
      toast.error(erroAmigavel(e));
    } finally {
      setItemOcupado(null);
      await load();
    }
  };

  const nichosRaiz = useMemo(() => nichos.filter((n) => !n.pai_id), [nichos]);
  const subnichosDe = (id: string) => nichos.filter((n) => n.pai_id === id);
  const nomeNicho = (id: string | null | undefined) => nichos.find((n) => n.id === id)?.nome || "";

  const doFiltro = useMemo(() => {
    return itens.filter((i) => {
      if (selecao.nicho_id && i.nicho_id !== selecao.nicho_id) return false;
      if (selecao.subnicho_id && i.subnicho_id !== selecao.subnicho_id) return false;
      if (selecao.categoria && i.categoria !== selecao.categoria) return false;
      if (filtroRede !== "todas" && i.rede !== filtroRede) return false;
      if (filtroStatus !== "todos" && i.status !== filtroStatus) return false;
      return true;
    });
  }, [itens, selecao, filtroRede, filtroStatus]);
  // Busca tolerante (sem acento, com erro de digitação) no player, no nicho, nas tags, na nota, na categoria e no link.
  // Os nomes dos nichos vêm de `nichos`, que pode chegar depois dos itens: por isso o `deps`.
  const resultadoBusca = useBusca(
    doFiltro,
    busca,
    (i) => [i.player, nomeNicho(i.nicho_id), nomeNicho(i.subnicho_id), i.tags.join(" "), i.nota, categoriaMeta(i.categoria).singular, i.link],
    { deps: [nichos] },
  );
  const filtrados = resultadoBusca.itens;

  const contagem = (pred: (i: SwipeItem) => boolean) => itens.filter(pred).length;
  const pendentes = itens.filter((i) => i.status === "pendente" || i.status === "baixando").length;
  const falhos = itens.filter((i) => i.status === "falhou" || i.status === "manual").length;

  const toggleAberto = (id: string) => setAbertos((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const excluir = async () => {
    if (!toDelete) return;
    try {
      await excluirItem(toDelete);
      setItens((prev) => prev.filter((i) => i.id !== toDelete.id));
      toast.success(toDelete.drive_file_id ? "Removido do catálogo e enviado para a Lixeira do Drive" : "Removido do catálogo");
    } catch (e) {
      toast.error(erroAmigavel(e));
    }
    setToDelete(null);
  };

  const pronto = !!config?.root_folder_id && driveReady;

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Swipe file</h1>
          <p className="text-muted-foreground text-sm">
            Referências organizadas no seu Google Drive por nicho, subnicho e categoria. {itens.length} {itens.length === 1 ? "item" : "itens"}
            {pendentes > 0 ? ` · ${pendentes} na fila` : ""}{falhos > 0 ? ` · ${falhos} para resolver` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {config?.root_folder_id && (
            <Button variant="outline" className="gap-2" asChild>
              <a href={config.root_folder_link || `https://drive.google.com/drive/folders/${config.root_folder_id}`} target="_blank" rel="noopener noreferrer"><FolderOpen size={16} /> Abrir no Drive</a>
            </Button>
          )}
          <Button className="gap-2" onClick={() => setDialog({ preset: selecao })} disabled={!pronto}>
            <Plus size={18} /> Adicionar
          </Button>
        </div>
      </div>

      {erro && <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{erro}</CardContent></Card>}

      {!loading && driveChecado && !pronto && !erro && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 text-sm flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="font-medium">Falta liberar o Drive neste navegador</p>
              {googleInfo.login && googleInfo.clientId && config?.root_folder_id ? (
                <>
                  <p className="text-muted-foreground">
                    Entre com sua conta Google para usar o swipe file em qualquer navegador ou dispositivo. Os itens já salvos continuam visíveis abaixo.
                  </p>
                  <BotaoGoogleLogin
                    clientId={googleInfo.clientId}
                    onEntrou={() => { setDriveReady(true); load(); }}
                  />
                </>
              ) : (
                <p className="text-muted-foreground">
                  {!config?.root_folder_id ? 'Conecte o Google e crie a pasta "Swipe File" ' : "Informe a chave do swipe file "}
                  em <Link to="/admin" search={{ secao: "swipe" }} className="underline underline-offset-2">Admin → Swipe file</Link>. Os itens já salvos continuam visíveis abaixo.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5 items-start">
        {/* Árvore */}
        <Card className="lg:sticky lg:top-4">
          <CardContent className="p-2">
            <button type="button" onClick={() => setSelecao({})} className={cn("w-full text-left flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted", !selecao.nicho_id && !selecao.categoria && "bg-muted font-medium")}>
              <Folder size={14} className="text-muted-foreground" /> Tudo <Badge variant="secondary" className="ml-auto px-1.5 h-4 text-[10px]">{itens.length}</Badge>
            </button>
            <div className="mt-1 space-y-0.5">
              {nichosRaiz.map((n) => {
                const subs = subnichosDe(n.id);
                const aberto = abertos.has(n.id) || selecao.nicho_id === n.id;
                return (
                  <div key={n.id}>
                    <div className={cn("group/nicho flex items-center rounded hover:bg-muted", selecao.nicho_id === n.id && !selecao.subnicho_id && !selecao.categoria && "bg-muted")}>
                      <button type="button" onClick={() => toggleAberto(n.id)} className="p-1.5 text-muted-foreground" aria-label="Expandir">
                        {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                      <button type="button" onClick={() => setSelecao({ nicho_id: n.id })} className="flex-1 text-left text-sm py-1.5 pr-2 truncate flex items-center gap-2">
                        <span className="truncate">{n.nome}</span>
                        <Badge variant="secondary" className="ml-auto px-1.5 h-4 text-[10px]">{contagem((i) => i.nicho_id === n.id)}</Badge>
                      </button>
                      <button type="button" onClick={() => setNichoToDelete(n)} className="mr-1 p-1 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover/nicho:opacity-100 focus-visible:opacity-100 transition-opacity" title="Excluir nicho">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {aberto && (
                      <div className="ml-5 border-l pl-2 space-y-0.5">
                        {subs.map((s) => (
                          <div key={s.id}>
                            <div className={cn("group/sub flex items-center rounded hover:bg-muted", selecao.subnicho_id === s.id && !selecao.categoria && "bg-muted")}>
                              <button type="button" onClick={() => setSelecao({ nicho_id: n.id, subnicho_id: s.id })} className="flex-1 min-w-0 text-left text-sm px-2 py-1 flex items-center gap-2">
                                <span className="truncate">{s.nome}</span>
                                <Badge variant="secondary" className="ml-auto px-1.5 h-4 text-[10px]">{contagem((i) => i.subnicho_id === s.id)}</Badge>
                              </button>
                              <button type="button" onClick={() => setNichoToDelete(s)} className="mr-1 p-1 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover/sub:opacity-100 focus-visible:opacity-100 transition-opacity" title="Excluir subnicho">
                                <Trash2 size={12} />
                              </button>
                            </div>
                            {selecao.subnicho_id === s.id && (
                              <CategoriasDaPasta itens={itens.filter((i) => i.subnicho_id === s.id)} selecao={selecao} onSelect={(c) => setSelecao({ nicho_id: n.id, subnicho_id: s.id, categoria: c })} />
                            )}
                          </div>
                        ))}
                        {selecao.nicho_id === n.id && !selecao.subnicho_id && (
                          <CategoriasDaPasta itens={itens.filter((i) => i.nicho_id === n.id && !i.subnicho_id)} selecao={selecao} onSelect={(c) => setSelecao({ nicho_id: n.id, categoria: c })} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {nichosRaiz.length === 0 && <p className="text-xs text-muted-foreground px-2 py-3">Nenhum nicho ainda. O primeiro item cria a estrutura.</p>}
            </div>
          </CardContent>
        </Card>

        {/* Lista */}
        <div className="space-y-4 min-w-0">
          <FilaDownloads jobs={fila} itens={itens} nomeNicho={nomeNicho} onChange={load} />

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input placeholder="Buscar por player, nicho, tag, nota..." className="pl-10" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Select value={filtroRede} onValueChange={setFiltroRede}>
              <SelectTrigger className="sm:w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as plataformas</SelectItem>
                {REDES.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="sm:w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {Object.entries(STATUS_META).map(([id, m]) => <SelectItem key={id} value={id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={load} title="Atualizar"><RefreshCw size={16} /></Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CATEGORIAS.map((c) => {
              const ativo = selecao.categoria === c.id;
              return (
                <button key={c.id} type="button" onClick={() => setSelecao((s) => ({ ...s, categoria: ativo ? undefined : c.id }))}
                  className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors", ativo ? "text-white border-transparent" : "hover:bg-muted")}
                  style={ativo ? { backgroundColor: c.hex } : undefined}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.hex }} /> {c.pasta}
                  <span className="opacity-70">{contagem((i) => i.categoria === c.id && (!selecao.nicho_id || i.nicho_id === selecao.nicho_id) && (!selecao.subnicho_id || i.subnicho_id === selecao.subnicho_id))}</span>
                </button>
              );
            })}
          </div>

          {!loading && resultadoBusca.modo === "parecidos" && <MensagemBusca resultado={resultadoBusca} />}
          {filtrados.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div className="bg-muted rounded-full p-4"><FolderOpen size={36} className="text-muted-foreground" /></div>
              {resultadoBusca.modo === "nenhum" ? (
                <MensagemBusca resultado={resultadoBusca} className="text-lg font-medium text-foreground" />
              ) : (
                <>
                  <h3 className="text-lg font-medium">{itens.length === 0 ? "Swipe file vazio" : "Nada nesse filtro"}</h3>
                  <p className="text-muted-foreground max-w-sm text-sm">Adicione um link ou arraste um arquivo: ele vai para a pasta certa no Drive e aparece aqui.</p>
                  <Button onClick={() => setDialog({ preset: selecao })} disabled={!pronto}>Adicionar referência</Button>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtrados.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  nicho={nomeNicho(item.nicho_id)}
                  subnicho={nomeNicho(item.subnicho_id)}
                  onCopiar={copiar}
                  onEnviarArquivo={() => setDialog({ completar: item })}
                  onExcluir={() => setToDelete(item)}
                  ocupado={itemOcupado === item.id}
                  onTentarDeNovo={() => acaoNoItem(item, () => tentarDeNovo(item), item.drive_file_id
                    ? "De volta à fila. O Docs com o link foi para a Lixeira: vai chegar um resultado só."
                    : "De volta à fila, sem duplicar nada no Drive.")}
                  onPausar={() => acaoNoItem(item, () => pausarItem(item.id), "Pausado: sai da vez até você retomar")}
                  onRetomar={() => acaoNoItem(item, () => retomarItem(item.id), "De volta à fila (no fim)")}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <SwipeAddDialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        onSaved={load}
        rootFolderId={config?.root_folder_id ?? null}
        nichos={nichos}
        completar={dialog?.completar ?? null}
        preset={dialog?.preset}
      />

      <ExcluirNichoDialog
        nicho={nichoToDelete}
        nichos={nichos}
        itens={itens}
        onClose={() => setNichoToDelete(null)}
        onDeleted={async (nicho) => {
          if (selecao.nicho_id === nicho.id || selecao.subnicho_id === nicho.id) setSelecao({});
          await load();
        }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover "{toDelete?.nome_arquivo || toDelete?.player}" do catálogo?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.drive_file_id
                ? "O arquivo também vai para a Lixeira do Drive (dá para recuperar por ~30 dias)."
                : "Sai desta lista. Este item ainda não tem arquivo no Drive."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir} className="bg-destructive hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategoriasDaPasta({ itens, selecao, onSelect }: { itens: SwipeItem[]; selecao: Selecao; onSelect: (c: SwipeCategoria) => void }) {
  const presentes = CATEGORIAS.filter((c) => itens.some((i) => i.categoria === c.id));
  if (presentes.length === 0) return null;
  return (
    <div className="ml-3 space-y-0.5 py-0.5">
      {presentes.map((c) => (
        <button key={c.id} type="button" onClick={() => onSelect(c.id)} className={cn("w-full text-left text-xs rounded px-2 py-1 flex items-center gap-2 hover:bg-muted text-muted-foreground", selecao.categoria === c.id && "bg-muted text-foreground")}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.hex }} /> {c.pasta}
          <span className="ml-auto opacity-70">{itens.filter((i) => i.categoria === c.id).length}</span>
        </button>
      ))}
    </div>
  );
}

function ItemCard({ item, nicho, subnicho, onCopiar, onEnviarArquivo, onExcluir, ocupado, onTentarDeNovo, onPausar, onRetomar }: {
  item: SwipeItem; nicho: string; subnicho: string;
  onCopiar: (t: string) => void; onEnviarArquivo: () => void; onExcluir: () => void;
  ocupado: boolean; onTentarDeNovo: () => void; onPausar: () => void; onRetomar: () => void;
}) {
  const cat = categoriaMeta(item.categoria);
  const status = STATUS_META[item.status];
  const abrir = item.drive_web_link || (item.drive_file_id ? `https://drive.google.com/open?id=${item.drive_file_id}` : null);
  const precisaArquivo = item.status === "falhou" || item.status === "manual" || item.status === "pendente" || item.status === "pausado";

  return (
    <Card className={cn("overflow-hidden flex flex-col group", item.status === "falhou" && "border-red-500/40")}>
      <a href={abrir || item.link || "#"} target="_blank" rel="noopener noreferrer" className="block">
        {item.thumbnail_link ? (
          <div className="aspect-video bg-muted overflow-hidden"><img src={item.thumbnail_link} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" /></div>
        ) : (
          <div className="h-2 w-full" style={{ backgroundColor: cat.hex }} />
        )}
      </a>
      <CardContent className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge className="text-[10px] h-5 text-white border-transparent gap-1" style={{ backgroundColor: cat.hex }}>{ICONE_CATEGORIA[item.categoria]} {cat.singular}</Badge>
          <Badge variant="outline" className="text-[10px] h-5">{redeLabel(item.rede)}</Badge>
          <Badge variant="outline" className="text-[10px] h-5 gap-1 ml-auto" style={{ color: status.hex, borderColor: `${status.hex}66` }}>
            {item.status === "baixando" && <RefreshCw size={10} className="animate-spin" />}{status.label}
          </Badge>
        </div>
        <div>
          <h3 className="font-semibold leading-snug">{item.player}</h3>
          <p className="text-xs text-muted-foreground">{nicho}{subnicho ? ` › ${subnicho}` : ""}</p>
        </div>
        {item.nota && <p className="text-xs text-muted-foreground italic line-clamp-2">{item.nota}</p>}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.map((t) => <span key={t} className="text-[10px] rounded bg-muted px-1.5 py-0.5">#{t}</span>)}
          </div>
        )}
        {item.erro && <p className="text-[11px] text-red-500 flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {item.erro}</p>}
        <div className="mt-auto pt-2 flex items-center gap-1.5">
          {abrir ? (
            <Button size="sm" className="flex-1 gap-1.5" asChild>
              <a href={abrir} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> {item.status === "falhou" ? "Abrir Docs" : "Abrir no Drive"}</a>
            </Button>
          ) : item.link ? (
            <Button size="sm" variant="secondary" className="flex-1 gap-1.5" asChild>
              <a href={item.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Abrir link</a>
            </Button>
          ) : (
            <Button size="sm" variant="secondary" className="flex-1" disabled>Sem arquivo</Button>
          )}
          {podeTentarDeNovo(item) && (
            <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={onTentarDeNovo} disabled={ocupado} title="Tentar baixar de novo (o Docs com o link vai para a Lixeira e não duplica nada)">
              {ocupado ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            </Button>
          )}
          {(item.status === "pendente" || item.status === "baixando") && (
            <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={onPausar} disabled={ocupado} title="Pausar (sai da vez; se estiver baixando, libera para o próximo)">
              {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />}
            </Button>
          )}
          {item.status === "pausado" && (
            <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={onRetomar} disabled={ocupado} title="Retomar (volta para o fim da fila)">
              {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            </Button>
          )}
          {precisaArquivo && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onEnviarArquivo} title="Enviar o arquivo manualmente"><Upload size={14} /></Button>
          )}
          {item.link && <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onCopiar(item.link!)} title="Copiar link original"><Copy size={14} /></Button>}
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={onExcluir} title="Remover do catálogo"><Trash2 size={14} /></Button>
        </div>
        {item.nome_arquivo && <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1"><FileText size={10} /> {item.nome_arquivo}</p>}
      </CardContent>
    </Card>
  );
}
