// Teste da migration 20261118200000_cliente_pausa_integracao.sql. Tudo dentro de uma transação desfeita (ROLLBACK):
// aplica a migration, cria cliente + operação + conta + recarga de teste, vira o status e confere o Saldo.
// Uso: node testar-pausa-integracao.mjs        (usa o db.json; não deixa rastro)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { conectar } from "./conexao.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const migration = readFileSync(join(raiz, "supabase/migrations/20261118200000_cliente_pausa_integracao.sql"), "utf8");
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
  await c.query(readFileSync(join(raiz, "supabase/migrations/20261118210000_saldo_fora_do_monitor.sql"), "utf8"));
  // segunda aplicação: idempotente
  await c.query(migration);
  confere("migration aplica duas vezes sem erro", true);

  const cli = (await c.query(
    `INSERT INTO public.clientes (user_id, nome, agencia, status_operacional, trafego_ativo)
     VALUES ($1, '[TESTE] pausa integracao', 'effect', 'ativo', true) RETURNING id`, [USER])).rows[0].id;
  const op = (await c.query(
    `INSERT INTO public.operacoes (cliente_id, nome, moeda, tipo_verba, verba_ads, ativa)
     VALUES ($1, 'Principal', 'BRL', 'mensal', 3000, true) RETURNING id`, [cli])).rows[0].id;
  const conta = (await c.query(
    `INSERT INTO public.saldo_ads (user_id, cliente_id, operacao_id, plataformas, verba_diaria, ativo)
     VALUES ($1, $2, $3, ARRAY['Meta'], 100, true) RETURNING id`, [USER, cli, op])).rows[0].id;
  await c.query(
    `INSERT INTO public.recargas (saldo_ads_id, data_recarga, valor, ajuste)
     VALUES ($1, (now() AT TIME ZONE 'America/Sao_Paulo')::date - 2, 1000, false)`, [conta]);

  const naView = async () => (await c.query("SELECT saldo_atual_estimado s FROM public.saldo_ads_view WHERE id = $1", [conta])).rows[0];
  const naFora = async () => (await c.query("SELECT saldo_atual_estimado s FROM public.saldo_ads_fora_view WHERE id = $1", [conta])).rows[0];
  const conta1 = async () => (await c.query("SELECT pausado, saldo_congelado FROM public.saldo_ads WHERE id = $1", [conta])).rows[0];

  const antes = await naView();
  confere("ativo aparece no Saldo", !!antes, antes && `saldo ${antes.s}`);
  confere("ativo não aparece na view de fora do monitor", !(await naFora()));

  // PAUSAR
  await c.query("UPDATE public.clientes SET status_operacional = 'pausado' WHERE id = $1", [cli]);
  confere("pausado some do Saldo (view)", !(await naView()));
  const fora = await naFora();
  confere("pausado aparece na view de fora, com o saldo congelado", !!fora && Number(fora.s) === Number(antes.s), fora && `saldo ${fora.s}`);
  const p = await conta1();
  confere("conta fica pausada com saldo congelado", p.pausado === true && Number(p.saldo_congelado) === Number(antes.s), `congelado ${p.saldo_congelado}`);

  // trocar o tráfego com o cliente pausado não pode retomar a conta
  await c.query("UPDATE public.clientes SET trafego_ativo = false WHERE id = $1", [cli]);
  await c.query("UPDATE public.clientes SET trafego_ativo = true WHERE id = $1", [cli]);
  confere("ligar tráfego com cliente pausado não retoma a conta", (await conta1()).pausado === true);

  // simula dias de pausa: recuar a data da pausa e da recarga; ao voltar o saldo não pode ter consumido
  await c.query("UPDATE public.saldo_ads SET pausado_desde = pausado_desde - 5 WHERE id = $1", [conta]);
  await c.query("UPDATE public.recargas SET data_recarga = data_recarga - 5 WHERE saldo_ads_id = $1", [conta]);

  // REATIVAR
  await c.query("UPDATE public.clientes SET status_operacional = 'ativo' WHERE id = $1", [cli]);
  const depois = await naView();
  confere("reativado volta ao Saldo", !!depois);
  const r = await conta1();
  confere("conta retomada (não pausada)", r.pausado === false);
  confere("saldo retomado = saldo de quando pausou (sem consumo na pausa)", depois && Math.abs(Number(depois.s) - Number(antes.s)) < 0.01, `antes ${antes.s} · depois ${depois?.s}`);

  // CHURN com efeito imediato some; com contrato em vigor continua
  await c.query("UPDATE public.clientes SET status_operacional = 'churn', churn_efeito_imediato = true WHERE id = $1", [cli]);
  confere("churn imediato some do Saldo", !(await naView()));
  confere("churn imediato aparece na view de fora", !!(await naFora()));
  await c.query("UPDATE public.clientes SET status_operacional = 'ativo' WHERE id = $1", [cli]);
  await c.query("UPDATE public.clientes SET status_operacional = 'churn', churn_efeito_imediato = false, contrato_ate = (now() AT TIME ZONE 'America/Sao_Paulo')::date + 10 WHERE id = $1", [cli]);
  confere("churn com contrato em vigor segue no Saldo", !!(await naView()));
  confere("churn com contrato em vigor não aparece na view de fora", !(await naFora()));
  await c.query("UPDATE public.clientes SET status_operacional = 'ativo' WHERE id = $1", [cli]);

  // PAUSAR EM MASSA (várias linhas num UPDATE só) e voltar
  const cli2 = (await c.query(
    `INSERT INTO public.clientes (user_id, nome, agencia, status_operacional, trafego_ativo)
     VALUES ($1, '[TESTE] pausa integracao 2', 'effect', 'ativo', true) RETURNING id`, [USER])).rows[0].id;
  await c.query("UPDATE public.clientes SET status_operacional = 'pausado' WHERE id = ANY($1)", [[cli, cli2]]);
  const n = (await c.query("SELECT count(*)::int n FROM public.saldo_ads_view WHERE cliente_id = ANY($1)", [[cli, cli2]])).rows[0].n;
  confere("pausa em massa tira todos do Saldo", n === 0);
  await c.query("UPDATE public.clientes SET status_operacional = 'ativo' WHERE id = ANY($1)", [[cli, cli2]]);
  confere("volta em massa", !!(await naView()));
} catch (e) {
  falhas++;
  console.error("ERRO", e.message);
} finally {
  await c.query("ROLLBACK");
  await c.end();
}
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo (transação desfeita)");
process.exit(falhas ? 1 : 0);
