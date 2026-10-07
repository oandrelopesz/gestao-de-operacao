// Conexão direta com o banco novo. A senha fica só em %USERPROFILE%\.gestao\db.json (fora do repositório)
// e nunca é impressa. db.json: { "ref": "...", "senha": "...", "host": "aws-0-sa-east-1.pooler.supabase.com" }
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

export const PASTA_SEGREDOS = join(process.env.USERPROFILE || process.env.HOME, ".gestao");

export function lerConfig() {
  return JSON.parse(readFileSync(join(PASTA_SEGREDOS, "db.json"), "utf8"));
}

export async function conectar() {
  const { ref, senha, host } = lerConfig();
  const client = new pg.Client({
    host, port: 5432, database: "postgres", user: `postgres.${ref}`, password: senha,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}
