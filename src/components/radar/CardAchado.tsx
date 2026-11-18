import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CLASSES, CONFIANCAS, STATUS, TEMAS, TIPOS, horaSP, linkSeguro } from "@/lib/radar";
import type { Achado, StatusAchado } from "@/lib/radar";

type Acoes = { onStatus: (id: string, s: StatusAchado) => void; onNota: (id: string, texto: string) => void };

// ---- helpers defensivos: corpo vem do bot e pode ter qualquer forma ----
const rotuloChave = (k: string) => k.replace(/_/g, " ");
const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function texto(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}
// Lista de itens (string ou qualquer coisa) sem vazios.
function lista(v: unknown): unknown[] {
  const arr = Array.isArray(v) ? v : [v];
  return arr.filter((x) => (typeof x === "string" ? x.trim() !== "" : x != null && !(ehObj(x) && Object.keys(x).length === 0)));
}
const tem = (v: unknown) => lista(v).length > 0;

// Qualquer valor vira texto/lista/linhas "chave: valor"; nunca quebra.
function Valor({ v }: { v: unknown }) {
  if (ehObj(v)) {
    const entradas = Object.entries(v).filter(([, x]) => tem(x));
    return (
      <div className="space-y-1">
        {entradas.map(([k, x]) => (
          <div key={k} className="text-sm">
            <span className="font-medium capitalize">{rotuloChave(k)}: </span>
            {Array.isArray(x) || ehObj(x) ? <Valor v={x} /> : <span>{texto(x)}</span>}
          </div>
        ))}
      </div>
    );
  }
  if (Array.isArray(v)) {
    const itens = lista(v);
    if (itens.length === 1 && !ehObj(itens[0]) && !Array.isArray(itens[0])) return <p className="text-sm">{texto(itens[0])}</p>;
    return (
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {itens.map((x, i) => (
          <li key={i}>
            <Valor v={x} />
          </li>
        ))}
      </ul>
    );
  }
  return <p className="text-sm">{texto(v)}</p>;
}

function Bloco({ titulo, v }: { titulo?: string; v: unknown }) {
  if (!tem(v)) return null;
  return (
    <div className="space-y-1">
      {titulo && <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</div>}
      <Valor v={v} />
    </div>
  );
}

function Secao({ valor, titulo, children, mostrar }: { valor: string; titulo: string; children: React.ReactNode; mostrar: boolean }) {
  if (!mostrar) return null;
  return (
    <AccordionItem value={valor}>
      <AccordionTrigger className="min-h-11 text-sm">{titulo}</AccordionTrigger>
      <AccordionContent className="space-y-3">{children}</AccordionContent>
    </AccordionItem>
  );
}

const ROTULO_LINK: Record<string, string> = { descoberta: "Abrir fonte", evidencia: "Evidência", oficial: "Fonte oficial" };

function BotaoLink({ url, rotulo }: { url: string | null | undefined; rotulo: string }) {
  const href = linkSeguro(url);
  if (!href) return null;
  return (
    <Button asChild variant="outline" size="sm" className="min-h-11">
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        <ExternalLink className="mr-1 h-4 w-4" aria-hidden="true" />
        {rotulo}
      </a>
    </Button>
  );
}

export function CardAchado({ achado: a, destaque, onStatus, onNota }: { achado: Achado; destaque?: boolean } & Acoes) {
  const classe = CLASSES[a.classe] ?? CLASSES.medio;
  const corpo: Record<string, unknown> = ehObj(a.corpo) ? a.corpo : {};
  const fac = corpo.explicando_facil;
  const facil = ehObj(fac) ? fac : { o_que_e: fac };
  const passos = lista(corpo.proximos_passos);
  const evidencia = ehObj(corpo.evidencia) ? corpo.evidencia : { fonte: corpo.evidencia };
  const aplicacoes = lista(corpo.aplicacoes);
  const links = (Array.isArray(a.links) ? a.links : []).filter((l) => l && linkSeguro(l.url));
  const confianca = CONFIANCAS.find((c) => c.valor === a.confianca)?.rotulo ?? a.confianca;

  // Nota pessoal: estado local, autosave 800 ms, sincroniza com a prop se o campo não está em foco.
  const [nota, setNota] = useState(a.nota_pessoal ?? "");
  const foco = useRef(false);
  const sujo = useRef(false);
  useEffect(() => {
    if (!foco.current) {
      setNota(a.nota_pessoal ?? "");
      sujo.current = false;
    }
  }, [a.nota_pessoal]);
  useEffect(() => {
    if (!sujo.current) return;
    const t = setTimeout(() => {
      sujo.current = false;
      onNota(a.id, nota);
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nota]);

  const copiar = async (valor: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      toast(ok);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <article
      className={cn(
        "space-y-3 rounded-lg border border-l-4 bg-card p-3 text-card-foreground sm:p-4",
        classe.borda,
        destaque && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <Badge variant="outline" className={cn("shrink-0", classe.selo)}>
          {classe.emoji} {classe.rotulo}
        </Badge>
        <button
          type="button"
          onClick={() => copiar(a.id, "ID copiado")}
          aria-label={`Copiar ID ${a.id}`}
          className="min-h-11 rounded px-1 font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          {a.id}
        </button>
        <h3 className="w-full text-base font-semibold leading-snug">{a.titulo}</h3>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(a.temas ?? []).map((slug) => {
          const t = TEMAS.find((x) => x.slug === slug);
          return (
            <Badge key={slug} variant="outline" className={t?.cor}>
              {t?.rotulo ?? slug}
            </Badge>
          );
        })}
        <Badge variant="outline">
          {a.tipo} · {TIPOS[a.tipo] ?? a.tipo}
        </Badge>
        <Badge variant="outline">Confiança {confianca}</Badge>
        {a.alerta && <Badge variant="destructive">🚨 Alerta</Badge>}
        {a.corrigido && <Badge variant="secondary">Corrigido</Badge>}
      </div>

      {(tem(facil.o_que_e) || tem(facil.como_te_afeta) || tem(facil.exemplo)) && (
        <section className="space-y-2 rounded-md bg-muted/50 p-3">
          <h4 className="text-sm font-semibold">🧸 Explicando fácil</h4>
          <Bloco v={facil.o_que_e} />
          <Bloco titulo="Como te afeta" v={facil.como_te_afeta} />
          <Bloco titulo="Exemplo" v={facil.exemplo} />
        </section>
      )}

      {passos.length > 0 && (
        <section className="space-y-2 rounded-md bg-muted/50 p-3">
          <h4 className="text-sm font-semibold">👉 Próximo passo</h4>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {passos.map((p, i) => (
              <li key={i}>
                <Valor v={p} />
              </li>
            ))}
          </ol>
        </section>
      )}

      <Accordion type="multiple">
        <Secao valor="entrega" titulo="O que entrega" mostrar={tem(corpo.o_que_entrega)}>
          <Bloco v={corpo.o_que_entrega} />
        </Secao>
        <Secao valor="importa" titulo="Por que importa" mostrar={tem(corpo.por_que_importa)}>
          <Bloco v={corpo.por_que_importa} />
        </Secao>
        <Secao valor="evidencia" titulo="Evidência" mostrar={tem(evidencia) || tem(a.confianca)}>
          <Bloco titulo="Fonte" v={evidencia.fonte} />
          <Bloco titulo="Limitações" v={evidencia.limitacoes} />
          {Object.entries(evidencia)
            .filter(([k]) => k !== "fonte" && k !== "limitacoes")
            .map(([k, v]) => (
              <Bloco key={k} titulo={rotuloChave(k)} v={v} />
            ))}
          <Bloco titulo="Confiança" v={confianca} />
          <Bloco titulo="Motivo do tipo" v={a.tipo_motivo} />
        </Secao>
        <Secao valor="estagio" titulo="Estágio e prontidão" mostrar={tem(a.estagio) || tem(a.prontidao) || tem(a.publicacao)}>
          <Bloco titulo="Estágio" v={a.estagio} />
          <Bloco titulo="Prontidão" v={a.prontidao} />
          <Bloco titulo="Publicação" v={a.publicacao} />
          <Bloco titulo="Primeira descoberta" v={a.primeira_descoberta ? horaSP(a.primeira_descoberta) : null} />
          <Bloco titulo="Atualização" v={a.atualizacao} />
        </Secao>
        <Secao valor="custo" titulo="Custo e esforço" mostrar={tem(corpo.custo) || tem(corpo.esforco)}>
          <Bloco titulo="Custo" v={corpo.custo} />
          <Bloco titulo="Esforço" v={corpo.esforco} />
        </Secao>
        <Secao valor="aplicacoes" titulo="Aplicações" mostrar={aplicacoes.length > 0}>
          {aplicacoes.map((ap, i) => (
            <div key={i} className="space-y-2 rounded-md border p-3">
              <Valor v={ap} />
            </div>
          ))}
        </Secao>
        <Secao valor="mudanca" titulo="Mudança" mostrar={tem(corpo.mudanca)}>
          <Valor v={corpo.mudanca} />
        </Secao>
        <Secao valor="lancamento" titulo="Lançamento" mostrar={tem(corpo.lancamento)}>
          <Valor v={corpo.lancamento} />
        </Secao>
        <Secao valor="links" titulo="Links" mostrar={links.length > 0 || !!linkSeguro(a.post_x_url) || !!linkSeguro(a.link_citado_x_url)}>
          <div className="flex flex-wrap gap-2">
            {links.map((l, i) => (
              <BotaoLink key={i} url={l.url} rotulo={l.rotulo || ROTULO_LINK[l.tipo] || l.tipo || "Link"} />
            ))}
            <BotaoLink url={a.post_x_url} rotulo="Post no X" />
            <BotaoLink url={a.link_citado_x_url} rotulo="Link citado no post" />
          </div>
        </Secao>
      </Accordion>

      <div className="space-y-3 border-t pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={a.status} onValueChange={(v) => onStatus(a.id, v as StatusAchado)}>
            <SelectTrigger className="min-h-11 w-44" aria-label="Status do achado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS.map((s) => (
                <SelectItem key={s.valor} value={s.valor}>
                  {s.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => copiar(a.texto_whatsapp ?? "", "Texto copiado")}
          >
            <Copy className="mr-1 h-4 w-4" aria-hidden="true" />
            Copiar como WhatsApp
          </Button>
        </div>
        <div className="space-y-1">
          <label htmlFor={`nota-${a.id}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Nota pessoal
          </label>
          <Textarea
            id={`nota-${a.id}`}
            value={nota}
            rows={3}
            maxLength={5000}
            placeholder="Anotações só suas"
            onFocus={() => (foco.current = true)}
            onBlur={() => (foco.current = false)}
            onChange={(e) => {
              sujo.current = true;
              setNota(e.target.value);
            }}
          />
        </div>
      </div>
    </article>
  );
}
