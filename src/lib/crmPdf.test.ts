process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import { gerarPdfCrm } from "./crmPdf.ts";
import { COLUNAS_PADRAO } from "./crmColunas.ts";
import { leadBase, type EventoCrm } from "./crmTipos.ts";
import { paraWinAnsi } from "./exportPdf.ts";
import { deSP } from "./crmFormato.ts";

const texto = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");
const hex = (s: string) => Array.from(paraWinAnsi(s), (x) => x.toString(16).padStart(2, "0").toUpperCase()).join("");
const agora = deSP(2026, 9, 26, 15, 0);

test("PDF do CRM: capa, uma ficha por lead agrupada por coluna e histórico", () => {
  const leads = [
    leadBase({ id: "a", nome: "Ana Souza", empresa: "Loja X", coluna_id: "fechamento", valor_fechamento: 1500, email: "ana@x.com" }),
    leadBase({ id: "b", nome: "Bruno Lima", coluna_id: "novo_lead", observacoes: "Descrição longa ".repeat(40) }),
  ];
  const eventos: EventoCrm[] = [{ id: "e", lead_id: "a", tipo: "ganho", descricao: "Fechado: R$ 1.500,00", dados: {}, created_at: agora.toISOString() }];
  const s = texto(gerarPdfCrm({ leads, colunas: COLUNAS_PADRAO, eventos, agora, agencias: new Map(), incluirHistorico: true, escopo: "Todos os leads" }));
  const paginas = Number(/\/Count (\d+)/.exec(s)![1]);
  assert.ok(paginas >= 3, `esperava capa + 2 grupos, veio ${paginas}`);
  for (const t of ["Ana Souza", "Bruno Lima", "Fechamento · 1 lead", "Novo lead · 1 lead", "Resumo por coluna do funil", "HISTÓRICO (1)", "Fechado: R$ 1.500,00", "ana@x.com", `Página 1 de ${paginas}`]) {
    assert.ok(s.includes(hex(t)), `faltou "${t}"`);
  }
  // Bruno (Novo lead) vem antes da Ana (Fechamento): ordem do funil
  assert.ok(s.indexOf(hex("Bruno Lima")) < s.indexOf(hex("Ana Souza")));
});

test("PDF sem histórico e sem leads", () => {
  const s = texto(gerarPdfCrm({ leads: [], colunas: COLUNAS_PADRAO, eventos: [], agora, agencias: new Map(), incluirHistorico: false, escopo: "Coluna Remarcar reunião" }));
  assert.ok(s.includes(hex("Nenhum lead neste recorte.")));
  assert.ok(!s.includes(hex("HISTÓRICO")));
});
