// Textos do Excalidraw 0.18.1 que o pacote pt-BR deixa em inglês (e dois rótulos fixos do seletor de fonte).
// Pares inglês → português gerados a partir das chaves do idioma "en" do próprio pacote; "{{x}}" é variável que o
// Excalidraw preenche e "CtrlOrCmd" vira Ctrl ou Cmd. Sem dependências (roda no `node --test`).

export const TEXTOS_EXCALIDRAW: [string, string][] = [
  ["Copy source to clipboard", "Copiar o código"],
  ["Convert to code", "Converter em código"],
  ["Change stroke color", "Mudar a cor do traço"],
  ["Change background color", "Mudar a cor do fundo"],
  ["Circle", "Círculo"],
  ["Circle (outline)", "Círculo (contorno)"],
  ["Triangle (outline)", "Triângulo (contorno)"],
  ["Diamond", "Losango"],
  ["Diamond (outline)", "Losango (contorno)"],
  ["Crow's foot (many)", "Pé de galinha (muitos)"],
  ["Crow's foot (one)", "Pé de galinha (um)"],
  ["Crow's foot (one or many)", "Pé de galinha (um ou muitos)"],
  ["More options", "Mais opções"],
  ["Arrow type", "Tipo de seta"],
  ["Sharp arrow", "Seta reta"],
  ["Curved arrow", "Seta curva"],
  ["Elbow arrow", "Seta em cotovelo"],
  ["Clear canvas", "Limpar o quadro"],
  ["Toggle grid", "Mostrar ou esconder a grade"],
  ["Load scene from file", "Abrir de um arquivo"],
  ["Show font picker", "Mais fontes"],
  ["Theme", "Tema"],
  ["Edit embeddable link", "Editar o link incorporado"],
  ["Link & embed", "Link e incorporação"],
  ["No link is set", "Nenhum link"],
  ["Type or paste your link here", "Digite ou cole o link aqui"],
  ["Go to target element", "Ir para o objeto"],
  ["Edit arrow", "Editar a seta"],
  ["Text to diagram", "Texto para diagrama"],
  ["Prompt", "Pedido"],
  ["Zoom to fit in viewport", "Ajustar à tela"],
  ["Zoom to fit selection", "Ajustar à seleção"],
  ["Zoom to fit all elements", "Mostrar tudo"],
  ["Enable text auto-resizing", "Ajustar o tamanho do texto sozinho"],
  ["Image cropping", "Recortar a imagem"],
  ["Uncropped dimension", "Tamanho sem recorte"],
  ["Copy link to object", "Copiar o link do objeto"],
  ["Link to object", "Link para um objeto"],
  ["Wrap selection in frame", "Colocar a seleção numa moldura"],
  ["Link to object", "Link para um objeto"],
  ["Click on a shape on canvas or paste a link.", "Clique numa forma do quadro ou cole um link."],
  ["Linked object wasn't found on canvas.", "O objeto do link não está no quadro."],
  ["Find on canvas", "Procurar no quadro"],
  ["No matches found...", "Nada encontrado…"],
  ["result", "resultado"],
  ["results", "resultados"],
  ["Find text on canvas...", "Procurar texto no quadro…"],
  ["Copy link", "Copiar link"],
  ["System mode", "Tema do sistema"],
  ["Snap to objects", "Encaixar nos objetos"],
  ["Toggle embedding", "Ligar ou desligar a incorporação"],
  ["Click to interact", "Clique para interagir"],
  ["Failed to fetch image.", "Não foi possível carregar a imagem."],
  ["Couldn't save library to storage. Please save your library to a file locally to make sure you don't lose changes.", "Não foi possível guardar a biblioteca neste navegador."],
  ["Images are disabled.", "Imagens estão desativadas."],
  ["Embeddable elements cannot be added to the library.", "Sites incorporados não podem ir para a biblioteca."],
  ["IFrame elements cannot be added to the library.", "IFrames não podem ir para a biblioteca."],
  ["Support for adding images to the library coming soon!", "Imagens ainda não podem ir para a biblioteca."],
  ["Couldn't paste (couldn't read from system clipboard).", "Não foi possível colar (sem acesso à área de transferência)."],
  ["Couldn't paste.", "Não foi possível colar."],
  ["Couldn't copy to clipboard.", "Não foi possível copiar."],
  ["Wireframe to code", "Wireframe para código"],
  ["Web Embed", "Incorporar site"],
  ["Laser pointer", "Apontador laser"],
  ["Mermaid to Excalidraw", "Mermaid para diagrama"],
  ["Rectangle", "Retângulo"],
  ["Diamond", "Losango"],
  ["Ellipse", "Elipse"],
  ["Arrow", "Seta"],
  ["Line", "Linha"],
  ["Freedraw", "Desenho livre"],
  ["Text", "Texto"],
  ["Image", "Imagem"],
  ["Group", "Grupo"],
  ["Frame", "Moldura"],
  ["Web Embed", "Site incorporado"],
  ["Selection", "Seleção"],
  ["Escape to dismiss search", "Esc fecha a busca"],
  ["Click to start multiple points, drag for single line. Press {{arrowShortcut}} again to change arrow type.", "Clique no início e clique no destino, ou arraste. Aperte {{arrowShortcut}} de novo para mudar o tipo de seta."],
  ["Click-drag to create a website embed", "Clique e arraste para incorporar um site"],
  ["Hold CtrlOrCmd and Arrow key to create a flowchart", "Segure CtrlOrCmd e aperte uma seta do teclado para criar um fluxograma"],
  ["Hold CtrlOrCmd to disable snapping", "Segure CtrlOrCmd para não encaixar"],
  ["Double click the image or press ENTER to crop the image", "Duplo clique na imagem (ou Enter) para recortar"],
  ["Click outside the image or press ENTER or ESCAPE to finish cropping", "Clique fora da imagem ou aperte Enter ou Esc para terminar o recorte"],
  ["Or", "Ou"],
  ["Create a flowchart from a generic element", "Criar fluxograma a partir de uma forma"],
  ["Navigate a flowchart", "Navegar pelo fluxograma"],
  ["Crop image", "Recortar imagem"],
  ["Finish image cropping", "Terminar o recorte"],
  ["Shapes", "Formas"],
  ["Canvas & Shape properties", "Propriedades do quadro e da forma"],
  ["General", "Geral"],
  ["Shape properties", "Propriedades da forma"],
  ["Copied {{exportSelection}} to clipboard as SVG\n({{exportColorScheme}})", "{{exportSelection}} copiado como SVG\n({{exportColorScheme}})"],
  ["Embedding this url is currently not allowed. Raise an issue on GitHub to request the url whitelisted", "Não é permitido incorporar este endereço."],
  ["The link you embedded does not match the expected format. Please try to paste the 'embed' string provided by the source site", "O link não está no formato esperado. Cole o código de incorporação do site."],
  ["Link copied to clipboard", "Link copiado"],
  ["Mermaid to Excalidraw", "Mermaid para diagrama"],
  ["Insert", "Inserir"],
  ["Mermaid Syntax", "Sintaxe Mermaid"],
  ["Preview", "Prévia"],
  ["Quick search", "Busca rápida"],
  ["old", "antiga"],
  ["In this scene", "Neste quadro"],
  ["Available fonts", "Fontes disponíveis"],
  ["No fonts found", "Nenhuma fonte encontrada"],
  ["Command palette", "Paleta de comandos"],
  ["Select", "Selecionar"],
  ["Confirm", "Confirmar"],
  ["Close", "Fechar"],
  ["Recently used", "Usados recentemente"],
  ["Search menus, commands, and discover hidden gems", "Buscar menus e comandos"],
  ["No matching commands...", "Nenhum comando encontrado…"],
  ["Command is not available...", "Comando indisponível…"],
  ["For Command palette, use {{shortcut}}", "Paleta de comandos: {{shortcut}}"],
  ["Hand-drawn", "Manuscrito"],
  // Traduções do próprio pacote pt-BR que soam estranhas no sistema
  ["Ajudar", "Ajuda"],
  ["Limpar o canvas e redefinir a cor de fundo", "Limpar o quadro"],
  ["Code", "Código"],
];

const exatos = new Map(TEXTOS_EXCALIDRAW);

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Padrao = { re: RegExp; pt: string };

/** Frase em inglês → regex (variáveis e CtrlOrCmd viram grupos nomeados); procura dentro de textos maiores também. */
function compilar(en: string, pt: string): Padrao {
  let fonte = "";
  let resto = en;
  while (resto) {
    const m = /\{\{(\w+)\}\}|CtrlOrCmd/.exec(resto);
    if (!m) {
      fonte += escapar(resto);
      break;
    }
    fonte += escapar(resto.slice(0, m.index));
    const noFim = m.index + m[0].length === resto.length;
    fonte += m[1] ? `(?<${m[1]}>${noFim ? "[^\\n]+" : "[^\\n]+?"})` : "(?<ctrl>Ctrl|Cmd|⌘)";
    resto = resto.slice(m.index + m[0].length);
  }
  return { re: new RegExp(fonte, "g"), pt };
}

// Só frases (com espaço e tamanho razoável) são trocadas dentro de textos maiores; palavras soltas, só texto exato
const padroes: Padrao[] = TEXTOS_EXCALIDRAW.filter(([en]) => en.includes(" ") && en.length >= 14)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([en, pt]) => compilar(en, pt));

/** Texto traduzido, ou null quando não há nada a traduzir (já está em português ou não é do Excalidraw). */
export function traduzirExcalidraw(texto: string): string | null {
  const limpo = texto.trim();
  if (!limpo || !/[A-Za-z]/.test(limpo)) return null;
  const exato = exatos.get(limpo);
  if (exato !== undefined) return texto.replace(limpo, exato);
  // O pt-BR do Excalidraw traduziu a variável "CtrlOrCmd" como "CtrlOuCmd", que ele não troca pela tecla
  let saida = texto.replace(/CtrlOuCmd/g, "Ctrl");
  for (const { re, pt } of padroes) {
    re.lastIndex = 0;
    saida = saida.replace(re, (...args) => {
      const grupos = (typeof args[args.length - 1] === "object" ? args[args.length - 1] : {}) as Record<string, string>;
      return pt.replace(/\{\{(\w+)\}\}/g, (_, nome: string) => grupos[nome] ?? "").replace("CtrlOrCmd", grupos.ctrl ?? "Ctrl");
    });
  }
  return saida === texto ? null : saida;
}
