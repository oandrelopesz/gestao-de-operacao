// Resumo do dia nas Demandas, só nas aparências novas (mockup aprovado em docs/design/lab2):
// Painel = anel "% do dia" e três números finos ao lado da previsão; Editorial = frase-resumo sob o título.
// Só leitura: nada aqui altera dados. Na Clássica nada é renderizado nem embrulhado.
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAparencia } from "@/lib/aparencia";
import { diasDeAtraso, hojeBrasilia } from "@/lib/entrega";

interface Dados {
  /** Demandas do quadro (sem as agendadas) */
  doQuadro: { status: string; prazo?: string | null }[];
  agendadas: number;
}

function contar({ doQuadro }: Dados) {
  const hoje = hojeBrasilia();
  const abertas = doQuadro.filter((d) => d.status !== "feito" && d.status !== "recorrentes");
  return {
    hoje,
    abertas: abertas.length,
    atrasadas: abertas.filter((d) => diasDeAtraso(d.prazo, hoje) > 0).length,
    fazerHoje: doQuadro.filter((d) => d.status === "fazer_hoje").length,
  };
}

/** Editorial: frase-resumo que quebra para a linha de baixo do título. */
export function ResumoEditorial(props: Dados) {
  const { aparencia } = useAparencia();
  if (aparencia !== "editorial") return null;
  const c = contar(props);
  return (
    <p className="resumo-deck basis-full">
      <b>{c.abertas}</b> abertas, <b className="resumo-atr">{c.atrasadas} {c.atrasadas === 1 ? "atrasada" : "atrasadas"}</b> e{" "}
      <b>{props.agendadas}</b> agendadas esperando a data chegar.
    </p>
  );
}

/** Painel: anel e números ao lado da previsão (children). Nas outras aparências devolve só os children. */
export function CabecaPainel({ children, ...props }: Dados & { children: ReactNode }) {
  const { aparencia } = useAparencia();
  if (aparencia !== "painel") return <>{children}</>;
  return (
    <div className="cab-painel">
      <Anel {...props} />
      {children}
    </div>
  );
}

function Anel(props: Dados) {
  const c = contar(props);
  const concluidas = useConcluidasHoje(c.hoje, props.doQuadro);
  // Mesma conta do mockup: feitas hoje ÷ (feitas hoje + ainda em Fazer hoje)
  const pct = concluidas == null ? 0 : Math.round((concluidas / (concluidas + c.fazerHoje || 1)) * 100);
  const r = 38;
  const volta = 2 * Math.PI * r;
  return (
    <div className="resumo-hud camada-vidro" role="group" aria-label="Resumo do dia">
      <div className="resumo-anel" title={concluidas == null ? undefined : `${concluidas} concluídas hoje`}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="tk" cx="50" cy="50" r="44" />
          <circle className="trk" cx="50" cy="50" r={r} />
          <circle className="val" cx="50" cy="50" r={r} style={{ strokeDasharray: volta, strokeDashoffset: volta * (1 - pct / 100) }} />
        </svg>
        <b>
          {pct}%<small>do dia</small>
        </b>
      </div>
      <div className="resumo-num"><b>{c.abertas}</b><small>abertas</small></div>
      <div className="resumo-num resumo-atr"><b>{c.atrasadas}</b><small>{c.atrasadas === 1 ? "atrasada" : "atrasadas"}</small></div>
      <div className="resumo-num"><b>{props.agendadas}</b><small>agendadas</small></div>
    </div>
  );
}

/** Conclusões de hoje (Brasília) no log demanda_conclusoes (preenchido por gatilho no banco); recarrega quando o quadro muda. */
function useConcluidasHoje(hoje: string, gatilho: unknown) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let vivo = true;
    // ponytail: Brasília fixo em UTC-3 (sem horário de verão desde 2019); usar fuso do banco se voltar
    supabase
      .from("demanda_conclusoes")
      .select("id", { count: "exact", head: true })
      .gte("concluida_em", `${hoje}T03:00:00Z`)
      .then(({ count, error }) => {
        if (vivo && !error) setN(count ?? 0);
      });
    return () => {
      vivo = false;
    };
  }, [hoje, gatilho]);
  return n;
}
