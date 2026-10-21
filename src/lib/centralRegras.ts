// Regras puras da Central de arquivos: tamanho, nomes, pastas e caminhos no R2.
// Sem imports de propósito: só lógica de texto e data, testável no node sem o app.
// Caminho de um arquivo: `<cliente_id>/<pasta>/<subpasta>/<carimbo>-<nome>`; as pastas existem só como parte do caminho.

// Formatos de foto (com miniatura); qualquer outro formato é aceito e aparece com ícone e extensão.
export const EXT_IMAGEM = ["jpg", "jpeg", "png", "webp", "gif", "svg", "avif", "heic", "heif"] as const;
export const EXT_LOGO = ["ai", "eps", "pdf", "psd", "cdr"] as const;

export const TAMANHO_MAX = 100 * 1024 * 1024;

const TAMANHO_NOME_MAX = 150;
const FUSO = "America/Sao_Paulo";

// O que vem depois do último ponto, minúsculo; "" se não tiver ponto.
export function extensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i < 0 ? "" : nome.slice(i + 1).toLowerCase();
}

export function tipoArquivo(nome: string): "imagem" | "logo" | "outro" {
  const ext = extensao(nome);
  if ((EXT_IMAGEM as readonly string[]).includes(ext)) return "imagem";
  if ((EXT_LOGO as readonly string[]).includes(ext)) return "logo";
  return "outro";
}

export function motivoRecusa(nome: string, tamanho: number): string | null {
  return tamanho > TAMANHO_MAX ? `${nome}: passa de 100 MB.` : null;
}

// Arquivos que o sistema operacional cria sozinho dentro das pastas: não vão para a Central.
export const ehLixo = (nome: string): boolean => /^(\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(nome);

// AAAAMMDD-HHMMSS no horário de Brasília.
export function carimbo(agora: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "00";
  return `${p("year")}${p("month")}${p("day")}-${p("hour")}${p("minute")}${p("second")}`;
}

// Troca barra e caractere de controle por "-", tira espaços das pontas e corta nome longo mantendo a extensão.
export function nomeLimpo(nome: string): string {
  const limpo = nome.replace(/[\\/\x00-\x1f\x7f]/g, "-").trim() || "arquivo";
  if (limpo.length <= TAMANHO_NOME_MAX) return limpo;
  const i = limpo.lastIndexOf(".");
  if (i <= 0) return limpo.slice(0, TAMANHO_NOME_MAX);
  const ext = limpo.slice(i + 1);
  const espaco = TAMANHO_NOME_MAX - ext.length - 1;
  if (espaco < 1) return limpo.slice(0, TAMANHO_NOME_MAX);
  return limpo.slice(0, i).slice(0, espaco) + "." + ext;
}

// Pasta vinda de um envio ("Logos/azul"): limpa cada nível; "." e ".." viram "-". Vazia = raiz do cliente.
export function pastaLimpa(pasta: string): string {
  return pasta
    .split("/")
    .map((nivel) => {
      const limpo = nomeLimpo(nivel).slice(0, 100);
      return limpo === "." || limpo === ".." ? "-" : limpo;
    })
    .join("/");
}

export function caminhoCentral(clienteId: string, nome: string, agora: Date, pasta = ""): string {
  const dir = pasta ? `${pastaLimpa(pasta)}/` : "";
  return `${clienteId}/${dir}${carimbo(agora)}-${nomeLimpo(nome)}`;
}

// Último trecho do caminho (o arquivo, com o carimbo).
const ultimo = (caminho: string): string => caminho.slice(caminho.lastIndexOf("/") + 1);

// Nome que o usuário enviou: tira as pastas e o carimbo de data da frente.
export function nomeOriginal(caminho: string): string {
  return ultimo(caminho).replace(/^\d{8}-\d{6}-/, "");
}

// Pasta do arquivo dentro do cliente ("" = raiz).
export function pastaDoCaminho(caminho: string): string {
  const i = caminho.indexOf("/");
  const j = caminho.lastIndexOf("/");
  return i < 0 || j <= i ? "" : caminho.slice(i + 1, j);
}

// "Logo final.png" vira ["Logo final", ".png"]; sem extensão (ou só com ponto na frente) devolve [nome, ""].
export function separarExtensao(nome: string): [string, string] {
  const i = nome.lastIndexOf(".");
  return i <= 0 ? [nome, ""] : [nome.slice(0, i), nome.slice(i)];
}

// Mesmo arquivo (mesma pasta, mesmo carimbo) com outro nome. A extensão original fica: o formato nunca muda.
export function renomeado(caminho: string, novoNome: string): string {
  const [, ext] = separarExtensao(nomeOriginal(caminho));
  const carimboAtual = /^\d{8}-\d{6}-/.exec(ultimo(caminho))?.[0] ?? "";
  return `${caminho.slice(0, caminho.lastIndexOf("/") + 1)}${carimboAtual}${nomeLimpo(novoNome.trim() + ext)}`;
}

// Data do envio, lida do carimbo (horário de Brasília); null se não houver carimbo válido.
export function dataDoCaminho(caminho: string): Date | null {
  if (!caminho.includes("/")) return null;
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/.exec(ultimo(caminho));
  if (!m) return null;
  const [, a, mes, d, h, mi, s] = m;
  const data = new Date(`${a}-${mes}-${d}T${h}:${mi}:${s}-03:00`);
  return isNaN(data.getTime()) ? null : data;
}

// Quantos arquivos cada cliente tem, pela pasta (parte antes da primeira barra), contando as subpastas.
export function contarPorCliente(caminhos: string[]): Record<string, number> {
  const contagem: Record<string, number> = {};
  for (const c of caminhos) {
    const i = c.indexOf("/");
    if (i < 0) continue;
    const cliente = c.slice(0, i);
    contagem[cliente] = (contagem[cliente] ?? 0) + 1;
  }
  return contagem;
}

// Tudo o que há numa pasta do cliente, com as subpastas (o carimbo ordena pelo texto: mais novo primeiro).
export function arquivosDaPasta(caminhos: string[], clienteId: string, pasta = ""): string[] {
  const prefixo = pasta ? `${clienteId}/${pasta}/` : `${clienteId}/`;
  return caminhos.filter((c) => c.startsWith(prefixo)).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

export interface ConteudoPasta {
  /** Subpastas diretas, em ordem alfabética, com o total de arquivos dentro (em qualquer nível). */
  pastas: { nome: string; caminho: string; total: number }[];
  /** Arquivos que estão direto nesta pasta, do mais novo para o mais antigo. */
  arquivos: string[];
}

// O que mostrar ao abrir uma pasta: as subpastas de um nível e os arquivos soltos nela.
export function conteudoDaPasta(caminhos: string[], clienteId: string, pasta = ""): ConteudoPasta {
  const prefixo = pasta ? `${clienteId}/${pasta}/` : `${clienteId}/`;
  const subpastas = new Map<string, number>();
  const arquivos: string[] = [];
  for (const c of arquivosDaPasta(caminhos, clienteId, pasta)) {
    const resto = c.slice(prefixo.length);
    const i = resto.indexOf("/");
    if (i < 0) arquivos.push(c);
    else subpastas.set(resto.slice(0, i), (subpastas.get(resto.slice(0, i)) ?? 0) + 1);
  }
  const pastas = [...subpastas]
    .map(([nome, total]) => ({ nome, caminho: pasta ? `${pasta}/${nome}` : nome, total }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { pastas, arquivos };
}

// Caminho de cada arquivo dentro do .zip de uma pasta: relativo a ela, com o nome original. Nome repetido
// na mesma pasta (enviado em datas diferentes) ganha " (2)", " (3)"... antes da extensão.
export function entradasDoZip(caminhos: string[], clienteId: string, pasta: string, nomeRaiz: string): { caminho: string; entrada: string }[] {
  const prefixo = pasta ? `${clienteId}/${pasta}/` : `${clienteId}/`;
  const usados = new Set<string>();
  // do mais antigo para o mais novo: o mais antigo fica com o nome limpo
  return [...arquivosDaPasta(caminhos, clienteId, pasta)].reverse().map((caminho) => {
    const dir = caminho.slice(prefixo.length, caminho.lastIndexOf("/") + 1);
    const [base, ext] = separarExtensao(nomeOriginal(caminho));
    let entrada = `${nomeRaiz}/${dir}${base}${ext}`;
    for (let n = 2; usados.has(entrada.toLowerCase()); n++) entrada = `${nomeRaiz}/${dir}${base} (${n})${ext}`;
    usados.add(entrada.toLowerCase());
    return { caminho, entrada };
  });
}
