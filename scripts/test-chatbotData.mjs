import assert from 'assert'
import { getChatbotSnapshot } from '../src/lib/chatbotData.js'
import { overallProgress, progressByField } from '../src/lib/progress.js'
import { plannedOverall, scheduleDelayTasks } from '../src/lib/schedule.js'

function task(id, field, equipment, name, planQty, doneQty, entries = []) {
  return { id, field, equipment, name, spec: '', unit: 'EA', planQty, doneQty, assignee: '홍길동', entries }
}

const project = {
  name: '테스트 프로젝트',
  unit: '테스트호기',
  plant: '테스트지사',
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  today: '2026-07-15',
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

// 1) 정상 케이스: 기존 progress.js/schedule.js 계산과 동일한 값이 나와야 한다
run('정상 데이터 — 기존 계산과 동일한 결과', () => {
  const tasks = [
    task('T1', '기계', 'GT', '블레이드 점검', 100, 60),
    task('T2', '전기', '발전기', '절연저항 측정', 50, 50),
    task('T3', '제어', 'DCS', 'I/O 점검', 40, 0),
  ]
  const state = { tasks, project, sources: [{ id: 'demo', demo: true, count: 3 }] }
  const before = JSON.stringify(state)
  const snap = getChatbotSnapshot(state)

  assert.strictEqual(JSON.stringify(state), before, '원본 state가 변경되지 않아야 한다')
  assert.strictEqual(snap.dataSource, 'demo')
  assert.strictEqual(snap.canCompute, true)
  assert.strictEqual(snap.overall, overallProgress(tasks))
  assert.deepStrictEqual(snap.byField, progressByField(tasks))
  assert.strictEqual(snap.plannedOverall, plannedOverall(tasks, project, project.today))
  assert.strictEqual(snap.delayRiskCount, scheduleDelayTasks(tasks, project, project.today).length)
  assert.deepStrictEqual(snap.counts, { total: 3, done: 1, inProgress: 1, waiting: 1 })
  assert.strictEqual(snap.hasAnomalies, false)
  assert.strictEqual(snap.planBaselineDate, project.today)
})

// 2) 업로드 데이터 구분
run('데모가 아닌 업로드 데이터 구분', () => {
  const tasks = [task('T1', '기계', 'GT', 'A', 10, 5)]
  const state = { tasks, project, sources: [{ id: 'SRC1', fileName: 'x.xlsx', demo: false, count: 1 }] }
  const snap = getChatbotSnapshot(state)
  assert.strictEqual(snap.dataSource, 'uploaded')
})

// 3) 작업 없음 — 0%가 아니라 계산 불가
run('작업 없음 — 계산 불가로 구분(0%와 다름)', () => {
  const state = { tasks: [], project, sources: [] }
  const snap = getChatbotSnapshot(state)
  assert.strictEqual(snap.dataSource, 'empty')
  assert.strictEqual(snap.canCompute, false)
  assert.strictEqual(snap.overall, null)
  assert.strictEqual(snap.plannedOverall, null)
  assert.deepStrictEqual(snap.counts, { total: 0, done: 0, inProgress: 0, waiting: 0 })
})

// 4) 작업은 있지만 유효한 계획수량이 전부 0 — 역시 계산 불가
run('유효한 계획수량 없음 — 계산 불가로 구분', () => {
  const tasks = [task('T1', '기계', 'GT', 'A', 0, 0), task('T2', '기계', 'GT', 'B', 0, 0)]
  const state = { tasks, project, sources: [{ id: 'S1', demo: false, count: 2 }] }
  const snap = getChatbotSnapshot(state)
  assert.strictEqual(snap.canCompute, false)
  assert.strictEqual(snap.overall, null)
  assert.strictEqual(snap.counts.total, 2)
})

// 5) 음수/비정상 수량 — 고치지 않고 경고만
run('음수·초과 수량은 고치지 않고 anomalies로 경고', () => {
  const tasks = [
    task('T1', '기계', 'GT', '음수 계획', -10, 5),
    task('T2', '기계', 'GT', '음수 실적', 10, -3),
    task('T3', '기계', 'GT', '초과 실적', 10, 15),
    task('T4', '기계', 'GT', '정상', 10, 5),
  ]
  const state = { tasks, project, sources: [{ id: 'S1', demo: false, count: 4 }] }
  const snap = getChatbotSnapshot(state)
  assert.strictEqual(snap.hasAnomalies, true)
  const issues = snap.anomalies.map((a) => a.issue)
  assert.ok(issues.includes('invalid_planQty'))
  assert.ok(issues.includes('invalid_doneQty'))
  assert.ok(issues.includes('doneQty_exceeds_planQty'))
  assert.strictEqual(snap.anomalies.some((a) => a.taskId === 'T4'), false, '정상 항목은 경고에 포함되지 않아야 한다')
  // 대시보드와 다른 계산식을 새로 만들지 않았는지: 기존 overallProgress 결과와 동일해야 한다
  assert.strictEqual(snap.overall, overallProgress(tasks))
})

// 6) 실적 이력의 마지막 날짜만 뽑고, 누계를 더하지 않는다
run('마지막 실적 일자는 entries 중 최근 날짜만, 누계는 doneQty 그대로 사용', () => {
  const tasks = [
    task('T1', '기계', 'GT', 'A', 100, 70, [
      { date: '2026-07-10', cumulative: 40 },
      { date: '2026-07-12', cumulative: 70 },
    ]),
    task('T2', '전기', '발전기', 'B', 50, 20, [{ date: '2026-07-05', cumulative: 20 }]),
  ]
  const state = { tasks, project, sources: [{ id: 'S1', demo: false, count: 2 }] }
  const snap = getChatbotSnapshot(state)
  assert.strictEqual(snap.lastEntryDate, '2026-07-12')
  // doneQty(70)를 그대로 쓰고, entries 누계(40+70)를 더해 만들지 않았는지 확인
  assert.strictEqual(snap.overall, overallProgress(tasks))
  assert.notStrictEqual(snap.overall, 110) // 40+70 같은 잘못된 합산이 아님
})

// 7) 개인정보/사진 미포함 — assignee, entries 원본이 결과에 없어야 한다
run('assignee·entries 원본을 반환에 포함하지 않는다', () => {
  const tasks = [task('T1', '기계', 'GT', 'A', 10, 5, [{ date: '2026-07-10', cumulative: 5, photoBefore: 'x.jpg' }])]
  const state = { tasks, project, sources: [{ id: 'S1', demo: false, count: 1 }] }
  const snap = getChatbotSnapshot(state)
  const dump = JSON.stringify(snap)
  assert.ok(!dump.includes('홍길동'))
  assert.ok(!dump.includes('photoBefore'))
  assert.ok(!dump.includes('x.jpg'))
})

console.log('모든 chatbotData 테스트 통과')
