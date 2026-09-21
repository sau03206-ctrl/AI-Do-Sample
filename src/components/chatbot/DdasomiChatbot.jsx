import { useMemo, useState } from 'react'
import { useStore } from '../../lib/store'
import { getChatbotSnapshot } from '../../lib/chatbotData'
import { getDdasomiReply } from '../../lib/ddasomiChat'
import { askDdasomi } from '../../lib/chatbotAI'
import ChatbotFloatingButton from './ChatbotFloatingButton'
import ChatbotWindow from './ChatbotWindow'
import './ddasomi.css'

const WELCOME = {
  role: 'assistant',
  kind: 'answer',
  text: '안녕하세요! 따소미예요 👋\n\n오버홀 공정 현황이 궁금하신가요?\n\n전체 공정률, 분야별 진행 상황,\n지연 작업 등을 물어보세요.',
}

// PlantSync Pro 어디서든 보이는 플로팅 챗봇. Layout이 StoreProvider 안쪽에서만 렌더링되므로
// (App.jsx가 store 로딩 전엔 Layout 자체를 그리지 않음) 여기서는 state가 항상 준비되어 있다고 가정한다.
export default function DdasomiChatbot() {
  const { state } = useStore()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([WELCOME])
  const [pending, setPending] = useState(false)

  const snapshot = useMemo(() => getChatbotSnapshot(state), [state])

  async function ask(text) {
    const q = text.trim()
    if (!q) return
    setMessages((prev) => [...prev, { role: 'user', text: q }])
    setPending(true)
    // /api/chat(GPT)에 질문 + 검증된 요약 데이터(snapshot)를 보내 답을 받는다. 현재는 환경변수 미설정으로
    // 항상 비활성 → 아래 로컬 규칙 기반 응답으로 조용히 대체된다. 숫자는 언제나 기존 계산 함수 결과에서 나온다.
    const reply = await getDdasomiReply(q, snapshot, askDdasomi)
    setPending(false)
    setMessages((prev) => [...prev, { role: 'assistant', ...reply }])
  }

  return (
    <>
      <ChatbotFloatingButton open={open} onToggle={() => setOpen((o) => !o)} />
      <ChatbotWindow open={open} onClose={() => setOpen(false)} messages={messages} pending={pending} onAsk={ask} snapshot={snapshot} />
    </>
  )
}
