// Copia o cofre de clientes do Obsidian para a aba Conteúdo (spec docs/superpowers/specs/2026-10-12-conteudo-automatico-design.md).
// Só lê o cofre. Envia, de todas as pastas de cliente, só o que mudou: notas .md da raiz, Documentos/*.md, o Log dos últimos 60 dias e as logos e fontes de Anexos/ e Fontes/ (binário, em base64).
// Uso: node tools/cofre-sync/sync.mjs   (o Agendador de Tarefas do Windows roda de hora em hora)
// Config (fora do repositório): %USERPROFILE%\.gestao\cofre-sync.json = { url, chave, cofre }
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ARQUIVO_LOG, ehFonteDoCofre, ehLogoDoCofre, mudancasCofre, recortarLog } from "../../supabase/functions/conteudo/regras.ts";

const cfg = JSON.parse(readFileSync(join(homedir(), ".gestao", "cofre-sync.json"), "utf8"));
const CLIENTES = join(cfg.cofre, "01 Clientes");
const LOTE_MAX = 1_500_000;
const hash = (s) => createHash("sha256").update(s).digest("hex");
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function chamar(corpo) {
  const r = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cofre-key": cfg.chave },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? `a função respondeu ${r.status}`);
  return j;
}

function arquivosDaPasta(pasta) {
  const dir = join(CLIENTES, pasta);
  const saida = {};
  for (const f of readdirSync(dir)) {
    if (f.toLowerCase().endsWith(".md") && f !== "Log.md" && statSync(join(dir, f)).isFile()) saida[f] = readFileSync(join(dir, f), "utf8");
  }
  const log = join(dir, "Log.md");
  if (existsSync(log)) saida[ARQUIVO_LOG] = recortarLog(readFileSync(log, "utf8"), hoje);
  const docs = join(dir, "Documentos");
  if (existsSync(docs)) {
    for (const f of readdirSync(docs)) if (f.toLowerCase().endsWith(".md")) saida[`Documentos/${f}`] = readFileSync(join(docs, f), "utf8");
  }
  const anexos = join(dir, "Anexos");
  if (existsSync(anexos)) {
    for (const f of readdirSync(anexos)) if (ehLogoDoCofre(`Anexos/${f}`) || ehFonteDoCofre(`Anexos/${f}`)) saida[`Anexos/${f}`] = readFileSync(join(anexos, f)); // Buffer
  }
  const fontes = join(dir, "Fontes");
  if (existsSync(fontes)) {
    for (const f of readdirSync(fontes)) if (ehFonteDoCofre(`Fontes/${f}`)) saida[`Fontes/${f}`] = readFileSync(join(fontes, f)); // Buffer
  }
  return saida;
}

const pastas = readdirSync(CLIENTES).filter((p) => statSync(join(CLIENTES, p)).isDirectory()).sort();
const remoto = await chamar({ acao: "cofre_hashes" });
let lote = { acao: "cofre_sync", pastas, arquivos: [], remover: [] };
let tamanho = 0;
let enviados = 0;
let removidos = 0;
async function enviar() {
  const r = await chamar(lote);
  enviados += r.gravados;
  removidos += r.removidos;
  lote = { acao: "cofre_sync", arquivos: [], remover: [] };
  tamanho = 0;
}
for (const pasta of pastas) {
  // nota acima de 1 milhão de caracteres a função recusa: fica de fora (senão seria reenviada toda hora)
  const locais = Object.fromEntries(Object.entries(arquivosDaPasta(pasta)).filter(([, v]) => Buffer.isBuffer(v) || v.length <= 1_000_000));
  const hashes = Object.fromEntries(Object.entries(locais).map(([c, t]) => [c, hash(t)]));
  const { enviar: novos, remover } = mudancasCofre(hashes, remoto.hashes[pasta] ?? {});
  for (const caminho of remover) lote.remover.push({ pasta, caminho });
  for (const caminho of novos) {
    const bin = Buffer.isBuffer(locais[caminho]);
    const conteudo = bin ? locais[caminho].toString("base64") : locais[caminho];
    lote.arquivos.push({ pasta, caminho, hash: hashes[caminho], conteudo, ...(bin && { binario: true }) });
    tamanho += conteudo.length;
    if (tamanho > LOTE_MAX) await enviar();
  }
}
await enviar();
console.log(`${new Date().toISOString()} cofre: ${pastas.length} pastas, ${enviados} arquivos enviados, ${removidos} removidos`);
