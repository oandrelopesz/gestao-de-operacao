// Roda catalogo.sql ou hashes.sql no banco novo e grava o JSON em %USERPROFILE%\.gestao\<nome>-novo.json.
// Uso: node consultar.mjs catalogo | node consultar.mjs hashes
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { conectar, PASTA_SEGREDOS } from "./conexao.mjs";

const qual = process.argv[2];
if (!["catalogo", "hashes"].includes(qual)) throw new Error("uso: node consultar.mjs catalogo|hashes");
const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), `${qual}.sql`), "utf8");
const client = await conectar();
try {
  const r = await client.query(sql);
  const ultimo = Array.isArray(r) ? r[r.length - 1] : r; // hashes.sql tem várias instruções
  const valor = ultimo.rows[0][qual === "catalogo" ? "catalogo" : "hashes"];
  const destino = join(PASTA_SEGREDOS, `${qual}-novo.json`);
  writeFileSync(destino, JSON.stringify(valor));
  console.log(`${qual}: gravado em ${destino}`);
} finally {
  await client.end();
}
