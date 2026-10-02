// Copia as libs puras usadas pela edge function `planilha` para supabase/functions/_shared (o deploy das funções só
// enxerga supabase/functions). Rode depois de mudar qualquer uma delas: node scripts/copiar-libs-edge.mjs
// O teste src/lib/libsEdge.test.ts falha se as cópias ficarem diferentes.
import { copyFileSync, mkdirSync } from "node:fs";

const LIBS = [
  "bancoLeads", "crmAgenda", "crmColunas", "crmFormato", "crmMovimento", "crmPontos", "crmTentativas", "crmTipos",
  "planilhaCrm",
];
mkdirSync("supabase/functions/_shared", { recursive: true });
for (const n of LIBS) copyFileSync(`src/lib/${n}.ts`, `supabase/functions/_shared/${n}.ts`);
console.log(`${LIBS.length} libs copiadas para supabase/functions/_shared`);
