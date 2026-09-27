import test from "node:test";
import assert from "node:assert/strict";
import { lerBriefing } from "./briefingTexto.ts";

const SEP = "____________________";
const real = [
  "Briefing - JAO BOEIRA", "",
  "1 - Qual o seu nome?", "", "JAO BOEIRA", "", SEP, "",
  "2 - Me conta a sua história. Como você chegou até aqui?", "", "Comecei no design em 2020.  ", "Depois, branding.", "", SEP, "",
  "3 - Qual o seu WhatsApp?", "", "(sem resposta)", "", SEP, "",
].join("\n");

test("lê título e blocos do formato gravado no Drive", () => {
  const r = lerBriefing(real);
  assert.ok(r);
  assert.equal(r.titulo, "JAO BOEIRA");
  assert.deepEqual(r.blocos, [
    { numero: 1, pergunta: "Qual o seu nome?", resposta: "JAO BOEIRA", semResposta: false },
    { numero: 2, pergunta: "Me conta a sua história. Como você chegou até aqui?", resposta: "Comecei no design em 2020.\nDepois, branding.", semResposta: false },
    { numero: 3, pergunta: "Qual o seu WhatsApp?", resposta: "(sem resposta)", semResposta: true },
  ]);
});

test("aceita CRLF e arquivo sem cabeçalho", () => {
  const r = lerBriefing(["1 - Pergunta?", "", "Resposta", SEP].join("\r\n"));
  assert.deepEqual(r, { titulo: null, blocos: [{ numero: 1, pergunta: "Pergunta?", resposta: "Resposta", semResposta: false }] });
});

test("resposta vazia conta como sem resposta", () => {
  assert.equal(lerBriefing(["1 - P?", "", "", SEP].join("\n"))?.blocos[0].semResposta, true);
});

test("fora do formato devolve null (a tela mostra o texto original)", () => {
  assert.equal(lerBriefing("Qualquer texto\nsem numeração"), null);
  assert.equal(lerBriefing(""), null);
  assert.equal(lerBriefing(["1 - P?", "", "R", SEP, "", "texto solto", SEP].join("\n")), null);
});
