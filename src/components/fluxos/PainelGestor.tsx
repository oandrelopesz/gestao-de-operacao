// Painel "Formas" do quadro (barra lateral do Excalidraw): formas extras e cards prontos, na cor escolhida.
// O visual (abas em pílula, blocos com transição) está em styles.css, em ".painel-gestor".
import { useState } from "react";
import { Check, Minus, MousePointerClick, Plus } from "lucide-react";
import { Sidebar } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { FORMAS_EXTRAS, pecasDa, type FormaExtra, type Peca } from "@/lib/fluxoFormas";
import { cn } from "@/lib/utils";
import { CARDS, CORES, esqueletoDoCard, inserirNoCentro, pecasParaEsqueletos, type Cor, type TipoCard } from "./inserir";

export const NOME_PAINEL = "gestor";

const COM_ETAPAS: FormaExtra[] = ["funil", "piramide"];

/** Desenho pequeno da forma, a partir da mesma geometria que vai para o quadro (sem as âncoras invisíveis). */
function DesenhoForma({ pecas, largura, altura, cor }: { pecas: Peca[]; largura: number; altura: number; cor: Cor }) {
  const folga = 6;
  return (
    <svg viewBox={`${-folga} ${-folga} ${largura + folga * 2} ${altura + folga * 2}`} className="pg-desenho" aria-hidden>
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
  if (tipo === "postit") {
    return <div className="pg-card-previa pg-postit"><span className="pg-linha w-7" /><span className="pg-linha w-5" /></div>;
  }
  if (tipo === "destaque") {
    return <div className="pg-card-previa pg-destaque" style={{ background: cor.traco }}>Destaque</div>;
  }
  if (tipo === "etiqueta") {
    return <div className="pg-card-previa pg-etiqueta" style={{ background: cor.traco }}>Etiqueta</div>;
  }
  if (tipo === "etapa") {
    return (
      <div className="pg-card-previa pg-etapa" style={{ background: cor.fundo, borderColor: cor.traco }}>
        <span className="pg-linha w-9 bg-zinc-700" />
        <span className="pg-linha w-11" />
        <span className="pg-linha w-8" />
      </div>
    );
  }
  return (
    <div className={cn("pg-card-previa pg-simples", tipo === "arredondado" && "rounded-lg")} style={{ background: cor.fundo, borderColor: cor.traco }}>
      Card
    </div>
  );
}

export function PainelGestor({ api, docked, onDock }: { api: ExcalidrawImperativeAPI | null; docked: boolean; onDock: (d: boolean) => void }) {
  const [cor, setCor] = useState<Cor>(CORES[0]);
  const [etapas, setEtapas] = useState(4);

  // No celular o painel cobre quase o quadro: fecha antes, e a forma aparece no meio da tela
  const inserir = (fazer: (a: ExcalidrawImperativeAPI) => void) => {
    if (!api) return;
    if (window.matchMedia("(max-width: 730px)").matches) {
      api.toggleSidebar({ name: NOME_PAINEL, force: false });
      setTimeout(() => fazer(api), 80);
    } else {
      fazer(api);
    }
  };
  const inserirForma = (forma: FormaExtra) => inserir((a) => inserirNoCentro(a, pecasParaEsqueletos(pecasDa(forma, 0, 0, { etapas }), cor)));
  const inserirCard = (tipo: TipoCard) => inserir((a) => inserirNoCentro(a, [esqueletoDoCard(tipo, cor)]));

  const seletorCor = (
    <section className="pg-secao">
      <p className="pg-titulo">Cor</p>
      <div className="pg-cores">
        {CORES.map((c) => {
          const ativa = c.nome === cor.nome;
          return (
            <button
              key={c.nome}
              type="button"
              title={c.nome}
              aria-label={`Cor ${c.nome}`}
              aria-pressed={ativa}
              onClick={() => setCor(c)}
              className={cn("pg-cor", ativa && "pg-cor-ativa")}
              style={{ background: c.fundo, borderColor: c.traco }}
            >
              {ativa && <Check size={12} strokeWidth={3} style={{ color: c.traco }} />}
            </button>
          );
        })}
      </div>
    </section>
  );

  const dica = (texto: string) => (
    <p className="pg-dica"><MousePointerClick size={13} className="shrink-0" /> {texto}</p>
  );

  return (
    <Sidebar name={NOME_PAINEL} docked={docked} onDock={onDock} className="painel-gestor">
      <Sidebar.Tabs>
        <Sidebar.Header>
          <Sidebar.TabTriggers>
            <Sidebar.TabTrigger tab="formas" className="pg-aba">Formas</Sidebar.TabTrigger>
            <Sidebar.TabTrigger tab="cards" className="pg-aba">Cards</Sidebar.TabTrigger>
          </Sidebar.TabTriggers>
        </Sidebar.Header>
        <Sidebar.Tab tab="formas" className="pg-conteudo">
          {seletorCor}
          <section className="pg-secao">
            <p className="pg-titulo">Formas</p>
            <div className="pg-linha-etapas">
              <span className="pg-etapas-rotulo">Etapas do funil e da pirâmide</span>
              <span className="pg-contador">
                <button type="button" aria-label="Menos etapas" disabled={etapas <= 2} onClick={() => setEtapas((n) => Math.max(2, n - 1))}>
                  <Minus size={12} />
                </button>
                <span className="tabular-nums">{etapas}</span>
                <button type="button" aria-label="Mais etapas" disabled={etapas >= 8} onClick={() => setEtapas((n) => Math.min(8, n + 1))}>
                  <Plus size={12} />
                </button>
              </span>
            </div>
            <div className="pg-grade pg-grade-3">
              {FORMAS_EXTRAS.map((f) => (
                <button key={f.id} type="button" className="pg-bloco" onClick={() => inserirForma(f.id)} title={`Inserir ${f.rotulo.toLowerCase()}`}>
                  <DesenhoForma pecas={pecasDa(f.id, 0, 0, COM_ETAPAS.includes(f.id) ? { etapas } : {})} largura={f.largura} altura={f.altura} cor={cor} />
                  <span className="pg-rotulo">{f.rotulo}</span>
                </button>
              ))}
            </div>
          </section>
          {dica("Clique para colocar no meio da tela. Duplo clique na forma escreve dentro; as bolinhas nas bordas ligam uma forma à outra.")}
        </Sidebar.Tab>
        <Sidebar.Tab tab="cards" className="pg-conteudo">
          {seletorCor}
          <section className="pg-secao">
            <p className="pg-titulo">Cards</p>
            <div className="pg-grade pg-grade-2">
              {CARDS.map((c) => (
                <button key={c.id} type="button" className="pg-bloco pg-bloco-card" onClick={() => inserirCard(c.id)}>
                  <DesenhoCard tipo={c.id} cor={cor} />
                  <span className="pg-rotulo">{c.rotulo}</span>
                </button>
              ))}
            </div>
          </section>
          {dica("Duplo clique no card edita o texto. Arraste de uma bolinha da borda até outro card para ligar os dois com seta.")}
        </Sidebar.Tab>
      </Sidebar.Tabs>
    </Sidebar>
  );
}
