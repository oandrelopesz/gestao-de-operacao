// Tabelas (markdown) a partir do JSON do medir-performance.mjs: mediana das repetições por tela × fase × aba.
// Com duas versões (COMPARAR), mostra as duas lado a lado.
// uso: node resumir-performance.mjs <resultado.json> [saida.md]   ROTULOS=antes,depois (nomes das versões)
import { readFileSync, writeFileSync } from "node:fs";

const [ENTRADA, SAIDA] = process.argv.slice(2);
if (!ENTRADA) { console.error("uso: node resumir-performance.mjs <resultado.json> [saida.md]"); process.exit(1); }
const dados = JSON.parse(readFileSync(ENTRADA, "utf8"));
const bases = dados.bases ?? [dados.base];
const rotulos = process.env.ROTULOS ? process.env.ROTULOS.split(",") : bases.map((b) => b.replace(/^https?:\/\//, ""));
const nome = (b) => rotulos[bases.indexOf(b)] ?? b;
const linhas = dados.resultados.map((r) => ({ ...r, base: r.base ?? bases[0] }));

const mediana = (xs) => {
  const v = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
};
const grupo = (tela, fase, rota, base) => linhas.filter((r) => r.tela === tela && r.fase === fase && r.rota === rota && r.base === base && !r.erro);
const med = (g, campo) => mediana(g.map((r) => (typeof campo === "function" ? campo(r) : r[campo])));
const fmt = (v, suf = "") => (v === null || v === undefined ? "—" : `${v}${suf}`);
const telas = [...new Set(linhas.map((r) => r.tela))];
const rotas = [...new Set(linhas.map((r) => r.rota))];

const partes = [];
partes.push(`Medido em ${dados.data?.slice(0, 16).replace("T", " ")} UTC · ${dados.repeticoes ?? 1} repetição(ões), mediana · versões: ${bases.map((b) => `${nome(b)} = ${b}`).join(", ")}`);
if (dados.bloqueadas?.length) partes.push(`\nEscritas bloqueadas pela trava de segurança: ${dados.bloqueadas.join("; ")}`);

// Métricas por fase
const COLS_FRIO = [
  ["conteúdo (ms)", (g) => med(g, (r) => r.conteudo ?? (r.timeout ? 20000 : null))],
  ["TBT até conteúdo", (g) => med(g, "tbt")],
  ["TBT 0–8 s", (g) => med(g, "tbt8s")],
  ["maior tarefa 0–8 s", (g) => med(g, "maiorTarefa")],
  ["JS até hidratar (KB gz)", (g) => med(g, "jsGzipKBHidratar")],
  ["JS 0–8 s (KB gz)", (g) => med(g, "jsGzipKB8s")],
  ["consultas até conteúdo", (g) => med(g, "supabase")],
];
const COLS_NAV = [
  ["conteúdo (ms)", (g) => med(g, (r) => r.conteudo ?? (r.timeout ? 20000 : null))],
  ["tela nova montou (ms)", (g) => med(g, "montou")],
  ["TBT", (g) => med(g, "tbt")],
  ["maior tarefa", (g) => med(g, "maiorTarefa")],
  ["consultas", (g) => med(g, "supabase")],
  ["repetidas", (g) => med(g, (r) => r.supabaseDuplicadas?.length ?? 0)],
];

for (const tela of telas) {
  for (const [fase, titulo, cols] of [
    ["frio", "Abertura a frio (cache vazio)", COLS_FRIO],
    ["nav1", "Troca de aba pelo menu — 1ª visita", COLS_NAV],
    ["nav2", "Troca de aba pelo menu — revisita", COLS_NAV],
  ]) {
    if (!linhas.some((r) => r.tela === tela && r.fase === fase)) continue;
    partes.push(`\n### ${tela} — ${titulo}\n`);
    // Duas versões: cada célula mostra "antes → depois"
    const cab = ["aba", ...cols.map(([c]) => (bases.length > 1 ? `${c} ${bases.map(nome).join(" → ")}` : c))];
    partes.push(`| ${cab.join(" | ")} |`);
    partes.push(`|${cab.map((_, i) => (i ? "---:" : "---")).join("|")}|`);
    const somas = cols.map(() => bases.map(() => []));
    for (const rota of rotas) {
      const gs = bases.map((b) => grupo(tela, fase, rota, b));
      if (gs.every((g) => !g.length)) continue;
      const celulas = cols.map(([, f], ci) => gs.map((g, bi) => { const v = g.length ? f(g) : null; if (typeof v === "number") somas[ci][bi].push(v); return fmt(v); }).join(" → "));
      partes.push(`| ${rota} | ${celulas.join(" | ")} |`);
    }
    const medianas = cols.map((_, ci) => bases.map((__, bi) => fmt(mediana(somas[ci][bi]))).join(" → "));
    partes.push(`| **mediana das abas** | ${medianas.map((v) => `**${v}**`).join(" | ")} |`);
  }
}

const texto = partes.join("\n") + "\n";
if (SAIDA) writeFileSync(SAIDA, texto);
console.log(texto);
