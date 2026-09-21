// 조회 전용 챗봇용 요약 데이터 — 화면/외부 API 없이 기존 store·progress·schedule 계산만 재사용
import { overallProgress, progressByField, progressByEquipment, taskStatus, taskProgress, scheduleInfo as scheduleInfoOf } from './progress.js'
import { plannedOverall, scheduleDelayTasks } from './schedule.js'

// 유효한 계획수량(0 초과, 유한수)만 인정 — 하나도 없으면 "0%"가 아니라 "계산 불가"로 구분
function hasAnyValidPlanQty(tasks) {
  return tasks.some((t) => {
    const p = Number(t.planQty)
    return Number.isFinite(p) && p > 0
  })
}

// 음수/비정상 수량 탐지 — 값을 고치거나 걸러내지 않고 그대로 경고 목록에만 남긴다
function findQuantityAnomalies(tasks) {
  const anomalies = []
  for (const t of tasks) {
    const plan = Number(t.planQty)
    const done = Number(t.doneQty)
    const invalidPlan = !Number.isFinite(plan) || plan < 0
    const invalidDone = !Number.isFinite(done) || done < 0
    if (invalidPlan) {
      anomalies.push({ taskId: t.id, equipment: t.equipment, field: t.field, name: t.name, issue: 'invalid_planQty', planQty: t.planQty })
    }
    if (invalidDone) {
      anomalies.push({ taskId: t.id, equipment: t.equipment, field: t.field, name: t.name, issue: 'invalid_doneQty', doneQty: t.doneQty })
    }
    if (!invalidPlan && !invalidDone && done > plan) {
      anomalies.push({ taskId: t.id, equipment: t.equipment, field: t.field, name: t.name, issue: 'doneQty_exceeds_planQty', planQty: plan, doneQty: done })
    }
  }
  return anomalies
}

// 작업 전체를 훑어 실제 기록된 실적(entries) 중 가장 최근 날짜만 찾는다 — 누계를 더하지 않음, 특정 날짜의 실적으로 재해석하지 않음
function findLastEntryDate(tasks) {
  let last = null
  for (const t of tasks) {
    for (const e of t.entries || []) {
      if (e && e.date && (last === null || e.date > last)) last = e.date
    }
  }
  return last
}

function classifyDataSource(sources) {
  if (!sources || sources.length === 0) return 'empty'
  return sources.every((s) => s.demo) ? 'demo' : 'uploaded'
}

/**
 * 챗봇이 답변에 쓸 조회 전용 요약 스냅샷.
 * state.tasks / state.project를 읽기만 하고, 전체·분야별·설비별 공정률과 계획/지연 판정은
 * progress.js·schedule.js의 기존 함수를 그대로 재사용한다(새 계산식을 만들지 않음).
 */
export function getChatbotSnapshot(state) {
  const queriedAt = new Date().toISOString()
  const tasks = state?.tasks || []
  const project = state?.project || null
  const sources = state?.sources || []

  const dataSource = classifyDataSource(sources)
  const anomalies = findQuantityAnomalies(tasks)
  const lastEntryDate = findLastEntryDate(tasks)
  const planBaselineDate = project?.today ?? null

  const counts = { total: tasks.length, done: 0, inProgress: 0, waiting: 0 }
  for (const t of tasks) {
    const status = taskStatus(t)
    if (status === '완료') counts.done += 1
    else if (status === '진행중') counts.inProgress += 1
    else counts.waiting += 1
  }

  // 작업 자체가 없거나, 있어도 유효한 계획수량이 하나도 없으면 "0%"와 구분되는 계산 불가 상태
  const canCompute = tasks.length > 0 && hasAnyValidPlanQty(tasks)

  let overall = null
  let byField = null
  let byEquipment = null
  if (canCompute) {
    overall = overallProgress(tasks)
    byField = progressByField(tasks)
    byEquipment = progressByEquipment(tasks).map((e) => ({
      equipment: e.equipment,
      field: e.field,
      count: e.count,
      progress: e.progress,
    }))
  }

  let planned = null
  let delayRiskTasks = null
  let sched = null
  if (canCompute && project) {
    planned = plannedOverall(tasks, project, project.today)
    const risk = scheduleDelayTasks(tasks, project, project.today)
    delayRiskTasks = risk.map((t) => ({
      taskId: t.id,
      equipment: t.equipment,
      field: t.field,
      name: t.name,
      progress: taskProgress(t),
    }))
    const info = scheduleInfoOf(project)
    sched = { totalDays: info.totalDays, elapsed: info.elapsed, expected: info.expected }
  }

  return {
    queriedAt,
    dataSource,
    planBaselineDate,
    lastEntryDate,
    project: project
      ? {
          name: project.name,
          unit: project.unit,
          plant: project.plant,
          startDate: project.startDate,
          endDate: project.endDate,
          today: project.today,
        }
      : null,
    counts,
    canCompute,
    overall,
    plannedOverall: planned,
    byField,
    byEquipment,
    delayRiskCount: delayRiskTasks ? delayRiskTasks.length : null,
    delayRiskTasks,
    scheduleInfo: sched,
    anomalies,
    hasAnomalies: anomalies.length > 0,
  }
}
