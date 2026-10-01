// Posts do perfil (prévias nesta fase) e o botão "Gerar prévia".
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchPosts, gerarPrevia, traduzErroGmn, type PerfilGmn, type PostGmn } from "@/lib/gmn";
import { ROTULO_TEMA, type Tema } from "../../../supabase/functions/gmn/regras.ts";

const STATUS: Record<PostGmn["status"], string> = {
  agendado: "Agendado", gerando: "Gerando", gerado: "Prévia pronta", publicado: "Publicado", erro: "Erro", pulado: "Pulado",
};
const ORIGEM_IMAGEM: Record<string, string> = { drive: "Foto do Drive", google: "Foto do Google", ia: "Imagem de IA" };

export function PostsLista({ perfil }: { perfil: PerfilGmn }) {
  const [posts, setPosts] = useState<PostGmn[] | null>(null);
  const [gerando, setGerando] = useState(false);
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

  useEffect(() => { carregar(); }, [carregar]);

  async function previa() {
    setGerando(true);
    try {
      const p = await gerarPrevia(perfil.id);
      if (p.status === "gerado") {
        if (p.erro) toast.warning(`Prévia gerada com aviso: ${p.erro}`);
        else toast.success("Prévia pronta.");
      } else if (p.status === "pulado") toast.warning(`Prévia pulada: ${p.erro ?? "motivo não informado"}`);
      else toast.error(`Não foi possível gerar a prévia: ${p.erro ?? "motivo não informado"}`);
      await carregar();
    } catch (e) {
      toast.error(traduzErroGmn(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={previa} disabled={gerando || !perfil.briefing_salvo_em}>
          {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
          {gerando ? "Gerando (até 2 min)…" : "Gerar prévia"}
        </Button>
        {!perfil.briefing_salvo_em && <span className="text-sm text-muted-foreground">Salve o briefing primeiro.</span>}
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
              <span className="text-muted-foreground">· {new Date(p.created_at).toLocaleString("pt-BR")}</span>
              {p.google_url && (
                <a href={p.google_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                  Ver no Google <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {p.imagem_url && <img src={p.imagem_url} alt="Imagem do post" className="max-h-72 w-full rounded-md object-cover" />}
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
