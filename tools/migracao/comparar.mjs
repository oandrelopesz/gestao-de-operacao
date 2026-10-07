// Compara o banco antigo (Lovable Cloud) com o novo (Supabase do André).
// Catálogo: { categoria: [{ chave, def }] } (saída de catalogo.sql). Hashes: [{ tabela, linhas, hash }] (hashes.sql).
// Uso: node comparar.mjs catalogo <antigo.json> <novo.json>  |  node comparar.mjs hashes <antigo.json> <novo.json>
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function compararCatalogos(antigo, novo) {
  const faltando = [], sobrando = [], diferentes = [];
  for (const categoria of new Set([...Object.keys(antigo), ...Object.keys(novo)])) {
    const a = new Map((antigo[categoria] || []).map((i) => [i.chave, i.def]));
    const n = new Map((novo[categoria] || []).map((i) => [i.chave, i.def]));
    for (const [chave, def] of a) {
      if (!n.has(chave)) faltando.push(`${categoria}:${chave}`);
      else if (n.get(chave) !== def) diferentes.push(`${categoria}:${chave}`);
    }
    for (const chave of n.keys()) if (!a.has(chave)) sobrando.push(`${categoria}:${chave}`);
  }
  return { faltando: faltando.sort(), sobrando: sobrando.sort(), diferentes: diferentes.sort() };
}

export function compararHashes(antigo, novo) {
  const a = new Map(antigo.map((t) => [t.tabela, t]));
  const n = new Map(novo.map((t) => [t.tabela, t]));
  const saida = [];
  for (const tabela of [...new Set([...a.keys(), ...n.keys()])].sort()) {
    const x = a.get(tabela), y = n.get(tabela);
    if (!y) saida.push(`${tabela}: falta no novo`);
    else if (!x) saida.push(`${tabela}: sobra no novo`);
    else if (Number(x.linhas) !== Number(y.linhas)) saida.push(`${tabela}: linhas ${x.linhas} -> ${y.linhas}`);
    else if (x.hash !== y.hash) saida.push(`${tabela}: conteúdo diferente (mesmas ${x.linhas} linhas)`);
  }
  return saida;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const [modo, fa, fn] = process.argv.slice(2);
  const ler = (f) => JSON.parse(readFileSync(f, "utf8"));
  const r = modo === "hashes" ? compararHashes(ler(fa), ler(fn)) : compararCatalogos(ler(fa), ler(fn));
  console.log(JSON.stringify(r, null, 2));
  const vazio = Array.isArray(r) ? r.length === 0 : !r.faltando.length && !r.sobrando.length && !r.diferentes.length;
  process.exit(vazio ? 0 : 1);
}
