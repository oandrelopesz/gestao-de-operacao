// Apaga os dias de teste do ano 2000 que tools/radar/testar-api.mjs grava em produção, e o log deles.
// Uso: node tools/radar/limpar-testes.mjs   (conexão e senha: tools/migracao/conexao.mjs)
import { conectar } from "../migracao/conexao.mjs";

const db = await conectar();
try {
  await db.query("begin");
  const r = {};
  for (const [nome, sql] of [
    ["eventos", "delete from public.radar_eventos where data < '2001-01-01'"],
    ["versoes", "delete from public.radar_achado_versoes where achado_id like 'RAD-2000%'"],
    ["achados", "delete from public.radar_achados where data < '2001-01-01'"],
    ["dias", "delete from public.radar_dias where data < '2001-01-01'"],
    ["log", "delete from public.radar_ingestao_log where idempotency_key like 'TESTE:%' or chave_digest = 'teste000'"],
  ]) r[nome] = (await db.query(sql)).rowCount;
  await db.query("commit");
  console.log("apagados", JSON.stringify(r));
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error("FALHOU", e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
