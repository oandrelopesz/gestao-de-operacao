import { useEffect, useState } from "react";
import { Book } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfig } from "@/lib/appConfig";

/** Card da seção Livros do Admin: meta de livros lidos por ano (app_config.livros_meta_anual). */
export function LivrosMetaCard() {
  const [meta, salvarMeta, carregando] = useConfig<number>("livros_meta_anual", 12);
  const [valor, setValor] = useState(String(meta));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setValor(String(meta)); }, [meta]);

  const numero = Number(valor);
  const valido = valor.trim() !== "" && Number.isInteger(numero) && numero >= 0;
  const mudou = valido && numero !== meta;

  const salvar = async () => {
    if (!valido) {
      toast.error("Informe um número inteiro (0 = sem meta)");
      return;
    }
    setSalvando(true);
    try {
      await salvarMeta(numero);
      toast.success(numero > 0 ? `Meta de ${numero} ${numero === 1 ? "livro" : "livros"} por ano salva` : "Meta removida");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Book size={18} /> Meta de livros lidos por ano</CardTitle>
        <CardDescription>Aparece no card "Lidos em {new Date().getFullYear()}" da aba Livros, com uma barra de progresso. Use 0 para não ter meta.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <div className="space-y-2">
            <Label htmlFor="livros-meta">Livros por ano</Label>
            <Input
              id="livros-meta"
              type="number"
              inputMode="numeric"
              min={0}
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
          <p className="text-xs text-destructive mt-2">Use um número inteiro, 0 ou maior.</p>
        )}
      </CardContent>
    </Card>
  );
}
