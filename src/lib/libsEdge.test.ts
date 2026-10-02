process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// Mesma lista de scripts/copiar-libs-edge.mjs
const LIBS = [
  "bancoLeads", "crmAgenda", "crmColunas", "crmFormato", "crmMovimento", "crmPontos", "crmTentativas", "crmTipos",
  "planilhaCrm",
];
const ler = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test("libs da edge function `planilha` são cópias idênticas de src/lib (rode node scripts/copiar-libs-edge.mjs)", () => {
  const copias = readdirSync("supabase/functions/_shared").filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3)).sort();
  assert.deepEqual(copias, LIBS);
  for (const n of LIBS) assert.equal(ler(`supabase/functions/_shared/${n}.ts`), ler(`src/lib/${n}.ts`), `${n}.ts diferente`);
});
