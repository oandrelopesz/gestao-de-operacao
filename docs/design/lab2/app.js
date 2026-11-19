/* Comportamento comum das duas aparências da aba Demandas (laboratório 2). Dados fictícios, nada vai para o banco.
   Reproduz a aba Demandas como ela é hoje (index.tsx, KanbanColumn, KanbanCard, SelecaoBarra, DemandaDrawer,
   AgendadasSheet, DemandaForm): cabeçalho, previsão de recorrências, busca, seleção em massa, as 7 colunas com as
   regras de data, cartões, lista, painel lateral, Agendar, Agendadas, Nova, colunas editáveis e arrastar.
   Cada aparência define window.DIR com ganchos opcionais: colExtra(col, cards, h) devolve HTML extra sob o cabeçalho
   da coluna, after(h) roda a cada render e boot(h) roda uma vez. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ic = (n, c) => `<svg class="ic${c ? ' ' + c : ''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const DIR = window.DIR || {};
  const FORA = 'Neste mockup só a aba Demandas existe';

  /* ícones (Lucide, os mesmos do sistema) */
  const P = {
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    cal: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    caldays: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
    calclock: '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    crown: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    kanban: '<path d="M6 5v11"/><path d="M12 5v6"/><path d="M18 5v14"/>',
    list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
    building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
    unlink: '<path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/><line x1="8" x2="8" y1="2" y2="5"/><line x1="2" x2="5" y1="8" y2="8"/><line x1="16" x2="16" y1="19" y2="22"/><line x1="19" x2="22" y1="16" y2="16"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    chevup: '<path d="m18 15-6-6-6 6"/>',
    chevdown: '<path d="m6 9 6 6 6-6"/>',
    arrows: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
    checksq: '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    listplus: '<path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="M18 9v6"/><path d="M21 12h-6"/>',
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>'
  };
  document.body.insertAdjacentHTML('afterbegin', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    Object.keys(P).map(k => `<symbol id="i-${k}" viewBox="0 0 24 24">${P[k]}</symbol>`).join('') + '</defs></svg>');

  /* datas: o mockup vive numa quinta, 19 de novembro de 2026 */
  const HOJE = new Date(2026, 10, 19);
  const SEM = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const SEM_L = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const DIA_N = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const pad = n => (n < 10 ? '0' : '') + n;
  const em = n => { const d = new Date(HOJE); d.setDate(d.getDate() + n); return d; };
  const ddmm = n => { const d = em(n); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); };
  const isoDe = n => { const d = em(n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const offDe = iso => Math.round((new Date(iso + 'T00:00') - HOJE) / 864e5);
  const offDia = wd => (wd - HOJE.getDay() + 7) % 7;
  const plural = (n, s, p) => n + ' ' + (n === 1 ? s : p);
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  /* agências, clientes e colunas (as 7 padrão do sistema, com as cores e regras de data reais) */
  const AG = { effect: ['Effect', 'oklch(0.58 0.17 255)'], spike: ['Spike', 'oklch(0.56 0.2 305)'], pessoais: ['Pessoais', 'oklch(0.6 0.14 160)'], alt: ['Alt', 'oklch(0.68 0.15 70)'] };
  const CLI = { 'Clínica Aurora': 'effect', 'Atlas Imóveis': 'effect', 'Studio Lume': 'spike', 'Brasa & Cia': 'spike', 'Nova Odonto': 'pessoais', 'Lumen Tech': 'pessoais', 'Casa Verde': 'alt' };
  let COLS = [
    { id: 'recorrentes', t: 'Recorrentes', cor: '#64748b', sis: 1, regra: 'nenhuma', vazio: 'Sem tarefas recorrentes' },
    { id: 'fazer_hoje', t: 'Fazer hoje', cor: '#ef4444', regra: 'hoje', vazio: 'Nada pra hoje' },
    { id: 'fazer_amanha', t: 'Fazer amanhã', cor: '#eab308', regra: 'amanha', vazio: 'Vazio' },
    { id: 'fazer_depois_amanha', t: 'Fazer depois de amanhã', cor: '#f97316', regra: 'depois_amanha', vazio: 'Vazio' },
    { id: 'fazer_fim_de_semana', t: 'Fazer no fim de semana', cor: '#8b5cf6', sis: 1, regra: 'dias_semana', dias: [6, 0], vazio: 'Nada pro fim de semana' },
    { id: 'standby', t: 'Standby', cor: '#3b82f6', regra: 'nenhuma', vazio: 'Sem pendências' },
    { id: 'feito', t: 'Feito', cor: '#22c55e', sis: 1, regra: 'nenhuma', vazio: 'Nenhuma tarefa concluída' }
  ];
  const col = id => COLS.find(c => c.id === id);
  const FREQ = ['Diária', 'Semanal', 'Quinzenal', 'Mensal', 'Customizada'];
  const FREQ_D = ['Todos os dias', 'Uma vez por semana', 'A cada 15 dias', 'Mesmo dia todo mês', 'Intervalo de dias'];
  const TODOS = [0, 1, 2, 3, 4, 5, 6];

  /* demandas: p = entrega em dias a partir de hoje (null = sem entrega); rec = recorrente; pai = cópia de recorrente */
  let D = [
    { id: 1, t: 'Relatórios semanais Effect', col: 'recorrentes', ag: 'effect', rec: { freq: 'Semanal', wd: [5], prox: 1, st: 'OK' }, criado: 'há 7 meses' },
    { id: 2, t: 'Conferir saldo das contas de anúncio', col: 'recorrentes', ag: 'effect', rec: { freq: 'Diária', wd: TODOS, prox: 0, st: 'HOJE' }, criado: 'há 2 meses' },
    { id: 3, t: 'Relatórios semanais Alt', col: 'recorrentes', ag: 'alt', rec: { freq: 'Semanal', wd: [5], prox: 1, st: 'OK' }, criado: 'há 7 meses' },
    { id: 4, t: 'Fazer e agendar posts da Casa Verde', col: 'recorrentes', cli: ['Casa Verde'], rec: { freq: 'Semanal', wd: [1], prox: 4 }, criado: 'há 3 meses' },
    { id: 5, t: 'Mandar PIX semanal', col: 'recorrentes', cli: ['Clínica Aurora', 'Nova Odonto'], obs: 'Conferir os valores na planilha antes de mandar.', rec: { freq: 'Semanal', wd: [2], prox: 5 }, criado: 'há 5 meses' },
    { id: 10, t: 'Post de Natal da Clínica Aurora', col: 'fazer_hoje', cli: ['Clínica Aurora'], p: -1, coroa: 1, criado: 'há 4 dias' },
    { id: 11, t: 'Subir novas campanhas no Google Ads', col: 'fazer_hoje', cli: ['Atlas Imóveis'], p: -1, criado: 'há 3 dias' },
    { id: 12, t: 'Conferir saldo das contas de anúncio', col: 'fazer_hoje', ag: 'effect', p: 0, pai: 2, criado: 'hoje' },
    { id: 13, t: 'Revisar orçamento do Studio Lume', col: 'fazer_hoje', cli: ['Studio Lume'], p: 0, obs: 'Verba da semana caiu abaixo do previsto. Rever lances.', criado: 'há 2 dias' },
    { id: 14, t: 'Responder briefing da landing page', col: 'fazer_hoje', cli: ['Nova Odonto'], p: 0, onb: 1, criado: 'há 5 dias' },
    { id: 20, t: 'Conectar Alexa', col: 'fazer_amanha', pes: 1, p: 1, criado: 'há 1 dia' },
    { id: 21, t: 'Destrinchar precedentes do contrato', col: 'fazer_amanha', cli: ['Brasa & Cia'], p: 1, criado: 'há 6 dias' },
    { id: 22, t: 'Planejamento do trimestre da Lumen', col: 'fazer_amanha', cli: ['Lumen Tech'], p: 1, road: 1, criado: 'há 2 semanas' },
    { id: 23, t: 'Aprovar arte do carrossel', col: 'fazer_amanha', cli: ['Studio Lume'], p: 1, obs: 'Arte v3 no Drive.', criado: 'há 3 dias' },
    { id: 30, t: 'Criar público semelhante de compradores', col: 'fazer_depois_amanha', cli: ['Atlas Imóveis'], p: 2, criado: 'há 1 dia' },
    { id: 40, t: 'Organizar arquivos do Drive', col: 'fazer_fim_de_semana', pes: 1, dia: 6, p: 2, criado: 'há 4 dias' },
    { id: 50, t: 'Painel interno da Lumen', col: 'standby', cli: ['Lumen Tech'], criado: 'há 1 mês' },
    { id: 51, t: 'Continuar site da Nova Odonto', col: 'standby', cli: ['Nova Odonto'], criado: 'há 3 semanas' },
    { id: 52, t: 'Terminar integrações do e-commerce', col: 'standby', cli: ['Casa Verde'], criado: 'há 2 semanas' },
    { id: 53, t: 'Proposta de renovação do contrato', col: 'standby', ag: 'spike', criado: 'há 5 dias' },
    { id: 54, t: 'Estudar automação de relatórios', col: 'standby', pes: 1, obs: 'Ver se dá para puxar direto do painel.', criado: 'há 1 mês' },
    { id: 60, t: 'Mandar PIX semanal', col: 'feito', cli: ['Clínica Aurora', 'Nova Odonto'], p: -2, pai: 5, obs: 'Enviado.', criado: 'há 1 semana' },
    { id: 61, t: 'Subir criativos da Brasa & Cia', col: 'feito', cli: ['Brasa & Cia'], p: -2, criado: 'há 1 semana' },
    { id: 62, t: 'Ajustar remarketing da Clínica Aurora', col: 'feito', cli: ['Clínica Aurora'], p: -1, criado: 'há 5 dias' },
    { id: 63, t: 'Enviar nota fiscal de novembro', col: 'feito', pes: 1, p: -1, criado: 'há 3 dias' },
    { id: 70, t: 'Renovar contrato de hospedagem', col: 'agendadas', cli: ['Atlas Imóveis'], p: 6, criado: 'há 2 dias' },
    { id: 71, t: 'Campanha de volta às aulas: subir criativos', col: 'agendadas', cli: ['Studio Lume'], p: 14, criado: 'há 1 dia' },
    { id: 72, t: 'Revisão trimestral de verba', col: 'agendadas', pes: 1, p: 27, criado: 'hoje' }
  ];
  const GRUPOS = [
    ['Hoje', 'home', ['Início', 'Demandas', 'Agenda']],
    ['Clientes', 'users', ['Clientes', 'Onboarding', 'Roadmap', 'Saldo', 'NPS de clientes', 'Dados internos', 'Central de arquivos', 'Acessos', 'Fireflies', 'Calculadora de taxas']],
    ['Marketing e canais', 'trend', ['Instagram', 'Conteúdo', 'Google Meu Negócio', 'Swipe file', 'Gerador de UTM']],
    ['Comercial e dinheiro', 'wallet', ['CRM', 'Financeiro']],
    ['Meu cérebro', 'zap', ['Ideias', 'Notas', 'Links', 'Ver depois', 'Fluxogramas', 'Arquivos', 'Transcritor', 'Radar IA', 'Cursos', 'Livros', 'Habilidades']],
    ['Sistema', 'sliders', ['Dashboard', 'Admin']]
  ];

  let view = 'board', busca = '', qa = null, nextId = 1000, drId = null, drModo = null, editId = null;
  let sel = new Set(), modoSel = false, calN = 7, calOn = true, fDono = {}, fManual = false;
  try { calOn = localStorage.getItem('demandas_calendar_visible') !== 'false'; } catch (er) {}

  const byId = id => D.find(x => x.id === id);
  const recP = x => !!x.rec;
  const late = x => x.p != null && x.p < 0 && x.col !== 'feito' && !x.rec;
  const agsDe = x => x.pes ? [] : x.ag ? [x.ag] : [...new Set((x.cli || []).map(c => CLI[c]))];
  const donoTxt = x => x.pes ? 'Pessoal' : x.ag ? AG[x.ag][0] + ' (agência)' : (x.cli || []).join(' + ');
  const selecionadas = () => [...sel].map(byId).filter(Boolean);

  /* movimento: cartões deslizam ao reordenar (FLIP), concluir voa até o Feito, contadores pulsam */
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE = 'cubic-bezier(.16, 1, .3, 1)';
  let calVista = null, viewVista = null, colVista = new Map(), selVista = new Set(), ptr = [innerWidth - 40, 40];
  const pousando = new Set();
  document.addEventListener('pointerdown', e => { ptr = [e.clientX, e.clientY]; }, true);
  const anima = (el, kf, op) => (!reduz && el && el.animate) ? el.animate(kf, op) : null;
  const CHEGA = [{ opacity: 0, transform: 'translateY(10px) scale(.93)' }, { opacity: 1, transform: 'none' }];
  function pouso(e) {
    anima(e, [{ transform: 'scale(.9)', opacity: 0 }, { transform: 'scale(1.04)', opacity: 1, offset: .55 }, { transform: 'none' }], { duration: 520, easing: EASE });
    anima(e, [{ boxShadow: '0 0 0 0 color-mix(in oklch, var(--c-green) 75%, transparent)' }, { boxShadow: '0 0 0 7px color-mix(in oklch, var(--c-green) 0%, transparent)' }], { duration: 760, easing: 'ease-out' });
  }
  function bumpCol(id) {
    const c = $(`.col[data-col="${id}"]`); if (!c) return;
    anima(c.querySelector('.ch-c'), [{ transform: 'scale(1.5)' }, { transform: 'none' }], { duration: 520, easing: EASE });
    const b = c.querySelector('.blk b');
    if (b) anima(b, [{ transform: 'translateY(55%)', opacity: .2 }, { transform: 'none', opacity: 1 }], { duration: 560, easing: EASE });
  }
  function confete(x, y, n, forca) {
    if (reduz) return;
    const cores = ['var(--c-green)', 'var(--accent)', 'var(--c-amber)', 'var(--c-indigo)'];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i'); p.className = 'conf';
      p.style.cssText = `left:${x}px;top:${y}px;background:${cores[i % 4]};width:${5 + i % 4}px;height:${5 + (i * 3) % 4}px;border-radius:${i % 3 ? '1px' : '50%'}`;
      document.body.appendChild(p);
      const a = Math.random() * Math.PI * 2, d = (40 + Math.random() * 70) * forca, dx = Math.cos(a) * d, dy = Math.sin(a) * d - 30 * forca;
      p.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: .6 }, { transform: `translate(${dx * 1.1}px, ${dy + 50}px) rotate(${Math.random() * 540}deg)`, opacity: 0 }],
        { duration: 900 + Math.random() * 300, easing: 'cubic-bezier(.2, .8, .3, 1)' }).finished.then(() => p.remove(), () => p.remove());
    }
  }
  /* fazer hoje zerado: o círculo do dia pulsa e chove confete */
  function diaCompleto() {
    const g = $('.gauge'), r = g ? g.getBoundingClientRect() : { left: innerWidth / 2, top: 80, width: 0, height: 0 };
    anima(g, [{ transform: 'scale(1)' }, { transform: 'scale(1.14)', offset: .35 }, { transform: 'scale(1)' }], { duration: 700, easing: EASE });
    confete(r.left + r.width / 2, r.top + r.height / 2, 34, 2.2);
    toast('Dia concluído: tudo de hoje está feito!');
  }
  function carimbar(e) {
    if (reduz || !e) return;
    const s = document.createElement('span'); s.className = 'carimbo solo'; s.innerHTML = ic('check');
    e.appendChild(s); setTimeout(() => s.remove(), 950);
  }
  function movimento(ant, cont, barras, viewAnt) {
    if (reduz || viewAnt == null) return;
    if (viewAnt !== view) { /* troca Board/Lista: tudo entra em cascata */
      $$(view === 'board' ? '#board > *' : '#list > *').forEach((e, i) => anima(e, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: Math.min(i * 30, 330), easing: EASE, fill: 'backwards' }));
      return;
    }
    $$('.card[data-id]').forEach(e => {
      const id = +e.dataset.id, x = byId(id), a = ant.get(String(id)), r = e.getBoundingClientRect();
      if (pousando.has(id)) { e.style.visibility = 'hidden'; return; }
      const mudou = colVista.get(id) !== x.col;
      if (mudou && x.col === 'feito') return pouso(e);
      if (mudou || !a) return void anima(e, CHEGA, { duration: 340, easing: EASE });
      const dx = a.left - r.left, dy = a.top - r.top;
      if (Math.abs(dx) + Math.abs(dy) > 2) anima(e, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 440, easing: EASE });
    });
    $$('.col[data-col]').forEach(c => {
      const id = c.dataset.col, n = c.querySelector('.ch-c');
      if (cont[id] != null && cont[id] !== n.textContent && !(id === 'feito' && pousando.size)) bumpCol(id);
      const i = c.querySelector('.load i'), w = barras[id];
      if (i && w != null) { const nw = i.style.getPropertyValue('--w').trim(); if (nw !== w) anima(i, [{ width: w }, { width: nw }], { duration: 640, easing: EASE }); }
    });
    sel.forEach(id => {
      if (selVista.has(id)) return;
      anima($(`.card[data-id="${id}"] .c-sel`), [{ transform: 'scale(.4)' }, { transform: 'scale(1.3)', offset: .55 }, { transform: 'none' }], { duration: 320, easing: EASE });
    });
  }
  /* concluir: o cartão levanta, ganha o carimbo de feito e voa em arco até o lugar dele na coluna Feito */
  function voar(xs, fn) {
    const els = reduz ? [] : xs.map(x => $(`.card[data-id="${x.id}"]`)).filter(e => e && e.closest('#board')).slice(0, 8);
    if (!els.length) return fn();
    const gs = els.map((e, i) => {
      const r = e.getBoundingClientRect(), g = e.cloneNode(true), c = e.closest('.col');
      ['data-id', 'draggable', 'tabindex'].forEach(k => g.removeAttribute(k));
      g.classList.remove('sel', 'drag'); g.classList.add('voa');
      g.style.cssText = `top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px;` + (c ? `--cc:${c.style.getPropertyValue('--cc')}` : '');
      g.insertAdjacentHTML('beforeend', `<span class="carimbo" style="animation-delay:${i * 70 + 80}ms">${ic('check')}</span>`);
      document.body.appendChild(g);
      return { g, r, i, id: +e.dataset.id };
    });
    gs.forEach(o => pousando.add(o.id));
    const hojeAntes = D.some(y => y.col === 'fazer_hoje' && !recP(y));
    fn();
    const hojeZerou = hojeAntes && !D.some(y => y.col === 'fazer_hoje' && !recP(y));
    /* se o Feito está fora da tela, o quadro rola até ele enquanto os cartões voam */
    let rola = 0;
    const volta = $('#board').scrollLeft;
    const a0 = $(`.card[data-id="${gs[0].id}"]`), c0 = a0 && a0.closest('.col'), bd = $('#board');
    if (c0) {
      const cr = c0.getBoundingClientRect(), bb = bd.getBoundingClientRect();
      rola = cr.right > bb.right ? cr.right - bb.right + 16 : cr.left < bb.left ? cr.left - bb.left - 16 : 0;
      if (rola) bd.scrollBy({ left: rola, behavior: 'smooth' });
    }
    gs.forEach(o => {
      const fim = () => {
        o.g.remove(); pousando.delete(o.id);
        const n = $(`.card[data-id="${o.id}"]`);
        if (n) { n.style.visibility = ''; pouso(n); const r = n.getBoundingClientRect(); confete(r.left + r.width / 2, r.top + r.height / 2, 12, 1); }
        /* vai e volta: depois do pouso o quadro retorna para onde estava */
        if (!pousando.size && rola) setTimeout(() => bd.scrollTo({ left: volta, behavior: 'smooth' }), 800);
        if (!pousando.size) { bumpCol('feito'); if (hojeZerou) setTimeout(diaCompleto, 250); }
      };
      const alvo = $(`.card[data-id="${o.id}"]`);
      if (!alvo || !alvo.closest('.cards')) return fim();
      const t = alvo.getBoundingClientRect(), cx = alvo.closest('.cards').getBoundingClientRect(), b = bd.getBoundingClientRect();
      const tx = Math.min(Math.max(t.left - rola, b.left), b.right - o.r.width), ty = Math.min(Math.max(t.top, cx.top), cx.bottom - o.r.height);
      const dx = tx - o.r.left, dy = ty - o.r.top;
      const an = o.g.animate([
        { transform: 'none', easing: 'cubic-bezier(.2, .8, .3, 1)' },
        { transform: 'translateY(-12px) scale(1.045) rotate(-1.6deg)', offset: .22, easing: 'cubic-bezier(.5, 0, .3, 1)' },
        { transform: `translate(${dx * .6}px, ${dy * .6 - 36}px) rotate(1.4deg)`, offset: .62, easing: 'cubic-bezier(.25, .8, .3, 1)' },
        { transform: `translate(${dx}px, ${dy}px) rotate(0deg)` }
      ], { duration: 820, delay: o.i * 70, fill: 'both' });
      setTimeout(() => o.g.classList.add('done'), o.i * 70 + 200);
      an.finished.then(fim, fim);
    });
  }

  const h = {
    ic, GRUPOS, toast: m => toast(m), cols: () => COLS, doCol: id => D.filter(x => x.col === id),
    abertas: () => D.filter(x => x.col !== 'feito' && x.col !== 'agendadas' && !recP(x)).length,
    atrasadas: () => D.filter(late).length,
    agendadas: () => D.filter(x => x.col === 'agendadas').length,
    pct: () => { const f = D.filter(x => x.col === 'feito').length, a = D.filter(x => x.col === 'fazer_hoje').length; return Math.round(f / ((f + a) || 1) * 100); }
  };

  /* peças fixas: gaveta, formulário, diálogo, busca rápida, menu flutuante, barra de seleção e aviso */
  const CLI_OPT = '';
  document.body.insertAdjacentHTML('beforeend',
    '<div class="scrim" id="scrim" hidden></div>' +
    '<aside class="drawer" id="drawer" role="dialog" aria-label="Painel" hidden></aside>' +
    '<div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="m-title" hidden><form class="sheet" id="form" autocomplete="off" novalidate>' +
      '<header><div class="m-h"><h2 id="m-title">Nova Demanda</h2><p class="hint" id="m-hint"></p></div><button type="button" class="icon-btn" data-close aria-label="Fechar">' + ic('x') + '</button></header>' +
      '<label class="lbl">Título<input class="inp" name="t" placeholder="O que precisa ser feito?"></label>' +
      '<div class="lbl"><span>Cliente(s)</span><button type="button" class="inp pick" data-act="f-cli" id="f-cli">Sem cliente (opcional)</button></div>' + CLI_OPT +
      '<div class="row2"><label class="lbl" id="f-col">Coluna<select class="inp" name="col"></select></label>' +
      '<label class="lbl">Prioridade<select class="inp" name="pri"><option value="baixa">Baixa</option><option value="media" selected>Média</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label></div>' +
      '<div class="box" id="f-rec"><label class="chk"><span><b>Tarefa Recorrente</b><small>Repetir esta tarefa periodicamente</small></span><input type="checkbox" name="rec"></label>' +
        '<div class="row2" id="f-freq" hidden><label class="lbl">Frequência<select class="inp" name="freq">' + FREQ.map(f => `<option>${f}</option>`).join('') + '</select></label>' +
        '<label class="lbl">Intervalo (dias)<input class="inp" type="number" name="int" min="1" placeholder="Ex: 3"></label></div></div>' +
      '<label class="lbl"><span id="f-dl">Prazo (Opcional)</span><input class="inp" type="date" name="d"></label>' +
      '<label class="lbl">Descrição<textarea class="inp" name="n" rows="3" placeholder="Mais detalhes sobre a tarefa..."></textarea></label>' +
      '<footer><button type="submit" class="btn primary full" id="m-ok">Criar Demanda</button></footer>' +
    '</form></div>' +
    '<div class="modal" id="dlg" role="dialog" aria-modal="true" hidden></div>' +
    '<div class="cmdk" id="cmdk" role="dialog" aria-modal="true" aria-label="Buscar aba do menu" hidden><div class="cmd">' +
      '<label class="cmd-in">' + ic('search') + '<input id="cmd-q" placeholder="Buscar aba do menu" autocomplete="off" aria-label="Buscar aba do menu"></label><ul id="cmd-list" role="listbox"></ul>' +
      '<footer><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></footer>' +
    '</div></div>' +
    '<div class="pop" id="pop" hidden></div>' +
    '<div class="selbar" id="selbar" role="region" aria-label="Seleção em massa" hidden></div>' +
    '<div class="toast" id="toast" role="status" aria-live="polite"></div>');

  /* cabeçalho, previsão e barra acima do quadro: mesma ordem de hoje */
  $('#h-cal').innerHTML = '<button type="button" class="btn ghost cal-tg" data-act="cal-tg" aria-controls="cal"></button>';
  $('#h-acoes').innerHTML =
    '<div class="seg" role="group" aria-label="Visualização"><button type="button" data-view="board">' + ic('kanban') + 'Board</button><button type="button" data-view="list">' + ic('list') + 'Lista</button></div>' +
    '<button type="button" class="btn agendar" data-open="agendar">' + ic('calclock') + 'Agendar</button>' +
    '<button type="button" class="btn ghost" data-open="agendadas">Agendadas<span class="cnt" data-agendadas></span></button>' +
    '<button type="button" class="btn primary" data-open="nova">' + ic('plus') + 'Nova</button>';
  $('#barra').innerHTML =
    '<label class="search">' + ic('search') + '<input id="q" placeholder="Buscar..." aria-label="Buscar demandas"></label>' +
    '<button type="button" class="btn sel-b" data-act="sel-modo" title="Selecionar várias demandas para mover, concluir, atribuir cliente ou data de entrega"></button>' +
    '<p class="msg" id="msg" hidden></p>';

  /* previsão de recorrências */
  function renderCal() {
    const tg = $('[data-act="cal-tg"]');
    tg.innerHTML = ic('cal') + (calOn ? 'Ocultar Calendário' : 'Mostrar Calendário') + ic(calOn ? 'chevup' : 'chevdown');
    tg.setAttribute('aria-expanded', calOn);
    $('#cal').hidden = !calOn;
    const k = calOn + ':' + calN; $('#cal').classList.toggle('anim', k !== calVista && calVista != null); calVista = k;
    if (!calOn) return;
    const recs = D.filter(recP);
    let cells = '';
    for (let n = 0; n < calN; n++) {
      const d = em(n), xs = recs.filter(x => n >= x.rec.prox && x.rec.wd.includes(d.getDay()));
      cells += `<div class="cal-d${n === 0 ? ' hoje' : ''}" style="--i:${Math.min(n, 10)}"><header><small>${SEM[d.getDay()]}</small><b>${d.getDate()}</b></header>` +
        xs.slice(0, 3).map(x => `<button type="button" class="cal-i" data-act="abrir" data-id="${x.id}" title="${esc(x.t)}">${esc(x.t)}</button>`).join('') +
        (xs.length > 3 ? `<span class="cal-mais">+ ${xs.length - 3} mais</span>` : '') + '</div>';
    }
    $('#cal').innerHTML = '<header><h2>Previsão de Recorrências</h2><div class="seg sm" role="group" aria-label="Período">' +
      [7, 30].map(n => `<button type="button" data-act="cal-n" data-n="${n}" class="${calN === n ? 'on' : ''}" aria-pressed="${calN === n}">${n} dias</button>`).join('') +
      `</div></header><div class="cal-row">${cells}</div>`;
  }

  /* cartão (KanbanCard) */
  function cardHTML(x) {
    const ags = agsDe(x), done = x.col === 'feito', rp = recP(x), at = late(x), c = col(x.col);
    const cls = ['card', done && 'done', at && 'late', x.coroa && !done && 'coroa', sel.has(x.id) && 'sel',
      rp && x.rec.st === 'HOJE' && 'rec-hoje', rp && x.rec.st === 'OK' && 'rec-ok', rp && !x.rec.st && 'rec-espera'].filter(Boolean).join(' ');
    const strip = ags.length ? `<div class="ags" title="${ags.length > 1 ? 'Agências: ' : 'Agência: '}${ags.map(a => AG[a][0]).join(', ')}">` +
      ags.map(a => `<span style="--ac:${AG[a][1]}">${ic('building')}${AG[a][0]}</span>`).join('') + '</div>' : '';
    const semDono = !x.pes && !x.ag && !(x.cli || []).length;
    const acts = (!done && !rp ? `<button type="button" class="c-crown${x.coroa ? ' on' : ''}" data-act="coroa" aria-pressed="${!!x.coroa}" title="${x.coroa ? 'Tirar prioridade' : 'Marcar como prioridade (vai para o topo)'}" aria-label="Prioridade">${ic('crown')}</button>` : '') +
      (!x.onb ? `<button type="button" class="c-cli${semDono ? ' vis' : ''}" data-act="cli" title="Atribuir cliente" aria-label="Atribuir cliente">${ic('userplus')}</button>` : '') +
      `<button type="button" class="c-more" data-act="card-menu" aria-label="Mais ações">${ic('more')}</button>`;
    let b = '';
    if (x.onb) b += `<button type="button" class="bd onb" data-act="ir">${ic('rocket')}Onboarding</button>`;
    if (x.road) b += `<button type="button" class="bd road" data-act="ir">${ic('map')}Roadmap</button>`;
    if (x.pes) b += `<span class="bd pes">${ic('user')}Pessoal</span>`;
    else if ((x.cli || []).length > 1) b += `<button type="button" class="bd cli" data-act="multi">${ic('users')}Diversos clientes</button>`;
    else if ((x.cli || []).length) b += `<span class="bd cli">${ic('user')}${esc(x.cli[0])}</span>`;
    if (x.obs) b += `<span class="bd obs" title="Esta tarefa tem observação">${ic('file')}observação</span>`;
    if (c && c.dias && x.dia != null) b += `<span class="bd dia">${ic('caldays')}${DIA_N[x.dia]}</span>`;
    if (at) b += `<span class="bd late" title="Entrega era ${ddmm(x.p)}">${ic('alert')}Atrasada há ${plural(-x.p, 'dia', 'dias')}</span>`;
    else if (x.p != null && !rp) b += `<span class="bd ent">${ic('caldays')}Entrega ${ddmm(x.p)}</span>`;
    if (rp) b += `<span class="prox">${x.rec.prox > 0 ? 'Próxima: ' + ddmm(x.rec.prox) : ''}</span><span class="st ${(x.rec.st || '').toLowerCase()}">${x.rec.st || x.rec.freq.toLowerCase()}</span>`;
    const ok = done || (rp && x.rec.st === 'OK') ? '' :
      `<button type="button" class="c-ok" data-act="ok" aria-label="Concluir" ${rp && x.rec.prox > 0 ? `disabled title="Liberada em ${ddmm(x.rec.prox)}"` : 'title="Concluir"'}>${ic('check')}</button>`;
    return `<article class="${cls}" data-id="${x.id}"${rp ? '' : ' draggable="true"'} tabindex="0">${strip}<div class="c-top">` +
      (rp ? '' : `<button type="button" class="c-sel" data-act="sel" aria-pressed="${sel.has(x.id)}" title="${sel.has(x.id) ? 'Desmarcar' : 'Selecionar (ou Ctrl + clique no card)'}" aria-label="Selecionar">${ic('check')}</button>`) +
      `<h3>${esc(x.t)}${rp || x.pai ? `<span class="rp" title="Recorrente">${ic('repeat')}</span>` : ''}</h3><span class="c-acts">${acts}</span></div>` +
      (b ? `<div class="c-badges">${b}</div>` : '') + ok + '</article>';
  }

  /* busca tolerante (sem acento) no título, cliente, Pessoal e agência */
  const textoBusca = x => [x.t, ...(x.cli || []), x.pes ? 'Pessoal' : '', ...agsDe(x).map(a => AG[a][0])].join(' ');
  const visiveis = () => { const q = norm(busca.trim()); return D.filter(x => x.col !== 'agendadas' && (!q || norm(textoBusca(x)).includes(q))); };
  const ordenar = xs => xs.filter(x => x.coroa).concat(xs.filter(x => !x.coroa));

  /* coluna (KanbanColumn) */
  function colHTML(c, v) {
    const xs = ordenar(v.filter(x => x.col === c.id));
    const corpo = c.dias ? c.dias.map(d => {
      const ys = xs.filter(x => x.dia === d);
      return `<section class="sec" data-dia="${d}"><header><span>${DIA_N[d]}</span><b>${ys.length}</b></header>` + (ys.length ? ys.map(cardHTML).join('') : '<div class="drop">Arraste para cá</div>') + '</section>';
    }).join('') : xs.length ? xs.map(cardHTML).join('') : `<div class="empty">${c.vazio || 'Vazio'}</div>`;
    return `<div class="col" data-col="${c.id}" style="--cc:${c.cor}"><header class="ch"><span class="ch-n">${esc(c.t)}</span><b class="ch-c">${xs.length}</b>` +
      `<button type="button" class="icon-btn ch-m" data-act="col-menu" title="Configurações da coluna" aria-label="Configurações da coluna ${esc(c.t)}">${ic('more')}</button></header>` +
      (DIR.colExtra ? DIR.colExtra(c, xs, h) : '') + `<div class="cards">${corpo}</div><footer class="cf">` +
      (qa === c.id ? `<input class="qa" placeholder="Nova tarefa..." aria-label="Nova tarefa em ${esc(c.t)}">` : `<button type="button" class="qa-b" data-act="qa">${ic('plus')}Novo</button>`) + '</footer></div>';
  }
  function renderBoard() {
    const v = visiveis();
    $('#board').innerHTML = COLS.map(c => colHTML(c, v)).join('') +
      `<button type="button" class="col-new" data-act="col-new" title="Nova coluna">${ic('plus')}<span>Nova coluna</span></button>`;
    const q = $('.qa'); if (q) q.focus({ preventScroll: true });
  }
  const subLista = x => x.pes ? 'Pessoal' : x.ag ? AG[x.ag][0] + ' (agência)' : (x.cli || []).join(' + ') + ((x.cli || []).length ? ' — ' + agsDe(x).map(a => AG[a][0]).join(', ') : 'Sem cliente');
  function renderList() {
    const v = visiveis();
    $('#list').innerHTML = v.length ? v.map(x => `<div class="lr${x.col === 'feito' ? ' done' : ''}" data-id="${x.id}" tabindex="0"><i class="dot"></i><div class="lr-t"><b>${esc(x.t)}</b>` +
      `<small>${esc(subLista(x))} • ${esc(col(x.col).t)}</small></div><button type="button" class="icon-btn" data-act="abrir" aria-label="Abrir ${esc(x.t)}">${ic('x', 'rot')}</button></div>`).join('') :
      `<div class="vazio-l">${ic('list')}<p>${busca ? 'Nenhum resultado encontrado.' : 'Nenhuma demanda encontrada.'}</p></div>`;
  }

  /* barra de seleção (SelecaoBarra) */
  function renderSel() {
    const bar = $('#selbar'), on = modoSel && view === 'board';
    document.body.classList.toggle('selecionando', on);
    bar.hidden = !on;
    if (!on) return;
    const n = sel.size, todas = visiveis().filter(x => x.col !== 'feito' && !recP(x)), xs = selecionadas(), dis = n ? '' : ' disabled';
    bar.innerHTML = `<p class="sb-t">${ic('checksq')}<b>${n ? plural(n, 'selecionada', 'selecionadas') : 'Clique nos cards para selecionar'}</b>${n ? '<small> · arraste uma para mover todas</small>' : ''}</p><div class="sb-a">` +
      (n < todas.length ? `<button type="button" class="btn ghost" data-act="sel-todas">Selecionar todas (${todas.length})</button>` : '') +
      `<button type="button" class="btn" data-act="sel-mover"${dis}>${ic('arrows')}Mover para</button>` +
      `<button type="button" class="btn" data-act="sel-coroa"${dis}>${ic('crown')}${n && xs.every(x => x.coroa) ? 'Tirar prioridade' : 'Prioridade'}</button>` +
      `<button type="button" class="btn" data-act="sel-cli"${dis}>${ic('user')}Cliente</button>` +
      `<button type="button" class="btn" data-act="sel-ent"${dis}>${ic('caldays')}Entrega</button>` +
      `<button type="button" class="btn ok-f" data-act="sel-concluir"${dis}>${ic('check')}Concluir</button>` +
      `<button type="button" class="icon-btn" data-act="sel-sair" title="Sair da seleção (Esc)" aria-label="Sair da seleção">${ic('x')}</button></div>`;
  }

  function contadores() {
    const n = { abertas: h.abertas(), atrasadas: h.atrasadas(), agendadas: h.agendadas() };
    Object.keys(n).forEach(k => $$('[data-' + k + ']').forEach(e => { e.textContent = n[k]; if (e.classList.contains('cnt')) e.hidden = !n[k]; }));
  }
  function render() {
    const ant = new Map(), cont = {}, barras = {};
    if (viewVista === view) $$('.card[data-id]').forEach(e => ant.set(e.dataset.id, e.getBoundingClientRect()));
    $$('.col[data-col]').forEach(c => { cont[c.dataset.col] = c.querySelector('.ch-c').textContent; const i = c.querySelector('.load i'); if (i) barras[c.dataset.col] = i.style.getPropertyValue('--w').trim(); });
    renderCal();
    $('#board').hidden = view !== 'board';
    $('#list').hidden = view !== 'list';
    if (view === 'board') renderBoard(); else renderList();
    $$('[data-view]').forEach(b => { const on = b.dataset.view === view; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    const sb = $('[data-act="sel-modo"]');
    sb.hidden = view !== 'board'; sb.classList.toggle('on', modoSel);
    sb.innerHTML = ic('checksq') + (modoSel ? 'Sair da seleção' : 'Selecionar');
    const m = $('#msg'); m.textContent = 'Nenhum resultado encontrado.'; m.hidden = !(busca.trim() && view === 'board' && !visiveis().length);
    renderSel(); contadores();
    if (DIR.after) DIR.after(h);
    movimento(ant, cont, barras, viewVista);
    viewVista = view; colVista = new Map(D.map(x => [x.id, x.col])); selVista = new Set(sel);
  }

  /* regras de data ao mover (regra_data das colunas): Standby e colunas sem regra apagam a entrega */
  function aplicarRegra(x, c, dia) {
    x.col = c.id;
    if (c.regra === 'hoje') x.p = 0;
    else if (c.regra === 'amanha') x.p = 1;
    else if (c.regra === 'depois_amanha') x.p = 2;
    else if (c.regra === 'dias_semana') { x.dia = dia != null ? dia : c.dias[0]; x.p = offDia(x.dia); }
    else if (c.id !== 'feito' && c.id !== 'recorrentes') x.p = null;
    if (c.regra !== 'dias_semana') delete x.dia;
    if (c.id === 'feito') { x.coroa = 0; sel.delete(x.id); }
  }
  function mover(xs, c, dia, ajuste) {
    const fazer = d => { xs.forEach(y => aplicarRegra(y, c, d != null ? d : (y.col === c.id ? y.dia : null))); if (ajuste) ajuste(); render(); };
    if (c.dias && dia == null && c.dias.length > 1 && xs.some(y => y.col !== c.id)) return escolherDia(c, c.dias[0], fazer);
    fazer(dia);
  }
  const proxima = x => { for (let n = 1; n < 15; n++) if (x.rec.wd.includes(em(n).getDay())) return n; return 7; };
  function concluir(x) {
    if (recP(x)) {
      const copia = D.find(y => y.pai === x.id && y.col !== 'feito');
      if (copia) aplicarRegra(copia, col('feito'));
      x.rec.st = 'OK'; x.rec.prox = proxima(x);
      toast('Execução registrada!');
      render(); carimbar($(`.card[data-id="${x.id}"]`));
    } else voar([x], () => {
      aplicarRegra(x, col('feito'));
      const pai = x.pai && byId(x.pai); if (pai && pai.rec) { pai.rec.st = 'OK'; pai.rec.prox = proxima(pai); }
      render();
    });
  }
  function duplicar(x) {
    const y = JSON.parse(JSON.stringify(x));
    y.id = ++nextId; y.t = x.t + ' (Cópia)'; y.criado = 'agora'; delete y.onb;
    if (x.col === 'feito') { y.col = 'standby'; y.p = null; toast('Cópia criada no Standby.'); } else toast('Demanda duplicada!');
    D.push(y); render();
  }
  function remover(x) {
    D = D.filter(y => y !== x); sel.delete(x.id);
    if (drId === x.id) fecharGaveta();
    render(); toast('Demanda deletada!');
  }
  const setDono = (x, o) => { delete x.pes; delete x.ag; x.cli = []; if (o.pes) x.pes = 1; else if (o.ag) x.ag = o.ag; else x.cli = o.cli || []; };
  const donoDe = o => o.pes ? 'Pessoal' : o.ag ? AG[o.ag][0] + ' (agência)' : (o.cli || []).length ? o.cli.join(' + ') : 'sem cliente';
  const GEN = ['clinica', 'studio', 'imoveis', 'nova', 'casa', 'tech', 'cia'];
  const clientesNoTitulo = t => {
    const pal = norm(t).split(/[^a-z0-9]+/);
    return Object.keys(CLI).filter(n => norm(t).includes(norm(n)) || norm(n).split(/[^a-z0-9]+/).some(w => w.length >= 4 && !GEN.includes(w) && pal.includes(w)));
  };

  /* menu flutuante: cartão, coluna, Mover para, cliente, entrega, aparência */
  const pop = $('#pop');
  let popFn = null, popDono = null;
  const mi = (v, label, o = {}) => `<button type="button" class="mi${o.danger ? ' danger' : ''}" data-v="${esc(v)}"${o.dis ? ' aria-disabled="true"' : ''}${o.title ? ` title="${o.title}"` : ''}>` +
    (o.box !== undefined ? `<span class="bx${o.box ? ' on' : ''}">${o.box ? ic('check') : ''}</span>` : '') + (o.icon ? ic(o.icon) : '') +
    (o.dot ? `<i class="dot" style="--cc:${o.dot}"></i>` : '') + `<span class="mi-t">${label}${o.small ? `<small>${o.small}</small>` : ''}</span>` + (o.check ? ic('check', 'ck') : '') + '</button>';
  function abrirPop(anchor, html, fn, classe) {
    pop.className = 'pop' + (classe ? ' ' + classe : '');
    pop.innerHTML = html; pop.hidden = false; popFn = fn || null; popDono = anchor;
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, hh = pop.offsetHeight;
    let top = r.bottom + 6; if (top + hh > innerHeight - 8) top = Math.max(8, r.top - hh - 6);
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    pop.style.top = top + 'px';
    const f = $('input', pop); if (f) f.focus();
  }
  function fecharPop() { pop.hidden = true; popFn = null; popDono = null; }

  function picker(anchor, o) {
    let multi = false, q = '';
    const marc = new Set(o.atual && o.atual.cli ? o.atual.cli : []);
    const lista = () => {
      const nq = norm(q), ok = s => !nq || norm(s).includes(nq);
      const cl = Object.keys(CLI).filter(ok), ag = o.agencias === false ? [] : Object.keys(AG).filter(a => ok(AG[a][0]));
      let s = '';
      if (!multi && ok('Pessoal')) s += mi('pes', 'Pessoal', { icon: 'user' });
      if (!multi && ok('Sem cliente')) s += mi('sem', 'Sem cliente');
      if (!multi && ag.length) s += '<p class="mh">Agências</p>' + ag.map(a => mi('ag:' + a, AG[a][0], { icon: 'building' })).join('');
      if (cl.length) s += `<p class="mh">${multi ? 'Clientes · marque quantos quiser' : 'Clientes'}</p>` + cl.map(c => mi('c:' + c, esc(c), multi ? { box: marc.has(c) } : { icon: 'user' })).join('');
      return s || '<p class="mh">Nenhum resultado encontrado.</p>';
    };
    const pe = () => multi ? `<span>${marc.size ? plural(marc.size, 'cliente', 'clientes') : 'Nenhum cliente'}</span><button type="button" class="btn primary sm" data-v="pronto">Pronto</button>` : mi('multi', 'Selecionar mais de um', { icon: 'listplus' });
    const desenhar = () => { $('.pk-l', pop).innerHTML = lista(); $('.pk-p', pop).innerHTML = pe(); };
    abrirPop(anchor, `<input class="inp pk-q" placeholder="Buscar cliente…" aria-label="Buscar cliente"><div class="pk-l">${lista()}</div><footer class="pk-p">${pe()}</footer>`, v => {
      if (v === 'multi') { multi = true; return desenhar(); }
      if (v === 'pronto') return o.aplicar({ cli: [...marc] });
      if (v === 'pes') return o.aplicar({ pes: 1 });
      if (v === 'sem') return o.aplicar({});
      if (v.startsWith('ag:')) return o.aplicar({ ag: v.slice(3) });
      const c = v.slice(2);
      if (multi) { marc.has(c) ? marc.delete(c) : marc.add(c); return desenhar(); }
      o.aplicar({ cli: [c] });
    }, 'pk');
    $('.pk-q', pop).addEventListener('input', e => { q = e.target.value; $('.pk-l', pop).innerHTML = lista(); });
  }
  function datePop(anchor, atual, aplicar) {
    abrirPop(anchor, `<div class="dp"><input type="date" class="inp" value="${atual != null ? isoDe(atual) : ''}" aria-label="Data de entrega">${mi('limpar', 'Sem data de entrega', { icon: 'x' })}</div>`, v => { if (v === 'limpar') { fecharPop(); aplicar(null); } });
    $('input', pop).addEventListener('change', e => { if (e.target.value) { fecharPop(); aplicar(offDe(e.target.value)); } });
  }
  const rotuloDia = d => (d === 6 || d === 0 ? 'Fazer no ' : 'Fazer na ') + DIA_N[d].toLowerCase();
  function menuCard(x, a) {
    const c = col(x.col), rp = recP(x);
    let s = mi('det', 'Detalhes', { icon: 'edit' });
    if (c && c.dias && c.dias.length > 1) s += c.dias.map(d => mi('dia:' + d, rotuloDia(d), { icon: 'caldays', dis: x.dia === d })).join('');
    if (!x.road && !x.onb && !rp) s += mi('road', 'Enviar para o Roadmap', { icon: 'map' });
    if (x.road) s += mi('abrir-road', 'Abrir roadmap', { icon: 'map' }) + mi('desligar', 'Desligar do roadmap', { icon: 'unlink' });
    s += mi('dup', 'Duplicar', { icon: 'copy' }) + '<hr>' + mi('del', 'Remover', { icon: 'trash', danger: 1 });
    abrirPop(a, s, v => {
      fecharPop();
      if (v === 'det') abrirDetalhe(x.id);
      else if (v.startsWith('dia:')) { aplicarRegra(x, c, +v.slice(4)); render(); }
      else if (v === 'road') dlgRoadmap(x);
      else if (v === 'abrir-road') toast(FORA);
      else if (v === 'desligar') { x.road = 0; render(); toast('Demanda desligada do roadmap'); }
      else if (v === 'dup') duplicar(x);
      else if (v === 'del') remover(x);
    });
  }
  function menuColuna(c, a) {
    const n = D.filter(x => x.col === c.id).length;
    abrirPop(a, mi('editar', 'Editar coluna', { icon: 'edit' }) + mi('zerar', 'Zerar demandas', { icon: 'eraser', dis: !n }) + '<hr>' +
      mi('excluir', 'Excluir coluna', { icon: 'trash', danger: 1, dis: c.sis, title: c.sis ? 'Coluna fixa do sistema' : '' }), v => {
      fecharPop();
      if (v === 'editar') dlgColuna(c);
      if (v === 'zerar') confirmar('Zerar demandas da coluna?', `${plural(n, 'demanda', 'demandas')} da coluna "${esc(c.t)}" serão removidas permanentemente.`, 'Zerar',
        () => { D = D.filter(x => x.col !== c.id); render(); toast(`Coluna "${c.t}" zerada`); });
      if (v === 'excluir') confirmar('Excluir coluna?', `A coluna "${esc(c.t)}" e ${plural(n, 'demanda', 'demandas')} serão removidas permanentemente.`, 'Excluir coluna',
        () => { COLS = COLS.filter(k => k !== c); D = D.filter(x => x.col !== c.id); render(); toast(`Coluna "${c.t}" excluída`); });
    });
  }
  function quandoRepetir(x, anchor) {
    abrirPop(anchor, '<p class="mh">Quando repetir?</p>' + FREQ.map((f, i) => mi(f, f, { small: FREQ_D[i] })).join('') + '<hr>' + mi('depois', 'Configurar depois'), v => {
      fecharPop(); if (v === 'depois') return;
      x.rec.freq = v; x.rec.wd = v === 'Diária' ? TODOS : [HOJE.getDay()]; x.rec.prox = v === 'Diária' ? 1 : 7;
      render(); toast('Recorrência configurada!');
    });
  }
  const APAR = [['painel.html', 'Painel e vidro'], ['editorial.html', 'Editorial']];
  const aqui = location.pathname.slice(1) || { 5302: 'painel.html', 5303: 'editorial.html' }[location.port] || 'painel.html';
  function aparencia(a) {
    const escuro = document.documentElement.dataset.mode === 'dark';
    abrirPop(a, '<p class="mh">Aparência</p>' + APAR.map(p => mi(p[0], p[1], { check: p[0] === aqui })).join('') + '<hr>' +
      mi('tema', escuro ? 'Tema claro' : 'Tema escuro', { icon: escuro ? 'sun' : 'moon' }), v => {
      fecharPop();
      if (v === 'tema') return tema();
      if (v === aqui) return;
      try { localStorage.setItem('lab2-mode', document.documentElement.dataset.mode); } catch (er) {}
      location.href = v;
    });
  }
  /* tema: a cor nova se abre em círculo a partir do clique (View Transitions) */
  function tema() {
    const m = document.documentElement.dataset.mode === 'dark' ? 'light' : 'dark';
    const troca = () => {
      document.documentElement.dataset.mode = m;
      try { localStorage.setItem('lab2-mode', m); } catch (er) {}
      icoModo();
    };
    if (reduz || !document.startViewTransition) return troca();
    const [x, y] = ptr, raio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.documentElement.classList.add('vt-tema');
    const vt = document.startViewTransition(troca);
    vt.ready.then(() => document.documentElement.animate(
      { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${raio}px at ${x}px ${y}px)`] },
      { duration: 700, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' }));
    vt.finished.finally(() => document.documentElement.classList.remove('vt-tema'));
  }
  function icoModo() { $$('[data-act="tema"] use').forEach(u => u.setAttribute('href', document.documentElement.dataset.mode === 'dark' ? '#i-sun' : '#i-moon')); }

  /* diálogos: confirmar, escolher dia, coluna, roadmap */
  let dlgFn = null;
  function dialogo(html, fn) {
    const d = $('#dlg');
    d.innerHTML = `<div class="sheet sm">${html}</div>`; d.hidden = false; dlgFn = fn;
    const f = $('input, select, .btn.primary, .btn.danger-f', d); if (f) f.focus();
  }
  function fecharDlg() { $('#dlg').hidden = true; dlgFn = null; }
  const fechaX = `<button type="button" class="icon-btn" data-v="cancelar" aria-label="Fechar">${ic('x')}</button>`;
  function confirmar(titulo, texto, botao, fn) {
    dialogo(`<header><h2>${titulo}</h2></header><p class="hint">${texto}</p><footer><span class="sp"></span><button type="button" class="btn" data-v="cancelar">Cancelar</button><button type="button" class="btn danger-f" data-v="ok">${botao}</button></footer>`,
      v => { fecharDlg(); if (v === 'ok') fn(); });
  }
  function escolherDia(c, sug, fazer) {
    dialogo(`<header><h2>${esc(c.t)}</h2>${fechaX}</header><p class="hint">Em que dia você vai fazer essa demanda?</p>` +
      `<div class="dias-g${c.dias.length > 2 ? ' tres' : ''}">${c.dias.map(d => `<button type="button" class="btn big${d === sug ? ' primary' : ''}" data-v="${d}">${DIA_N[d]}</button>`).join('')}</div><footer></footer>`,
      v => { fecharDlg(); if (v === 'cancelar') render(); else fazer(+v); });
  }
  function dlgColuna(c0) {
    const novo = !c0, c = c0 || { t: '', cor: '#3b82f6', regra: 'nenhuma' };
    let nome = c.t, cor = c.cor, regra = c.regra, dias = new Set(c.dias || []);
    const REGRAS = [['nenhuma', 'Sem data automática', 'A entrega fica como está ao mover para cá.'], ['hoje', 'Hoje', 'Ao mover para cá, a entrega vira hoje.'],
      ['amanha', 'Amanhã', 'Ao mover para cá, a entrega vira amanhã.'], ['depois_amanha', 'Depois de amanhã', 'Ao mover para cá, a entrega vira depois de amanhã.'],
      ['dias_semana', 'Dias da semana', 'A coluna se divide por dia; ao mover para cá você escolhe o dia e a entrega vira o próximo dia escolhido.']];
    const SW = ['#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#78716c'];
    const CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const corpo = () => `<header><h2>${novo ? 'Nova coluna' : 'Editar coluna'}</h2>${fechaX}</header>` +
      `<label class="lbl">Nome<input class="inp" id="cn" value="${esc(nome)}" placeholder="Ex.: Esta semana"></label>` +
      `<div class="lbl"><span>Cor</span><div class="sw-g">${SW.map(s => `<button type="button" class="sw${s === cor ? ' on' : ''}" style="--cc:${s}" data-v="cor:${s}" aria-pressed="${s === cor}" aria-label="Cor ${s}">${s === cor ? ic('check') : ''}</button>`).join('')}</div></div>` +
      `<label class="lbl">Data de entrega ao mover para esta coluna<select class="inp" id="cr">${REGRAS.map(r => `<option value="${r[0]}"${r[0] === regra ? ' selected' : ''}>${r[1]}</option>`).join('')}</select>` +
      `<small class="ajuda">${REGRAS.find(r => r[0] === regra)[2]}</small></label>` +
      (regra === 'dias_semana' ? `<div class="dias-t" role="group" aria-label="Dias">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" class="tg${dias.has(d) ? ' on' : ''}" data-v="dia:${d}" aria-pressed="${dias.has(d)}">${CURTO[d]}</button>`).join('')}</div>` +
        (dias.size ? '' : '<p class="erro">Marque pelo menos um dia.</p>') : '') +
      `<footer><span class="sp"></span><button type="button" class="btn" data-v="cancelar">Cancelar</button><button type="button" class="btn primary" data-v="salvar">${novo ? 'Criar coluna' : 'Salvar'}</button></footer>`;
    const redesenhar = () => { nome = $('#cn').value; $('#dlg .sheet').innerHTML = corpo(); ligar(); };
    const ligar = () => $('#cr').addEventListener('change', e => { regra = e.target.value; redesenhar(); });
    dialogo(corpo(), v => {
      if (v === 'cancelar') return fecharDlg();
      if (v.startsWith('cor:')) { cor = v.slice(4); return redesenhar(); }
      if (v.startsWith('dia:')) { const d = +v.slice(4); dias.has(d) ? dias.delete(d) : dias.add(d); return redesenhar(); }
      const t = $('#cn').value.trim();
      if (!t) return toast('Informe o nome da coluna');
      if (regra === 'dias_semana' && !dias.size) return toast('Marque pelo menos um dia');
      const dd = regra === 'dias_semana' ? [1, 2, 3, 4, 5, 6, 0].filter(d => dias.has(d)) : undefined;
      if (novo) COLS.splice(COLS.length - 1, 0, { id: 'col_' + (++nextId), t, cor, regra, dias: dd, vazio: 'Vazio' });
      else Object.assign(c, { t, cor, regra, dias: dd });
      fecharDlg(); render(); toast(novo ? 'Coluna criada' : 'Coluna atualizada');
    });
    ligar();
  }
  function dlgRoadmap(x) {
    let aba = 'criar', todos = false;
    const RM = [['Site novo da Nova Odonto', 'Nova Odonto · 40%'], ['Campanha de verão', 'Clínica Aurora · 15%'], ['Reestruturação do funil', 'Atlas Imóveis · 70%']];
    const corpo = () => `<header><h2>${ic('map')}Enviar para o Roadmap</h2>${fechaX}</header><p class="hint">Crie um roadmap a partir desta demanda ou ligue-a a um roadmap que já existe.</p>` +
      `<div class="seg full" role="tablist">${[['criar', 'Criar roadmap'], ['ligar', 'Ligar a existente']].map(t => `<button type="button" role="tab" class="${aba === t[0] ? 'on' : ''}" aria-selected="${aba === t[0]}" data-v="aba:${t[0]}">${t[1]}</button>`).join('')}</div>` +
      (aba === 'criar' ? `<label class="lbl">Nome do roadmap<input class="inp" id="rm-n" placeholder="Ex.: Landing page" value="${esc(x.t)}"></label>` +
        `<div class="lbl"><span>Cliente</span><button type="button" class="inp pick">${esc(donoTxt(x) || 'Escolha o cliente ou Pessoal')}</button></div>` +
        '<label class="lbl">Template (opcional)<select class="inp"><option>Sem template — começar do zero</option><option>Lançamento de campanha · 6 passos</option><option>Site novo · 9 passos</option></select></label>' :
        `<div class="rm-b"><input class="inp" placeholder="Buscar roadmap…" aria-label="Buscar roadmap"><button type="button" class="btn sm" data-v="todos">${todos ? 'Só ' + esc(donoTxt(x) || 'este dono') : 'Mostrar todos'}</button></div>` +
        `<div class="rm-l">${RM.map((r, i) => mi('rm:' + i, r[0], { small: r[1] })).join('')}</div>`) +
      `<footer><span class="sp"></span><button type="button" class="btn" data-v="cancelar">Cancelar</button><button type="button" class="btn primary" data-v="${aba}">${aba === 'criar' ? 'Criar roadmap' : 'Ligar'}</button></footer>`;
    let escolhido = 0;
    dialogo(corpo(), (v, el) => {
      if (v === 'cancelar') return fecharDlg();
      if (v.startsWith('aba:')) { aba = v.slice(4); $('#dlg .sheet').innerHTML = corpo(); return; }
      if (v === 'todos') { todos = !todos; $('#dlg .sheet').innerHTML = corpo(); return; }
      if (v.startsWith('rm:')) { escolhido = +v.slice(3); $$('#dlg .rm-l .mi').forEach(b => b.classList.toggle('on', b === el)); return; }
      x.road = 1; fecharDlg(); render();
      toast(v === 'criar' ? 'Roadmap criado — defina os passos quando quiser' : `Demanda ligada ao roadmap "${RM[escolhido][0]}"`);
    });
  }

  /* gaveta: detalhe da demanda (DemandaDrawer) e tarefas agendadas (AgendadasSheet) */
  let lastFocus = null, tmGav = null;
  function abrirGaveta(html, scrim, modo) {
    clearTimeout(tmGav);
    const dr = $('#drawer');
    if (dr.hidden) lastFocus = document.activeElement;
    dr.className = 'drawer ' + modo; dr.innerHTML = html; dr.hidden = false;
    $('#scrim').hidden = !scrim; drModo = modo;
    const f = $('[data-close]', dr); if (f) f.focus({ preventScroll: true });
  }
  function fecharGaveta() {
    const dr = $('#drawer'); if (dr.hidden) return;
    dr.classList.add('out'); $('#scrim').hidden = true; drId = null; drModo = null;
    tmGav = setTimeout(() => { dr.hidden = true; dr.classList.remove('out'); }, 200);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function salvo() { const s = $('#salvo'); if (!s) return; s.classList.add('on'); clearTimeout(salvo.t); salvo.t = setTimeout(() => s.classList.remove('on'), 2000); }
  function abrirDetalhe(id) {
    const x = byId(id); if (!x) return;
    drId = id;
    const c = col(x.col), rp = recP(x), at = late(x);
    const ent = x.p != null ? `${ddmm(x.p)} · ${SEM_L[em(x.p).getDay()]}` : 'Definir data';
    abrirGaveta(`<header class="dr-h"><button type="button" class="icon-btn" data-close aria-label="Fechar">${ic('x')}</button><span class="sp"></span><span class="salvo" id="salvo">Salvo</span>` +
      `<button type="button" class="btn ghost" data-act="dr-mover">Mover para${ic('chevdown')}</button></header><div class="body">` +
      `<textarea class="dr-t" id="dr-t" rows="1" placeholder="Sem título" aria-label="Título">${esc(x.t)}</textarea><dl class="props">` +
      `<dt>${ic('clock')}Status</dt><dd>${c ? `<span class="st-b" style="--cc:${c.cor}">${esc(c.t)}</span>` : ''}${x.col === 'agendadas' ? `<span class="st-b ag">${ic('calclock')}Agendada</span>` : ''}</dd>` +
      `<dt>${ic('cal')}Criado</dt><dd>${x.criado || 'agora'}</dd>` +
      `<dt>${ic('user')}Cliente</dt><dd><button type="button" class="lnk" data-act="dr-cli">${esc(donoTxt(x) || 'Adicionar cliente')}</button></dd>` +
      `<dt>${ic('caldays')}Entrega</dt><dd><button type="button" class="lnk" data-act="dr-ent">${ent}</button>` +
        (x.p != null && x.col !== 'agendadas' ? `<button type="button" class="icon-btn xs" data-act="dr-ent-x" title="Remover data" aria-label="Remover data">${ic('x')}</button>` : '') +
        (at ? `<span class="late-t">Atrasada há ${plural(-x.p, 'dia', 'dias')}</span>` : '') + '</dd>' +
      (x.onb || rp ? '' : `<dt>${ic('map')}Roadmap</dt><dd>${x.road ? `<button type="button" class="lnk" data-act="ir">Abrir roadmap</button><button type="button" class="lnk sub" data-act="dr-desligar">${ic('unlink')}Desligar</button>` : '<button type="button" class="lnk" data-act="dr-road">Enviar para o Roadmap</button>'}</dd>`) +
      `</dl><button type="button" class="btn ghost sm add-c" data-act="dr-campo">${ic('plus')}Adicionar campo</button><hr class="sep">` +
      (rp ? `<section class="recbox"><h3>${ic('repeat')}Configuração de Recorrência</h3><div class="row2"><label class="lbl">Tipo<select class="inp">${FREQ.map(f => `<option${f === x.rec.freq ? ' selected' : ''}>${f}</option>`).join('')}</select></label>` +
        `<label class="lbl">Próxima Execução<input class="inp" type="date" value="${isoDe(x.rec.prox)}"></label></div><button type="button" class="btn sm" data-act="dr-desativar">Desativar Recorrência</button></section>` : '') +
      `<textarea class="dr-d" id="dr-d" placeholder="Adicione uma descrição..." aria-label="Descrição">${esc(x.obs || '')}</textarea></div>` +
      `<footer><button type="button" class="btn ghost" data-act="dup">${ic('copy')}Duplicar</button><button type="button" class="btn ghost" data-act="del">${ic('trash')}Remover</button><span class="sp"></span><em class="auto">Salvo automaticamente</em></footer>`, false, 'det');
    const ti = $('#dr-t'), de = $('#dr-d');
    const cresce = () => { ti.style.height = 'auto'; ti.style.height = ti.scrollHeight + 'px'; };
    cresce(); ti.addEventListener('input', cresce);
    ti.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ti.blur(); } });
    ti.addEventListener('blur', () => { const v = ti.value.trim(); if (v && v !== x.t) { x.t = v; render(); salvo(); } });
    let tm; de.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { x.obs = de.value.trim() || undefined; render(); salvo(); }, 500); });
  }
  function abrirAgendadas() {
    const ag = D.filter(x => x.col === 'agendadas').sort((a, b) => a.p - b.p);
    abrirGaveta(`<header class="ag-h"><div><h2>Tarefas agendadas</h2><p class="hint">Cada uma desce sozinha para Fazer depois de amanhã 2 dias antes da data.</p></div>` +
      `<button type="button" class="icon-btn" data-close aria-label="Fechar">${ic('x')}</button></header><div class="body">` +
      `<div><button type="button" class="btn primary" data-open="agendar">${ic('plus')}Agendar tarefa</button></div>` +
      (ag.length ? '<ul class="sched">' + ag.map((x, i) => `<li class="sched-i" data-id="${x.id}" style="--i:${i}" tabindex="0"><div class="sched-t"><b>${esc(x.t)}</b>` +
        `<small>${SEM[em(x.p).getDay()]} ${ddmm(x.p)} · ${esc(donoTxt(x) || 'Sem cliente')}</small>` +
        `<small>em ${plural(x.p, 'dia', 'dias')} · desce para o quadro ${x.p - 2 <= 1 ? 'amanhã' : 'em ' + ddmm(x.p - 2)}</small></div><span class="sched-a">` +
        `<button type="button" class="icon-btn" data-act="ag-edit" title="Editar" aria-label="Editar">${ic('edit')}</button>` +
        `<button type="button" class="icon-btn" data-act="ag-done" title="Marcar como feita" aria-label="Marcar como feita">${ic('check')}</button>` +
        `<button type="button" class="icon-btn" data-act="ag-del" title="Excluir" aria-label="Excluir">${ic('trash')}</button></span></li>`).join('') + '</ul>' :
        '<p class="empty">Nenhuma tarefa agendada.</p>') + '</div>', true, 'ag');
  }

  /* formulário Nova, Agendar e editar (DemandaForm) */
  const form = $('#form');
  const labelDono = () => { $('#f-cli').textContent = fDono.pes ? 'Pessoal' : (fDono.cli || []).length ? fDono.cli.join(' + ') : 'Sem cliente (opcional)'; };
  function abrirForm(modo, x) {
    const ag = modo === 'agendar';
    form.reset(); editId = x ? x.id : null; fManual = !!x;
    fDono = x ? (x.pes ? { pes: 1 } : { cli: (x.cli || []).slice() }) : {};
    $('#m-title').textContent = ag ? (x ? 'Editar tarefa agendada' : 'Agendar tarefa') : (x ? 'Editar Demanda' : 'Nova Demanda');
    $('#m-hint').textContent = ag ? 'Ela fica em Agendadas e desce para Fazer depois de amanhã 2 dias antes da data.' : 'Preencha os detalhes da tarefa abaixo.';
    $('#m-ok').textContent = ag ? 'Agendar' : 'Criar Demanda';
    $('#f-col').hidden = ag; $('#f-rec').hidden = ag; $('#f-freq').hidden = true;
    $('#f-dl').textContent = ag ? 'Data agendada' : 'Prazo (Opcional)';
    form.d.min = ag ? isoDe(0) : '';
    form.col.innerHTML = COLS.map(c => `<option value="${c.id}">${esc(c.t)}</option>`).join('');
    form.col.value = 'fazer_hoje';
    if (x) { form.t.value = x.t; form.n.value = x.obs || ''; if (x.p != null) form.d.value = isoDe(x.p); }
    form.dataset.mode = modo; labelDono();
    if ($('#modal').hidden) lastFocus = document.activeElement;
    $('#modal').hidden = false; form.t.focus();
  }
  function fecharModal() { $('#modal').hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); }
  form.t.addEventListener('input', () => { if (fManual) return; const a = clientesNoTitulo(form.t.value); fDono = a.length ? { cli: a } : {}; labelDono(); });
  form.rec.addEventListener('change', () => { $('#f-freq').hidden = !form.rec.checked; form.col.value = form.rec.checked ? 'recorrentes' : 'fazer_hoje'; });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const ag = form.dataset.mode === 'agendar', t = form.t.value.trim(), p = form.d.value ? offDe(form.d.value) : null;
    if (t.length < 2) { form.t.focus(); return toast('Título é obrigatório'); }
    if (ag && (p == null || p < 0)) { form.d.focus(); return toast('Escolha a data agendada'); }
    const obs = form.n.value.trim() || undefined;
    if (editId) {
      const x = byId(editId); x.t = t; x.obs = obs; setDono(x, fDono);
      if (p != null) x.p = p;
      toast('Demanda atualizada!');
    } else if (ag) {
      const x = { id: ++nextId, t, col: 'agendadas', p, obs, criado: 'agora' }; setDono(x, fDono);
      if (p <= 2) aplicarRegra(x, col(['fazer_hoje', 'fazer_amanha', 'fazer_depois_amanha'][p]));
      D.push(x); toast('Agendada para ' + ddmm(p));
    } else {
      const rec = form.rec.checked, c = col(rec ? 'recorrentes' : form.col.value);
      const x = { id: ++nextId, t, col: c.id, obs, criado: 'agora' }; setDono(x, fDono);
      if (rec) x.rec = { freq: form.freq.value, wd: form.freq.value === 'Diária' ? TODOS : [HOJE.getDay()], prox: 0, st: 'HOJE' };
      else { aplicarRegra(x, c); if (p != null) x.p = p; }
      D.push(x); toast('Demanda criada!');
    }
    fecharModal(); render();
    if (drModo === 'ag') abrirAgendadas();
  });

  /* busca rápida (Ctrl K): abas do menu */
  const ABAS = GRUPOS.flatMap(g => g[2].map(t => [t, g[1], g[0]]));
  let cmdSel = 0;
  function cmdList() {
    const q = norm($('#cmd-q').value), xs = ABAS.filter(c => !q || norm(c[0]).includes(q));
    cmdSel = Math.min(cmdSel, Math.max(0, xs.length - 1));
    $('#cmd-list').innerHTML = xs.map((c, i) => `<li class="${i === cmdSel ? 'sel' : ''}" data-i="${i}" role="option" aria-selected="${i === cmdSel}">${ic(c[1])}<span>${c[0]}</span><small>${c[2]}</small></li>`).join('') || '<li class="none">Nada encontrado</li>';
    return xs;
  }
  function abrirCmd() { lastFocus = document.activeElement; $('#cmd-q').value = ''; cmdSel = 0; cmdList(); $('#cmdk').hidden = false; $('#cmd-q').focus(); }
  function fecharCmd() { $('#cmdk').hidden = true; }
  function rodarCmd(c) { fecharCmd(); if (c && c[0] !== 'Demandas') toast(FORA); }
  $('#cmd-q').addEventListener('input', () => { cmdSel = 0; cmdList(); });
  $('#cmd-list').addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) rodarCmd(cmdList()[+li.dataset.i]); });

  function toast(msg) {
    const t = $('#toast');
    t.innerHTML = ic('check') + '<span>' + esc(msg) + '</span>'; t.classList.add('on');
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2400);
  }
  function alternarSel(x) {
    if (!x || recP(x)) return;
    sel.has(x.id) ? sel.delete(x.id) : sel.add(x.id);
    modoSel = true; render();
  }
  function sairSel() { sel.clear(); modoSel = false; render(); }

  /* ações por clique */
  const ACT = {
    'cal-tg': () => { calOn = !calOn; try { localStorage.setItem('demandas_calendar_visible', calOn); } catch (er) {} render(); },
    'cal-n': (x, a) => { calN = +a.dataset.n; render(); },
    abrir: x => abrirDetalhe(x.id),
    'sel-modo': () => { if (modoSel) sairSel(); else { modoSel = true; render(); } },
    sel: x => alternarSel(x),
    coroa: x => { x.coroa = x.coroa ? 0 : 1; render(); },
    cli: (x, a) => picker(a, { atual: x, aplicar: o => { setDono(x, o); fecharPop(); render(); } }),
    multi: (x, a) => abrirPop(a, `<p class="mh">${plural(x.cli.length, 'cliente', 'clientes')}</p>` + x.cli.map(c => `<p class="mi st">${ic('user')}<span class="mi-t">${esc(c)}</span></p>`).join('')),
    'card-menu': (x, a) => menuCard(x, a),
    ok: x => concluir(x),
    ir: () => toast(FORA),
    'col-menu': (x, a) => menuColuna(col(a.closest('.col').dataset.col), a),
    'col-new': () => dlgColuna(null),
    qa: (x, a) => { qa = a.closest('.col').dataset.col; render(); },
    'sel-todas': () => { visiveis().filter(y => y.col !== 'feito' && !recP(y)).forEach(y => sel.add(y.id)); render(); },
    'sel-mover': (x, a) => {
      const n = sel.size;
      let s = `<p class="mh">Mover ${n} para</p>`;
      COLS.filter(c => c.id !== 'recorrentes').forEach(c => { s += c.dias ? c.dias.map(d => mi(c.id + ':' + d, `${esc(c.t)} · ${DIA_N[d]}`, { dot: c.cor })).join('') : mi(c.id, esc(c.t), { dot: c.cor }); });
      abrirPop(a, s, v => {
        fecharPop();
        const [id, d] = v.split(':'), c = col(id), xs = selecionadas();
        xs.forEach(y => aplicarRegra(y, c, d != null ? +d : undefined)); sel.clear(); render();
        toast(`${plural(xs.length, 'demanda movida', 'demandas movidas')} para ${c.t}${d != null ? ' · ' + DIA_N[+d] : ''}`);
      });
    },
    'sel-coroa': () => { const xs = selecionadas(), tira = xs.every(y => y.coroa); xs.forEach(y => { y.coroa = tira ? 0 : 1; }); render(); toast(`${plural(xs.length, 'demanda', 'demandas')} ${tira ? 'sem' : 'com'} prioridade`); },
    'sel-cli': (x, a) => picker(a, { aplicar: o => {
      fecharPop();
      const xs = selecionadas(), livres = xs.filter(y => !y.onb), onb = xs.length - livres.length;
      if (!livres.length) return toast('As selecionadas são de onboarding: o cliente vem do passo');
      livres.forEach(y => setDono(y, o)); render();
      toast(`${plural(livres.length, 'demanda', 'demandas')} → ${donoDe(o)}${onb ? ` (${onb} de onboarding mantidas)` : ''}`);
    } }),
    'sel-ent': (x, a) => datePop(a, null, p => {
      const xs = selecionadas(); xs.forEach(y => { y.p = p; }); render();
      toast(p == null ? `Entrega removida de ${plural(xs.length, 'demanda', 'demandas')}` : `Entrega ${ddmm(p)} em ${plural(xs.length, 'demanda', 'demandas')}`);
    }),
    'sel-concluir': () => { const xs = selecionadas(); voar(xs, () => { xs.forEach(y => aplicarRegra(y, col('feito'))); sel.clear(); render(); toast(`${plural(xs.length, 'demanda movida', 'demandas movidas')} para Feito`); }); },
    'sel-sair': sairSel,
    'dr-mover': (x, a) => abrirPop(a, COLS.map(c => mi(c.id, esc(c.t), { dot: c.cor, check: c.id === x.col })).join(''), v => { fecharPop(); mover([x], col(v), null, null); abrirDetalhe(x.id); }),
    'dr-cli': (x, a) => picker(a, { atual: x, aplicar: o => { setDono(x, o); fecharPop(); render(); abrirDetalhe(x.id); salvo(); } }),
    'dr-ent': (x, a) => datePop(a, x.p, p => { x.p = p; render(); abrirDetalhe(x.id); salvo(); }),
    'dr-ent-x': x => { x.p = null; render(); abrirDetalhe(x.id); salvo(); },
    'dr-road': x => dlgRoadmap(x),
    'dr-desligar': x => { x.road = 0; render(); abrirDetalhe(x.id); toast('Demanda desligada do roadmap'); },
    'dr-campo': (x, a) => abrirPop(a, ['Recorrência', 'Prioridade', 'Prazo', 'Tags'].map(f => mi(f, f)).join(''), v => {
      fecharPop();
      if (v === 'Recorrência' && !x.rec) { x.rec = { freq: 'Semanal', wd: [HOJE.getDay()], prox: 7 }; x.col = 'recorrentes'; render(); abrirDetalhe(x.id); salvo(); }
    }),
    'dr-desativar': x => { delete x.rec; render(); abrirDetalhe(x.id); salvo(); },
    dup: x => duplicar(x),
    del: x => remover(x),
    'ag-edit': x => abrirForm('agendar', x),
    'ag-done': x => { aplicarRegra(x, col('feito')); render(); abrirAgendadas(); toast('Tarefa marcada como feita'); },
    'ag-del': x => confirmar('Tem certeza que deseja remover?', `Esta ação não pode ser desfeita. A demanda "${esc(x.t)}" será permanentemente deletada.`, 'Remover',
      () => { D = D.filter(y => y !== x); render(); abrirAgendadas(); toast('Demanda deletada!'); }),
    'f-cli': (x, a) => picker(a, { agencias: false, atual: fDono, aplicar: o => { fDono = o; fManual = true; labelDono(); fecharPop(); } }),
    aparencia: (x, a) => aparencia(a),
    tema: () => tema(),
    avisos: () => toast('Os avisos ficam fora deste mockup')
  };

  document.addEventListener('click', e => {
    const t = e.target;
    if (!pop.hidden) {
      const it = t.closest('#pop [data-v]');
      if (it) { if (it.getAttribute('aria-disabled') !== 'true' && popFn) popFn(it.dataset.v, it); return; }
      if (t.closest('#pop')) return;
      const dono = popDono; fecharPop();
      if (dono && dono.contains(t)) return;
    }
    const dv = t.closest('#dlg [data-v]');
    if (dv) { if (dlgFn) dlgFn(dv.dataset.v, dv); return; }
    if (t === $('#dlg')) { if (dlgFn) dlgFn('cancelar'); else fecharDlg(); return; }
    const o = t.closest('[data-open]');
    if (o) { const k = o.dataset.open; if (k === 'cmdk') abrirCmd(); else if (k === 'agendadas') abrirAgendadas(); else abrirForm(k); return; }
    const fc = t.closest('[data-close]');
    if (fc) { if (fc.closest('#modal')) fecharModal(); else fecharGaveta(); return; }
    if (t === $('#scrim')) return fecharGaveta();
    if (t === $('#modal')) return fecharModal();
    if (t === $('#cmdk')) return fecharCmd();
    const vv = t.closest('[data-view]');
    if (vv) { view = vv.dataset.view; render(); return; }
    const a = t.closest('[data-act]'), el = t.closest('[data-id]');
    const x = el ? byId(+el.dataset.id) : t.closest('#drawer') && drId ? byId(drId) : null;
    if (a) { const fn = ACT[a.dataset.act]; if (fn && !a.disabled) fn(x, a, e); return; }
    if (!x) return;
    if (t.closest('.card')) { if (e.ctrlKey || e.metaKey || modoSel) alternarSel(x); else abrirDetalhe(x.id); return; }
    if (t.closest('.lr, .sched-i')) abrirDetalhe(x.id);
  });

  $('#q').addEventListener('input', e => { busca = e.target.value; render(); });

  /* adicionar rápido no pé da coluna */
  function adicionarRapido(cId, t) {
    const c = col(cId), x = { id: ++nextId, t, col: cId, criado: 'agora' };
    const a = clientesNoTitulo(t); if (a.length) x.cli = a;
    if (cId === 'recorrentes') x.rec = { freq: 'Semanal', wd: [HOJE.getDay()], prox: 7 };
    else aplicarRegra(x, c, c.dias ? c.dias[0] : undefined);
    D.push(x); render();
    if (cId === 'recorrentes') { const card = $(`.card[data-id="${x.id}"]`); if (card) quandoRepetir(x, card); }
  }
  document.addEventListener('focusout', e => {
    if (!e.target.classList || !e.target.classList.contains('qa') || e.target.value.trim()) return;
    setTimeout(() => { const f = document.activeElement; if (qa && !(f && f.classList.contains('qa'))) { qa = null; render(); } }, 150);
  });

  document.addEventListener('keydown', e => {
    const t = e.target;
    if (t.classList && t.classList.contains('qa')) {
      if (e.key === 'Enter' && t.value.trim()) { e.preventDefault(); adicionarRapido(qa, t.value.trim()); }
      else if (e.key === 'Escape') { e.stopPropagation(); qa = null; render(); }
      return;
    }
    if (e.key === 'Escape') {
      if (!pop.hidden) return fecharPop();
      if (!$('#dlg').hidden) return dlgFn ? dlgFn('cancelar') : fecharDlg();
      if (!$('#cmdk').hidden) return fecharCmd();
      if (!$('#modal').hidden) return fecharModal();
      if (!$('#drawer').hidden) return fecharGaveta();
      if (modoSel) return sairSel();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return abrirCmd(); }
    if (!$('#cmdk').hidden) {
      const xs = cmdList(); if (!xs.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); cmdSel = (cmdSel + 1) % xs.length; cmdList(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); cmdSel = (cmdSel - 1 + xs.length) % xs.length; cmdList(); }
      if (e.key === 'Enter') { e.preventDefault(); rodarCmd(xs[cmdSel]); }
      return;
    }
    const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if (!digitando && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n' && $('#modal').hidden && $('#dlg').hidden) { e.preventDefault(); return abrirForm('nova'); }
    if (e.key === 'Enter' && t.classList && (t.classList.contains('card') || t.classList.contains('lr') || t.classList.contains('sched-i'))) abrirDetalhe(+t.dataset.id);
  });

  /* arrastar: recorrentes ficam travadas; com vários selecionados, o grupo vai junto, logo depois do card arrastado */
  let arr = null;
  document.addEventListener('dragstart', e => {
    const c = e.target.closest && e.target.closest('.card'); if (!c) return;
    arr = +c.dataset.id;
    (sel.has(arr) && sel.size > 1 ? [...sel] : [arr]).forEach(id => { const k = $(`.card[data-id="${id}"]`); if (k) k.classList.add('drag'); });
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(arr)); } catch (er) {}
  });
  document.addEventListener('dragend', () => { $$('.drag, .over').forEach(n => n.classList.remove('drag', 'over')); arr = null; });
  document.addEventListener('dragover', e => {
    const c = e.target.closest && e.target.closest('.col');
    if (!c || arr == null || c.dataset.col === 'recorrentes') return;
    e.preventDefault();
    $$('.col.over').forEach(n => { if (n !== c) n.classList.remove('over'); }); c.classList.add('over');
  });
  document.addEventListener('drop', e => {
    const ce = e.target.closest && e.target.closest('.col');
    if (!ce || arr == null) return;
    const c = col(ce.dataset.col); if (!c || c.id === 'recorrentes') return;
    e.preventDefault();
    const x = byId(arr), grupo = sel.has(arr) && sel.size > 1 ? selecionadas() : [x];
    const sec = e.target.closest('.sec'), dia = sec ? +sec.dataset.dia : null;
    const els = $$(':scope > .card', sec || $('.cards', ce)).filter(k => !grupo.some(y => y.id === +k.dataset.id));
    let i = els.findIndex(k => { const r = k.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (i < 0) i = els.length;
    const prev = els[i - 1] && byId(+els[i - 1].dataset.id), next = els[i] && byId(+els[i].dataset.id);
    arr = null;
    mover(grupo, c, dia, () => {
      D = D.filter(y => !grupo.includes(y));
      const k = next ? D.indexOf(next) : prev ? D.indexOf(prev) + 1 : D.length;
      D.splice(k, 0, ...grupo);
      if (grupo.length === 1 && c.id !== 'feito') { if (x.coroa && prev && !prev.coroa) x.coroa = 0; else if (!x.coroa && next && next.coroa) x.coroa = 1; }
    });
  });

  render(); icoModo();
  if (DIR.boot) DIR.boot(h);
})();
