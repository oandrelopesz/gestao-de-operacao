import { test } from "node:test";
import assert from "node:assert/strict";
import { caminhoNoBucket, docVazio, imagensDoDoc, imagensRemovidas, primeiraImagem, textoDoDoc, textoParaDoc, type NoDoc } from "./notasDoc.ts";

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
