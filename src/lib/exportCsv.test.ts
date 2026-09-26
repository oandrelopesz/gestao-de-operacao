process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { gerarCsv } from "./exportCsv.ts";
import type { Planilha } from "./planilha.ts";

test("CSV com BOM, ponto e vírgula, aspas e proteção contra fórmula", () => {
  const p: Planilha = {
    cabecalho: [{ titulo: "Nome" }, { titulo: "Obs" }, { titulo: "Valor" }, { titulo: "Data" }, { titulo: "Qtd" }],
    linhas: [
      [{ t: "texto", v: "=HYPERLINK(\"x\")" }, { t: "texto", v: "linha 1\nlinha 2; com \"aspas\"" }, { t: "moeda", v: -10.5 }, { t: "datahora", v: new Date("2026-09-26T17:30:00Z") }, { t: "inteiro", v: 2 }],
      [{ t: "texto", v: "@user" }, null, null, null, null],
    ],
  };
  const csv = gerarCsv(p);
  assert.ok(csv.startsWith("﻿"));
  const linhas = csv.slice(1).split("\r\n");
  assert.equal(linhas[0], "Nome;Obs;Valor;Data;Qtd");
  assert.equal(linhas[1], "\"'=HYPERLINK(\"\"x\"\")\";\"linha 1\nlinha 2; com \"\"aspas\"\"\";-10,50;26/09/2026 14:30;2".replace("\n", "\n"));
  assert.equal(linhas[2], "'@user;;;;");
});
