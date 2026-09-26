// Tabelas `fireflies_reunioes` e `fireflies_convites` (PostgREST) e bucket privado `fireflies` (Storage), com a
// chave pública — as policies do app liberam leitura/escrita, como no Transcritor.

export const BUCKET = "fireflies";
const POR_PAGINA = 1000; // teto padrão de linhas por resposta do PostgREST no Supabase

/** Chave de um convite: evento + início normalizado (o Google manda "-03:00", o Postgres devolve "+00:00"). */
export function chaveConvite(eventoId, inicio) {
  const t = new Date(inicio).getTime();
  return `${eventoId}|${Number.isNaN(t) ? String(inicio) : new Date(t).toISOString()}`;
}

/** Falha passageira do robô (rede, limite de chamadas): marcada com esse prefixo no `erro` para ser tentada de novo. */
export const PREFIXO_TEMPORARIO = "[temporário] ";
export const conviteParaRepetir = (linha) => linha?.ok === false && String(linha.erro || "").startsWith(PREFIXO_TEMPORARIO);

/** Valor para o filtro `in.(...)` do PostgREST: entre aspas, com aspas e barras escapadas. */
const entreAspas = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const caminhoStorage = (caminho) => String(caminho).split("/").map(encodeURIComponent).join("/");

export function criarBanco({ supabaseUrl, anonKey, fetch: _fetch = fetch }) {
  const rest = `${supabaseUrl}/rest/v1`;
  const storage = `${supabaseUrl}/storage/v1/object/${BUCKET}`;
  const autorizacao = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

  async function pedir(url, init = {}) {
    const r = await _fetch(url, { ...init, headers: { ...autorizacao, ...(init.headers || {}) } });
    const texto = await r.text();
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${texto.slice(0, 200)}`);
    try { return texto ? JSON.parse(texto) : null; } catch { return null; }
  }

  const json = (metodo, corpo, prefer) => ({
    method: metodo,
    headers: { "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
    body: JSON.stringify(corpo),
  });

  const porId = (id) => `id=eq.${encodeURIComponent(id)}`;

  return {
    /** Todas as reuniões já no banco: Map id → status ('importando' | 'pronto' | 'erro'). */
    async reunioesIds() {
      const mapa = new Map();
      for (let offset = 0; ; offset += POR_PAGINA) {
        const linhas = (await pedir(`${rest}/fireflies_reunioes?select=id,status&order=id.asc&limit=${POR_PAGINA}&offset=${offset}`)) || [];
        for (const l of linhas) mapa.set(l.id, l.status);
        if (linhas.length < POR_PAGINA) return mapa;
      }
    },
    /** Insere ou atualiza pela chave `id`; só as colunas enviadas mudam (não mexe em titulo_pendente/excluir). */
    async upsertReuniao(linha) {
      await pedir(`${rest}/fireflies_reunioes?on_conflict=id`, json("POST", linha, "resolution=merge-duplicates,return=minimal"));
    },
    /** Pedidos da aba ainda não aplicados: excluir = true ou titulo_pendente preenchido. */
    async pendencias() {
      const filtro = encodeURIComponent("(excluir.is.true,titulo_pendente.not.is.null)");
      return (await pedir(`${rest}/fireflies_reunioes?or=${filtro}&select=id,titulo,titulo_pendente,excluir,arquivos&order=updated_at.asc`)) || [];
    },
    /** PATCH na linha; devolve true se ela existia. */
    async atualizar(id, campos) {
      const linhas = await pedir(`${rest}/fireflies_reunioes?${porId(id)}&select=id`, json("PATCH", campos, "return=representation"));
      return Array.isArray(linhas) && linhas.length > 0;
    },
    async apagarLinha(id) {
      await pedir(`${rest}/fireflies_reunioes?${porId(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    },
    /** Sobe (ou substitui) um arquivo no bucket; `caminho` = "<id>/transcricao.pdf". */
    async subirArquivo(caminho, buffer, contentType) {
      await pedir(`${storage}/${caminhoStorage(caminho)}`, {
        method: "POST",
        headers: { "Content-Type": contentType, "x-upsert": "true", "Cache-Control": "no-cache" },
        body: buffer,
      });
    },
    async apagarArquivos(caminhos) {
      if (!caminhos?.length) return;
      await pedir(storage, json("DELETE", { prefixes: caminhos }));
    },
    /** Dos convites pedidos ([{ evento_id, inicio }]), quais já foram resolvidos (ok ou recusa definitiva): Set de `chaveConvite`. */
    async convitesJaEnviados(chaves) {
      const ids = [...new Set((chaves || []).map((c) => c.evento_id).filter(Boolean))];
      if (!ids.length) return new Set();
      const filtro = encodeURIComponent(`(${ids.map(entreAspas).join(",")})`);
      const linhas = (await pedir(`${rest}/fireflies_convites?evento_id=in.${filtro}&select=evento_id,inicio,ok,erro`)) || [];
      return new Set(linhas.filter((l) => !conviteParaRepetir(l)).map((l) => chaveConvite(l.evento_id, l.inicio)));
    },
    /** Registra o envio do robô (ok ou com erro); só a falha passageira é tentada de novo (atualiza o mesmo registro). */
    async registrarConvite(linha) {
      await pedir(`${rest}/fireflies_convites?on_conflict=evento_id,inicio`, json("POST", linha, "resolution=merge-duplicates,return=minimal"));
    },
  };
}
