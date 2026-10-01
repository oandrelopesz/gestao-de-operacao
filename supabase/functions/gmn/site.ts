// Leitura das imagens e da logo de um site, só por texto (HTML e, em site montado por JavaScript, os arquivos .js).
// Funções puras: recebem o texto e a URL da página e devolvem candidatos com URL absoluta.

export interface CandidatoSite {
  url: string;
  descricao: string; // alt, título, legenda ou og:image:alt (pode ficar vazio)
  fonte: "img" | "og" | "icone" | "jsonld" | "bundle" | "css";
  logo: boolean; // tem cara de logo (alt/classe/nome com "logo", ícone, JSON-LD logo)
}

const EXT_IMAGEM = /\.(png|jpe?g|jfif|webp|avif|gif|svg|bmp|ico|heic|heif|tiff?)(\?[^"'\s)]*)?$/i;

function atributos(tag: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    r[m[1].toLowerCase()] = (m[3] ?? m[4] ?? m[5] ?? "").trim();
  }
  return r;
}

function decodificar(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}

function absoluta(u: string, base: string): string | null {
  const v = decodificar(u);
  if (!v || v.startsWith("data:") || v.startsWith("blob:") || v.startsWith("javascript:")) return null;
  try {
    const url = new URL(v, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** A maior imagem de um srcset ("a.jpg 480w, b.jpg 1200w" → b.jpg). */
function maiorDoSrcset(srcset: string): string | null {
  let melhor: string | null = null, maior = -1;
  for (const parte of srcset.split(",")) {
    const [u, d] = parte.trim().split(/\s+/);
    const n = d ? parseFloat(d) : 1;
    if (u && n > maior) { maior = n; melhor = u; }
  }
  return melhor;
}

const PARECE_LOGO = /logo|logotipo|marca|brand/i;

/** Candidatos de imagem e de logo no HTML de uma página. */
export function imagensDoHtml(html: string, paginaUrl: string): CandidatoSite[] {
  const out: CandidatoSite[] = [];
  const add = (u: string | null | undefined, descricao: string, fonte: CandidatoSite["fonte"], logo: boolean) => {
    const url = u ? absoluta(u, paginaUrl) : null;
    if (url) out.push({ url, descricao: decodificar(descricao).slice(0, 300), fonte, logo });
  };
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const nome = (a.property || a.name || "").toLowerCase();
    if (nome === "og:image" || nome === "og:image:url" || nome === "og:image:secure_url" || nome === "twitter:image") {
      add(a.content, "", "og", false);
    }
    if (nome === "og:logo") add(a.content, "", "og", true);
  }
  const ogAlt = /<meta\b[^>]*(?:property|name)\s*=\s*["']og:image:alt["'][^>]*>/i.exec(html);
  if (ogAlt) { const a = atributos(ogAlt[0]); for (const c of out) if (c.fonte === "og" && !c.descricao) c.descricao = decodificar(a.content ?? ""); }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const rel = (a.rel || "").toLowerCase();
    if (/(^|\s)(icon|apple-touch-icon|mask-icon)(\s|$)/.test(rel)) add(a.href, "", "icone", true);
  }
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const visitar = (v: unknown) => {
        if (!v || typeof v !== "object") return;
        if (Array.isArray(v)) { v.forEach(visitar); return; }
        const o = v as Record<string, unknown>;
        const logo = o.logo;
        if (typeof logo === "string") add(logo, String(o.name ?? ""), "jsonld", true);
        else if (logo && typeof logo === "object" && typeof (logo as Record<string, unknown>).url === "string") {
          add((logo as Record<string, string>).url, String(o.name ?? ""), "jsonld", true);
        }
        const image = o.image;
        if (typeof image === "string") add(image, String(o.name ?? ""), "jsonld", false);
        for (const k of Object.keys(o)) if (k !== "logo" && k !== "image") visitar(o[k]);
      };
      visitar(JSON.parse(m[1]));
    } catch { /* JSON-LD quebrado: ignora */ }
  }
  // <figure> com legenda: a legenda vira a descrição da imagem de dentro
  const legendas = new Map<string, string>();
  for (const m of html.matchAll(/<figure\b[\s\S]*?<\/figure>/gi)) {
    const img = /<img\b[^>]*>/i.exec(m[0]);
    const cap = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(m[0]);
    if (img && cap) { const a = atributos(img[0]); const u = a.src || a["data-src"]; if (u) legendas.set(u, cap[1].replace(/<[^>]+>/g, " ")); }
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = atributos(m[0]);
    const src = a.src || a["data-src"] || a["data-lazy-src"] || (a.srcset ? maiorDoSrcset(a.srcset) : null) || (a["data-srcset"] ? maiorDoSrcset(a["data-srcset"]) : null);
    if (!src) continue;
    const grande = a.srcset ? maiorDoSrcset(a.srcset) : null;
    const descricao = legendas.get(src) || a.alt || a.title || "";
    const logo = PARECE_LOGO.test([a.alt, a.class, a.id, src].join(" "));
    add(grande || src, descricao, "img", logo);
  }
  for (const m of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    if (EXT_IMAGEM.test(m[1])) add(m[1], "", "css", PARECE_LOGO.test(m[1]));
  }
  return deduplicar(out);
}

/** Em site montado por JavaScript (Vite, Lovable, React), as imagens aparecem como caminhos dentro dos .js. */
export function imagensDoBundle(js: string, bundleUrl: string): CandidatoSite[] {
  const out: CandidatoSite[] = [];
  for (const m of js.matchAll(/["'`]((?:https?:\/\/|\/)[^"'`\s]{3,300}?\.(?:png|jpe?g|webp|avif|gif|svg))["'`]/gi)) {
    const url = absoluta(m[1], bundleUrl);
    if (url) out.push({ url, descricao: "", fonte: "bundle", logo: PARECE_LOGO.test(m[1]) });
  }
  return deduplicar(out);
}

/** Os .js do próprio site citados no HTML (até `max`), para procurar imagens em site montado por JavaScript. */
export function scriptsDoSite(html: string, paginaUrl: string, max = 3): string[] {
  const host = new URL(paginaUrl).host;
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const u = absoluta(m[1], paginaUrl);
    if (u && new URL(u).host === host && !out.includes(u)) out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

/** Mesma URL uma vez só (a primeira ocorrência vence, mas descrição e marca de logo se somam). */
export function deduplicar(lista: CandidatoSite[]): CandidatoSite[] {
  const mapa = new Map<string, CandidatoSite>();
  for (const c of lista) {
    const ja = mapa.get(c.url);
    if (!ja) mapa.set(c.url, { ...c });
    else { if (!ja.descricao && c.descricao) ja.descricao = c.descricao; ja.logo = ja.logo || c.logo; }
  }
  return [...mapa.values()];
}

const RASTREIO = /facebook\.com\/tr|google-analytics|googletagmanager|doubleclick|\/pixel|hotjar|clarity\.ms/i;

const semRastreio = (lista: CandidatoSite[]) => lista.filter((c) => !RASTREIO.test(c.url));
// Ícone do HTML (favicon, apple-touch-icon) conta como logo mesmo sem a marca `logo`.
const temCaraDeLogo = (c: CandidatoSite) => c.logo || c.fonte === "icone";
const pesoLogo = (c: CandidatoSite) => (c.fonte === "jsonld" || c.fonte === "og" ? 0 : c.fonte === "img" ? 1 : 2);

function logosDe(lista: CandidatoSite[], max: number): CandidatoSite[] {
  return semRastreio(lista).filter(temCaraDeLogo).sort((a, b) => pesoLogo(a) - pesoLogo(b)).slice(0, max);
}

function fotosDe(lista: CandidatoSite[], max: number): CandidatoSite[] {
  return semRastreio(lista).filter((c) => !temCaraDeLogo(c)).sort((a, b) => Number(!a.descricao) - Number(!b.descricao)).slice(0, max);
}

/** Candidatos de logo para a busca da logo: até `max`, JSON-LD e og primeiro, sem rastreadores. */
export function candidatosDeLogo(lista: CandidatoSite[], max = 16): CandidatoSite[] {
  return logosDe(lista, max);
}

/** Candidatos de foto para a busca das fotos: os que não têm cara de logo, até `max`, com descrição primeiro, sem rastreadores. */
export function candidatosDeFoto(lista: CandidatoSite[], max = 24): CandidatoSite[] {
  return fotosDe(lista, max);
}

/** Logos (até 8; JSON-LD e og:logo primeiro) e imagens (até 40; com descrição primeiro), sem rastreadores. */
export function separarCandidatos(lista: CandidatoSite[]): { logos: CandidatoSite[]; imagens: CandidatoSite[] } {
  return { logos: logosDe(lista, 8), imagens: fotosDe(lista, 40) };
}

/**
 * URL http(s) de host público: nada de localhost, IP privado, link-local, IPv6 interno (loopback, ULA, link-local, IPv4
 * embutido) ou nome de máquina da rede interna (sem ponto, `.internal`, `.local`). Não resolve DNS: um nome público que
 * aponte para IP interno passa (quem baixa confere também cada redirecionamento).
 */
export function urlPublicaHttp(u: string): URL | null {
  let url: URL;
  try { url = new URL(u); } catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const h = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (h.includes(":")) {
    // IPv6: "::" e "::1", tudo que começa com "::" (IPv4 embutido), ULA (fc00::/7), link-local (fe80::/10) e NAT64.
    return h.startsWith("::") || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith("64:ff9b:") ? null : url;
  }
  if (h === "localhost" || /\.(localhost|internal|local|localdomain)$/.test(h)) return null;
  const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
  } else if (!h.includes(".")) {
    return null;
  }
  return url;
}
