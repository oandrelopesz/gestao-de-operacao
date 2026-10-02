import test from "node:test";
import assert from "node:assert/strict";
import { alturaAteOFimDaTela } from "./useAlturaAteOFimDaTela.ts";

test("a caixa termina no fim da tela, descontada a folga de baixo", () => {
  // Banco de leads medido no site (tela de 855 px, caixa começando em 333 px, padding de 32 px embaixo)
  assert.equal(alturaAteOFimDaTela({ topo: 333, tela: 855, folga: 36, minimo: 320 }), 486);
});

test("o que cresce acima da caixa diminui a altura na mesma medida", () => {
  const antes = alturaAteOFimDaTela({ topo: 333, tela: 855, folga: 36, minimo: 200 });
  const depois = alturaAteOFimDaTela({ topo: 373, tela: 855, folga: 36, minimo: 200 });
  assert.equal(antes - depois, 40);
});

test("tela baixa: nunca menos que o mínimo (a página rola, a tabela continua usável)", () => {
  assert.equal(alturaAteOFimDaTela({ topo: 600, tela: 700, folga: 100, minimo: 320 }), 320);
});

test("arredonda para baixo (meio pixel a mais faria a página rolar)", () => {
  assert.equal(alturaAteOFimDaTela({ topo: 100.6, tela: 900, folga: 0, minimo: 0 }), 799);
});
