// 자유 질문 해석을 위한 GPT 호출 — 브라우저는 API 키를 절대 갖지 않고 /api/chatbot-interpret만 호출한다.
// 실패(비활성/네트워크 오류/타임아웃/서버 거부) 시 항상 null을 반환 — 호출부(chatbotRules.answerQuestionWithAI)가
// 그대로 로컬 규칙 기반 응답으로 대체하도록 설계되어 있다. 여기서 숫자를 계산하거나 문장을 만들지 않는다.
export async function classifyQuestionWithAI(question, equipmentNames, { timeoutMs = 6000 } = {}) {
  const token = import.meta.env.VITE_APP_TOKEN
  if (!token) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('/api/chatbot-interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': token },
      body: JSON.stringify({ question, equipment: equipmentNames }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || data.ok !== true) return null
    return data.classification
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// 따소미의 실제 답변을 GPT로 받아온다 — /api/chat에 (질문, 검증된 요약 데이터)만 보낸다.
// 실패(비활성/네트워크 오류/타임아웃/서버 거부) 시 항상 null을 반환 — 호출부(ddasomiChat.getDdasomiReply)가
// 로컬 규칙 기반 응답으로 대체하도록 설계되어 있다. 여기서 숫자를 계산하지 않는다.
export async function askDdasomi(message, context, { timeoutMs = 10000 } = {}) {
  const token = import.meta.env.VITE_APP_TOKEN
  if (!token) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': token },
      body: JSON.stringify({ message, context }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || data.ok !== true) return null
    return data
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
