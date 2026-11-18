import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  CLASSES,
  FILTROS_VAZIOS,
  TEMAS,
  bateFiltro,
  boletimAindaNaoChegou,
  edicaoDoDia,
  hojeSP,
  rotuloDia,
  soHoraSP,
  somarDias,
} from "@/lib/radar";
import type { Classe, Filtros, StatusAchado, TipoEvento } from "@/lib/radar";
import { useDiaAnteriorComConteudo, useDiaRadar } from "@/lib/radarDados";
import { CardAchado } from "./CardAchado";
import { TextoWhatsapp } from "./TextoWhatsapp";

type MudarFiltros = (f: Filtros, opcoes?: { substituir?: boolean }) => void;

const ROTULO_EVENTO: Record<TipoEvento, string> = {
  abertura: "Abertura",
  boletim: "Boletim revisado",
  alerta: "Alerta",
  correcao: "Correção",
  resposta: "Resposta",
  encerramento: "Encerramento",
};

const CLASSES_ORDEM = (Object.keys(CLASSES) as Classe[]).sort((a, b) => CLASSES[a].ordem - CLASSES[b].ordem);

function campoDeTexto(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable;
}

export function VisaoDia({
  filtros,
  onChange,
  onStatus,
  onNota,
}: {
  filtros: Filtros;
  onChange: MudarFiltros;
  onStatus: (id: string, s: StatusAchado) => void;
  onNota: (id: string, texto: string) => void;
}) {
  const data = filtros.dia ?? hojeSP();
  const q = useDiaRadar(data);
  const anterior = useDiaAnteriorComConteudo(data);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [comoWhatsapp, setComoWhatsapp] = useState(false);

  // Ids vistos na primeira carga bem-sucedida do dia; alerta fora dessa lista é "novo".
  const vistos = useRef<{ dia: string; ids: Set<string> | null }>({ dia: data, ids: null });
  if (vistos.current.dia !== data) vistos.current = { dia: data, ids: null };
  if (q.isSuccess && q.data && q.data.achados.length >= 0 && vistos.current.ids === null && q.data.dia !== null) {
    vistos.current.ids = new Set(q.data.achados.map((a) => a.id));
  }

  useEffect(() => setMostrarTodos(false), [data]);

  const irPara = (dia: string) => onChange({ ...filtros, dia });
  // Atalhos j (dia anterior) e k (próximo), via ref para não reassinar a cada render.
  const irRef = useRef(irPara);
  irRef.current = irPara;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || campoDeTexto(e.target)) return;
      if (e.key === "j") irRef.current(somarDias(data, -1));
      else if (e.key === "k") irRef.current(somarDias(data, 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [data]);

  const dia = q.data?.dia ?? null;
  const achados = q.data?.achados ?? [];
  const eventos = q.data?.eventos ?? [];
  const visiveis = useMemo(
    () => (mostrarTodos ? achados : achados.filter((a) => bateFiltro(a, filtros))),
    [achados, filtros, mostrarTodos],
  );
  const ocultos = achados.length - achados.filter((a) => bateFiltro(a, filtros)).length;
  const novosIds = new Set(
    vistos.current.ids ? achados.filter((a) => a.alerta && !vistos.current.ids!.has(a.id)).map((a) => a.id) : [],
  );

  const textoCompleto = [dia?.abertura_texto, ...achados.map((a) => a.texto_whatsapp), dia?.encerramento_texto]
    .filter((t): t is string => typeof t === "string" && t.trim() !== "")
    .join("\n\n");
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoCompleto);
      toast("Texto copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const setas = (
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" size="icon" className="min-h-11 min-w-11" aria-label="Dia anterior" onClick={() => irPara(somarDias(data, -1))}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button type="button" variant="outline" size="icon" className="min-h-11 min-w-11" aria-label="Próximo dia" onClick={() => irPara(somarDias(data, 1))}>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );

  const cabecalho = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">
        {rotuloDia(data)} · {dia?.edicao_id ?? edicaoDoDia(data)}
        {dia?.revisao ? ` · Revisão ${dia.revisao}` : ""}
      </h2>
      {setas}
    </div>
  );

  if (q.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        {cabecalho}
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-4 text-sm">
          <p>Não foi possível carregar o dia.</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => q.refetch()}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  if (!dia && achados.length === 0) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <div className="space-y-2 rounded-lg border p-6 text-center text-sm text-muted-foreground">
          <p>{boletimAindaNaoChegou(data) ? "O boletim de hoje chega por volta das 08h" : "Sem edição neste dia"}</p>
          {anterior.data && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => irPara(anterior.data!)}>
              Ver o último dia com edição ({rotuloDia(anterior.data)})
            </Button>
          )}
        </div>
      </div>
    );
  }

  const porClasse = dia?.resumo?.por_classe ?? {};
  const porTema = dia?.resumo?.por_tema ?? {};
  const fora = dia?.resumo?.fora ?? [];
  const total = dia?.total_confirmados ?? achados.length;

  return (
    <div className="space-y-4">
      {cabecalho}

      <div className="flex flex-wrap items-center gap-1.5">
        {CLASSES_ORDEM.filter((c) => porClasse[c]).map((c) => (
          <Badge key={c} variant="outline" className={CLASSES[c].selo}>
            {CLASSES[c].emoji} {porClasse[c]} {CLASSES[c].rotulo}
          </Badge>
        ))}
        {Object.entries(porTema)
          .filter(([, n]) => n)
          .map(([slug, n]) => {
            const t = TEMAS.find((x) => x.slug === slug);
            return (
              <Badge key={slug} variant="outline" className={t?.cor}>
                {t?.rotulo ?? slug} · {n}
              </Badge>
            );
          })}
        <Badge variant="secondary">{total}/20 do teto</Badge>
      </div>

      {total < 4 && (
        <p className="rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
          <strong>Cobertura parcial</strong>
          {dia?.cobertura_parcial ? `: ${dia.cobertura_parcial}` : ""}
        </p>
      )}

      {novosIds.size > 0 && (
        <p role="status" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium">
          🚨 {novosIds.size === 1 ? "1 alerta novo" : `${novosIds.size} alertas novos`}
        </p>
      )}

      <Accordion type="multiple" className="rounded-lg border px-3">
        {dia?.abertura_texto && (
          <AccordionItem value="abertura">
            <AccordionTrigger className="min-h-11 text-sm">Abertura</AccordionTrigger>
            <AccordionContent>
              <TextoWhatsapp texto={dia.abertura_texto} />
            </AccordionContent>
          </AccordionItem>
        )}
        {fora.length > 0 && (
          <AccordionItem value="fora">
            <AccordionTrigger className="min-h-11 text-sm">Ficaram de fora ({fora.length})</AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-1 text-sm">
                {fora.map((f, i) => (
                  <li key={`${f.id}-${i}`}>
                    <span className="font-mono text-xs text-muted-foreground">{f.id}</span> {f.motivo}
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>

      <div className="flex justify-end">
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setComoWhatsapp((v) => !v)}>
          {comoWhatsapp ? "Ver como cards" : "Ver como no WhatsApp"}
        </Button>
      </div>

      {comoWhatsapp ? (
        <div className="space-y-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={copiar}>
            <Copy className="mr-1 h-4 w-4" aria-hidden="true" />
            Copiar
          </Button>
          <pre className="whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-3 font-sans text-sm">{textoCompleto}</pre>
        </div>
      ) : (
        <>
          {ocultos > 0 && !mostrarTodos && (
            <p className="text-sm text-muted-foreground">
              {ocultos} {ocultos === 1 ? "achado oculto" : "achados ocultos"} pelo filtro ·{" "}
              <button type="button" className="min-h-11 underline" onClick={() => setMostrarTodos(true)}>
                mostrar
              </button>
            </p>
          )}
          {visiveis.length === 0 ? (
            <div className="space-y-2 rounded-lg border p-6 text-center text-sm text-muted-foreground">
              <p>{achados.length === 0 ? "Nenhum achado neste dia" : "Nenhum achado com esses filtros"}</p>
              {achados.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => onChange({ ...FILTROS_VAZIOS, view: filtros.view, dia: filtros.dia })}
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {visiveis.map((a) => (
                <CardAchado key={a.id} achado={a} destaque={novosIds.has(a.id)} onStatus={onStatus} onNota={onNota} />
              ))}
            </div>
          )}
        </>
      )}

      {eventos.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Linha do tempo</h3>
          <ol className="space-y-3 border-l pl-4">
            {eventos.map((e) => (
              <li key={e.id} className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono">{soHoraSP(e.ocorrido_em)}</span> · {ROTULO_EVENTO[e.tipo] ?? e.tipo}
                </div>
                {e.texto_whatsapp && <TextoWhatsapp texto={e.texto_whatsapp} />}
              </li>
            ))}
          </ol>
        </section>
      )}

      {dia?.encerramento_texto && <TextoWhatsapp texto={dia.encerramento_texto} className="rounded-lg border bg-muted/40 p-3" />}
    </div>
  );
}
