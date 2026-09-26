// Telas do sistema e abertura "estável" (sem animação, fontes carregadas, dados assentados)
export const ROTAS = ["/", "/agenda", "/onboarding", "/roadmap", "/ideias", "/acessos", "/saldo", "/nps", "/clientes",
  "/prospeccao", "/financeiro", "/cursos", "/livros", "/habilidades", "/ver-depois", "/transcritor", "/swipe", "/links",
  "/notas", "/arquivos", "/dashboard", "/admin"];

export const nomeDaRota = (rota) => (rota === "/" ? "demandas" : rota.slice(1));
export const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const SEM_ANIMACAO = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`;

export async function abrirEstavel(pagina, url, espera = 6000) {
  await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await pagina.addStyleTag({ content: SEM_ANIMACAO });
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.waitForTimeout(espera);
}
