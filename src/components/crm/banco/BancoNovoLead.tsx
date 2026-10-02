// Novo lead numa aba do Banco de leads: os campos visíveis da aba; entra no fim da aba (a planilha recebe pela fila).
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { colunasVisiveis, type AbaBanco } from "@/lib/bancoLeads";

export function BancoNovoLead({
  aba,
  aberto,
  onFechar,
  onCriar,
}: {
  aba: AbaBanco | null;
  aberto: boolean;
  onFechar: () => void;
  onCriar: (dados: Record<string, string>) => Promise<boolean>;
}) {
  const [dados, setDados] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (aberto) setDados({});
  }, [aberto]);
  const campos = aba ? colunasVisiveis(aba).filter((c) => c.papel !== "valido" && c.papel !== "primeira_msg") : [];
  const algum = Object.values(dados).some((v) => v.trim());

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!algum || salvando) return;
    setSalvando(true);
    const ok = await onCriar(Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)));
    setSalvando(false);
    if (ok) onFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={salvar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Novo lead em {aba?.nome}</DialogTitle>
            <DialogDescription>Entra no fim da aba da planilha. Preencha o que tiver; o resto dá para completar depois.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {campos.map((c) => (
              <label key={c.chave} className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{c.titulo}</span>
                <Input
                  className="h-9 text-sm"
                  value={dados[c.chave] ?? ""}
                  onChange={(e) => setDados((d) => ({ ...d, [c.chave]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={!algum || salvando} className="gap-1.5">
              {salvando && <Loader2 size={14} className="animate-spin" />} Criar lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
