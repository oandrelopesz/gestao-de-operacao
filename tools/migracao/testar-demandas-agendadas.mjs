// Teste da migration 20261118220000_demandas_agendadas.sql. Tudo dentro de uma transação desfeita (ROLLBACK):
// aplica a migration duas vezes, cria demandas "[TESTE]" agendadas e simula a virada de dias à frente.
// Uso: node tools/migracao/testar-demandas-agendadas.mjs   (não deixa rastro)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { conectar } from "./conexao.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const migration = readFileSync(join(raiz, "supabase/migrations/20261118220000_demandas_agendadas.sql"), "utf8");
const USER = "b34bdae5-7a67-4b63-a46f-8aad43a06c63";

let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const c = await conectar();
try {
  await c.query("BEGIN");
  await c.query(migration);
  await c.query(migration);
  confere("migration aplica duas vezes sem erro", true);

  const hoje = (await c.query("SELECT public.hoje_brt()::text AS h")).rows[0].h;
  const dia = async (n) => (await c.query("SELECT ($1::date + $2::int)::text AS d", [hoje, n])).rows[0].d;
  const nova = async (titulo, n) => (await c.query(
    `INSERT INTO public.demandas (user_id, titulo, status, prazo)
     VALUES ($1, $2, 'agendadas', $3::date + $4::int) RETURNING id`,
    [USER, "[TESTE] " + titulo, hoje, n])).rows[0].id;
  const ler = async (id) => (await c.query(
    "SELECT status, prazo::text AS prazo FROM public.demandas WHERE id = $1", [id])).rows[0];

  const longe = await nova("longe", 10);
  let r = await ler(longe);
  confere("agendada a 10 dias fica em Agendadas", r.status === "agendadas" && r.prazo === await dia(10), JSON.stringify(r));

  for (const [n, col] of [[2, "fazer_depois_amanha"], [1, "fazer_amanha"], [0, "fazer_hoje"]]) {
    const id = await nova(`perto ${n}`, n);
    r = await ler(id);
    confere(`agendada a ${n} dia(s) entra em ${col}`, r.status === col && r.prazo === await dia(n), JSON.stringify(r));
  }

  await c.query("SAVEPOINT sem_data");
  let recusou = false;
  try {
    await c.query(`INSERT INTO public.demandas (user_id, titulo, status) VALUES ($1, '[TESTE] sem data', 'agendadas')`, [USER]);
  } catch { recusou = true; }
  await c.query("ROLLBACK TO SAVEPOINT sem_data");
  confere("agendada sem data é recusada", recusou);

  await c.query("UPDATE public.demandas SET titulo = '[TESTE] longe editada', descricao = 'nota' WHERE id = $1", [longe]);
  r = await ler(longe);
  confere("editar o texto não tira de Agendadas", r.status === "agendadas" && r.prazo === await dia(10), JSON.stringify(r));

  // Virada simulada: "hoje" 7 dias à frente (faltam 3) não mexe; 8 dias à frente (faltam 2) desce
  await c.query("SELECT public.rolar_colunas_por_dia($1::date + 7)", [hoje]);
  r = await ler(longe);
  confere("virada com 3 dias de folga não mexe", r.status === "agendadas", JSON.stringify(r));
  await c.query("SELECT public.rolar_colunas_por_dia($1::date + 8)", [hoje]);
  r = await ler(longe);
  confere("virada 2 dias antes desce para Fazer depois de amanhã",
    r.status === "fazer_depois_amanha" && r.prazo === await dia(10), JSON.stringify(r));

  // Virada que ficou dias sem rodar: agendada com a data já passada entra em Fazer hoje
  const vencida = await nova("vencida", 5);
  await c.query("SELECT public.rolar_colunas_por_dia($1::date + 7)", [hoje]);
  r = await ler(vencida);
  confere("agendada vencida entra em Fazer hoje", r.status === "fazer_hoje", JSON.stringify(r));

  // Trocar só a data (painel da demanda) para amanhã desce na hora
  const mudar = await nova("mudar data", 20);
  await c.query("UPDATE public.demandas SET prazo = $2::date + 1 WHERE id = $1", [mudar, hoje]);
  r = await ler(mudar);
  confere("trocar a data para amanhã desce para Fazer amanhã", r.status === "fazer_amanha", JSON.stringify(r));

  // Marcar como feita pela lista guarda a data
  const feita = await nova("feita", 15);
  await c.query("UPDATE public.demandas SET status = 'feito' WHERE id = $1", [feita]);
  r = await ler(feita);
  confere("marcar como feita guarda a data", r.status === "feito" && r.prazo === await dia(15), JSON.stringify(r));

  // A coluna não aparece para o front (ela é filtrada lá), mas é de sistema e sem regra de data
  const col = (await c.query("SELECT sistema, regra_data FROM public.demanda_colunas WHERE id = 'agendadas'")).rows[0];
  confere("coluna agendadas é de sistema e sem regra", col?.sistema === true && col?.regra_data === "nenhuma", JSON.stringify(col));
} catch (e) {
  console.error("ERRO", e.message);
  falhas++;
} finally {
  await c.query("ROLLBACK");
  await c.end();
}
console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
