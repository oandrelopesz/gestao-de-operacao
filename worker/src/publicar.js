// Sobe o que os jobs baixaram na estrutura combinada com o usuário e devolve
// exatamente as colunas que o n8n grava em `swipe_itens`.
import { stat } from "node:fs/promises";
import { limitar, nomeCard, extensaoDe, mimeDe, nomeUnico } from "./nomes.js";

const PASTA_MIME = "application/vnd.google-apps.folder";

async function tamanhoDe(caminho) {
  try {
    return (await stat(caminho)).size;
  } catch {
    return 0;
  }
}

function daPasta(pasta, base, tamanho) {
  return {
    drive_file_id: pasta.id,
    drive_folder_id: pasta.id,
    drive_web_link: pasta.webViewLink || null,
    thumbnail_link: null,
    mime: PASTA_MIME,
    tamanho,
    nome_arquivo: base,
  };
}

export async function publicarDownload(drive, { arquivos, modo, base, paiId }) {
  if (modo === "carrossel") {
    const pasta = await drive.garantirPasta(limitar(base), paiId);
    let total = 0;
    for (let i = 0; i < arquivos.length; i++) {
      const caminho = arquivos[i];
      const ext = extensaoDe(caminho) || "jpg";
      const enviado = await drive.subirArquivo(caminho, { nome: nomeCard(base, i + 1, ext), paiId: pasta.id, mime: mimeDe(ext) });
      total += Number(enviado.size || 0) || (await tamanhoDe(caminho));
    }
    return daPasta(pasta, base, total);
  }

  const caminho = arquivos[0];
  const ext = extensaoDe(caminho) || "mp4";
  const existentes = await drive.nomesEm(paiId);
  const nome = nomeUnico(limitar(base, ext), existentes);
  const enviado = await drive.subirArquivo(caminho, { nome, paiId, mime: mimeDe(ext) });
  return {
    drive_file_id: enviado.id,
    drive_folder_id: paiId,
    drive_web_link: enviado.webViewLink || null,
    thumbnail_link: enviado.thumbnailLink || null,
    mime: enviado.mimeType || mimeDe(ext),
    tamanho: Number(enviado.size || 0) || (await tamanhoDe(caminho)),
    nome_arquivo: nome.replace(new RegExp(`\\.${ext}$`), ""),
  };
}

export async function publicarLp(drive, { arquivos, base, paiId }) {
  const pasta = await drive.garantirPasta(limitar(base), paiId);
  let total = 0;
  for (const a of arquivos) {
    const enviado = await drive.subirArquivo(a.caminho, { nome: a.nome, paiId: pasta.id, mime: a.mime });
    total += Number(enviado.size || 0) || (await tamanhoDe(a.caminho));
  }
  return daPasta(pasta, base, total);
}
