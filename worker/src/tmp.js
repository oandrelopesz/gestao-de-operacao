import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ehMidia, extensaoDe } from "./nomes.js";

const RAIZ = process.env.SWIPE_TMP || tmpdir();

/** Cria uma pasta temporária, entrega para `fn` e apaga no fim, com erro ou sem. */
export async function comPastaTemp(prefixo, fn) {
  const dir = await mkdtemp(join(RAIZ, `${prefixo}-`));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch((e) => {
      console.error(JSON.stringify({ evento: "tmp.limpeza_falhou", dir, erro: String(e?.message || e) }));
    });
  }
}

/** Todos os arquivos de mídia abaixo de `dir`, em ordem natural pelo nome. */
export async function listarMidias(dir) {
  const achados = [];
  async function varrer(atual) {
    for (const item of await readdir(atual, { withFileTypes: true })) {
      const caminho = join(atual, item.name);
      if (item.isDirectory()) await varrer(caminho);
      else if (ehMidia(extensaoDe(item.name))) achados.push(caminho);
    }
  }
  await varrer(dir);
  const nome = (c) => c.split(/[\\/]/).pop();
  return achados.sort((a, b) => nome(a).localeCompare(nome(b), "pt-BR", { numeric: true }));
}
