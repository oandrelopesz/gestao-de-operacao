// Aba Conteúdo: o que vai para o Claude e os esquemas JSON das respostas (saída estruturada). Puro, sem rede.
import {
  ALTURA, CAMPOS_OBRIGATORIOS, LARGURA, MOLDES_DO_FORMATO, ROTULO_MOLDE, ROTULO_VARIANTE,
  type Fonte, type Formato, type Lamina, type Logo, type Molde, type Moldes, type PastaDrive, type Pilar, type TipoMolde,
} from "./regras.ts";

const textoOuNulo = { anyOf: [{ type: "string" }, { type: "null" }] };
const inteiroOuNulo = { anyOf: [{ type: "integer" }, { type: "null" }] };
const objeto = (props: Record<string, unknown>) =>
  ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });

export const ESQUEMA_MOLDE = objeto({
  html: { type: "string" },
  campos: {
    type: "array",
    items: objeto({ nome: { type: "string" }, tipo: { type: "string", enum: ["texto", "imagem", "logo"] }, max: { type: "integer" }, exemplo: { type: "string" } }),
  },
});

export const ESQUEMA_TEXTO = objeto({
  tema: { type: "string" },
  legenda: { type: "string" },
  laminas: {
    type: "array",
    items: objeto({
      molde: { type: "string", enum: ["capa", "texto", "foto", "cta", "estatico"] },
      campos: { type: "array", items: objeto({ nome: { type: "string" }, valor: { type: "string" } }) },
      imagem_descricao: textoOuNulo,
      pasta_id: textoOuNulo,
    }),
  },
});

export const ESQUEMA_AJUSTE = objeto({
  resposta: { type: "string" },
  alteracoes: {
    type: "array",
    items: objeto({
      alvo: { type: "string", enum: ["campo", "imagem", "legenda", "layout"] },
      lamina: inteiroOuNulo, campo: textoOuNulo, valor: textoOuNulo, descricao: textoOuNulo, pasta_id: textoOuNulo, ajuste_css: textoOuNulo,
    }),
  },
});

export const ESQUEMA_ESCOLHA = objeto({ escolhida: { type: "integer" } });

export const ESQUEMA_KIT = objeto({
  tom_de_voz: { type: "string" },
  fontes: {
    type: "array",
    items: objeto({ familia: { type: "string" }, reservas: { type: "array", items: { type: "string" } } }),
  },
  saude: { type: "boolean" },
});

export const ESQUEMA_PILARES = objeto({
  pilares: { type: "array", items: objeto({ nome: { type: "string" }, descricao: { type: "string" } }) },
});

export const SYSTEM_PILARES = "Você define os pilares de conteúdo do Instagram de um cliente de agência, só com o que está no cofre do cliente (negócio, serviços, público, personas, posicionamento, temas já mapeados). De 3 a 5 pilares, cada um com nome curto (até 4 palavras) e descrição de uma frase dizendo o que entra nele, com exemplos de temas tirados do cofre. Nunca invente serviço, produto, número, promoção ou público que o cofre não traz; se o cofre já tiver pilares ou uma biblioteca de temas, parta deles.";

export const SYSTEM_KIT = "Você monta o kit de marca de um cliente de agência para posts de Instagram, só com o que está no cofre do cliente; nunca invente informação que o cofre não traz. tom_de_voz: de 4 a 8 linhas práticas de como escrever para o público do cliente (vocabulário, nível de formalidade, o que evitar, frase da marca se houver). fontes: as famílias citadas no design system, na ordem título, texto e números, cada uma com as reservas que o próprio design system indicar; nunca invente fonte que o cofre não cita; sem design system com fonte, lista vazia. saude: true só se o cliente for clínica, consultório, médico, dentista, estética médica ou outra área regulada pelo CFM ou pelo CFO.";

export interface Mensagens { system: string; user: string }

const REGRAS_TIPO: Record<TipoMolde, string> = {
  capa: "primeira lâmina do carrossel. Título forte que faz parar a rolagem ({{titulo}}, curto); pode ter {{subtitulo}} e {{foto}}; logo pequena.",
  texto: "lâmina de conteúdo só com texto: {{titulo}} e {{texto}} (até cerca de 280 caracteres), com o elemento gráfico do design system.",
  foto: "lâmina de conteúdo com foto: {{foto}} em destaque, {{titulo}} e {{texto}} com os mesmos limites da lâmina de texto.",
  cta: "última lâmina do carrossel: chamada para ação ({{titulo}}, e {{texto}} se quiser) e a logo em destaque.",
  estatico: "post de uma imagem só: {{titulo}}, pode ter {{texto}} e {{foto}}, com a logo.",
};

const SYSTEM_MOLDE = [
  "Você é diretor de arte sênior de uma agência premiada e escreve moldes de posts de Instagram em HTML e CSS. O molde é a identidade fixa do feed do cliente: tem de parecer feito por um designer de marca, nunca gerado por IA nem tirado de template.",
  `Cada molde é um documento HTML completo de exatamente ${LARGURA}x${ALTURA} px (retrato 4:5), com o CSS dentro de <style>. Sem JavaScript e sem carregar nada de fora: sem links, @import, url() externa ou imagens de outros sites.`,
  "Siga o design system do cliente à risca: cores, tipografia, espaçamento, elementos gráficos e as regras de logo e de foto.",
  "Marque o que muda a cada post com {{nome}}: textos, a foto ({{foto}}, sempre como src de <img> com object-fit: cover) e as logos ({{logo_principal}}, {{logo_icone}}, {{logo_clara}}, {{logo_escura}}; só as variantes disponíveis, sempre como src de <img>, sem distorcer, recortar nem recolorir).",
  "O texto precisa caber sempre: dê a cada campo de texto um limite de caracteres (max) e use tamanhos de fonte que comportem esse limite; em último caso, corte linhas com line-clamp.",
  "Use só as famílias de fonte informadas, pelo nome (font-family), com uma fonte genérica de reserva.",
  "Em cada campo, dê um exemplo realista em português do Brasil, dentro do limite. Campos de imagem e de logo têm max 0 e exemplo vazio.",
  "",
  "Direção de arte padrão. Os documentos do cliente (design system, direção de arte, padrão de imagem) vencem: se eles proibirem algo daqui (degradê, textura, sombra, sobreposição), não use; se pedirem estilo plano e minimalista, faça plano e minimalista com o mesmo cuidado.",
  "- Assinatura visual: tire do design system um motivo gráfico próprio da marca (um traço, um recorte, uma forma da logo, um padrão) e desenhe em SVG inline; repita esse motivo em todos os moldes do cliente.",
  "- Profundidade: trabalhe em camadas (fundo, forma, foto, texto), com contraste forte de escala entre título e texto. Quando a marca permitir: degradê nas cores dela, granulação leve (SVG com feTurbulence em data URI) e sombras suaves.",
  "- Layout editorial: grade assimétrica, margens generosas (pelo menos 64 px), alinhamento à esquerda por padrão, hierarquia clara com no máximo 3 tamanhos de texto e respiro de verdade.",
  "- Detalhes de carrossel profissional nas lâminas de carrossel: numeração discreta (ex.: 01/06, num campo de texto se precisar), indicação de arrastar na capa e o @ ou a marca num canto fixo.",
  "- Foto: o mesmo tratamento em todos os moldes (sobreposição na cor da marca, duotone, moldura ou recorte), para as fotos parecerem do mesmo ensaio.",
  "- Evite o que denuncia IA ou template: tudo centralizado, brilho plástico, 3D, glow, emoji, degradê roxo e azul genérico, ícones de banco de imagens, cards arredondados com sombra forte, excesso de elementos.",
].join("\n");

export function promptMolde(o: {
  tipo: TipoMolde; designSystem: string; tomDeVoz: string; logos: Logo[]; fontes: Fonte[];
  outros: { tipo: TipoMolde; html: string }[]; atual?: Molde; pedido?: string; direcaoDeArte?: string; padraoDeImagem?: string;
}): Mensagens {
  const partes = [
    `Molde: ${o.tipo} (${ROTULO_MOLDE[o.tipo]}): ${REGRAS_TIPO[o.tipo]}`,
    `Campos obrigatórios: ${CAMPOS_OBRIGATORIOS[o.tipo].join(", ")}. Pode criar outros campos de texto se o layout pedir (nomes em minúsculas, sem acento).`,
    `Logos disponíveis: ${o.logos.map((l) => `logo_${l.variante} (${ROTULO_VARIANTE[l.variante]}, ${l.largura}x${l.altura} px)`).join("; ")}.`,
    `Fontes: ${o.fontes.length ? o.fontes.map((f) => `${f.familia}${f.peso ? ` ${f.peso}` : ""}`).join(", ") : "nenhuma informada; use as do design system com reserva sans-serif"}.`,
    `Design system do cliente:\n${o.designSystem.trim()}`,
  ];
  if (o.direcaoDeArte?.trim()) partes.push(`Direção de arte dos posts do cliente:\n${o.direcaoDeArte.trim()}`);
  if (o.padraoDeImagem?.trim()) partes.push(`Padrão de imagem do cliente (use para o tratamento de foto e o clima; ignore o que for sobre ferramenta de IA):\n${o.padraoDeImagem.trim()}`);
  if (o.tomDeVoz.trim()) partes.push(`Tom de voz (para os exemplos):\n${o.tomDeVoz.trim()}`);
  if (o.outros.length) partes.push(`Moldes já criados deste cliente (mantenha o mesmo estilo):\n${o.outros.map((m) => `### ${m.tipo}\n${m.html}`).join("\n\n")}`);
  if (o.atual && o.pedido) {
    partes.push(`Molde atual:\n${o.atual.html}\n\nCampos atuais: ${JSON.stringify(o.atual.campos)}\n\nPedido de mudança: ${o.pedido.trim()}\nMude só o que foi pedido.`);
  }
  return { system: SYSTEM_MOLDE, user: partes.join("\n\n") };
}

const descreverCampos = (m: Molde) =>
  m.campos.filter((c) => c.tipo === "texto").map((c) => `${c.nome} (até ${c.max} caracteres)`).join(", ");

export function promptTexto(o: {
  formato: Formato; pilar: Pilar | null; tema: string | null; temasRecentes: string[]; tomDeVoz: string;
  moldes: Moldes; pastas: PastaDrive[]; saude: boolean;
}): { system: string; pedido: string } {
  const system = [
    "Você é social media sênior e escreve posts de Instagram para o cliente do contexto, em português do Brasil, no tom de voz dele.",
    "Use só fatos do contexto do cliente. Nunca invente preço, valor, número, estatística, depoimento, nome de cliente ou de pessoa, prêmio, prazo, endereço, telefone, horário, serviço ou produto que o cliente não oferece, promoção ou promessa. Se faltar um dado, escreva sem ele.",
    "Chamada para ação só com os canais de contato que aparecem no contexto (WhatsApp, link na bio, direct, telefone); sem canal no contexto, use \"chama no direct\".",
    "Respeite o limite de caracteres de cada campo e preencha todos os campos de texto do molde de cada lâmina, e só eles.",
    "Legenda: gancho na primeira linha, desenvolve o tema, fecha com chamada para ação e até 5 hashtags relevantes; até 2.200 caracteres.",
    ...(o.saude ? ["Cliente da área da saúde: siga as regras do CFM e do CFO. Sem promessa de resultado, cura, antes e depois, preço, promoção, desconto, brinde ou superlativo (o melhor, o único, número 1)."] : []),
  ].join("\n");
  const tipos = MOLDES_DO_FORMATO[o.formato];
  const ordem = o.formato === "carrossel"
    ? "Formato: carrossel. Monte as lâminas nesta ordem: capa, de 3 a 6 lâminas de conteúdo (molde texto ou foto) e cta no fim."
    : "Formato: post estático. Uma lâmina só, do molde estatico.";
  const pedido = [
    ordem,
    `Moldes e campos:\n${tipos.map((t) => `- ${t}: ${descreverCampos(o.moldes[t]!)}${o.moldes[t]!.campos.some((c) => c.tipo === "imagem") ? "; tem foto" : ""}`).join("\n")}`,
    o.pilar ? `Pilar deste post: ${o.pilar.nome}${o.pilar.descricao ? ` (${o.pilar.descricao})` : ""}.` : "Sem pilar definido: escolha um assunto útil para o público do cliente.",
    o.tema
      ? `Use exatamente este tema: "${o.tema}".`
      : `Escolha um tema novo dentro do pilar.${o.temasRecentes.length ? ` Não repita estes temas recentes: ${o.temasRecentes.map((t) => `"${t}"`).join(", ")}.` : ""}`,
    "Em cada lâmina com foto, diga em imagem_descricao, numa frase, o que a foto deve mostrar, e em pasta_id o id da subpasta do Drive que mais combina (ou null se nenhuma servir). Nas lâminas sem foto, os dois ficam null.",
    o.pastas.length
      ? `Subpastas do Drive:\n${o.pastas.map((p) => `- id "${p.id}": ${p.caminho} (${p.quantidade} imagens)`).join("\n")}`
      : "O cliente não tem fotos no Drive: pasta_id sempre null.",
    o.tomDeVoz.trim() ? `Tom de voz:\n${o.tomDeVoz.trim()}` : "",
  ].filter(Boolean).join("\n\n");
  return { system, pedido };
}

export function promptAjuste(o: { laminas: Lamina[]; legenda: string; moldes: Moldes; pastas: PastaDrive[]; pedido: string }): Mensagens {
  const system = [
    "Você ajusta um post de Instagram já montado, conforme o pedido do dono da agência. Mude só o que foi pedido.",
    "Use só fatos do contexto do cliente. Se o pedido exigir um dado que não está no contexto (preço, número, endereço, telefone, horário, nome), não invente: não faça essa parte e diga em resposta qual dado faltou.",
    "Responda com a lista de alterações (os campos que não se aplicam ficam null):",
    "- campo: troca o texto de um campo de uma lâmina (lamina = número da lâmina, começando em 1; campo = nome do campo; valor = texto novo, dentro do limite);",
    "- imagem: troca a foto de uma lâmina (descricao = o que a nova foto deve mostrar; pasta_id = id da subpasta do Drive que combina, ou null);",
    "- legenda: valor = a legenda nova, inteira;",
    "- layout: ajuste visual de uma lâmina (ajuste_css = regras CSS que se sobrepõem ao molde, usando os seletores do HTML do molde).",
    "Em resposta, diga numa frase curta, em português, o que foi feito.",
  ].join("\n");
  const usados = [...new Set(o.laminas.map((l) => l.molde))];
  const linhas = o.laminas.map((l, i) => {
    const limites = Object.fromEntries((o.moldes[l.molde]?.campos ?? []).map((c) => [c.nome, c.max]));
    const textos = Object.entries(l.campos).map(([k, v]) => `${k} = "${v}" (até ${limites[k] ?? "?"})`).join("; ");
    return `${i + 1}. ${l.molde}: ${textos}${l.imagem ? `; foto: ${l.imagem.descricao}` : ""}`;
  });
  const user = [
    `Pedido: ${o.pedido.trim()}`,
    `Lâminas:\n${linhas.join("\n")}`,
    `Legenda atual:\n${o.legenda}`,
    o.pastas.length ? `Subpastas do Drive:\n${o.pastas.map((p) => `- id "${p.id}": ${p.caminho}`).join("\n")}` : "Sem fotos no Drive: pasta_id null.",
    `HTML dos moldes usados (para ajustes de layout):\n${usados.map((t) => `### ${t}\n${o.moldes[t]?.html ?? ""}`).join("\n\n")}`,
  ].join("\n\n");
  return { system, user };
}

export const SYSTEM_ESCOLHA = "Você escolhe fotos reais de um negócio para posts de Instagram.";

export function pedidoEscolha(descricao: string, n: number): string {
  return `Estas são ${n} fotos, na ordem (índices de 0 a ${n - 1}). Qual combina com: "${descricao}"? Responda o índice da que combina melhor, ou -1 se nenhuma servir (sem relação com a descrição, borrada, escura, com texto grande por cima ou com pessoas em situação constrangedora).`;
}

const PADRAO_IMAGEM_MAX = 6_000;

/** Pedido da foto para a IA de imagem. O padrão de imagem do cliente entra como referência; as regras do fim vencem (é só a foto, sem texto). */
export function promptImagem(descricao: string, pessoas: boolean, padrao = ""): string {
  const ref = padrao.trim()
    ? `Referência visual do cliente (use só o que vale para a fotografia: luz, cor, cenário, pessoas, clima; ignore layout, texto e tipografia):\n${padrao.trim().slice(0, PADRAO_IMAGEM_MAX)}\n\n`
    : "";
  return `${ref}Fotografia editorial real para um post de Instagram, em retrato: ${descricao}. ${pessoas ? "Pessoas comuns e naturais, sem pose de banco de imagens, pele com textura real. " : "Sem pessoas. "}Luz natural, granulação leve de câmera, cores fiéis, sem aspecto de render, sem brilho plástico, sem perfeição artificial. Composição com área livre para texto por cima. É só a fotografia: sem texto, letras, números, logos, molduras, marca d'água ou elementos de design.`;
}
