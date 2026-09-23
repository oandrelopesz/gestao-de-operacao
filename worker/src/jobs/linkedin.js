// Post do LinkedIn (imagem única, carrossel de imagens ou documento em slides). Nem o yt-dlp (só
// vídeo) nem o gallery-dl (não suporta o site) baixam isso, então lemos a página pública do post:
// - imagens: o JSON-LD SocialMediaPosting do post principal lista as imagens na ordem;
// - documento ("carrossel" em PDF): o data-native-document-config dentro do <article> principal
//   aponta para um manifesto com as páginas já renderizadas em JPEG, em várias resoluções.
// A página traz também posts recomendados; por isso o documento só vale se estiver no <article>.
// Sempre tenta como visitante: logado, o LinkedIn devolve a página montada por JavaScript, sem os
// dados do post no HTML. Só se o post exigir login (o autor restringe) o pedido é refeito com a sessão.
import { join } from "node:path";
import { writeFile } from "node:fs/promises";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export function ehPostLinkedin(link) {
  try {
    const u = new URL(link);
    return /(^|\.)linkedin\.com$/.test(u.hostname) && /^\/(posts|feed\/update)\//.test(u.pathname);
  } catch {
    return false;
  }
}

const desescapar = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Onde estão as mídias do post principal: lista de imagens, manifesto de documento, ou null. */
export function midiasDoPostLinkedin(html) {
  const ini = html.indexOf("<article");
  const fim = ini >= 0 ? html.indexOf("</article>", ini) : -1;
  const artigo = ini >= 0 ? html.slice(ini, fim > ini ? fim : undefined) : "";

  const doc = artigo.match(/data-native-document-config="([^"]+)"/);
  if (doc) {
    try {
      const cfg = JSON.parse(desescapar(doc[1]));
      if (cfg?.doc?.manifestUrl) return { tipo: "documento", manifestUrl: cfg.doc.manifestUrl };
    } catch {
      // config ilegível: tenta as imagens
    }
  }

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let dado;
    try { dado = JSON.parse(m[1]); } catch { continue; }
    if (!/SocialMediaPosting|DiscussionForumPosting/.test(String(dado?.["@type"]))) continue;
    const urls = [].concat(dado.image || []).map((i) => (typeof i === "string" ? i : i?.url)).filter(Boolean);
    if (urls.length) return { tipo: "imagens", urls };
  }

  const doArtigo = [...artigo.matchAll(/(?:src|data-delayed-url)="(https:\/\/media\.licdn\.com\/dms\/image\/[^"]+)"/g)]
    .map((m) => desescapar(m[1]))
    .filter((u) => /\/feedshare-/.test(u));
  const unicas = [...new Set(doArtigo)];
  return unicas.length ? { tipo: "imagens", urls: unicas } : null;
}

/** Cookies de um domínio (formato Netscape) prontos para o cabeçalho Cookie. */
export function cabecalhoDeCookies(texto, dominio) {
  const pares = [];
  for (const linha of String(texto).split(/\r?\n/)) {
    if (!linha || (linha.startsWith("#") && !linha.startsWith("#HttpOnly_"))) continue;
    const c = linha.split("\t");
    if (c.length < 7) continue;
    const d = c[0].replace(/^#HttpOnly_/, "").replace(/^\./, "");
    if (d === dominio || d.endsWith(`.${dominio}`)) pares.push(`${c[5]}=${c[6]}`);
  }
  return pares.join("; ");
}

const EXTENSOES = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/**
 * Baixa as imagens do post para `dir` como 001_linkedin.jpg, 002_linkedin.png... (ordem do post).
 * Devolve [] quando o post não tem imagem nem documento (vídeo, só texto): o chamador tenta o yt-dlp.
 */
export async function baixarPostLinkedin({ link, dir, cookies }, deps = {}) {
  const _fetch = deps.fetch || fetch;
  const pediuLogin = (r) => r.status >= 300 && r.status < 400 && /signup|login|authwall|checkpoint/i.test(String(r.headers.get("location") || ""));
  const abrir = (comSessao) => {
    const cabecalhos = { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" };
    if (comSessao) cabecalhos.Cookie = cookies;
    return _fetch(link, { headers: cabecalhos, redirect: "manual" });
  };

  let pagina = await abrir(false);
  const restrito = pediuLogin(pagina);
  if (restrito && cookies) pagina = await abrir(true);
  // Restrito e a sessão não resolveu (redireciona para o feed/login ou responde 400): mensagem clara
  const semAcesso = restrito && (pagina.status >= 300 && pagina.status < 500);
  if (pediuLogin(pagina) || semAcesso) {
    throw new Error("O LinkedIn pediu login para ver esse post (o autor restringe a quem não está logado). Baixe manualmente e use \"Enviar arquivo\" no card");
  }
  if (pagina.status >= 300 && pagina.status < 400) throw new Error(`O LinkedIn redirecionou o post (HTTP ${pagina.status})`);
  if (!pagina.ok) throw new Error(`O LinkedIn respondeu ${pagina.status} ao abrir o post`);

  const midias = midiasDoPostLinkedin(await pagina.text());
  if (!midias) return [];

  let urls = midias.urls || [];
  if (midias.tipo === "documento") {
    const manifesto = await (await _fetch(midias.manifestUrl, { headers: { "User-Agent": UA } })).json();
    const resolucoes = manifesto?.perResolutions || [];
    if (!resolucoes.length) throw new Error("Documento do LinkedIn sem páginas disponíveis");
    const maior = resolucoes.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a));
    const paginas = await (await _fetch(maior.imageManifestUrl, { headers: { "User-Agent": UA } })).json();
    urls = paginas?.pages || [];
  }

  const arquivos = [];
  for (let i = 0; i < urls.length; i++) {
    const r = await _fetch(urls[i], { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error(`Imagem ${i + 1} do post do LinkedIn respondeu ${r.status}`);
    const tipo = String(r.headers.get("content-type") || "").split(";")[0].trim();
    const caminho = join(dir, `${String(i + 1).padStart(3, "0")}_linkedin.${EXTENSOES[tipo] || "jpg"}`);
    await writeFile(caminho, Buffer.from(await r.arrayBuffer()));
    arquivos.push(caminho);
  }
  return arquivos;
}
