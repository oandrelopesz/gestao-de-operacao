import test from "node:test";
import assert from "node:assert/strict";
import { intervaloDoPeriodo, agregar, dataLocalBrasilia } from "./dashboard.ts";
import type { Conclusao } from "./dashboard.ts";

test("intervaloDoPeriodo com N dias", () => {
  assert.deepEqual(intervaloDoPeriodo("7", "2026-09-23"), { de: "2026-09-17", ate: "2026-09-23" });
  assert.deepEqual(intervaloDoPeriodo("14", "2026-09-23"), { de: "2026-09-10", ate: "2026-09-23" });
  assert.deepEqual(intervaloDoPeriodo("30", "2026-09-23"), { de: "2026-08-25", ate: "2026-09-23" });
});

test("intervaloDoPeriodo tudo", () => {
  assert.deepEqual(intervaloDoPeriodo("tudo", "2026-09-23"), { de: null, ate: null });
});

test("intervaloDoPeriodo personalizado vazio", () => {
  assert.deepEqual(intervaloDoPeriodo("personalizado", "2026-09-23"), { de: null, ate: null });
});

test("intervaloDoPeriodo personalizado com de e ate", () => {
  assert.deepEqual(intervaloDoPeriodo("personalizado", "2026-09-23", "2026-09-01", "2026-09-10"), {
    de: "2026-09-01",
    ate: "2026-09-10",
  });
});

test("intervaloDoPeriodo personalizado só com de", () => {
  assert.deepEqual(intervaloDoPeriodo("personalizado", "2026-09-23", "2026-09-01"), {
    de: "2026-09-01",
    ate: null,
  });
});

test("agregar com clientes, pessoal e sem cliente", () => {
  const clientes = [
    { id: "A", nome: "Cliente A" },
    { id: "B", nome: "Cliente B" },
  ];
  const conclusoes: Conclusao[] = [
    { cliente_id: "A", pessoal: false, concluida_em: "2026-09-20T12:00:00Z" },
    { cliente_id: "A", pessoal: false, concluida_em: "2026-09-21T12:00:00Z" },
    { cliente_id: "A", pessoal: false, concluida_em: "2026-09-22T12:00:00Z" },
    { cliente_id: null, pessoal: true, concluida_em: "2026-09-20T12:00:00Z" },
    { cliente_id: null, pessoal: false, concluida_em: "2026-09-20T12:00:00Z" },
  ];

  const resultado = agregar(conclusoes, clientes);

  assert.equal(resultado.total, 5);
  assert.deepEqual(resultado.linhas, [
    { chave: "A", nome: "Cliente A", total: 3, percentual: 60 },
    { chave: "pessoal", nome: "Pessoal", total: 1, percentual: 20 },
    { chave: "sem_cliente", nome: "Sem cliente", total: 1, percentual: 20 },
    { chave: "B", nome: "Cliente B", total: 0, percentual: 0 },
  ]);
});

test("agregar com total 0 -> percentuais 0", () => {
  const clientes = [{ id: "A", nome: "Cliente A" }];
  const resultado = agregar([], clientes);

  assert.equal(resultado.total, 0);
  assert.deepEqual(resultado.linhas, [{ chave: "A", nome: "Cliente A", total: 0, percentual: 0 }]);
});

test("agregar não inclui Pessoal/Sem cliente quando zero", () => {
  const clientes = [{ id: "A", nome: "Cliente A" }];
  const conclusoes: Conclusao[] = [{ cliente_id: "A", pessoal: false, concluida_em: "2026-09-20T12:00:00Z" }];

  const resultado = agregar(conclusoes, clientes);

  assert.equal(resultado.linhas.some((l) => l.chave === "pessoal"), false);
  assert.equal(resultado.linhas.some((l) => l.chave === "sem_cliente"), false);
});

test("dataLocalBrasilia na virada de UTC", () => {
  assert.equal(dataLocalBrasilia("2026-09-24T02:00:00Z"), "2026-09-23");
  assert.equal(dataLocalBrasilia("2026-09-24T03:30:00Z"), "2026-09-24");
});
