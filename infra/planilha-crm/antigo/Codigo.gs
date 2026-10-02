const FONTE     = 'Poppins';
const CRM       = 'CRM';
const LIXEIRA   = 'CRM - lixeira';
const TIT_CHECK = 'Primeira mensagem enviada';
const TIT_VALID = 'Lead válido';
const OCULTAR   = ['Duplicatas removidas', 'Excluidos nesta rodada',
                   'Sem Instagram', 'Empresa não identificada'];
const IGNORAR   = ['Resumo', CRM, LIXEIRA].concat(OCULTAR);
 
const LINHAS = 2000;   // até onde as regras do CRM valem
 
// Colunas do CRM
const C_LEAD = 1, C_EMP = 2, C_IG = 3, C_LINK = 4, C_TEL = 5, C_FAT = 6;
const C_NICHO = 7, C_DATA1 = 8;
const FUPS    = [9, 11, 13, 15, 17, 19, 21];              // Follow Up 1..7
const C_RESP = 23, C_QUAL = 24, C_DESENV = 25, C_REUN = 26;
const C_DATAR = 27, C_HORAR = 28, C_PERD = 29, C_FECH = 30, C_OBS = 31;
const SIMNAO  = FUPS.concat([C_RESP, C_QUAL, C_DESENV, C_REUN, C_PERD, C_FECH]);
 
const VERDE   = '#d9ead3', T_VERDE = '#274e13';
const VERMELHO= '#f4cccc', T_VERM  = '#990000';
const AMARELO = '#fff2cc', T_AMAR  = '#7f6000';
 
/* --------------------------------------------------- localizar colunas */
 
function colunas(sh){
  const n = sh.getLastColumn();
  if (n < 1) return {check: 0};
  const h = sh.getRange(1, 1, 1, n).getValues()[0].map(function(v){ return String(v).trim(); });
  const idx = function(){
    for (var i = 0; i < arguments.length; i++){
      const p = h.indexOf(arguments[i]);
      if (p > -1) return p + 1;
    }
    return 0;
  };
  return {
    check: idx(TIT_CHECK),
    valid: idx(TIT_VALID),
    nome:  idx('Nome', 'Nome do cliente', 'Lead'),
    emp:   idx('Empresa', 'Nome da empresa'),
    ig:    idx('Instagram'),
    link:  idx('Link Instagram'),
    tel:   idx('Telefone'),
    fat:   idx('Faturamento mensal')
  };
}
 
function ehAbaDeLeads(sh){
  if (IGNORAR.indexOf(sh.getName()) > -1) return false;
  return colunas(sh).check > 0;
}
 
function sim(v){
  if (v === true) return true;
  return String(v == null ? '' : v).trim().toLowerCase() === 'sim';
}
function val(sh, lin, c){ return c > 0 ? sh.getRange(lin, c).getValue() : ''; }
function norm(v){ return String(v == null ? '' : v).trim().toLowerCase(); }
 
/** Telefone quando existe; senão Nome + Empresa. */
function chaveDe(sh, lin, C){
  const tel = String(val(sh, lin, C.tel)).trim();
  if (tel) return {tipo: 'tel', v: tel};
  const k = norm(val(sh, lin, C.nome)) + '|' + norm(val(sh, lin, C.emp));
  return {tipo: 'nome', v: (k === '|' ? '' : k)};
}
 
/* ------------------------------------------------------------- gatilho */
 
function onEdit(e){
  if (!e || !e.range) return;
  const sh  = e.range.getSheet();
  const col = e.range.getColumn();
  const lin = e.range.getRow();
  if (lin < 2 || e.range.getNumRows() > 1) return;
 
  if (sh.getName() === CRM){
    if (FUPS.indexOf(col) > -1){
      const alvo = sh.getRange(lin, col + 1);
      if (sim(e.range.getValue())) alvo.setValue(new Date()).setNumberFormat('dd/MM/yyyy');
      else                         alvo.clearContent();
    }
    return;
  }
 
  if (!ehAbaDeLeads(sh)) return;
  const C = colunas(sh);
  if (col !== C.check) return;
 
  if (sim(e.range.getValue())){
    if (C.valid > 0 && norm(sh.getRange(lin, C.valid).getValue()) === 'não'){
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Esse lead está marcado como Lead válido = Não. Ele não entrou no CRM.', 'CRM', 6);
      return;
    }
    entrarNoCRM(sh, lin, C);
  } else {
    sairDoCRM(sh, lin, C);
  }
}
 
/* ---------------------------------------------------------- movimentos */
 
function entrarNoCRM(sh, lin, C){
  const crm = sh.getParent().getSheetByName(CRM);
  const k   = chaveDe(sh, lin, C);
  if (!k.v || procurar(crm, k)) return;
 
  const link = String(val(sh, lin, C.link) || '');
  const nova = crm.getLastRow() + 1;
 
  // Nicho (G) fica em branco de propósito: você preenche.
  crm.getRange(nova, C_LEAD, 1, 6).setValues([[
    val(sh, lin, C.nome),
    val(sh, lin, C.emp),
    val(sh, lin, C.ig)  || '',
    link,
    String(val(sh, lin, C.tel)).trim(),
    val(sh, lin, C.fat) || ''
  ]]);
 
  crm.getRange(nova, C_DATA1).setValue(new Date()).setNumberFormat('dd/MM/yyyy');
  if (link) crm.getRange(nova, C_LINK).setFormula('=HYPERLINK("' + link + '";"' + link + '")');
  crm.getRange(nova, 1, 1, C_OBS).setFontFamily(FONTE);
}
 
function sairDoCRM(sh, lin, C){
  const ss  = sh.getParent();
  const crm = ss.getSheetByName(CRM);
  const lix = ss.getSheetByName(LIXEIRA);
  const r   = procurar(crm, chaveDe(sh, lin, C));
  if (!r) return;
  const v = crm.getRange(r, 1, 1, crm.getLastColumn()).getValues();
  lix.getRange(lix.getLastRow() + 1, 1, 1, v[0].length).setValues(v);
  crm.deleteRow(r);
}
 
function procurar(crm, k){
  const n = crm.getLastRow();
  if (n < 2 || !k.v) return 0;
  if (k.tipo === 'tel'){
    const col = crm.getRange(2, C_TEL, n - 1, 1).getValues();
    for (var i = 0; i < col.length; i++)
      if (String(col[i][0]).trim() === k.v) return i + 2;
    return 0;
  }
  const ab = crm.getRange(2, C_LEAD, n - 1, 2).getValues();
  for (var j = 0; j < ab.length; j++)
    if (norm(ab[j][0]) + '|' + norm(ab[j][1]) === k.v) return j + 2;
  return 0;
}
 
/* --------------------------------------------------------- configurar */
 
function listaSimNao(){
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(['Sim', 'Não'], true)
    .setAllowInvalid(false)
    .build();
}
 
function horarios(){
  var h = [];
  for (var i = 7; i <= 21; i++){
    h.push(('0' + i).slice(-2) + ':00');
    h.push(('0' + i).slice(-2) + ':30');
  }
  return h;
}
 
/** Roda tudo: fonte, dropdowns, cores, aba oculta, calendário e horário.
 *  Pode rodar quantas vezes quiser. Rode de novo ao criar uma aba. */
function configurar(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var abas = [];
 
  // 1) Fonte Poppins em tudo
  ss.getSheets().forEach(function(sh){
    const lr = Math.max(sh.getMaxRows(), 1);
    const lc = Math.max(sh.getMaxColumns(), 1);
    sh.getRange(1, 1, lr, lc).setFontFamily(FONTE);
  });
 
  // 2) Abas de apoio ocultas
  OCULTAR.forEach(function(n){
    const sh = ss.getSheetByName(n);
    if (sh) sh.hideSheet();
  });
 
  // 3) Abas de leads: dropdown Sim/Não + linha verde quando Sim
  ss.getSheets().forEach(function(sh){
    if (!ehAbaDeLeads(sh)) return;
    const C = colunas(sh);
    const n = sh.getLastRow() - 1;
    if (n < 1) return;
 
    const L  = colunaLetra(C.check);
    const rg = sh.getRange(2, C.check, n, 1);
    rg.setDataValidation(listaSimNao());
    rg.setHorizontalAlignment('center');
    rg.getValues().forEach(function(x, i){
      if (String(x[0]).trim() === '') rg.getCell(i + 1, 1).setValue('Não');
    });
 
    if (C.valid > 0){
      const rv = sh.getRange(2, C.valid, n, 1);
      rv.setDataValidation(listaSimNao());
      rv.setHorizontalAlignment('center');
      rv.getValues().forEach(function(x, i){
        if (String(x[0]).trim() === '') rv.getCell(i + 1, 1).setValue('Sim');
      });
    }
 
    const alvo  = sh.getRange(2, 1, n, sh.getLastColumn());
    const regras = [];
    if (C.valid > 0){
      regras.push(SpreadsheetApp.newConditionalFormatRule()   // inválido ganha do verde
        .whenFormulaSatisfied('=$' + colunaLetra(C.valid) + '2="Não"')
        .setBackground(VERMELHO).setFontColor(T_VERM)
        .setRanges([alvo]).build());
    }
    regras.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + L + '2="Sim"')
      .setBackground(VERDE).setFontColor(T_VERDE)
      .setRanges([alvo]).build());
    sh.setConditionalFormatRules(regras);
 
    sh.setFrozenRows(1);
    abas.push(sh.getName() + ' (' + n + ')');
  });
 
  // 4) Aba CRM
  const crm = ss.getSheetByName(CRM);
  if (crm){
    crm.setFrozenRows(1);
    crm.setFrozenColumns(1);
 
    SIMNAO.forEach(function(c){
      crm.getRange(2, c, LINHAS - 1, 1).setDataValidation(listaSimNao())
         .setHorizontalAlignment('center');
    });
 
    crm.getRange(2, C_DATAR, LINHAS - 1, 1)
       .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build())
       .setNumberFormat('dd/MM/yyyy').setHorizontalAlignment('center');
 
    crm.getRange(2, C_HORAR, LINHAS - 1, 1)
       .setDataValidation(SpreadsheetApp.newDataValidation()
         .requireValueInList(horarios(), true).setAllowInvalid(false).build())
       .setHorizontalAlignment('center');
 
    crm.getRange(2, C_DATA1, LINHAS - 1, 1).setNumberFormat('dd/MM/yyyy');
    FUPS.forEach(function(c){
      crm.getRange(2, c + 1, LINHAS - 1, 1).setNumberFormat('dd/MM/yyyy');
    });
 
    const tudo = crm.getRange(2, 1, LINHAS - 1, C_OBS);
    crm.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule()      // fechado ganha de todos
        .whenFormulaSatisfied('=$' + colunaLetra(C_FECH) + '2="Sim"')
        .setBackground(VERDE).setFontColor(T_VERDE).setRanges([tudo]).build(),
      SpreadsheetApp.newConditionalFormatRule()      // depois perdido
        .whenFormulaSatisfied('=$' + colunaLetra(C_PERD) + '2="Sim"')
        .setBackground(VERMELHO).setFontColor(T_VERM).setRanges([tudo]).build(),
      SpreadsheetApp.newConditionalFormatRule()      // por último reunião
        .whenFormulaSatisfied('=$' + colunaLetra(C_REUN) + '2="Sim"')
        .setBackground(AMARELO).setFontColor(T_AMAR).setRanges([tudo]).build()
    ]);
  }
 
  SpreadsheetApp.getUi().alert(
    'Planilha configurada.\n\n' +
    'Fonte Poppins aplicada, abas de apoio ocultas, dropdowns e cores no lugar.\n\n' +
    'Abas de leads ativas (' + abas.length + '):\n' + abas.join('\n')
  );
}
 
function colunaLetra(n){
  var s = '';
  while (n > 0){
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = (n - r - 1) / 26;
  }
  return s;
}
 
function onOpen(){
  SpreadsheetApp.getUi()
    .createMenu('CRM')
    .addItem('Configurar planilha', 'configurar')
    .addItem('Sincronizar CRM com os marcados', 'sincronizar')
    .addSeparator()
    .addItem('Mostrar abas de apoio', 'mostrarApoio')
    .addToUi();
}
 
function mostrarApoio(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  OCULTAR.forEach(function(n){
    const sh = ss.getSheetByName(n);
    if (sh) sh.showSheet();
  });
}
 
/** Garante que todo lead com "Sim" esteja no CRM.
 *  Use quando marcar vários de uma vez colando valores — nesse caso o
 *  onEdit do Google não dispara. */
function sincronizar(){
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const crm = ss.getSheetByName(CRM);
  var add = 0;
  ss.getSheets().forEach(function(sh){
    if (!ehAbaDeLeads(sh)) return;
    const C = colunas(sh);
    const n = sh.getLastRow() - 1;
    if (n < 1) return;
    const marc = sh.getRange(2, C.check, n, 1).getValues();
    for (var i = 0; i < marc.length; i++){
      if (sim(marc[i][0])){
        if (C.valid > 0 && norm(sh.getRange(i + 2, C.valid).getValue()) === 'não') continue;
        const antes = crm.getLastRow();
        entrarNoCRM(sh, i + 2, C);
        if (crm.getLastRow() > antes) add++;
      }
    }
  });
  SpreadsheetApp.getUi().alert(add + ' lead(s) adicionados ao CRM.');
}