// Moldes do cliente: o Claude escreve um molde por chamada (HTML/CSS 1080x1350 com campos {{nome}}) e a prévia é montada
// com os textos de exemplo, pelo mesmo caminho das lâminas. Pedido de mudança gera nova versão, que volta a pedir aprovação.
// deno-lint-ignore-file no-explicit-any
import { guardar } from "./arquivos.ts";
import { gerarJson } from "./claude.ts";
import { carregarRecursos, montarLamina } from "./montagem.ts";
import { ESQUEMA_MOLDE, promptMolde } from "./prompts.ts";
import { renderizar } from "./render.ts";
import { ErroHttp, IMAGEM_EXEMPLO, TIPOS_MOLDE, validarMolde, type CampoMolde, type Molde, type TipoMolde } from "./regras.ts";

export async function gerarMolde(sb: any, clienteId: string, tipo: TipoMolde, pedido?: string): Promise<Molde> {
  if (!TIPOS_MOLDE.includes(tipo)) throw new ErroHttp(400, "Tipo de molde inválido.");
  const { data: c, error } = await sb.from("conteudo_clientes").select("*").eq("id", clienteId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) throw new ErroHttp(404, "Cliente não encontrado.");
  if (!c.design_system.trim()) throw new ErroHttp(400, "Preencha o design system do cliente antes de criar os moldes.");
  if (!c.logos.length) throw new ErroHttp(400, "Envie pelo menos uma logo antes de criar os moldes.");
  const atual: Molde | undefined = c.moldes?.[tipo];
  if (pedido !== undefined && !atual) throw new ErroHttp(400, "Este molde ainda não existe.");
  const outros = TIPOS_MOLDE.filter((t) => t !== tipo && c.moldes?.[t]).map((t) => ({ tipo: t, html: c.moldes[t].html as string }));
  const variantes = c.logos.map((l: any) => l.variante);
  const m = promptMolde({ tipo, designSystem: c.design_system, tomDeVoz: c.tom_de_voz, logos: c.logos, fontes: c.fontes, outros, atual, pedido });
  const inicio = Date.now();
  const pedir = (extra = "") => gerarJson<{ html: string; campos: CampoMolde[] }>({
    system: m.system, conteudo: m.user + extra, esquema: ESQUEMA_MOLDE, esforco: "medium", maxTokens: 32000,
  });
  let r = await pedir();
  let motivos = validarMolde(tipo, r.html, r.campos, variantes);
  // Uma nova tentativa só se ainda sobra tempo na função
  if (motivos.length && Date.now() - inicio < 60_000) {
    r = await pedir(`\n\nA versão anterior foi recusada por: ${motivos.join("; ")}. Corrija.`);
    motivos = validarMolde(tipo, r.html, r.campos, variantes);
  }
  if (motivos.length) throw new Error(`O molde veio com problema: ${motivos.join("; ")}. Tente de novo.`);
  const recursos = await carregarRecursos(c);
  const exemplo = Object.fromEntries(r.campos.filter((x) => x.tipo !== "logo").map((x) => [x.nome, x.tipo === "imagem" ? IMAGEM_EXEMPLO : x.exemplo]));
  const jpg = await renderizar(montarLamina(r.html, r.campos, exemplo, recursos));
  const previa = `instagram/conteudo/moldes/${c.id}-${tipo}-${Date.now()}.jpg`;
  await guardar(previa, jpg, "image/jpeg");
  const molde: Molde = { html: r.html, campos: r.campos, versao: (atual?.versao ?? 0) + 1, aprovado_em: null, previa_chave: previa };
  // Relê os moldes antes de gravar: outro molde pode ter sido aprovado na tela enquanto este era feito
  const { data: fresco, error: e2 } = await sb.from("conteudo_clientes").select("moldes").eq("id", c.id).single();
  if (e2) throw new Error(e2.message);
  const { error: e3 } = await sb.from("conteudo_clientes")
    .update({ moldes: { ...(fresco.moldes ?? {}), [tipo]: molde }, updated_at: new Date().toISOString() }).eq("id", c.id);
  if (e3) throw new Error(e3.message);
  return molde;
}
