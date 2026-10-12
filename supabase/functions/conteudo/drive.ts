// Subpastas do Drive do cliente (até 4 níveis, 60 pastas com imagem, 80 visitadas ou 60 s), com a quantidade de imagens de cada uma. A raiz vira "Geral".
// deno-lint-ignore-file no-explicit-any
import { imagensDaPasta, tokenGoogle } from "../gmn/google.ts";
import { idPastaDrive } from "../gmn/regras.ts";
import { ErroHttp, type PastaDrive } from "./regras.ts";

async function listarPastas(token: string, paiId: string): Promise<{ id: string; name: string }[]> {
  const params = new URLSearchParams({
    q: `'${paiId.replace(/'/g, "\\'")}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
    fields: "files(id,name)", pageSize: "100", orderBy: "name", supportsAllDrives: "true", includeItemsFromAllDrives: "true",
  });
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000),
  });
  const corpo: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Drive respondeu", r.status, String(corpo?.error?.message ?? "").slice(0, 300));
    throw new Error("Não foi possível ler as pastas do Drive (confira o link e se a conta contato@ tem acesso).");
  }
  return corpo.files ?? [];
}

export async function lerPastas(sb: any, link: string): Promise<PastaDrive[]> {
  const raiz = idPastaDrive(link);
  if (!raiz) throw new ErroHttp(400, "Link da pasta do Drive não reconhecido.");
  const token = await tokenGoogle(sb);
  const saida: PastaDrive[] = [];
  const inicio = Date.now();
  let visitadas = 0;
  const parar = () => visitadas >= 80 || Date.now() - inicio > 60_000 || saida.length >= 60;
  let nivel = [{ id: raiz, caminho: "Geral" }];
  for (let i = 0; i < 4 && nivel.length && !parar(); i++) {
    const proximo: { id: string; caminho: string }[] = [];
    for (const p of nivel) {
      if (parar()) break;
      visitadas++;
      const quantidade = (await imagensDaPasta(token, p.id)).length;
      if (quantidade) saida.push({ id: p.id, caminho: p.caminho, quantidade });
      for (const f of await listarPastas(token, p.id)) proximo.push({ id: f.id, caminho: i === 0 ? f.name : `${p.caminho} / ${f.name}` });
    }
    nivel = proximo;
  }
  return saida;
}
