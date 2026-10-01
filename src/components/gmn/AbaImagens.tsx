// Aba "Imagens" da gaveta do perfil: pasta do Drive, imagem por IA, contexto das imagens, logo e pessoas nas imagens.
// A logo é gravada no próprio envio (não passa pelo "Salvar imagens"); o resto é rascunho da gaveta.
import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { enviarLogo, removerLogo, traduzErroGmn, type PerfilGmn } from "@/lib/gmn";
import { LIMITE_CONTEXTO_IMAGENS } from "../../../supabase/functions/gmn/regras.ts";

const AVISO = "text-xs font-medium text-amber-600 dark:text-amber-400";

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

function LogoCliente({ perfilId, nome, logoUrl, onLogo }: {
  perfilId: string; nome: string; logoUrl: string | null; onLogo: (url: string | null) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [removendo, setRemovendo] = useState(false);

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;
    setEnviando(true);
    try {
      const url = await enviarLogo(perfilId, arquivo);
      onLogo(url);
      toast.success("Logo enviada.");
    } catch (err) {
      toast.error(traduzErroGmn(err));
    } finally {
      setEnviando(false);
    }
  }

  async function remover() {
    setRemovendo(true);
    try {
      await removerLogo(perfilId);
      onLogo(null);
      toast.success("Logo removida.");
      setConfirmar(false);
    } catch (err) {
      toast.error(traduzErroGmn(err));
    } finally {
      setRemovendo(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label id="gmn-logo-rotulo">Logo do cliente</Label>
      <div className="flex flex-wrap items-center gap-3" role="group" aria-labelledby="gmn-logo-rotulo">
        {logoUrl ? <Miniatura key={logoUrl} url={logoUrl} nome={nome} /> : <span className="text-sm text-muted-foreground">Sem logo</span>}
        <input ref={entrada} type="file" accept="image/png,image/jpeg" className="hidden" tabIndex={-1} aria-label="Arquivo da logo (PNG ou JPG, até 5 MB)" onChange={aoEscolher} />
        <Button type="button" variant="outline" size="sm" onClick={() => entrada.current?.click()} disabled={enviando || removendo}>
          {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {enviando ? "Enviando…" : "Enviar logo"}
        </Button>
        {logoUrl && (
          <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmar(true)} disabled={enviando || removendo}>
            <Trash2 className="mr-2 h-4 w-4" />Remover
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Opcional. Se houver logo, ela entra em toda imagem gerada pela IA (pequena e discreta). As fotos do Drive vão como estão.
        Aceita PNG ou JPG de até 5 MB.
      </p>

      <AlertDialog open={confirmar} onOpenChange={(o) => { if (!o && !removendo) setConfirmar(false); }}>
        <AlertDialogContent>
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

export function AbaImagens({ dados, alterado, salvando, onDados, onLogo, onSalvar }: {
  dados: PerfilGmn; alterado: boolean; salvando: boolean; onDados: (patch: Partial<PerfilGmn>) => void;
  /** A logo já foi gravada no servidor; a gaveta só atualiza a miniatura. */
  onLogo: (url: string | null) => void; onSalvar: () => void;
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

      <LogoCliente
        perfilId={dados.id}
        nome={dados.nome}
        logoUrl={dados.logo_url}
        onLogo={onLogo}
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

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button onClick={onSalvar} disabled={salvando}>
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar imagens
        </Button>
        {alterado && <span className={AVISO}>Alterações não salvas</span>}
      </div>
    </div>
  );
}
