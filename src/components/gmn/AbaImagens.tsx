// Aba "Imagens" da gaveta do perfil: pasta do Drive, imagem por IA, contexto das imagens, logo, pessoas nas imagens e
// fotos do site. O arquivo da logo e as fotos do site marcadas são gravados na hora (não passam pelo "Salvar imagens");
// o resto, inclusive a posição, o tamanho e o fundo da logo e a chave das fotos do site, é rascunho da gaveta.
// Os resultados da busca no site e as esperas ficam na gaveta (sobrevivem à troca de aba e somem ao fechá-la).
import { useRef, useState } from "react";
import { Check, Globe, Loader2, Trash2, Upload } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { type CandidatoSite, type PerfilGmn } from "@/lib/gmn";
import { ACEITA_IMAGENS } from "@/lib/gmnImagem";
import { caixaDaLogo } from "../../../supabase/functions/gmn/compor.ts";
import {
  FUNDOS_LOGO, LIMITE_CONTEXTO_IMAGENS, POSICOES_LOGO, ROTULO_FUNDO_LOGO, ROTULO_POSICAO_LOGO, ROTULO_TAMANHO_LOGO, TAMANHOS_LOGO,
  type FundoLogo, type ImagemSite, type PosicaoLogo, type TamanhoLogo,
} from "../../../supabase/functions/gmn/regras.ts";

const AVISO = "text-xs font-medium text-amber-600 dark:text-amber-400";

/** Tamanho da imagem da IA (paisagem 3:2): a prévia usa as mesmas contas da função que aplica a logo. */
const IMAGEM_PREVIA = { largura: 1536, altura: 1024 };
const pct = (v: number, total: number) => `${(v / total) * 100}%`;

/** Caixa 3:2 que faz de conta de imagem da IA e mostra onde a logo (e o fundo atrás dela) entra com as opções do rascunho. */
function PreviaLogo({ url, nome, posicao, tamanho, fundo }: {
  url: string; nome: string; posicao: PosicaoLogo; tamanho: TamanhoLogo; fundo: FundoLogo;
}) {
  const [natural, setNatural] = useState<{ largura: number; altura: number } | null>(null);
  const [quebrou, setQuebrou] = useState(false);
  if (quebrou) {
    return <p className="text-xs text-destructive">Não foi possível carregar a logo para a prévia da posição.</p>;
  }
  const caixa = natural ? caixaDaLogo(IMAGEM_PREVIA, natural, tamanho, posicao, fundo !== "nenhum") : null;
  const { largura: L, altura: A } = IMAGEM_PREVIA;
  return (
    <figure className="m-0 space-y-1.5">
      <div className="relative aspect-[3/2] w-full max-w-sm overflow-hidden rounded-md border bg-gradient-to-br from-neutral-500 to-neutral-700">
        <span className="pointer-events-none absolute inset-0 flex select-none items-center justify-center text-sm font-medium text-white/70">
          Imagem da IA
        </span>
        {caixa?.fundo && (
          <div
            aria-hidden
            className={`absolute rounded-md ${fundo === "claro" ? "bg-white/90" : "bg-neutral-900/90"}`}
            style={{ left: pct(caixa.fundo.x, L), top: pct(caixa.fundo.y, A), width: pct(caixa.fundo.largura, L), height: pct(caixa.fundo.altura, A) }}
          />
        )}
        <img
          src={url}
          alt={`Prévia da posição da logo de ${nome}`}
          className={`absolute object-contain ${caixa ? "" : "invisible"}`}
          style={caixa ? { left: pct(caixa.logo.x, L), top: pct(caixa.logo.y, A), width: pct(caixa.logo.largura, L), height: pct(caixa.logo.altura, A) } : undefined}
          onLoad={(e) => {
            const { naturalWidth, naturalHeight } = e.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0) setNatural({ largura: naturalWidth, altura: naturalHeight });
            else setQuebrou(true);
          }}
          onError={() => setQuebrou(true)}
        />
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Prévia de onde a logo entra. A posição e o tamanho valem depois de Salvar imagens.
      </figcaption>
    </figure>
  );
}

/** Miniatura da logo; se o arquivo não carregar, diz isso em texto em vez de mostrar uma imagem quebrada. */
function Miniatura({ url, nome }: { url: string; nome: string }) {
  const [quebrou, setQuebrou] = useState(false);
  if (quebrou) {
    return <p className="text-xs text-destructive">Não foi possível carregar a miniatura da logo.</p>;
  }
  return (
    <img
      src={url}
      alt={`Logo de ${nome}`}
      className="h-16 w-16 rounded-md border bg-muted object-contain p-1"
      onError={() => setQuebrou(true)}
    />
  );
}

/** "usando": a logo escolhida entre as achadas no site está sendo baixada e gravada. */
export type LogoOcupada = "enviando" | "removendo" | "usando" | null;

/** Resultados e esperas da busca no site. Ficam na gaveta (não nesta aba): trocar de aba não os perde; fechar a gaveta, sim. */
export interface EstadoSite {
  /** Logos achadas no site; `null` enquanto ainda não houve busca. */
  logos: CandidatoSite[] | null;
  /** Fotos achadas no site; `null` enquanto ainda não houve busca. */
  fotos: CandidatoSite[] | null;
  buscando: "logos" | "fotos" | null;
  /** Endereço da logo achada que está sendo gravada. */
  logoEmGravacao: string | null;
  /** A foto que está sendo marcada ou desmarcada (`origem`: endereço dela no site). Enquanto houver uma, todas as caixas de foto ficam travadas. */
  fotoEmGravacao: { origem: string; acao: "marcando" | "removendo" } | null;
}

export interface AcoesSite {
  onBuscarLogos: () => void;
  onBuscarFotos: () => void;
  onUsarLogo: (c: CandidatoSite) => void;
  onMarcarFoto: (c: CandidatoSite) => void;
  onDesmarcarFoto: (id: string) => void;
}

const SEM_SITE = "Preencha o site na aba Agenda e salve.";

/** Fundo xadrez claro: deixa ver a transparência de uma logo, seja qual for o tema da tela. */
const XADREZ: React.CSSProperties = {
  backgroundColor: "#ffffff",
  backgroundImage:
    "linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%), " +
    "linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 8px 8px",
};

/**
 * Cartão de uma imagem achada no site do cliente. O endereço é de outro site: sem referrer e com carregamento preguiçoso.
 * Se a imagem não abrir, o cartão some (não há o que escolher nele).
 */
function CartaoSite({ url, alt, logo, children }: { url: string; alt: string; logo: boolean; children: React.ReactNode }) {
  const [escondido, setEscondido] = useState(false);
  if (escondido) return null;
  return (
    <li className="flex flex-col overflow-hidden rounded-md border bg-card">
      <div className={`aspect-[3/2] w-full overflow-hidden ${logo ? "" : "bg-muted"}`} style={logo ? XADREZ : undefined}>
        <img
          src={url}
          alt={alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          className={logo ? "h-full w-full object-contain p-2" : "h-full w-full object-cover"}
          onError={() => setEscondido(true)}
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">{children}</div>
    </li>
  );
}

/** A caixa "Usar …" de um cartão: o nome acessível diz de qual imagem se trata; a espera e o "marcada" também saem em texto. */
function CaixaUsar({ id, rotulo, nome, marcada, selo, espera, travada, onMudar }: {
  id: string; rotulo: string; nome: string; marcada: boolean;
  /** Texto ao lado da caixa marcada (a cor da caixa não é o único sinal). */
  selo?: string;
  /** Texto da espera deste cartão (ex.: "Gravando…"); `null` se não há. */
  espera: string | null;
  travada: boolean; onMudar: (marcar: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Checkbox id={id} checked={marcada} disabled={travada} aria-label={`${rotulo}: ${nome}`} onCheckedChange={(v) => onMudar(v === true)} />
      <Label htmlFor={id} className="text-sm font-normal">{rotulo}</Label>
      {espera ? (
        <span role="status" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />{espera}
        </span>
      ) : marcada && selo ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="h-3 w-3" aria-hidden />{selo}
        </span>
      ) : null}
    </div>
  );
}

/** Uma foto do site já marcada: a miniatura é a cópia guardada no R2 (se não abrir, avisa em texto e a caixa continua ali). */
function FotoMarcada({ foto, n, travada, espera, onDesmarcar }: {
  foto: ImagemSite; n: number; travada: boolean; espera: string | null; onDesmarcar: (id: string) => void;
}) {
  const [quebrou, setQuebrou] = useState(false);
  return (
    <li className="flex gap-3 rounded-md border bg-card p-2">
      {quebrou ? (
        <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded border bg-muted p-1 text-center text-xs text-muted-foreground">
          Miniatura indisponível
        </div>
      ) : (
        <img src={foto.url} alt="" loading="lazy" className="h-16 w-24 shrink-0 rounded border bg-muted object-cover" onError={() => setQuebrou(true)} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="line-clamp-2 text-xs" title={foto.descricao || undefined}>
          {foto.descricao || "Sem descrição: esta foto não entra nos posts."}
        </p>
        <CaixaUsar
          id={`gmn-foto-marcada-${foto.id}`} rotulo="Usar nos posts" nome={foto.descricao || `Foto ${n}`} marcada
          espera={espera} travada={travada} onMudar={(marcar) => { if (!marcar) onDesmarcar(foto.id); }}
        />
      </div>
    </li>
  );
}

function LogoCliente({ dados, ocupada, siteSalvo, site, onDados, onEnviar, onRemover, onBuscarLogos, onUsarLogo }: {
  dados: PerfilGmn; ocupada: LogoOcupada; siteSalvo: string | null; site: EstadoSite;
  onDados: (patch: Partial<PerfilGmn>) => void;
  onEnviar: (arquivo: File) => void; onRemover: () => Promise<boolean>;
  onBuscarLogos: () => void; onUsarLogo: (c: CandidatoSite) => void;
}) {
  const { nome, logo_url: logoUrl } = dados;
  const entrada = useRef<HTMLInputElement>(null);
  const botaoEnviar = useRef<HTMLButtonElement>(null);
  const [confirmar, setConfirmar] = useState(false);
  const enviando = ocupada === "enviando";
  const removendo = ocupada === "removendo";
  const buscandoLogos = site.buscando === "logos";

  function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (arquivo) onEnviar(arquivo);
  }

  async function remover() {
    if (await onRemover()) setConfirmar(false);
  }

  return (
    <div className="space-y-2">
      <Label id="gmn-logo-rotulo">Logo do cliente</Label>
      <div className="flex flex-wrap items-center gap-3" role="group" aria-labelledby="gmn-logo-rotulo">
        {logoUrl ? <Miniatura key={logoUrl} url={logoUrl} nome={nome} /> : <span className="text-sm text-muted-foreground">Sem logo</span>}
        <input ref={entrada} type="file" accept={ACEITA_IMAGENS} className="hidden" tabIndex={-1} aria-label="Arquivo da logo (qualquer imagem)" onChange={aoEscolher} />
        <Button ref={botaoEnviar} type="button" variant="outline" size="sm" onClick={() => entrada.current?.click()} disabled={ocupada !== null}>
          {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {enviando ? "Enviando…" : "Enviar logo"}
        </Button>
        <Button
          type="button" variant="outline" size="sm" onClick={onBuscarLogos} disabled={!siteSalvo || site.buscando !== null}
          aria-describedby={siteSalvo ? undefined : "gmn-logo-site-dica"}
        >
          {buscandoLogos ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
          {buscandoLogos ? "Buscando no site…" : "Buscar logo no site"}
        </Button>
        {logoUrl && (
          <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmar(true)} disabled={ocupada !== null}>
            <Trash2 className="mr-2 h-4 w-4" />Remover
          </Button>
        )}
      </div>
      {!siteSalvo && <p id="gmn-logo-site-dica" className="text-xs text-muted-foreground">{SEM_SITE}</p>}
      <p className="text-xs text-muted-foreground">
        Opcional. Qualquer imagem (PNG, JPG, WEBP, SVG…), de qualquer tamanho: ela é convertida para PNG antes de subir. Se
        houver logo, ela é aplicada por cima de toda imagem gerada pela IA, exatamente como é (a IA nunca a redesenha). As
        fotos do Drive e do site vão como estão. A logo é gravada assim que você envia. A remoção também vale na hora.
        Também dá para buscar a logo no site do cliente.
      </p>
      {buscandoLogos && (
        <p role="status" className="text-xs text-muted-foreground">Lendo o site e conferindo as imagens com a IA; pode demorar um pouco.</p>
      )}

      {site.logos !== null && site.logos.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">Nenhuma logo encontrada nesse site.</p>
      )}
      {site.logos !== null && site.logos.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Logos encontradas no site</h3>
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
            {site.logos.map((c, i) => {
              const marcada = dados.logo_origem_url === c.url;
              return (
                <CartaoSite key={c.url} url={c.url} alt={`Logo ${i + 1} encontrada no site`} logo>
                  <CaixaUsar
                    id={`gmn-logo-site-${i}`} rotulo="Usar esta logo" nome={`Logo ${i + 1}`} marcada={marcada} selo="Logo em uso"
                    espera={site.logoEmGravacao === c.url ? "Gravando…" : null} travada={ocupada !== null}
                    onMudar={(marcar) => { if (marcar) onUsarLogo(c); else setConfirmar(true); }}
                  />
                </CartaoSite>
              );
            })}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="gmn-logo-posicao">Posição da logo</Label>
          <Select value={dados.logo_posicao} onValueChange={(v) => onDados({ logo_posicao: v as PosicaoLogo })}>
            <SelectTrigger id="gmn-logo-posicao" aria-label="Posição da logo"><SelectValue /></SelectTrigger>
            <SelectContent>
              {POSICOES_LOGO.map((v) => <SelectItem key={v} value={v}>{ROTULO_POSICAO_LOGO[v]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gmn-logo-tamanho">Tamanho da logo</Label>
          <Select value={dados.logo_tamanho} onValueChange={(v) => onDados({ logo_tamanho: v as TamanhoLogo })}>
            <SelectTrigger id="gmn-logo-tamanho" aria-label="Tamanho da logo"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TAMANHOS_LOGO.map((v) => <SelectItem key={v} value={v}>{ROTULO_TAMANHO_LOGO[v]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gmn-logo-fundo">Fundo atrás da logo</Label>
          <Select value={dados.logo_fundo} onValueChange={(v) => onDados({ logo_fundo: v as FundoLogo })}>
            <SelectTrigger id="gmn-logo-fundo" aria-label="Fundo atrás da logo"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FUNDOS_LOGO.map((v) => <SelectItem key={v} value={v}>{ROTULO_FUNDO_LOGO[v]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {logoUrl && (
        <PreviaLogo
          key={logoUrl} url={logoUrl} nome={nome} posicao={dados.logo_posicao} tamanho={dados.logo_tamanho} fundo={dados.logo_fundo}
        />
      )}

      <AlertDialog open={confirmar} onOpenChange={(o) => { if (!o && !removendo) setConfirmar(false); }}>
        {/* Sem logo, o botão Remover some: o foco volta para Enviar logo em vez de se perder. */}
        <AlertDialogContent onCloseAutoFocus={(e) => { if (!logoUrl) { e.preventDefault(); botaoEnviar.current?.focus(); } }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover a logo?</AlertDialogTitle>
            <AlertDialogDescription>As próximas imagens geradas pela IA deste perfil saem sem a logo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); remover(); }} disabled={removendo} className="bg-destructive hover:bg-destructive/90">
              {removendo ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Seção "Fotos do site": a chave "Usar fotos do site nos posts" (rascunho, gravada no "Salvar imagens"). Desligada, a lista
 * marcada fica guardada e oculta; ligada, mostra a busca, as fotos achadas e as marcadas. Marcar e desmarcar gravam na hora.
 */
function FotosDoSite({ dados, siteSalvo, site, acoes, onDados }: {
  dados: PerfilGmn; siteSalvo: string | null; site: EstadoSite; acoes: AcoesSite; onDados: (patch: Partial<PerfilGmn>) => void;
}) {
  const ligado = dados.usa_fotos_site;
  const marcadas = dados.imagens_site;
  const gravando = site.fotoEmGravacao;
  const buscando = site.buscando === "fotos";
  // Uma gravação por vez: com uma em andamento, todas as caixas de foto ficam travadas.
  const travada = gravando !== null;
  const espera = (origem: string) =>
    gravando?.origem === origem ? (gravando.acao === "marcando" ? "Gravando…" : "Removendo…") : null;

  return (
    <section aria-labelledby="gmn-fotos-site-titulo" className="space-y-3">
      <h3 id="gmn-fotos-site-titulo" className="text-sm font-medium leading-none">Fotos do site</h3>
      <div className="flex items-center gap-2">
        <Switch id="gmn-usa-fotos-site" checked={ligado} aria-describedby="gmn-fotos-site-dica"
          onCheckedChange={(v) => onDados({ usa_fotos_site: v })} />
        <Label htmlFor="gmn-usa-fotos-site" className="text-sm font-normal">Usar fotos do site nos posts</Label>
      </div>
      <p id="gmn-fotos-site-dica" className="text-xs text-muted-foreground">
        {ligado
          ? "Uma foto do site só entra num post quando combina com o assunto dele (a IA confere). Se nenhuma combinar, o post usa a imagem da IA, se estiver ligada, ou sai só com texto. Com a pasta do Drive preenchida, as fotos do site não são usadas: o Drive vem primeiro."
          : "Desligado: as fotos do site não entram nos posts."}
      </p>

      {ligado && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button" variant="outline" size="sm" onClick={acoes.onBuscarFotos} disabled={!siteSalvo || site.buscando !== null}
              aria-describedby={siteSalvo ? undefined : "gmn-fotos-site-sem-site"}
            >
              {buscando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
              {buscando ? "Buscando no site…" : "Buscar fotos no site"}
            </Button>
            {!siteSalvo && <span id="gmn-fotos-site-sem-site" className="text-xs text-muted-foreground">{SEM_SITE}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            As fotos marcadas são guardadas na hora; só a chave acima depende do Salvar imagens.
          </p>
          {buscando && (
            <p role="status" className="text-xs text-muted-foreground">Lendo o site e conferindo as imagens com a IA; pode demorar um pouco.</p>
          )}

          {site.fotos !== null && site.fotos.length === 0 && (
            <p role="status" className="text-sm text-muted-foreground">Nenhuma foto encontrada nesse site.</p>
          )}
          {site.fotos !== null && site.fotos.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Fotos encontradas no site</h4>
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
                {site.fotos.map((c, i) => {
                  const marcada = marcadas.find((m) => m.origem_url === c.url);
                  return (
                    <CartaoSite key={c.url} url={c.url} alt="" logo={false}>
                      <p className="line-clamp-2 text-xs" title={c.descricao || undefined}>
                        {c.descricao || "Sem descrição: a IA descreve ao marcar"}
                      </p>
                      <CaixaUsar
                        id={`gmn-foto-site-${i}`} rotulo="Usar nos posts" nome={c.descricao || `Foto ${i + 1}`} marcada={!!marcada} selo="Marcada"
                        espera={espera(c.url)} travada={travada}
                        onMudar={(marcar) => { if (marcar) acoes.onMarcarFoto(c); else if (marcada) acoes.onDesmarcarFoto(marcada.id); }}
                      />
                    </CartaoSite>
                  );
                })}
              </ul>
            </div>
          )}

          {marcadas.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Fotos do site marcadas ({marcadas.length})</h4>
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
                {marcadas.map((f, i) => (
                  <FotoMarcada key={f.id} foto={f} n={i + 1} travada={travada} espera={espera(f.origem_url)} onDesmarcar={acoes.onDesmarcarFoto} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function AbaImagens({
  dados, siteSalvo, site, alterado, salvando, ocupado, logoOcupada, onDados, onEnviarLogo, onRemoverLogo, acoesSite, onSalvar,
}: {
  dados: PerfilGmn;
  /** O site que está salvo no perfil (aba Agenda): a busca usa o salvo, não o que está digitado e ainda sem salvar. */
  siteSalvo: string | null;
  site: EstadoSite;
  alterado: boolean;
  /** Este botão é o que está gravando (mostra o spinner). */
  salvando: boolean;
  /** Alguma gravação da gaveta está em andamento: todos os botões de salvar ficam travados. */
  ocupado: boolean;
  logoOcupada: LogoOcupada;
  onDados: (patch: Partial<PerfilGmn>) => void;
  /** O envio e a remoção da logo (com espera e avisos) ficam na gaveta; aqui só se dispara e se mostra. */
  onEnviarLogo: (arquivo: File) => void; onRemoverLogo: () => Promise<boolean>;
  /** As buscas no site e a marcação das imagens do site também ficam na gaveta. */
  acoesSite: AcoesSite;
  onSalvar: () => void;
}) {
  const contexto = dados.contexto_imagens ?? "";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="gmn-drive">Pasta do Drive com fotos</Label>
        <Input id="gmn-drive" placeholder="https://drive.google.com/drive/folders/…" value={dados.drive_pasta_url ?? ""}
          aria-describedby="gmn-drive-dica" onChange={(e) => onDados({ drive_pasta_url: e.target.value })} />
        <p id="gmn-drive-dica" className="text-xs text-muted-foreground">
          Se preenchida, as imagens dos posts saem sempre desta pasta (qualquer foto, de qualquer formato e tamanho; a pasta precisa estar acessível para contato@andrelopes.digital).
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Switch id="gmn-usa-ia" checked={dados.usa_ia_imagem} onCheckedChange={(v) => onDados({ usa_ia_imagem: v })} />
        <Label htmlFor="gmn-usa-ia" className="text-sm font-normal">Gerar imagem com IA quando não houver pasta do Drive</Label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gmn-contexto-imagens">Contexto para as imagens</Label>
        <Textarea id="gmn-contexto-imagens" rows={10} value={contexto} aria-describedby="gmn-contexto-imagens-dica"
          onChange={(e) => onDados({ contexto_imagens: e.target.value })} />
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <p id="gmn-contexto-imagens-dica" className="text-xs text-muted-foreground">
            Cole aqui o contexto de imagens gerado pelo prompt de imagens (identidade visual, estilo, o que mostrar e o que nunca mostrar).
          </p>
          <p className="text-xs text-muted-foreground">{contexto.length.toLocaleString("pt-BR")} caracteres</p>
        </div>
        {contexto.length > LIMITE_CONTEXTO_IMAGENS && (
          <p className={AVISO}>
            Só os primeiros {LIMITE_CONTEXTO_IMAGENS.toLocaleString("pt-BR")} caracteres entram nas imagens.
          </p>
        )}
      </div>

      <LogoCliente
        dados={dados} ocupada={logoOcupada} siteSalvo={siteSalvo} site={site} onDados={onDados} onEnviar={onEnviarLogo}
        onRemover={onRemoverLogo} onBuscarLogos={acoesSite.onBuscarLogos} onUsarLogo={acoesSite.onUsarLogo}
      />

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Switch id="gmn-pessoas-ia" checked={dados.permitir_pessoas_ia} aria-describedby="gmn-pessoas-ia-dica"
            onCheckedChange={(v) => onDados({ permitir_pessoas_ia: v })} />
          <Label htmlFor="gmn-pessoas-ia" className="text-sm font-normal">Permitir pessoas nas imagens da IA</Label>
        </div>
        <p id="gmn-pessoas-ia-dica" className="text-xs text-muted-foreground">
          Desligado, a IA nunca gera pessoas e cada imagem é conferida antes de usar.
        </p>
      </div>

      <FotosDoSite dados={dados} siteSalvo={siteSalvo} site={site} acoes={acoesSite} onDados={onDados} />

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button onClick={onSalvar} disabled={ocupado}>
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar imagens
        </Button>
        {alterado && <span className={AVISO}>Alterações não salvas</span>}
      </div>
      {alterado && (
        <p className="text-xs text-muted-foreground">
          Há alterações não salvas: a IA e a prévia usam o que está salvo. O arquivo da logo e as fotos do site marcadas não entram nessa conta, porque são gravados na hora.
        </p>
      )}
    </div>
  );
}
