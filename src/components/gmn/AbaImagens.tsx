// Aba "Imagens" da gaveta do perfil: pasta do Drive, imagem por IA, contexto das imagens, logo e pessoas nas imagens.
// O arquivo da logo é gravado no próprio envio (não passa pelo "Salvar imagens"); o resto, inclusive a posição, o
// tamanho e o fundo da logo, é rascunho da gaveta.
import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { type PerfilGmn } from "@/lib/gmn";
import { ACEITA_IMAGENS } from "@/lib/gmnImagem";
import { caixaDaLogo } from "../../../supabase/functions/gmn/compor.ts";
import {
  FUNDOS_LOGO, LIMITE_CONTEXTO_IMAGENS, POSICOES_LOGO, ROTULO_FUNDO_LOGO, ROTULO_POSICAO_LOGO, ROTULO_TAMANHO_LOGO, TAMANHOS_LOGO,
  type FundoLogo, type PosicaoLogo, type TamanhoLogo,
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

export type LogoOcupada = "enviando" | "removendo" | null;

function LogoCliente({ dados, ocupada, onDados, onEnviar, onRemover }: {
  dados: PerfilGmn; ocupada: LogoOcupada; onDados: (patch: Partial<PerfilGmn>) => void;
  onEnviar: (arquivo: File) => void; onRemover: () => Promise<boolean>;
}) {
  const { nome, logo_url: logoUrl } = dados;
  const entrada = useRef<HTMLInputElement>(null);
  const botaoEnviar = useRef<HTMLButtonElement>(null);
  const [confirmar, setConfirmar] = useState(false);
  const enviando = ocupada === "enviando";
  const removendo = ocupada === "removendo";

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
        {logoUrl && (
          <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmar(true)} disabled={ocupada !== null}>
            <Trash2 className="mr-2 h-4 w-4" />Remover
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Opcional. Qualquer imagem (PNG, JPG, WEBP, SVG…), de qualquer tamanho: ela é convertida para PNG antes de subir. Se
        houver logo, ela é aplicada por cima de toda imagem gerada pela IA, exatamente como é (a IA nunca a redesenha). As
        fotos do Drive e do site vão como estão. A logo é gravada assim que você envia. A remoção também vale na hora.
      </p>

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

export function AbaImagens({ dados, alterado, salvando, ocupado, logoOcupada, onDados, onEnviarLogo, onRemoverLogo, onSalvar }: {
  dados: PerfilGmn; alterado: boolean;
  /** Este botão é o que está gravando (mostra o spinner). */
  salvando: boolean;
  /** Alguma gravação da gaveta está em andamento: todos os botões de salvar ficam travados. */
  ocupado: boolean;
  logoOcupada: LogoOcupada;
  onDados: (patch: Partial<PerfilGmn>) => void;
  /** O envio e a remoção da logo (com espera e avisos) ficam na gaveta; aqui só se dispara e se mostra. */
  onEnviarLogo: (arquivo: File) => void; onRemoverLogo: () => Promise<boolean>; onSalvar: () => void;
}) {
  const contexto = dados.contexto_imagens ?? "";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="gmn-drive">Pasta do Drive com fotos</Label>
        <Input id="gmn-drive" placeholder="https://drive.google.com/drive/folders/…" value={dados.drive_pasta_url ?? ""}
          aria-describedby="gmn-drive-dica" onChange={(e) => onDados({ drive_pasta_url: e.target.value })} />
        <p id="gmn-drive-dica" className="text-xs text-muted-foreground">
          Se preenchida, as imagens dos posts saem sempre desta pasta (fotos JPG ou PNG de até 5 MB, acessível para contato@andrelopes.digital).
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

      <LogoCliente dados={dados} ocupada={logoOcupada} onDados={onDados} onEnviar={onEnviarLogo} onRemover={onRemoverLogo} />

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

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button onClick={onSalvar} disabled={ocupado}>
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar imagens
        </Button>
        {alterado && <span className={AVISO}>Alterações não salvas</span>}
      </div>
      {alterado && (
        <p className="text-xs text-muted-foreground">
          Há alterações não salvas: a IA e a prévia usam o que está salvo. O arquivo da logo não entra nessa conta, porque é gravado no envio.
        </p>
      )}
    </div>
  );
}
