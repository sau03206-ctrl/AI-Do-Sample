import assert from 'assert'
import { answerQuestion, answerQuestionWithAI, answerFromClassification } from '../src/lib/chatbotRules.js'

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj)
    for (const v of Object.values(obj)) deepFreeze(v)
  }
  return obj
}

function run(name, fn) {
  try {
    fn()
    console.log(`OK   ${name}`)
  } catch (err) {
    console.log(`FAIL ${name}`)
    throw err
  }
}

async function runAsync(name, fn) {
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
  lastEntryDate: null,
  counts: { total: 10, done: 8, inProgress: 1, waiting: 1 },
  canCompute: true,
  overall: 37,
  plannedOverall: 55,
  byField: { 기계: 40, 전기: 30, 제어: 20 },
  byEquipment: [
    { equipment: 'GT', field: '기계', count: 4, progress: 60 },
    { equipment: 'ST', field: '기계', count: 3, progress: 30 },
  ],
  delayRiskCount: 1,
  delayRiskTasks: [{ taskId: 'T1', equipment: 'ST', field: '기계', name: '커플링 정렬', progress: 30 }],
})

function makeCountingClassifier(result) {
  let calls = 0
  const fn = async (question, equipmentNames) => {
    calls += 1
    if (typeof result === 'function') return result(question, equipmentNames)
    return result
  }
  return { fn, getCalls: () => calls }
}

await runAsync('로컬 규칙으로 이미 답이 나오면 AI 분류기를 아예 호출하지 않는다', async () => {
  const { fn, getCalls } = makeCountingClassifier({ intent: 'overall' })
  const r = await answerQuestionWithAI('전체 몇 프로야?', snapshot, fn)
  assert.strictEqual(r.kind, 'answer')
  assert.ok(r.text.includes('37%'))
  assert.strictEqual(getCalls(), 0)
})

await runAsync('실적 삭제 요청은 AI 분류기를 호출하지 않고 즉시 거부한다', async () => {
  const { fn, getCalls } = makeCountingClassifier({ intent: 'overall' })
  const r = await answerQuestionWithAI('오늘 실적 삭제해줘', snapshot, fn)
  assert.strictEqual(r.kind, 'refused')
  assert.strictEqual(getCalls(), 0)
})

await runAsync('로컬이 이해 못한 자유 질문 — AI 분류가 유효하면 기존 계산 함수로 답한다', async () => {
  const { fn } = makeCountingClassifier({ intent: 'field', fields: ['기계'] })
  const r = await answerQuestionWithAI('기계 쪽 요즘 어때', snapshot, fn)
  assert.strictEqual(r.kind, 'answer')
  assert.ok(r.text.includes('40%'), 'snapshot.byField.기계 값을 그대로 사용해야 한다')
})

await runAsync('AI 분류기가 null(비활성/실패)을 반환하면 로컬 unsupported로 대체', async () => {
  const local = answerQuestion('아무 말이나 던져봄', snapshot)
  const { fn } = makeCountingClassifier(null)
  const r = await answerQuestionWithAI('아무 말이나 던져봄', snapshot, fn)
  assert.strictEqual(r.kind, 'unsupported')
  assert.strictEqual(r.text, local.text)
})

await runAsync('AI 분류기가 예외를 던져도 항상 로컬 응답으로 안전하게 대체된다', async () => {
  const local = answerQuestion('완전히 다른 질문입니다', snapshot)
  const throwingFn = async () => {
    throw new Error('network down')
  }
  const r = await answerQuestionWithAI('완전히 다른 질문입니다', snapshot, throwingFn)
  assert.strictEqual(r.kind, 'unsupported')
  assert.strictEqual(r.text, local.text)
})

await runAsync('AI가 존재하지 않는 설비를 지어내면(검증 실패) 로컬 응답으로 대체된다', async () => {
  // validateClassification을 통과했다고 가정해도, 이 snapshot에 없는 설비면 answerFromClassification이 unsupported를 반환해야 한다
  const local = answerQuestion('없는설비 질문', snapshot)
  const { fn } = makeCountingClassifier({ intent: 'equipment', equipment: ['존재하지않는설비'] })
  const r = await answerQuestionWithAI('없는설비 질문', snapshot, fn)
  assert.strictEqual(r.kind, 'unsupported')
  assert.strictEqual(r.text, local.text)
})

await runAsync('classifyFn이 함수가 아니면(연동 미구성) 조용히 로컬 응답만 사용', async () => {
  const local = answerQuestion('아무 질문', snapshot)
  const r = await answerQuestionWithAI('아무 질문', snapshot, undefined)
  assert.strictEqual(r.kind, 'unsupported')
  assert.strictEqual(r.text, local.text)
})

run('answerFromClassification — equipment intent도 기존 answerSingleEquipment 값을 그대로 사용', () => {
  const r = answerFromClassification({ intent: 'equipment', equipment: ['GT'] }, snapshot)
  assert.strictEqual(r.kind, 'answer')
  assert.ok(r.text.includes('60%'))
})

run('answerFromClassification — delayRisk intent도 기존 answerDelayRisk 결과와 동일', () => {
  const r = answerFromClassification({ intent: 'delayRisk' }, snapshot)
  assert.strictEqual(r.kind, 'answer')
  assert.ok(r.text.includes('1건') && r.text.includes('ST'))
})

console.log('모든 chatbot AI fallback 테스트 통과')
