// Acesso mínimo à tabela `transcricoes` pelo PostgREST (chave pública, RLS aberta como no app).

import { chaveTermo } from "./termos.js";

export function criarBanco({ supabaseUrl, anonKey, fetch: _fetch = fetch }) {
  const base = `${supabaseUrl}/rest/v1`;
  const cabecalhos = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" };

  async function pedir(caminho, init = {}) {
    const r = await _fetch(`${base}${caminho}`, { ...init, headers: { ...cabecalhos, ...(init.headers || {}) } });
    const texto = await r.text();
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${texto.slice(0, 200)}`);
    return texto ? JSON.parse(texto) : null;
  }

  const filtroStatus = (status) => (status?.length ? `&status=in.(${status.join(",")})` : "");

  return {
    /** A próxima da fila (menor posição; empate: a mais antiga). */
    async proxima() {
      const linhas = await pedir("/transcricoes?status=eq.aguardando&order=posicao.asc,created_at.asc&limit=1&select=*");
      return linhas?.[0] ?? null;
    },
    /** Linha atual (null se foi apagada = cancelada). */
    async linha(id) {
      const linhas = await pedir(`/transcricoes?id=eq.${encodeURIComponent(id)}&select=*`);
      return linhas?.[0] ?? null;
    },
    /**
     * Atualiza a linha só se ela ainda estiver num dos `soSeStatus` (não desfaz pausa/cancelamento
     * feitos no app no meio do caminho). Devolve a linha atualizada ou null se nada mudou.
     */
    async atualizar(id, campos, soSeStatus) {
      const linhas = await pedir(`/transcricoes?id=eq.${encodeURIComponent(id)}${filtroStatus(soSeStatus)}&select=*`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(campos),
      });
      return linhas?.[0] ?? null;
    },
    /** Ids de todas as linhas que ainda existem (faxina de arquivos órfãos). */
    async idsExistentes() {
      const linhas = await pedir("/transcricoes?select=id");
      return new Set((linhas || []).map((l) => l.id));
    },
    /** Serviço reiniciou no meio: o que ficou em andamento volta para a fila. */
    async devolverInterrompidas() {
      return pedir("/transcricoes?status=in.(baixando,transcrevendo)&select=id", {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "aguardando", progresso: 0 }),
      });
    },
    /** Memória de termos (manuais e da IA), as mais usadas primeiro. */
    async termos() {
      const linhas = await pedir("/transcritor_termos?select=de,para,origem,vezes&order=vezes.desc&limit=500");
      return Array.isArray(linhas) ? linhas : [];
    },
    /** Registra correções na memória: itens `{ de, para, origem }`; a chave é calculada aqui. */
    async registrarTermos(itens) {
      const lista = (itens || []).map((i) => ({ chave: chaveTermo(i.de), de: i.de, para: i.para, origem: i.origem })).filter((i) => i.chave);
      if (!lista.length) return;
      await pedir("/rpc/registrar_termos", { method: "POST", body: JSON.stringify({ itens: lista }) });
    },
    async glossario() {
      const linhas = await pedir("/app_config?chave=eq.transcritor_glossario&select=valor");
      const valor = linhas?.[0]?.valor;
      return Array.isArray(valor) ? valor : [];
    },
  };
}
