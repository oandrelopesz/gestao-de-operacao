// Os 4 arquivos de cada reunião do Fireflies: Transcrição e Resumo, cada um em PDF e DOCX. O download do app do
// Fireflies não existe na API, então o conteúdo sai da transcrição que a API entrega (`buscar` em api.js) e o
// mesmo texto vira HTML (→ PDF no Chromium do worker) e DOCX (lib `docx`). Datas e horários de Brasília.
// Tudo aqui é puro, menos `gerarPdf` (navegador injetável) e `gerarDocx` (importa a lib `docx` só quando usa,
// para o resto do worker e os testes que não geram DOCX não dependerem dela).

export const FUSO = "America/Sao_Paulo";
const COR = "6D28D9"; // roxo do Fireflies, nos rótulos e links
const CINZA = "6B7280";

const formatoBrasilia = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function partesBrasilia(data) {
  if (!(data instanceof Date) || Number.isNaN(data.getTime())) return null;
  const p = {};
  for (const x of formatoBrasilia.formatToParts(data)) p[x.type] = x.value;
  return { data: `${p.day}/${p.month}/${p.year}`, hora: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}

/** Caracteres de controle quebram o XML do DOCX (o Word recusa abrir) e não servem no PDF. */
const limpo = (v) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

/** Campo do resumo como texto: a API documenta String, mas alguns (keywords) chegam como lista. */
function textoDe(v) {
  if (Array.isArray(v)) return v.map((x) => limpo(x).trim()).filter(Boolean).join("\n");
  return limpo(v).trim();
}

export const tituloDa = (reuniao) => limpo(reuniao?.title).trim() || "Reunião sem título";

export const linkFireflies = (id) => `https://app.fireflies.ai/view/${encodeURIComponent(id)}`;

/** Início da reunião: `date` (ms desde a época) ou, sem ele, `dateString` (ISO). */
export function inicioDa(reuniao) {
  const ms = Number(reuniao?.date);
  if (reuniao?.date != null && reuniao.date !== "" && Number.isFinite(ms)) return new Date(ms);
  if (reuniao?.dateString) {
    const d = new Date(reuniao.dateString);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function duracaoMin(reuniao) {
  const n = Number(reuniao?.duration);
  return reuniao?.duration != null && reuniao.duration !== "" && Number.isFinite(n) && n >= 0 ? n : null;
}

/** "45 min", "1 h", "1 h 20 min" (vazio sem duração). */
export function duracaoTexto(min) {
  if (min == null || !Number.isFinite(min) || min <= 0) return "";
  const total = Math.round(min);
  if (total < 1) return "menos de 1 min";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * E-mails dos participantes, sem repetir (maiúsculas não contam): `participants` (lista de e-mails; às vezes
 * vários num item só, separados por vírgula) e os `meeting_attendees` que têm e-mail.
 */
export function participantesDa(reuniao) {
  const vistos = new Set();
  const lista = [];
  const brutos = [
    ...(Array.isArray(reuniao?.participants) ? reuniao.participants : []),
    ...(Array.isArray(reuniao?.meeting_attendees) ? reuniao.meeting_attendees.map((a) => a?.email) : []),
  ];
  for (const bruto of brutos) {
    for (const pedaco of limpo(bruto).split(/[,;]/)) {
      const email = pedaco.trim();
      if (!email) continue;
      const chave = email.toLowerCase();
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      lista.push(email.includes("@") ? chave : email);
    }
  }
  return lista;
}

/** Quem falou, na ordem em que aparece (usado quando o Fireflies não trouxe e-mail de ninguém). */
function falantesDa(reuniao) {
  const nomes = [];
  for (const s of reuniao?.sentences || []) {
    const nome = limpo(s?.speaker_name).trim();
    if (nome && !nomes.includes(nome)) nomes.push(nome);
  }
  return nomes;
}

/** Cabeçalho comum aos 4 arquivos. */
export function metaDaReuniao(reuniao) {
  const inicio = inicioDa(reuniao);
  const min = duracaoMin(reuniao);
  const ini = partesBrasilia(inicio);
  const fim = inicio && min ? partesBrasilia(new Date(inicio.getTime() + Math.round(min) * 60_000)) : null;
  const emails = participantesDa(reuniao);
  const pessoas = emails.length ? emails : falantesDa(reuniao);
  return {
    titulo: tituloDa(reuniao),
    data: ini?.data || "",
    horario: ini ? (fim && fim.hora !== ini.hora ? `${ini.hora}–${fim.hora}` : ini.hora) : "",
    duracao: duracaoTexto(min),
    rotuloPessoas: emails.length ? "Participantes" : "Falantes",
    pessoas,
    link: linkFireflies(reuniao?.id ?? ""),
  };
}

/** "<Título> — dd/mm/aaaa hh:mm" (início, horário de Brasília); sem data, só o título. */
export function nomeDaReuniao(reuniao) {
  const titulo = tituloDa(reuniao);
  const p = partesBrasilia(inicioDa(reuniao));
  return p ? `${titulo} — ${p.data} ${p.hora}` : titulo;
}

/** Segundos → "mm:ss" (ou "h:mm:ss" a partir de 1 hora). */
export function tempoFala(segundos) {
  const n = Number(segundos);
  const total = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}

/** Frases seguidas do mesmo falante viram um parágrafo só, com o tempo da primeira: [{ tempo, falante, texto }]. */
export function blocosDeFala(reuniao) {
  const blocos = [];
  for (const s of reuniao?.sentences || []) {
    const texto = limpo(s?.text).replace(/\s+/g, " ").trim();
    if (!texto) continue;
    const falante = limpo(s?.speaker_name).trim() || "Falante";
    const ultimo = blocos.at(-1);
    if (ultimo && ultimo.falante === falante) {
      ultimo.texto += ` ${texto}`;
      continue;
    }
    blocos.push({ tempo: tempoFala(s?.start_time), falante, texto });
  }
  return blocos;
}

/** "**negrito**" → [{ texto, negrito }]. */
function comNegrito(s) {
  const partes = [];
  let ultimo = 0;
  for (const m of s.matchAll(/\*\*(.+?)\*\*/g)) {
    if (m.index > ultimo) partes.push({ texto: s.slice(ultimo, m.index), negrito: false });
    partes.push({ texto: m[1], negrito: true });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < s.length) partes.push({ texto: s.slice(ultimo), negrito: false });
  return partes;
}

/**
 * Texto "quase markdown" do resumo do Fireflies em linhas: `- item`/`* item`/`• item` viram tópico (recuado =
 * nível 1), `# título` vira linha em negrito, `**x**` vira negrito e linha em branco separa grupos (`vazio`).
 * [{ item, nivel, partes: [{ texto, negrito }] } | { vazio: true }]
 */
export function linhasDoTexto(texto) {
  const linhas = [];
  for (const bruta of textoDe(texto).split(/\r?\n/)) {
    if (!bruta.trim()) {
      if (linhas.length && !linhas.at(-1).vazio) linhas.push({ vazio: true });
      continue;
    }
    const titulo = bruta.match(/^\s*#{1,6}\s+(.*)$/);
    const topico = bruta.match(/^(\s*)[-*•]\s+(.*)$/);
    if (titulo) {
      linhas.push({ item: false, nivel: 0, partes: [{ texto: titulo[1].replace(/\*\*/g, "").trim(), negrito: true }] });
    } else if (topico) {
      const recuo = topico[1].replace(/\t/g, "  ").length;
      linhas.push({ item: true, nivel: recuo >= 2 ? 1 : 0, partes: comNegrito(topico[2].trim()) });
    } else {
      linhas.push({ item: false, nivel: 0, partes: comNegrito(bruta.trim()) });
    }
  }
  if (linhas.at(-1)?.vazio) linhas.pop();
  return linhas;
}

/** Palavras-chave numa linha só, separadas por vírgula. */
function palavrasChave(v) {
  const lista = Array.isArray(v) ? v : textoDe(v).split(/\r?\n|,/);
  const unicas = [...new Set(lista.map((x) => limpo(x).replace(/^[-*•]\s+/, "").trim()).filter(Boolean))];
  return unicas.join(", ");
}

/**
 * Seções do Resumo, iguais no PDF e no DOCX: [{ titulo, linhas }] (só as que têm conteúdo).
 * Resumo (short_summary → overview → gist), Visão geral (overview, quando diferente), Tópicos (shorthand_bullet
 * → bullet_gist), Linha do tempo (outline), Itens de ação (agrupados por pessoa como o Fireflies manda) e
 * Palavras-chave.
 */
export function secoesDoResumo(reuniao) {
  const s = reuniao?.summary || {};
  const curto = textoDe(s.short_summary) || textoDe(s.overview) || textoDe(s.gist);
  const visao = textoDe(s.overview);
  const secoes = [
    ["Resumo", curto],
    ["Visão geral", visao && visao !== curto ? visao : ""],
    ["Tópicos", textoDe(s.shorthand_bullet) || textoDe(s.bullet_gist)],
    ["Linha do tempo", textoDe(s.outline)],
    ["Itens de ação", textoDe(s.action_items)],
    ["Palavras-chave", palavrasChave(s.keywords)],
  ]
    .map(([titulo, texto]) => ({ titulo, linhas: linhasDoTexto(texto) }))
    .filter((x) => x.linhas.length);
  if (!secoes.length) {
    secoes.push({ titulo: "Resumo", linhas: [{ item: false, nivel: 0, aviso: true, partes: [{ texto: "O Fireflies não gerou resumo para esta reunião.", negrito: false }] }] });
  }
  return secoes;
}

const AVISO_SEM_FALAS = "O Fireflies não registrou falas nesta reunião.";

// ---------------------------------------------------------------- HTML (→ PDF)

export const escaparHtml = (s) =>
  limpo(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const CSS = `
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:"Liberation Sans",Arial,Helvetica,"Noto Color Emoji",sans-serif;font-size:10.5pt;line-height:1.5;color:#1f2328;background:#fff}
header{border-bottom:2px solid #${COR};padding-bottom:10pt;margin-bottom:12pt}
.tipo{margin:0 0 2pt;font-size:8.5pt;letter-spacing:.08em;text-transform:uppercase;color:#${COR};font-weight:bold}
h1{margin:0 0 8pt;font-size:18pt;line-height:1.25;overflow-wrap:anywhere}
.meta{display:grid;grid-template-columns:auto 1fr;gap:2pt 12pt;margin:0;font-size:9.5pt}
.meta dt{color:#57606a;font-weight:bold}
.meta dd{margin:0;overflow-wrap:anywhere}
a{color:#${COR}}
h2{font-size:12.5pt;margin:16pt 0 6pt;padding-bottom:2pt;border-bottom:1px solid #e5e7eb;break-after:avoid}
p{margin:0 0 6pt;overflow-wrap:anywhere}
ul{margin:0 0 6pt;padding-left:16pt}
li{margin:0 0 3pt;overflow-wrap:anywhere}
li.n1{margin-left:14pt;list-style-type:circle}
.espaco{height:4pt}
.fala{margin:0 0 7pt}
.tempo{color:#${CINZA};font-size:9pt;font-variant-numeric:tabular-nums}
.falante{font-weight:bold}
.aviso{color:#${CINZA};font-style:italic}
`;

const htmlPartes = (partes) => partes.map((p) => (p.negrito ? `<strong>${escaparHtml(p.texto)}</strong>` : escaparHtml(p.texto))).join("");

function htmlLinhas(linhas) {
  const saida = [];
  let lista = false;
  const fecharLista = () => {
    if (lista) saida.push("</ul>");
    lista = false;
  };
  for (const l of linhas) {
    if (l.vazio) {
      fecharLista();
      saida.push('<div class="espaco"></div>');
    } else if (l.item) {
      if (!lista) saida.push("<ul>");
      lista = true;
      saida.push(`<li class="n${l.nivel}">${htmlPartes(l.partes)}</li>`);
    } else {
      fecharLista();
      saida.push(`<p${l.aviso ? ' class="aviso"' : ""}>${htmlPartes(l.partes)}</p>`);
    }
  }
  fecharLista();
  return saida.join("\n");
}

function htmlDocumento(reuniao, rotulo, corpo) {
  const m = metaDaReuniao(reuniao);
  const itens = [
    ["Data", m.data],
    ["Horário", m.horario],
    ["Duração", m.duracao],
    [m.rotuloPessoas, m.pessoas.join(", ")],
  ].filter(([, v]) => v);
  const meta = itens.map(([k, v]) => `<dt>${escaparHtml(k)}</dt><dd>${escaparHtml(v)}</dd>`).join("");
  const link = `<dt>Fireflies</dt><dd><a href="${escaparHtml(m.link)}">${escaparHtml(m.link)}</a></dd>`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escaparHtml(`${nomeDaReuniao(reuniao)} — ${rotulo}`)}</title>
<style>${CSS}</style>
</head>
<body>
<header>
<p class="tipo">${escaparHtml(rotulo)}</p>
<h1>${escaparHtml(m.titulo)}</h1>
<dl class="meta">${meta}${link}</dl>
</header>
<main>
${corpo}
</main>
</body>
</html>
`;
}

export function htmlTranscricao(reuniao) {
  const blocos = blocosDeFala(reuniao);
  const corpo = blocos.length
    ? blocos
        .map((b) => `<p class="fala"><span class="tempo">[${b.tempo}]</span> <span class="falante">${escaparHtml(b.falante)}:</span> ${escaparHtml(b.texto)}</p>`)
        .join("\n")
    : `<p class="aviso">${escaparHtml(AVISO_SEM_FALAS)}</p>`;
  return htmlDocumento(reuniao, "Transcrição", corpo);
}

export function htmlResumo(reuniao) {
  const corpo = secoesDoResumo(reuniao)
    .map((s) => `<section>\n<h2>${escaparHtml(s.titulo)}</h2>\n${htmlLinhas(s.linhas)}\n</section>`)
    .join("\n");
  return htmlDocumento(reuniao, "Resumo", corpo);
}

// ---------------------------------------------------------------- PDF

const RODAPE_PDF =
  '<div style="width:100%;font-size:8px;color:#888;text-align:center;font-family:Arial,sans-serif">' +
  '<span class="pageNumber"></span> / <span class="totalPages"></span></div>';

/**
 * HTML → PDF A4 no Chromium do worker (mesmo binário do adslibrary). `deps.chromium` troca o launcher do
 * playwright-core (os testes não abrem navegador). O navegador fecha sempre, com ou sem erro.
 */
export async function gerarPdf(html, deps = {}) {
  const chromium = deps.chromium || (await import("playwright-core")).chromium;
  const navegador = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const pagina = await navegador.newPage();
    await pagina.setContent(html, { waitUntil: "load", timeout: 60_000 });
    const pdf = await pagina.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "18mm", left: "16mm", right: "16mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: RODAPE_PDF,
    });
    return Buffer.from(pdf);
  } finally {
    await navegador.close().catch(() => {});
  }
}

// ---------------------------------------------------------------- DOCX

export const TIPOS = { transcricao: "Transcrição", resumo: "Resumo" };

/** DOCX da transcrição ou do resumo (`tipo` = "transcricao" | "resumo"), mesmo conteúdo do HTML. */
export async function gerarDocx(reuniao, tipo) {
  if (!TIPOS[tipo]) throw new Error(`Tipo de documento desconhecido: ${tipo}`);
  const {
    AlignmentType, Document, ExternalHyperlink, Footer, HeadingLevel, Packer, PageNumber, Paragraph, TextRun,
    convertMillimetersToTwip: mm,
  } = await import("docx");
  const rotulo = TIPOS[tipo];
  const m = metaDaReuniao(reuniao);

  const runs = (partes) => partes.map((p) => new TextRun({ text: p.texto, bold: p.negrito || undefined }));
  const meta = (k, v) => new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: `${k}: `, bold: true, color: "57606A" }), new TextRun(v)] });
  const aviso = (texto) => new Paragraph({ children: [new TextRun({ text: texto, italics: true, color: CINZA })] });

  const filhos = [
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: rotulo.toUpperCase(), bold: true, color: COR, size: 17 })] }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(m.titulo)] }),
  ];
  if (m.data) filhos.push(meta("Data", m.data));
  if (m.horario) filhos.push(meta("Horário", m.horario));
  if (m.duracao) filhos.push(meta("Duração", m.duracao));
  if (m.pessoas.length) filhos.push(meta(m.rotuloPessoas, m.pessoas.join(", ")));
  filhos.push(new Paragraph({
    spacing: { after: 240 },
    border: { bottom: { style: "single", size: 12, color: COR, space: 6 } },
    children: [
      new TextRun({ text: "Fireflies: ", bold: true, color: "57606A" }),
      new ExternalHyperlink({ link: m.link, children: [new TextRun({ text: m.link, style: "Hyperlink" })] }),
    ],
  }));

  if (tipo === "transcricao") {
    const blocos = blocosDeFala(reuniao);
    if (!blocos.length) filhos.push(aviso(AVISO_SEM_FALAS));
    for (const b of blocos) {
      filhos.push(new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: `[${b.tempo}] `, color: CINZA, size: 18 }),
          new TextRun({ text: `${b.falante}: `, bold: true }),
          new TextRun(b.texto),
        ],
      }));
    }
  } else {
    for (const s of secoesDoResumo(reuniao)) {
      filhos.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(s.titulo)] }));
      for (const l of s.linhas) {
        if (l.vazio) continue; // o espaço depois de cada parágrafo já separa os grupos
        if (l.aviso) filhos.push(aviso(l.partes.map((p) => p.texto).join("")));
        else if (l.item) filhos.push(new Paragraph({ bullet: { level: l.nivel }, spacing: { after: 60 }, children: runs(l.partes) }));
        else filhos.push(new Paragraph({ spacing: { after: 100 }, children: runs(l.partes) }));
      }
    }
  }

  const doc = new Document({
    title: `${nomeDaReuniao(reuniao)} — ${rotulo}`,
    creator: "Gestor Pro",
    styles: {
      default: {
        document: { run: { font: "Arial", size: 21 } },
        heading1: { run: { font: "Arial", size: 34, bold: true, color: "111111" }, paragraph: { spacing: { after: 160 } } },
        heading2: { run: { font: "Arial", size: 25, bold: true, color: "111111" }, paragraph: { spacing: { before: 280, after: 100 } } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: mm(210), height: mm(297) },
          margin: { top: mm(16), bottom: mm(18), left: mm(16), right: mm(16) },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], size: 16, color: "888888" })],
          })],
        }),
      },
      children: filhos,
    }],
  });
  return Packer.toBuffer(doc);
}
