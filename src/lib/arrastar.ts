// Sensores do dnd-kit: no mouse, exatamente o PointerSensor de sempre (arrasta depois de N px e respeita os
// stopPropagation de onPointerDown dos botões dentro dos cards); no toque, só depois de segurar ~250 ms
// parado — assim deslizar o dedo rola a tela em vez de arrastar o card.
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";

export const ATRASO_TOQUE_MS = 250;
export const TOLERANCIA_TOQUE_PX = 8;

/** PointerSensor que ignora o dedo (o toque fica com o TouchSensor, que espera segurar). */
class PointerSemToque extends PointerSensor {
  static activators: typeof PointerSensor.activators = [
    {
      eventName: "onPointerDown",
      handler: ({ nativeEvent: e }, { onActivation }) => {
        if (!e.isPrimary || e.button !== 0 || e.pointerType === "touch") return false;
        onActivation?.({ event: e });
        return true;
      },
    },
  ];
}

/** Teclado só onde já existia (quem passa `coordenadasTeclado`); sem ele, o comportamento de antes. */
export function useSensoresArrastar(distancia: number, coordenadasTeclado?: KeyboardCoordinateGetter) {
  const teclado = useSensor(KeyboardSensor, coordenadasTeclado ? { coordinateGetter: coordenadasTeclado } : {});
  return useSensors(
    useSensor(PointerSemToque, { activationConstraint: { distance: distancia } }),
    useSensor(TouchSensor, { activationConstraint: { delay: ATRASO_TOQUE_MS, tolerance: TOLERANCIA_TOQUE_PX } }),
    coordenadasTeclado ? teclado : null,
  );
}
