// Peças do Gerador de UTM: dropdown que explica cada opção, dropdown com "Outro" e linha com botão de copiar.
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Copiado");
    return true;
  } catch {
    toast.error("Não foi possível copiar");
    return false;
  }
}

export interface OpcaoExplicada { valor: string; rotulo?: string; explicacao: string }

/** Dropdown em que cada opção traz a explicação entre parênteses; a explicação da escolhida fica embaixo. */
export function SeletorExplicado({ rotulo, valor, onChange, opcoes }: {
  rotulo: string; valor: string; onChange: (v: string) => void; opcoes: OpcaoExplicada[];
}) {
  const atual = opcoes.find((o) => o.valor === valor);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{rotulo}</Label>
      <Select value={valor} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue>{atual ? (atual.rotulo ?? atual.valor) : valor}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-80 max-w-[min(34rem,92vw)]">
          {opcoes.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              <span className="font-medium">{o.rotulo ?? o.valor}</span>{" "}
              <span className="text-muted-foreground">({o.explicacao})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {atual && <p className="text-[11px] leading-snug text-muted-foreground">{atual.explicacao}</p>}
    </div>
  );
}

const OUTRO = "__outro__";

/** Igual ao anterior, com a opção "Outro" que abre um campo para digitar o valor. */
export function SeletorComOutro({ rotulo, valor, onChange, opcoes }: {
  rotulo: string; valor: string; onChange: (v: string) => void; opcoes: OpcaoExplicada[];
}) {
  const [outro, setOutro] = useState(() => !opcoes.some((o) => o.valor === valor));
  return (
    <div className="space-y-2">
      <SeletorExplicado
        rotulo={rotulo}
        valor={outro ? OUTRO : valor}
        onChange={(v) => {
          if (v === OUTRO) { setOutro(true); return; }
          setOutro(false);
          onChange(v);
        }}
        opcoes={[...opcoes, { valor: OUTRO, rotulo: "Outro", explicacao: "digite o seu próprio valor" }]}
      />
      {outro && <Input className="h-9 text-sm" placeholder="Digite o valor" value={valor} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

/** Texto com as variáveis da plataforma em destaque. */
function Colorido({ texto }: { texto: string }) {
  const partes = texto.split(/(\{\{[^{}]+\}\}|\{[^{}]+\}|__[A-Z0-9_]+__)/g);
  return <>{partes.map((p, i) => (i % 2 ? <span key={i} className="font-semibold text-primary">{p}</span> : p))}</>;
}

/** Linha com o texto pronto e o botão de copiar (mais ações opcionais ao lado). */
export function LinhaCopiar({ titulo, texto, vazio, acoes, destaque }: {
  titulo: string; texto: string | null; vazio?: string; acoes?: ReactNode; destaque?: boolean;
}) {
  const [ok, setOk] = useState(false);
  const copiar = async () => {
    if (texto && (await copiarTexto(texto))) {
      setOk(true);
      setTimeout(() => setOk(false), 1500);
    }
  };
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <code className={cn("min-w-0 flex-1 break-all rounded-md border bg-muted/50 px-2.5 py-2 text-xs leading-relaxed", !texto && "italic text-muted-foreground")}>
          {texto ? <Colorido texto={texto} /> : vazio}
        </code>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant={destaque ? "default" : "outline"} className="h-auto min-h-8 gap-1.5 text-xs" disabled={!texto} onClick={copiar}>
            {ok ? <Check size={13} /> : <Copy size={13} />} {ok ? "Copiado" : "Copiar"}
          </Button>
          {acoes}
        </div>
      </div>
    </div>
  );
}
