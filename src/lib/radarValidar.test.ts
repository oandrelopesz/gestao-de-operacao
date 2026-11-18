import test from "node:test";
import assert from "node:assert/strict";
import { TEMAS_RADAR, validarEnvelope } from "../../supabase/functions/radar/validar.ts";

const achado = () => ({
  id: "RAD-20261117-004",
  versao: 2,
  titulo: "Vercel remove em 30/11 as Deployment Checks nativas de lint e typecheck",
  classe: "bom",
  tipo: "B",
  tipo_motivo: "descontinuação oficial com prazo",
  alerta: false,
  temas: ["software_saas"],
  confianca: "alta",
  estagio: "ferramenta utilizável",
  prontidao: "precisa preparar/integrar",
  publicacao: "2026-11-17",
  primeira_descoberta: "2026-11-17T20:15:00-03:00",
  atualizacao: null,
  corpo: {
    tema_tipo: "SaaS/infra",
    explicando_facil: { o_que_e: ["Lint: revisor automático."], como_te_afeta: "x", exemplo: "y" },
    aplicacoes: [],
    lancamento: null,
    proximos_passos: ["a", "b"],
  },
  links: [
    { tipo: "descoberta", url: "https://vercel.com/changelog/native-lint-and-typecheck-deployment-checks-are-being-deprecated" },
    { tipo: "evidencia", url: "https://vercel.com/docs/deployment-checks" },
  ],
  post_x_url: null,
  link_citado_x_url: null,
  texto_whatsapp: "🟢 BOM *RAD-20261117-004 — Vercel remove em 30/11…*",
  enviado_em: "2026-11-17T21:04:00-03:00",
});

const boletim = () => ({
  schema_versao: 1,
  tipo: "boletim",
  edicao_id: "DIA-20261117",
  revisao: "R1",
  ocorrido_em: "2026-11-17T21:03:00-03:00",
  dia: {
    abertura_texto: "🔵 *Radar IA | Boletim*",
    fora: [{ id: "RAD-20261117-003", motivo: "falta documentação oficial do Google" }],
    cobertura_parcial: "3 achados elegíveis.",
  },
  achados: [achado()],
});

const caminhos = (r: ReturnType<typeof validarEnvelope>) => r.campos.map((c) => c.caminho);

test("TEMAS_RADAR tem os 8 slugs", () => {
  assert.equal(TEMAS_RADAR.length, 8);
  assert.ok(TEMAS_RADAR.includes("conteudo_social"));
});

test("envelope válido do exemplo da especificação passa", () => {
  const r = validarEnvelope(boletim());
  assert.deepEqual(r.campos, []);
  assert.deepEqual(r.avisos, []);
  assert.equal(r.ok, true);
});

test("corpo que não é objeto falha", () => {
  assert.equal(validarEnvelope(null).ok, false);
  assert.equal(validarEnvelope([]).ok, false);
});

test("tema fora da lista", () => {
  const e = boletim(); e.achados[0].temas = ["futebol"];
  const r = validarEnvelope(e);
  assert.equal(r.ok, false);
  assert.ok(caminhos(r).includes("achados[0].temas[0]") || caminhos(r).includes("achados[0].temas"));
});

test("4 temas", () => {
  const e = boletim(); e.achados[0].temas = ["ia", "marketing", "branding", "performance"];
  assert.ok(caminhos(validarEnvelope(e)).includes("achados[0].temas"));
});

test("tema repetido", () => {
  const e = boletim(); e.achados[0].temas = ["ia", "ia"];
  assert.ok(caminhos(validarEnvelope(e)).includes("achados[0].temas"));
});

test("ID ruim", () => {
  const e = boletim(); e.achados[0].id = "RAD-2026-4";
  assert.ok(caminhos(validarEnvelope(e)).includes("achados[0].id"));
});

test("URL javascript: é recusada", () => {
  const e = boletim(); e.achados[0].links[0].url = "javascript:alert(1)";
  const r = validarEnvelope(e);
  assert.equal(r.ok, false);
  assert.ok(caminhos(r).includes("achados[0].links[0].url"));
});

test("data sem offset", () => {
  const e = boletim(); e.ocorrido_em = "2026-11-17T21:03:00";
  assert.ok(caminhos(validarEnvelope(e)).includes("ocorrido_em"));
  const f = boletim(); f.achados[0].primeira_descoberta = "2026-11-17T20:15:00";
  assert.ok(caminhos(validarEnvelope(f)).includes("achados[0].primeira_descoberta"));
});

test("21 achados", () => {
  const e = boletim(); e.achados = Array.from({ length: 21 }, achado);
  assert.ok(caminhos(validarEnvelope(e)).includes("achados"));
  e.achados = Array.from({ length: 20 }, achado);
  assert.equal(validarEnvelope(e).ok, true);
});

test("alerta sem achado com alerta true", () => {
  const e: any = boletim(); e.tipo = "alerta";
  assert.equal(validarEnvelope(e).ok, false);
  e.achados[0].alerta = true;
  assert.equal(validarEnvelope(e).ok, true);
});

test("correcao sem objeto correcao", () => {
  const e: any = boletim(); e.tipo = "correcao";
  assert.ok(caminhos(validarEnvelope(e)).includes("correcao"));
  e.correcao = { achado_id: "RAD-20261117-004", afirmacao_anterior: "a", dado_correto: "b", motivo: "c", fontes: ["https://x.com/a"], texto_whatsapp: "t" };
  assert.equal(validarEnvelope(e).ok, true);
});

test("resposta e encerramento exigem seus campos", () => {
  const e: any = { schema_versao: 1, tipo: "resposta", edicao_id: "DIA-20261117", ocorrido_em: "2026-11-17T21:03:00Z" };
  assert.ok(caminhos(validarEnvelope(e)).includes("resposta"));
  e.resposta = { pergunta: "p", referencia: null, texto_whatsapp: "t", fontes: [] };
  assert.equal(validarEnvelope(e).ok, true);
  const f: any = { schema_versao: 1, tipo: "encerramento", edicao_id: "DIA-20261117", ocorrido_em: "2026-11-17T21:03:00Z" };
  assert.ok(caminhos(validarEnvelope(f)).includes("dia.encerramento_texto"));
  f.dia = { encerramento_texto: "fim" };
  assert.equal(validarEnvelope(f).ok, true);
});

test("campo desconhecido vira aviso, não erro", () => {
  const e: any = boletim(); e.achados[0].xyz = 1; e.extra = true;
  const r = validarEnvelope(e);
  assert.equal(r.ok, true);
  assert.ok(r.avisos.includes("campo desconhecido: achados[0].xyz"));
  assert.ok(r.avisos.includes("campo desconhecido: extra"));
});

test("edicao_id DIA-20261332 inválido", () => {
  const e = boletim(); e.edicao_id = "DIA-20261332";
  assert.ok(caminhos(validarEnvelope(e)).includes("edicao_id"));
});
