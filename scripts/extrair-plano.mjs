// Grava os arquivos de um plano: cada bloco de código precedido por "<!-- arquivo: caminho -->" vira o arquivo.
// Uso: node scripts/extrair-plano.mjs <plano.md> <caminho> [caminho...]   (sem caminhos: lista os disponíveis)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [plano, ...pedidos] = process.argv.slice(2);
if (!plano) {
  console.error("Uso: node scripts/extrair-plano.mjs <plano.md> <caminho> [caminho...]");
  process.exit(1);
}
const texto = readFileSync(plano, "utf8").replace(/\r\n/g, "\n");
const blocos = new Map();
const re = /<!-- arquivo: (.+?) -->\n```[a-z]*\n([\s\S]*?)\n```\n/g;
for (const m of texto.matchAll(re)) blocos.set(m[1].trim(), m[2] + "\n");
if (pedidos.length === 0) {
  for (const k of blocos.keys()) console.log(k);
  process.exit(0);
}
for (const p of pedidos) {
  const conteudo = blocos.get(p);
  if (conteudo === undefined) {
    console.error(`Sem bloco para ${p}`);
    process.exit(1);
  }
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, conteudo);
  console.log(`gravado ${p} (${conteudo.length} bytes)`);
}
