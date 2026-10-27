import test from "node:test";
import assert from "node:assert/strict";
import { clientesNoTitulo } from "./clienteNoTitulo.ts";

// Nomes reais do cadastro (27/10/2026); o id é o próprio nome para o teste ler fácil
const CLIENTES = [
  "Pop Agro", "Dra Amuny Gobato", "Dr Márcio Martins", "Ultraclinic Breves (Felipe Pinheiro)", "Colégio Up One",
  "Colégio Castro Alves", "Futebol Star", "Easy Shop", "Guilherme Garcia", "Guilherme - Guimicell",
  "Virgínia Arruda - E-commerce", "Virginia Arruda - Orações Poderosas", "Dani Arruda", "Super Soft",
  "Frutaria Natural Food", "Construflama", "VDS Laboratório", "Syntropia Lab", "Fisio Gentil", "Avelore",
].map((nome) => ({ id: nome, nome }));
const reconhece = (titulo: string) => clientesNoTitulo(titulo, CLIENTES);

test("nome inteiro, sem acento, sem o Dr/Dra/Colégio do começo e sem espaço", () => {
  assert.deepEqual(reconhece("Corrigir LP Marcio Martins"), ["Dr Márcio Martins"]);
  assert.deepEqual(reconhece("Trackear LP Dra Amuny Gobato"), ["Dra Amuny Gobato"]);
  assert.deepEqual(reconhece("Subir criativos Up One"), ["Colégio Up One"]);
  assert.deepEqual(reconhece("Subir criativos UpOne"), ["Colégio Up One"]);
  assert.deepEqual(reconhece("Mandar ata PopAgro"), ["Pop Agro"]);
  assert.deepEqual(reconhece("SUBIR CAMPANHAS CASTRO ALVES"), ["Colégio Castro Alves"]);
});

test("parte do nome: palavra própria do cliente e o que está entre parênteses", () => {
  assert.deepEqual(reconhece("Reestruturar campanhas Amuny"), ["Dra Amuny Gobato"]);
  assert.deepEqual(reconhece("Nova estratégia Frutaria"), ["Frutaria Natural Food"]);
  assert.deepEqual(reconhece("Estratégia VDS"), ["VDS Laboratório"]);
  assert.deepEqual(reconhece("Subir vídeos Felipe Pinheiro"), ["Ultraclinic Breves (Felipe Pinheiro)"]);
  assert.deepEqual(reconhece("Extrair SEO da FisioGentil"), ["Fisio Gentil"]);
});

test("vários clientes na ordem do título, sem repetir", () => {
  assert.deepEqual(reconhece("Otimizar campanhas Futebol Star e Easy Shop"), ["Futebol Star", "Easy Shop"]);
  assert.deepEqual(reconhece("Relatórios semanais Frutaria, Super Soft e Construflama"), [
    "Frutaria Natural Food", "Super Soft", "Construflama",
  ]);
  assert.deepEqual(reconhece("Construflama: revisar Construflama"), ["Construflama"]);
});

test("a citação mais longa ganha: Guilherme Garcia não puxa o outro Guilherme", () => {
  assert.deepEqual(reconhece("Mudar funil Guilherme Garcia"), ["Guilherme Garcia"]);
  assert.deepEqual(reconhece("Estoque Guimicell"), ["Guilherme - Guimicell"]);
});

test("não reconhece: palavra genérica, nome de dois clientes, pedaço de palavra, nada citado", () => {
  assert.deepEqual(reconhece("Super urgente: revisar contrato"), []);
  assert.deepEqual(reconhece("Fazer formulário de ecommerce"), []);
  assert.deepEqual(reconhece("Estratégia Virginia Arruda"), []);
  assert.deepEqual(reconhece("Revisar lab de testes"), []);
  assert.deepEqual(reconhece("Construflamas"), []);
  assert.deepEqual(reconhece("Carrossel Francisco"), []);
  assert.deepEqual(reconhece(""), []);
});

test("e-commerce no título não puxa a cliente Virgínia E-commerce", () => {
  assert.deepEqual(reconhece("Terminar integrações e-commerce Avelore"), ["Avelore"]);
});
