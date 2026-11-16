import { test } from "node:test";
import assert from "node:assert/strict";
import {
  caminhoNoBucket, docVazio, imagensDoDoc, imagensRemovidas, juntarTrechos, limitesDaLinha, limitesDaPalavra, primeiraImagem,
  textoDoDoc, textoParaDoc, type NoDoc,
} from "./notasDoc.ts";

test("limitesDaLinha: só a linha entre as quebras, sem a quebra", () => {
  const t = "Meta Ads\n- R$27 mil\n\nGoogle";
  assert.deepEqual(limitesDaLinha(t, 0), [0, 8]); // início do texto
  assert.deepEqual(limitesDaLinha(t, 4), [0, 8]); // meio da 1ª linha
  assert.deepEqual(limitesDaLinha(t, 8), [0, 8]); // fim da linha (em cima da quebra)
  assert.deepEqual(limitesDaLinha(t, 9), [9, 19]); // começo da 2ª linha
  assert.deepEqual(limitesDaLinha(t, 20), [20, 20]); // linha vazia
  assert.deepEqual(limitesDaLinha(t, 26), [21, 27]); // última linha
  assert.deepEqual(limitesDaLinha("sem quebra", 3), [0, 10]);
  assert.deepEqual(limitesDaLinha("\nabc", 0), [0, 0]);
});

test("limitesDaPalavra: letras com acento e números; fora de palavra não pega nada", () => {
  const t = "Verba Unieuro, ação 2026";
  assert.deepEqual(limitesDaPalavra(t, 2), [0, 5]);
  assert.deepEqual(limitesDaPalavra(t, 5), [0, 5]); // logo depois da palavra
  assert.deepEqual(limitesDaPalavra(t, 16), [15, 19]);
  assert.deepEqual(limitesDaPalavra(t, 21), [20, 24]);
  assert.deepEqual(limitesDaPalavra("a , b", 2), [2, 2]);
});

test("juntarTrechos: ordena, junta os que se encostam e tira os vazios", () => {
  assert.deepEqual(juntarTrechos([[10, 20], [1, 5], [5, 5], [18, 25], [30, 30]]), [[1, 5], [10, 25]]);
  assert.deepEqual(juntarTrechos([[8, 3]]), [[3, 8]]);
  assert.deepEqual(juntarTrechos([]), []);
});

const URL = "https://x.supabase.co/storage/v1/object/public/notas";
const img = (src: string): NoDoc => ({ type: "image", attrs: { src } });
const p = (texto: string): NoDoc => ({ type: "paragraph", content: [{ type: "text", text: texto }] });

const doc: NoDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Plano" }] },
    p("Primeira linha"),
    {
      type: "colunas",
      content: [
        { type: "coluna", content: [p("Coluna A"), img(`${URL}/a.webp`)] },
        { type: "coluna", content: [p("Coluna B"), img("https://site.com/b.png")] },
      ],
    },
    { type: "bulletList", content: [{ type: "listItem", content: [p("item")] }] },
  ],
};

test("textoParaDoc: nota antiga (texto) vira parágrafos, um por linha", () => {
  assert.deepEqual(textoParaDoc("a\n\nb"), {
    type: "doc",
    content: [p("a"), { type: "paragraph" }, p("b")],
  });
  assert.deepEqual(textoParaDoc(""), { type: "doc", content: [{ type: "paragraph" }] });
});

test("imagens do documento, inclusive dentro das colunas", () => {
  assert.deepEqual(imagensDoDoc(doc), [`${URL}/a.webp`, "https://site.com/b.png"]);
  assert.equal(primeiraImagem(doc), `${URL}/a.webp`);
  assert.equal(primeiraImagem(textoParaDoc("sem imagem")), null);
});

test("caminhoNoBucket só reconhece imagens do nosso bucket", () => {
  assert.equal(caminhoNoBucket(`${URL}/abc%20d.webp?x=1`), "abc d.webp");
  assert.equal(caminhoNoBucket("https://site.com/b.png"), null);
});

test("imagensRemovidas: só as nossas que saíram", () => {
  const depois: NoDoc = { type: "doc", content: [p("Coluna B")] };
  assert.deepEqual(imagensRemovidas(doc, depois), ["a.webp"]);
  assert.deepEqual(imagensRemovidas(doc, doc), []);
  assert.deepEqual(imagensRemovidas(null, doc), []);
});

test("textoDoDoc: texto puro para busca, prévia e copiar", () => {
  assert.equal(textoDoDoc(doc), "Plano\nPrimeira linha\nColuna A\nColuna B\nitem");
  assert.equal(textoDoDoc(textoParaDoc("a\n\n\n\nb")), "a\n\nb");
  assert.equal(docVazio(textoParaDoc("")), true);
  assert.equal(docVazio({ type: "doc", content: [img(`${URL}/x.webp`)] }), false);
});

test("caminhoNoBucket reconhece também o endereço novo (função r2)", () => {
  assert.equal(caminhoNoBucket("https://x.supabase.co/functions/v1/r2?c=notas%2Fabc%20d.webp"), "abc d.webp");
  assert.equal(caminhoNoBucket("https://x.supabase.co/functions/v1/r2?c=arquivos%2Fa.pdf"), null);
});

test("imagensRemovidas reconhece imagens no endereço novo", () => {
  const novo = "https://x.supabase.co/functions/v1/r2?c=notas%2Fn.webp";
  const antes: NoDoc = { type: "doc", content: [img(novo), img(`${URL}/a.webp`)] };
  assert.deepEqual(imagensRemovidas(antes, { type: "doc", content: [] }), ["n.webp", "a.webp"]);
  assert.deepEqual(imagensRemovidas(antes, antes), []);
});
