// Painel "Gestor Pro" do quadro (barra lateral do Excalidraw): formas extras e cards prontos, na cor escolhida.
import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Sidebar } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { FORMAS_EXTRAS, pecasDa, type FormaExtra, type Peca } from "@/lib/fluxoFormas";
import { cn } from "@/lib/utils";
import { CARDS, CORES, esqueletoDoCard, inserirNoCentro, pecasParaEsqueletos, type Cor, type TipoCard } from "./inserir";

export const NOME_PAINEL = "gestor";

const COM_ETAPAS: FormaExtra[] = ["funil", "piramide"];

/** Desenho pequeno da forma, a partir da mesma geometria que vai para o quadro. */
function DesenhoForma({ pecas, largura, altura, cor }: { pecas: Peca[]; largura: number; altura: number; cor: Cor }) {
  const folga = 6;
  return (
    <svg viewBox={`${-folga} ${-folga} ${largura + folga * 2} ${altura + folga * 2}`} className="h-12 w-full" aria-hidden>
      {pecas.map((p, i) => {
        if (p.tipo === "poligono") {
          return (
            <polygon key={i} points={p.pontos.map(([x, y]) => `${p.x + x},${p.y + y}`).join(" ")}
              fill={cor.fundo} stroke={cor.traco} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          );
        }
        if (p.tipo === "elipse") {
          return (
            <ellipse key={i} cx={p.x + p.largura / 2} cy={p.y + p.altura / 2} rx={p.largura / 2} ry={p.altura / 2}
              fill={cor.fundo} stroke={cor.traco} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          );
        }
        return null;
      })}
    </svg>
  );
}

function DesenhoCard({ tipo, cor }: { tipo: TipoCard; cor: Cor }) {
  const base = "flex items-center justify-center text-[9px] font-semibold text-zinc-800";
  if (tipo === "postit") return <div className={cn(base, "h-11 w-11 items-start justify-start p-1")} style={{ background: "#fff3a3" }}>Anotação</div>;
  if (tipo === "etiqueta") return <div className={cn(base, "h-5 w-16 rounded-md text-white")} style={{ background: cor.traco }}>Etiqueta</div>;
  if (tipo === "etapa") {
    return (
      <div className="flex h-10 w-16 flex-col items-start gap-0.5 rounded-md border-2 p-1" style={{ background: cor.fundo, borderColor: cor.traco }}>
        <span className="h-1 w-9 rounded bg-zinc-700" />
        <span className="h-0.5 w-11 rounded bg-zinc-500" />
        <span className="h-0.5 w-8 rounded bg-zinc-500" />
      </div>
    );
  }
  return (
    <div className={cn(base, "h-9 w-16 border-2", tipo === "arredondado" ? "rounded-lg" : "rounded-none")}
      style={{ background: cor.fundo, borderColor: cor.traco }}>
      Card
    </div>
  );
}

// O className do gatilho substitui o do Excalidraw: repete as classes dele e só solta a largura (texto em vez de ícone)
const ABA = "excalidraw-button sidebar-tab-trigger !w-auto !px-3 text-[13px]";

const BOTAO =
  "flex flex-col items-center gap-1 rounded-lg border border-transparent p-1.5 text-[11px] leading-tight text-[var(--text-primary-color)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-high)]";

export function PainelGestor({ api, docked, onDock }: { api: ExcalidrawImperativeAPI | null; docked: boolean; onDock: (d: boolean) => void }) {
  const [cor, setCor] = useState<Cor>(CORES[0]);
  const [etapas, setEtapas] = useState(4);

  const inserirForma = (forma: FormaExtra) => {
    if (!api) return;
    const { esqueletos, centros } = pecasParaEsqueletos(pecasDa(forma, 0, 0, { etapas }), cor);
    inserirNoCentro(api, esqueletos, centros);
  };
  const inserirCard = (tipo: TipoCard) => {
    if (api) inserirNoCentro(api, [esqueletoDoCard(tipo, cor)]);
  };

  const seletorCor = (
    <div className="mb-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">Cor</p>
      <div className="flex flex-wrap gap-1.5">
        {CORES.map((c) => (
          <button
            key={c.nome}
            type="button"
            title={c.nome}
            aria-label={`Cor ${c.nome}`}
            aria-pressed={c.nome === cor.nome}
            onClick={() => setCor(c)}
            className={cn("h-6 w-6 rounded-md border-2 transition-transform hover:scale-110", c.nome === cor.nome && "ring-2 ring-[var(--color-primary)] ring-offset-1")}
            style={{ background: c.fundo, borderColor: c.traco }}
          />
        ))}
      </div>
    </div>
  );

  return (
    <Sidebar name={NOME_PAINEL} docked={docked} onDock={onDock}>
      <Sidebar.Tabs>
        <Sidebar.Header>
          <Sidebar.TabTriggers>
            <Sidebar.TabTrigger tab="formas" className={ABA}>Formas</Sidebar.TabTrigger>
            <Sidebar.TabTrigger tab="cards" className={ABA}>Cards</Sidebar.TabTrigger>
          </Sidebar.TabTriggers>
        </Sidebar.Header>
        <Sidebar.Tab tab="formas" className="overflow-y-auto px-3 pb-4">
          {seletorCor}
          <div className="mb-3 flex items-center justify-between gap-2 text-[12px]">
            <span className="opacity-80">Etapas do funil e da pirâmide</span>
            <span className="flex items-center gap-1">
              <button type="button" className="rounded p-1 hover:bg-[var(--color-surface-high)] disabled:opacity-40" aria-label="Menos etapas"
                disabled={etapas <= 2} onClick={() => setEtapas((n) => Math.max(2, n - 1))}><Minus size={13} /></button>
              <span className="w-4 text-center font-semibold tabular-nums">{etapas}</span>
              <button type="button" className="rounded p-1 hover:bg-[var(--color-surface-high)] disabled:opacity-40" aria-label="Mais etapas"
                disabled={etapas >= 8} onClick={() => setEtapas((n) => Math.min(8, n + 1))}><Plus size={13} /></button>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {FORMAS_EXTRAS.map((f) => (
              <button key={f.id} type="button" className={BOTAO} onClick={() => inserirForma(f.id)} title={`Inserir ${f.rotulo.toLowerCase()}`}>
                <DesenhoForma pecas={pecasDa(f.id, 0, 0, COM_ETAPAS.includes(f.id) ? { etapas } : {})} largura={f.largura} altura={f.altura} cor={cor} />
                {f.rotulo}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-snug opacity-60">
            Clique para colocar no meio da tela. Para mudar o tamanho, arraste as alças; com Shift mantém a proporção.
          </p>
        </Sidebar.Tab>
        <Sidebar.Tab tab="cards" className="overflow-y-auto px-3 pb-4">
          {seletorCor}
          <div className="grid grid-cols-2 gap-1">
            {CARDS.map((c) => (
              <button key={c.id} type="button" className={cn(BOTAO, "min-h-[76px] justify-center")} onClick={() => inserirCard(c.id)}>
                <DesenhoCard tipo={c.id} cor={cor} />
                {c.rotulo}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-snug opacity-60">
            Duplo clique no card edita o texto. Para ligar dois cards, use a seta (A) partindo de um card até o outro.
          </p>
        </Sidebar.Tab>
      </Sidebar.Tabs>
    </Sidebar>
  );
}
