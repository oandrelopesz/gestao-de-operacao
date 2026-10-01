process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { agruparEventos, filtrarLeads, intervaloDo, type FiltroCrm } from "./crmPeriodo.ts";
import { leadBase, type EventoCrm } from "./crmTipos.ts";
import { deSP } from "./crmFormato.ts";
import { MENSAGEM_NENHUM, MENSAGEM_PARECIDOS } from "./search.ts";

const agora = deSP(2026, 9, 26, 15, 0);
const iso = (d: Date | null) => d?.toISOString() ?? null;

test("intervalos dos atalhos em SP", () => {
  const i = (atalho: FiltroCrm["periodo"]["atalho"], extra = {}) => {
    const r = intervaloDo({ atalho, criterio: "entrada", ...extra }, agora);
    return [iso(r.inicio), iso(r.fim)];
  };
  assert.deepEqual(i("hoje"), [deSP(2026, 9, 26).toISOString(), deSP(2026, 9, 27).toISOString()]);
  assert.deepEqual(i("ontem"), [deSP(2026, 9, 25).toISOString(), deSP(2026, 9, 26).toISOString()]);
  assert.deepEqual(i("7d"), [deSP(2026, 9, 20).toISOString(), deSP(2026, 9, 27).toISOString()]);
  assert.deepEqual(i("30d"), [deSP(2026, 8, 28).toISOString(), deSP(2026, 9, 27).toISOString()]);
  assert.deepEqual(i("mes"), [deSP(2026, 9, 1).toISOString(), deSP(2026, 10, 1).toISOString()]);
  assert.deepEqual(i("mes_passado"), [deSP(2026, 8, 1).toISOString(), deSP(2026, 9, 1).toISOString()]);
  assert.deepEqual(i("maximo"), [null, null]);
  assert.deepEqual(i("personalizado", { de: "2026-09-10", ate: "2026-09-12" }), [deSP(2026, 9, 10).toISOString(), deSP(2026, 9, 13).toISOString()]);
});

test("filtrar por entrada, movimentação, tráfego e busca", () => {
  const antigo = leadBase({ id: "a", nome: "Ana Pão", created_at: deSP(2026, 8, 1).toISOString(), trafego: "pago" });
  const novo = leadBase({ id: "b", nome: "Bruno", empresa: "Café Bom", created_at: deSP(2026, 9, 26, 9).toISOString() });
  const ev: EventoCrm = { id: "e", lead_id: "a", tipo: "nota", descricao: "x", dados: {}, created_at: deSP(2026, 9, 26, 10).toISOString() };
  const porLead = agruparEventos([ev]);
  const base: FiltroCrm = { periodo: { atalho: "hoje", criterio: "entrada" }, busca: "", trafego: "todos" };
  const ids = (f: FiltroCrm) => filtrarLeads([antigo, novo], porLead, f, agora).itens.map((l) => l.id);
  assert.deepEqual(ids(base), ["b"]);
  assert.deepEqual(ids({ ...base, periodo: { atalho: "hoje", criterio: "movimentacao" } }), ["a"]);
  const max: FiltroCrm = { ...base, periodo: { atalho: "maximo", criterio: "entrada" } };
  assert.deepEqual(ids({ ...max, trafego: "pago" }), ["a"]);
  assert.deepEqual(ids({ ...max, busca: "cafe" }), ["b"]);
  assert.deepEqual(ids({ ...max, busca: "pao" }), ["a"]);
  const sem = filtrarLeads([antigo, novo], porLead, max, agora);
  assert.equal(sem.modo, "todos");
  assert.equal(sem.mensagem, null);
});

const maria = leadBase({ id: "m", nome: "Maria Conceição", empresa: "Padaria Pão Quente", cidade: "São Paulo", telefone: "(11) 99999-1234" });
const bruno = leadBase({ id: "b", nome: "Bruno", empresa: "Café Bom", nicho: "Cafeteria", email: "bruno@cafebom.com", telefone: "21 98888-5678" });
const carlos = leadBase({ id: "c", nome: "Carlos 1234", empresa: "Pizzaria Bom Prato" });
const leads = [maria, bruno, carlos];
const max: FiltroCrm = { periodo: { atalho: "maximo", criterio: "entrada" }, busca: "", trafego: "todos" };
const busca = (b: string, opcoes?: { manterOrdem?: boolean }) => filtrarLeads(leads, new Map(), { ...max, busca: b }, agora, opcoes);

test("filtrarLeads: busca sem acento e sem maiúscula no nome, empresa, nicho, e-mail e cidade", () => {
  assert.deepEqual(busca("  MARÍA  ").itens.map((l) => l.id), ["m"]);
  assert.deepEqual(busca("conceicao").itens.map((l) => l.id), ["m"]);
  assert.deepEqual(busca("PÃO QUENTE").itens.map((l) => l.id), ["m"]);
  assert.deepEqual(busca("sao paulo").itens.map((l) => l.id), ["m"]);
  assert.deepEqual(busca("cafeteria").itens.map((l) => l.id), ["b"]);
  assert.deepEqual(busca("bruno@cafebom.com").itens.map((l) => l.id), ["b"]);
});

test("filtrarLeads: aceita erro de digitação", () => {
  assert.deepEqual(busca("brunno").itens.map((l) => l.id), ["b"]); // letra a mais
  assert.deepEqual(busca("padria").itens.map((l) => l.id), ["m"]); // letra a menos
  assert.deepEqual(busca("pizzeria").itens.map((l) => l.id), ["c"]); // letra trocada
  assert.deepEqual(busca("cafeteira").itens.map((l) => l.id), ["b"]); // erro numa palavra comprida
  assert.deepEqual(busca("mraia conceicao").itens.map((l) => l.id), ["m"]); // letras vizinhas trocadas
  assert.equal(busca("brunno").modo, "exato");
});

test("filtrarLeads: sem todas as palavras mostra os parecidos com a mensagem; sem nada, modo nenhum", () => {
  const parecidos = busca("bruno zebra");
  assert.equal(parecidos.modo, "parecidos");
  assert.equal(parecidos.mensagem, MENSAGEM_PARECIDOS);
  assert.deepEqual(parecidos.itens.map((l) => l.id), ["b"]);
  const nenhum = busca("zebra");
  assert.equal(nenhum.modo, "nenhum");
  assert.equal(nenhum.mensagem, MENSAGEM_NENHUM);
  assert.deepEqual(nenhum.itens, []);
});

test("filtrarLeads: tráfego e período valem antes da busca", () => {
  const ev: EventoCrm = { id: "e", lead_id: "b", tipo: "nota", descricao: "x", dados: {}, created_at: deSP(2026, 9, 26, 10).toISOString() };
  const porLead = agruparEventos([ev]);
  const hoje: FiltroCrm = { ...max, periodo: { atalho: "hoje", criterio: "movimentacao" }, busca: "bruno" };
  assert.deepEqual(filtrarLeads(leads, porLead, hoje, agora).itens.map((l) => l.id), ["b"]);
  assert.equal(filtrarLeads(leads, porLead, { ...hoje, busca: "maria" }, agora).modo, "nenhum");
  assert.equal(filtrarLeads(leads, porLead, { ...max, busca: "bruno", trafego: "pago" }, agora).modo, "nenhum");
});

test("filtrarLeads: manterOrdem só filtra (o Kanban segue a ordem das colunas); sem ela, os mais parecidos primeiro", () => {
  // "bom" só aparece na empresa (campo secundário) do Bruno e do Carlos: no empate vale a ordem da lista
  assert.deepEqual(busca("bom").itens.map((l) => l.id), ["b", "c"]);
  const x = leadBase({ id: "x", nome: "Zeca", empresa: "Loja Bom Preço" });
  const y = leadBase({ id: "y", nome: "Bom Prato" });
  const r = filtrarLeads([x, y], new Map(), { ...max, busca: "bom" }, agora);
  assert.deepEqual(r.itens.map((l) => l.id), ["y", "x"]); // nome (principal) antes de empresa
  const fixa = filtrarLeads([x, y], new Map(), { ...max, busca: "bom" }, agora, { manterOrdem: true });
  assert.deepEqual(fixa.itens.map((l) => l.id), ["x", "y"]);
});

test("filtrarLeads: telefone com 4 dígitos ou mais entra como se tivesse batido todas as palavras", () => {
  const exato = busca("99999-1234");
  assert.deepEqual(exato.itens.map((l) => l.id), ["m"]); // o telefone da Maria (o texto não bate: modo "parecidos" vira "exato")
  assert.equal(exato.modo, "exato");
  assert.equal(exato.mensagem, null);
  // "1234" está no telefone da Maria e no nome do Carlos: o telefone vem primeiro, sem repetir
  assert.deepEqual(busca("1234").itens.map((l) => l.id), ["m", "c"]);
  assert.deepEqual(busca("5678").itens.map((l) => l.id), ["b"]);
  assert.equal(busca("5678").modo, "exato");
  assert.deepEqual(busca("(21) 98888").itens.map((l) => l.id), ["b"]);
  // com 3 dígitos o telefone não vale
  assert.equal(busca("567").modo, "nenhum");
  // telefone que bate não deixa o resultado virar "parecidos": só os leads do telefone e os que bateram tudo
  const misto = busca("bruno 5678");
  assert.equal(misto.modo, "exato");
  assert.deepEqual(misto.itens.map((l) => l.id), ["b"]);
  // sem acerto no telefone vale a busca normal
  const semTelefone = busca("bruno 0000");
  assert.equal(semTelefone.modo, "parecidos");
  assert.deepEqual(semTelefone.itens.map((l) => l.id), ["b"]);
});

test("filtrarLeads: telefone com manterOrdem junta os dois grupos na ordem da lista", () => {
  const r = busca("1234", { manterOrdem: true });
  assert.equal(r.modo, "exato");
  assert.deepEqual(r.itens.map((l) => l.id), ["m", "c"]);
  const invertida = filtrarLeads([carlos, maria], new Map(), { ...max, busca: "1234" }, agora, { manterOrdem: true });
  assert.deepEqual(invertida.itens.map((l) => l.id), ["c", "m"]);
  const comRelevancia = filtrarLeads([carlos, maria], new Map(), { ...max, busca: "1234" }, agora);
  assert.deepEqual(comRelevancia.itens.map((l) => l.id), ["m", "c"]); // telefone primeiro
});
