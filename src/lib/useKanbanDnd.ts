import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import {
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  MeasuringStrategy,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

/**
 * Drag-and-drop de Kanban com várias colunas (padrão "MultipleContainers" do dnd-kit).
 *
 * - Entre colunas: o card muda de coluna durante o arrasto (onDragOver), na posição
 *   acima/abaixo do card alvo conforme o ponteiro.
 * - Dentro da coluna: a animação fica por conta da SortableContext e a nova ordem é
 *   aplicada só ao soltar (arrayMove) — sem "pula-pula".
 * - A ordem de cada coluna é reescrita no campo `ordem` (0..n) e entregue em onDrop
 *   para persistir; as colunas são lidas por `getContainer`.
 */
export interface KanbanItem {
  id: string;
  ordem?: number | null;
}

interface Options<T extends KanbanItem> {
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  containerIds: string[];
  getContainer: (item: T) => string;
  setContainer: (item: T, container: string) => T;
  /** Card que não pode ser arrastado */
  isItemLocked?: (item: T) => boolean;
  /** Coluna que não aceita cards de fora */
  isContainerLocked?: (containerId: string) => boolean;
  onStart?: (item: T) => void;
  onCancel?: () => void;
  /** Lista final (já com `ordem` recalculada nas colunas envolvidas) para persistir */
  onDrop: (finalItems: T[], activeId: string, originContainer: string, targetContainer: string) => void;
}

const byOrdem = <T extends KanbanItem>(a: T, b: T) => (a.ordem ?? 0) - (b.ordem ?? 0);

export function useKanbanDnd<T extends KanbanItem>(opts: Options<T>) {
  const { items, setItems, containerIds, getContainer, setContainer, isItemLocked, isContainerLocked, onStart, onCancel, onDrop } = opts;

  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewContainer = useRef(false);
  const originRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const containerSet = useMemo(() => new Set(containerIds), [containerIds]);

  const columnOf = useCallback(
    (list: T[], id: string): string | undefined => {
      if (containerSet.has(id)) return id;
      const item = list.find((i) => i.id === id);
      return item ? getContainer(item) : undefined;
    },
    [containerSet, getContainer]
  );

  const columnItems = useCallback(
    (list: T[], container: string) => list.filter((i) => getContainer(i) === container).sort(byOrdem),
    [getContainer]
  );

  /** Move o card ativo para `container`, na posição `index`, reescrevendo a ordem da coluna. */
  const moveToContainer = useCallback(
    (list: T[], activeId: string, container: string, index: number): T[] => {
      const active = list.find((i) => i.id === activeId);
      if (!active) return list;
      const target = columnItems(list, container).filter((i) => i.id !== activeId);
      const at = Math.max(0, Math.min(index, target.length));
      target.splice(at, 0, setContainer(active, container));
      const ordem = new Map(target.map((i, idx) => [i.id, idx]));
      return list.map((i) => {
        if (!ordem.has(i.id)) return i;
        const base = i.id === activeId ? setContainer(i, container) : i;
        return { ...base, ordem: ordem.get(i.id) };
      });
    },
    [columnItems, setContainer]
  );

  // Após mover para outra coluna o layout muda; espera um frame antes de aceitar novo "over"
  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  }, [items]);

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const activeId = args.active.id;
      // Ponteiro dentro de algo? Senão, interseção de retângulos.
      const pointerIntersections = pointerWithin(args);
      const intersections = pointerIntersections.length > 0 ? pointerIntersections : rectIntersection(args);
      let overId = getFirstCollision(intersections, "id");

      if (overId != null) {
        if (containerSet.has(String(overId))) {
          // Sobre a área da coluna: escolhe o card mais próximo dentro dela (ou a coluna, se vazia)
          const ids = new Set(columnItems(itemsRef.current, String(overId)).map((i) => i.id));
          if (ids.size > 0) {
            const closest = closestCenter({
              ...args,
              droppableContainers: args.droppableContainers.filter((c) => c.id !== overId && ids.has(String(c.id))),
            });
            if (closest.length > 0) overId = closest[0].id;
          }
        }
        lastOverId.current = overId;
        return [{ id: overId }];
      }

      // Logo após trocar de coluna o "over" pode ficar nulo por um instante:
      // mantém o próprio card como alvo para não pular de posição.
      if (recentlyMovedToNewContainer.current) lastOverId.current = activeId;
      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [containerSet, columnItems]
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      activeIdRef.current = id;
      originRef.current = getContainer(item);
      lastOverId.current = null;
      onStart?.(item);
    },
    [getContainer, onStart]
  );

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      const list = itemsRef.current;
      const activeItem = list.find((i) => i.id === activeId);
      if (!activeItem || isItemLocked?.(activeItem)) return;

      const overContainer = columnOf(list, overId);
      const activeContainer = getContainer(activeItem);
      if (!overContainer || overContainer === activeContainer) return; // mesma coluna: só ao soltar
      if (isContainerLocked?.(overContainer)) return;

      const overItems = columnItems(list, overContainer).filter((i) => i.id !== activeId);
      let newIndex = overItems.length;
      if (!containerSet.has(overId)) {
        const overIndex = overItems.findIndex((i) => i.id === overId);
        const translated = active.rect.current.translated;
        const isBelowOverItem = !!translated && translated.top > over.rect.top + over.rect.height;
        newIndex = overIndex >= 0 ? overIndex + (isBelowOverItem ? 1 : 0) : overItems.length;
      }

      recentlyMovedToNewContainer.current = true;
      setItems((prev) => moveToContainer(prev, activeId, overContainer, newIndex));
    },
    [columnOf, columnItems, containerSet, getContainer, isContainerLocked, isItemLocked, moveToContainer, setItems]
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const activeId = String(active.id);
      const origin = originRef.current;
      originRef.current = null;
      activeIdRef.current = null;

      const list = itemsRef.current;
      const activeItem = list.find((i) => i.id === activeId);
      if (!activeItem || isItemLocked?.(activeItem)) {
        onCancel?.();
        return;
      }

      let finalList = list;
      const activeContainer = getContainer(activeItem);
      const overId = over ? String(over.id) : null;
      const overContainer = overId ? columnOf(list, overId) : undefined;

      if (overId && overContainer && !isContainerLocked?.(overContainer)) {
        if (overContainer !== activeContainer) {
          // Soltou direto em outra coluna sem passar pelo onDragOver
          const overItems = columnItems(list, overContainer);
          const idx = containerSet.has(overId) ? overItems.length : Math.max(0, overItems.findIndex((i) => i.id === overId));
          finalList = moveToContainer(list, activeId, overContainer, idx);
        } else if (!containerSet.has(overId) && overId !== activeId) {
          // Reordenação dentro da mesma coluna
          const column = columnItems(list, activeContainer);
          const from = column.findIndex((i) => i.id === activeId);
          const to = column.findIndex((i) => i.id === overId);
          if (from >= 0 && to >= 0 && from !== to) {
            const moved = arrayMove(column, from, to);
            const ordem = new Map(moved.map((i, i2) => [i.id, i2]));
            finalList = list.map((i) => (ordem.has(i.id) ? { ...i, ordem: ordem.get(i.id) } : i));
          }
        }
      }

      if (finalList !== list) setItems(finalList);

      const finalItem = finalList.find((i) => i.id === activeId) ?? activeItem;
      const target = getContainer(finalItem);
      onDrop(finalList, activeId, origin ?? activeContainer, target);
    },
    [columnItems, columnOf, containerSet, getContainer, isContainerLocked, isItemLocked, moveToContainer, onCancel, onDrop, setItems]
  );

  const onDragCancel = useCallback(() => {
    originRef.current = null;
    activeIdRef.current = null;
    onCancel?.();
  }, [onCancel]);

  const measuring = useMemo(() => ({ droppable: { strategy: MeasuringStrategy.Always } }), []);

  return { collisionDetection, measuring, onDragStart, onDragOver, onDragEnd, onDragCancel };
}
