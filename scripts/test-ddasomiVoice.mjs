import assert from 'assert'
import { answerQuestion } from '../src/lib/chatbotRules.js'
import { toDdasomiText } from '../src/lib/ddasomiVoice.js'

function run(name, fn) {
  try {
    fn()
    console.log(`OK   ${name}`)
  } catch (err) {
    console.log(`FAIL ${name}`)
    throw err
  }
}

const snapshot = {
  dataSource: 'demo',
  planBaselineDate: '2026-07-07',
  counts: { total: 128, done: 74, inProgress: 31, waiting: 23 },
  canCompute: true,
  overall: 67.4,
  plannedOverall: 60,
  byField: { 기계: 70, 전기: 55, 제어: 40 },
  byEquipment: [{ equipment: 'GT', field: '기계', count: 4, progress: 74 }],
  delayRiskCount: 0,
  delayRiskTasks: [],
}

run('overall — snapshot의 counts/overall 값을 그대로 문장에 반영 (숫자 하드코딩 없음)', () => {
  const r = answerQuestion('전체 몇 프로야?', snapshot)
  const text = toDdasomiText(r)
  assert.ok(text.includes('67.4%'))
  assert.ok(text.includes('128개 작업 중 74개'))
  assert.ok(text.includes('31개 작업이 현재 진행 중'))
})

run('field — byField 값을 그대로 사용', () => {
  const r = answerQuestion('기계 분야 진행률은?', snapshot)
  const text = toDdasomiText(r)
  assert.ok(text.includes('70%'))
})

run('equipment — byEquipment 값을 그대로 사용', () => {
  const r = answerQuestion('GT 공정률 알려줘', snapshot)
  const text = toDdasomiText(r)
  assert.ok(text.includes('74%') && text.includes('4건'))
})

run('data가 없는 응답(안내/거부 등)은 원래 text를 그대로 사용', () => {
  const r = answerQuestion('오늘 실적 삭제해줘', snapshot)
  assert.strictEqual(r.kind, 'refused')
  assert.strictEqual(toDdasomiText(r), r.text)
})

run('지연 위험 0건일 때도 숫자를 지어내지 않고 실제 0건 상태만 표현', () => {
  const r = answerQuestion('지연 위험 작업 보여줘', snapshot)
  const text = toDdasomiText(r)
  assert.ok(text.includes('없어요'))
})

console.log('모든 ddasomiVoice 테스트 통과')
