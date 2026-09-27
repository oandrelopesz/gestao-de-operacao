import test from "node:test";
import assert from "node:assert/strict";
import { lerCsv } from "./csv.ts";

test("linhas simples, CRLF e BOM", () => {
  const bom = String.fromCharCode(0xfeff);
  assert.deepEqual(lerCsv(`${bom}Produto,Preço\r\nCaneca,"R$ 12,00"\r\n`), [["Produto", "Preço"], ["Caneca", "R$ 12,00"]]);
});

test("aspas escapadas, vírgula e quebra de linha dentro da célula", () => {
  assert.deepEqual(lerCsv('a,"diz ""oi""","linha 1\nlinha 2"\nb,,'), [["a", 'diz "oi"', "linha 1\nlinha 2"], ["b", "", ""]]);
});

test("texto vazio não tem linhas", () => {
  assert.deepEqual(lerCsv(""), []);
});
