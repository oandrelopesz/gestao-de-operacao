// Conexão direta com o banco novo. A senha fica só em %USERPROFILE%\.gestao\db.json (fora do repositório)
// e nunca é impressa. db.json: { "ref": "...", "senha": "...", "host": "aws-0-sa-east-1.pooler.supabase.com" }
// Com a variável DB_URL (backup no GitHub Actions, banco local de conferência), conecta nela em vez do db.json.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

export const PASTA_SEGREDOS = join(process.env.USERPROFILE || process.env.HOME, ".gestao");

export function lerConfig() {
  return JSON.parse(readFileSync(join(PASTA_SEGREDOS, "db.json"), "utf8"));
}

export async function conectar(url = process.env.DB_URL) {
  const ssl = { rejectUnauthorized: false };
  let client;
  if (url) client = new pg.Client({ connectionString: url, ssl: /@(127\.0\.0\.1|localhost)[:/]/.test(url) ? false : ssl });
  else {
    const { ref, senha, host } = lerConfig();
    client = new pg.Client({ host, port: 5432, database: "postgres", user: `postgres.${ref}`, password: senha, ssl });
  }
  await client.connect();
  return client;
}
