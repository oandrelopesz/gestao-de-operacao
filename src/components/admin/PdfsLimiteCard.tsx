import { useEffect, useState } from "react";
import { HardDrive } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfig } from "@/lib/appConfig";
import { PDF_TAMANHO_MAX_PADRAO_MB } from "@/lib/pdfs";

const MIN_MB = 1;
const MAX_MB = 200;

/** Card da seção PDFs do Admin: tamanho máximo por arquivo (app_config.pdf_tamanho_max_mb). */
export function PdfsLimiteCard() {
  const [limite, salvarLimite, carregando] = useConfig<number>("pdf_tamanho_max_mb", PDF_TAMANHO_MAX_PADRAO_MB);
  const [valor, setValor] = useState(String(limite));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setValor(String(limite)); }, [limite]);

  const numero = Number(valor);
  const valido = valor.trim() !== "" && Number.isInteger(numero) && numero >= MIN_MB && numero <= MAX_MB;
  const mudou = valido && numero !== limite;

  const salvar = async () => {
    if (!valido) {
      toast.error(`Informe um número inteiro entre ${MIN_MB} e ${MAX_MB}`);
      return;
    }
    setSalvando(true);
    try {
      await salvarLimite(numero);
      toast.success(`Limite de ${numero} MB salvo`);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><HardDrive size={18} /> Tamanho máximo por arquivo</CardTitle>
        <CardDescription>
          PDFs maiores que o limite são recusados antes do envio. Vale para novos envios; os arquivos já guardados continuam.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <div className="space-y-2">
            <Label htmlFor="pdf-limite">Limite (MB)</Label>
            <Input
              id="pdf-limite"
              type="number"
              inputMode="numeric"
              min={MIN_MB}
              max={MAX_MB}
              step={1}
              className="w-32"
              value={valor}
              disabled={carregando}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={!mudou || salvando || carregando}>{salvando ? "Salvando..." : "Salvar"}</Button>
        </form>
        {!valido && valor.trim() !== "" && (
          <p className="text-xs text-destructive mt-2">Use um número inteiro entre {MIN_MB} e {MAX_MB}.</p>
        )}
      </CardContent>
    </Card>
  );
}
