/* Comportamento comum dos 5 mockups da aba Demandas. Dados fictícios, nada vai para o banco. */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var ic = function (n, c) { return '<svg class="ic' + (c ? ' ' + c : '') + '"><use href="#i-' + n + '"/></svg>'; };

  var CLIENTES = { 'Clínica Aurora': 200, 'Studio Lume': 320, 'Brasa & Cia': 35, 'Nova Odonto': 175, 'Atlas Imóveis': 255 };
  var COLS = ['Fazer hoje', 'Fazer amanhã', 'Fazer depois de amanhã', 'Feito'];
  var D = [
    { id: 1, t: 'Subir criativos da campanha de dezembro', c: 'Clínica Aurora', col: 0, d: 'Hoje', coroa: 1, n: 'Três vídeos 9:16 e dois carrosséis. Conferir legenda e UTM antes de publicar.' },
    { id: 2, t: 'Revisar orçamento diário do Google Ads', c: 'Atlas Imóveis', col: 0, d: 'Atrasada 2d', late: 1, n: 'Verba da semana caiu abaixo do previsto. Rever lances.' },
    { id: 3, t: 'Reunião de alinhamento mensal', c: 'Studio Lume', col: 0, d: 'Hoje', rec: 1, n: 'Pauta: resultados de novembro e plano de janeiro.' },
    { id: 4, t: 'Responder briefing da landing page', c: 'Nova Odonto', col: 0, d: 'Hoje', n: 'Cliente pediu três opções de título.' },
    { id: 5, t: 'Configurar conversões offline', c: 'Brasa & Cia', col: 0, d: 'Hoje', n: 'Importar planilha de vendas do balcão.' },
    { id: 6, t: 'Relatório semanal de performance', c: 'Clínica Aurora', col: 1, d: 'Amanhã', rec: 1, n: 'Fechar PDF com os dados de segunda a domingo.' },
    { id: 7, t: 'Pausar campanhas de Black Friday', c: 'Brasa & Cia', col: 1, d: 'Amanhã', soon: 1, n: 'Confirmar com o cliente antes de pausar.' },
    { id: 8, t: 'Aprovar arte do post de Natal', c: 'Studio Lume', col: 1, d: 'Amanhã', coroa: 1, n: 'Arte v3 no Drive.' },
    { id: 9, t: 'Criar público semelhante de compradores', c: 'Atlas Imóveis', col: 2, d: 'Em 2 dias', n: 'Base: últimos 180 dias.' },
    { id: 10, t: 'Atualizar painel de métricas', c: 'Nova Odonto', col: 2, d: 'Em 2 dias', rec: 1, n: 'Conferir se o pixel está disparando.' },
    { id: 11, t: 'Enviar nota fiscal de novembro', c: 'Studio Lume', col: 3, d: 'Ontem', done: 1, n: 'Enviada por e-mail.' },
    { id: 12, t: 'Ajustar segmentação do remarketing', c: 'Clínica Aurora', col: 3, d: 'Ontem', done: 1, n: 'Excluídos visitantes de menos de 5 segundos.' },
    { id: 13, t: 'Subir negativação de palavras-chave', c: 'Atlas Imóveis', col: 3, d: 'Ontem', done: 1, n: 'Lista com 42 termos.' },
    { id: 14, t: 'Cobrar aprovação do orçamento', c: 'Brasa & Cia', col: 3, d: 'Seg', done: 1, n: 'Cliente respondeu e aprovou.' }
  ];
  var AGEN = [
    { id: 'a1', t: 'Renovar contrato de hospedagem', c: 'Atlas Imóveis', d: '25 jan 2027', desce: 'desce para o quadro em 6 dias' },
    { id: 'a2', t: 'Campanha de volta às aulas: subir criativos', c: 'Studio Lume', d: '02 fev 2027', desce: 'desce para o quadro em 14 dias' },
    { id: 'a3', t: 'Revisão trimestral de verba', c: 'Clínica Aurora', d: '15 fev 2027', desce: 'desce para o quadro em 27 dias' }
  ];
  var nextId = 100;
  var view = 'board', filtro = 'Todas', busca = '';

  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function av(c, cls) {
    return '<span class="av ' + (cls || '') + '" style="--h:' + CLIENTES[c] + '">' + c.charAt(0) + '</span>';
  }
  function dateCls(x) { return x.late ? 'late' : x.soon ? 'soon' : ''; }
  function visiveis() {
    var q = norm(busca);
    return D.filter(function (x) {
      if (filtro === 'Coroa' && !x.coroa) return false;
      if (filtro === 'Recorrentes' && !x.rec) return false;
      if (filtro === 'Atrasadas' && !x.late) return false;
      return !q || norm(x.t + ' ' + x.c).indexOf(q) >= 0;
    });
  }

  function cardHTML(x, i) {
    return '<article class="card' + (x.done ? ' done' : '') + '" draggable="true" data-id="' + x.id + '" tabindex="0" style="--i:' + i + '">' +
      '<button class="ok-btn" type="button" aria-label="Marcar como feita" data-ok="' + x.id + '">' + ic('check') + '</button>' +
      '<h3 class="t">' + x.t + '</h3>' +
      '<div class="meta"><span class="tag">' + av(x.c, 'sm') + x.c + '</span>' +
      '<span class="date ' + dateCls(x) + '">' + ic('clock') + x.d + '</span>' +
      (x.rec ? '<span class="date" title="Recorrente">' + ic('repeat') + '</span>' : '') +
      (x.coroa ? '<span class="crown" title="Coroa">' + ic('crown') + '</span>' : '') + '</div></article>';
  }

  function renderFiltros() {
    $('#filters').innerHTML = ['Todas', 'Coroa', 'Recorrentes', 'Atrasadas'].map(function (f) {
      return '<button type="button" class="chip' + (f === filtro ? ' on' : '') + '" data-f="' + f + '">' + f + '</button>';
    }).join('');
  }

  function renderBoard() {
    var v = visiveis(), n = 0;
    $('#board').innerHTML = COLS.map(function (name, ci) {
      var xs = v.filter(function (x) { return x.col === ci; });
      return '<div class="col" data-col="' + ci + '"><div class="col-h"><span class="dot" style="--c:' + ['var(--pri)', 'var(--warn)', 'var(--fg-3)', 'var(--ok)'][ci] + '"></span>' + name + '<span class="ct">' + xs.length + '</span>' +
        '<button class="icon-btn" type="button" data-open="nova" aria-label="Nova demanda em ' + name + '">' + ic('plus') + '</button></div>' +
        '<div class="cards">' + (xs.length ? xs.map(function (x) { return cardHTML(x, n++); }).join('') : '<div class="empty">Nada por aqui</div>') + '</div></div>';
    }).join('');
  }

  function renderList() {
    var v = visiveis();
    $('#list').innerHTML = '<table><thead><tr><th>Demanda</th><th>Cliente</th><th>Coluna</th><th>Entrega</th><th></th></tr></thead><tbody>' +
      v.map(function (x) {
        return '<tr data-id="' + x.id + '"><td class="t">' + x.t + '</td><td><span class="tag">' + av(x.c, 'sm') + x.c + '</span></td><td>' + COLS[x.col] + '</td>' +
          '<td><span class="date ' + dateCls(x) + '">' + x.d + '</span></td><td>' + (x.coroa ? '<span class="crown">' + ic('crown') + '</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function render() {
    renderFiltros();
    if (view === 'board') renderBoard(); else renderList();
    $('#board').hidden = view !== 'board';
    $('#list').hidden = view !== 'list';
    $$('.seg [data-view]').forEach(function (b) { b.classList.toggle('on', b.dataset.view === view); });
    $('.nav .n').textContent = D.filter(function (x) { return !x.done; }).length;
  }

  function toast(msg) {
    var t = $('#toast');
    t.innerHTML = ic('check') + msg; t.classList.add('on');
    clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }

  /* camadas */
  var lastFocus = null;
  function openLayer(el, withScrim) {
    lastFocus = document.activeElement;
    el.hidden = false;
    if (withScrim) $('#scrim').hidden = false;
    var f = $('input,textarea,button,select', el); if (f) f.focus({ preventScroll: true });
  }
  function closeAll() {
    var dr = $('#drawer');
    var fim = function () { dr.hidden = true; dr.classList.remove('out'); };
    if (!dr.hidden) { dr.classList.add('out'); setTimeout(fim, 200); }
    $('#scrim').hidden = true; $('#modal').hidden = true; $('#cmdk').hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function openDrawer(html) { $('#drawer').classList.remove('out'); $('#drawer').innerHTML = html; openLayer($('#drawer'), true); }

  function openDetail(id) {
    var x = D.filter(function (y) { return y.id === id; })[0]; if (!x) return;
    openDrawer('<header><h2 id="dr-title">' + x.t + '</h2><button class="icon-btn" data-close aria-label="Fechar">' + ic('x') + '</button></header>' +
      '<div class="body"><dl class="props">' +
      '<dt>Cliente</dt><dd><span class="tag">' + av(x.c, 'sm') + x.c + '</span></dd>' +
      '<dt>Coluna</dt><dd>' + COLS[x.col] + '</dd>' +
      '<dt>Entrega</dt><dd><span class="date ' + dateCls(x) + '">' + ic('clock') + x.d + '</span></dd>' +
      '<dt>Prioridade</dt><dd>' + (x.coroa ? '<span class="crown" style="margin:0">' + ic('crown') + '</span> Coroa' : 'Normal') + '</dd>' +
      '<dt>Recorrência</dt><dd>' + (x.rec ? ic('repeat') + ' Semanal' : 'Não repete') + '</dd></dl>' +
      '<div><p class="sub">Descrição</p><div class="note">' + x.n + '</div></div>' +
      '<div><p class="sub">Atividade</p><ul class="tl"><li>' + av('Studio Lume', 'sm') + 'Você criou esta demanda<span>há 3 dias</span></li><li>' + av('Studio Lume', 'sm') + 'Movida para ' + COLS[x.col] + '<span>ontem</span></li></ul></div></div>' +
      '<footer><button class="btn primary" data-done="' + x.id + '">' + ic('check') + (x.done ? 'Reabrir' : 'Marcar como feita') + '</button><button class="btn">' + ic('edit') + 'Editar</button><span class="sp" style="flex:1"></span><button class="btn" data-del="' + x.id + '">' + ic('trash') + 'Excluir</button></footer>');
  }

  function openAgendadas() {
    openDrawer('<header><h2 id="dr-title">Tarefas agendadas</h2><button class="icon-btn" data-close aria-label="Fechar">' + ic('x') + '</button></header>' +
      '<div class="body"><p class="hint" style="margin:0">Elas descem sozinhas para depois de amanhã, amanhã e hoje, conforme a data chega.</p><div class="sched">' +
      AGEN.map(function (a, i) {
        return '<div class="sched-i" style="--i:' + i + '"><b>' + a.t + '</b><small>' + a.d + ' · ' + a.desce + '</small>' +
          '<span class="tag" style="align-self:flex-start">' + av(a.c, 'sm') + a.c + '</span>' +
          '<div class="sched-a"><button class="btn" data-adone="' + a.id + '">' + ic('check') + 'Feita</button><button class="btn">' + ic('edit') + 'Editar</button><button class="btn" data-adel="' + a.id + '">' + ic('trash') + 'Excluir</button></div></div>';
      }).join('') + '</div></div>');
    $('#drawer').setAttribute('aria-labelledby', 'dr-title');
  }

  function openForm(mode) {
    var ag = mode === 'agendar';
    $('#m-title').textContent = ag ? 'Agendar tarefa' : 'Nova demanda';
    $('#m-hint').textContent = ag ? 'Ela fica guardada e desce sozinha para o quadro quando a data chegar.' : 'Preencha o essencial. O resto pode ser editado depois.';
    $('#m-ok').textContent = ag ? 'Agendar' : 'Criar demanda';
    $('#f-col').hidden = ag; $('#f-date').hidden = !ag; $('#rec').hidden = ag;
    $('#form').dataset.mode = mode;
    openLayer($('#modal'), false);
  }

  /* ligações */
  document.addEventListener('click', function (e) {
    var t = e.target;
    var o = t.closest('[data-open]');
    if (o) {
      var k = o.dataset.open;
      if (k === 'cmdk') { openCmd(); } else if (k === 'agendadas') { openAgendadas(); } else { openForm(k); }
      return;
    }
    if (t.closest('[data-close]') || t === $('#scrim') || t === $('#modal') || t === $('#cmdk')) { closeAll(); return; }
    var ok = t.closest('[data-ok]');
    if (ok) { e.stopPropagation(); var x = D.filter(function (y) { return y.id === +ok.dataset.ok; })[0]; x.done = !x.done; x.col = x.done ? 3 : 0; render(); toast(x.done ? 'Demanda concluída' : 'Demanda reaberta'); return; }
    var dn = t.closest('[data-done]');
    if (dn) { var y = D.filter(function (z) { return z.id === +dn.dataset.done; })[0]; y.done = !y.done; y.col = y.done ? 3 : 0; closeAll(); render(); toast(y.done ? 'Demanda concluída' : 'Demanda reaberta'); return; }
    var dl = t.closest('[data-del]');
    if (dl) { D = D.filter(function (z) { return z.id !== +dl.dataset.del; }); closeAll(); render(); toast('Demanda excluída'); return; }
    var ad = t.closest('[data-adone],[data-adel]');
    if (ad) { var id = ad.dataset.adone || ad.dataset.adel; AGEN = AGEN.filter(function (a) { return a.id !== id; }); $$('.pill').forEach(function (p) { p.textContent = AGEN.length; }); openAgendadas(); toast(ad.dataset.adone ? 'Agendada marcada como feita' : 'Agendada excluída'); return; }
    var f = t.closest('[data-f]'); if (f) { filtro = f.dataset.f; render(); return; }
    var vv = t.closest('[data-view]'); if (vv) { view = vv.dataset.view; render(); return; }
    var cd = t.closest('.card'); if (cd) { openDetail(+cd.dataset.id); return; }
    var tr = t.closest('tr[data-id]'); if (tr) { openDetail(+tr.dataset.id); return; }
    var sw = t.closest('.tgl'); if (sw) { sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true'); return; }
    var sg = t.closest('.seg.full button'); if (sg) { $$('button', sg.parentNode).forEach(function (b) { b.classList.toggle('on', b === sg); }); return; }
    if (t.closest('#mode')) { var m = document.documentElement.dataset.mode === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.mode = m; try { localStorage.setItem('lab-mode', m); } catch (er) {} icoModo(); return; }
  });

  $('#q').addEventListener('input', function (e) { busca = e.target.value; render(); });
  $('#form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, ag = f.dataset.mode === 'agendar';
    if (ag) { AGEN.push({ id: 'a' + (++nextId), t: f.t.value, c: f.c.value, d: '25 jan 2027', desce: 'desce para o quadro em 6 dias' }); $$('.pill').forEach(function (p) { p.textContent = AGEN.length; }); }
    else { D.unshift({ id: ++nextId, t: f.t.value, c: f.c.value, col: Math.max(0, f.col.selectedIndex), d: ['Hoje', 'Amanhã', 'Em 2 dias'][f.col.selectedIndex] || 'Hoje' }); }
    f.reset(); closeAll(); render(); toast(ag ? 'Tarefa agendada' : 'Demanda criada');
  });
  $('#form').c.addEventListener('change', function (e) { $('.sel .av').textContent = e.target.value.charAt(0); $('.sel .av').style.setProperty('--h', CLIENTES[e.target.value]); });
  $('.sel .av').style.setProperty('--h', CLIENTES['Clínica Aurora']);

  /* arrastar entre colunas */
  var arr = null;
  document.addEventListener('dragstart', function (e) { var c = e.target.closest && e.target.closest('.card'); if (!c) return; arr = +c.dataset.id; c.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', arr); } catch (er) {} });
  document.addEventListener('dragend', function () { $$('.drag,.over').forEach(function (n) { n.classList.remove('drag', 'over'); }); arr = null; });
  document.addEventListener('dragover', function (e) { var c = e.target.closest && e.target.closest('.col'); if (!c || arr == null) return; e.preventDefault(); $$('.col.over').forEach(function (n) { if (n !== c) n.classList.remove('over'); }); c.classList.add('over'); });
  document.addEventListener('drop', function (e) { var c = e.target.closest && e.target.closest('.col'); if (!c || arr == null) return; e.preventDefault(); var x = D.filter(function (y) { return y.id === arr; })[0]; x.col = +c.dataset.col; x.done = x.col === 3; render(); toast('Movida para ' + COLS[x.col]); });

  /* paleta de comandos */
  var CMDS = [['Ir para Demandas', 'check', 'G D'], ['Ir para Início', 'home', 'G I'], ['Ir para Agenda', 'cal', 'G A'], ['Ir para Clientes', 'users', 'G C'], ['Ir para Saldo', 'wallet', 'G S'],
    ['Nova demanda', 'plus', 'N'], ['Agendar tarefa', 'calplus', 'A'], ['Ver tarefas agendadas', 'clock', ''], ['Alternar tema claro e escuro', 'sun', 'T']];
  var cmdSel = 0;
  function cmdList() {
    var q = norm($('#cmd-q').value);
    var xs = CMDS.filter(function (c) { return !q || norm(c[0]).indexOf(q) >= 0; });
    cmdSel = Math.min(cmdSel, Math.max(0, xs.length - 1));
    $('#cmd-list').innerHTML = xs.map(function (c, i) { return '<li class="' + (i === cmdSel ? 'sel' : '') + '" data-i="' + i + '">' + ic(c[1]) + c[0] + '<small>' + c[2] + '</small></li>'; }).join('') || '<li>Nada encontrado</li>';
    return xs;
  }
  function openCmd() { $('#cmd-q').value = ''; cmdSel = 0; cmdList(); openLayer($('#cmdk'), false); $('#cmd-q').focus(); }
  function runCmd(c) {
    closeAll();
    if (!c) return;
    if (c[0] === 'Nova demanda') openForm('nova'); else if (c[0] === 'Agendar tarefa') openForm('agendar');
    else if (c[0].indexOf('agendadas') > 0) openAgendadas(); else if (c[0].indexOf('tema') > 0) $('#mode').click();
  }
  $('#cmd-q').addEventListener('input', function () { cmdSel = 0; cmdList(); });
  $('#cmd-list').addEventListener('click', function (e) { var li = e.target.closest('li[data-i]'); if (li) runCmd(cmdList()[+li.dataset.i]); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeAll(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmd(); return; }
    if (!$('#cmdk').hidden) {
      var xs = cmdList();
      if (e.key === 'ArrowDown') { e.preventDefault(); cmdSel = (cmdSel + 1) % xs.length; cmdList(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); cmdSel = (cmdSel - 1 + xs.length) % xs.length; cmdList(); }
      if (e.key === 'Enter') { e.preventDefault(); runCmd(xs[cmdSel]); }
    } else if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('card')) { openDetail(+e.target.dataset.id); }
  });

  function icoModo() { var b = $('#mode use'); b.setAttribute('href', document.documentElement.dataset.mode === 'dark' ? '#i-sun' : '#i-moon'); }
  icoModo(); render();
})();
