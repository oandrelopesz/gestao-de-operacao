import test from "node:test";
import assert from "node:assert/strict";
import { formatarTelefone, linkWhatsapp, normalizarTelefone, problemaTelefone } from "./crmWhatsapp.ts";

test("normaliza pelo tamanho (DDD 55 não confunde)", () => {
  assert.equal(normalizarTelefone("(21) 99999-8888"), "5521999998888");
  assert.equal(normalizarTelefone("21 3333-4444"), "552133334444");
  assert.equal(normalizarTelefone("(55) 99999-8888"), "5555999998888");
  assert.equal(normalizarTelefone("+55 21 99999-8888"), "5521999998888");
  assert.equal(normalizarTelefone("+1 415 555 0100"), "14155550100");
  assert.equal(normalizarTelefone("9999"), null);
});

test("problemas e link", () => {
  assert.equal(problemaTelefone(null), "Sem telefone cadastrado");
  assert.equal(problemaTelefone("123"), "Telefone incompleto no cadastro");
  assert.equal(problemaTelefone("21999998888"), null);
  assert.equal(linkWhatsapp("21999998888"), "https://api.whatsapp.com/send?phone=5521999998888");
  assert.equal(linkWhatsapp("21999998888", "Oi, Ana"), "https://api.whatsapp.com/send?phone=5521999998888&text=Oi%2C%20Ana");
  assert.equal(linkWhatsapp("1"), null);
});

test("formatarTelefone", () => {
  assert.equal(formatarTelefone("21999998888"), "(21) 99999-8888");
  assert.equal(formatarTelefone("2133334444"), "(21) 3333-4444");
  assert.equal(formatarTelefone("+1 415 555 0100"), "+1 415 555 0100");
});
