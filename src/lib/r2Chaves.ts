// Arquivos do sistema no Cloudflare R2 (spec 2026-09-30-arquivos-r2-design.md): regras puras, sem imports.
// Rodam no navegador e no `node --test`. A edge function `r2` repete a validação de chave, porque é
// publicada sozinha e não importa código do app.

/** Módulo do sistema → bucket onde os arquivos dele ficavam no Storage do Supabase. */
export const MODULOS_R2 = { arquivos: "pdfs", notas: "notas", fluxogramas: "fluxogramas" } as const;
export type ModuloR2 = keyof typeof MODULOS_R2;

const TAMANHO_MAX_CHAVE = 512;

/** Caminho dentro do módulo: sem barra no início, sem "//", sem "." ou "..", sem barra invertida e sem caractere de controle. */
export function caminhoValido(caminho: string): boolean {
  if (!caminho || caminho.startsWith("/") || caminho.includes("//") || caminho.includes("\\")) return false;
  if (caminho.split("/").some((parte) => parte === ".." || parte === ".")) return false;
  for (const ch of caminho) {
    const codigo = ch.charCodeAt(0);
    if (codigo < 32 || codigo === 127) return false;
  }
  return true;
}

/** Chave do objeto no R2: `<modulo>/<caminho>` (o caminho é o mesmo que o arquivo tinha no Supabase). */
export function chaveR2(modulo: ModuloR2, caminho: string): string {
  if (!Object.prototype.hasOwnProperty.call(MODULOS_R2, modulo)) throw new Error(`Módulo inválido: ${String(modulo)}`);
  if (!caminhoValido(caminho)) throw new Error(`Caminho de arquivo inválido: ${caminho}`);
  const chave = `${modulo}/${caminho}`;
  if (chave.length > TAMANHO_MAX_CHAVE) throw new Error("Caminho de arquivo longo demais.");
  return chave;
}

/** Endereço fixo de uma imagem de nota: a função `r2` redireciona para um link assinado novo a cada acesso. */
export function urlImagemNota(supabaseUrl: string, arquivo: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/r2?c=${encodeURIComponent(chaveR2("notas", arquivo))}`;
}

/**
 * Nome do arquivo de uma imagem de nota que é nossa, no endereço antigo (Storage público do Supabase) ou no novo
 * (função `r2`). Imagem de fora (colada de um site) devolve null.
 */
export function arquivoDaImagemNota(src: string): string | null {
  const antigo = /\/storage\/v1\/object\/public\/notas\/([^?#]+)/.exec(src);
  const novo = antigo ? null : /\/functions\/v1\/r2\?(?:[^#]*&)?c=([^&#]+)/.exec(src);
  if (antigo) return validado(decodificar(antigo[1]));
  if (!novo) return null;
  const chave = decodificar(novo[1]);
  return chave && chave.startsWith("notas/") ? validado(chave.slice("notas/".length)) : null;
}

/** decodeURIComponent que não lança: sequência "%" malformada (endereço colado de qualquer lugar) devolve null. */
function decodificar(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

const validado = (arquivo: string | null): string | null => (arquivo && caminhoValido(arquivo) ? arquivo : null);