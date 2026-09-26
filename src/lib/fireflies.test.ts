// O fuso da máquina não pode mudar nada: datas e horários da aba são sempre os de Brasília
process.env.TZ = "Asia/Tokyo";
import test from "node:test";
import assert from "node:assert/strict";
import {
  tituloExibido, situacao, dataCurta, horario, duracaoTexto, nomeArquivo, filtrar, ordenar, normalizarReuniao,
  caminhoArquivo, arquivoDisponivel, precisaAtualizar, linkFireflies, resumoParticipantes, mensagemErroFireflies,
  intervaloAtualizacao, chaveArquivo,
} from "./fireflies.ts";
import type { ReuniaoFireflies } from "./fireflies.ts";

const base: ReuniaoFireflies = {
  id: "abc123",
  titulo: "Reunião de alinhamento",
  titulo_pendente: null,
  excluir: false,
  data_hora: "2026-09-25T17:00:00Z", // 14:00 em Brasília
  duracao_min: 45,
  participantes: ["joao@cliente.com", "Maria Conceição"],
  organizador: "contato@andrelopes.digital",
  link_meet: "https://meet.google.com/abc-defg-hij",
  link_fireflies: "https://app.fireflies.ai/view/abc123",
  arquivos: {
    transcricao_pdf: "abc123/transcricao.pdf",
    transcricao_docx: "abc123/transcricao.docx",
    resumo_pdf: "abc123/resumo.pdf",
    resumo_docx: "abc123/resumo.docx",
  },
  status: "pronto",
  erro: null,
  created_at: "2026-09-25T18:00:00Z",
  updated_at: "2026-09-25T18:00:00Z",
};
const r = (patch: Partial<ReuniaoFireflies>): ReuniaoFireflies => ({ ...base, ...patch });

test("tituloExibido: o nome pedido na aba aparece antes de o Fireflies confirmar", () => {
  assert.equal(tituloExibido(base), "Reunião de alinhamento");
  assert.equal(tituloExibido(r({ titulo_pendente: "Kickoff Cliente X" })), "Kickoff Cliente X");
  assert.equal(tituloExibido(r({ titulo_pendente: "   " })), "Reunião de alinhamento");
  assert.equal(tituloExibido(r({ titulo: "  " })), "Sem título");
});

test("situacao: excluir vence tudo; depois importando/erro; depois renomeando", () => {
  assert.equal(situacao(base), "pronto");
  assert.equal(situacao(r({ titulo_pendente: "Novo nome" })), "renomeando");
  assert.equal(situacao(r({ status: "importando", titulo_pendente: "Novo nome" })), "importando");
  assert.equal(situacao(r({ status: "erro", titulo_pendente: "Novo nome" })), "erro");
  assert.equal(situacao(r({ excluir: true, status: "importando", titulo_pendente: "X" })), "excluindo");
  assert.equal(situacao(r({ excluir: true, status: "erro" })), "excluindo");
});

test("dataCurta: dd/mm/aaaa no dia de Brasília", () => {
  assert.equal(dataCurta("2026-09-25T17:00:00Z"), "25/09/2026");
  // 23:30 do dia 25 em Brasília (já é dia 26 em UTC e em Tóquio)
  assert.equal(dataCurta("2026-09-26T02:30:00Z"), "25/09/2026");
  assert.equal(dataCurta(null), "");
  assert.equal(dataCurta("lixo"), "");
});

test("horario: início–fim em Brasília (fim = início + duração)", () => {
  assert.equal(horario("2026-09-25T17:00:00Z", 45), "14:00–14:45");
  assert.equal(horario("2026-09-25T17:00:00Z", 80), "14:00–15:20");
  assert.equal(horario("2026-09-25T17:00:00Z", 44.6), "14:00–14:45");
  assert.equal(horario("2026-09-26T02:50:00Z", 20), "23:50–00:10");
  assert.equal(horario("2026-09-25T12:05:00Z", null), "09:05");
  assert.equal(horario("2026-09-25T12:05:00Z", 0), "09:05");
  assert.equal(horario(null, 30), "");
  assert.equal(horario("lixo", 30), "");
});

test("duracaoTexto: minutos e horas", () => {
  assert.equal(duracaoTexto(45), "45 min");
  assert.equal(duracaoTexto(44.6), "45 min");
  assert.equal(duracaoTexto(80), "1 h 20 min");
  assert.equal(duracaoTexto(60), "1 h");
  assert.equal(duracaoTexto(125.4), "2 h 5 min");
  assert.equal(duracaoTexto(0.3), "< 1 min");
  assert.equal(duracaoTexto(0), "");
  assert.equal(duracaoTexto(null), "");
});

test("nomeArquivo: título, data e hora de Brasília e o tipo", () => {
  assert.equal(nomeArquivo(base, "transcricao", "pdf"), "Reunião de alinhamento — 25-09-2026 14-00 — Transcrição.pdf");
  assert.equal(nomeArquivo(base, "resumo", "docx"), "Reunião de alinhamento — 25-09-2026 14-00 — Resumo.docx");
  assert.equal(nomeArquivo(r({ data_hora: null }), "resumo", "pdf"), "Reunião de alinhamento — Resumo.pdf");
  // O nome pedido na aba já vale para o download
  assert.equal(nomeArquivo(r({ titulo_pendente: "Kickoff" }), "resumo", "pdf"), "Kickoff — 25-09-2026 14-00 — Resumo.pdf");
});

test("nomeArquivo: troca os caracteres que o Windows/Mac não aceitam em nome de arquivo", () => {
  assert.equal(
    nomeArquivo(r({ titulo: 'Cliente/X: "plano" <v2>? a|b\\c*' }), "transcricao", "pdf"),
    "Cliente-X - 'plano' v2 a-b-c — 25-09-2026 14-00 — Transcrição.pdf",
  );
  assert.equal(nomeArquivo(r({ titulo: "Reunião...  " }), "resumo", "pdf"), "Reunião — 25-09-2026 14-00 — Resumo.pdf");
  assert.equal(nomeArquivo(r({ titulo: '???' }), "resumo", "pdf"), "Reunião — 25-09-2026 14-00 — Resumo.pdf");
  const longo = nomeArquivo(r({ titulo: "a".repeat(300) }), "resumo", "pdf");
  assert.ok(longo.length < 200);
});

test("filtrar: sem acento e sem maiúscula, no título e nos participantes (todas as palavras)", () => {
  const lista = [
    r({ id: "1", titulo: "Alinhamento semanal", participantes: ["joao@cliente.com"] }),
    r({ id: "2", titulo: "Kickoff Açaí da Serra", participantes: ["Maria Conceição"] }),
    r({ id: "3", titulo: "Reunião X", titulo_pendente: "Onboarding Pizzaria", participantes: [] }),
  ];
  assert.deepEqual(filtrar(lista, "").map((x) => x.id), ["1", "2", "3"]);
  assert.deepEqual(filtrar(lista, "  ").map((x) => x.id), ["1", "2", "3"]);
  assert.deepEqual(filtrar(lista, "ACAI").map((x) => x.id), ["2"]);
  assert.deepEqual(filtrar(lista, "conceicao").map((x) => x.id), ["2"]);
  assert.deepEqual(filtrar(lista, "cliente.com").map((x) => x.id), ["1"]);
  assert.deepEqual(filtrar(lista, "kickoff maria").map((x) => x.id), ["2"]);
  assert.deepEqual(filtrar(lista, "kickoff joao").map((x) => x.id), []);
  assert.deepEqual(filtrar(lista, "pizzaria").map((x) => x.id), ["3"]);
});

test("ordenar: mais recente primeiro, sem data no fim, sem mexer na lista original", () => {
  const lista = [
    r({ id: "a", data_hora: "2026-09-20T12:00:00Z" }),
    r({ id: "b", data_hora: null, created_at: "2026-09-26T10:00:00Z" }),
    r({ id: "c", data_hora: "2026-09-25T12:00:00Z" }),
    r({ id: "d", data_hora: null, created_at: "2026-09-26T11:00:00Z" }),
  ];
  assert.deepEqual(ordenar(lista).map((x) => x.id), ["c", "a", "d", "b"]);
  assert.deepEqual(lista.map((x) => x.id), ["a", "b", "c", "d"]);
});

test("normalizarReuniao: aguenta colunas vazias ou em formato inesperado", () => {
  const n = normalizarReuniao({
    id: "zz", titulo: null, titulo_pendente: "", excluir: null, data_hora: null, duracao_min: "12.5",
    participantes: null, organizador: null, link_meet: null, link_fireflies: null,
    arquivos: { transcricao_pdf: "zz/transcricao.pdf", resumo_pdf: "", lixo: "x", resumo_docx: 3 },
    status: "desconhecido", erro: null, created_at: "2026-09-25T18:00:00Z", updated_at: "2026-09-25T18:00:00Z",
  });
  assert.equal(n.titulo, "");
  assert.equal(n.titulo_pendente, null);
  assert.equal(n.excluir, false);
  assert.equal(n.duracao_min, 12.5);
  assert.deepEqual(n.participantes, []);
  assert.deepEqual(n.arquivos, { transcricao_pdf: "zz/transcricao.pdf" });
  assert.equal(n.status, "pronto");
  assert.deepEqual(normalizarReuniao({ id: "y", arquivos: "[]", status: "erro" }).arquivos, {});
  assert.equal(normalizarReuniao({ id: "y", status: "importando" }).status, "importando");
  assert.equal(normalizarReuniao({ id: "y", duracao_min: null }).duracao_min, null);
});

test("caminhoArquivo e arquivoDisponivel: só com o caminho, pronto e sem exclusão pedida", () => {
  assert.equal(caminhoArquivo(base, "transcricao", "pdf"), "abc123/transcricao.pdf");
  assert.equal(caminhoArquivo(base, "resumo", "docx"), "abc123/resumo.docx");
  assert.equal(caminhoArquivo(r({ arquivos: {} }), "resumo", "docx"), null);
  assert.equal(arquivoDisponivel(base, "resumo", "pdf"), true);
  assert.equal(arquivoDisponivel(r({ titulo_pendente: "Novo" }), "resumo", "pdf"), true);
  assert.equal(arquivoDisponivel(r({ arquivos: { resumo_docx: "x" } }), "resumo", "pdf"), false);
  assert.equal(arquivoDisponivel(r({ status: "importando" }), "resumo", "pdf"), false);
  assert.equal(arquivoDisponivel(r({ status: "erro" }), "resumo", "pdf"), false);
  assert.equal(arquivoDisponivel(r({ excluir: true }), "resumo", "pdf"), false);
});

test("precisaAtualizar: só enquanto algo está importando, renomeando ou excluindo", () => {
  assert.equal(precisaAtualizar([]), false);
  assert.equal(precisaAtualizar([base, r({ status: "erro" })]), false);
  assert.equal(precisaAtualizar([base, r({ status: "importando" })]), true);
  assert.equal(precisaAtualizar([base, r({ titulo_pendente: "Novo" })]), true);
  assert.equal(precisaAtualizar([base, r({ excluir: true })]), true);
});

test("linkFireflies: o link gravado ou o endereço padrão pelo id", () => {
  assert.equal(linkFireflies(base), "https://app.fireflies.ai/view/abc123");
  assert.equal(linkFireflies(r({ link_fireflies: null, id: "q9" })), "https://app.fireflies.ai/view/q9");
});

test("resumoParticipantes: os primeiros e quantos sobram (sem repetidos nem vazios)", () => {
  assert.deepEqual(resumoParticipantes(["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"], 3), {
    visiveis: ["a@x.com", "b@x.com", "c@x.com"], resto: 2,
  });
  assert.deepEqual(resumoParticipantes([" a@x.com ", "A@x.com", "", "b@x.com"], 3), { visiveis: ["a@x.com", "b@x.com"], resto: 0 });
  assert.deepEqual(resumoParticipantes([], 3), { visiveis: [], resto: 0 });
});

test("mensagemErroFireflies: tabela/bucket que ainda não existem viram aviso amigável", () => {
  assert.match(mensagemErroFireflies({ message: 'relation "public.fireflies_reunioes" does not exist' }), /ainda não/);
  assert.match(mensagemErroFireflies({ message: "Could not find the table 'public.fireflies_reunioes' in the schema cache" }), /ainda não/);
  assert.match(mensagemErroFireflies(new Error("Bucket not found")), /armazenamento/i);
  assert.match(mensagemErroFireflies({ message: "Object not found" }), /arquivo/i);
  assert.match(mensagemErroFireflies(new TypeError("Failed to fetch")), /conexão/i);
  // O Storage às vezes devolve o erro do download sem texto nenhum
  assert.match(mensagemErroFireflies({ message: "{}" }), /baixar/);
  assert.equal(mensagemErroFireflies(new Error("outra coisa")), "outra coisa");
  assert.equal(mensagemErroFireflies(null), "Erro desconhecido");
});

test("intervaloAtualizacao: 3 s enquanto renomeia/exclui (o usuário espera ver), 15 s importando, nada parado", () => {
  assert.equal(intervaloAtualizacao([]), null);
  assert.equal(intervaloAtualizacao([base, r({ status: "erro" })]), null);
  assert.equal(intervaloAtualizacao([base, r({ status: "importando" })]), 15_000);
  assert.equal(intervaloAtualizacao([base, r({ titulo_pendente: "Novo" })]), 3_000);
  assert.equal(intervaloAtualizacao([r({ status: "importando" }), r({ excluir: true })]), 3_000);
});

test("chaveArquivo: muda quando a linha é atualizada (arquivos gerados de novo ao renomear)", () => {
  const a = chaveArquivo(r({ updated_at: "2026-09-26T04:00:00Z" }), "resumo", "pdf");
  const b = chaveArquivo(r({ updated_at: "2026-09-26T04:05:00Z" }), "resumo", "pdf");
  assert.equal(a, "abc123/resumo.pdf|2026-09-26T04:00:00Z");
  assert.notEqual(a, b);
  assert.equal(chaveArquivo(r({ arquivos: {} }), "resumo", "pdf"), null);
});
