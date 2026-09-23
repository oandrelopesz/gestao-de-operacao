/** Milissegundos até 00:01 (horário local): a virada roda às 00:00 no banco e leva alguns segundos. */
export function msAteProximaVirada(agora: Date): number {
  const alvo = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 1, 0, 0);
  if (alvo.getTime() <= agora.getTime()) alvo.setDate(alvo.getDate() + 1);
  return alvo.getTime() - agora.getTime();
}
