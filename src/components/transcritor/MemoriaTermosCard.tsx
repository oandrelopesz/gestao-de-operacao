import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type Termo, excluirTermo, listarTermos, registrarTermoManual } from "@/lib/transcritor";

/** Correções aprendidas pelo Transcritor: as manuais valem sempre; as da IA são exemplos para a revisão. */
export function MemoriaTermosCard() {
  const [termos, setTermos] = useState<Termo[] | null>(null);
  const [de, setDe] = useState("");
  const [para, setPara] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);

  const carregar = async () => {
    try {
      setTermos(await listarTermos());
    } catch (e) {
      setTermos([]);
      toast.error(e instanceof Error ? e.message : "Erro ao carregar a memória de termos");
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const adicionar = async () => {
    setSalvando(true);
    try {
      await registrarTermoManual(de, para);
      setDe("");
      setPara("");
      toast.success("Termo adicionado — vale para as próximas transcrições");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar o termo");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (id: string) => {
    setExcluindo(id);
    try {
      await excluirTermo(id);
      toast.success("Termo excluído");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir o termo");
    } finally {
      setExcluindo(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Memória de termos</CardTitle>
        <CardDescription>
          Correções que o Transcritor aprende. As suas (manual) valem sempre nas próximas transcrições; as da IA viram exemplos para a revisão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!salvando) adicionar();
          }}
        >
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
            Como sai
            <Input value={de} onChange={(e) => setDe(e.target.value)} placeholder="cê tê erre" className="text-sm" />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
            Certo
            <Input value={para} onChange={(e) => setPara(e.target.value)} placeholder="CTR" className="text-sm" />
          </label>
          <Button type="submit" disabled={salvando || !de.trim() || !para.trim()} className="gap-1.5">
            {salvando && <Loader2 size={14} className="animate-spin" />} Adicionar
          </Button>
        </form>

        {termos === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Carregando…</div>
        ) : termos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma correção guardada ainda.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {termos.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="break-all font-mono">{t.de} → {t.para}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{t.origem === "manual" ? "manual" : "IA"}</span>
                  <span className="text-xs text-muted-foreground">{t.vezes}x</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Excluir o termo ${t.de} → ${t.para}`}
                  disabled={excluindo === t.id}
                  onClick={() => excluir(t.id)}
                >
                  {excluindo === t.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
