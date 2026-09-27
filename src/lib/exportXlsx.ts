// Gerador de XLSX sem biblioteca: o arquivo é um zip (sem compressão) com os XMLs do SpreadsheetML.
// Cabeçalho em negrito congelado, filtro, larguras, datas como datas e valores em R$ como números. Sem dependências.
import { serialExcel, type Planilha, type Valor } from "./planilha.ts";

export interface AbaXlsx {
  nome: string;
  planilha: Planilha;
  /** Filtro no cabeçalho */
  filtro?: boolean;
}

// ---------------------------------------------------------------- zip (store)

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipSemCompressao(arquivos: { nome: string; dados: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let deslocamento = 0;
  // 01/01/2026 00:00 no formato do DOS (a data não importa para o Excel)
  const hora = 0;
  const data = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const local = new Uint8Array(30 + nome.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // nomes em UTF-8
    lv.setUint16(8, 0, true); // sem compressão
    lv.setUint16(10, hora, true);
    lv.setUint16(12, data, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, a.dados.length, true);
    lv.setUint32(22, a.dados.length, true);
    lv.setUint16(26, nome.length, true);
    lv.setUint16(28, 0, true);
    local.set(nome, 30);
    partes.push(local, a.dados);

    const cd = new Uint8Array(46 + nome.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, hora, true);
    cv.setUint16(14, data, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, a.dados.length, true);
    cv.setUint32(24, a.dados.length, true);
    cv.setUint16(28, nome.length, true);
    cv.setUint32(42, deslocamento, true);
    cd.set(nome, 46);
    central.push(cd);
    deslocamento += local.length + a.dados.length;
  }
  const tamCentral = central.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const fv = new DataView(fim.buffer);
  fv.setUint32(0, 0x06054b50, true);
  fv.setUint16(8, arquivos.length, true);
  fv.setUint16(10, arquivos.length, true);
  fv.setUint32(12, tamCentral, true);
  fv.setUint32(16, deslocamento, true);
  const tudo = [...partes, ...central, fim];
  const saida = new Uint8Array(tudo.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of tudo) {
    saida.set(p, i);
    i += p.length;
  }
  return saida;
}

// ---------------------------------------------------------------- SpreadsheetML

/** 1 → A, 27 → AA */
export function letraColuna(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function xml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Estilos (índices do cellXfs abaixo)
const S_CABECALHO = 1, S_DATA = 2, S_DATAHORA = 3, S_MOEDA = 4, S_INTEIRO = 5, S_NUMERO = 6;

function celula(ref: string, v: Valor, cabecalho = false): string {
  if (!v) return "";
  if (v.t === "texto") {
    const t = v.v.length > 32000 ? `${v.v.slice(0, 32000)}…` : v.v;
    return `<c r="${ref}" t="inlineStr"${cabecalho ? ` s="${S_CABECALHO}"` : ""}><is><t xml:space="preserve">${xml(t)}</t></is></c>`;
  }
  const num = (n: number, s: number) => (Number.isFinite(n) ? `<c r="${ref}" s="${s}"><v>${n}</v></c>` : "");
  switch (v.t) {
    case "inteiro":
      return num(Math.round(v.v), S_INTEIRO);
    case "numero":
      return num(v.v, S_NUMERO);
    case "moeda":
      return num(v.v, S_MOEDA);
    case "data":
      return num(Math.floor(serialExcel(v.v)), S_DATA);
    case "datahora":
      return num(serialExcel(v.v), S_DATAHORA);
  }
}

function folha(aba: AbaXlsx): string {
  const { cabecalho, linhas } = aba.planilha;
  const nCols = Math.max(1, cabecalho.length);
  const ultima = letraColuna(nCols);
  const cols = cabecalho
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(80, Math.max(8, c.largura ?? Math.max(10, c.titulo.length + 2)))}" customWidth="1"/>`)
    .join("");
  const linhaCab = `<row r="1">${cabecalho.map((c, i) => celula(`${letraColuna(i + 1)}1`, { t: "texto", v: c.titulo }, true)).join("")}</row>`;
  const corpo = linhas
    .map((l, r) => `<row r="${r + 2}">${l.map((v, i) => celula(`${letraColuna(i + 1)}${r + 2}`, v)).join("")}</row>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="A1:${ultima}${linhas.length + 1}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${linhaCab}${corpo}</sheetData>` +
    (aba.filtro ? `<autoFilter ref="A1:${ultima}${linhas.length + 1}"/>` : "") +
    `</worksheet>`
  );
}

const ESTILOS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/>` +
  `<numFmt numFmtId="166" formatCode="&quot;R$&quot; #,##0.00"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="7">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** Nome de aba válido no Excel: até 31 caracteres, sem []:*?/\ e sem repetir. */
function nomesDeAba(nomes: string[]): string[] {
  const usados = new Set<string>();
  return nomes.map((n, i) => {
    let base = n.replace(/[\[\]:*?/\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 31) || `Aba ${i + 1}`;
    let nome = base;
    for (let k = 2; usados.has(nome.toLowerCase()); k++) nome = `${base.slice(0, 28)} ${k}`;
    usados.add(nome.toLowerCase());
    return nome;
  });
}

export function gerarXlsx(abas: AbaXlsx[]): Uint8Array {
  const enc = new TextEncoder();
  const nomes = nomesDeAba(abas.map((a) => a.nome));
  const sheets = nomes.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  const filtros = abas
    .map((a, i) => {
      if (!a.filtro) return "";
      const ultima = letraColuna(Math.max(1, a.planilha.cabecalho.length));
      const nome = `'${nomes[i].replace(/'/g, "''")}'`;
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xml(nome)}!$A$1:$${ultima}$${a.planilha.linhas.length + 1}</definedName>`;
    })
    .join("");
  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${sheets}</sheets>` +
    (filtros ? `<definedNames>${filtros}</definedNames>` : "") +
    `</workbook>`;
  const relsWorkbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;
  const tipos =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;
  const relsRaiz =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  return zipSemCompressao([
    { nome: "[Content_Types].xml", dados: enc.encode(tipos) },
    { nome: "_rels/.rels", dados: enc.encode(relsRaiz) },
    { nome: "xl/workbook.xml", dados: enc.encode(workbook) },
    { nome: "xl/_rels/workbook.xml.rels", dados: enc.encode(relsWorkbook) },
    { nome: "xl/styles.xml", dados: enc.encode(ESTILOS) },
    ...abas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: enc.encode(folha(a)) })),
  ]);
}
