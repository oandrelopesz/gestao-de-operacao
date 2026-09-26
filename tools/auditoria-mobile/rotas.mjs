// Telas do sistema e abertura "estável" (sem animação, fontes carregadas, dados assentados)
export const ROTAS = ["/", "/agenda", "/onboarding", "/roadmap", "/ideias", "/acessos", "/saldo", "/nps", "/clientes",
  "/crm", "/financeiro", "/cursos", "/livros", "/habilidades", "/ver-depois", "/transcritor", "/swipe", "/links",
  "/notas", "/arquivos", "/dashboard", "/admin"];

export const nomeDaRota = (rota) => (rota === "/" ? "demandas" : rota.slice(1));
export const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const SEM_ANIMACAO = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`;

// ESPERA_MS aumenta o tempo para os dados assentarem (servidor de desenvolvimento frio compila cada tela no 1º acesso)
export async function abrirEstavel(pagina, url, espera = Number(process.env.ESPERA_MS || 6000)) {
  await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await pagina.addStyleTag({ content: SEM_ANIMACAO });
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.waitForTimeout(espera);
}
