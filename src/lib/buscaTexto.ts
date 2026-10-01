// Busca de texto sem acento e sem diferença de maiúscula/minúscula ("joao" acha "João"). Usada pelo seletor de
// cliente com busca (ClienteSelect). Sem dependências: roda no `node --test`.

/** Tira acento, passa para minúscula, troca pontuação por espaço e junta espaços repetidos ("D'Ávila" vira "d avila"). */
export function normalizarBusca(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Nota de 0 a 1 de quanto o texto combina com o termo; 0 = não combina.
 * Todas as palavras do termo precisam aparecer no texto, em qualquer ordem ("silva joao" acha "João Silva").
 * Nota maior para texto que começa pelo termo, depois para palavra que começa pelo termo, depois para trecho solto.
 * Termo vazio combina com tudo.
 */
export function pontuarBusca(texto: string | null | undefined, termo: string | null | undefined): number {
  const alvo = normalizarBusca(termo);
  if (!alvo) return 1;
  const base = normalizarBusca(texto);
  if (!base) return 0;
  const palavras = alvo.split(" ");
  if (!palavras.every((p) => base.includes(p))) return 0;
  if (base.startsWith(alvo)) return 1;
  const comInicio = ` ${base}`;
  if (palavras.every((p) => comInicio.includes(` ${p}`))) return 0.75;
  return 0.5;
}

/** true quando o texto combina com o termo (sem acento, sem maiúscula, palavras em qualquer ordem). */
export function combinaBusca(texto: string | null | undefined, termo: string | null | undefined): boolean {
  return pontuarBusca(texto, termo) > 0;
}

/**
 * Função de filtro para o `<Command filter={...}>` do cmdk. O cmdk chama com o `value` do item, o texto digitado e as
 * `keywords` do item. Aqui `keywords` = [nome, agência (opcional)]: só elas entram na busca, o `value` (que carrega o id)
 * nunca é comparado. Achar pelo nome vale mais que achar só pela agência (0,25). Nota 0 esconde o item.
 */
export function filtroCmdk(_valor: string, busca: string, palavras: string[] = []): number {
  const [nome = "", agencia = ""] = palavras;
  const nota = pontuarBusca(nome, busca);
  if (nota > 0) return nota;
  return agencia && combinaBusca(`${nome} ${agencia}`, busca) ? 0.25 : 0;
}
