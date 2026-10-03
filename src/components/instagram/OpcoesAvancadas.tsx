// "Opções avançadas" da tela de postagem: só o que a API da Meta permite, e o aviso do que ela não permite.
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ImagePlus, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ACEITA_IMAGENS, normalizarFoto } from "@/lib/gmnImagem";
import { COLABORADORES_MAX, limparUsuarios, type OpcoesPost } from "@/lib/instagramPost";
import { enviarMidia, urlDaMidia } from "@/lib/instagram";

export function OpcoesAvancadas({ opcoes, onMudar, reels, instagram }: {
  opcoes: OpcoesPost;
  onMudar: (o: OpcoesPost) => void;
  reels: boolean;
  instagram: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [colab, setColab] = useState((opcoes.colaboradores ?? []).join(", "));
  const [enviandoCapa, setEnviandoCapa] = useState(false);

  async function capa(f: File | undefined) {
    if (!f) return;
    setEnviandoCapa(true);
    try {
      const chave = await enviarMidia(await normalizarFoto(f), "jpg");
      onMudar({ ...opcoes, capa_chave: chave });
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível enviar a capa.");
    } finally {
      setEnviandoCapa(false);
    }
  }

  return (
    <div className="rounded-lg border">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium" aria-expanded={aberto}>
        Opções avançadas <ChevronDown size={16} className={cn("transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && (
        <div className="space-y-4 border-t p-3">
          {instagram && (
            <label className="flex items-center justify-between gap-2 text-sm">
              Desativar comentários (Instagram)
              <Switch checked={!!opcoes.comentarios_desativados} onCheckedChange={(v) => onMudar({ ...opcoes, comentarios_desativados: v })} />
            </label>
          )}
          {instagram && (
            <div className="space-y-1">
              <Label htmlFor="ig-colab">Colaboradores (até {COLABORADORES_MAX}, Instagram)</Label>
              <Input
                id="ig-colab"
                value={colab}
                placeholder="@conta1, @conta2"
                onChange={(e) => { setColab(e.target.value); onMudar({ ...opcoes, colaboradores: limparUsuarios(e.target.value) }); }}
              />
              <p className="text-xs text-muted-foreground">A conta convidada aceita o convite no Instagram para o post aparecer no perfil dela.</p>
            </div>
          )}
          {reels && instagram && (
            <>
              <div className="space-y-1">
                <Label>Capa do reels (imagem)</Label>
                <div className="flex items-center gap-2">
                  {opcoes.capa_chave ? (
                    <span className="relative h-16 w-12 overflow-hidden rounded border">
                      <img src={urlDaMidia(opcoes.capa_chave)} alt="" className="h-full w-full object-cover" />
                      <button type="button" aria-label="Tirar a capa" onClick={() => onMudar({ ...opcoes, capa_chave: undefined })} className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"><X size={10} /></button>
                    </span>
                  ) : (
                    <label className="flex h-16 w-12 cursor-pointer items-center justify-center rounded border text-muted-foreground hover:bg-muted">
                      {enviandoCapa ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={16} />}
                      <input type="file" accept={ACEITA_IMAGENS} className="hidden" onChange={(e) => { capa(e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                  )}
                  <p className="text-xs text-muted-foreground">Com imagem de capa, o quadro escolhido no controle de capa é ignorado.</p>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ig-audio">Nome do áudio original</Label>
                <Input id="ig-audio" maxLength={100} value={opcoes.audio_nome ?? ""} placeholder="Áudio original" onChange={(e) => onMudar({ ...opcoes, audio_nome: e.target.value || undefined })} />
              </div>
            </>
          )}
          <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
            Texto alternativo e marcar pessoas ficam em <b>Editar</b>, em cada imagem. A API da Meta <b>não permite</b>: ocultar curtidas e visualizações
            (faça no app do Instagram depois de publicado), música da biblioteca, figurinhas e enquetes. Perfil comercial e página do Facebook são sempre públicos.
          </p>
        </div>
      )}
    </div>
  );
}
