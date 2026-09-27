// Briefings (Estratégia e Negócios) chegam ao Drive como .txt: "Briefing - Nome", depois blocos
// "N - Pergunta" + resposta separados por uma linha de sublinhados. Aqui viram perguntas e respostas.
// Sem dependências: roda no navegador e no `node --test`.

export interface BlocoBriefing {
  numero: number;
  pergunta: string;
  resposta: string;
  semResposta: boolean;
}

export interface BriefingLido {
  titulo: string | null;
  blocos: BlocoBriefing[];
}

const SEPARADOR = /^\s*_{5,}\s*$/;
const PERGUNTA = /^(\d+)\s*-\s*(.+)$/;
const CABECALHO = /^briefing\s*-\s*/i;

/** null quando o texto não segue o formato (a tela mostra o texto original). */
export function lerBriefing(texto: string): BriefingLido | null {
  const grupos: string[][] = [[]];
  for (const linha of texto.replace(/\r\n?/g, "\n").split("\n")) {
    if (SEPARADOR.test(linha)) grupos.push([]);
    else grupos[grupos.length - 1].push(linha.trimEnd());
  }
  let titulo: string | null = null;
  const blocos: BlocoBriefing[] = [];
  for (const grupo of grupos) {
    let linhas = grupo.join("\n").trim().split("\n");
    if (!linhas[0]) continue;
    if (blocos.length === 0 && titulo === null && CABECALHO.test(linhas[0])) {
      titulo = linhas[0].replace(CABECALHO, "").trim() || null;
      linhas = linhas.slice(1).join("\n").trim().split("\n");
    }
    const m = PERGUNTA.exec(linhas[0]?.trim() ?? "");
    if (!m) return null;
    const resposta = linhas.slice(1).join("\n").trim();
    blocos.push({
      numero: Number(m[1]),
      pergunta: m[2].trim(),
      resposta,
      semResposta: resposta === "" || resposta === "(sem resposta)",
    });
  }
  return blocos.length ? { titulo, blocos } : null;
}
