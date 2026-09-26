process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMPOS_EXPORT, montarPlanilhaHistorico, montarPlanilhaLeads, montarResumo, nomeArquivo, ordenarParaExport,
} from "./crmExport.ts";
import { COLUNAS_PADRAO } from "./crmColunas.ts";
import { leadBase, type EventoCrm } from "./crmTipos.ts";
import { textoDoValor } from "./planilha.ts";
import { deSP } from "./crmFormato.ts";

const agora = deSP(2026, 9, 26, 15, 0);
const agencias = new Map([["effect", "Effect"]]);

const completo = leadBase({
  id: "L1", nome: "Ana Souza", empresa: "Loja X", nicho: "Moda", cidade: "Niterói/RJ", telefone: "21999998888",
  email: "ana@lojax.com", site: "https://lojax.com", instagram: "@lojax", google_meu_negocio: "https://g.page/lojax",
  faturamento_faixa: "30k_50k", investimento_faixa: "1k_3k", observacoes: "Quer escalar", agencia_destino: "effect",
  trafego: "pago", utm_source: "meta", utm_medium: "cpc", utm_campaign: "set26", utm_content: "video1", utm_term: "loja",
  fbclid: "fb123", gclid: "g456", pagina_entrada: "https://lp.com", referencia: "instagram.com",
  coluna_id: "reuniao_marcada", coluna_desde: deSP(2026, 9, 24, 15).toISOString(), follow_up: 3,
  reuniao_em: deSP(2026, 9, 29, 16).toISOString(), reuniao_duracao_min: 45, reuniao_marcada_em: deSP(2026, 9, 24, 15).toISOString(),
  evento_google_id: "ev1", evento_meet_link: "https://meet.google.com/abc", evento_status: "ok",
  pontos_contato: { ref: deSP(2026, 9, 29, 16).toISOString(), marcada_em: deSP(2026, 9, 24, 15).toISOString(), feitos: { "1": agora.toISOString() } },
  valor_proposta: 2500, primeiro_contato_em: deSP(2026, 9, 20, 12).toISOString(),
  primeira_reuniao_marcada_em: deSP(2026, 9, 24, 15).toISOString(), follow_ups_ate_reuniao: 3,
  created_at: deSP(2026, 9, 20, 10).toISOString(), updated_at: agora.toISOString(),
});

const eventos: EventoCrm[] = [
  { id: "e2", lead_id: "L1", tipo: "nota", descricao: "Ligar depois do almoço", dados: {}, created_at: deSP(2026, 9, 25, 13).toISOString() },
  { id: "e1", lead_id: "L1", tipo: "mudanca_coluna", descricao: "Novo lead → Primeiro contato", dados: {}, created_at: deSP(2026, 9, 20, 12).toISOString() },
];

const valorDe = (titulo: string) => {
  const { planilha } = montarPlanilhaLeads([completo], COLUNAS_PADRAO, eventos, agora, agencias);
  const i = planilha.cabecalho.findIndex((c) => c.titulo === titulo);
  assert.ok(i >= 0, `coluna "${titulo}" não existe`);
  return textoDoValor(planilha.linhas[0][i], "legivel");
};

test("todos os campos do lead saem, com títulos únicos", () => {
  const titulos = CAMPOS_EXPORT.map((c) => c.titulo);
  assert.equal(new Set(titulos).size, titulos.length);
  assert.ok(titulos.length >= 60);
  const { planilha } = montarPlanilhaLeads([completo], COLUNAS_PADRAO, eventos, agora, agencias);
  assert.equal(planilha.cabecalho.length, titulos.length);
  assert.equal(planilha.linhas[0].length, titulos.length);
});

test("dados, etapa e reunião em texto legível", () => {
  assert.equal(valorDe("Nome"), "Ana Souza");
  assert.equal(valorDe("Etiqueta"), "Pago");
  assert.equal(valorDe("Coluna atual"), "Reunião marcada");
  assert.equal(valorDe("Tipo da coluna"), "Reunião marcada");
  assert.equal(valorDe("Posição no funil"), "6 de 14");
  assert.equal(valorDe("Dias na coluna"), "2");
  assert.equal(valorDe("Faturamento mensal"), "R$ 30 a 50 mil");
  assert.equal(valorDe("Agência de destino"), "Effect");
  assert.equal(valorDe("Reunião"), "29/09/2026 às 16:00");
  assert.equal(valorDe("Duração da reunião (min)"), "45");
  assert.equal(valorDe("Período da call"), "Fim do dia");
  assert.equal(valorDe("Evento na agenda"), "Criado na agenda");
  assert.equal(valorDe("Pontos de contato feitos"), "1");
  assert.equal(valorDe("Valor da proposta"), "R$ 2.500,00");
  assert.equal(valorDe("WhatsApp"), "https://api.whatsapp.com/send?phone=5521999998888");
  assert.equal(valorDe("utm_campaign"), "set26");
  assert.equal(valorDe("Horas até o 1º contato"), "2,0");
  assert.equal(valorDe("Notas"), "25/09/2026 às 13:00 — Ligar depois do almoço");
  assert.equal(valorDe("Eventos no histórico"), "2");
});

test("ordem de exportação segue o funil", () => {
  const a = leadBase({ id: "a", coluna_id: "fechamento" });
  const b = leadBase({ id: "b", coluna_id: "novo_lead" });
  const c = leadBase({ id: "c", coluna_id: null });
  assert.deepEqual(ordenarParaExport([a, b, c], COLUNAS_PADRAO).map((l) => l.id), ["b", "c", "a"]);
});

test("histórico e resumo por coluna", () => {
  const h = montarPlanilhaHistorico([completo], eventos, COLUNAS_PADRAO);
  assert.deepEqual(h.cabecalho.map((c) => c.titulo), ["Lead", "Empresa", "Coluna atual", "Data", "Tipo", "Descrição"]);
  assert.equal(h.linhas.length, 2);
  assert.equal(textoDoValor(h.linhas[0][4], "legivel"), "Mudança de coluna");
  const r = montarResumo([completo, leadBase({ coluna_id: "fechamento", valor_fechamento: 1000 })], COLUNAS_PADRAO);
  const linha = (titulo: string) => r.linhas.find((l) => textoDoValor(l[0], "legivel") === titulo)!;
  assert.equal(textoDoValor(linha("Reunião marcada")[2], "legivel"), "1");
  assert.equal(textoDoValor(linha("Fechamento")[4], "legivel"), "R$ 1.000,00");
  assert.equal(textoDoValor(r.linhas[r.linhas.length - 1][0], "legivel"), "Total");
});

test("nome do arquivo", () => {
  assert.equal(nomeArquivo("Reunião marcada", "xlsx", agora), "crm-leads-reuniao-marcada-2026-09-26.xlsx");
  assert.equal(nomeArquivo("todos", "csv", agora), "crm-leads-todos-2026-09-26.csv");
});
