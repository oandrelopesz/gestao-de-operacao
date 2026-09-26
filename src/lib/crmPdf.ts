// PDF da exportação do CRM: capa com o resumo por coluna e, depois, uma ficha por lead (todos os campos
// preenchidos, na ordem do funil) com o histórico opcional. Sem dependências.
import type { ColunaCrm, EventoCrm, LeadCrm } from "./crmTipos.ts";
import { ordenarColunas } from "./crmColunas.ts";
import {
  CAMPOS_EXPORT, colunaDoLead, contextoDoLead, eventosPorLead, montarResumo, ordenarParaExport, ROTULO_EVENTO, textoCampo,
} from "./crmExport.ts";
import { textoDoValor } from "./planilha.ts";
import { formatarDataHora, formatarData } from "./crmFormato.ts";
import { DocumentoPdf, quebrarTexto, larguraTexto, type Cor } from "./exportPdf.ts";

export interface OpcoesPdfCrm {
  leads: LeadCrm[];
  colunas: ColunaCrm[];
  eventos: EventoCrm[];
  agora: Date;
  agencias: Map<string, string>;
  incluirHistorico: boolean;
  /** Descrição do que foi exportado ("Todos os leads", "Coluna Fechamento"…) */
  escopo: string;
}

const MARGEM = 40;
const TOPO = 48;
const RODAPE = 800;
const TEXTO: Cor = [0.1, 0.1, 0.12];
const APAGADO: Cor = [0.42, 0.45, 0.5];
const PRIMARIA: Cor = [0.15, 0.39, 0.92];
const BORDA: Cor = [0.86, 0.88, 0.91];
const FUNDO: Cor = [0.95, 0.96, 0.98];
const ESCURO: Cor = [0.12, 0.16, 0.23];
const BRANCO: Cor = [1, 1, 1];

function corHex(hex: string): Cor {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return APAGADO;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Escreve de cima para baixo, abrindo página nova quando falta espaço. */
class Escritor {
  y = TOPO;
  readonly larguraUtil: number;
  /** Chamado ao abrir página nova no meio de um grupo (repete o cabeçalho da coluna) */
  aoQuebrar: (() => void) | null = null;

  readonly doc: DocumentoPdf;

  constructor(doc: DocumentoPdf) {
    this.doc = doc;
    this.larguraUtil = doc.largura - MARGEM * 2;
    doc.novaPagina();
  }

  pagina(): void {
    this.doc.novaPagina();
    this.y = TOPO;
    this.aoQuebrar?.();
  }

  garantir(altura: number): void {
    if (this.y + altura > RODAPE) this.pagina();
  }

  linhas(texto: string, x: number, largura: number, tamanho: number, opc: { negrito?: boolean; cor?: Cor; entre?: number } = {}): void {
    const alturaLinha = tamanho * (opc.entre ?? 1.35);
    for (const l of quebrarTexto(texto, largura, tamanho, !!opc.negrito)) {
      this.garantir(alturaLinha);
      this.doc.texto(x, this.y + tamanho, l, tamanho, { negrito: opc.negrito, cor: opc.cor });
      this.y += alturaLinha;
    }
  }

  /** Rótulo à esquerda e valor à direita, os dois quebrando linha. */
  par(rotulo: string, valor: string): void {
    const tam = 8.5;
    const alt = tam * 1.4;
    const xValor = MARGEM + 158;
    const r = quebrarTexto(rotulo, 150, tam, false);
    const v = quebrarTexto(valor, this.larguraUtil - 158, tam, false);
    const n = Math.max(r.length, v.length);
    for (let i = 0; i < n; i++) {
      this.garantir(alt);
      if (r[i]) this.doc.texto(MARGEM + 8, this.y + tam, r[i], tam, { cor: APAGADO });
      if (v[i]) this.doc.texto(xValor, this.y + tam, v[i], tam, { cor: TEXTO });
      this.y += alt;
    }
  }
}

function capa(e: Escritor, o: OpcoesPdfCrm, total: number): void {
  const { doc } = e;
  doc.retangulo(0, 0, doc.largura, 110, ESCURO);
  doc.texto(MARGEM, 52, "CRM — exportação de leads", 22, { negrito: true, cor: BRANCO });
  doc.texto(MARGEM, 76, `${o.escopo} · ${total} ${total === 1 ? "lead" : "leads"}`, 11, { cor: [0.8, 0.84, 0.9] });
  doc.texto(MARGEM, 94, `Gerado em ${formatarData(o.agora)} às ${formatarDataHora(o.agora).slice(-5)} · histórico ${o.incluirHistorico ? "incluído" : "não incluído"}`, 9, { cor: [0.65, 0.7, 0.78] });
  e.y = 140;

  e.linhas("Resumo por coluna do funil", MARGEM, e.larguraUtil, 12, { negrito: true });
  e.y += 4;
  const resumo = montarResumo(o.leads, o.colunas);
  const xs = [MARGEM, MARGEM + 200, MARGEM + 320, MARGEM + 370, MARGEM + 445];
  const titulos = ["Coluna", "Tipo", "Leads", "Propostas", "Fechado"];
  doc.retangulo(MARGEM, e.y, e.larguraUtil, 18, FUNDO);
  titulos.forEach((t, i) => doc.texto(xs[i] + 6, e.y + 12, t, 8.5, { negrito: true, cor: APAGADO }));
  e.y += 18;
  const ordenadas = ordenarColunas(o.colunas);
  resumo.linhas.forEach((linha, idx) => {
    const ehTotal = idx === resumo.linhas.length - 1;
    e.garantir(17);
    const coluna = ordenadas[idx];
    if (coluna) doc.retangulo(xs[0] + 6, e.y + 5.5, 6, 6, corHex(coluna.hex));
    linha.forEach((v, i) => {
      const t = textoDoValor(v, "legivel");
      const x = i === 0 && coluna ? xs[0] + 17 : xs[i] + 6;
      const largura = i === 0 ? 180 : 110;
      let s = t;
      while (s.length > 3 && larguraTexto(s, 8.5, ehTotal) > largura) s = `${s.slice(0, -2)}…`;
      doc.texto(x, e.y + 11.5, s, 8.5, { negrito: ehTotal, cor: TEXTO });
    });
    e.y += 17;
    doc.linha(MARGEM, e.y, MARGEM + e.larguraUtil, e.y, BORDA, 0.5);
  });
  e.y += 18;
  e.linhas(
    "A seguir, uma ficha por lead, agrupadas na ordem do funil, com todos os campos preenchidos" +
      (o.incluirHistorico ? " e o histórico completo." : "."),
    MARGEM, e.larguraUtil, 9, { cor: APAGADO },
  );
}

function cabecalhoGrupo(e: Escritor, coluna: ColunaCrm | null, qtd: number, continuacao: boolean): void {
  const { doc } = e;
  doc.retangulo(MARGEM, e.y, e.larguraUtil, 22, coluna ? corHex(coluna.hex) : APAGADO);
  const titulo = `${coluna?.titulo ?? "Sem coluna"} · ${qtd} ${qtd === 1 ? "lead" : "leads"}${continuacao ? " (continuação)" : ""}`;
  doc.texto(MARGEM + 10, e.y + 15, titulo, 11, { negrito: true, cor: BRANCO });
  e.y += 32;
}

export function gerarPdfCrm(o: OpcoesPdfCrm): Uint8Array {
  const doc = new DocumentoPdf();
  const e = new Escritor(doc);
  const leads = ordenarParaExport(o.leads, o.colunas);
  capa(e, o, leads.length);

  const porLead = eventosPorLead(o.eventos);
  const secoes = [...new Set(CAMPOS_EXPORT.map((c) => c.secao))];
  let grupoAtual: string | null = null;

  for (const lead of leads) {
    const ctx = contextoDoLead(lead, o.colunas, porLead, o.agora, o.agencias);
    const coluna = colunaDoLead(lead, o.colunas);
    const idGrupo = coluna?.id ?? "";
    if (idGrupo !== grupoAtual) {
      grupoAtual = idGrupo;
      const qtd = leads.filter((l) => (colunaDoLead(l, o.colunas)?.id ?? "") === idGrupo).length;
      e.aoQuebrar = null;
      // Coluna nova continua na mesma página se ainda couber o cabeçalho e o começo de uma ficha
      if (e.doc.totalPaginas === 1 || e.y > RODAPE - 260) e.pagina();
      else e.y += 18;
      cabecalhoGrupo(e, coluna, qtd, false);
      e.aoQuebrar = () => cabecalhoGrupo(e, coluna, qtd, true);
    }

    // Título do lead (não deixa o nome sozinho no fim da página)
    e.garantir(70);
    const sub = [lead.empresa, lead.trafego === "pago" ? "Pago" : "Orgânico", lead.coluna_desde ? `na coluna desde ${formatarData(lead.coluna_desde)}` : null]
      .filter(Boolean)
      .join(" · ");
    e.linhas(lead.nome, MARGEM, e.larguraUtil, 13, { negrito: true, entre: 1.25 });
    e.linhas(sub, MARGEM, e.larguraUtil, 9, { cor: APAGADO });
    e.y += 4;

    for (const secao of secoes) {
      const campos = CAMPOS_EXPORT.filter((c) => c.secao === secao && c.titulo !== "Nome")
        .map((c) => [c.titulo, textoCampo(c, ctx)] as const)
        .filter(([, v]) => v !== "");
      if (!campos.length) continue;
      e.garantir(30);
      e.y += 3;
      e.linhas(secao.toUpperCase(), MARGEM, e.larguraUtil, 7.5, { negrito: true, cor: PRIMARIA });
      for (const [titulo, valor] of campos) e.par(titulo, valor);
    }

    if (o.incluirHistorico) {
      const evs = porLead.get(lead.id) ?? [];
      e.garantir(30);
      e.y += 3;
      e.linhas(`HISTÓRICO (${evs.length})`, MARGEM, e.larguraUtil, 7.5, { negrito: true, cor: PRIMARIA });
      if (!evs.length) e.linhas("Sem eventos registrados.", MARGEM + 8, e.larguraUtil - 8, 8.5, { cor: APAGADO });
      for (const ev of evs) {
        e.par(`${formatarData(ev.created_at)} ${formatarDataHora(ev.created_at).slice(-5)} · ${ROTULO_EVENTO[ev.tipo] ?? ev.tipo}`, ev.descricao);
      }
    }

    e.y += 8;
    e.garantir(12);
    doc.linha(MARGEM, e.y, MARGEM + e.larguraUtil, e.y, BORDA, 0.8);
    e.y += 14;
  }

  if (!leads.length) {
    e.y += 10;
    e.linhas("Nenhum lead neste recorte.", MARGEM, e.larguraUtil, 11, { cor: APAGADO });
  }

  // Rodapé com numeração em todas as páginas
  const total = doc.totalPaginas;
  for (let i = 0; i < total; i++) {
    doc.linha(MARGEM, 815, doc.largura - MARGEM, 815, BORDA, 0.5, i);
    doc.texto(MARGEM, 828, `Gestor Pro · CRM · ${o.escopo}`, 7.5, { cor: APAGADO }, i);
    const pag = `Página ${i + 1} de ${total}`;
    doc.texto(doc.largura - MARGEM - larguraTexto(pag, 7.5, false), 828, pag, 7.5, { cor: APAGADO }, i);
  }
  return doc.gerar(`CRM — ${o.escopo}`);
}
