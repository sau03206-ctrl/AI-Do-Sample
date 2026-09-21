import assert from 'assert'
import { validateClassification } from '../api/chatbot-interpret.js'

function run(name, fn) {
  try {
    fn()
    console.log(`OK   ${name}`)
  } catch (err) {
    console.log(`FAIL ${name}`)
    throw err
  }
}

const ALLOWED_EQUIPMENT = ['GT', 'ST', '발전기']

run('overall — 그대로 통과', () => {
  const r = validateClassification({ intent: 'overall' }, ALLOWED_EQUIPMENT)
  assert.deepStrictEqual(r, { intent: 'overall', fields: [], equipment: [] })
})

run('unsupported — 그대로 통과', () => {
  const r = validateClassification({ intent: 'unsupported' }, ALLOWED_EQUIPMENT)
  assert.deepStrictEqual(r, { intent: 'unsupported', fields: [], equipment: [] })
})

run('field — 허용 목록 안의 값만 통과', () => {
  const r = validateClassification({ intent: 'field', fields: ['기계', '없는분야'] }, ALLOWED_EQUIPMENT)
  assert.deepStrictEqual(r, { intent: 'field', fields: ['기계'], equipment: [] })
})

run('field — 허용 목록에 하나도 없으면 무효', () => {
  const r = validateClassification({ intent: 'field', fields: ['없는분야'] }, ALLOWED_EQUIPMENT)
  assert.strictEqual(r, null)
})

run('equipment — 이번 요청에서 보낸 설비 목록 안의 값만 통과', () => {
  const r = validateClassification({ intent: 'equipment', equipment: ['GT', '모르는설비'] }, ALLOWED_EQUIPMENT)
  assert.deepStrictEqual(r, { intent: 'equipment', fields: [], equipment: ['GT'] })
})

run('equipment — 요청에 없던 설비만 지어내면 무효', () => {
  const r = validateClassification({ intent: 'equipment', equipment: ['모르는설비'] }, ALLOWED_EQUIPMENT)
  assert.strictEqual(r, null)
})

run('알 수 없는 intent는 무효', () => {
  assert.strictEqual(validateClassification({ intent: 'delete_everything' }, ALLOWED_EQUIPMENT), null)
})

run('intent 누락은 무효', () => {
  assert.strictEqual(validateClassification({}, ALLOWED_EQUIPMENT), null)
})

run('객체가 아니면 무효', () => {
  assert.strictEqual(validateClassification(null, ALLOWED_EQUIPMENT), null)
  assert.strictEqual(validateClassification('overall', ALLOWED_EQUIPMENT), null)
  assert.strictEqual(validateClassification(123, ALLOWED_EQUIPMENT), null)
})

run('허용 필드 외의 값은 결과에 포함되지 않는다(추가 정보 유출 방지)', () => {
  const r = validateClassification({ intent: 'overall', overall: 999, secret: 'x' }, ALLOWED_EQUIPMENT)
  assert.deepStrictEqual(Object.keys(r).sort(), ['equipment', 'fields', 'intent'])
})

console.log('모든 chatbot-interpret 검증 테스트 통과')
