process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { crc32, gerarXlsx, letraColuna } from "./exportXlsx.ts";
import type { Planilha } from "./planilha.ts";

/** Lê um zip sem compressão (method 0) pelo diretório central: { nome: conteúdo } */
function lerZip(buf: Uint8Array): Record<string, string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let fim = buf.length - 22;
  while (dv.getUint32(fim, true) !== 0x06054b50) fim--;
  const total = dv.getUint16(fim + 10, true);
  let p = dv.getUint32(fim + 16, true);
  const arquivos: Record<string, string> = {};
  for (let i = 0; i < total; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const metodo = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const tam = dv.getUint32(p + 20, true);
    const nLen = dv.getUint16(p + 28, true);
    const local = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nLen));
    assert.equal(metodo, 0);
    const lnLen = dv.getUint16(local + 26, true);
    const dados = buf.subarray(local + 30 + lnLen, local + 30 + lnLen + tam);
    assert.equal(crc32(dados), crc, `CRC de ${nome}`);
    arquivos[nome] = new TextDecoder().decode(dados);
    p += 46 + nLen;
  }
  return arquivos;
}

test("crc32 e letras de coluna", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.deepEqual([1, 26, 27, 52, 53, 702, 703].map(letraColuna), ["A", "Z", "AA", "AZ", "BA", "ZZ", "AAA"]);
});

test("XLSX com abas, tipos de célula e filtro", () => {
  const leads: Planilha = {
    cabecalho: [{ titulo: "Nome", largura: 20 }, { titulo: "Valor" }, { titulo: "Entrada" }, { titulo: "Qtd" }, { titulo: "Taxa" }],
    linhas: [
      [{ t: "texto", v: "Ana & <Cia> \u0007" }, { t: "moeda", v: 1500 }, { t: "datahora", v: new Date("2026-09-26T17:30:00Z") }, { t: "inteiro", v: 3 }, { t: "numero", v: 2.5 }],
      [{ t: "texto", v: "Bruno" }, null, { t: "data", v: new Date("2026-09-26T17:30:00Z") }, null, null],
    ],
  };
  const resumo: Planilha = { cabecalho: [{ titulo: "Coluna" }], linhas: [[{ t: "texto", v: "Total" }]] };
  const arq = lerZip(gerarXlsx([{ nome: "Leads", planilha: leads, filtro: true }, { nome: "Resumo: [1]", planilha: resumo }]));

  assert.deepEqual(Object.keys(arq).sort(), [
    "[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml",
    "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml",
  ]);
  assert.match(arq["xl/workbook.xml"], /<sheet name="Leads" sheetId="1" r:id="rId1"\/>/);
  assert.match(arq["xl/workbook.xml"], /<sheet name="Resumo 1" sheetId="2" r:id="rId2"\/>/);
  const s1 = arq["xl/worksheets/sheet1.xml"];
  assert.match(s1, /<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Nome<\/t><\/is><\/c>/);
  assert.match(s1, /<c r="A2" t="inlineStr"><is><t xml:space="preserve">Ana &amp; &lt;Cia&gt; <\/t><\/is><\/c>/);
  assert.match(s1, /<c r="B2" s="4"><v>1500<\/v><\/c>/);
  assert.match(s1, /<c r="C2" s="3"><v>46291\.604166666/);
  assert.match(s1, /<c r="D2" s="5"><v>3<\/v><\/c>/);
  assert.match(s1, /<c r="E2" s="6"><v>2\.5<\/v><\/c>/);
  assert.match(s1, /<c r="C3" s="2"><v>46291<\/v><\/c>/);
  assert.match(s1, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(s1, /<autoFilter ref="A1:E3"\/>/);
  assert.match(s1, /<col min="1" max="1" width="20" customWidth="1"\/>/);
  assert.doesNotMatch(arq["xl/worksheets/sheet2.xml"], /autoFilter/);
  assert.match(arq["xl/styles.xml"], /formatCode="&quot;R\$&quot; #,##0\.00"/);
});
