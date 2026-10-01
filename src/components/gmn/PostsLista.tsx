// Posts do perfil (prévias nesta fase) e os botões "Gerar prévia com imagem" e "Gerar prévia só texto".
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FileText, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchPosts, traduzErroGmn, type PerfilGmn, type PostGmn } from "@/lib/gmn";
import { ROTULO_TEMA, type Tema } from "../../../supabase/functions/gmn/regras.ts";

const STATUS: Record<PostGmn["status"], string> = {
  agendado: "Agendado", gerando: "Gerando", gerado: "Prévia pronta", publicado: "Publicado", erro: "Erro", pulado: "Pulado",
};
const ORIGEM_IMAGEM: Record<string, string> = { drive: "Foto do Drive", google: "Foto do Google", ia: "Imagem de IA" };

/** Imagem do post; se o arquivo não carregar, não deixa uma miniatura quebrada: avisa em texto. */
function ImagemPost({ url }: { url: string }) {
  const [quebrou, setQuebrou] = useState(false);
  if (quebrou) return <p className="text-xs text-muted-foreground">Imagem indisponível.</p>;
  return <img src={url} alt="Imagem do post" className="max-h-72 w-full rounded-md object-cover" onError={() => setQuebrou(true)} />;
}

export type PreviaGerando = "com" | "sem" | null;

/**
 * A prévia em andamento (`gerando`) e o aviso de "há post novo" (`versao`) ficam na gaveta: assim, trocar de aba durante a
 * geração não destrava os botões nem deixa a lista velha.
 */
export function PostsLista({ perfil, gerando, versao, onGerar }: {
  perfil: PerfilGmn; gerando: PreviaGerando; versao: number; onGerar: (comImagem: boolean) => void;
}) {
  const [posts, setPosts] = useState<PostGmn[] | null>(null);
  const [falhou, setFalhou] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setPosts(await fetchPosts(perfil.id));
      setFalhou(false);
    } catch (e) {
      toast.error(traduzErroGmn(e));
      setPosts((atual) => atual ?? []);
      setFalhou(true);
    }
  }, [perfil.id]);

  useEffect(() => { carregar(); }, [carregar, versao]);

  // Prévia começada em outra abertura da gaveta (ainda no prazo de ~2 min): não deixa pedir outra, paga, por cima.
  const outraGerando = !!posts?.some((p) => p.status === "gerando" && Date.now() - new Date(p.created_at).getTime() < 3 * 60_000);
  const bloqueado = gerando !== null || outraGerando || !perfil.briefing_salvo_em;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => onGerar(true)} disabled={bloqueado}>
          {gerando === "com" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
          {gerando === "com" ? "Gerando (até 2 min)…" : "Gerar prévia com imagem"}
        </Button>
        <Button variant="outline" onClick={() => onGerar(false)} disabled={bloqueado}>
          {gerando === "sem" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
          {gerando === "sem" ? "Gerando (até 2 min)…" : "Gerar prévia só texto"}
        </Button>
        {!perfil.briefing_salvo_em && <span className="text-sm text-muted-foreground">Salve o contexto primeiro.</span>}
        {outraGerando && gerando === null && <span className="text-sm text-muted-foreground">Uma prévia ainda está sendo gerada.</span>}
        <span className="text-xs text-muted-foreground">A prévia não é publicada no Google.</span>
      </div>
      {posts === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {falhou && <p className="text-sm text-destructive">Não foi possível carregar os posts.</p>}
      {!falhou && posts?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum post ainda.</p>}
      {posts?.map((p) => (
        <Card key={p.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={p.status === "erro" || p.status === "pulado" ? "destructive" : "secondary"}>{STATUS[p.status]}</Badge>
              {p.tema && <span>{ROTULO_TEMA[p.tema as Tema] ?? p.tema}</span>}
              {p.imagem_origem && <span className="text-muted-foreground">· {ORIGEM_IMAGEM[p.imagem_origem]}</span>}
              {!p.imagem_url && p.status === "gerado" && <span className="text-muted-foreground">· Só texto</span>}
              <span className="text-muted-foreground">· {new Date(p.created_at).toLocaleString("pt-BR")}</span>
              {p.google_url && (
                <a href={p.google_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                  Ver no Google <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {p.imagem_url && <ImagemPost key={p.imagem_url} url={p.imagem_url} />}
            {p.texto && <p className="whitespace-pre-wrap text-sm">{p.texto}</p>}
            {p.palavras_chave.length > 0 && (
              <p className="text-xs text-muted-foreground">Palavras-chave: {p.palavras_chave.join(", ")}</p>
            )}
            {p.erro && <p className="text-xs text-destructive">{p.erro}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
