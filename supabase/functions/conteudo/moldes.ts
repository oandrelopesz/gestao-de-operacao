// Moldes do cliente: o Claude escreve um molde por chamada (HTML/CSS 1080x1350 com campos {{nome}}) e a prévia é montada
// com os textos de exemplo, pelo mesmo caminho das lâminas. Pedido de mudança gera nova versão, que volta a pedir aprovação.
// deno-lint-ignore-file no-explicit-any
import { guardar } from "./arquivos.ts";
import { gerarJson } from "./claude.ts";
import { carregarRecursos, montarLamina } from "./montagem.ts";
import { ESQUEMA_MOLDE, promptMolde } from "./prompts.ts";
import { renderizar } from "./render.ts";
import { DIRECAO_ARTE, ErroHttp, IMAGEM_EXEMPLO, TIPOS_MOLDE, notaDoKit, validarMolde, type CampoMolde, type Molde, type TipoMolde } from "./regras.ts";

// O molde é feito uma vez por cliente: vale o modelo mais forte (cerca de US$ 0,30 por molde)
const MODELO_MOLDE = Deno.env.get("CLAUDE_MODELO_MOLDE") || "claude-opus-5-5";

export async function gerarMolde(sb: any, clienteId: string, tipo: TipoMolde, pedido?: string): Promise<Molde> {
  if (!TIPOS_MOLDE.includes(tipo)) throw new ErroHttp(400, "Tipo de molde inválido.");
  const { data: c, error } = await sb.from("conteudo_clientes").select("*").eq("id", clienteId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) throw new ErroHttp(404, "Cliente não encontrado.");
  if (!c.design_system.trim()) throw new ErroHttp(400, "Preencha o design system do cliente antes de criar os moldes.");
  if (!c.logos.length) throw new ErroHttp(400, "Envie pelo menos uma logo antes de criar os moldes.");
  const atual: Molde | undefined = c.moldes?.[tipo];
  if (pedido !== undefined && !atual) throw new ErroHttp(400, "Este molde ainda não existe.");
  // Só moldes da direção de arte atual servem de referência de estilo (refazer não copia o estilo antigo)
  const outros = TIPOS_MOLDE.filter((t) => t !== tipo && c.moldes?.[t]?.direcao === DIRECAO_ARTE).map((t) => ({ tipo: t, html: c.moldes[t].html as string }));
  const variantes = c.logos.map((l: any) => l.variante);
  const notas = c.pasta_cofre ? await notasDeArte(sb, c.pasta_cofre) : {};
  const m = promptMolde({ tipo, designSystem: c.design_system, tomDeVoz: c.tom_de_voz, logos: c.logos, fontes: c.fontes, outros, atual, pedido, ...notas });
  const inicio = Date.now();
  const pedir = (extra = "") => gerarJson<{ html: string; campos: CampoMolde[] }>({
    system: m.system, conteudo: m.user + extra, esquema: ESQUEMA_MOLDE, esforco: "high", maxTokens: 32000, modelo: MODELO_MOLDE,
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
  const molde: Molde = { html: r.html, campos: r.campos, versao: (atual?.versao ?? 0) + 1, aprovado_em: null, previa_chave: previa, direcao: DIRECAO_ARTE };
  // Relê os moldes antes de gravar: outro molde pode ter sido aprovado na tela enquanto este era feito
  const { data: fresco, error: e2 } = await sb.from("conteudo_clientes").select("moldes").eq("id", c.id).single();
  if (e2) throw new Error(e2.message);
  const { error: e3 } = await sb.from("conteudo_clientes")
    .update({ moldes: { ...(fresco.moldes ?? {}), [tipo]: molde }, updated_at: new Date().toISOString() }).eq("id", c.id);
  if (e3) throw new Error(e3.message);
  return molde;
}

/** Notas de direção de arte e de padrão de imagem do cofre do cliente, quando existem. */
export async function notasDeArte(sb: any, pasta: string): Promise<{ direcaoDeArte?: string; padraoDeImagem?: string }> {
  const { data, error } = await sb.from("conteudo_cofre").select("caminho, conteudo").eq("pasta", pasta).or("caminho.ilike.%arte%,caminho.ilike.%padr%");
  if (error) throw new Error(error.message);
  const achar = (tipo: string) => (data ?? []).find((l: any) => notaDoKit(l.caminho) === tipo)?.conteudo as string | undefined;
  return { direcaoDeArte: achar("direcao_de_arte"), padraoDeImagem: achar("padrao_de_imagem") };
}
