// Backup diário do banco (rodado pelo GitHub Actions: .github/workflows/backup-banco.yml).
//   node backup.mjs fazer <pasta>          DB_URL = produção (usuário só de leitura backup_leitura; só public: o
//                                          Supabase não deixa repassar leitura de auth, e auth.users tem 1 usuário fixo)
//   node backup.mjs conferir <pasta>       DB_URL = banco descartável (supabase db start, migrations do repositório)
// "fazer" abre uma transação REPEATABLE READ, exporta o snapshot e roda hashes.sql e o pg_dump NELE: os hashes
// descrevem exatamente o conteúdo do dump. "conferir" restaura o dump (dados de public) e exige diferença zero.
// pg_dump/pg_restore 17 rodam pelo Docker; o endereço do banco vai por variável, nunca na linha de comando.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { conectar } from "./conexao.mjs";
import { compararHashes } from "./comparar.mjs";

const HASHES_SQL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "hashes.sql"), "utf8");
const [modo, pastaArg] = process.argv.slice(2);
const pasta = resolve(pastaArg || "backup");

async function hashes(client) {
  const r = await client.query(HASHES_SQL);
  return (Array.isArray(r) ? r[r.length - 1] : r).rows[0].hashes;
}

function docker(env, script) {
  const r = spawnSync("docker", ["run", "--rm", "--network", "host", "-v", `${pasta}:/w`,
    ...Object.keys(env).flatMap((k) => ["-e", k]), "postgres:17", "sh", "-c", script],
    { env: { ...process.env, ...env }, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`docker saiu com código ${r.status}`);
}

const client = await conectar();
try {
  if (modo === "fazer") {
    mkdirSync(pasta, { recursive: true });
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows: [{ snap }] } = await client.query("SELECT pg_export_snapshot() AS snap");
    const h = await hashes(client);
    docker({ DB_URL: process.env.DB_URL, SNAP: snap },
      `pg_dump "$DB_URL" --snapshot="$SNAP" --format=custom --data-only -t 'public.*' -f /w/banco.dump`);
    await client.query("COMMIT");
    writeFileSync(join(pasta, "hashes.json"), JSON.stringify(h));
    const resumo = { quando: new Date().toISOString(), tabelas: h.length, linhas: h.reduce((a, t) => a + Number(t.linhas), 0) };
    writeFileSync(join(pasta, "resumo.json"), JSON.stringify(resumo));
    console.log("backup:", JSON.stringify(resumo));
  } else if (modo === "conferir") {
    // Agendamentos das migrations desligados antes de entrar qualquer dado (o banco descartável não chama nada)
    await client.query("SELECT cron.alter_job(jobid, active := false) FROM cron.job");
    const { rows } = await client.query(
      "SELECT string_agg(format('public.%I', c.relname), ', ') AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p')");
    await client.query(`TRUNCATE ${rows[0].t} CASCADE`); // tira as linhas-padrão que as migrations inserem
    docker({ DB_URL: process.env.DB_URL },
      `PGOPTIONS='-c session_replication_role=replica' pg_restore --dbname="$DB_URL" --data-only --no-owner --exit-on-error -n public /w/banco.dump`);
    const diferencas = compararHashes(JSON.parse(readFileSync(join(pasta, "hashes.json"), "utf8")), await hashes(client));
    if (diferencas.length) {
      console.error("O BACKUP NÃO CONFERE:\n" + diferencas.join("\n"));
      process.exitCode = 1;
    } else console.log("conferido: o backup restaurado é idêntico ao banco no instante do dump");
  } else throw new Error("uso: node backup.mjs fazer|conferir <pasta>");
} finally {
  await client.end();
}
