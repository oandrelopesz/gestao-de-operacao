// Markdown da reunião do Fireflies, tirado do DOCX que o worker já gerou (mesmo conteúdo, sem mexer na VPS
// nem gerar de novo as reuniões antigas): título, rodapé e rótulo vêm do próprio DOCX.
import { unzipSync, strFromU8 } from "fflate";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const filhos = (el: Element, nome: string) => Array.from(el.children).filter((c) => c.localName === nome && c.namespaceURI === W);
const negrito = (run: Element) => {
  const b = filhos(run, "rPr")[0]?.getElementsByTagNameNS(W, "b")[0];
  return !!b && b.getAttributeNS(W, "val") !== "false" && b.getAttributeNS(W, "val") !== "0";
};

/** Texto de um parágrafo, com **negrito** nos trechos em negrito (runs vizinhos de mesmo estilo se juntam). */
function textoDoParagrafo(p: Element): string {
  let saida = "";
  let aberto = false;
  const fecha = () => { if (aberto) { saida = saida.replace(/(\s*)$/, "**$1"); aberto = false; } };
  for (const run of Array.from(p.getElementsByTagNameNS(W, "r"))) {
    const t = Array.from(run.children).map((c) => (c.localName === "t" ? c.textContent : c.localName === "br" ? "\n" : "")).join("");
    if (!t) continue;
    if (negrito(run) && !aberto) { saida += "**"; aberto = true; }
    else if (!negrito(run)) fecha();
    saida += t;
  }
  fecha();
  return saida.replace(/\*\*\s*\*\*/g, "");
}

export function docxParaMarkdown(docx: ArrayBuffer): string {
  const xml = strFromU8(unzipSync(new Uint8Array(docx), { filter: (f) => f.name === "word/document.xml" })["word/document.xml"]);
  const corpo = new DOMParser().parseFromString(xml, "application/xml").getElementsByTagNameNS(W, "body")[0];
  const linhas: string[] = [];
  let primeira = true;
  for (const p of filhos(corpo, "p")) {
    const estilo = filhos(p, "pPr")[0] && filhos(filhos(p, "pPr")[0], "pStyle")[0]?.getAttributeNS(W, "val");
    const texto = textoDoParagrafo(p).trim();
    if (primeira) { primeira = false; continue; } // rótulo "TRANSCRIÇÃO"/"RESUMO" acima do título
    if (!texto) continue;
    const nivel = filhos(p, "pPr")[0]?.getElementsByTagNameNS(W, "ilvl")[0]; // só item de lista tem
    if (estilo === "Heading1") linhas.push(`# ${texto}`, "");
    else if (estilo === "Heading2") linhas.push("", `## ${texto}`, "");
    else if (nivel) linhas.push(`${"  ".repeat(Number(nivel.getAttributeNS(W, "val")) || 0)}- ${texto}`);
    else linhas.push(texto, "");
  }
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** "14th Sep, 2026 - 2:02 PM" (Brasília), o formato do Meeting Date do .md nativo do Fireflies. */
function meetingDate(iso: string): string {
  const d = new Date(iso);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  const dia = Number(p.day);
  const sufixo = dia % 100 >= 11 && dia % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[dia % 10] ?? "th";
  return `${dia}${sufixo} ${p.month}, ${p.year} - ${p.hour}:${p.minute} ${p.dayPeriod}`;
}

/**
 * .md no mesmo formato do export nativo do Fireflies: `# Título`, `**Meeting Date:**`, `---` e, na transcrição, uma linha
 * `**Falante** *[mm:ss]*: texto ` por fala, sem linhas em branco. O resumo mantém as seções do DOCX.
 */
export function exportarMd(docx: ArrayBuffer, tipo: "transcricao" | "resumo", dataHora: string | null): string {
  const linhas = docxParaMarkdown(docx).split("\n");
  const titulo = linhas.find((l) => l.startsWith("# ")) ?? "# Reunião";
  // o cabeçalho do DOCX (Data, Horário, Duração, Participantes, link) termina na linha do Fireflies
  const corpo = linhas.slice(linhas.findIndex((l) => l.startsWith("**Fireflies:**")) + 1);
  const cab = `${titulo}\n\n${dataHora ? `**Meeting Date:** ${meetingDate(dataHora)}\n\n` : ""}---\n\n`;
  if (tipo === "resumo") return `${cab}${corpo.join("\n").trim()}\n`;
  const falas = corpo
    .filter((l) => l.trim())
    .map((l) => l.replace(/^\[([\d:]+)\] \*\*(.+?):\*\* ?/, "**$2** *[$1]*: ") + " ");
  return `${cab}${falas.join("\n")}\n`;
}
