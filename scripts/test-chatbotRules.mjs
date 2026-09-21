import assert from 'assert'
import { answerQuestion, FAQ_QUESTIONS } from '../src/lib/chatbotRules.js'

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

const baseSnapshot = deepFreeze({
  queriedAt: '2026-07-15T00:00:00.000Z',
  dataSource: 'demo',
  planBaselineDate: '2026-07-07',
  lastEntryDate: '2026-07-05',
  project: { name: 'P', unit: 'U', plant: 'PL', startDate: '2026-06-22', endDate: '2026-07-17', today: '2026-07-07' },
  counts: { total: 10, done: 8, inProgress: 1, waiting: 1 }, // 완료 비율(80%)과 물량 기준 overall(37%)이 다르도록 설계
  canCompute: true,
  overall: 37,
  plannedOverall: 55,
  byField: { 기계: 40, 전기: 30, 제어: 20 },
  byEquipment: [
    { equipment: 'GT', field: '기계', count: 4, progress: 60 },
    { equipment: 'ST', field: '기계', count: 3, progress: 30 },
    { equipment: '발전기', field: '전기', count: 2, progress: 45 },
  ],
  delayRiskCount: 2,
  delayRiskTasks: [
    { taskId: 'T1', equipment: 'ST', field: '기계', name: '커플링 정렬', progress: 30 },
    { taskId: 'T2', equipment: '발전기', field: '전기', name: '고정자 절연저항 측정', progress: 45 },
  ],
  scheduleInfo: { totalDays: 25, elapsed: 15, expected: 60 },
  anomalies: [],
  hasAnomalies: false,
})

// 1) 전체 공정률 — 완료 작업 비율(80%)이 아니라 물량 기준 overall(37%)을 써야 한다
run('전체 공정률은 완료작업비율이 아니라 물량 기준 overall을 사용', () => {
  const r = answerQuestion('전체 몇 프로야?', baseSnapshot)
  assert.strictEqual(r.kind, 'answer')
  assert.ok(r.text.includes('37%'), '물량 기준 overall(37%)이 포함되어야 한다')
  assert.ok(!r.text.includes('80%'), '완료 작업 비율(80%)과 혼동하면 안 된다')
})

// 2) 분야별 — 단일 매치
run('기계 분야 진행률 — byField 값을 그대로 사용', () => {
  const r = answerQuestion('기계 분야 진행률은?', baseSnapshot)
  assert.strictEqual(r.kind, 'answer')
  assert.ok(r.text.includes('40%'))
})

// 3) 분야별 — 여러 분야 언급 시 선택 요청
run('기계·전기 동시 언급 시 선택을 요청', () => {
  const r = answerQuestion('기계랑 전기 공정률 알려줘', baseSnapshot)
  assert.strictEqual(r.kind, 'clarify')
  assert.strictEqual(r.suggestions.length, 2)
})

// 4) 설비별 — 특정 설비 매치
run('GT 공정률 — byEquipment 값을 그대로 사용', () => {
  const r = answerQuestion('GT 공정률 알려줘', baseSnapshot)
  assert.strictEqual(r.kind, 'answer')
  assert.ok(r.text.includes('60%'))
})

// 5) 설비별 — 데이터에 없는 설비는 추측하지 않고 안내만
run('데이터에 없는 설비는 숫자를 지어내지 않는다', () => {
  const r = answerQuestion('배관 공정률 알려줘', baseSnapshot)
  assert.strictEqual(r.kind, 'unsupported')
  assert.ok(!/\d+%/.test(r.text), '존재하지 않는 설비에 % 수치를 지어내면 안 된다')
})

// 6) 설비별 — 두 설비가 동시에 언급되면 선택 요청
run('GT·ST 동시 언급 시 선택을 요청', () => {
  const r = answerQuestion('GT랑 ST 알려줘', baseSnapshot)
  assert.strictEqual(r.kind, 'clarify')
  assert.strictEqual(r.suggestions.length, 2)
})

// 7) 계획 대비 차이 — overall/plannedOverall 값만 그대로 사용(새 계산식 없음)
run('계획 대비 차이 — 기존 overall/plannedOverall 값만 사용', () => {
  const r = answerQuestion('계획보다 얼마나 늦어?', baseSnapshot)
  assert.strictEqual(r.kind, 'answer')
  assert.ok(r.text.includes('37%') && r.text.includes('55%'))
  assert.ok(r.text.includes('18%p'), '차이는 55-37=18%p 여야 한다')
})

// 8) 지연 위험 — 목록/건수 그대로 노출
run('지연 위험 작업 — delayRiskTasks 그대로 노출', () => {
  const r = answerQuestion('지연 위험 작업 보여줘', baseSnapshot)
  assert.strictEqual(r.kind, 'answer')
  assert.ok(r.text.includes('2건'))
  assert.ok(r.text.includes('ST'))
})

// 9) 완료/진행/대기 수
run('완료·진행·대기 작업 수', () => {
  const r = answerQuestion('완료 진행 대기 몇 건이야?', baseSnapshot)
  assert.strictEqual(r.kind, 'answer')
  assert.ok(r.text.includes('완료 8건') && r.text.includes('진행 중 1건') && r.text.includes('대기 1건'))
})

// 10) 데이터 없음과 0%를 구분
run('데이터 없음(empty)은 0%가 아니라 안내 메시지', () => {
  const empty = deepFreeze({ ...baseSnapshot, dataSource: 'empty', canCompute: false, overall: null, byField: null, byEquipment: null, plannedOverall: null, delayRiskCount: null, delayRiskTasks: null, counts: { total: 0, done: 0, inProgress: 0, waiting: 0 } })
  const r = answerQuestion('전체 몇 프로야?', empty)
  assert.strictEqual(r.kind, 'no_data')
  assert.ok(!r.text.includes('0%'), '데이터 없음을 0%로 표현하면 안 된다')
})

// 11) 작업은 있지만 유효한 계획수량이 없는 경우 — 공정률류는 계산 불가, counts는 실제 값 응답
run('유효 계획수량 없음 — 공정률은 계산 불가, counts는 그대로 응답', () => {
  const noPlan = deepFreeze({ ...baseSnapshot, canCompute: false, overall: null, byField: null, byEquipment: null, plannedOverall: null, delayRiskCount: null, delayRiskTasks: null })
  assert.strictEqual(answerQuestion('전체 몇 프로야?', noPlan).kind, 'no_data')
  assert.strictEqual(answerQuestion('GT 공정률 알려줘', noPlan).kind, 'no_data')
  const countsR = answerQuestion('완료 몇 건이야?', noPlan)
  assert.strictEqual(countsR.kind, 'answer')
  assert.ok(countsR.text.includes('완료 8건'))
})

// 12) 실적 수정/삭제 요청은 거부하고, snapshot을 변경하지 않는다(순수 함수)
run('실적 수정/삭제 요청은 거부하고 데이터는 변경하지 않는다', () => {
  const before = JSON.stringify(baseSnapshot)
  const r = answerQuestion('오늘 실적 삭제해줘', baseSnapshot)
  assert.strictEqual(r.kind, 'refused')
  assert.strictEqual(JSON.stringify(baseSnapshot), before)
})

// 13) 지원하지 않는 질문 — 숫자나 원인을 지어내지 않고 FAQ 안내만
run('지원하지 않는 질문 — 숫자를 지어내지 않고 FAQ를 안내', () => {
  const r = answerQuestion('내일 날씨 어때?', baseSnapshot)
  assert.strictEqual(r.kind, 'unsupported')
  assert.ok(!/\d+%/.test(r.text))
  assert.deepStrictEqual(r.suggestions, FAQ_QUESTIONS)
})

// 14) 계획 비교 기준일과 최근 실적 입력일을 혼동하지 않는다
run('계획 비교 기준일과 최근 실적 입력일을 혼동하지 않는다', () => {
  const r = answerQuestion('전체 몇 프로야?', baseSnapshot)
  assert.ok(r.text.includes(baseSnapshot.planBaselineDate), '기준일이 답변에 표시되어야 한다')
  assert.ok(!r.text.includes(baseSnapshot.lastEntryDate), '최근 실적 입력일을 기준일처럼 답변에 섞으면 안 된다')
})

console.log('모든 chatbotRules 테스트 통과')
