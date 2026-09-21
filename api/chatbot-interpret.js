// Vercel 서버리스 함수 — 공정 챗봇의 자유 질문을 "분류"만 한다 (숫자는 절대 다루지 않음).
// 공정률·지연위험 등 실제 숫자는 여기서 계산하지 않고, 클라이언트가 기존 progress.js/schedule.js 계산 결과를
// 그대로 사용해 화면에 표시한다. 이 함수가 반환하는 건 "어떤 질문 종류인지 + 어느 분야/설비인지"뿐이다.
//
// 기본은 비활성 상태다: GPT_CHAT_ENABLED=true, OPENAI_API_KEY, APP_TOKEN 세 가지가 모두 설정되어 있지
// 않으면 항상 { ok:false } 를 반환하고 OpenAI를 호출하지 않는다. 활성화는 배포 환경변수 설정으로만 가능하다.

const FIELDS = ['기계', '전기', '제어']
const INTENTS = ['overall', 'field', 'equipment', 'equipmentList', 'plannedGap', 'delayRisk', 'counts', 'unsupported']
const EQUIPMENT_NAME_RE = /^[a-zA-Z0-9가-힣/\s]{1,40}$/

const MAX_QUESTION_LEN = 300
const MAX_EQUIPMENT_ITEMS = 20
const MAX_BODY_BYTES = 4 * 1024

function fail(res, status, reason) {
  res.status(status).json({ ok: false, reason })
}

// GPT가 돌려준 원시 JSON을 허용 목록으로 걸러 정규화한다. 여기서 걸러지지 않은 값은 절대 클라이언트로 나가지 않는다.
export function validateClassification(raw, allowedEquipment) {
  if (!raw || typeof raw !== 'object') return null
  const intent = INTENTS.includes(raw.intent) ? raw.intent : null
  if (!intent) return null

  const rawFields = Array.isArray(raw.fields) ? raw.fields : []
  const fields = rawFields.filter((f) => FIELDS.includes(f))

  const allowedSet = new Set(Array.isArray(allowedEquipment) ? allowedEquipment : [])
  const rawEquipment = Array.isArray(raw.equipment) ? raw.equipment : []
  const equipment = rawEquipment.filter((e) => allowedSet.has(e))

  if (intent === 'field' && fields.length === 0) return null
  if (intent === 'equipment' && equipment.length === 0) return null

  return { intent, fields, equipment }
}

function validateRequestBody(body) {
  if (!body || typeof body !== 'object') return { error: 'invalid_request' }
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (!question || question.length > MAX_QUESTION_LEN) return { error: 'invalid_request' }

  const equipment = Array.isArray(body.equipment) ? body.equipment : []
  if (equipment.length > MAX_EQUIPMENT_ITEMS) return { error: 'invalid_request' }
  for (const e of equipment) {
    if (typeof e !== 'string' || !EQUIPMENT_NAME_RE.test(e)) return { error: 'invalid_request' }
  }
  return { question, equipment }
}

async function callOpenAI({ question, equipment, apiKey, model, timeoutMs }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const systemPrompt =
      '너는 발전소 오버홀 공정 챗봇의 질문 분류기다. 아래 JSON 스키마로만 답하라(설명 문장 금지, 숫자 계산 금지):\n' +
      '{"intent": one of ["overall","field","equipment","equipmentList","plannedGap","delayRisk","counts","unsupported"],\n' +
      ' "fields": array, 반드시 ["기계","전기","제어"] 중에서만 (intent가 field일 때만 채움),\n' +
      ' "equipment": array, 반드시 주어진 설비 목록의 문자열과 정확히 같은 값만 (intent가 equipment일 때만 채움)}\n' +
      '분류 기준: overall=전체 공정률, field=분야별(기계/전기/제어), equipment=특정 설비 하나 이상,\n' +
      'equipmentList=설비 전체 목록, plannedGap=계획 대비 차이/지연 여부, delayRisk=지연 위험 작업 목록,\n' +
      'counts=완료/진행/대기 건수. 위 범주에 맞지 않으면 intent는 반드시 "unsupported".\n' +
      `사용 가능한 설비 목록: ${JSON.stringify(equipment)}`

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 150,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
      }),
      signal: controller.signal,
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) return null
    try {
      return JSON.parse(content)
    } catch {
      return null
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed')

  // 킬스위치 + 필수 설정 — 하나라도 비어 있으면 항상 비활성(fail-closed)
  if (process.env.GPT_CHAT_ENABLED !== 'true') return fail(res, 200, 'disabled')
  const apiKey = process.env.OPENAI_API_KEY
  const appToken = process.env.APP_TOKEN
  if (!apiKey || !appToken) return fail(res, 200, 'disabled')

  // 경량 접근 토큰 — 완전한 사용자 인증이 아니라 남용 방지용 최소 조치
  if (req.headers['x-app-token'] !== appToken) return fail(res, 401, 'unauthorized')

  // 요청 크기 제한
  const rawLen = req.headers['content-length'] ? Number(req.headers['content-length']) : JSON.stringify(req.body || {}).length
  if (rawLen > MAX_BODY_BYTES) return fail(res, 413, 'invalid_request')

  const parsed = validateRequestBody(req.body)
  if (parsed.error) return fail(res, 400, parsed.error)

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const raw = await callOpenAI({ question: parsed.question, equipment: parsed.equipment, apiKey, model, timeoutMs: 6000 })
  if (!raw) return fail(res, 200, 'upstream_error')

  const classification = validateClassification(raw, parsed.equipment)
  if (!classification) return fail(res, 200, 'validation_failed')

  res.status(200).json({ ok: true, classification })
}
