// Kanban do CRM (spec §9.2): uma coluna por crm_colunas, arrastar entre colunas e reordenar, seleção em massa.
// O arrasto mexe na lista completa do contexto (useKanbanDnd); a tela mostra só os leads filtrados (props).
// Soltar em outra coluna pede o movimento ao contexto — se a coluna exige dados, abre a janela; cancelar
// (ou falhar) devolve os cards para onde estavam.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  defaultDropAnimationSideEffects,
  type DropAnimation,
} from "@dnd-kit/core";
import { useCrm } from "@/components/crm/CrmContexto";
import { ColunaKanban } from "@/components/crm/ColunaKanban";
import { CardLeadView } from "@/components/crm/CardLead";
import { SelecaoBarraCrm } from "@/components/crm/SelecaoBarraCrm";
import { useKanbanDnd } from "@/lib/useKanbanDnd";
import { useSensoresArrastar } from "@/lib/arrastar";
import type { LeadCrm } from "@/lib/crmTipos";
import { cn } from "@/lib/utils";

const byOrdem = (a: LeadCrm, b: LeadCrm) => (a.ordem ?? 0) - (b.ordem ?? 0);

const animacaoSoltar: DropAnimation = {
  duration: 150,
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.5" } } }),
};

const semAcao = () => {};

export function KanbanCrm({ leads }: { leads: LeadCrm[] }) {
  const { colunas, leads: todos, setLeads, colunaDoLead, pedirMovimento, salvarOrdem } = useCrm();
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [ativo, setAtivo] = useState<LeadCrm | null>(null);
  const [montado, setMontado] = useState(false);
  const sensors = useSensoresArrastar(3);

  const todosRef = useRef(todos);
  todosRef.current = todos;
  /** Lista completa antes do arrasto e o lead como estava (coluna de origem) */
  const antesRef = useRef<LeadCrm[] | null>(null);
  const originalRef = useRef<LeadCrm | null>(null);

  useEffect(() => setMontado(true), []);

  const containerIds = useMemo(() => colunas.map((c) => c.id), [colunas]);
  const getContainer = useCallback((l: LeadCrm) => colunaDoLead(l)?.id ?? "", [colunaDoLead]);
  const setContainer = useCallback(
    (l: LeadCrm, coluna: string): LeadCrm => ({ ...l, coluna_id: coluna }),
    [],
  );

  /** Devolve coluna e ordem de quem o arrasto mexeu (sem apagar outras mudanças que chegaram nesse meio-tempo). */
  const restaurar = useCallback(
    (antes: LeadCrm[]) => {
      const porId = new Map(antes.map((l) => [l.id, l]));
      setLeads((prev) =>
        prev.map((l) => {
          const a = porId.get(l.id);
          return a && (a.coluna_id !== l.coluna_id || a.ordem !== l.ordem)
            ? { ...l, coluna_id: a.coluna_id, ordem: a.ordem }
            : l;
        }),
      );
    },
    [setLeads],
  );

  const dnd = useKanbanDnd<LeadCrm>({
    items: todos,
    setItems: setLeads,
    containerIds,
    getContainer,
    setContainer,
    onStart: (lead) => {
      antesRef.current = todosRef.current;
      originalRef.current = lead;
      setAtivo(lead);
    },
    onCancel: () => {
      setAtivo(null);
      const antes = antesRef.current;
      antesRef.current = null;
      originalRef.current = null;
      if (antes) restaurar(antes);
    },
    onDrop: (finalList, activeId, origin, target) => {
      setAtivo(null);
      const antes = antesRef.current ?? finalList;
      const original = originalRef.current;
      antesRef.current = null;
      originalRef.current = null;

      // Ordem é cosmética: grava só quem mudou de posição na coluna de destino
      const ordemAntes = new Map(antes.map((l) => [l.id, l.ordem]));
      const novaOrdem = finalList
        .filter((l) => getContainer(l) === target && ordemAntes.get(l.id) !== l.ordem)
        .map((l) => ({ id: l.id, ordem: l.ordem ?? 0 }));

      if (origin === target || !original) {
        if (novaOrdem.length) void salvarOrdem(novaOrdem);
        return;
      }

      // Vai o lead como estava (coluna de origem), só com a posição nova — assim o card fica onde caiu.
      const final = finalList.find((l) => l.id === activeId);
      pedirMovimento({ ...original, ordem: final?.ordem ?? original.ordem }, target, {
        aoCancelar: () => restaurar(antes),
      });
      if (novaOrdem.length) void salvarOrdem(novaOrdem);
    },
  });

  // Seleção: só leads que continuam na tela (filtro mudou, lead excluído…)
  useEffect(() => {
    setSelecionados((prev) => {
      if (!prev.size) return prev;
      const visiveis = new Set(leads.map((l) => l.id));
      const nova = new Set([...prev].filter((id) => visiveis.has(id)));
      return nova.size === prev.size ? prev : nova;
    });
  }, [leads]);

  const limpar = useCallback(() => setSelecionados(new Set()), []);

  // Esc limpa a seleção (se não houver janela ou menu aberto por cima)
  useEffect(() => {
    if (!selecionados.size) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')
      )
        limpar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [selecionados.size, limpar]);

  const onSelecionar = useCallback((id: string, marcado: boolean) => {
    setSelecionados((prev) => {
      if (prev.has(id) === marcado) return prev;
      const nova = new Set(prev);
      if (marcado) nova.add(id);
      else nova.delete(id);
      return nova;
    });
  }, []);

  const onSelecionarColuna = useCallback((ids: string[], marcado: boolean) => {
    setSelecionados((prev) => {
      const nova = new Set(prev);
      for (const id of ids) {
        if (marcado) nova.add(id);
        else nova.delete(id);
      }
      return nova;
    });
  }, []);

  const porColuna = useMemo(() => {
    const mapa = new Map<string, LeadCrm[]>(colunas.map((c) => [c.id, []]));
    for (const l of leads) mapa.get(getContainer(l))?.push(l);
    for (const lista of mapa.values()) lista.sort(byOrdem);
    return mapa;
  }, [colunas, leads, getContainer]);

  if (!colunas.length) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        Nenhuma coluna configurada. Use o botão “Colunas” para criar a primeira.
      </div>
    );
  }

  const sobreposicao = (
    <DragOverlay dropAnimation={animacaoSoltar}>
      {ativo ? (
        <CardLeadView
          lead={ativo}
          selecionado={selecionados.has(ativo.id)}
          algumSelecionado={false}
          onSelecionar={semAcao}
        />
      ) : null}
    </DragOverlay>
  );

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={dnd.collisionDetection}
        measuring={dnd.measuring}
        autoScroll={dnd.autoScroll}
        onDragStart={dnd.onDragStart}
        onDragOver={dnd.onDragOver}
        onDragEnd={dnd.onDragEnd}
        onDragCancel={dnd.onDragCancel}
      >
        <div
          className={cn(
            "custom-scrollbar h-[calc(100dvh-15rem)] min-h-[26rem] overflow-x-auto overscroll-x-contain pb-3",
            // No celular as colunas "encaixam" uma por vez; durante o arrasto o encaixe sai para a rolagem automática funcionar
            ativo ? "snap-none" : "max-lg:snap-x max-lg:snap-mandatory max-lg:scroll-px-1",
          )}
        >
          <div className="flex h-full min-w-max gap-3 max-lg:px-1">
            {colunas.map((c) => (
              <ColunaKanban
                key={c.id}
                coluna={c}
                leads={porColuna.get(c.id) ?? []}
                selecionados={selecionados}
                onSelecionar={onSelecionar}
                onSelecionarColuna={onSelecionarColuna}
              />
            ))}
          </div>
        </div>
        {/* No <body>: o conteúdo da página tem transform (animação de entrada), que desloca elementos "fixed" */}
        {montado ? createPortal(sobreposicao, document.body) : sobreposicao}
      </DndContext>
      {selecionados.size > 0 && (
        <SelecaoBarraCrm selecionados={[...selecionados]} onLimpar={limpar} />
      )}
    </>
  );
}
