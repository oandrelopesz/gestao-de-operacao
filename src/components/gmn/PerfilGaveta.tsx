// Gaveta do perfil: Contexto, Imagens, Agenda e Posts.
import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Trash2, Type } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  excluirPerfil, gerarBriefingIa, salvarBriefing, salvarPerfil, traduzErroGmn, type ClienteOpcao, type CtaTipo, type PerfilGmn,
} from "@/lib/gmn";
import {
  DIAS_CURTOS, HORARIOS, alternarDia, alternarImagem, comUtm, idPastaDrive, mesmoHorario, mudarHora, normalizarAgenda,
  normalizarBriefing, type Briefing, type ItemAgenda,
} from "../../../supabase/functions/gmn/regras.ts";
import { AbaContexto } from "./AbaContexto";
import { AbaImagens } from "./AbaImagens";
import { GerarBriefingDialog } from "./GerarBriefingDialog";
import { PostsLista } from "./PostsLista";

const CTAS: { v: CtaTipo; rotulo: string }[] = [
  { v: "LEARN_MORE", rotulo: "Saiba mais (abre o link)" },
  { v: "BOOK", rotulo: "Agendar (abre o link)" },
  { v: "CALL", rotulo: "Ligar (usa o telefone do perfil)" },
];
const AVISO = "text-xs font-medium text-amber-600 dark:text-amber-400";

/** Texto vazio (ou só espaços) vira null. */
const vazioNulo = (s: string | null | undefined) => (s ?? "").trim() || null;

/** "3 posts por semana (2 com imagem, 1 só texto)". */
function postsPorSemana(agenda: ItemAgenda[]): string {
  const comImagem = agenda.filter((x) => x.imagem).length;
  const soTexto = agenda.length - comImagem;
  const partes = [comImagem > 0 && `${comImagem} com imagem`, soTexto > 0 && `${soTexto} só texto`].filter(Boolean).join(", ");
  return `${agenda.length} ${agenda.length === 1 ? "post" : "posts"} por semana (${partes})`;
}

/** O que "Salvar contexto" grava; a marca de "alterado" compara o rascunho com o salvo por estes mesmos ajustes. */
function ajustesContexto(d: PerfilGmn, b: Briefing) {
  return { contexto_posts: vazioNulo(d.contexto_posts), briefing: normalizarBriefing(b), saude: d.saude, cliente_id: d.cliente_id };
}

/** O que "Salvar imagens" grava (a logo é gravada no envio, fora daqui). */
function ajustesImagens(d: PerfilGmn) {
  return {
    drive_pasta_url: vazioNulo(d.drive_pasta_url), usa_ia_imagem: d.usa_ia_imagem,
    contexto_imagens: vazioNulo(d.contexto_imagens), permitir_pessoas_ia: d.permitir_pessoas_ia,
  };
}

/** O que "Salvar configurações" (aba Agenda) grava. */
function ajustesConfig(d: PerfilGmn) {
  return {
    nome: d.nome.trim(), categoria: vazioNulo(d.categoria), site: vazioNulo(d.site), endereco: vazioNulo(d.endereco),
    agenda: normalizarAgenda(d.agenda), cta_tipo: d.cta_tipo, cta_url: vazioNulo(d.cta_url),
  };
}

export function PerfilGaveta({ perfil, clientes, aberto, onFechar, onMudou }: {
  perfil: PerfilGmn | null; clientes: ClienteOpcao[]; aberto: boolean; onFechar: () => void; onMudou: () => void;
}) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [dados, setDados] = useState<PerfilGmn | null>(null);
  const [salvando, setSalvando] = useState<"contexto" | "imagens" | "config" | null>(null);
  const [extraindo, setExtraindo] = useState(false);
  const [dadosAbertos, setDadosAbertos] = useState(true);
  const [iaAberto, setIaAberto] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [descartar, setDescartar] = useState(false);

  // Os rascunhos só são (re)iniciados quando a gaveta abre ou o perfil muda. A recarga depois de salvar traz um objeto
  // novo em `perfil`, mas não pode apagar o que ainda não foi salvo na outra aba.
  const [chave, setChave] = useState<string | null>(null);
  const chaveAtual = aberto && perfil ? perfil.id : null;
  if (chave !== chaveAtual) {
    setChave(chaveAtual);
    if (perfil && chaveAtual) {
      setBriefing(perfil.briefing);
      setDados(perfil);
      setDadosAbertos(!vazioNulo(perfil.contexto_posts)); // os dados extraídos só abrem sozinhos se ainda não há contexto
    }
  }

  // Respostas que chegam depois (extração, envio da logo) só valem se a gaveta ainda estiver no mesmo perfil.
  const chaveRef = useRef<string | null>(null);
  useEffect(() => { chaveRef.current = chaveAtual; }, [chaveAtual]);

  if (!perfil || !dados || !briefing) return null;

  // Marcas de "alterado": rascunho x o que está salvo (depois de salvar, a recarga as desliga sozinha).
  const contextoAlterado =
    JSON.stringify(ajustesContexto(dados, briefing)) !== JSON.stringify(ajustesContexto(perfil, perfil.briefing));
  const imagensAlteradas = JSON.stringify(ajustesImagens(dados)) !== JSON.stringify(ajustesImagens(perfil));
  const configAlterada = JSON.stringify(ajustesConfig(dados)) !== JSON.stringify(ajustesConfig(perfil));
  const algoAlterado = contextoAlterado || imagensAlteradas || configAlterada;

  function tentarFechar() {
    if (algoAlterado) setDescartar(true);
    else onFechar();
  }

  async function gravarContexto() {
    const d = dados!;
    setSalvando("contexto");
    try {
      await salvarPerfil(perfil!.id, { contexto_posts: vazioNulo(d.contexto_posts), saude: d.saude, cliente_id: d.cliente_id });
      await salvarBriefing(perfil!.id, briefing!);
      toast.success("Contexto salvo.");
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      setSalvando(null);
    }
  }

  async function extrairDoContexto() {
    const id = perfil!.id;
    const texto = vazioNulo(dados!.contexto_posts);
    if (!texto) return;
    setExtraindo(true);
    try {
      const b = await gerarBriefingIa(id, null, texto);
      if (chaveRef.current !== id) return; // a gaveta já foi fechada ou trocou de perfil
      setBriefing(b);
      setDadosAbertos(true);
      toast.success("Dados extraídos do contexto. Revise e clique em Salvar contexto.");
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      setExtraindo(false);
    }
  }

  async function gravarImagens() {
    const a = ajustesImagens(dados!);
    if (a.drive_pasta_url && !idPastaDrive(a.drive_pasta_url)) return toast.error("O link da pasta do Drive não foi reconhecido.");
    setSalvando("imagens");
    try {
      await salvarPerfil(perfil!.id, a);
      toast.success("Imagens salvas.");
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      setSalvando(null);
    }
  }

  async function gravarConfig() {
    const d = dados!;
    const a = ajustesConfig(d);
    if (!a.nome) return toast.error("Informe o nome do perfil.");
    if (a.cta_tipo !== "CALL") {
      if (!a.cta_url) return toast.error("Informe o link do botão: Saiba mais e Agendar abrem um link.");
      if (!comUtm(a.cta_url)) return toast.error("O link do botão não parece um endereço válido.");
    }
    if (!a.agenda.length) return toast.error("Escolha pelo menos um dia da semana.");
    setSalvando("config");
    try {
      await salvarPerfil(d.id, a);
      toast.success("Configurações salvas.");
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      setSalvando(null);
    }
  }

  async function confirmarExclusao() {
    setExcluindo(true);
    try {
      await excluirPerfil(perfil!.id);
      toast.success("Perfil excluído.");
      setExcluir(false);
      onFechar();
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      setExcluindo(false);
    }
  }

  const set = (patch: Partial<PerfilGmn>) => setDados((d) => (d ? { ...d, ...patch } : d));

  // A logo já está gravada no servidor: atualiza a miniatura e recarrega o perfil salvo, sem mexer nos outros rascunhos.
  const id = perfil.id;
  const logoMudou = (url: string | null) => {
    setDados((d) => (d && d.id === id ? { ...d, logo_url: url } : d));
    onMudou();
  };

  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && tentarFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{perfil.nome}</SheetTitle>
          <SheetDescription>
            {perfil.location_name ? "Perfil sincronizado com o Google." : "Perfil criado à mão (ainda sem ligação com o Google)."}
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="contexto" className="mt-4">
          <TabsList>
            <TabsTrigger value="contexto">Contexto</TabsTrigger>
            <TabsTrigger value="imagens">Imagens</TabsTrigger>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
          </TabsList>

          <TabsContent value="contexto">
            <AbaContexto
              perfil={perfil}
              dados={dados}
              briefing={briefing}
              clientes={clientes}
              alterado={contextoAlterado}
              salvando={salvando === "contexto"}
              extraindo={extraindo}
              dadosAbertos={dadosAbertos}
              onDados={set}
              onBriefing={setBriefing}
              onDadosAbertos={setDadosAbertos}
              onExtrair={extrairDoContexto}
              onGerarIa={() => setIaAberto(true)}
              onSalvar={gravarContexto}
            />
          </TabsContent>

          <TabsContent value="imagens">
            <AbaImagens
              dados={dados}
              alterado={imagensAlteradas}
              salvando={salvando === "imagens"}
              onDados={set}
              onLogo={logoMudou}
              onSalvar={gravarImagens}
            />
          </TabsContent>

          <TabsContent value="agenda" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gmn-nome">Nome</Label>
                <Input id="gmn-nome" value={dados.nome} onChange={(e) => set({ nome: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gmn-categoria">Categoria</Label>
                <Input id="gmn-categoria" value={dados.categoria ?? ""} onChange={(e) => set({ categoria: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gmn-site">Site</Label>
                <Input id="gmn-site" value={dados.site ?? ""} onChange={(e) => set({ site: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gmn-endereco">Endereço</Label>
                <Input id="gmn-endereco" value={dados.endereco ?? ""} onChange={(e) => set({ endereco: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Dias e horários dos posts</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Dias da semana">
                {DIAS_CURTOS.map((rotulo, d) => {
                  const ligado = dados.agenda.some((x) => x.dia === d);
                  return (
                    <Button key={d} type="button" size="sm" variant={ligado ? "default" : "outline"} aria-pressed={ligado}
                      onClick={() => set({ agenda: alternarDia(dados.agenda, d) })}>
                      {rotulo}
                    </Button>
                  );
                })}
              </div>
              {dados.agenda.map((item) => (
                <div key={item.dia} className="flex flex-wrap items-center gap-3">
                  <span className="w-10 text-sm font-medium">{DIAS_CURTOS[item.dia]}</span>
                  <Select value={item.hora} onValueChange={(h) => set({ agenda: mudarHora(dados.agenda, item.dia, h) })}>
                    <SelectTrigger className="w-28" aria-label={`Horário de ${DIAS_CURTOS[item.dia]}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(HORARIOS.includes(item.hora) ? HORARIOS : [item.hora, ...HORARIOS]).map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-1" role="group" aria-label={`Imagem do post de ${DIAS_CURTOS[item.dia]}`}>
                    <Button type="button" size="sm" variant={item.imagem ? "default" : "outline"} aria-pressed={item.imagem}
                      onClick={() => { if (!item.imagem) set({ agenda: alternarImagem(dados.agenda, item.dia) }); }}>
                      <ImageIcon className="mr-1.5 h-4 w-4" aria-hidden />Com imagem
                    </Button>
                    <Button type="button" size="sm" variant={item.imagem ? "outline" : "default"} aria-pressed={!item.imagem}
                      onClick={() => { if (item.imagem) set({ agenda: alternarImagem(dados.agenda, item.dia) }); }}>
                      <Type className="mr-1.5 h-4 w-4" aria-hidden />Só texto
                    </Button>
                  </div>
                </div>
              ))}
              {new Set(dados.agenda.map((x) => x.hora)).size > 1 && (
                <Button type="button" size="sm" variant="outline" onClick={() => set({ agenda: mesmoHorario(dados.agenda, dados.agenda[0].hora) })}>
                  Usar {dados.agenda[0].hora} em todos
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                {dados.agenda.length === 0
                  ? "Nenhum dia escolhido: ligue pelo menos um."
                  : `${postsPorSemana(dados.agenda)}, no horário de Brasília.`}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gmn-cta-tipo">Botão do post</Label>
                <Select value={dados.cta_tipo} onValueChange={(v) => set({ cta_tipo: v as CtaTipo })}>
                  <SelectTrigger id="gmn-cta-tipo" aria-label="Botão do post"><SelectValue /></SelectTrigger>
                  <SelectContent>{CTAS.map((c) => <SelectItem key={c.v} value={c.v}>{c.rotulo}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {dados.cta_tipo !== "CALL" && (
                <div className="space-y-1.5">
                  <Label htmlFor="gmn-cta">Link do botão</Label>
                  <Input id="gmn-cta" placeholder="https://…" value={dados.cta_url ?? ""} onChange={(e) => set({ cta_url: e.target.value })} />
                  <p className="text-xs text-muted-foreground">
                    Obrigatório: Saiba mais e Agendar abrem este link. A UTM do Google Meu Negócio é acrescentada ao publicar.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <Button variant="outline" className="text-destructive" onClick={() => setExcluir(true)}>
                <Trash2 className="mr-2 h-4 w-4" />Excluir perfil
              </Button>
              <div className="flex flex-wrap items-center gap-3">
                {configAlterada && <span className={AVISO}>Alterações não salvas</span>}
                <Button onClick={gravarConfig} disabled={salvando !== null}>
                  {salvando === "config" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar configurações
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="posts" className="space-y-4">
            {algoAlterado && (
              <p className="text-xs text-muted-foreground">Há alterações não salvas: a prévia usa o que está salvo.</p>
            )}
            <PostsLista perfil={perfil} />
          </TabsContent>
        </Tabs>

        <GerarBriefingDialog perfil={perfil} aberto={iaAberto} onFechar={() => setIaAberto(false)} onGerado={(b) => { setBriefing(b); setDadosAbertos(true); }} />

        <AlertDialog open={descartar} onOpenChange={setDescartar}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
              <AlertDialogDescription>O que você mudou e não salvou neste perfil será perdido.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Continuar editando</AlertDialogCancel>
              <AlertDialogAction onClick={onFechar} className="bg-destructive hover:bg-destructive/90">Descartar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={excluir} onOpenChange={(o) => { if (!o && !excluindo) setExcluir(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir {perfil.nome}?</AlertDialogTitle>
              <AlertDialogDescription>O contexto, o briefing e o histórico de posts deste perfil somem do sistema. Nada muda no Google.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmarExclusao(); }} disabled={excluindo} className="bg-destructive hover:bg-destructive/90">
                {excluindo ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
