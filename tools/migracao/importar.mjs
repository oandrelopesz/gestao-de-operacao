// Importa no banco NOVO o arquivo de exportar.js. Tudo numa transação, com os gatilhos desligados
// (session_replication_role = replica: nem regra de negócio nem chave estrangeira disparam durante a carga).
// Apaga os dados de public no novo antes (TRUNCATE), carrega tabela por tabela (uma instrução cada), garante o usuário
// interno em auth.users e acerta as sequências. Uso: node importar.mjs <caminho do gestao-export-*.json>
import { readFileSync } from "node:fs";
import { conectar } from "./conexao.mjs";

const arquivo = process.argv[2];
if (!arquivo) throw new Error("uso: node importar.mjs <gestao-export-*.json>");
const exp = JSON.parse(readFileSync(arquivo, "utf8"));
const q = (s) => `"${s.replace(/"/g, '""')}"`;

const client = await conectar();
const inicio = Date.now();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL session_replication_role = replica");

  const { rows: tabelasNovo } = await client.query(
    "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p') ORDER BY 1");
  const nomesNovo = tabelasNovo.map((r) => r.relname);
  const faltam = Object.keys(exp.tabelas).filter((t) => !nomesNovo.includes(t));
  if (faltam.length) throw new Error(`tabelas do export que não existem no novo: ${faltam.join(", ")}`);
  await client.query(`TRUNCATE ${nomesNovo.map((t) => `public.${q(t)}`).join(", ")} CASCADE`);

  // Colunas reais de cada tabela: insere só as que vieram no export (evita NULL explícito por cima de DEFAULT),
  // menos as geradas (auth.users.confirmed_at), que o banco calcula sozinho
  const colunasDe = async (schema, tabela) => (await client.query(
    "SELECT a.attname FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '' ORDER BY a.attnum",
    [schema, tabela])).rows.map((r) => r.attname);

  // texto = JSON das linhas como saiu do banco antigo; vai direto para o Postgres (só os nomes das colunas passam pelo JS)
  const inserir = async (schema, tabela, texto, conflito = "") => {
    const linhas = JSON.parse(texto);
    if (!linhas.length) return 0;
    const presentes = new Set(Object.keys(linhas[0]));
    const cols = (await colunasDe(schema, tabela)).filter((c) => presentes.has(c)).map(q).join(", ");
    await client.query(
      `INSERT INTO ${schema}.${q(tabela)} (${cols}) SELECT ${cols} FROM json_populate_recordset(NULL::${schema}.${q(tabela)}, $1::json) ${conflito}`,
      [texto]);
    return linhas.length;
  };

  const usuarios = await inserir("auth", "users", exp.auth_users || "[]", "ON CONFLICT (id) DO NOTHING");
  let total = 0;
  for (const [tabela, linhas] of Object.entries(exp.tabelas)) total += await inserir("public", tabela, linhas);

  // Sequências de public: valor para o máximo da coluna dona (ou 1 sem linhas)
  const { rows: seqs } = await client.query(`
    SELECT s.relname AS seq, t.relname AS tabela, a.attname AS coluna
    FROM pg_class s JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
    JOIN pg_class t ON t.oid = d.refobjid JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    JOIN pg_namespace n ON n.oid = s.relnamespace WHERE s.relkind = 'S' AND n.nspname = 'public'`);
  for (const s of seqs) {
    await client.query(`SELECT setval('public.${q(s.seq)}', coalesce((SELECT max(${q(s.coluna)}) FROM public.${q(s.tabela)}), 1), (SELECT count(*) > 0 FROM public.${q(s.tabela)}))`);
  }

  await client.query("COMMIT");
  console.log(JSON.stringify({ tabelas: Object.keys(exp.tabelas).length, linhas: total, usuarios_auth: usuarios, sequencias: seqs.length, segundos: Math.round((Date.now() - inicio) / 1000), export_de: exp.quando }));
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("ERRO (nada foi gravado):", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
