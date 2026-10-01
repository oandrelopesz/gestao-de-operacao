// Gaveta do perfil: Contexto, Imagens, Agenda e Posts.
import { useRef, useState } from "react";
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
  adicionarImagemSite, buscarFotosNoSite, buscarLogosNoSite, enviarLogo, excluirPerfil, gerarBriefingIa, gerarPrevia,
  removerImagemSite, removerLogo, salvarBriefing, salvarPerfil, traduzErroGmn, usarLogoDoSite,
  type CandidatoSite, type ClienteOpcao, type CtaTipo, type PerfilGmn,
} from "@/lib/gmn";
import {
  DIAS_CURTOS, HORARIOS, alternarDia, alternarImagem, comUtm, idPastaDrive, mesmoHorario, mudarHora, normalizarAgenda,
  normalizarBriefing, type Briefing, type ImagemSite, type ItemAgenda,
} from "../../../supabase/functions/gmn/regras.ts";
import { AbaContexto } from "./AbaContexto";
import { AbaImagens, type AcoesSite, type EstadoSite, type LogoOcupada } from "./AbaImagens";
import { GerarBriefingDialog } from "./GerarBriefingDialog";
import { PostsLista, type PreviaGerando } from "./PostsLista";

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

/**
 * O que "Salvar imagens" grava. O arquivo da logo (`logo_url`, `logo_origem_url`) e a lista de fotos do site marcadas
 * (`imagens_site`) são gravados na hora, fora daqui; posição, tamanho e fundo da logo e a chave das fotos do site entram.
 */
function ajustesImagens(d: PerfilGmn) {
  return {
    drive_pasta_url: vazioNulo(d.drive_pasta_url), usa_ia_imagem: d.usa_ia_imagem, usa_fotos_site: d.usa_fotos_site,
    contexto_imagens: vazioNulo(d.contexto_imagens), permitir_pessoas_ia: d.permitir_pessoas_ia,
    logo_posicao: d.logo_posicao, logo_tamanho: d.logo_tamanho, logo_fundo: d.logo_fundo,
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
  const [logoOcupada, setLogoOcupada] = useState<LogoOcupada>(null);
  // Busca no site (aba Imagens): os resultados são só da tela (somem ao fechar a gaveta); nada disso é rascunho nem é gravado.
  const [logosDoSite, setLogosDoSite] = useState<CandidatoSite[] | null>(null);
  const [fotosDoSite, setFotosDoSite] = useState<CandidatoSite[] | null>(null);
  const [buscandoSite, setBuscandoSite] = useState<EstadoSite["buscando"]>(null);
  const [logoEmGravacao, setLogoEmGravacao] = useState<string | null>(null);
  const [fotoEmGravacao, setFotoEmGravacao] = useState<EstadoSite["fotoEmGravacao"]>(null);
  const [previaGerando, setPreviaGerando] = useState<PreviaGerando>(null);
  const [postsVersao, setPostsVersao] = useState(0);
  const [substituir, setSubstituir] = useState(false);
  const [dadosAbertos, setDadosAbertos] = useState(true);
  const [iaAberto, setIaAberto] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [descartar, setDescartar] = useState(false);

  // Os rascunhos só são (re)iniciados quando a gaveta abre ou o perfil muda. A recarga depois de salvar traz um objeto
  // novo em `perfil`, mas não pode apagar o que ainda não foi salvo na outra aba.
  const [chave, setChave] = useState<string | null>(null);
  const chaveAtual = aberto && perfil ? perfil.id : null;
  // Cada abertura da gaveta (e cada troca de perfil) é uma sessão nova. Toda resposta que chega depois só vale se a sessão
  // for a mesma em que o pedido começou: o resultado velho não entra no rascunho novo, nem o fim de um pedido antigo
  // destrava a espera de um pedido novo.
  const sessaoRef = useRef(0);
  // Gravação de foto do site em curso (de qualquer sessão): a função acrescenta à lista lendo e regravando, então duas
  // gravações ao mesmo tempo poderiam perder uma. A espera da tela volta ao início com a sessão; este guarda, não.
  const fotoEmCursoRef = useRef(false);
  if (chave !== chaveAtual) {
    sessaoRef.current += 1;
    setChave(chaveAtual);
    // Os "ocupado" voltam ao início junto com os rascunhos: o perfil novo não herda a espera do anterior.
    setSalvando(null);
    setExtraindo(false);
    setLogoOcupada(null);
    setLogosDoSite(null);
    setFotosDoSite(null);
    setBuscandoSite(null);
    setLogoEmGravacao(null);
    setFotoEmGravacao(null);
    setPreviaGerando(null);
    setSubstituir(false);
    if (perfil && chaveAtual) {
      setBriefing(perfil.briefing);
      setDados(perfil);
      setDadosAbertos(!vazioNulo(perfil.contexto_posts)); // os dados extraídos só abrem sozinhos se ainda não há contexto
    }
  }

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

  // Início de um pedido ao servidor: devolve o "ainda é esta sessão?" para conferir quando a resposta chegar.
  function iniciarPedido() {
    const sessao = sessaoRef.current;
    return () => sessaoRef.current === sessao;
  }

  async function gravarContexto() {
    const d = dados!;
    const id = perfil!.id;
    const mesma = iniciarPedido();
    setSalvando("contexto");
    try {
      await salvarPerfil(id, { contexto_posts: vazioNulo(d.contexto_posts), saude: d.saude, cliente_id: d.cliente_id });
      await salvarBriefing(id, briefing!);
      // Já está gravado no servidor: o aviso e a recarga valem mesmo que a gaveta tenha sido fechada nesse meio-tempo.
      toast.success("Contexto salvo.");
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      if (mesma()) setSalvando(null);
    }
  }

  // Com alterações não salvas nos dados extraídos, a extração só segue depois de confirmar a substituição.
  function pedirExtracao() {
    if (JSON.stringify(normalizarBriefing(briefing!)) !== JSON.stringify(normalizarBriefing(perfil!.briefing))) setSubstituir(true);
    else extrairDoContexto();
  }

  async function extrairDoContexto() {
    const id = perfil!.id;
    const texto = vazioNulo(dados!.contexto_posts);
    if (!texto) return;
    const mesma = iniciarPedido();
    setExtraindo(true);
    try {
      const b = await gerarBriefingIa(id, null, texto);
      if (!mesma()) return; // a gaveta foi fechada ou trocou de perfil: o resultado é do contexto de outra sessão
      setBriefing(b);
      setDadosAbertos(true);
      toast.success("Dados extraídos do contexto. Revise e clique em Salvar contexto.");
    } catch (e) {
      if (mesma()) toast.error(traduzErroGmn(e));
    } finally {
      if (mesma()) setExtraindo(false);
    }
  }

  async function gravarImagens() {
    const a = ajustesImagens(dados!);
    if (a.drive_pasta_url && !idPastaDrive(a.drive_pasta_url)) return toast.error("O link da pasta do Drive não foi reconhecido.");
    const mesma = iniciarPedido();
    setSalvando("imagens");
    try {
      await salvarPerfil(perfil!.id, a);
      toast.success("Imagens salvas.");
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      if (mesma()) setSalvando(null);
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
    const mesma = iniciarPedido();
    setSalvando("config");
    try {
      await salvarPerfil(d.id, a);
      toast.success("Configurações salvas.");
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      if (mesma()) setSalvando(null);
    }
  }

  // A logo é gravada no servidor no próprio envio (não é rascunho). Por isso a miniatura é atualizada se a gaveta ainda
  // estiver no mesmo perfil, mesmo numa sessão nova; só a espera ("ocupado") fica presa à sessão do pedido. O envio do
  // computador não tem site de origem: `logo_origem_url` volta a null (a recarga traz o mesmo valor para o "salvo").
  async function enviarLogoDoPerfil(arquivo: File) {
    const id = perfil!.id;
    const mesma = iniciarPedido();
    setLogoOcupada("enviando");
    try {
      const url = await enviarLogo(id, arquivo, null);
      setDados((d) => (d && d.id === id ? { ...d, logo_url: url, logo_origem_url: null } : d));
      toast.success("Logo enviada.");
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      if (mesma()) setLogoOcupada(null);
    }
  }

  /** Devolve true quando a logo foi removida (a tela fecha a confirmação). */
  async function removerLogoDoPerfil(): Promise<boolean> {
    const id = perfil!.id;
    const mesma = iniciarPedido();
    setLogoOcupada("removendo");
    try {
      await removerLogo(id);
      setDados((d) => (d && d.id === id ? { ...d, logo_url: null, logo_origem_url: null } : d));
      toast.success("Logo removida.");
      onMudou();
      return true;
    } catch (e) {
      toast.error(traduzErroGmn(e));
      return false;
    } finally {
      if (mesma()) setLogoOcupada(null);
    }
  }

  // Busca no site: só lê e classifica (não grava nada). O resultado e a espera valem só na sessão em que o pedido começou.
  async function buscarNoSite(tipo: "logos" | "fotos") {
    const id = perfil!.id;
    const mesma = iniciarPedido();
    setBuscandoSite(tipo);
    try {
      const lista = tipo === "logos" ? await buscarLogosNoSite(id) : await buscarFotosNoSite(id);
      if (!mesma()) return; // a gaveta foi fechada ou trocou de perfil: o resultado é do site de outra sessão
      if (tipo === "logos") setLogosDoSite(lista);
      else setFotosDoSite(lista);
    } catch (e) {
      if (mesma()) toast.error(traduzErroGmn(e));
    } finally {
      if (mesma()) setBuscandoSite(null);
    }
  }

  // Usar uma logo achada no site grava como o envio do computador (na hora), só que guardando de onde ela veio. Como lá, o
  // rascunho é atualizado se a gaveta ainda estiver no mesmo perfil; só a espera fica presa à sessão do pedido.
  async function usarLogoDoSitePerfil(c: CandidatoSite) {
    const id = perfil!.id;
    const mesma = iniciarPedido();
    setLogoOcupada("usando");
    setLogoEmGravacao(c.url);
    try {
      const url = await usarLogoDoSite(id, c.url);
      setDados((d) => (d && d.id === id ? { ...d, logo_url: url, logo_origem_url: c.url } : d));
      toast.success("Logo do site em uso.");
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      if (mesma()) {
        setLogoOcupada(null);
        setLogoEmGravacao(null);
      }
    }
  }

  // Marcar e desmarcar fotos do site gravam na hora (fora do "Salvar imagens") e uma por vez: a lista nova vem do servidor
  // (marcar) ou é a lista atual sem a foto (desmarcar), e entra no rascunho se a gaveta ainda estiver no mesmo perfil.
  async function gravarFotoDoSite(origem: string, acao: "marcando" | "removendo", gravar: () => Promise<ImagemSite[]>, aviso: string) {
    if (fotoEmCursoRef.current) return toast.info("Aguarde: outra foto do site ainda está sendo gravada.");
    fotoEmCursoRef.current = true;
    const id = perfil!.id;
    const mesma = iniciarPedido();
    setFotoEmGravacao({ origem, acao });
    try {
      const lista = await gravar();
      setDados((d) => (d && d.id === id ? { ...d, imagens_site: lista } : d));
      toast.success(aviso);
      onMudou();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      fotoEmCursoRef.current = false;
      if (mesma()) setFotoEmGravacao(null);
    }
  }

  function marcarFotoDoSite(c: CandidatoSite) {
    const id = perfil!.id;
    return gravarFotoDoSite(c.url, "marcando", () => adicionarImagemSite(id, c), "Foto marcada para os posts.");
  }

  function desmarcarFotoDoSite(imagemId: string) {
    const id = perfil!.id;
    const lista = dados!.imagens_site;
    const foto = lista.find((i) => i.id === imagemId);
    if (!foto) return;
    return gravarFotoDoSite(foto.origem_url, "removendo", () => removerImagemSite(id, lista, imagemId), "Foto desmarcada.");
  }

  async function gerarPreviaDoPerfil(comImagem: boolean) {
    const id = perfil!.id;
    const mesma = iniciarPedido();
    setPreviaGerando(comImagem ? "com" : "sem");
    try {
      const p = await gerarPrevia(id, comImagem);
      // O post já existe no servidor: o aviso vale sempre; a lista só é recarregada se esta sessão ainda estiver na tela.
      if (p.status === "gerado") {
        if (p.erro) toast.warning(`Prévia gerada com aviso: ${p.erro}`);
        else toast.success("Prévia pronta.");
      } else if (p.status === "pulado") toast.warning(`Prévia pulada: ${p.erro ?? "motivo não informado"}`);
      else toast.error(`Não foi possível gerar a prévia: ${p.erro ?? "motivo não informado"}`);
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      // Sempre, mesmo com erro (ex.: 409 de prévia já em andamento) ou com a gaveta reaberta: a lista precisa ficar em dia
      setPostsVersao((v) => v + 1);
      if (mesma()) setPreviaGerando(null);
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
  const gravando = salvando !== null; // enquanto uma gravação roda, nenhum botão de salvar fica livre
  const estadoSite: EstadoSite = {
    logos: logosDoSite, fotos: fotosDoSite, buscando: buscandoSite, logoEmGravacao, fotoEmGravacao,
  };
  const acoesSite: AcoesSite = {
    onBuscarLogos: () => buscarNoSite("logos"), onBuscarFotos: () => buscarNoSite("fotos"),
    onUsarLogo: usarLogoDoSitePerfil, onMarcarFoto: marcarFotoDoSite, onDesmarcarFoto: desmarcarFotoDoSite,
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
              ocupado={gravando}
              extraindo={extraindo}
              dadosAbertos={dadosAbertos}
              onDados={set}
              onBriefing={setBriefing}
              onDadosAbertos={setDadosAbertos}
              onExtrair={pedirExtracao}
              onGerarIa={() => setIaAberto(true)}
              onSalvar={gravarContexto}
            />
          </TabsContent>

          <TabsContent value="imagens">
            <AbaImagens
              dados={dados}
              siteSalvo={vazioNulo(perfil.site)}
              site={estadoSite}
              alterado={imagensAlteradas}
              salvando={salvando === "imagens"}
              ocupado={gravando}
              logoOcupada={logoOcupada}
              onDados={set}
              onEnviarLogo={enviarLogoDoPerfil}
              onRemoverLogo={removerLogoDoPerfil}
              acoesSite={acoesSite}
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
                <Button onClick={gravarConfig} disabled={gravando}>
                  {salvando === "config" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar configurações
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="posts" className="space-y-4">
            {algoAlterado && (
              <p className="text-xs text-muted-foreground">Há alterações não salvas: a prévia usa o que está salvo.</p>
            )}
            <PostsLista perfil={perfil} gerando={previaGerando} versao={postsVersao} onGerar={gerarPreviaDoPerfil} />
          </TabsContent>
        </Tabs>

        <GerarBriefingDialog perfil={perfil} aberto={iaAberto} onFechar={() => setIaAberto(false)} onGerado={(b) => { setBriefing(b); setDadosAbertos(true); }} />

        <AlertDialog open={substituir} onOpenChange={setSubstituir}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Substituir os dados extraídos?</AlertDialogTitle>
              <AlertDialogDescription>
                Os dados extraídos têm alterações não salvas. Extrair do contexto vai trocá-las pelo que a IA tirar do texto.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={extrairDoContexto}>Substituir e extrair</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
              <AlertDialogDescription>O contexto, os dados extraídos e o histórico de posts deste perfil somem do sistema. Nada muda no Google.</AlertDialogDescription>
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
