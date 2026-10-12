// Montagem das lâminas: recursos do cliente (fontes e logos embutidas como data:, sem depender de CORS) e o HTML final.
import { base64, dataUri, ler } from "./arquivos.ts";
import { cssFontshare, cssGoogle } from "./render.ts";
import { extensaoFonte, fontFace, htmlParaRender, logosComReserva, preencherMolde, type CampoMolde, type Fonte, type Logo } from "./regras.ts";

/** cssFontes: @font-face e CSS do Google; logos: logo_<variante> → data: */
export interface Recursos { cssFontes: string; logos: Record<string, string> }

export async function carregarRecursos(c: { fontes: Fonte[]; logos: Logo[] }): Promise<Recursos> {
  const css: string[] = [];
  for (const f of c.fontes ?? []) {
    if (f.origem === "google") css.push(await cssGoogle(f.familia));
    else if (f.origem === "fontshare") css.push(await cssFontshare(f.familia));
    else if (f.chave) {
      const ext = extensaoFonte(f.chave);
      if (!ext) continue;
      const a = await ler(f.chave);
      css.push(fontFace(f.familia, ext, base64(a.bytes), f.peso ?? 400));
    }
  }
  const logos: Record<string, string> = {};
  for (const l of c.logos ?? []) logos[`logo_${l.variante}`] = await dataUri(l.chave);
  return { cssFontes: css.join("\n"), logos: logosComReserva(logos) };
}

export function montarLamina(html: string, campos: CampoMolde[], valores: Record<string, string>, r: Recursos, ajusteCss?: string): string {
  return htmlParaRender(preencherMolde(html, campos, { ...r.logos, ...valores }), { cssFontes: r.cssFontes, ajusteCss });
}
