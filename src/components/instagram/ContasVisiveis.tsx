// Contas de Instagram com uma chave "visível" cada (aba Instagram e Admin → Instagram).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Instagram, KeyRound, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  PERMISSOES_NECESSARIAS, TAREFAS_PAGINA, alternarOculta, conferirPermissoes, fetchContas, type ContaInstagram, type PaginaTarefas,
} from "@/lib/instagram";

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

/** Quadro do Admin: o que o META_TOKEN pode fazer (✓) e o que falta pedir na Meta (✗). */
function PermissoesToken() {
  const [r, setR] = useState<{ valido: boolean; permissoes: string[]; paginas?: PaginaTarefas[] } | null>(null);
  const pode = (p: PaginaTarefas, t: string) => p.tarefas.includes("MANAGE") || p.tarefas.includes(t);
  const semComunidade = (r?.paginas ?? []).filter((p) => !pode(p, "MODERATE"));
  const semConteudo = (r?.paginas ?? []).filter((p) => !pode(p, "CREATE_CONTENT"));
  const [carregando, setCarregando] = useState(false);
  const conferir = () => {
    setCarregando(true);
    conferirPermissoes().then(setR).catch((e) => toast.error(e.message)).finally(() => setCarregando(false));
  };
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><KeyRound size={18} /> Permissões do token da Meta</CardTitle>
          <CardDescription>O que o META_TOKEN deixa o sistema fazer. O que estiver com ✗ precisa ser marcado ao gerar o token no usuário do sistema.</CardDescription>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 gap-2" onClick={conferir} disabled={carregando}>
          {carregando && <Loader2 size={14} className="animate-spin" />} Conferir
        </Button>
      </CardHeader>
      {r && (
        <CardContent className="space-y-1 text-sm">
          {!r.valido && <p className="text-destructive">O token não é válido: gere outro no usuário do sistema.</p>}
          {PERMISSOES_NECESSARIAS.map((x) => {
            const tem = r.permissoes.includes(x.permissao);
            return (
              <p key={x.permissao} className={cn("flex items-start gap-2", !tem && "text-destructive")}>
                {tem ? <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" /> : <X size={15} className="mt-0.5 shrink-0" />}
                <span><code className="text-xs">{x.permissao}</code> · {x.para}</span>
              </p>
            );
          })}
          {r.paginas && (
            <div className="space-y-2 border-t pt-3">
              <p className="font-medium">Páginas do Facebook ({r.paginas.length})</p>
              {semConteudo.length === 0 && semComunidade.length === 0 && (
                <p className="flex items-center gap-2"><Check size={15} className="text-emerald-600" /> O usuário do sistema pode publicar e comentar em todas.</p>
              )}
              {[
                { lista: semConteudo, falta: "Conteúdo", para: "publicar no Facebook" },
                { lista: semComunidade, falta: "Atividade da comunidade", para: "o primeiro comentário no Facebook" },
              ].filter((g) => g.lista.length).map((g) => (
                <div key={g.falta} className="space-y-1 text-destructive">
                  <p className="flex items-start gap-2">
                    <X size={15} className="mt-0.5 shrink-0" />
                    Sem "{g.falta}" ({g.lista.length}), necessária para {g.para}. Dê essa permissão ao usuário do sistema nestas páginas, no gerenciador de negócios:
                  </p>
                  <ul className="ml-6 list-disc text-xs text-muted-foreground">
                    {g.lista.map((p) => (
                      <li key={p.id}>{p.nome} <span className="opacity-70">(tem: {p.tarefas.map((t) => TAREFAS_PAGINA[t] ?? t).join(", ") || "nada"})</span></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/** Card da seção Instagram do Admin. */
export function ContasInstagramCard() {
  const [contas, setContas] = useState<ContaInstagram[] | null>(null);
  useEffect(() => { fetchContas().then(setContas).catch((e) => toast.error(e.message)); }, []);
  return (
    <>
    <PermissoesToken />
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
    </>
  );
}
