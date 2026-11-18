// Validação do envelope de ingestão do Radar IA (spec 5.3 e 5.5). Módulo puro: sem Deno, sem imports.

export const TEMAS_RADAR = [
  "marketing", "branding", "performance", "ia", "software_saas", "dados_mensuracao", "ciberseguranca", "conteudo_social",
] as const;

type Campo = { caminho: string; problema: string };
type Resultado = { ok: boolean; campos: Campo[]; avisos: string[] };

const RE_EDICAO = /^DIA-(\d{4})(\d{2})(\d{2})$/;
const RE_RAD = /^RAD-\d{8}-\d{3}$/;
const RE_ISO_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const TIPOS_ENVELOPE = ["boletim", "alerta", "correcao", "resposta", "encerramento"];

const ENVELOPE_CONHECIDOS = ["schema_versao", "tipo", "edicao_id", "revisao", "ocorrido_em", "dia", "achados", "correcao", "resposta"];
const DIA_CONHECIDOS = ["abertura_texto", "fora", "cobertura_parcial", "encerramento_texto"];
const ACHADO_CONHECIDOS = [
  "id", "versao", "titulo", "classe", "tipo", "tipo_motivo", "alerta", "temas", "confianca", "estagio", "prontidao", "publicacao",
  "primeira_descoberta", "atualizacao", "corpo", "links", "post_x_url", "link_citado_x_url", "texto_whatsapp", "enviado_em",
];
const CORRECAO_CONHECIDOS = ["achado_id", "afirmacao_anterior", "dado_correto", "motivo", "fontes", "texto_whatsapp"];
const RESPOSTA_CONHECIDOS = ["pergunta", "referencia", "texto_whatsapp", "fontes"];

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ehTexto = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

function dataValida(a: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isoComOffset(v: unknown): boolean {
  if (typeof v !== "string" || !RE_ISO_OFFSET.test(v)) return false;
  return dataValida(+v.slice(0, 4), +v.slice(5, 7), +v.slice(8, 10)) && !Number.isNaN(Date.parse(v));
}

function urlHttp(v: unknown): boolean {
  if (typeof v !== "string" || v.length === 0 || v.length > 2000) return false;
  try {
    const p = new URL(v).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

export function validarEnvelope(corpo: unknown): Resultado {
  const campos: Campo[] = [];
  const avisos: string[] = [];
  const erro = (caminho: string, problema: string) => campos.push({ caminho, problema });
  const desconhecidos = (o: Record<string, unknown>, conhecidos: string[], prefixo: string) => {
    for (const k of Object.keys(o)) if (!conhecidos.includes(k)) avisos.push(`campo desconhecido: ${prefixo}${k}`);
  };
  // string ou null (campos conhecidos opcionais, checagem frouxa)
  const textoOuNulo = (o: Record<string, unknown>, k: string, caminho: string) => {
    if (o[k] !== undefined && o[k] !== null && typeof o[k] !== "string") erro(caminho, "deve ser texto ou null");
  };
  const fontesOk = (v: unknown, caminho: string) => {
    if (!Array.isArray(v)) return erro(caminho, "deve ser uma lista de URLs");
    v.forEach((u, i) => { if (!urlHttp(u)) erro(`${caminho}[${i}]`, "URL inválida (só http/https, até 2000 caracteres)"); });
  };

  if (!ehObjeto(corpo)) {
    erro("", "o envelope deve ser um objeto JSON");
    return { ok: false, campos, avisos };
  }
  const e = corpo;
  desconhecidos(e, ENVELOPE_CONHECIDOS, "");

  if (e.schema_versao !== 1) erro("schema_versao", "deve ser 1");
  const tipo = e.tipo;
  if (typeof tipo !== "string" || !TIPOS_ENVELOPE.includes(tipo)) erro("tipo", `deve ser um de: ${TIPOS_ENVELOPE.join(", ")}`);

  const m = typeof e.edicao_id === "string" ? RE_EDICAO.exec(e.edicao_id) : null;
  if (!m) erro("edicao_id", "formato esperado DIA-AAAAMMDD");
  else if (!dataValida(+m[1], +m[2], +m[3])) erro("edicao_id", "data inexistente no calendário");

  if (e.revisao !== undefined && e.revisao !== null && !(typeof e.revisao === "string" && /^R\d+$/.test(e.revisao))) erro("revisao", "formato esperado R1, R2…");
  if (!isoComOffset(e.ocorrido_em)) erro("ocorrido_em", "data ISO com fuso (Z ou ±hh:mm) obrigatória");

  // dia
  let dia: Record<string, unknown> = {};
  if (e.dia !== undefined && e.dia !== null) {
    if (!ehObjeto(e.dia)) erro("dia", "deve ser um objeto");
    else {
      dia = e.dia;
      desconhecidos(dia, DIA_CONHECIDOS, "dia.");
      textoOuNulo(dia, "abertura_texto", "dia.abertura_texto");
      textoOuNulo(dia, "cobertura_parcial", "dia.cobertura_parcial");
      textoOuNulo(dia, "encerramento_texto", "dia.encerramento_texto");
      if (dia.fora !== undefined && dia.fora !== null) {
        if (!Array.isArray(dia.fora)) erro("dia.fora", "deve ser uma lista");
        else dia.fora.forEach((f, i) => {
          if (!ehObjeto(f)) return erro(`dia.fora[${i}]`, "deve ser um objeto { id, motivo }");
          if (typeof f.id !== "string" || !RE_RAD.test(f.id)) erro(`dia.fora[${i}].id`, "formato esperado RAD-AAAAMMDD-NNN");
          if (!ehTexto(f.motivo)) erro(`dia.fora[${i}].motivo`, "texto obrigatório");
        });
      }
    }
  }
  if (tipo === "encerramento" && !ehTexto(dia.encerramento_texto)) erro("dia.encerramento_texto", "texto obrigatório no encerramento");

  // achados
  let achados: unknown[] = [];
  if (e.achados !== undefined && e.achados !== null) {
    if (!Array.isArray(e.achados)) erro("achados", "deve ser uma lista");
    else achados = e.achados;
  }
  const n = achados.length;
  if (tipo === "boletim" && n > 20) erro("achados", "no máximo 20 achados por envio");
  if (tipo === "alerta" && n !== 1) erro("achados", "o alerta deve ter exatamente 1 achado");
  if (tipo === "correcao" && n > 1) erro("achados", "a correção aceita 0 ou 1 achado");
  if ((tipo === "resposta" || tipo === "encerramento") && n > 0) erro("achados", `o tipo ${tipo} não leva achados`);
  if (tipo === "alerta" && n === 1 && ehObjeto(achados[0]) && achados[0].alerta !== true) erro("achados[0].alerta", "o achado do alerta deve ter alerta true");

  achados.forEach((a, i) => {
    const p = `achados[${i}]`;
    if (!ehObjeto(a)) return erro(p, "deve ser um objeto");
    desconhecidos(a, ACHADO_CONHECIDOS, `${p}.`);
    if (typeof a.id !== "string" || !RE_RAD.test(a.id)) erro(`${p}.id`, "formato esperado RAD-AAAAMMDD-NNN");
    if (!Number.isInteger(a.versao) || (a.versao as number) < 1) erro(`${p}.versao`, "deve ser inteiro maior ou igual a 1");
    if (typeof a.titulo !== "string" || a.titulo.length < 1 || a.titulo.length > 300) erro(`${p}.titulo`, "texto de 1 a 300 caracteres");
    if (!["excelente", "bom", "medio"].includes(a.classe as string)) erro(`${p}.classe`, "deve ser excelente, bom ou medio");
    if (!["A", "B", "C"].includes(a.tipo as string)) erro(`${p}.tipo`, "deve ser A, B ou C");
    if (!["alta", "moderada", "baixa"].includes(a.confianca as string)) erro(`${p}.confianca`, "deve ser alta, moderada ou baixa");
    if (typeof a.alerta !== "boolean") erro(`${p}.alerta`, "deve ser verdadeiro ou falso");
    if (!Array.isArray(a.temas) || a.temas.length < 1 || a.temas.length > 3) erro(`${p}.temas`, "deve ter de 1 a 3 temas");
    else {
      a.temas.forEach((t, j) => { if (!(TEMAS_RADAR as readonly string[]).includes(t as string)) erro(`${p}.temas[${j}]`, `tema fora da lista: ${String(t)}`); });
      if (new Set(a.temas).size !== a.temas.length) erro(`${p}.temas`, "tema repetido");
    }
    if (!ehTexto(a.estagio)) erro(`${p}.estagio`, "texto obrigatório");
    textoOuNulo(a, "tipo_motivo", `${p}.tipo_motivo`);
    textoOuNulo(a, "prontidao", `${p}.prontidao`);
    textoOuNulo(a, "atualizacao", `${p}.atualizacao`);
    if (a.publicacao !== null) {
      const d = typeof a.publicacao === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(a.publicacao) : null;
      if (!d || !dataValida(+d[1], +d[2], +d[3])) erro(`${p}.publicacao`, "null ou data AAAA-MM-DD");
    }
    if (!isoComOffset(a.primeira_descoberta)) erro(`${p}.primeira_descoberta`, "data ISO com fuso (Z ou ±hh:mm) obrigatória");
    if (!ehObjeto(a.corpo)) erro(`${p}.corpo`, "deve ser um objeto");
    if (!Array.isArray(a.links)) erro(`${p}.links`, "deve ser uma lista");
    else a.links.forEach((l, j) => {
      const q = `${p}.links[${j}]`;
      if (!ehObjeto(l)) return erro(q, "deve ser um objeto { tipo, url }");
      if (!ehTexto(l.tipo)) erro(`${q}.tipo`, "texto obrigatório");
      if (!urlHttp(l.url)) erro(`${q}.url`, "URL inválida (só http/https, até 2000 caracteres)");
      if (l.rotulo !== undefined && l.rotulo !== null && typeof l.rotulo !== "string") erro(`${q}.rotulo`, "deve ser texto");
    });
    for (const k of ["post_x_url", "link_citado_x_url"]) if (a[k] !== null && !urlHttp(a[k])) erro(`${p}.${k}`, "null ou URL http/https");
    if (typeof a.texto_whatsapp !== "string" || a.texto_whatsapp.length < 1 || a.texto_whatsapp.length > 12000) erro(`${p}.texto_whatsapp`, "texto de 1 a 12000 caracteres");
    if (a.enviado_em !== null && !isoComOffset(a.enviado_em)) erro(`${p}.enviado_em`, "null ou data ISO com fuso");
  });

  // correcao
  if (tipo === "correcao") {
    const c = e.correcao;
    if (!ehObjeto(c)) erro("correcao", "objeto obrigatório na correção");
    else {
      desconhecidos(c, CORRECAO_CONHECIDOS, "correcao.");
      if (typeof c.achado_id !== "string" || !RE_RAD.test(c.achado_id)) erro("correcao.achado_id", "formato esperado RAD-AAAAMMDD-NNN");
      if (!ehTexto(c.dado_correto)) erro("correcao.dado_correto", "texto obrigatório");
      if (!ehTexto(c.texto_whatsapp)) erro("correcao.texto_whatsapp", "texto obrigatório");
      textoOuNulo(c, "afirmacao_anterior", "correcao.afirmacao_anterior");
      textoOuNulo(c, "motivo", "correcao.motivo");
      fontesOk(c.fontes, "correcao.fontes");
    }
  }

  // resposta
  if (tipo === "resposta") {
    const r = e.resposta;
    if (!ehObjeto(r)) erro("resposta", "objeto obrigatório na resposta");
    else {
      desconhecidos(r, RESPOSTA_CONHECIDOS, "resposta.");
      if (!ehTexto(r.pergunta)) erro("resposta.pergunta", "texto obrigatório");
      if (r.referencia !== null && !(typeof r.referencia === "string" && RE_RAD.test(r.referencia))) erro("resposta.referencia", "null ou RAD-AAAAMMDD-NNN");
      if (!ehTexto(r.texto_whatsapp)) erro("resposta.texto_whatsapp", "texto obrigatório");
      fontesOk(r.fontes, "resposta.fontes");
    }
  }

  return { ok: campos.length === 0, campos, avisos };
}
