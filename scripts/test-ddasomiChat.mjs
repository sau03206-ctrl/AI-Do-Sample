import assert from 'assert'
import { getDdasomiReply } from '../src/lib/ddasomiChat.js'

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj)
    for (const v of Object.values(obj)) deepFreeze(v)
  }
  return obj
}

async function run(name, fn) {
  try {
    await fn()
    console.log(`OK   ${name}`)
  } catch (err) {
    console.log(`FAIL ${name}`)
    throw err
  }
}

const snapshot = deepFreeze({
  dataSource: 'demo',
  planBaselineDate: '2026-07-07',
  lastEntryDate: '2026-07-07',
  counts: { total: 22, done: 1, inProgress: 20, waiting: 1 },
  canCompute: true,
  overall: 72.7,
  plannedOverall: 69.9,
  byField: { 기계: 75.2, 전기: 60, 제어: 37 },
  byEquipment: [{ equipment: 'GT', field: '기계', count: 4, progress: 94 }],
  delayRiskCount: 0,
  delayRiskTasks: [],
})

function counting(result) {
  let calls = 0
  const fn = async (...args) => {
    calls += 1
    if (typeof result === 'function') return result(...args)
    return result
  }
  return { fn, getCalls: () => calls }
}

await run('GPT가 성공적으로 답하면 그 문장을 그대로 사용한다', async () => {
  const { fn } = counting({ ok: true, answer: '현재 저장된 실적 기준 전체 공정률은 72.7%예요.' })
  const r = await getDdasomiReply('전체 몇 프로야?', snapshot, fn)
  assert.strictEqual(r.kind, 'answer')
  assert.strictEqual(r.text, '현재 저장된 실적 기준 전체 공정률은 72.7%예요.')
})

await run('실적 삭제 요청은 GPT를 호출하지 않고 즉시 거부한다(허위로 "삭제했다"고 답할 위험 차단)', async () => {
  const { fn, getCalls } = counting({ ok: true, answer: '네 삭제했어요' })
  const r = await getDdasomiReply('오늘 실적 삭제해줘', snapshot, fn)
  assert.strictEqual(r.kind, 'refused')
  assert.strictEqual(getCalls(), 0)
  assert.ok(!r.text.includes('삭제했'))
})

await run('데이터가 없을 때도 GPT를 호출하지 않고 안내 문구를 바로 쓴다', async () => {
  const empty = deepFreeze({ ...snapshot, dataSource: 'empty', canCompute: false })
  const { fn, getCalls } = counting({ ok: true, answer: '아무튼 답변' })
  const r = await getDdasomiReply('전체 몇 프로야?', empty, fn)
  assert.strictEqual(r.kind, 'no_data')
  assert.strictEqual(getCalls(), 0)
})

await run('GPT 호출이 null(비활성/실패)이어도 로컬이 답을 알면 조용히 로컬 답으로 대체(사과문 노출 안 함)', async () => {
  const { fn } = counting(null)
  const r = await getDdasomiReply('전체 몇 프로야?', snapshot, fn)
  assert.strictEqual(r.kind, 'answer')
  assert.ok(r.text.includes('72.7%'))
  assert.ok(!r.text.includes('문제가 생겼어요'))
})

await run('GPT 호출이 예외를 던져도 로컬이 답을 알면 조용히 로컬 답으로 대체', async () => {
  const throwingFn = async () => {
    throw new Error('network down')
  }
  const r = await getDdasomiReply('기계 분야 진행률은?', snapshot, throwingFn)
  assert.strictEqual(r.kind, 'answer')
  assert.ok(r.text.includes('75.2%'))
})

await run('GPT도 실패하고 로컬도 이해 못하는 자유 질문이면 그때만 사과 문구를 보인다', async () => {
  const { fn } = counting(null)
  const r = await getDdasomiReply('오늘 날씨 어때?', snapshot, fn)
  assert.strictEqual(r.kind, 'error')
  assert.strictEqual(r.text, '잠시 문제가 생겼어요. 공정 데이터를 다시 확인해볼게요.')
})

await run('GPT가 이상한 형식(ok 없음, answer 없음)을 반환해도 로컬로 안전하게 대체', async () => {
  const { fn } = counting({ answer: '이상한 응답' }) // ok 필드 없음 → 무효 처리되어야 함
  const r = await getDdasomiReply('전체 몇 프로야?', snapshot, fn)
  assert.strictEqual(r.kind, 'answer')
  assert.ok(r.text.includes('72.7%'))
  assert.ok(!r.text.includes('이상한 응답'))
})

await run('askFn이 함수가 아니면(연동 미구성) 바로 로컬로 처리', async () => {
  const r = await getDdasomiReply('전체 몇 프로야?', snapshot, undefined)
  assert.strictEqual(r.kind, 'answer')
  assert.ok(r.text.includes('72.7%'))
})

console.log('모든 ddasomiChat 테스트 통과')
