import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { lerGlossario, salvarGlossario } from "@/lib/transcritor";

/** Termos que o transcritor deve reconhecer (inglês, siglas, jargão de marketing). Um por linha. */
export function GlossarioCard() {
  const [texto, setTexto] = useState("");
  const [original, setOriginal] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    lerGlossario()
      .then((termos) => { const t = termos.join("\n"); setTexto(t); setOriginal(t); })
      .catch(() => setOriginal(""));
  }, []);

  const termos = texto.split(/\r?\n|,/).map((t) => t.trim()).filter(Boolean);

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarGlossario(termos);
      const t = [...new Set(termos)].join("\n");
      setTexto(t);
      setOriginal(t);
      toast.success("Glossário salvo — vale para as próximas transcrições");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar o glossário");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Glossário do Transcritor</CardTitle>
        <CardDescription>
          Termos em inglês, siglas e jargões que devem sair escritos certo (ex.: CPM, ROAS, lookalike, copywriting). Um por linha. Os primeiros da lista têm prioridade.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {original === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Carregando…</div>
        ) : (
          <>
            <Textarea rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"ROAS\nCPM\nlookalike\ncopywriting"} className="font-mono text-sm" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{termos.length} {termos.length === 1 ? "termo" : "termos"}</span>
              <Button onClick={salvar} disabled={salvando || texto === original} className="gap-1.5">
                {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
