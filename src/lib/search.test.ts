import test from "node:test";
import assert from "node:assert/strict";
import {
  MENSAGEM_NENHUM,
  MENSAGEM_PARECIDOS,
  PALAVRAS_VAZIAS,
  buscar,
  buscarNoIndice,
  distanciaDL,
  errosPermitidos,
  indexarBusca,
  normalizarBusca,
  palavrasDaBusca,
} from "./search.ts";

interface Item {
  titulo: string | null;
  descricao?: string | null;
}
const campos = (i: Item) => [i.titulo, i.descricao];

const ITENS: Item[] = [
  { titulo: "Página de vendas", descricao: "Texto da landing" },
  { titulo: "Otimização de campanha", descricao: "Ajustes semanais" },
  { titulo: "Google Ads", descricao: "Relatório mensal" },
  { titulo: "Gel antibacteriano" },
];
const titulos = (itens: Item[]) => itens.map((i) => i.titulo);
const achar = (consulta: string, itens: Item[] = ITENS) => buscar(itens, consulta, campos);

// ---------------------------------------------------------------- normalização

test("normalizarBusca tira acento, caixa e pontuação", () => {
  assert.equal(normalizarBusca("Página"), "pagina");
  assert.equal(normalizarBusca("Otimização de SEO!"), "otimizacao de seo");
  assert.equal(normalizarBusca("  Google   Ads "), "google ads");
  assert.equal(normalizarBusca("D'Ávila & Filhos (2026)"), "d avila filhos 2026");
});

test("normalizarBusca de null, undefined e texto vazio devolve vazio", () => {
  assert.equal(normalizarBusca(null), "");
  assert.equal(normalizarBusca(undefined), "");
  assert.equal(normalizarBusca(""), "");
  assert.equal(normalizarBusca("  !!! "), "");
});

// ---------------------------------------------------------------- palavras da busca

test("PALAVRAS_VAZIAS tem as 22 palavras do pedido", () => {
  const esperadas = "a o as os e de da do das dos em no na nos nas um uma para pra por com".split(
    " ",
  );
  assert.equal(PALAVRAS_VAZIAS.size, esperadas.length);
  for (const p of esperadas) assert.ok(PALAVRAS_VAZIAS.has(p), p);
});

test("palavrasDaBusca ignora palavras vazias", () => {
  assert.deepEqual(palavrasDaBusca("otimização da página"), ["otimizacao", "pagina"]);
  assert.deepEqual(palavrasDaBusca("Pedido PARA a Loja"), ["pedido", "loja"]);
});

test("palavrasDaBusca com só palavras vazias mantém todas", () => {
  assert.deepEqual(palavrasDaBusca("de da do"), ["de", "da", "do"]);
  assert.deepEqual(palavrasDaBusca("de"), ["de"]);
  assert.deepEqual(palavrasDaBusca("de DE da"), ["de", "da"]);
});

test("palavrasDaBusca tira repetidas e mantém a ordem da primeira vez", () => {
  assert.deepEqual(palavrasDaBusca("google ads Google ads meta"), ["google", "ads", "meta"]);
});

test("palavrasDaBusca de consulta vazia devolve lista vazia", () => {
  assert.deepEqual(palavrasDaBusca(""), []);
  assert.deepEqual(palavrasDaBusca("   "), []);
  assert.deepEqual(palavrasDaBusca("?!"), []);
  assert.deepEqual(palavrasDaBusca(null), []);
  assert.deepEqual(palavrasDaBusca(undefined), []);
});

// ---------------------------------------------------------------- erros permitidos

test("errosPermitidos: até 3 letras nenhum, 4 a 7 um, 8 ou mais dois", () => {
  assert.equal(errosPermitidos(0), 0);
  assert.equal(errosPermitidos(3), 0);
  assert.equal(errosPermitidos(4), 1);
  assert.equal(errosPermitidos(7), 1);
  assert.equal(errosPermitidos(8), 2);
  assert.equal(errosPermitidos(20), 2);
});

// ---------------------------------------------------------------- distância

test("distanciaDL conta inversão de letras vizinhas como 1", () => {
  assert.equal(distanciaDL("googel", "google"), 1);
  assert.equal(distanciaDL("abc", "bac"), 1);
});

test("distanciaDL conta letra faltando, sobrando e trocada como 1", () => {
  assert.equal(distanciaDL("otmizacao", "otimizacao"), 1);
  assert.equal(distanciaDL("otimizacaoo", "otimizacao"), 1);
  assert.equal(distanciaDL("gol", "gel"), 1);
});

test("distanciaDL de textos iguais ou vazios", () => {
  assert.equal(distanciaDL("abc", "abc"), 0);
  assert.equal(distanciaDL("", ""), 0);
  assert.equal(distanciaDL("", "abc"), 3);
  assert.equal(distanciaDL("abc", ""), 3);
});

test("distanciaDL é a restrita: não edita o mesmo trecho duas vezes", () => {
  assert.equal(distanciaDL("ca", "abc"), 3);
  assert.equal(distanciaDL("kitten", "sitting"), 3);
});

test("distanciaDL com limite devolve o valor exato quando cabe no limite", () => {
  assert.equal(distanciaDL("googel", "google", 1), 1);
  assert.equal(distanciaDL("otmizacao", "otimizacao", 2), 1);
  assert.equal(distanciaDL("abc", "abc", 0), 0);
  assert.equal(distanciaDL("kitten", "sitting", 3), 3);
});

test("distanciaDL com limite corta cedo e devolve algo maior que o limite", () => {
  // diferença de tamanho já passa do limite
  assert.ok(distanciaDL("abcdefgh", "abc", 2) > 2);
  assert.ok(distanciaDL("abc", "abcdefgh", 1) > 1);
  // dentro do cálculo
  assert.ok(distanciaDL("kitten", "sitting", 2) > 2);
  assert.ok(distanciaDL("abcdef", "uvwxyz", 1) > 1);
  assert.ok(distanciaDL("abc", "xyz", 0) > 0);
  // sem limite, o valor completo
  assert.equal(distanciaDL("abcdefgh", "abc"), 5);
});

// ---------------------------------------------------------------- busca: acha

test("busca acha por palavra inteira, sem acento", () => {
  assert.deepEqual(titulos(achar("pagina").itens), ["Página de vendas"]);
  assert.deepEqual(titulos(achar("otimizacao").itens), ["Otimização de campanha"]);
  assert.deepEqual(titulos(achar("PÁGINA").itens), ["Página de vendas"]);
});

test("busca com o acento digitado também acha texto sem acento", () => {
  const itens: Item[] = [{ titulo: "Otimizacao de pagina" }];
  assert.deepEqual(titulos(achar("otimização", itens).itens), ["Otimizacao de pagina"]);
});

test("busca acha com letra faltando", () => {
  const r = achar("otmizacao");
  assert.deepEqual(titulos(r.itens), ["Otimização de campanha"]);
  assert.equal(r.modo, "exato");
  assert.equal(r.mensagem, null);
});

test("busca acha com letras invertidas", () => {
  assert.deepEqual(titulos(achar("googel").itens), ["Google Ads"]);
});

test("busca acha palavras coladas (googleads acha Google Ads)", () => {
  assert.deepEqual(titulos(achar("googleads").itens), ["Google Ads"]);
});

test("busca acha palavra digitada pela metade (trecho exato)", () => {
  const r = achar("otimiz");
  assert.deepEqual(titulos(r.itens), ["Otimização de campanha"]);
  assert.equal(r.modo, "exato");
});

test("busca acha palavra pela metade com erro (começo da palavra)", () => {
  const r = achar("otmiza");
  assert.deepEqual(titulos(r.itens), ["Otimização de campanha"]);
  assert.equal(r.modo, "exato");
});

test("busca de 3 letras não aceita erro", () => {
  assert.equal(achar("gol", [{ titulo: "Gel" }]).modo, "nenhum");
  assert.deepEqual(titulos(achar("gel", [{ titulo: "Gel" }]).itens), ["Gel"]);
});

test("busca de 4 letras aceita 1 erro e 8 letras aceitam 2", () => {
  assert.deepEqual(titulos(achar("lnks", [{ titulo: "Links" }]).itens), ["Links"]);
  assert.equal(achar("lxxs", [{ titulo: "Links" }]).modo, "nenhum"); // 3 erros em 4 letras
  assert.equal(achar("lixs", [{ titulo: "Links" }]).modo, "nenhum"); // 2 erros em 4 letras
  assert.deepEqual(titulos(achar("otmzacao", [{ titulo: "Otimizacao" }]).itens), ["Otimizacao"]); // 2 erros em 8
  assert.equal(achar("otmzcao", [{ titulo: "Otimizacao" }]).modo, "nenhum"); // 3 erros em 7 letras
});

test("busca acha pelo campo secundário", () => {
  assert.deepEqual(titulos(achar("landing").itens), ["Página de vendas"]);
  assert.deepEqual(titulos(achar("relatorio").itens), ["Google Ads"]);
});

test("busca acha por palavras em qualquer ordem e em campos diferentes", () => {
  // "ads" está no título, "relatório" na descrição do mesmo item
  assert.deepEqual(titulos(achar("relatorio ads").itens), ["Google Ads"]);
  assert.deepEqual(titulos(achar("ads google").itens), ["Google Ads"]);
});

test("busca ignora palavras vazias da consulta", () => {
  // "da" fica de fora: só "otimizacao" e "campanha" contam
  const r = achar("otimização da campanha");
  assert.equal(r.modo, "exato");
  assert.deepEqual(titulos(r.itens), ["Otimização de campanha"]);
});

test("consulta só com palavras vazias busca por elas", () => {
  const itens: Item[] = [{ titulo: "Doce de leite" }, { titulo: "Pão" }];
  const r = achar("de", itens);
  assert.equal(r.modo, "exato");
  assert.deepEqual(titulos(r.itens), ["Doce de leite"]);
  // "de" e "da": o item bateu uma das duas, então entra como parecido
  const parecidos = achar("de da", itens);
  assert.equal(parecidos.modo, "parecidos");
  assert.deepEqual(titulos(parecidos.itens), ["Doce de leite"]);
});

test("campos nulos, vazios e só com símbolos são ignorados", () => {
  const itens: Item[] = [
    { titulo: null, descricao: "google" },
    { titulo: "", descricao: null },
    { titulo: "---", descricao: "   " },
  ];
  assert.deepEqual(
    achar("google", itens).itens.map((i) => i.descricao),
    ["google"],
  );
  assert.equal(achar("xyz", itens).modo, "nenhum");
});

test("o primeiro campo é o principal mesmo quando está vazio", () => {
  const itens: Item[] = [
    { titulo: null, descricao: "google" }, // só no secundário
    { titulo: "Google" }, // no principal
  ];
  assert.deepEqual(
    achar("google", itens).itens.map((i) => i.titulo),
    ["Google", null],
  );
});

// ---------------------------------------------------------------- busca: resultado sem exato

test("sem item com todas as palavras mostra os que batem metade, com a mensagem", () => {
  const r = achar("google xyzqwk");
  assert.equal(r.modo, "parecidos");
  assert.equal(r.mensagem, MENSAGEM_PARECIDOS);
  assert.equal(r.mensagem, "Sem resultado exato. Itens parecidos:");
  assert.deepEqual(titulos(r.itens), ["Google Ads"]);
});

test("com pouca coisa batendo mostra nenhum resultado", () => {
  const r = achar("google xyzqwk abcdefg");
  assert.equal(r.modo, "nenhum"); // 1 de 3 palavras: menos que a metade
  assert.deepEqual(r.itens, []);
  assert.equal(r.mensagem, MENSAGEM_NENHUM);
  assert.equal(r.mensagem, "Nenhum resultado encontrado.");
});

test("nada bate: modo nenhum com a mensagem", () => {
  const r = achar("xyzqwk");
  assert.equal(r.modo, "nenhum");
  assert.deepEqual(r.itens, []);
  assert.equal(r.mensagem, MENSAGEM_NENHUM);
});

test("metade exata das palavras já entra nos parecidos", () => {
  // 2 de 4 palavras
  const r = achar("google ads xyzqwk abcdefg");
  assert.equal(r.modo, "parecidos");
  assert.deepEqual(titulos(r.itens), ["Google Ads"]);
});

test("modo exato vale mesmo quando alguma palavra bateu só aproximada", () => {
  const r = achar("googel campanha", [{ titulo: "Google campanha" }, { titulo: "Campanha" }]);
  assert.equal(r.modo, "exato");
  assert.equal(r.mensagem, null);
  assert.deepEqual(titulos(r.itens), ["Google campanha"]);
});

test("modo exato some com os itens que bateram só parte das palavras", () => {
  const itens: Item[] = [{ titulo: "Google" }, { titulo: "Google Ads" }, { titulo: "Ads" }];
  const r = achar("google ads", itens);
  assert.equal(r.modo, "exato");
  assert.deepEqual(titulos(r.itens), ["Google Ads"]);
});

// ---------------------------------------------------------------- ordem

test("ordem: quem bateu mais palavras vem primeiro (modo parecidos)", () => {
  const itens: Item[] = [
    { titulo: "Google Ads" }, // 2 de 4
    { titulo: "Google Ads Campanha" }, // 3 de 4
    { titulo: "Meta" }, // 0
    { titulo: "Ads Vendas" }, // 2 de 4
  ];
  const r = achar("google ads campanha vendas", itens);
  assert.equal(r.modo, "parecidos");
  assert.deepEqual(titulos(r.itens), ["Google Ads Campanha", "Google Ads", "Ads Vendas"]);
});

test("ordem: exato antes de aproximado", () => {
  const itens: Item[] = [{ titulo: "Googel Ads" }, { titulo: "Google Analytics" }];
  const r = achar("google", itens);
  assert.equal(r.modo, "exato");
  assert.deepEqual(titulos(r.itens), ["Google Analytics", "Googel Ads"]);
});

test("ordem: campo principal antes do secundário", () => {
  const itens: Item[] = [
    { titulo: "Relatório", descricao: "google" },
    { titulo: "Google" },
    { titulo: "Contrato", descricao: "google ads" },
  ];
  const r = achar("google", itens);
  assert.deepEqual(titulos(r.itens), ["Google", "Relatório", "Contrato"]);
});

test("ordem: aproximado pesa mais que secundário (exato no secundário vem antes do aproximado no principal)", () => {
  const itens: Item[] = [
    { titulo: "Googel" }, // aproximado no principal (categoria 2)
    { titulo: "Relatório", descricao: "google" }, // exato no secundário (categoria 1)
  ];
  const r = achar("google", itens);
  // aproximadas cresce primeiro: o exato do secundário (0 aprox) vem antes do aproximado do principal (1 aprox)
  assert.deepEqual(titulos(r.itens), ["Relatório", "Googel"]);
});

test("ordem: empate mantém a ordem original", () => {
  const itens: Item[] = [
    { titulo: "Zeta google" },
    { titulo: "Alfa google" },
    { titulo: "Meio google" },
  ];
  assert.deepEqual(titulos(achar("google", itens).itens), [
    "Zeta google",
    "Alfa google",
    "Meio google",
  ]);
});

test("ordem: a palavra fica com a melhor categoria entre os campos", () => {
  const itens: Item[] = [
    { titulo: "Googel", descricao: "google" }, // exato no secundário vence o aproximado do principal
    { titulo: "Relatório", descricao: "google" }, // exato no secundário
    { titulo: "Google" }, // exato no principal
  ];
  assert.deepEqual(titulos(achar("google", itens).itens), ["Google", "Googel", "Relatório"]);
});

test("manterOrdem: só filtra, na ordem original", () => {
  const itens: Item[] = [
    { titulo: "Googel Ads" },
    { titulo: "Relatório", descricao: "google" },
    { titulo: "Google" },
  ];
  const r = buscar(itens, "google", campos, { manterOrdem: true });
  assert.equal(r.modo, "exato");
  assert.deepEqual(titulos(r.itens), ["Googel Ads", "Relatório", "Google"]);
});

test("manterOrdem: mesmo filtro dos parecidos", () => {
  const itens: Item[] = [
    { titulo: "Google Ads" },
    { titulo: "Meta" },
    { titulo: "Google Ads Campanha" },
  ];
  const r = buscar(itens, "google ads campanha vendas", campos, { manterOrdem: true });
  assert.equal(r.modo, "parecidos");
  assert.deepEqual(titulos(r.itens), ["Google Ads", "Google Ads Campanha"]); // sem manterOrdem, a campanha viria antes
});

// ---------------------------------------------------------------- consulta vazia

test("consulta vazia devolve todos os itens na ordem original", () => {
  for (const consulta of ["", "   ", "!?", null, undefined]) {
    const r = buscar(ITENS, consulta, campos);
    assert.equal(r.modo, "todos");
    assert.equal(r.mensagem, null);
    assert.deepEqual(r.itens, ITENS);
  }
});

test("lista vazia: consulta vazia dá todos (nenhum item); com consulta dá nenhum", () => {
  assert.deepEqual(buscar([], "", campos), { itens: [], modo: "todos", mensagem: null });
  assert.deepEqual(buscar([], "google", campos), {
    itens: [],
    modo: "nenhum",
    mensagem: MENSAGEM_NENHUM,
  });
});

// ---------------------------------------------------------------- índice, imutabilidade

test("a busca não modifica o array recebido", () => {
  const itens: Item[] = [
    { titulo: "Googel" },
    { titulo: "Relatório", descricao: "google" },
    { titulo: "Google" },
  ];
  const copia = [...itens];
  const r = achar("google", itens);
  assert.deepEqual(itens, copia);
  assert.notEqual(r.itens, itens);
  const todos = achar("", itens);
  assert.notEqual(todos.itens, itens); // cópia, para o chamador poder ordenar sem estragar a entrada
  assert.deepEqual(todos.itens, itens);
});

test("o índice pode ser reaproveitado em várias buscas", () => {
  const indice = indexarBusca(ITENS, campos);
  assert.deepEqual(titulos(buscarNoIndice(indice, "googleads").itens), ["Google Ads"]);
  assert.deepEqual(titulos(buscarNoIndice(indice, "pagina").itens), ["Página de vendas"]);
  assert.equal(buscarNoIndice(indice, "xyzqwk").modo, "nenhum");
  assert.equal(buscarNoIndice(indice, "").itens.length, ITENS.length);
});

test("o índice chama a função de campos uma vez por item (não a cada busca)", () => {
  let chamadas = 0;
  const indice = indexarBusca(ITENS, (i) => {
    chamadas++;
    return campos(i);
  });
  assert.equal(chamadas, ITENS.length);
  buscarNoIndice(indice, "google");
  buscarNoIndice(indice, "googel ads");
  buscarNoIndice(indice, "pagina");
  assert.equal(chamadas, ITENS.length);
});

test("o mesmo item pode aparecer repetido na lista", () => {
  const item: Item = { titulo: "Google" };
  assert.equal(achar("google", [item, item]).itens.length, 2);
});

// ---------------------------------------------------------------- campos longos

test("campo longo (texto de nota) acha palavra no meio e com erro de digitação", () => {
  const nota =
    "Reunião com o cliente para revisar a estratégia de campanhas no Google Ads, otimização das landing pages " +
    "e acompanhamento semanal dos resultados de conversão.";
  const itens: Item[] = [
    { titulo: "Ata 12", descricao: nota },
    { titulo: "Ata 13", descricao: "Outro assunto" },
  ];
  assert.deepEqual(titulos(achar("convercao", itens).itens), ["Ata 12"]);
  assert.deepEqual(titulos(achar("estrategia googel", itens).itens), ["Ata 12"]);
});
