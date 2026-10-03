// Contas de Instagram com uma chave "visível" cada (aba Instagram e Admin → Instagram).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Instagram } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { alternarOculta, fetchContas, type ContaInstagram } from "@/lib/instagram";

/** Foto da conta; o link da Meta expira com o tempo, e aí aparece o ícone. */
export function FotoConta({ conta, className }: { conta: Pick<ContaInstagram, "foto_url">; className?: string }) {
  const [falhou, setFalhou] = useState(false);
  if (!conta.foto_url || falhou) {
    return <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-muted", className)}><Instagram size={16} /></span>;
  }
  return <img src={conta.foto_url} alt="" onError={() => setFalhou(true)} className={cn("shrink-0 rounded-full object-cover", className)} />;
}

export function ContasVisiveis({ contas, onAlternar }: {
  contas: ContaInstagram[];
  onAlternar: (conta: ContaInstagram, visivel: boolean) => void;
}) {
  if (!contas.length) return <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma conta. Clique em "Sincronizar contas" na aba Instagram.</p>;
  return (
    <div className="min-w-0 divide-y rounded-md border">
      {contas.map((c) => (
        <label key={c.id} className={cn("flex cursor-pointer items-center gap-3 px-3 py-2", c.oculta && "opacity-60")}>
          <FotoConta conta={c} className="h-8 w-8" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{c.nome}</span>
            <span className="block truncate text-xs text-muted-foreground">@{c.usuario}{!c.ativa && " · sem acesso na BM"}</span>
          </span>
          <Switch checked={!c.oculta} onCheckedChange={(v) => onAlternar(c, v)} aria-label={`Mostrar ${c.nome}`} />
        </label>
      ))}
    </div>
  );
}

/** Troca a chave na tela na hora e grava; se falhar, volta. */
export async function alternarNaLista(
  conta: ContaInstagram,
  visivel: boolean,
  setContas: (f: (prev: ContaInstagram[] | null) => ContaInstagram[] | null) => void,
) {
  const trocar = (oculta: boolean) => setContas((prev) => prev && prev.map((c) => (c.id === conta.id ? { ...c, oculta } : c)));
  trocar(!visivel);
  try {
    await alternarOculta(conta.id, !visivel);
  } catch (e: any) {
    trocar(visivel);
    toast.error(e?.message || "Não foi possível salvar.");
  }
}

/** Card da seção Instagram do Admin. */
export function ContasInstagramCard() {
  const [contas, setContas] = useState<ContaInstagram[] | null>(null);
  useEffect(() => { fetchContas().then(setContas).catch((e) => toast.error(e.message)); }, []);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Instagram size={18} /> Contas visíveis</CardTitle>
        <CardDescription>Conta desligada some da lista da aba Instagram (os posts dela continuam na aba Posts).</CardDescription>
      </CardHeader>
      <CardContent>
        {contas === null ? <p className="text-sm text-muted-foreground">Carregando...</p>
          : <ContasVisiveis contas={contas} onAlternar={(c, v) => alternarNaLista(c, v, setContas)} />}
      </CardContent>
    </Card>
  );
}
