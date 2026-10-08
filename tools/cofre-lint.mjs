// Confere notas do cofre do Obsidian: frontmatter, travessão e WikiLinks para notas que existem.
// Uso: node tools/cofre-lint.mjs [arquivo.md ou pasta ...]   (sem argumentos: o cofre inteiro)
// Caminhos relativos à raiz do cofre. Sai com código 1 se achar erro.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";

const COFRE = "C:/Users/Andre/Sistemas/Gestão de Operação/Obsidian Gestão de Operação/Gestão de Operação";

function notas(dir) {
  return readdirSync(dir).flatMap((n) => {
    if (n === ".obsidian" || n === ".trash") return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? notas(p) : n.endsWith(".md") ? [p] : [];
  });
}

const todas = notas(COFRE);
const nomes = new Set(todas.map((p) => basename(p, ".md").normalize("NFC").toLowerCase()));
const alvo = process.argv.slice(2).flatMap((a) => { const p = join(COFRE, a); return statSync(p).isDirectory() ? notas(p) : [p]; });
const semFrontmatter = (p) => p.includes("/.claude/") || p.includes("\\.claude\\") || basename(p) === "CLAUDE.md";

let erros = 0;
for (const p of alvo.length ? alvo : todas) {
  const rel = relative(COFRE, p).replaceAll("\\", "/");
  const texto = readFileSync(p, "utf8");
  const linhas = texto.split("\n");
  const erro = (msg) => { erros++; console.log(`${rel}: ${msg}`); };
  if (!semFrontmatter(p)) {
    const fm = texto.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) erro("sem frontmatter");
    else for (const campo of ["tags", "status", "created", "updated"]) if (!new RegExp(`^${campo}:`, "m").test(fm[1])) erro(`frontmatter sem ${campo}`);
  }
  linhas.forEach((linha, i) => {
    const l = linha.replace(/`[^`]*`/g, ""); // trecho em código é exemplo, não texto
    if (/[—–]/.test(l)) erro(`linha ${i + 1}: travessão`);
    for (const m of l.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)) {
      const nome = m[1].trim().split("/").pop().replace(/\.md$/, "").normalize("NFC").toLowerCase();
      if (!nomes.has(nome)) erro(`linha ${i + 1}: link para nota inexistente [[${m[1]}]]`);
    }
  });
}
console.log(erros ? `${erros} erro(s)` : "ok");
process.exit(erros ? 1 : 0);
