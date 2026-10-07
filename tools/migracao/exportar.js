// Exportação COMPLETA do banco antigo (Lovable Cloud). Colar na página do editor SQL do Lovable depois de criar
// window.__sql e window.__baixar (ver README). Lê com o papel postgres (ignora RLS) e baixa UM arquivo
// gestao-export-<data>.json com { quando, tabelas: { nome: "<json das linhas>" }, auth_users: "<json>", hashes: [...] }.
// Cada tabela viaja como TEXTO JSON (nunca vira número de JavaScript: 10.50 não vira 10.5, bigint não perde dígitos).
// window.__hashesSql = conteúdo de hashes.sql (sem comentários).
(async () => {
  const texto = async (sql) => {
    const r = await window.__sql(sql);
    if (!r.result) throw new Error(`${sql.slice(0, 80)}: ${r.message}`);
    return r.result[0].j;
  };
  const tabelas = JSON.parse(await texto("SELECT json_agg(c.relname ORDER BY c.relname)::text AS j FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p')"));
  const saida = { quando: new Date().toISOString(), tabelas: {}, auth_users: "[]", hashes: [] };
  for (const t of tabelas) saida.tabelas[t] = await texto(`SELECT coalesce(json_agg(x), '[]'::json)::text AS j FROM public."${t}" x`);
  saida.auth_users = await texto("SELECT coalesce(json_agg(u), '[]'::json)::text AS j FROM auth.users u");
  const h = await window.__sql(window.__hashesSql);
  saida.hashes = h.result[0].hashes;
  window.__baixar(`gestao-export-${saida.quando.replace(/[:.]/g, "-")}.json`, saida);
  window.__exportResumo = { tabelas: tabelas.length, linhas: Object.values(saida.tabelas).reduce((a, l) => a + JSON.parse(l).length, 0), auth: JSON.parse(saida.auth_users).length };
})();
