// Datas da aba Livros. data_inicio e data_conclusao são DATE ("AAAA-MM-DD") e valem como dia de Brasília:
// o ano sai direto do texto, sem `new Date(...)` (que leria meia-noite UTC e puxaria 1º de janeiro para o ano anterior).

/** Ano de uma data "AAAA-MM-DD". */
export function anoDaData(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** Livros lidos cuja conclusão cai no mesmo ano de `hoje` ("AAAA-MM-DD", de `hojeBrasilia()`). Conclusão nula não conta. */
export function contarLidosNoAno(livros: { lido: boolean; data_conclusao: string | null }[], hoje: string): number {
  const ano = anoDaData(hoje);
  return livros.filter((l) => l.lido && l.data_conclusao && anoDaData(l.data_conclusao) === ano).length;
}
