import test from "node:test";
import assert from "node:assert/strict";
import { alternarCliente, clientesDaDemanda, expandirPorCliente } from "./clientesDaDemanda.ts";

test("clientesDaDemanda: principal primeiro, sem repetir; sem principal não há extras", () => {
  assert.deepEqual(clientesDaDemanda({ cliente_id: "x", clientes_extras: ["y", "x", "y", "z"] }), ["x", "y", "z"]);
  assert.deepEqual(clientesDaDemanda({ cliente_id: "x" }), ["x"]);
  assert.deepEqual(clientesDaDemanda({ cliente_id: null, clientes_extras: ["y"] }), []);
});

test("alternarCliente: marcar junta no fim, desmarcar tira; o principal é o primeiro que sobra", () => {
  assert.deepEqual(alternarCliente({ cliente_id: null }, "x"), { cliente_id: "x", clientes_extras: [] });
  assert.deepEqual(alternarCliente({ cliente_id: "x" }, "y"), { cliente_id: "x", clientes_extras: ["y"] });
  assert.deepEqual(alternarCliente({ cliente_id: "x", clientes_extras: ["y"] }, "z"), { cliente_id: "x", clientes_extras: ["y", "z"] });
  assert.deepEqual(alternarCliente({ cliente_id: "x", clientes_extras: ["y", "z"] }, "x"), { cliente_id: "y", clientes_extras: ["z"] });
  assert.deepEqual(alternarCliente({ cliente_id: "x" }, "x"), { cliente_id: null, clientes_extras: [] });
});

test("expandirPorCliente: demanda de 2 clientes conta uma vez para cada; as demais ficam iguais", () => {
  const itens = [
    { id: "1", cliente_id: "x", clientes_extras: ["y"], pessoal: false },
    { id: "2", cliente_id: "x", clientes_extras: [], pessoal: false },
    { id: "3", cliente_id: null, clientes_extras: [], pessoal: true },
  ];
  const r = expandirPorCliente(itens);
  assert.deepEqual(r.map((c) => [c.id, c.cliente_id, c.cliente_principal]), [
    ["1", "x", "x"],
    ["1", "y", "x"],
    ["2", "x", "x"],
    ["3", null, null],
  ]);
});
