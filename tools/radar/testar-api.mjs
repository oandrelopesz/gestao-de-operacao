// Testes de integração da função `radar` (Supabase edge function).
// Rodar:   node tools/radar/testar-api.mjs            (adicione --limite para o teste do 429)
// Chave:   %USERPROFILE%/.gestao/radar.env, linha RADAR_INGEST_KEY=...  (nunca é impressa)
// ATENÇÃO: GRAVA dias de teste do ano 2000 (DIA-20000101, DIA-20000102) no banco de produção.
// Limpar depois com SQL: delete from radar_dias where data < '2001-01-01'
//   (e as tabelas relacionadas: radar_achados, radar_achado_versoes, radar_eventos,
//    radar_ingestao_log com Idempotency-Key começando em "TESTE:").
// Fora do escopo: checagens de banco (status preservado, anon, outro e-mail).
// Erros da API são planos: { ok:false, codigo, mensagem, campos?:[{caminho, problema}] }.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'https://uajusldnvzgakffofkhl.supabase.co/functions/v1/radar'
const RUN = Date.now()

let KEY
try {
  KEY = readFileSync(join(homedir(), '.gestao', 'radar.env'), 'utf8').match(/^\s*RADAR_INGEST_KEY\s*=\s*(.+?)\s*$/m)?.[1]
} catch {}
if (!KEY) {
  console.error('RADAR_INGEST_KEY ausente: crie %USERPROFILE%/.gestao/radar.env com a linha RADAR_INGEST_KEY=...')
  process.exit(1)
}

const exemplo = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'payload-exemplo.json'), 'utf8'))
const clone = (o) => JSON.parse(JSON.stringify(o))

// Troca datas e IDs do exemplo (2026-11-17) para um dia de teste do ano 2000 (ymd = '20000101').
function paraDia(env, ymd) {
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}`
  return JSON.parse(
    JSON.stringify(env)
      .replaceAll('20261117', ymd)
      .replaceAll('2026-11-17', iso)
      .replaceAll('17/11/2026', `${ymd.slice(6)}/${ymd.slice(4, 6)}/${ymd.slice(0, 4)}`),
  )
}

const base1 = paraDia(exemplo, '20000101')
base1.dia.fora[0].id = 'RAD-20000101-009'

function achado(id) {
  const a = clone(base1.achados[0])
  a.id = id
  a.titulo = `Teste ${id}`
  return a
}

const A1 = 'RAD-20000101-001'
const A2 = 'RAD-20000101-002'
const A3 = 'RAD-20000101-003'
const boletim = clone(base1)
boletim.achados = [achado(A1), achado(A2)]

async function chamar(metodo, rota, { body, idem, chave = KEY, query = '' } = {}) {
  const headers = {}
  if (chave) headers['x-radar-key'] = chave
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (idem) headers['Idempotency-Key'] = `TESTE:${idem}:${RUN}`
  const r = await fetch(`${BASE}${rota}${query}`, {
    method: metodo,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await r.json().catch(() => null)
  return { status: r.status, json, headers: r.headers }
}
const post = (body, idem, query = '') => chamar('POST', '/eventos', { body, idem, query })
const cod = (r) => r.json?.codigo
const campos = (r) => r.json?.campos ?? []
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function exige(cond, msg) {
  if (!cond) throw new Error(msg)
}

let falhas = 0
async function teste(nome, fn) {
  try {
    await fn()
    console.log(`OK ${nome}`)
  } catch (e) {
    falhas++
    console.log(`FALHOU ${nome}: ${e.message}`)
  }
}

let criadosReal
await teste('saude sem chave -> 401', async () => {
  const r = await chamar('GET', '/saude', { chave: null })
  exige(r.status === 401, `status ${r.status}`)
  exige(['CHAVE_AUSENTE', 'CHAVE_INVALIDA'].includes(cod(r)), `codigo ${cod(r)}`)
})
await teste('saude com chave -> 200 chave atual', async () => {
  const r = await chamar('GET', '/saude')
  exige(r.status === 200, `status ${r.status}`)
  exige(r.json?.chave === 'atual', `chave=${r.json?.chave}`)
})
await teste('dry_run boletim 2 achados devolve criados', async () => {
  const r = await post(boletim, 'dry1', '?dry_run=1')
  exige(r.status === 200, `status ${r.status} ${cod(r) ?? ''}`)
  exige(r.json.dry_run === true, 'dry_run != true')
  exige(igual([...r.json.criados].sort(), [A1, A2]), `criados=${JSON.stringify(r.json.criados)}`)
})
await teste('segundo dry_run ainda devolve criados (nada gravado)', async () => {
  const r = await post(boletim, 'dry2', '?dry_run=1')
  exige(r.status === 200, `status ${r.status}`)
  exige(igual([...r.json.criados].sort(), [A1, A2]), `criados=${JSON.stringify(r.json.criados)}`)
})
await teste('boletim real devolve criados', async () => {
  const r = await post(boletim, 'boletim')
  exige(r.status === 200, `status ${r.status} ${cod(r) ?? ''}`)
  exige(r.json.dry_run === false && r.json.replay === false, 'dry_run/replay inesperado')
  exige(igual([...r.json.criados].sort(), [A1, A2]), `criados=${JSON.stringify(r.json.criados)}`)
  criadosReal = r.json.criados
})
await teste('mesma Idempotency-Key e corpo -> replay true', async () => {
  const r = await post(boletim, 'boletim')
  exige(r.status === 200, `status ${r.status}`)
  exige(r.json.replay === true, `replay=${r.json.replay}`)
  exige(igual(r.json.criados, criadosReal), `criados=${JSON.stringify(r.json.criados)}`)
})
await teste('mesma Idempotency-Key e corpo diferente -> 409 IDEMPOTENCIA_CONFLITO', async () => {
  const outro = clone(boletim)
  outro.dia.cobertura_parcial = 'corpo diferente'
  const r = await post(outro, 'boletim')
  exige(r.status === 409 && cod(r) === 'IDEMPOTENCIA_CONFLITO', `status ${r.status} codigo ${cod(r)}`)
})
await teste('alerta no mesmo dia -> data 2000-01-01', async () => {
  const env = clone(base1)
  env.tipo = 'alerta'
  env.achados = [{ ...achado(A3), alerta: true }]
  const r = await post(env, 'alerta')
  exige(r.status === 200, `status ${r.status} ${cod(r) ?? ''}`)
  exige(r.json.data === '2000-01-01', `data=${r.json.data}`)
})
await teste('correcao com versao maior -> atualizados', async () => {
  const a = achado(A1)
  a.versao = base1.achados[0].versao + 1 // o exemplo da especificação já vem na versão 2
  a.titulo = 'Titulo corrigido'
  const env = clone(base1)
  env.tipo = 'correcao'
  env.achados = [a]
  env.correcao = {
    achado_id: A1,
    afirmacao_anterior: 'afirmacao antiga',
    dado_correto: 'dado correto',
    motivo: 'teste',
    fontes: ['https://example.com/fonte'],
    texto_whatsapp: 'Correcao de teste',
  }
  const r = await post(env, 'correcao')
  exige(r.status === 200, `status ${r.status} ${cod(r) ?? ''}`)
  exige(r.json.atualizados?.includes(A1), `atualizados=${JSON.stringify(r.json.atualizados)}`)
})
await teste('reenviar versao 1 com texto_whatsapp diferente -> 409 VERSAO_ANTIGA', async () => {
  const a = achado(A1)
  a.versao = 1
  a.texto_whatsapp = 'texto diferente da v1'
  const env = clone(base1)
  env.tipo = 'correcao'
  env.achados = [a]
  env.correcao = {
    achado_id: A1,
    afirmacao_anterior: 'x',
    dado_correto: 'y',
    motivo: 'teste',
    fontes: ['https://example.com/fonte'],
    texto_whatsapp: 'Correcao v1',
  }
  const r = await post(env, 'versao-antiga')
  exige(r.status === 409 && cod(r) === 'VERSAO_ANTIGA', `status ${r.status} codigo ${cod(r)}`)
})

// 422: cada variação vai em dry_run; um campo muda e a API deve responder VALIDACAO com campos[].
const invalidos = [
  ['tema fora da lista', (a) => { a.temas = ['tema_inexistente'] }],
  ['4 temas', (a) => { a.temas = ['software_saas', 'software_saas', 'software_saas', 'software_saas'] }],
  ['ID mal formado', (a) => { a.id = 'ID-RUIM' }],
  ['URL javascript:', (a) => { a.links = [{ tipo: 'descoberta', url: 'javascript:alert(1)' }] }],
]
for (const [nome, muda] of invalidos) {
  await teste(`422 VALIDACAO: ${nome}`, async () => {
    const env = clone(base1)
    env.achados = [achado('RAD-20000101-005')]
    muda(env.achados[0])
    const r = await post(env, `val-${nome}`, '?dry_run=1')
    exige(r.status === 422 && cod(r) === 'VALIDACAO', `status ${r.status} codigo ${cod(r)}`)
    exige(campos(r).length > 0, 'sem campos[]')
  })
}

await teste('ocorrido_em 22:30-03:00 em DIA-20000102 -> data 2000-01-02', async () => {
  const env = paraDia(exemplo, '20000102')
  env.ocorrido_em = '2000-01-02T22:30:00-03:00'
  env.dia.fora = []
  env.achados = [achado('RAD-20000102-001')]
  env.achados[0].primeira_descoberta = '2000-01-02T22:00:00-03:00'
  env.achados[0].enviado_em = '2000-01-02T22:30:00-03:00'
  const r = await post(env, 'tarde')
  exige(r.status === 200, `status ${r.status} ${cod(r) ?? ''}`)
  exige(r.json.data === '2000-01-02', `data=${r.json.data}`)
})

if (process.argv.includes('--limite')) {
  await teste('61 GET /saude -> pelo menos um 429 com Retry-After', async () => {
    let achou = null
    for (let i = 0; i < 61; i++) {
      const r = await chamar('GET', '/saude')
      if (r.status === 429) {
        achou = r
        break
      }
    }
    exige(achou, 'nenhum 429 em 61 chamadas')
    exige(achou.headers.get('retry-after'), 'sem header Retry-After')
  })
}

console.log(falhas ? `${falhas} teste(s) falharam` : 'todos passaram')
process.exit(falhas ? 1 : 0)
