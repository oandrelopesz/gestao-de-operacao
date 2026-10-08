import { test } from "node:test";
import assert from "node:assert/strict";
import { revisarTermos } from "../src/transcritor/revisao.js";
import { alinharPalavras } from "../src/transcritor/termos.js";
import { pedirParada, reiniciarParada } from "../src/parada.js";

const config = { groqKey: "k", groqUrl: "https://groq.exemplo", groqModeloRevisao: "openai/gpt-oss-120b" };

const segs = (...textos) =>
  alinharPalavras(
    textos.map((text, i) => ({ start: i * 10, end: i * 10 + 9, text })),
    [],
  );

// Resposta falsa do Groq com a lista de correções
const resposta = (correcoes, extra = {}) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ correcoes }) } }] }),
  ...extra,
});

const semLog = (fn) => async () => {
  const orig = console.log;
  console.log = () => {};
  try {
    await fn();
  } finally {
    console.log = orig;
  }
};

test("sem chave não chama nada", async () => {
  let chamou = false;
  const entrada = segs("o rói subiu");
  const r = await revisarTermos(entrada, { config: { ...config, groqKey: "" }, fetch: async () => { chamou = true; } });
  assert.equal(chamou, false);
  assert.equal(r.segmentos, entrada);
  assert.deepEqual(r.correcoes, []);
});

test("troca aplicada e devolvida em correcoes", semLog(async () => {
  const r = await revisarTermos(segs("o rói de ontem foi bom e o cliente gostou muito do resultado final"), {
    config,
    fetch: async () => resposta([{ de: "rói", para: "ROI" }]),
  });
  assert.equal(r.segmentos[0].text, "o ROI de ontem foi bom e o cliente gostou muito do resultado final");
  assert.deepEqual(r.correcoes, [{ de: "rói", para: "ROI" }]);
}));

test("de inexistente no bloco é ignorado", semLog(async () => {
  const entrada = segs("tudo certo por aqui");
  const r = await revisarTermos(entrada, { config, fetch: async () => resposta([{ de: "xpto", para: "XPTO" }]) });
  assert.equal(r.segmentos[0].text, "tudo certo por aqui");
  assert.deepEqual(r.correcoes, []);
}));

test("trava de 15% mantém o original", semLog(async () => {
  const r = await revisarTermos(segs("rói rói rói bom"), {
    config,
    fetch: async () => resposta([{ de: "rói", para: "ROI" }]),
  });
  assert.equal(r.segmentos[0].text, "rói rói rói bom");
  assert.deepEqual(r.correcoes, []);
}));

test("429 com retry-after espera e tenta de novo", semLog(async () => {
  const esperas = [];
  let n = 0;
  const r = await revisarTermos(segs("o rói de ontem foi bom e o cliente gostou muito do resultado final"), {
    config,
    esperar: async (ms) => esperas.push(ms),
    fetch: async () =>
      ++n === 1
        ? { ok: false, status: 429, headers: { get: (k) => (k === "retry-after" ? "5" : null) }, text: async () => "limite" }
        : resposta([{ de: "rói", para: "ROI" }]),
  });
  assert.deepEqual(esperas, [5000]);
  assert.equal(n, 2);
  assert.match(r.segmentos[0].text, /ROI/);
}));

test("500 mantém o original", semLog(async () => {
  const r = await revisarTermos(segs("o rói subiu"), {
    config,
    fetch: async () => ({ ok: false, status: 500, headers: { get: () => null }, text: async () => "erro" }),
  });
  assert.equal(r.segmentos[0].text, "o rói subiu");
  assert.deepEqual(r.correcoes, []);
}));

test("JSON inválido mantém o original", semLog(async () => {
  const r = await revisarTermos(segs("o rói subiu"), {
    config,
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => "isso não é json" }),
  });
  assert.equal(r.segmentos[0].text, "o rói subiu");
  assert.deepEqual(r.correcoes, []);
}));

test("corpo enviado tem o modelo, o glossário e a memória", semLog(async () => {
  let corpo;
  await revisarTermos(segs("o rói subiu"), {
    config,
    glossario: ["ChatGPT", "CTR"],
    memoria: [{ de: "cê tê erre", para: "CTR", origem: "manual", vezes: 2 }],
    fetch: async (url, init) => {
      corpo = { url, ...JSON.parse(init.body), auth: init.headers.Authorization };
      return resposta([]);
    },
  });
  assert.equal(corpo.url, "https://groq.exemplo/v1/chat/completions");
  assert.equal(corpo.model, "openai/gpt-oss-120b");
  assert.equal(corpo.auth, "Bearer k");
  assert.equal(corpo.response_format.type, "json_object");
  const usuario = corpo.messages[1].content;
  assert.match(usuario, /ChatGPT, CTR/);
  assert.match(usuario, /cê tê erre → CTR/);
  assert.match(usuario, /o rói subiu/);
}));

test("blocos de até 8.000 caracteres e progresso por bloco", semLog(async () => {
  const longo = "palavra ".repeat(600).trim(); // ~4.800 caracteres
  let chamadas = 0;
  const fracoes = [];
  const r = await revisarTermos(segs(longo, longo, longo), {
    config,
    aoProgresso: (f) => fracoes.push(f),
    fetch: async () => (chamadas++, resposta([])),
  });
  assert.equal(chamadas, 3);
  assert.equal(r.segmentos.length, 3);
  assert.deepEqual(fracoes, [1 / 3, 2 / 3, 1]);
}));

test("JobPausado propaga", async () => {
  pedirParada();
  try {
    await assert.rejects(
      revisarTermos(segs("o rói subiu"), { config, fetch: async () => resposta([]) }),
      { name: "JobPausado" },
    );
  } finally {
    reiniciarParada();
  }
});
