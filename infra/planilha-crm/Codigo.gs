/**
 * Planilha CRM Mestra <-> sistema Gestão de Operação (Banco de leads e CRM).
 * Spec: docs/superpowers/specs/2026-10-01-banco-de-leads-design.md (repositório gestao-de-operacao).
 * Cópia versionada em infra/planilha-crm/Codigo.gs: edite lá e cole aqui (ver infra/planilha-crm/README.md).
 *
 * - Abas de leads: listas Sim/Não, cores e a coluna "ID (sistema)" oculta; cada edição vai para o sistema na hora.
 * - Aba CRM: espelho editável do CRM do sistema (o sistema vale); etapa, reunião e tentativas seguem as regras do CRM.
 * - Web App (doPost): o sistema avisa que há fila; a planilha busca e aplica.
 * - Relógio de 5 min (conferir): conferência completa.
 * Gatilhos instaláveis aoEditar, aoMudar e conferir: criados por "CRM > Preparar sincronização".
 */

var CFG = {
  EDGE: 'https://bnpvzguapunsztsdvmrs.supabase.co/functions/v1/planilha',
  FONTE: 'Poppins',
  CRM: 'CRM',
  LIXEIRA: 'CRM - lixeira',
  BACKUP: 'CRM antigo (backup)',
  RESUMO: 'Resumo',
  TIT_CHECK: 'Primeira mensagem enviada',
  TIT_VALID: 'Lead válido',
  TIT_ID: 'ID (sistema)',
  OCULTAR: ['Duplicatas removidas', 'Excluidos nesta rodada', 'Sem Instagram', 'Empresa não identificada'],
  LINHAS_CRM: 2000,
  CAB_FUNDO: '#1c2434'
};
CFG.IGNORAR = [CFG.RESUMO, CFG.CRM, CFG.LIXEIRA, CFG.BACKUP].concat(CFG.OCULTAR);

var COLUNAS_CRM = [
  'Lead', 'Empresa', 'Telefone', 'E-mail', 'Instagram', 'Aba de origem', 'Etapa', 'Na etapa desde', 'Tentativas',
  'Tentativas da proposta', 'Próximo contato', 'Reunião (data)', 'Reunião (hora)', 'Duração (min)', 'Link do Meet',
  'Situação', 'Valor da proposta', 'Valor fechado', 'Motivo', 'Orgânico/Pago', 'Nicho', 'Cidade', 'Faturamento',
  'Observações', 'Entrou no CRM', 'ID (sistema)'
];
var CRM_SO_LEITURA = ['Aba de origem', 'Na etapa desde', 'Link do Meet', 'Situação', 'Entrou no CRM', 'ID (sistema)'];
var CRM_TEXTO = [
  'Lead', 'Empresa', 'Telefone', 'E-mail', 'Instagram', 'Aba de origem', 'Etapa', 'Reunião (hora)', 'Link do Meet',
  'Situação', 'Motivo', 'Orgânico/Pago', 'Nicho', 'Cidade', 'Faturamento', 'Observações', 'ID (sistema)'
];

var VERDE = '#d9ead3', T_VERDE = '#274e13';
var VERMELHO = '#f4cccc', T_VERM = '#990000';

/* ------------------------------------------------------------------------------------------------ utilidades */

function md5_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(s), Utilities.Charset.UTF_8);
  return b.map(function (x) { var h = (x & 0xff).toString(16); return h.length === 1 ? '0' + h : h; }).join('');
}

/** Igual a planilha_canonico() do banco: chaves em ordem de código, valores não vazios. */
function canonico_(dados) {
  var us = String.fromCharCode(31), rs = String.fromCharCode(30);
  return Object.keys(dados)
    .filter(function (k) { return dados[k] != null && dados[k] !== ''; })
    .sort()
    .map(function (k) { return k + us + dados[k]; })
    .join(rs);
}

function hashLinha_(dados) { return md5_(canonico_(dados)); }

/** Igual ao agregado de planilha_resumo(): id:hash:posicao em ordem de id. */
function agregado_(itens) {
  var ord = itens.slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  return md5_(ord.map(function (i) { return i.id + ':' + i.hash + ':' + i.posicao; }).join(','));
}

/** Igual a chavesDosTitulos() do sistema: título aparado; repetidos ganham " (2)", " (3)". */
function chavesDe_(titulos) {
  var usados = {};
  return titulos.map(function (t) {
    t = String(t == null ? '' : t).trim();
    if (!t) return null;
    usados[t] = (usados[t] || 0) + 1;
    return usados[t] === 1 ? t : t + ' (' + usados[t] + ')';
  });
}

var ESPACOS_ESPECIAIS = new RegExp('[' + String.fromCharCode(160) + String.fromCharCode(8239) + ']', 'g');

function valorParaCelula_(v) {
  v = v == null ? '' : String(v).replace(ESPACOS_ESPECIAIS, ' ');
  return /^[=+]/.test(v) ? "'" + v : v;
}

function igualCelula_(a, b) {
  var n = function (s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); };
  return n(a) === n(b);
}

function semAcento_(s) { return String(s == null ? '' : s).normalize('NFD').replace(/\p{Diacritic}/gu, ''); }
function ehSim_(v) { return semAcento_(v).trim().toLowerCase() === 'sim'; }
function ehNao_(v) { return semAcento_(v).trim().toLowerCase() === 'nao'; }

function lotes_(arr, n) {
  var out = [];
  for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function avisar_(texto) {
  try { SpreadsheetApp.getActive().toast(String(texto), 'CRM', 8); } catch (e) { console.log(texto); }
}

function colunaLetra_(n) {
  var s = '';
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = (n - r - 1) / 26;
  }
  return s;
}

function listaSimNao_() {
  return SpreadsheetApp.newDataValidation().requireValueInList(['Sim', 'Não'], true).setAllowInvalid(false).build();
}

function horarios_() {
  var h = [];
  for (var i = 7; i <= 22; i++) ['00', '15', '30', '45'].forEach(function (m) { if (i < 22 || m === '00') h.push(('0' + i).slice(-2) + ':' + m); });
  return h;
}

/* --------------------------------------------------------------------------------------------------- ponte */

function chamar_(acao, corpo) {
  var chave = PropertiesService.getScriptProperties().getProperty('chave') || '';
  var payload = { acao: acao, planilha_id: SpreadsheetApp.getActive().getId() };
  Object.keys(corpo || {}).forEach(function (k) { payload[k] = corpo[k]; });
  var r = UrlFetchApp.fetch(CFG.EDGE, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: { 'x-planilha-chave': chave },
    muteHttpExceptions: true
  });
  var codigo = r.getResponseCode();
  var j;
  try { j = JSON.parse(r.getContentText()); } catch (e) { throw new Error('Resposta inválida do sistema (' + codigo + ')'); }
  if (codigo >= 300 || j.erro) throw new Error(j.erro || ('O sistema respondeu ' + codigo));
  return j;
}

/* ------------------------------------------------------------------------------------------- abas de leads */

function titulos_(sh) {
  var n = sh.getLastColumn();
  if (n < 1) return [];
  return sh.getRange(1, 1, 1, n).getDisplayValues()[0].map(function (t) { return String(t).trim(); });
}

function ehAbaDeLeads_(sh) {
  if (CFG.IGNORAR.indexOf(sh.getName()) > -1) return false;
  return titulos_(sh).indexOf(CFG.TIT_CHECK) > -1;
}

function abasDeLeads_() {
  return SpreadsheetApp.getActive().getSheets().filter(ehAbaDeLeads_);
}

/** Coluna "ID (sistema)": acha ou cria no fim, oculta. */
function colunaId_(sh) {
  var t = titulos_(sh);
  var i = t.indexOf(CFG.TIT_ID);
  if (i > -1) return i + 1;
  var c = t.length + 1;
  if (c > sh.getMaxColumns()) sh.insertColumnAfter(sh.getMaxColumns());
  // A coluna pode ter herdado validação (ex.: Sim/Não) de uma coluna que existia ali: o ID não passaria
  sh.getRange(1, c, sh.getMaxRows(), 1).clearDataValidations().setNumberFormat('@');
  sh.getRange(1, c).setValue(CFG.TIT_ID);
  sh.hideColumns(c);
  return c;
}

/** Abas de leads com as colunas (título, posição, oculta) e os gids de todas as abas da planilha. */
function metaAbas_() {
  var todas = SpreadsheetApp.getActive().getSheets();
  var abas = [];
  todas.forEach(function (sh, ordem) {
    if (!ehAbaDeLeads_(sh)) return;
    var t = titulos_(sh);
    var cols = [];
    for (var i = 0; i < t.length; i++) if (t[i]) cols.push({ titulo: t[i], indice: i, oculta: sh.isColumnHiddenByUser(i + 1) });
    abas.push({ id: String(sh.getSheetId()), nome: sh.getName(), ordem: ordem, colunas: cols });
  });
  return { abas: abas, existentes: todas.map(function (s) { return String(s.getSheetId()); }) };
}

/** Manda as abas ao sistema se algo mudou (ou se `forcar`). Guarda as etapas do CRM para as listas da aba CRM. */
function enviarAbas_(forcar) {
  var meta = metaAbas_();
  var assinatura = md5_(JSON.stringify(meta));
  var props = PropertiesService.getDocumentProperties();
  if (!forcar && props.getProperty('abas_assinatura') === assinatura) return false;
  var r = chamar_('abas', meta);
  props.setProperty('abas_assinatura', assinatura);
  props.setProperty('abas_conhecidas', meta.abas.map(function (a) { return a.id; }).join(','));
  if (r.crm && r.crm.etapas) props.setProperty('crm_etapas', JSON.stringify(r.crm.etapas));
  return true;
}

function abaConhecida_(id) {
  var k = PropertiesService.getDocumentProperties().getProperty('abas_conhecidas') || '';
  return (',' + k + ',').indexOf(',' + id + ',') > -1;
}

/** Linhas não vazias da aba: { linha, id, dados } com os valores como aparecem na planilha. */
function lerAba_(sh) {
  var colId = colunaId_(sh);
  var titulos = titulos_(sh);
  var chaves = chavesDe_(titulos);
  var nR = sh.getLastRow(), nC = titulos.length;
  var linhas = [];
  if (nR >= 2 && nC > 0) {
    var vals = sh.getRange(2, 1, nR - 1, nC).getDisplayValues();
    for (var i = 0; i < vals.length; i++) {
      var dados = {}, vazia = true;
      for (var c = 0; c < nC; c++) {
        if (c === colId - 1 || !chaves[c]) continue;
        var v = String(vals[i][c]).trim();
        if (v !== '') { dados[chaves[c]] = v; vazia = false; }
      }
      if (!vazia) linhas.push({ linha: i + 2, id: String(vals[i][colId - 1]).trim(), dados: dados });
    }
  }
  return { sh: sh, aba_id: String(sh.getSheetId()), titulos: titulos, chaves: chaves, colId: colId, linhas: linhas };
}

/** ID novo para linha sem ID ou com ID repetido (linha copiada com a coluna oculta). `vistos`: id -> gid. */
function garantirIds_(info, vistos) {
  var nR = info.sh.getLastRow();
  if (nR < 2) return 0;
  var faixa = info.sh.getRange(2, info.colId, nR - 1, 1);
  var vals = faixa.getValues();
  var novos = 0;
  info.linhas.forEach(function (l) {
    if (!l.id || vistos[l.id]) {
      l.id = Utilities.getUuid();
      vals[l.linha - 2][0] = l.id;
      novos++;
    }
    vistos[l.id] = info.aba_id;
  });
  if (novos) faixa.clearDataValidations().setValues(vals);
  return novos;
}

function idsDeOutrasAbas_(gid) {
  var vistos = {};
  abasDeLeads_().forEach(function (sh) {
    if (String(sh.getSheetId()) === gid) return;
    var t = titulos_(sh), c = t.indexOf(CFG.TIT_ID) + 1, n = sh.getLastRow();
    if (!c || n < 2) return;
    sh.getRange(2, c, n - 1, 1).getValues().forEach(function (v) { var id = String(v[0]).trim(); if (id) vistos[id] = String(sh.getSheetId()); });
  });
  return vistos;
}

function enviarLeads_(info, linhas, carga) {
  lotes_(linhas, 300).forEach(function (lote) {
    var r = chamar_('leads', {
      carga: !!carga,
      linhas: lote.map(function (l) { return { id: l.id, aba_id: info.aba_id, posicao: l.linha, dados: l.dados }; })
    });
    aplicarOperacoes_(r.operacoes || []);
    (r.avisos || []).forEach(avisar_);
  });
}

/* ------------------------------------------------------------------------------------------ aplicar operações */

/**
 * Aplica as operações devolvidas pelo sistema. Devolve os ids de leads acrescentados nas abas de leads (o sistema
 * marca na_planilha).
 */
function aplicarOperacoes_(ops) {
  if (!ops || !ops.length) return [];
  var ss = SpreadsheetApp.getActive();
  var cache = {};
  var escritos = [];
  var remocoes = [];

  function folha(aba) {
    if (cache.hasOwnProperty(aba)) return cache[aba];
    var ehCrm = aba === 'CRM';
    var sh = ehCrm ? ss.getSheetByName(CFG.CRM) : ss.getSheets().filter(function (s) { return String(s.getSheetId()) === String(aba); })[0];
    if (!sh) return (cache[aba] = null);
    var colId = ehCrm ? titulos_(sh).indexOf(CFG.TIT_ID) + 1 : colunaId_(sh);
    if (!colId) return (cache[aba] = null);
    var t = titulos_(sh);
    var mapa = {};
    var n = sh.getLastRow();
    if (n >= 2) sh.getRange(2, colId, n - 1, 1).getValues().forEach(function (v, i) { var id = String(v[0]).trim(); if (id) mapa[id] = i + 2; });
    return (cache[aba] = { sh: sh, titulos: t, chaves: ehCrm ? t : chavesDe_(t), colId: colId, mapa: mapa, ehCrm: ehCrm });
  }

  ops.forEach(function (op) {
    if (op.tipo === 'aviso') { avisar_(op.texto); return; }
    if (op.tipo === 'lixeira') { anexarLixeira_(op.valores || {}); return; }
    if (op.tipo === 'remover') { remocoes.push(op); return; }
    if (op.tipo !== 'linha') return;
    var f = folha(op.aba);
    if (!f) return;
    var linha = f.mapa[op.id];
    if (!linha && op.linha && op.linha >= 2 && !String(f.sh.getRange(op.linha, f.colId).getValue()).trim()) linha = op.linha;
    var nova = !linha;
    if (nova) linha = Math.max(f.sh.getLastRow() + 1, 2);
    f.mapa[op.id] = linha;
    escreverLinha_(f, linha, op, nova && !op.linha);
    if (nova && !f.ehCrm) escritos.push(op.id);
  });

  remocoes
    .map(function (op) { var f = folha(op.aba); return f && f.mapa[op.id] ? { f: f, linha: f.mapa[op.id], id: op.id } : null; })
    .filter(function (x) { return x; })
    .sort(function (a, b) { return b.linha - a.linha; })
    .forEach(function (x) {
      removerLinha_(x.f.sh, x.linha);
      delete x.f.mapa[x.id];
      Object.keys(x.f.mapa).forEach(function (k) { if (x.f.mapa[k] > x.linha) x.f.mapa[k]--; });
    });
  return escritos;
}

function escreverLinha_(f, linha, op, nova) {
  var nC = f.titulos.length;
  var faixa = f.sh.getRange(linha, 1, 1, nC);
  var valores = op.valores || {};
  var tem = function (k) { return k && Object.prototype.hasOwnProperty.call(valores, k); };
  if (nova) {
    if (linha > 2) {
      var modelo = f.sh.getRange(linha - 1, 1, 1, nC);
      modelo.copyTo(faixa, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      modelo.copyTo(faixa, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    }
    faixa.setValues([f.chaves.map(function (k, c) {
      if (c === f.colId - 1) return op.id;
      return tem(k) ? valorParaCelula_(valores[k]) : '';
    })]);
  } else {
    var atuais = faixa.getDisplayValues()[0];
    for (var c = 0; c < nC; c++) {
      var k = f.chaves[c];
      if (!k) continue;
      if (c === f.colId - 1) {
        if (!String(atuais[c]).trim()) f.sh.getRange(linha, c + 1).setValue(op.id);
        continue;
      }
      if (!tem(k) && !op.completa) continue;
      var v = tem(k) ? valores[k] : '';
      if (igualCelula_(atuais[c], v)) continue;
      f.sh.getRange(linha, c + 1).setValue(valorParaCelula_(v));
    }
  }
  if (f.ehCrm) {
    if (op.cor !== undefined) pintarLinhaCrm_(f.sh, linha, nC, op.cor);
    if (op.motivos !== undefined) validarMotivo_(f.sh, f.titulos, linha, op.motivos);
  }
}

function removerLinha_(sh, linha) {
  if (sh.getMaxRows() - sh.getFrozenRows() <= 1) sh.getRange(linha, 1, 1, sh.getMaxColumns()).clearContent();
  else sh.deleteRow(linha);
}

function pintarLinhaCrm_(sh, linha, nC, cor) {
  sh.getRange(linha, 1, 1, nC).setBackground(cor ? cor.fundo : null).setFontColor(cor ? cor.texto : null);
}

function validarMotivo_(sh, titulos, linha, motivos) {
  var c = titulos.indexOf('Motivo') + 1;
  if (!c) return;
  var celula = sh.getRange(linha, c);
  if (motivos && motivos.length) {
    celula.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(motivos, true).setAllowInvalid(true).build());
  } else {
    celula.clearDataValidations();
  }
}

function anexarLixeira_(valores) {
  var ss = SpreadsheetApp.getActive();
  var lix = ss.getSheetByName(CFG.LIXEIRA) || ss.insertSheet(CFG.LIXEIRA);
  var t = titulos_(lix);
  if (t.indexOf('Etapa') < 0) {
    t = COLUNAS_CRM.filter(function (x) { return x !== CFG.TIT_ID; });
    lix.getRange(1, 1, 1, t.length).setValues([t]).setFontWeight('bold').setBackground(CFG.CAB_FUNDO).setFontColor('#ffffff');
    lix.setFrozenRows(1);
  }
  var linha = Math.max(lix.getLastRow() + 1, 2);
  lix.getRange(linha, 1, 1, t.length).setValues([t.map(function (x) { return valorParaCelula_(valores[x]); })]);
}

/* ----------------------------------------------------------------------------------------------- gatilhos */

function aoEditar(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  var r1 = e.range.getRow(), r2 = r1 + e.range.getNumRows() - 1;
  var ehCrm = sh.getName() === CFG.CRM;
  if (!ehCrm && !ehAbaDeLeads_(sh)) return;
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) { if (ehCrm) marcarPendenteCrm_(sh, r1, r2); return; }
  try {
    if (r1 === 1) {
      if (!ehCrm) enviarAbas_(true);
      if (r2 < 2) return;
      r1 = 2;
    }
    if (ehCrm) editarCrm_(sh, r1, r2);
    else editarLeads_(sh, r1, r2);
    aplicarFila_();
  } catch (err) {
    if (ehCrm) marcarPendenteCrm_(sh, r1, r2);
    avisar_('Não sincronizou agora: ' + err.message + '. A conferência tenta de novo em até 5 min.');
  } finally {
    lock.releaseLock();
  }
}

function editarLeads_(sh, r1, r2) {
  var info = lerAba_(sh);
  var novos = garantirIds_(info, idsDeOutrasAbas_(info.aba_id));
  if (novos || !abaConhecida_(info.aba_id)) enviarAbas_(false);
  var alvo = info.linhas.filter(function (l) { return l.linha >= r1 && l.linha <= r2; });
  if (alvo.length) enviarLeads_(info, alvo, false);
}

function linhasCrm_(sh, r1, r2) {
  var t = titulos_(sh);
  var cId = t.indexOf(CFG.TIT_ID);
  var vals = sh.getRange(r1, 1, r2 - r1 + 1, t.length).getDisplayValues();
  var linhas = [];
  for (var i = 0; i < vals.length; i++) {
    var valores = {}, temAlgo = false;
    for (var c = 0; c < t.length; c++) {
      if (!t[c]) continue;
      valores[t[c]] = String(vals[i][c]).trim();
      if (c !== cId && valores[t[c]]) temAlgo = true;
    }
    var id = cId > -1 ? valores[CFG.TIT_ID] : '';
    if (!temAlgo) continue; // linha vazia (ou esvaziada): a conferência devolve o lead, se houver
    linhas.push({ id: id || null, linha: r1 + i, valores: valores });
  }
  return linhas;
}

function editarCrm_(sh, r1, r2) {
  lotes_(linhasCrm_(sh, r1, r2), 40).forEach(function (lote) {
    var r = chamar_('crm', { linhas: lote });
    aplicarOperacoes_(r.operacoes || []);
    (r.avisos || []).forEach(avisar_);
  });
}

function marcarPendenteCrm_(sh, r1, r2) {
  try {
    var t = titulos_(sh), c = t.indexOf(CFG.TIT_ID) + 1;
    if (!c) return;
    var props = PropertiesService.getDocumentProperties();
    var lista = JSON.parse(props.getProperty('crm_pendentes') || '[]');
    sh.getRange(r1, c, r2 - r1 + 1, 1).getValues().forEach(function (v) {
      var id = String(v[0]).trim();
      if (id && lista.indexOf(id) < 0) lista.push(id);
    });
    props.setProperty('crm_pendentes', JSON.stringify(lista.slice(-200)));
  } catch (e) { console.log('marcarPendenteCrm_: ' + e); }
}

/** Reenvia as linhas da aba CRM cuja edição não chegou ao sistema. */
function retentarCrm_() {
  var props = PropertiesService.getDocumentProperties();
  var lista = JSON.parse(props.getProperty('crm_pendentes') || '[]');
  if (!lista.length) return;
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.CRM);
  var t = titulos_(sh), c = t.indexOf(CFG.TIT_ID) + 1, n = sh.getLastRow();
  if (c && n >= 2) {
    var ids = sh.getRange(2, c, n - 1, 1).getValues().map(function (v) { return String(v[0]).trim(); });
    var linhas = [];
    lista.forEach(function (id) { var i = ids.indexOf(id); if (i > -1) linhas = linhas.concat(linhasCrm_(sh, i + 2, i + 2)); });
    if (linhas.length) {
      var r = chamar_('crm', { linhas: linhas });
      aplicarOperacoes_(r.operacoes || []);
    }
  }
  props.deleteProperty('crm_pendentes');
}

function aoMudar(e) {
  var tipo = e && e.changeType;
  if (['INSERT_COLUMN', 'REMOVE_ROW', 'REMOVE_COLUMN', 'INSERT_GRID', 'REMOVE_GRID', 'OTHER'].indexOf(tipo) < 0) return;
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) return;
  try {
    var sh = SpreadsheetApp.getActive().getActiveSheet();
    if (tipo !== 'REMOVE_ROW') enviarAbas_(false);
    if (sh && sh.getName() === CFG.CRM) {
      if (tipo === 'REMOVE_ROW') {
        avisar_('Apagar a linha não tira o lead do CRM: ela volta. Para tirar, marque Não em "Primeira mensagem enviada" na aba de origem ou exclua no sistema.');
        reescreverCrm_();
      }
      return;
    }
    if (sh && ehAbaDeLeads_(sh)) conferirLeads_(chamar_('conferir', {}).resumo.abas || [], [sh]);
  } catch (err) {
    avisar_('Não sincronizou agora: ' + err.message);
  } finally {
    lock.releaseLock();
  }
}

/** O sistema avisa que há fila: busca e aplica (e olha de novo depois de 3,5 s, para o que chegou junto). */
function doPost(e) {
  var lock = LockService.getDocumentLock();
  if (lock.tryLock(30000)) {
    try {
      aplicarFila_();
      Utilities.sleep(3500);
      aplicarFila_();
    } catch (err) {
      console.error('doPost: ' + err);
    } finally {
      lock.releaseLock();
    }
  }
  return ContentService.createTextOutput('ok');
}

function doGet() {
  return ContentService.createTextOutput('Planilha CRM: ponte com o sistema no ar.');
}

function aplicarFila_() {
  for (var volta = 0; volta < 20; volta++) {
    var r = chamar_('fila', {});
    var ids = r.fila_ids || [];
    if (!ids.length) return;
    var escritos = aplicarOperacoes_(r.operacoes || []);
    chamar_('fila_ok', { fila_ids: ids, escritos: escritos });
  }
}

/* --------------------------------------------------------------------------------------------- conferência */

function conferir() {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(60000)) return;
  try { conferir_(); } finally { lock.releaseLock(); }
}

function conferir_() {
  var erro = null;
  try {
    retentarCrm_();
    aplicarFila_();
    enviarAbas_(false);
    var resumo = chamar_('conferir', {}).resumo || {};
    conferirLeads_(resumo.abas || [], null);
    var props = PropertiesService.getDocumentProperties();
    if (props.getProperty('crm_fp') !== resumo.crm || contarIdsCrm_() !== resumo.crm_n) reescreverCrm_();
  } catch (e) {
    erro = e && e.message ? e.message : String(e);
    console.error(e);
  }
  try { chamar_('conferencia_fim', { ok: !erro, erro: erro }); } catch (e2) { console.error(e2); }
  return erro;
}

/** Abas de leads: a planilha vale. `so` limita a algumas abas (os IDs de todas entram na conta de repetidos). */
function conferirLeads_(resumoAbas, so) {
  var infos = abasDeLeads_().map(lerAba_);
  var vistos = {};
  var novos = 0;
  infos.forEach(function (info) { novos += garantirIds_(info, vistos); });
  if (novos) enviarAbas_(false);
  var porId = {};
  resumoAbas.forEach(function (a) { porId[a.id] = a; });
  var ids = so ? so.map(function (s) { return String(s.getSheetId()); }) : null;
  infos.forEach(function (info) {
    if (ids && ids.indexOf(info.aba_id) < 0) return;
    var itens = info.linhas.map(function (l) { return { id: l.id, hash: hashLinha_(l.dados), posicao: l.linha }; });
    var srv = porId[info.aba_id];
    if (srv && srv.n === itens.length && srv.agg === agregado_(itens)) return;
    var det = chamar_('aba_detalhe', { aba_id: info.aba_id }).leads || [];
    var noBanco = {};
    det.forEach(function (d) { noBanco[d.id] = d; });
    var enviar = info.linhas.filter(function (l, i) {
      var d = noBanco[l.id];
      return !d || d.hash !== itens[i].hash || d.posicao !== l.linha;
    });
    if (enviar.length) enviarLeads_(info, enviar, false);
    var apagar = [], trazer = [];
    det.forEach(function (d) {
      if (vistos[d.id]) return;
      if (d.na_planilha) apagar.push(d.id); else trazer.push(d.id);
    });
    if (apagar.length) aplicarOperacoes_(chamar_('excluir_leads', { ids: apagar }).operacoes || []);
    if (trazer.length) {
      var escritos = aplicarOperacoes_(chamar_('linhas', { leads: trazer }).operacoes || []);
      if (escritos.length) chamar_('fila_ok', { fila_ids: [], escritos: escritos });
    }
  });
}

function contarIdsCrm_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.CRM);
  if (!sh) return -1;
  var c = titulos_(sh).indexOf(CFG.TIT_ID) + 1, n = sh.getLastRow();
  if (!c || n < 2) return 0;
  return sh.getRange(2, c, n - 1, 1).getValues().filter(function (v) { return String(v[0]).trim(); }).length;
}

/** Aba CRM: o sistema vale. Reescreve as células diferentes, acrescenta o que falta e tira o que sobrou. */
function reescreverCrm_() {
  var r = chamar_('linhas', { crm_todos: true });
  aplicarOperacoes_(r.operacoes || []);
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.CRM);
  var c = titulos_(sh).indexOf(CFG.TIT_ID) + 1, n = sh.getLastRow();
  if (c && n >= 2) {
    var vivos = {};
    (r.ids || []).forEach(function (id) { vivos[id] = true; });
    var sobras = [];
    sh.getRange(2, c, n - 1, 1).getValues().forEach(function (v) {
      var id = String(v[0]).trim();
      if (id && !vivos[id]) sobras.push({ tipo: 'remover', aba: 'CRM', id: id });
    });
    aplicarOperacoes_(sobras);
  }
  PropertiesService.getDocumentProperties().setProperty('crm_fp', r.fp || '');
}

/* ------------------------------------------------------------------------------------------ menu e ajustes */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CRM')
    .addItem('Configurar planilha', 'configurar')
    .addItem('Sincronizar agora', 'sincronizarAgora')
    .addSeparator()
    .addItem('Mostrar abas de apoio', 'mostrarApoio')
    .addItem('Preparar sincronização (uso único)', 'prepararSincronizacao')
    .addToUi();
}

function sincronizarAgora() {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(60000)) { SpreadsheetApp.getUi().alert('Outra sincronização está rodando. Tente de novo em 1 minuto.'); return; }
  var erro;
  try { erro = conferir_(); } finally { lock.releaseLock(); }
  SpreadsheetApp.getUi().alert(erro ? 'A conferência encontrou um problema: ' + erro : 'Planilha e sistema conferidos.');
}

function mostrarApoio() {
  var ss = SpreadsheetApp.getActive();
  CFG.OCULTAR.forEach(function (n) { var sh = ss.getSheetByName(n); if (sh) sh.showSheet(); });
}

/** Fonte, abas de apoio ocultas, listas, cores e a aba CRM. Pode rodar quantas vezes quiser. */
function configurar() {
  var ss = SpreadsheetApp.getActive();
  ss.getSheets().forEach(function (sh) {
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 1), Math.max(sh.getMaxColumns(), 1)).setFontFamily(CFG.FONTE);
  });
  CFG.OCULTAR.forEach(function (n) { var sh = ss.getSheetByName(n); if (sh) sh.hideSheet(); });
  var abas = [];
  abasDeLeads_().forEach(function (sh) { configurarAbaLeads_(sh); abas.push(sh.getName()); });
  var crm = ss.getSheetByName(CFG.CRM);
  if (crm && titulos_(crm).indexOf(CFG.TIT_ID) > -1) configurarCrm_(crm);
  SpreadsheetApp.getUi().alert('Planilha configurada.\n\nAbas de leads (' + abas.length + '):\n' + abas.join('\n'));
}

function configurarAbaLeads_(sh) {
  var colId = colunaId_(sh);
  var t = titulos_(sh);
  var cCheck = t.indexOf(CFG.TIT_CHECK) + 1, cValid = t.indexOf(CFG.TIT_VALID) + 1;
  var n = sh.getLastRow() - 1;
  if (n >= 1) {
    [[cCheck, 'Não'], [cValid, 'Sim']].forEach(function (p) {
      if (p[0] < 1) return;
      var rg = sh.getRange(2, p[0], n, 1);
      rg.setDataValidation(listaSimNao_()).setHorizontalAlignment('center');
      var vals = rg.getValues();
      var mudou = false;
      vals.forEach(function (v) { if (String(v[0]).trim() === '') { v[0] = p[1]; mudou = true; } });
      if (mudou) rg.setValues(vals);
    });
    var alvo = sh.getRange(2, 1, n, sh.getLastColumn());
    var regras = [];
    if (cValid > 0) {
      regras.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + colunaLetra_(cValid) + '2="Não"')
        .setBackground(VERMELHO).setFontColor(T_VERM).setRanges([alvo]).build());
    }
    if (cCheck > 0) {
      regras.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + colunaLetra_(cCheck) + '2="Sim"')
        .setBackground(VERDE).setFontColor(T_VERDE).setRanges([alvo]).build());
    }
    sh.setConditionalFormatRules(regras);
  }
  sh.setFrozenRows(1);
  sh.hideColumns(colId);
}

function configurarCrm_(sh) {
  var t = titulos_(sh);
  var n = CFG.LINHAS_CRM;
  if (sh.getMaxRows() < n) sh.insertRowsAfter(sh.getMaxRows(), n - sh.getMaxRows());
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  sh.getRange(1, 1, 1, t.length).setFontWeight('bold').setBackground(CFG.CAB_FUNDO).setFontColor('#ffffff')
    .setVerticalAlignment('middle').setWrap(true);
  var col = function (x) { return t.indexOf(x) + 1; };
  var faixa = function (x) { return sh.getRange(2, col(x), n - 1, 1); };
  var formato = function (lista, f) { lista.forEach(function (x) { if (col(x)) faixa(x).setNumberFormat(f); }); };
  formato(CRM_TEXTO, '@');
  formato(['Reunião (data)', 'Entrou no CRM'], 'dd/MM/yyyy');
  formato(['Na etapa desde', 'Próximo contato'], 'dd/MM/yyyy HH:mm');
  formato(['Valor da proposta', 'Valor fechado'], '"R$" #,##0.00');
  formato(['Tentativas', 'Tentativas da proposta', 'Duração (min)'], '0');
  var lista = function (itens, invalido) {
    return SpreadsheetApp.newDataValidation().requireValueInList(itens, true).setAllowInvalid(invalido).build();
  };
  var etapas = JSON.parse(PropertiesService.getDocumentProperties().getProperty('crm_etapas') || '[]')
    .map(function (e) { return e.titulo; });
  if (etapas.length && col('Etapa')) faixa('Etapa').setDataValidation(lista(etapas, false));
  if (col('Orgânico/Pago')) faixa('Orgânico/Pago').setDataValidation(lista(['Orgânico', 'Pago'], false));
  if (col('Duração (min)')) faixa('Duração (min)').setDataValidation(lista(['15', '30', '45', '60', '90'], true));
  if (col('Reunião (hora)')) faixa('Reunião (hora)').setDataValidation(lista(horarios_(), true));
  if (col('Reunião (data)')) {
    faixa('Reunião (data)').setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  }
  CRM_SO_LEITURA.forEach(function (x) {
    if (col(x)) sh.getRange(1, col(x)).setBackground('#4b5563').setNote('Preenchido pelo sistema: editar aqui não muda nada.');
  });
  if (col(CFG.TIT_ID)) sh.hideColumns(col(CFG.TIT_ID));
}

/* ------------------------------------------------------------------------------------- preparação (uso único) */

function prepararSincronizacao() {
  var ui = SpreadsheetApp.getUi();
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(60000)) { ui.alert('Outra sincronização está rodando. Tente de novo em 1 minuto.'); return; }
  try {
    ui.alert(preparar_());
  } catch (e) {
    ui.alert('A preparação parou: ' + e.message + '\n\nRode de novo: ela continua de onde parou.');
  } finally {
    lock.releaseLock();
  }
}

/** Etapas idempotentes (guardadas em "preparo"): registrar, IDs, carga, CRM antigo, lixeira, gatilhos. */
function preparar_() {
  var props = PropertiesService.getDocumentProperties();
  var etapa = Number(props.getProperty('preparo') || 0);
  var msgs = [];
  if (etapa < 1) {
    registrar_();
    props.setProperty('preparo', '1');
    msgs.push('Planilha registrada no sistema.');
  }
  if (etapa < 2) {
    var vistos = {};
    abasDeLeads_().forEach(function (sh) { garantirIds_(lerAba_(sh), vistos); });
    enviarAbas_(true);
    props.setProperty('preparo', '2');
    msgs.push('Coluna ID criada nas abas de leads.');
  }
  if (etapa < 3) {
    var total = 0;
    abasDeLeads_().forEach(function (sh) { var info = lerAba_(sh); enviarLeads_(info, info.linhas, true); total += info.linhas.length; });
    props.setProperty('preparo', '3');
    msgs.push(total + ' leads enviados ao sistema.');
  }
  if (etapa < 4) {
    msgs.push(migrarCrmAntigo_());
    props.setProperty('preparo', '4');
  }
  if (etapa < 5) {
    converterLixeira_();
    props.setProperty('preparo', '5');
    msgs.push('Lixeira convertida.');
  }
  if (etapa < 6) {
    instalarGatilhos_();
    props.setProperty('preparo', '6');
    msgs.push('Gatilhos instalados (edição, mudança e conferência a cada 5 min).');
  }
  var erro = conferir_();
  msgs.push(erro ? 'Conferência: ' + erro : 'Conferência ok.');
  return msgs.join('\n');
}

function registrar_() {
  var props = PropertiesService.getScriptProperties();
  var chave = props.getProperty('chave');
  if (!chave) {
    chave = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('chave', chave);
  }
  return chamar_('registrar', { chave: chave });
}

function migrarCrmAntigo_() {
  var ss = SpreadsheetApp.getActive();
  var crm = ss.getSheetByName(CFG.CRM) || ss.insertSheet(CFG.CRM);
  var t = titulos_(crm);
  var msg = 'A aba CRM já estava no formato novo.';
  if (t.indexOf(CFG.TIT_ID) < 0) {
    var linhas = [];
    var n = crm.getLastRow();
    if (n >= 2 && t.length) {
      crm.getRange(2, 1, n - 1, t.length).getDisplayValues().forEach(function (row) {
        var o = {}, tem = false;
        t.forEach(function (x, i) { if (x) { o[x] = String(row[i]).trim(); if (o[x]) tem = true; } });
        if (tem) linhas.push(o);
      });
    }
    var r = linhas.length ? chamar_('importar_crm_antigo', { linhas: linhas }) : { criados: 0, ligados: 0, pulados: 0, avisos: [] };
    msg = 'CRM antigo: ' + r.criados + ' leads criados no sistema, ' + r.ligados + ' ligados à aba de origem, ' + r.pulados +
      ' pulados.' + (r.avisos && r.avisos.length ? '\n' + r.avisos.join('\n') : '');
    if (!ss.getSheetByName(CFG.BACKUP)) crm.copyTo(ss).setName(CFG.BACKUP).hideSheet();
    crm.showColumns(1, crm.getMaxColumns());
    crm.getRange(1, 1, crm.getMaxRows(), crm.getMaxColumns()).clearDataValidations().clearNote();
    crm.clear();
    crm.setConditionalFormatRules([]);
    if (crm.getMaxColumns() < COLUNAS_CRM.length) crm.insertColumnsAfter(crm.getMaxColumns(), COLUNAS_CRM.length - crm.getMaxColumns());
    crm.getRange(1, 1, 1, COLUNAS_CRM.length).setValues([COLUNAS_CRM]);
  }
  configurarCrm_(crm);
  reescreverCrm_();
  return msg;
}

function etapaAntiga_(o) {
  if (ehSim_(o['Lead Fechado'])) return 'Fechamento';
  if (ehSim_(o['Lead Perdido'])) return 'Lead perdido';
  if (ehSim_(o['Reunião Agendada'])) return 'Reunião marcada';
  if (ehSim_(o['Desenvolvendo conversa'])) return 'Desenvolvendo conversa';
  if (ehSim_(o['Lead respondeu'])) return 'Respondeu';
  for (var i = 7; i >= 1; i--) if (ehSim_(o['Follow Up ' + i])) return 'Follow-up';
  return 'Primeiro contato';
}

function valorLixeiraAntiga_(o, titulo) {
  switch (titulo) {
    case 'Lead': return o['Lead'] || '';
    case 'Empresa': return o['Empresa'] || '';
    case 'Telefone': return o['Telefone'] || '';
    case 'Instagram': return o['Instagram'] || '';
    case 'Nicho': return o['Nicho'] || '';
    case 'Observações': return o['Observações'] || '';
    case 'Faturamento': return o['Faturamento mensal'] || '';
    case 'Etapa': return etapaAntiga_(o);
    case 'Reunião (data)': return o['Data da reunião'] || '';
    case 'Reunião (hora)': return o['Hora da reunião'] || '';
    case 'Entrou no CRM': return o['Data 1ª mensagem'] || '';
    case 'Aba de origem': return '(CRM antigo)';
    default: return '';
  }
}

function converterLixeira_() {
  var ss = SpreadsheetApp.getActive();
  var lix = ss.getSheetByName(CFG.LIXEIRA) || ss.insertSheet(CFG.LIXEIRA);
  var t = titulos_(lix);
  if (t.indexOf('Etapa') > -1) return;
  var novos = COLUNAS_CRM.filter(function (x) { return x !== CFG.TIT_ID; });
  var linhas = [];
  var n = lix.getLastRow();
  if (n >= 2 && t.length) {
    lix.getRange(2, 1, n - 1, t.length).getDisplayValues().forEach(function (row) {
      var o = {};
      t.forEach(function (x, i) { o[x] = String(row[i]).trim(); });
      if (!o['Lead'] && !o['Empresa']) return;
      linhas.push(novos.map(function (x) { return valorParaCelula_(valorLixeiraAntiga_(o, x)); }));
    });
  }
  lix.getRange(1, 1, lix.getMaxRows(), lix.getMaxColumns()).clearDataValidations();
  lix.clear();
  lix.setConditionalFormatRules([]);
  if (lix.getMaxColumns() < novos.length) lix.insertColumnsAfter(lix.getMaxColumns(), novos.length - lix.getMaxColumns());
  lix.getRange(1, 1, 1, novos.length).setValues([novos]).setFontWeight('bold').setBackground(CFG.CAB_FUNDO).setFontColor('#ffffff');
  if (linhas.length) lix.getRange(2, 1, linhas.length, novos.length).setValues(linhas);
  lix.setFrozenRows(1);
}

function instalarGatilhos_() {
  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['aoEditar', 'aoMudar', 'conferir'].indexOf(t.getHandlerFunction()) > -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('aoEditar').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('aoMudar').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('conferir').timeBased().everyMinutes(5).create();
}
