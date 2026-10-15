// Catálogo do Gerador de UTM: canais, variáveis dinâmicas oficiais de cada plataforma e explicações dos dropdowns.
// Puro (sem dependências): roda no navegador e no `node --test`. Variáveis conferidas nas páginas oficiais em 15/10/2026.

export interface OpcaoTexto { valor: string; explicacao: string }
export interface OpcaoSlot { id: string; rotulo: string; valor: string; explicacao: string }
export interface Slot { rotulo: string; padrao: string; opcoes: OpcaoSlot[] }
export type NomeSlot = "campaign" | "term" | "content";

export interface Canal {
  id: string;
  nome: string;
  grupo: "pago" | "organico";
  /** Valor padrão de utm_source (um dos `sources`) */
  source: string;
  sources: OpcaoTexto[];
  /** Valor padrão de utm_medium (um dos MEDIUMS) */
  medium: string;
  campaign: Slot;
  /** utm_term: conjunto de anúncios (ou palavra-chave no Google) */
  term: Slot;
  /** utm_content: anúncio */
  content: Slot;
  /** Parâmetros de ID, incluídos quando "IDs" está ligado: utm_id e extras chave=valor */
  ids: { utmId?: string; extras: [string, string][] };
  /** Onde colar na plataforma */
  onde: string;
  /** O que mostrar primeiro: só os parâmetros (a plataforma tem campo próprio) ou o link completo */
  primeiro: "parametros" | "link";
  nota?: string;
  /** Gera também o modelo de acompanhamento `{lpurl}?...` (Google) */
  modeloGoogle?: boolean;
}

export const MEDIUMS: OpcaoTexto[] = [
  { valor: "cpc", explicacao: "clique pago: anúncio cobrado por clique, como Google Ads e ChatGPT Ads" },
  { valor: "paid_social", explicacao: "anúncio pago em rede social: Meta, TikTok, LinkedIn, Pinterest, X" },
  { valor: "cpm", explicacao: "custo por mil impressões: mídia de alcance, banners e vídeo por impressão" },
  { valor: "cpv", explicacao: "custo por visualização: anúncio em vídeo, como no YouTube" },
  { valor: "display", explicacao: "banners e anúncios nativos, como Taboola e Outbrain" },
  { valor: "social", explicacao: "link não pago em rede social: bio, stories, publicação" },
  { valor: "organic", explicacao: "tráfego não pago que vem de busca, como Google e Google Meu Negócio" },
  { valor: "email", explicacao: "e-mail marketing e newsletter" },
  { valor: "sms", explicacao: "mensagem de texto SMS" },
  { valor: "referral", explicacao: "link colocado em outro site, parceiro ou matéria" },
  { valor: "affiliate", explicacao: "link de afiliado ou parceiro comissionado" },
  { valor: "video", explicacao: "vídeo não pago, como um vídeo seu no YouTube" },
  { valor: "push", explicacao: "notificação push no celular ou no navegador" },
  { valor: "offline", explicacao: "QR code, material impresso e eventos" },
  { valor: "other", explicacao: "qualquer coisa que não se encaixa nas outras" },
];

export const FIXO: OpcaoSlot = { id: "fixo", rotulo: "Texto fixo", valor: "", explicacao: "você digita o valor e ele vai igual em todos os cliques" };
export const NENHUM: OpcaoSlot = { id: "nenhum", rotulo: "Não usar", valor: "", explicacao: "o parâmetro fica de fora do link" };

const op = (id: string, rotulo: string, valor: string, explicacao: string): OpcaoSlot => ({ id, rotulo, valor, explicacao });
const slot = (rotulo: string, padrao: string, opcoes: OpcaoSlot[]): Slot => ({ rotulo, padrao, opcoes });
const src = (valor: string, explicacao: string): OpcaoTexto => ({ valor, explicacao });

const SO_FIXO = (rotulo: string, padrao: "fixo" | "nenhum" = "fixo") => slot(rotulo, padrao, []);

export const CANAIS: Canal[] = [
  {
    id: "meta", nome: "Meta Ads (Facebook e Instagram)", grupo: "pago",
    source: "{{site_source_name}}",
    sources: [
      src("{{site_source_name}}", "automático: a Meta preenche com fb, ig, msg ou an conforme onde o anúncio apareceu"),
      src("facebook", "fixo: tudo vira Facebook, mesmo o que veio do Instagram"),
      src("instagram", "fixo: tudo vira Instagram"),
      src("meta", "fixo: Facebook e Instagram juntos, sem separar"),
    ],
    medium: "paid_social",
    campaign: slot("Campanha", "nome", [
      op("nome", "Nome da campanha", "{{campaign.name}}", "a Meta preenche com o nome da campanha"),
      op("id", "ID da campanha", "{{campaign.id}}", "o número da campanha, que não muda se você renomear"),
    ]),
    term: slot("Conjunto de anúncios", "nome", [
      op("nome", "Nome do conjunto", "{{adset.name}}", "a Meta preenche com o nome do conjunto de anúncios"),
      op("id", "ID do conjunto", "{{adset.id}}", "o número do conjunto"),
    ]),
    content: slot("Anúncio", "nome", [
      op("nome", "Nome do anúncio", "{{ad.name}}", "a Meta preenche com o nome do anúncio"),
      op("id", "ID do anúncio", "{{ad.id}}", "o número do anúncio"),
      op("placement", "Posicionamento", "{{placement}}", "onde apareceu, como Facebook_Mobile_Feed ou Instagram_Stories"),
    ]),
    ids: { utmId: "{{campaign.id}}", extras: [["adset_id", "{{adset.id}}"], ["ad_id", "{{ad.id}}"], ["placement", "{{placement}}"]] },
    onde: "Gerenciador de Anúncios, no anúncio, em Rastreamento, campo Parâmetros de URL. Cole sem o ponto de interrogação.",
    primeiro: "parametros",
    nota: "Os nomes saem como estavam quando o anúncio foi publicado. Se renomear depois, o nome antigo continua aparecendo. O link de teste não preenche as variáveis com chaves duplas: só o clique real preenche.",
  },
  {
    id: "google_ads", nome: "Google Ads (Pesquisa, Display, Performance Max)", grupo: "pago",
    source: "google",
    sources: [src("google", "Google Ads: Pesquisa, Display e Performance Max")],
    medium: "cpc",
    campaign: slot("Campanha", "fixo", [
      op("id", "ID da campanha", "{campaignid}", "o Google preenche com o número da campanha"),
    ]),
    term: slot("Palavra-chave ou grupo", "keyword", [
      op("keyword", "Palavra-chave", "{keyword}", "o Google preenche com a palavra-chave que ativou o anúncio (vazio em Performance Max)"),
      op("adgroupid", "ID do grupo de anúncios", "{adgroupid}", "o número do grupo de anúncios"),
    ]),
    content: slot("Anúncio", "id", [
      op("id", "ID do anúncio", "{creative}", "o Google preenche com o número do anúncio"),
    ]),
    ids: { utmId: "{campaignid}", extras: [["adgroup_id", "{adgroupid}"], ["network", "{network}"], ["device", "{device}"]] },
    onde: "Google Ads, na campanha, Configurações, Opções de URL da campanha, campo Sufixo do URL final. Cole sem o ponto de interrogação.",
    primeiro: "parametros",
    modeloGoogle: true,
    nota: "O Google não tem variável com o nome da campanha nem do grupo, só IDs. Digite o nome da campanha e use os IDs para cruzar depois. Deixe a marcação automática (gclid) ligada.",
  },
  {
    id: "youtube", nome: "YouTube Ads (via Google Ads)", grupo: "pago",
    source: "youtube",
    sources: [src("youtube", "anúncio exibido no YouTube")],
    medium: "cpv",
    campaign: slot("Campanha", "fixo", [
      op("id", "ID da campanha", "{campaignid}", "o Google preenche com o número da campanha"),
    ]),
    term: slot("Local do anúncio ou grupo", "placement", [
      op("placement", "Vídeo ou canal onde apareceu", "{placement}", "o Google preenche com o vídeo ou canal em que o anúncio rodou"),
      op("adgroupid", "ID do grupo de anúncios", "{adgroupid}", "o número do grupo de anúncios"),
    ]),
    content: slot("Anúncio", "id", [
      op("id", "ID do anúncio", "{creative}", "o Google preenche com o número do anúncio"),
    ]),
    ids: { utmId: "{campaignid}", extras: [["adgroup_id", "{adgroupid}"], ["network", "{network}"], ["device", "{device}"]] },
    onde: "Google Ads, na campanha de vídeo, Configurações, Opções de URL da campanha, campo Sufixo do URL final. Cole sem o ponto de interrogação.",
    primeiro: "parametros",
    modeloGoogle: true,
    nota: "Mesma regra do Google Ads: variáveis só com IDs, então digite o nome da campanha.",
  },
  {
    id: "tiktok", nome: "TikTok Ads", grupo: "pago",
    source: "tiktok",
    sources: [src("tiktok", "anúncio no TikTok")],
    medium: "paid_social",
    campaign: slot("Campanha", "nome", [
      op("nome", "Nome da campanha", "__CAMPAIGN_NAME__", "o TikTok preenche com o nome da campanha"),
      op("id", "ID da campanha", "__CAMPAIGN_ID__", "o número da campanha"),
    ]),
    term: slot("Grupo de anúncios", "nome", [
      op("nome", "Nome do grupo", "__AID_NAME__", "o TikTok preenche com o nome do grupo de anúncios"),
      op("id", "ID do grupo", "__AID__", "o número do grupo de anúncios"),
    ]),
    content: slot("Anúncio", "nome", [
      op("nome", "Nome do criativo", "__CID_NAME__", "o TikTok preenche com o nome do criativo"),
      op("id", "ID do criativo", "__CID__", "o número do criativo"),
      op("smart", "Nome do anúncio Smart+", "__ADID_V2_NAME__", "só para campanhas Smart+ atualizadas"),
    ]),
    ids: { utmId: "__CAMPAIGN_ID__", extras: [["adset_id", "__AID__"], ["ad_id", "__CID__"], ["placement", "__PLACEMENT__"]] },
    onde: "TikTok Ads Manager, no anúncio, campo Parâmetros de URL. Cole sem o ponto de interrogação.",
    primeiro: "parametros",
    nota: "As variáveis precisam estar em maiúsculas, com dois sublinhados de cada lado. O TikTok tem uma opção de UTM automático: use só uma das duas para não duplicar.",
  },
  {
    id: "pinterest", nome: "Pinterest Ads", grupo: "pago",
    source: "pinterest",
    sources: [src("pinterest", "anúncio no Pinterest")],
    medium: "paid_social",
    campaign: slot("Campanha", "nome", [
      op("nome", "Nome da campanha", "{campaignname}", "o Pinterest preenche com o nome da campanha"),
      op("id", "ID da campanha", "{campaignid}", "o número da campanha"),
    ]),
    term: slot("Grupo de anúncios", "nome", [
      op("nome", "Nome do grupo", "{adgroupname}", "o Pinterest preenche com o nome do grupo de anúncios"),
      op("id", "ID do grupo", "{adgroupid}", "o número do grupo de anúncios"),
    ]),
    content: slot("Anúncio", "id", [
      op("id", "ID do Pin promovido", "{adid}", "o número do Pin promovido"),
    ]),
    ids: { utmId: "{campaignid}", extras: [["adset_id", "{adgroupid}"], ["ad_id", "{adid}"]] },
    onde: "Gerenciador de Anúncios do Pinterest, no Pin promovido, campo URL de destino. Cole o link completo.",
    primeiro: "link",
    nota: "As variáveis não aparecem na prévia do Pin, só no clique real.",
  },
  {
    id: "linkedin", nome: "LinkedIn Ads", grupo: "pago",
    source: "linkedin",
    sources: [src("linkedin", "anúncio no LinkedIn")],
    medium: "paid_social",
    campaign: slot("Campanha", "grupo", [
      op("grupo", "Nome da campanha (nível mais alto)", "{{CAMPAIGN_GROUP_NAME}}", "na interface atual do LinkedIn é a Campanha; na antiga era o Grupo de campanhas"),
      op("camp", "Nome do conjunto (nível do meio)", "{{CAMPAIGN_NAME}}", "na interface atual é o Conjunto de anúncios; na antiga era a Campanha"),
    ]),
    term: slot("Conjunto de anúncios", "camp", [
      op("camp", "Nome do conjunto (nível do meio)", "{{CAMPAIGN_NAME}}", "na interface atual é o Conjunto de anúncios; na antiga era a Campanha"),
      op("campid", "ID do conjunto", "{{CAMPAIGN_ID}}", "o número do nível do meio"),
    ]),
    content: slot("Anúncio", "nome", [
      op("nome", "Nome do anúncio", "{{CREATIVE_NAME}}", "disponível só em contas com a API 202606 ou mais nova"),
      op("id", "ID do anúncio", "{{CREATIVE_ID}}", "o número do anúncio, funciona em qualquer conta"),
    ]),
    ids: { utmId: "{{CAMPAIGN_GROUP_ID}}", extras: [["adset_id", "{{CAMPAIGN_ID}}"], ["ad_id", "{{CREATIVE_ID}}"]] },
    onde: "Campaign Manager, nas configurações de rastreamento (UTM dinâmico), no nível da campanha ou da conta. Cole sem o ponto de interrogação.",
    primeiro: "parametros",
    nota: "Os valores dinâmicos do LinkedIn são ACCOUNT_ID, CAMPAIGN_GROUP_ID, CAMPAIGN_ID, CREATIVE_ID e os nomes. Se o seu painel pedir para escolher o valor numa lista em vez de aceitar o texto com chaves, escolha o mesmo nome que aparece aqui. Não funciona em Conversation Ads e Message Ads.",
  },
  {
    id: "x", nome: "X (Twitter) Ads", grupo: "pago",
    source: "twitter",
    sources: [
      src("twitter", "o GA4 reconhece como rede social, por isso é o recomendado"),
      src("x", "o nome novo da rede, mas o GA4 pode não classificar como rede social"),
    ],
    medium: "paid_social",
    campaign: SO_FIXO("Campanha"),
    term: SO_FIXO("Grupo de anúncios", "nenhum"),
    content: SO_FIXO("Anúncio", "nenhum"),
    ids: { extras: [] },
    onde: "X Ads, no anúncio, campo URL do site. Cole o link completo.",
    primeiro: "link",
    nota: "O X não tem variáveis dinâmicas. Gere um link por anúncio e digite o nome do grupo e do anúncio.",
  },
  {
    id: "taboola", nome: "Taboola", grupo: "pago",
    source: "taboola",
    sources: [src("taboola", "anúncio nativo no Taboola")],
    medium: "display",
    campaign: slot("Campanha", "nome", [
      op("nome", "Nome da campanha", "{campaign_name}", "o Taboola preenche com o nome da campanha"),
      op("id", "ID da campanha", "{campaign_id}", "o número da campanha"),
    ]),
    term: slot("Site onde apareceu", "site", [
      op("site", "Site ou app", "{site}", "o Taboola preenche com o site ou app onde o anúncio apareceu"),
      op("siteid", "ID do site", "{site_id}", "o número do site ou app"),
    ]),
    content: slot("Anúncio", "item", [
      op("item", "ID do anúncio", "{campaign_item_id}", "o número do item do anúncio"),
      op("title", "Título do anúncio", "{title}", "o título do anúncio, pode ter espaços e acentos"),
      op("criativo", "Nome do criativo", "{creative_name}", "o nome que você deu ao criativo, se tiver definido"),
    ]),
    ids: { utmId: "{campaign_id}", extras: [["ad_id", "{campaign_item_id}"], ["site_id", "{site_id}"]] },
    onde: "Backstage do Taboola, na campanha, seção Tracking Code, no fim da página. Cole sem ponto de interrogação e sem E comercial.",
    primeiro: "parametros",
    nota: "Não repita os mesmos parâmetros no link de cada anúncio, senão eles duplicam. O Taboola não tem conjunto de anúncios, por isso o utm_term leva o site.",
  },
  {
    id: "outbrain", nome: "Outbrain", grupo: "pago",
    source: "outbrain",
    sources: [src("outbrain", "anúncio nativo no Outbrain, a própria Outbrain pede sempre em minúsculas")],
    medium: "display",
    campaign: slot("Campanha", "nome", [
      op("nome", "Nome da campanha", "{{campaign_name}}", "a Outbrain preenche com o nome da campanha"),
      op("id", "ID da campanha", "{{campaign_id}}", "o número da campanha"),
    ]),
    term: slot("Site e seção onde apareceu", "pub", [
      op("pub", "Site e seção", "{{publisher_name}}_{{section_name}}", "a Outbrain preenche com o site e a seção onde o anúncio apareceu"),
      op("secao", "ID da seção", "{{section_id}}", "o número da seção"),
    ]),
    content: slot("Anúncio", "nome", [
      op("nome", "Nome do anúncio", "{{ad_name}}", "a Outbrain preenche com o nome do anúncio"),
      op("titulo", "Título do anúncio", "{{ad_title}}", "o título que aparece para quem vê o anúncio"),
      op("id", "ID do anúncio", "{{ad_id}}", "o número do anúncio"),
    ]),
    ids: { utmId: "{{campaign_id}}", extras: [["ad_id", "{{ad_id}}"]] },
    onde: "Outbrain Amplify, na campanha, seção Tracking. Cole sem o ponto de interrogação.",
    primeiro: "parametros",
    nota: "A Outbrain acrescenta os parâmetros sozinha a todos os anúncios da campanha. O Outbrain não tem conjunto de anúncios, por isso o utm_term leva o site e a seção.",
  },
  {
    id: "chatgpt_ads", nome: "ChatGPT Ads", grupo: "pago",
    source: "chatgpt",
    sources: [src("chatgpt", "anúncio dentro do ChatGPT")],
    medium: "cpc",
    campaign: slot("Campanha", "fixo", [
      op("id", "ID da campanha", "{campaign_id}", "a OpenAI preenche com o número da campanha"),
    ]),
    term: slot("Grupo de anúncios", "id", [
      op("id", "ID do grupo", "{ad_group_id}", "o número do grupo de anúncios"),
    ]),
    content: slot("Anúncio", "id", [
      op("id", "ID do anúncio", "{ad_id}", "o número do anúncio"),
    ]),
    ids: { utmId: "{campaign_id}", extras: [["adgroup_id", "{ad_group_id}"], ["ad_id", "{ad_id}"]] },
    onde: "Painel do ChatGPT Ads, em Editar campanha, campo Landing page query parameters. Cole sem o ponto de interrogação.",
    primeiro: "parametros",
    nota: "A OpenAI só oferece variáveis de ID, não de nome: digite o nome da campanha. É um recurso novo, confira se o seu painel aceita as variáveis com chaves antes de subir o anúncio. Parâmetro no nível do anúncio vale mais que o da campanha.",
  },
  {
    id: "organico_busca", nome: "Busca orgânica (Google, Bing e outros)", grupo: "organico",
    source: "google",
    sources: [
      src("google", "busca do Google"),
      src("bing", "busca do Bing"),
      src("yahoo", "busca do Yahoo"),
      src("duckduckgo", "busca do DuckDuckGo"),
      src("ecosia", "busca do Ecosia"),
      src("yandex", "busca do Yandex"),
      src("baidu", "busca do Baidu"),
    ],
    medium: "organic",
    campaign: slot("Campanha", "organico", [op("organico", "Busca orgânica", "busca_organica", "agrupa o que vem de busca sem anúncio")]),
    term: SO_FIXO("Termo", "nenhum"),
    content: SO_FIXO("Conteúdo", "nenhum"),
    ids: { extras: [] },
    onde: "Em qualquer lugar em que você controla o link e quer contar como busca orgânica, como e-mail ou uma ficha.",
    primeiro: "link",
    nota: "O Google e o Bing não deixam pôr UTM nos resultados da busca, e o GA4 já reconhece a busca orgânica sozinho. Use este link só onde você mesmo coloca o endereço.",
  },
  {
    id: "gmn", nome: "Google Meu Negócio", grupo: "organico",
    source: "google_meu_negocio",
    sources: [src("google_meu_negocio", "separa o Google Meu Negócio da busca comum nos relatórios")],
    medium: "organic",
    campaign: slot("Campanha", "perfil", [
      op("perfil", "Perfil", "perfil_gmn", "link do botão do perfil da empresa"),
      op("postagem", "Postagem", "postagem_gmn", "link dentro de uma postagem do perfil"),
      op("produtos", "Produtos e serviços", "produtos_gmn", "link de produtos ou serviços do perfil"),
    ]),
    term: SO_FIXO("Termo", "nenhum"),
    content: slot("Botão", "site", [
      op("site", "Botão Site", "botao_site", "o botão que abre o site no perfil"),
      op("agendar", "Botão Agendar ou Reservar", "botao_agendar", "o botão de agendamento ou reserva"),
      op("pedir", "Botão Pedir online", "botao_pedir", "o botão de pedido online"),
      op("saiba", "Botão Saiba mais", "botao_saiba_mais", "o botão de uma postagem"),
    ]),
    ids: { extras: [] },
    onde: "Perfil da empresa no Google, Editar perfil, campo Site. Para postagem, cole no botão da postagem.",
    primeiro: "link",
    nota: "Com medium organic, o GA4 conta como busca orgânica, mas a origem separada mostra quanto veio do perfil.",
  },
  {
    id: "ig_bio_pessoal", nome: "Instagram, bio pessoal", grupo: "organico",
    source: "instagram",
    sources: [src("instagram", "tráfego vindo do Instagram")],
    medium: "social",
    campaign: slot("Campanha", "bio", [op("bio", "Bio", "bio", "link fixo da bio do perfil")]),
    term: SO_FIXO("Termo", "nenhum"),
    content: slot("Perfil", "pessoal", [op("pessoal", "Bio pessoal", "bio_pessoal", "separa o perfil pessoal do profissional")]),
    ids: { extras: [] },
    onde: "Instagram, Editar perfil, Links. Cole o link completo.",
    primeiro: "link",
  },
  {
    id: "ig_bio_profissional", nome: "Instagram, bio profissional", grupo: "organico",
    source: "instagram",
    sources: [src("instagram", "tráfego vindo do Instagram")],
    medium: "social",
    campaign: slot("Campanha", "bio", [op("bio", "Bio", "bio", "link fixo da bio do perfil")]),
    term: SO_FIXO("Termo", "nenhum"),
    content: slot("Perfil", "profissional", [op("profissional", "Bio profissional", "bio_profissional", "separa o perfil profissional do pessoal")]),
    ids: { extras: [] },
    onde: "Instagram, Editar perfil, Links. Cole o link completo.",
    primeiro: "link",
  },
];

export const canalPorId = (id: string): Canal | undefined => CANAIS.find((c) => c.id === id);

/** Opções do dropdown de um slot: as variáveis do canal + texto fixo + (menos na campanha) não usar. */
export function opcoesDoSlot(canal: Canal, nome: NomeSlot): OpcaoSlot[] {
  return [...canal[nome].opcoes, FIXO, ...(nome === "campaign" ? [] : [NENHUM])];
}
