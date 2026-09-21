import assert from 'assert'
import { sanitizeContext } from '../api/chat.js'

function run(name, fn) {
  try {
    fn()
    console.log(`OK   ${name}`)
  } catch (err) {
    console.log(`FAIL ${name}`)
    throw err
  }
}

run('정상 snapshot — 필요한 값만 그대로 통과', () => {
  const c = sanitizeContext({
    dataSource: 'demo',
    planBaselineDate: '2026-07-07',
    lastEntryDate: '2026-07-07',
    canCompute: true,
    counts: { total: 22, done: 1, inProgress: 20, waiting: 1 },
    overall: 72.7,
    plannedOverall: 69.9,
    byField: { 기계: 75.2, 전기: 60, 제어: 37 },
    byEquipment: [{ equipment: 'GT', field: '기계', count: 4, progress: 94 }],
    delayRiskCount: 9,
    delayRiskTasks: [{ taskId: 'x', equipment: 'HRSG', field: '기계', name: '드럼 내부 점검', progress: 66.7 }],
  })
  assert.strictEqual(c.overall, 72.7)
  assert.deepStrictEqual(c.counts, { total: 22, done: 1, inProgress: 20, waiting: 1 })
  assert.strictEqual(c.byField.기계, 75.2)
  assert.strictEqual(c.byEquipment[0].equipment, 'GT')
  assert.strictEqual(c.delayRiskTasks[0].name, '드럼 내부 점검')
})

run('허용되지 않은/이상한 값은 조용히 버려진다(서버가 클라이언트를 신뢰하지 않음)', () => {
  const c = sanitizeContext({
    dataSource: 'hacked',
    overall: 999,
    plannedOverall: -5,
    byField: { 기계: 200, 없는분야: 50 },
    counts: { total: -1, done: 'x' },
    project: { secret: 'should not leak' },
  })
  assert.strictEqual(c.dataSource, null)
  assert.strictEqual(c.overall, null)
  assert.strictEqual(c.plannedOverall, null)
  assert.strictEqual(c.byField.기계, undefined)
  assert.strictEqual(c.byField.없는분야, undefined)
  assert.strictEqual(c.counts.total, 0)
  assert.strictEqual(c.project, undefined)
})

run('배열은 상한을 넘지 않는다(과도한 payload 방지)', () => {
  const bigEquipment = Array.from({ length: 50 }, (_, i) => ({ equipment: `EQ${i}`, field: '기계', count: 1, progress: 50 }))
  const bigRisk = Array.from({ length: 50 }, (_, i) => ({ equipment: `EQ${i}`, name: `작업${i}`, progress: 10 }))
  const c = sanitizeContext({ byEquipment: bigEquipment, delayRiskTasks: bigRisk })
  assert.ok(c.byEquipment.length <= 20)
  assert.ok(c.delayRiskTasks.length <= 10)
})

run('context가 null/객체가 아니어도 죽지 않고 안전한 기본값을 준다', () => {
  assert.doesNotThrow(() => sanitizeContext(null))
  assert.doesNotThrow(() => sanitizeContext('hello'))
  assert.doesNotThrow(() => sanitizeContext(42))
  const c = sanitizeContext(null)
  assert.strictEqual(c.dataSource, null)
  assert.deepStrictEqual(c.counts, { total: 0, done: 0, inProgress: 0, waiting: 0 })
})

console.log('모든 api/chat sanitizeContext 테스트 통과')
