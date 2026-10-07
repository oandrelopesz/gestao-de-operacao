import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Link2, X, FileIcon, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadFile, ensureFolder, SwipeKeyError } from "@/lib/googleDrive";
import {
  CATEGORIAS, REDES, categoriaMeta, detectarRede, encontrarNicho, garantirPastas, nomeDoItem, extensaoDe, criarItem, atualizarItem, enfileirarJob, erroAmigavel,
  type SwipeCategoria, type SwipeRede, type SwipeNicho, type SwipeItem,
} from "@/lib/swipe";
import { nomeLivre, separarLinks } from "@/lib/swipeNomes";

const MAX_BYTES = 5 * 1024 * 1024 * 1024;

export interface SwipeAddDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  rootFolderId: string | null;
  nichos: SwipeNicho[];
  /** Players já usados no swipe (lista do campo Player) */
  players: { nome: string; nome_normalizado: string }[];
  /** Nomes de arquivo já usados (LP e carrossel viram pasta: nome repetido misturaria os arquivos) */
  nomesUsados: Set<string>;
  /** Item pendente/falho para completar com arquivo (mantém os dados, só sobe o arquivo) */
  completar?: SwipeItem | null;
  /** Nicho/subnicho pré-selecionados (ex.: ao adicionar a partir da árvore) */
  preset?: { nicho_id?: string; subnicho_id?: string; categoria?: SwipeCategoria };
}

/** Uma referência do lote: cada link tem o seu tipo, a sua rede e um nome opcional. */
interface Linha {
  chave: number;
  link: string;
  categoria: SwipeCategoria;
  rede: SwipeRede;
  redeManual: boolean;
  nome: string;
}

let proximaChave = 0;
function novaLinha(categoria: SwipeCategoria, link = ""): Linha {
  return { chave: ++proximaChave, link, categoria, rede: (link && detectarRede(link)) || "instagram", redeManual: false, nome: "" };
}

const ehPagina = (c: SwipeCategoria) => c === "landing_page" || c === "site";
const urlCompleta = (link: string) => (/^https?:\/\//i.test(link) ? link : `https://${link}`);

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function SwipeAddDialog({ open, onClose, onSaved, rootFolderId, nichos, players, nomesUsados, completar, preset }: SwipeAddDialogProps) {
  const [nichoNome, setNichoNome] = useState("");
  const [subnichoNome, setSubnichoNome] = useState("");
  const [player, setPlayer] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>(() => [novaLinha("video_anuncio")]);
  const [nota, setNota] = useState("");
  const [tagsTexto, setTagsTexto] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState<{ pct: number; texto: string } | null>(null);
  const [confirmarParecido, setConfirmarParecido] = useState<{ tipo: "nicho" | "subnicho" | "player"; digitado: string; existente: { nome: string }; resolve: (usar: boolean) => void } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const nichosRaiz = useMemo(() => nichos.filter((n) => !n.pai_id), [nichos]);
  const nichoSelecionado = useMemo(() => encontrarNicho(nichoNome, nichosRaiz).exato, [nichoNome, nichosRaiz]);
  const subnichosDoNicho = useMemo(() => (nichoSelecionado ? nichos.filter((n) => n.pai_id === nichoSelecionado.id) : []), [nichos, nichoSelecionado]);
  const playerAchado = useMemo(() => encontrarNicho(player, players), [player, players]);
  const primeira = linhas[0];
  // Com arquivo do computador vale só a primeira linha (um item; carrossel aceita vários arquivos)
  const linhasVisiveis = arquivos.length > 0 ? linhas.slice(0, 1) : linhas;
  const comLink = linhas.filter((l) => l.link.trim());

  // Preenche só ao abrir (ou ao trocar o item a completar). A página recarrega `nichos` a cada 5 s
  // enquanto a fila roda; se isso zerasse o formulário, apagaria o que está sendo digitado.
  const preenchido = useRef<{ open: boolean; completar: SwipeItem | null | undefined }>({ open: false, completar: null });
  useEffect(() => {
    const antes = preenchido.current;
    preenchido.current = { open, completar };
    if (!open || (antes.open && antes.completar === completar)) return;
    if (completar) {
      const n = nichos.find((x) => x.id === completar.nicho_id);
      const s = completar.subnicho_id ? nichos.find((x) => x.id === completar.subnicho_id) : null;
      setNichoNome(n?.nome || "");
      setSubnichoNome(s?.nome || "");
      setPlayer(completar.player);
      setLinhas([{ ...novaLinha(completar.categoria, completar.link || ""), rede: completar.rede, redeManual: true }]);
      setNota(completar.nota || "");
      setTagsTexto((completar.tags || []).join(", "));
    } else {
      const n = preset?.nicho_id ? nichos.find((x) => x.id === preset.nicho_id) : null;
      const s = preset?.subnicho_id ? nichos.find((x) => x.id === preset.subnicho_id) : null;
      setNichoNome(n?.nome || "");
      setSubnichoNome(s?.nome || "");
      setPlayer("");
      setLinhas([novaLinha(preset?.categoria || "video_anuncio")]);
      setNota("");
      setTagsTexto("");
    }
    setArquivos([]);
    setProgresso(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, completar]);

  /** Depois de salvar com "adicionar outro": mantém nicho/subnicho e o tipo, limpa o resto. */
  const limparParaOutro = () => {
    setPlayer("");
    setLinhas([novaLinha(primeira.categoria)]);
    setNota("");
    setTagsTexto("");
    setArquivos([]);
    requestAnimationFrame(() => document.getElementById("sw-player")?.focus());
  };

  const mudarLinha = (chave: number, patch: Partial<Linha>) =>
    setLinhas((prev) => prev.map((l) => (l.chave === chave ? { ...l, ...patch } : l)));

  const onLinkChange = (chave: number, v: string) =>
    setLinhas((prev) => prev.map((l) => (l.chave !== chave ? l : { ...l, link: v, rede: l.redeManual ? l.rede : detectarRede(v) || l.rede })));

  /** Vários links colados de uma vez viram várias linhas (o campo de uma linha só juntaria tudo). */
  const onLinkPaste = (chave: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const links = separarLinks(e.clipboardData.getData("text"));
    if (links.length < 2) return;
    e.preventDefault();
    setLinhas((prev) => {
      const i = prev.findIndex((l) => l.chave === chave);
      const atual = prev[i];
      const primeiraColada = { ...atual, link: links[0], rede: atual.redeManual ? atual.rede : detectarRede(links[0]) || atual.rede };
      return [...prev.slice(0, i), primeiraColada, ...links.slice(1).map((l) => novaLinha(atual.categoria, l)), ...prev.slice(i + 1)];
    });
    toast.success(`${links.length} links adicionados`);
  };

  const adicionarLinha = () => {
    setLinhas((prev) => [...prev, novaLinha(prev[prev.length - 1]?.categoria || "video_anuncio")]);
    requestAnimationFrame(() => {
      const campos = document.querySelectorAll<HTMLInputElement>("[data-sw-link]");
      campos[campos.length - 1]?.focus();
    });
  };

  const adicionarArquivos = (lista: FileList | File[]) => {
    const novos = Array.from(lista).filter((f) => {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} passa de 5 GB`);
        return false;
      }
      return true;
    });
    if (!novos.length) return;
    // Só carrossel aceita vários arquivos (viram cards numerados); nos demais, o último substitui
    setArquivos((prev) => (primeira.categoria === "carrossel" ? [...prev, ...novos] : [novos[novos.length - 1]]));
  };

  const confirmarUso = (tipo: "nicho" | "subnicho" | "player", digitado: string, existente: { nome: string }) =>
    new Promise<boolean>((resolve) => setConfirmarParecido({ tipo, digitado, existente, resolve }));

  const salvar = async (outro = false) => {
    if (!rootFolderId) {
      toast.error('Crie a pasta "Swipe File" no Admin antes de adicionar.');
      return;
    }
    if (!nichoNome.trim()) return toast.error("Informe o nicho");
    if (!player.trim()) return toast.error("Informe o player / empresa");
    if (arquivos.length === 0 && comLink.length === 0) return toast.error("Cole um link ou arraste um arquivo");

    // "Adicionar outro": o formulário limpa já no clique (dá para digitar o próximo enquanto este
    // salva). Os valores deste lote já estão capturados aqui; se der erro, voltam para o formulário.
    const anterior = { player, linhas, nota, tagsTexto, arquivos };
    const alvos = arquivos.length > 0 ? [primeira] : comLink;
    const limpouAntes = outro && !completar;
    if (limpouAntes) limparParaOutro();
    setSalvando(true);
    const salvas = new Set<number>();
    try {
      let nichoId: string;
      let subnichoId: string | null;
      let playerNome = player.trim();
      let pastaDe: (c: SwipeCategoria) => Promise<{ id: string; webViewLink?: string }>;

      if (completar?.drive_folder_id) {
        // Completar com arquivo: sobe na mesma pasta onde o item já está (estrutura da época dele)
        nichoId = completar.nicho_id;
        subnichoId = completar.subnicho_id;
        const id = completar.drive_folder_id;
        pastaDe = async () => ({ id });
      } else {
        // 1) Nicho, subnicho e player: usa o existente (mesmo nome), pergunta se for parecido, cria se for novo
        let nichoRef: { id?: string; nome: string } = { nome: nichoNome.trim() };
        const achado = encontrarNicho(nichoNome, nichosRaiz);
        if (achado.exato) nichoRef = { id: achado.exato.id, nome: achado.exato.nome };
        else if (achado.parecido) {
          const usar = await confirmarUso("nicho", nichoNome.trim(), achado.parecido);
          if (usar) nichoRef = { id: achado.parecido.id, nome: achado.parecido.nome };
        }

        let subRef: { id?: string; nome: string } | null = null;
        if (subnichoNome.trim()) {
          subRef = { nome: subnichoNome.trim() };
          const candidatos = nichoRef.id ? nichos.filter((n) => n.pai_id === nichoRef.id) : [];
          const achadoSub = encontrarNicho(subnichoNome, candidatos);
          if (achadoSub.exato) subRef = { id: achadoSub.exato.id, nome: achadoSub.exato.nome };
          else if (achadoSub.parecido) {
            const usar = await confirmarUso("subnicho", subnichoNome.trim(), achadoSub.parecido);
            if (usar) subRef = { id: achadoSub.parecido.id, nome: achadoSub.parecido.nome };
          }
        }

        const achadoPlayer = encontrarNicho(playerNome, players);
        if (achadoPlayer.exato) playerNome = achadoPlayer.exato.nome;
        else if (achadoPlayer.parecido && (await confirmarUso("player", playerNome, achadoPlayer.parecido))) playerNome = achadoPlayer.parecido.nome;

        // 2) Pastas: Swipe File / Nicho / [Subnicho /] Player / Tipo (uma vez por tipo do lote)
        setProgresso({ pct: 0, texto: "Preparando pastas no Drive..." });
        const g = await garantirPastas({ rootFolderId, nicho: nichoRef, subnicho: subRef, player: playerNome, categoria: alvos[0].categoria, nichosAtuais: nichos });
        nichoId = g.nicho.id;
        subnichoId = g.subnicho?.id ?? null;
        const pastas = new Map<SwipeCategoria, { id: string; webViewLink?: string }>([[alvos[0].categoria, g.categoriaFolder]]);
        pastaDe = async (c) => {
          let p = pastas.get(c);
          if (!p) {
            p = await ensureFolder(categoriaMeta(c).pasta, g.playerFolder.id);
            pastas.set(c, p);
          }
          return p;
        };
      }

      const tags = tagsTexto.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
      const comum = { nicho_id: nichoId, subnicho_id: subnichoId, player: playerNome, nota: nota.trim() || null, tags };
      const usados = new Set(nomesUsados);
      const nomeDe = (l: Linha) => {
        const base = completar?.nome_arquivo || nomeLivre(nomeDoItem({ nome: l.nome, player: playerNome, categoria: l.categoria, rede: l.rede }), usados);
        usados.add(base);
        return base;
      };

      if (arquivos.length > 0) {
        // 3a) Upload direto para o Drive (um item)
        const l = primeira;
        const pasta = await pastaDe(l.categoria);
        const base = nomeDe(l);
        let driveFileId: string; let webLink: string | null; let thumb: string | null; let mime: string | null; let tamanho: number;
        if (l.categoria === "carrossel" && arquivos.length > 1) {
          setProgresso({ pct: 0, texto: "Criando pasta do carrossel..." });
          const pastaCarrossel = await ensureFolder(base, pasta.id);
          const ordenados = [...arquivos].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
          for (let i = 0; i < ordenados.length; i++) {
            const f = ordenados[i];
            const nome = `Card ${String(i + 1).padStart(2, "0")}.${extensaoDe(f)}`; // mesmo padrão do serviço de download
            setProgresso({ pct: Math.round((i / ordenados.length) * 100), texto: `Enviando card ${i + 1} de ${ordenados.length}...` });
            await uploadFile(f, { name: nome, parentId: pastaCarrossel.id, onProgress: (p) => setProgresso({ pct: Math.round(((i + p / 100) / ordenados.length) * 100), texto: `Enviando card ${i + 1} de ${ordenados.length}...` }) });
          }
          driveFileId = pastaCarrossel.id; webLink = pastaCarrossel.webViewLink || null; thumb = null; mime = "application/vnd.google-apps.folder";
          tamanho = arquivos.reduce((a, f) => a + f.size, 0);
        } else {
          const f = arquivos[0];
          const up = await uploadFile(f, { name: `${base}.${extensaoDe(f)}`, parentId: pasta.id, onProgress: (p) => setProgresso({ pct: p, texto: `Enviando ${formatBytes(f.size)}...` }) });
          driveFileId = up.id; webLink = up.webViewLink || null; thumb = up.thumbnailLink || null; mime = up.mimeType || f.type; tamanho = f.size;
        }
        const campos = {
          ...comum, categoria: l.categoria, rede: l.rede, link: l.link.trim() ? urlCompleta(l.link.trim()) : null, nome_arquivo: base, drive_folder_id: pasta.id,
          drive_file_id: driveFileId, drive_web_link: webLink, thumbnail_link: thumb, mime, tamanho, status: "pronto" as const, erro: null,
        };
        if (completar) await atualizarItem(completar.id, campos);
        else await criarItem(campos);
        toast.success("Salvo no Drive");
      } else {
        // 3b) Links: cada um vira um item na fila do serviço de download (baixa um por vez)
        for (let i = 0; i < alvos.length; i++) {
          const l = alvos[i];
          setProgresso({ pct: Math.round((i / alvos.length) * 100), texto: alvos.length > 1 ? `Colocando na fila ${i + 1} de ${alvos.length}...` : "Colocando na fila..." });
          const pasta = await pastaDe(l.categoria);
          const base = nomeDe(l);
          const link = urlCompleta(l.link.trim());
          const campos = { ...comum, categoria: l.categoria, rede: l.rede, link, nome_arquivo: base, drive_folder_id: pasta.id };
          const item = completar
            ? (await atualizarItem(completar.id, { ...campos, status: "pendente", erro: null }), { id: completar.id })
            : await criarItem({ ...campos, status: "pendente" });
          await enfileirarJob(item.id, ehPagina(l.categoria) ? "lp" : "download", { link, categoria: l.categoria, nome_arquivo: base, drive_folder_id: pasta.id, rede: l.rede });
          salvas.add(l.chave);
        }
        toast.success(alvos.length > 1
          ? `${alvos.length} links na fila: o serviço baixa um por vez e sobe na pasta do player`
          : "Na fila: o serviço baixa e sobe no Drive; se falhar, salva o link num Docs");
      }
      await onSaved();
      if (!limpouAntes) onClose();
    } catch (e: any) {
      // Os links que já entraram na fila ficam; o resto volta para o formulário
      const restantes = anterior.linhas.filter((l) => !salvas.has(l.chave));
      if (limpouAntes) {
        setPlayer(anterior.player);
        setNota(anterior.nota);
        setTagsTexto(anterior.tagsTexto);
        setArquivos(anterior.arquivos);
      }
      if (limpouAntes || salvas.size > 0) setLinhas(restantes.length ? restantes : [novaLinha(primeira.categoria)]);
      if (salvas.size > 0) await onSaved();
      const motivo = e instanceof SwipeKeyError ? e.message : erroAmigavel(e);
      toast.error(salvas.size > 0 ? `${salvas.size} de ${alvos.length} entraram na fila; o resto voltou para o formulário. ${motivo}` : motivo);
    } finally {
      setSalvando(false);
      setProgresso(null);
    }
  };

  const tiposDoLote = Array.from(new Set((arquivos.length > 0 ? [primeira] : linhas).map((l) => l.categoria)));

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o && !salvando) onClose(); }}>
        <DialogContent className="sm:max-w-[680px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{completar ? "Enviar arquivo da referência" : "Adicionar ao swipe file"}</DialogTitle>
            <DialogDescription>
              Vai para <span className="font-mono text-xs">Swipe File / {nichoNome.trim() || "Nicho"}{subnichoNome.trim() ? ` / ${subnichoNome.trim()}` : ""} / {player.trim() || "Player"} / {tiposDoLote.length === 1 ? categoriaMeta(tiposDoLote[0]).pasta : "pasta de cada tipo"}</span>
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sw-nicho">Nicho</Label>
                <Input id="sw-nicho" list="sw-nichos" placeholder="Ex.: Médico" value={nichoNome} onChange={(e) => setNichoNome(e.target.value)} disabled={!!completar} autoComplete="off" />
                <datalist id="sw-nichos">
                  {nichosRaiz.map((n) => <option key={n.id} value={n.nome} />)}
                </datalist>
                {nichoNome.trim() && !nichoSelecionado && !encontrarNicho(nichoNome, nichosRaiz).parecido && (
                  <p className="text-[11px] text-muted-foreground">Nicho novo: a pasta será criada.</p>
                )}
                {nichoNome.trim() && !nichoSelecionado && encontrarNicho(nichoNome, nichosRaiz).parecido && (
                  <p className="text-[11px] text-amber-600">Parecido com "{encontrarNicho(nichoNome, nichosRaiz).parecido!.nome}" — vou confirmar ao salvar.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sw-sub">Subnicho <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input id="sw-sub" list="sw-subnichos" placeholder="Ex.: Ortopedia" value={subnichoNome} onChange={(e) => setSubnichoNome(e.target.value)} disabled={!!completar} autoComplete="off" />
                <datalist id="sw-subnichos">
                  {subnichosDoNicho.map((n) => <option key={n.id} value={n.nome} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sw-player">Player / empresa</Label>
                <Input id="sw-player" list="sw-players" placeholder="Quem fez (marca, expert)" value={player} onChange={(e) => setPlayer(e.target.value)} autoComplete="off" />
                <datalist id="sw-players">
                  {players.map((p) => <option key={p.nome_normalizado} value={p.nome} />)}
                </datalist>
                {!completar && player.trim() && !playerAchado.exato && !playerAchado.parecido && (
                  <p className="text-[11px] text-muted-foreground">Player novo: a pasta será criada.</p>
                )}
                {!completar && player.trim() && !playerAchado.exato && playerAchado.parecido && (
                  <p className="text-[11px] text-amber-600">Parecido com "{playerAchado.parecido.nome}" — vou confirmar ao salvar.</p>
                )}
              </div>
            </div>

            {/* Links: um por referência, cada um com tipo, rede e nome */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Link2 size={13} /> {arquivos.length > 0 ? "Referência do arquivo" : "Links"}
                {arquivos.length === 0 && !completar && <span className="text-muted-foreground font-normal">(cole vários de uma vez, um por linha)</span>}
              </Label>
              {linhasVisiveis.map((l, i) => {
                const previa = player.trim() ? nomeDoItem({ nome: l.nome, player: player.trim(), categoria: l.categoria, rede: l.rede }) : null;
                return (
                  <div key={l.chave} className="rounded-md border bg-muted/20 p-2 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        data-sw-link
                        id={i === 0 ? "sw-link" : undefined}
                        aria-label={`Link ${i + 1}`}
                        placeholder={arquivos.length > 0 ? "Link de onde veio (opcional)" : "https://www.instagram.com/reel/... ou a URL da LP"}
                        value={l.link}
                        onChange={(e) => onLinkChange(l.chave, e.target.value)}
                        onPaste={(e) => onLinkPaste(l.chave, e)}
                      />
                      {linhasVisiveis.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={`Remover link ${i + 1}`} onClick={() => setLinhas((p) => p.filter((x) => x.chave !== l.chave))}>
                          <X size={14} />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Select value={l.categoria} onValueChange={(v) => mudarLinha(l.chave, { categoria: v as SwipeCategoria })} disabled={!!completar}>
                        <SelectTrigger aria-label={`Tipo do link ${i + 1}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIAS.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.hex }} />{c.singular}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={l.rede} onValueChange={(v) => mudarLinha(l.chave, { rede: v as SwipeRede, redeManual: true })}>
                        <SelectTrigger aria-label={`Rede do link ${i + 1}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {REDES.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input aria-label={`Nome do arquivo ${i + 1} (opcional)`} placeholder="Nome do arquivo (opcional)" value={l.nome} onChange={(e) => mudarLinha(l.chave, { nome: e.target.value })} disabled={!!completar?.nome_arquivo} />
                    </div>
                    {previa && !completar && <p className="text-[11px] text-muted-foreground truncate" title={previa}>No Drive: {previa}</p>}
                    {!arquivos.length && l.link.trim() && ehPagina(l.categoria) && (
                      <p className="text-[11px] text-muted-foreground">O serviço captura a página em HTML + print e sobe no Drive.</p>
                    )}
                  </div>
                );
              })}
              {arquivos.length === 0 && !completar && (
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={adicionarLinha}>
                  <Plus size={14} /> Adicionar link
                </Button>
              )}
              {arquivos.length > 0 && linhas.length > 1 && (
                <p className="text-[11px] text-amber-600">Com arquivo, vale só a primeira linha; os outros links voltam se você tirar o arquivo.</p>
              )}
              {arquivos.length === 0 && comLink.length > 0 && (
                <p className="text-[11px] text-muted-foreground">O serviço baixa cada link (vídeo, imagem, carrossel) e sobe na pasta do player. Se a rede bloquear, salva o link num Docs e avisa.</p>
              )}
            </div>

            {/* Arquivo */}
            <div
              className={cn("rounded-md border-2 border-dashed p-4 text-center transition-colors cursor-pointer", arrastando ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50")}
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionarArquivos(e.dataTransfer.files); }}
              onClick={() => fileInput.current?.click()}
            >
              <input ref={fileInput} type="file" className="hidden" multiple={primeira.categoria === "carrossel"} onChange={(e) => { if (e.target.files) adicionarArquivos(e.target.files); e.target.value = ""; }} />
              <Upload size={20} className="mx-auto text-muted-foreground mb-1" />
              <p className="text-sm font-medium">{completar ? "Arraste o arquivo desta referência" : "Ou arraste o arquivo aqui"}</p>
              <p className="text-[11px] text-muted-foreground">Até 5 GB, direto para o seu Drive{primeira.categoria === "carrossel" ? " · vários arquivos viram cards 01, 02, 03…" : ""}</p>
              {arquivos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 justify-center" onClick={(e) => e.stopPropagation()}>
                  {arquivos.map((f, i) => (
                    <Badge key={`${f.name}-${i}`} variant="secondary" className="gap-1 font-normal max-w-full">
                      <FileIcon size={11} /> <span className="truncate max-w-[180px]">{f.name}</span> <span className="opacity-60">{formatBytes(f.size)}</span>
                      <button type="button" className="ml-1 hover:text-destructive" onClick={() => setArquivos((p) => p.filter((_, j) => j !== i))} aria-label="Remover arquivo"><X size={11} /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sw-nota">Por que salvei <span className="text-muted-foreground font-normal">(opcional{linhas.length > 1 ? ", vale para todos" : ""})</span></Label>
                <Textarea id="sw-nota" rows={2} placeholder="Ex.: hook forte nos 3s, oferta com garantia dupla" value={nota} onChange={(e) => setNota(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sw-tags">Tags <span className="text-muted-foreground font-normal">(separadas por vírgula)</span></Label>
                <Input id="sw-tags" placeholder="hook, prova social, vsl" value={tagsTexto} onChange={(e) => setTagsTexto(e.target.value)} />
              </div>
            </div>

            {progresso && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {progresso.texto}</span><span className="numeric">{progresso.pct}%</span></div>
                <Progress value={progresso.pct} className="h-1.5" />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
              {!completar && (
                <Button type="button" variant="outline" onClick={() => salvar(true)} disabled={salvando}>
                  Salvar e adicionar outro
                </Button>
              )}
              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : arquivos.length > 0 ? "Enviar para o Drive" : comLink.length > 1 ? `Salvar e baixar ${comLink.length}` : "Salvar e baixar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmarParecido} onOpenChange={(o) => { if (!o && confirmarParecido) { confirmarParecido.resolve(false); setConfirmarParecido(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usar "{confirmarParecido?.existente.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Você digitou "{confirmarParecido?.digitado}", parecido com o {confirmarParecido?.tipo} que já existe "{confirmarParecido?.existente.nome}". Quer colocar na pasta existente ou criar uma nova?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { confirmarParecido?.resolve(false); setConfirmarParecido(null); }}>Criar "{confirmarParecido?.digitado}"</AlertDialogCancel>
            <AlertDialogAction onClick={() => { confirmarParecido?.resolve(true); setConfirmarParecido(null); }}>Usar "{confirmarParecido?.existente.nome}"</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
