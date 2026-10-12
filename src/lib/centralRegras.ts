// Regras puras da Central de arquivos: formatos aceitos, tamanho, nomes e caminhos no R2.
// Sem imports de propósito: só lógica de texto e data, testável no node sem o app.

// Formatos de foto (com miniatura) e de logo (com ícone).
export const EXT_IMAGEM = ["jpg", "jpeg", "png", "webp", "gif", "svg", "avif", "heic", "heif"] as const;
export const EXT_LOGO = ["ai", "eps", "pdf", "psd", "cdr"] as const;

// Valor do `accept` do input de arquivo.
export const ACEITA = [...EXT_IMAGEM, ...EXT_LOGO].map((e) => "." + e).join(",");

export const TAMANHO_MAX = 100 * 1024 * 1024;

const TAMANHO_NOME_MAX = 150;
const FUSO = "America/Sao_Paulo";

// O que vem depois do último ponto, minúsculo; "" se não tiver ponto.
export function extensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i < 0 ? "" : nome.slice(i + 1).toLowerCase();
}

export function tipoArquivo(nome: string): "imagem" | "logo" | null {
  const ext = extensao(nome);
  if ((EXT_IMAGEM as readonly string[]).includes(ext)) return "imagem";
  if ((EXT_LOGO as readonly string[]).includes(ext)) return "logo";
  return null;
}

export function motivoRecusa(nome: string, tamanho: number): string | null {
  if (tipoArquivo(nome) === null) return `${nome}: formato não aceito (imagens e AI, EPS, PDF, PSD, CDR).`;
  if (tamanho > TAMANHO_MAX) return `${nome}: passa de 100 MB.`;
  return null;
}

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

export function caminhoCentral(clienteId: string, nome: string, agora: Date): string {
  return `${clienteId}/${carimbo(agora)}-${nomeLimpo(nome)}`;
}

// Nome que o usuário enviou: tira a pasta e o carimbo de data da frente.
export function nomeOriginal(caminho: string): string {
  const i = caminho.indexOf("/");
  const arquivo = i < 0 ? caminho : caminho.slice(i + 1);
  return arquivo.replace(/^\d{8}-\d{6}-/, "");
}

// Data do envio, lida do carimbo (horário de Brasília); null se não houver carimbo válido.
export function dataDoCaminho(caminho: string): Date | null {
  const i = caminho.indexOf("/");
  if (i < 0) return null;
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/.exec(caminho.slice(i + 1));
  if (!m) return null;
  const [, a, mes, d, h, mi, s] = m;
  const data = new Date(`${a}-${mes}-${d}T${h}:${mi}:${s}-03:00`);
  return isNaN(data.getTime()) ? null : data;
}

// Quantos arquivos cada cliente tem, pela pasta (parte antes da primeira barra).
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

// Arquivos de uma pasta, do mais novo para o mais antigo (o carimbo ordena pelo texto).
export function arquivosDoCliente(caminhos: string[], clienteId: string): string[] {
  const prefixo = `${clienteId}/`;
  return caminhos.filter((c) => c.startsWith(prefixo)).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}
