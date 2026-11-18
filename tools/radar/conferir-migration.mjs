// Confere a migration do Radar IA no banco de produção SEM deixar rastro: abre uma transação, aplica
// supabase/migrations/20261118120000_radar_ia.sql, roda as provas (ingestão, idempotência, versões, permissões)
// e dá ROLLBACK no fim, passe ou falhe. Uso: node tools/radar/conferir-migration.mjs
// Com --aplicar, roda as mesmas provas e, se todas passarem, aplica a migration de verdade (outra transação).
// Conexão: tools/migracao/conexao.mjs (senha em %USERPROFILE%\.gestao\db.json, nunca impressa).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { conectar } from "../migracao/conexao.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(join(aqui, "../../supabase/migrations/20261118120000_radar_ia.sql"), "utf8");
const EXEMPLO = JSON.parse(readFileSync(join(aqui, "payload-exemplo.json"), "utf8"));
const ANDRE = "contato@andrelopes.digital";

const db = await conectar();
let falhas = 0;
const ok = (nome) => console.log(`OK ${nome}`);
const falhou = (nome, det) => { falhas++; console.log(`FALHOU ${nome}: ${det}`); };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const um = async (sql, params) => (await q(sql, params))[0];
const ingerir = async (payload, idem, dry = false) =>
  (await um("select public.radar_ingerir($1::jsonb, $2, $3, 'teste000') as r", [JSON.stringify(payload), idem, dry])).r;

// roda fn esperando erro de banco com o trecho dado; desfaz o que fn fez
async function esperaErro(nome, trecho, fn) {
  await db.query("savepoint sp");
  try { await fn(); falhou(nome, "não deu erro"); }
  catch (e) { (e.message.includes(trecho) ? ok : (n) => falhou(n, e.message))(nome); }
  finally { await db.query("rollback to savepoint sp"); await db.query("reset role"); }
}
async function comoUsuario(email, fn) {
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ email, role: "authenticated" })]);
  await db.query("set local role authenticated");
  try { return await fn(); } finally { await db.query("reset role").catch(() => {}); } // em erro, quem desfaz é o esperaErro
}

const achado = (n, extra = {}) => ({ ...EXEMPLO.achados[0], id: `RAD-20000101-00${n}`, versao: 1, titulo: `Teste ${n}`, ...extra });
const envelope = (achados, extra = {}) => ({ ...EXEMPLO, edicao_id: "DIA-20000101", ocorrido_em: "2000-01-01T08:00:00-03:00", achados, ...extra });

async function provas() {
  const t = await q(`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'radar\\_%' order by 1`);
  t.length === 6 && t.every((x) => x.relrowsecurity) ? ok("6 tabelas com RLS") : falhou("6 tabelas com RLS", JSON.stringify(t));

  const boletim = envelope([achado(1), achado(2)]);
  let r = await ingerir(boletim, "TESTE:a", true);
  const nAchados = async () => Number((await um("select count(*) n from radar_achados where data = '2000-01-01'")).n);
  r.ok && r.dry_run && r.criados.length === 2 && (await nAchados()) === 0 ? ok("dry_run calcula e não grava") : falhou("dry_run", JSON.stringify(r));

  r = await ingerir(boletim, "TESTE:a");
  r.ok && !r.replay && r.criados.length === 2 && (await nAchados()) === 2 ? ok("envio real cria 2") : falhou("envio real", JSON.stringify(r));
  const r2 = await ingerir(boletim, "TESTE:a");
  r2.replay === true && JSON.stringify(r2.criados) === JSON.stringify(r.criados) && (await nAchados()) === 2
    ? ok("repetido devolve replay sem duplicar") : falhou("replay", JSON.stringify(r2));
  const ev = await um("select count(*) n from radar_eventos where data = '2000-01-01'");
  const lg = await um("select count(*) n from radar_ingestao_log where idempotency_key = 'TESTE:a'");
  Number(ev.n) === 1 && Number(lg.n) === 1 ? ok("1 evento e 1 log") : falhou("evento/log", `${ev.n} eventos, ${lg.n} logs`);

  r = await ingerir(envelope([achado(1)]), "TESTE:a");
  r.codigo === "IDEMPOTENCIA_CONFLITO" && r.status === 409 ? ok("mesma chave, outro conteúdo: 409") : falhou("conflito", JSON.stringify(r));

  r = await ingerir(boletim, "TESTE:b");
  r.ok && r.sem_mudanca.length === 2 ? ok("mesmo conteúdo com outra chave: sem_mudanca") : falhou("sem_mudanca", JSON.stringify(r));

  await q("update radar_achados set status = 'lido', nota_pessoal = 'minha nota' where id = 'RAD-20000101-001'");
  const correcao = {
    ...envelope([achado(1, { versao: 2, titulo: "Teste 1 corrigido" })], { tipo: "correcao", dia: {} }),
    correcao: { achado_id: "RAD-20000101-001", dado_correto: "x", texto_whatsapp: "correção", fontes: ["https://exemplo.com"] },
  };
  r = await ingerir(correcao, "TESTE:c");
  const a1 = await um("select titulo, versao, corrigido, status, nota_pessoal from radar_achados where id = 'RAD-20000101-001'");
  const ver = await um("select count(*) n from radar_achado_versoes where achado_id = 'RAD-20000101-001'");
  r.ok && r.atualizados.length === 1 && a1.versao === 2 && a1.corrigido && Number(ver.n) === 1
    ? ok("correção v2 atualiza, guarda versão e marca corrigido") : falhou("correção", JSON.stringify({ r, a1, ver }));
  a1.status === "lido" && a1.nota_pessoal === "minha nota" ? ok("status e nota pessoal preservados") : falhou("preservar", JSON.stringify(a1));

  r = await ingerir(envelope([achado(1, { titulo: "outro texto" })]), "TESTE:d");
  r.codigo === "VERSAO_ANTIGA" && r.status === 409 && (await um("select titulo from radar_achados where id = 'RAD-20000101-001'")).titulo === "Teste 1 corrigido"
    ? ok("versão antiga com outro conteúdo: 409 e nada muda") : falhou("versão antiga", JSON.stringify(r));

  r = await ingerir(envelope([achado(5, { id: "RAD-19991231-005" })]), "TESTE:e");
  r.codigo === "VALIDACAO" && r.status === 422 ? ok("achado novo de outro dia: 422") : falhou("outro dia", JSON.stringify(r));

  const muitos = Array.from({ length: 19 }, (_, i) => achado(0, { id: `RAD-20000101-${String(i + 10).padStart(3, "0")}` }));
  r = await ingerir(envelope(muitos), "TESTE:f");
  r.codigo === "VALIDACAO" && (await nAchados()) === 2 ? ok("teto de 20 por dia") : falhou("teto", JSON.stringify(r));

  const dia = await um("select total_confirmados, resumo from radar_dias where data = '2000-01-01'");
  dia.total_confirmados === 2 && dia.resumo.por_classe?.bom === 2 ? ok("contadores do dia recalculados") : falhou("contadores", JSON.stringify(dia));

  r = await ingerir({ ...envelope([]), tipo: "encerramento", dia: { encerramento_texto: "fim" } }, "TESTE:g");
  const enc = await um("select encerramento_texto, abertura_texto from radar_dias where data = '2000-01-01'");
  r.ok && enc.encerramento_texto === "fim" && enc.abertura_texto ? ok("encerramento grava sem apagar a abertura") : falhou("encerramento", JSON.stringify(enc));

  // permissões
  await esperaErro("anon não lê", "permission denied", async () => { await db.query("set local role anon"); await q("select * from radar_achados"); });
  await esperaErro("authenticated não chama radar_ingerir", "permission denied", () =>
    comoUsuario(ANDRE, () => q("select public.radar_ingerir('{}'::jsonb, 'x')")));
  const outro = await comoUsuario("intruso@exemplo.com", () => q("select id from radar_achados"));
  outro.length === 0 ? ok("outro e-mail vê 0") : falhou("outro e-mail", `${outro.length} linhas`);
  const meu = await comoUsuario(ANDRE, () => q("select id from radar_achados where data = '2000-01-01'"));
  meu.length === 2 ? ok("André lê os achados") : falhou("André lê", `${meu.length} linhas`);
  const upd = await comoUsuario(ANDRE, () => q("update radar_achados set status = 'testando' where id = 'RAD-20000101-002' returning status_em"));
  upd.length === 1 && upd[0].status_em ? ok("André muda status (status_em preenchido)") : falhou("André muda status", JSON.stringify(upd));
  await esperaErro("André não muda o título", "permission denied", () =>
    comoUsuario(ANDRE, () => q("update radar_achados set titulo = 'x' where id = 'RAD-20000101-002'")));
  await esperaErro("André não lê o log", "permission denied", () => comoUsuario(ANDRE, () => q("select * from radar_ingestao_log")));
}

try {
  await db.query("begin");
  await db.query(MIGRATION);
  await db.query(MIGRATION); // idempotente
  ok("migration aplica duas vezes");
  await provas();
} catch (e) {
  falhou("execução", e.message);
} finally {
  await db.query("rollback");
}
console.log(falhas ? `${falhas} FALHA(S); nada foi gravado` : "TUDO CERTO; nada foi gravado (rollback)");
if (!falhas && process.argv.includes("--aplicar")) {
  await db.query("begin"); await db.query(MIGRATION); await db.query("commit");
  console.log("MIGRATION APLICADA");
}
await db.end();
process.exit(falhas ? 1 : 0);
