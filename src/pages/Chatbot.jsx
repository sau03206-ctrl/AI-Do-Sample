import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Icon } from '../components/ui'
import { useStore } from '../lib/store'
import { getChatbotSnapshot } from '../lib/chatbotData'
import { answerQuestionWithAI, FAQ_QUESTIONS } from '../lib/chatbotRules'
import { classifyQuestionWithAI } from '../lib/chatbotAI'

const DATA_SOURCE_LABEL = { demo: '데모 샘플 데이터', uploaded: '업로드 데이터', empty: '데이터 없음' }

function welcomeMessage(snapshot) {
  if (snapshot.dataSource === 'empty') {
    return {
      role: 'assistant',
      kind: 'no_data',
      text: '안녕하세요, 오버홀 공정 현황 조회 챗봇입니다. 아직 등록된 데이터가 없어요. 업로드 분석 또는 실적 입력 후 다시 방문해 주세요.',
    }
  }
  return {
    role: 'assistant',
    kind: 'answer',
    text: '안녕하세요, 오버홀 공정 현황 조회 챗봇입니다. 전체·분야별·설비별 공정률, 계획 대비 차이, 지연 위험 작업을 물어보실 수 있어요.',
  }
}

function Bubble({ msg, onPick }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-primary text-on-primary rounded-br-md'
            : msg.kind === 'refused'
            ? 'bg-error-container text-on-error-container rounded-bl-md'
            : 'bg-surface-container-high text-on-surface rounded-bl-md'
        }`}
      >
        {msg.text}
        {!isUser && Array.isArray(msg.suggestions) && msg.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {msg.suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onPick(s)}
                className="px-3 py-1.5 rounded-full bg-surface-container text-xs font-semibold text-primary border border-border-subtle hover:bg-surface-container-highest transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {!isUser && (msg.kind === 'no_data' || msg.kind === 'refused') && (
          <div className="flex flex-wrap gap-2 mt-3">
            <NavHint />
          </div>
        )}
      </div>
    </div>
  )
}

function NavHint() {
  const navigate = useNavigate()
  return (
    <>
      <button
        onClick={() => navigate('/upload')}
        className="px-3 py-1.5 rounded-full bg-surface-container text-xs font-semibold text-primary border border-border-subtle hover:bg-surface-container-highest transition-colors"
      >
        업로드 분석으로 이동
      </button>
      <button
        onClick={() => navigate('/entry')}
        className="px-3 py-1.5 rounded-full bg-surface-container text-xs font-semibold text-primary border border-border-subtle hover:bg-surface-container-highest transition-colors"
      >
        실적 입력으로 이동
      </button>
    </>
  )
}

export default function Chatbot() {
  const { state } = useStore()
  const snapshot = getChatbotSnapshot(state)
  const [messages, setMessages] = useState(() => [welcomeMessage(snapshot)])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const bottomRef = useRef(null)
  const initedRef = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, pending])

  // 최초 1회만 데이터 유무에 맞는 안내 메시지로 시작 — 이후 대화는 유지
  useEffect(() => {
    if (initedRef.current) return
    initedRef.current = true
  }, [])

  async function ask(text) {
    const q = text.trim()
    if (!q) return
    setMessages((prev) => [...prev, { role: 'user', text: q }])
    setInput('')
    setPending(true)
    // 질문마다 스토어에서 최신 상태를 다시 읽어 최신 데이터로 답한다.
    // 로컬 규칙으로 해석이 안 될 때만 내부적으로 서버의 GPT 분류를 시도하고, 실패하면 항상 로컬 응답으로 대체된다.
    const freshSnapshot = getChatbotSnapshot(state)
    const answer = await answerQuestionWithAI(q, freshSnapshot, classifyQuestionWithAI)
    setPending(false)
    setMessages((prev) => [...prev, { role: 'assistant', ...answer }])
  }

  function onSubmit(e) {
    e.preventDefault()
    ask(input)
  }

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h3 className="text-display-lg text-on-surface font-bold">공정 챗봇</h3>
          <p className="text-on-surface-variant text-body-md">공정률·지연 위험을 조회만 하는 챗봇입니다 (실적 수정 불가)</p>
        </div>
      </div>

      <Card className="p-card-padding flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-on-surface-variant">
        <span className="flex items-center gap-1.5 font-semibold text-on-surface">
          <Icon name="database" className="text-sm text-primary" />
          {DATA_SOURCE_LABEL[snapshot.dataSource]}
        </span>
        {snapshot.planBaselineDate && <span>계획 비교 기준일: {snapshot.planBaselineDate}</span>}
        <span>최근 실적 입력일: {snapshot.lastEntryDate || '없음'}</span>
        {snapshot.hasAnomalies && (
          <span className="text-error font-semibold flex items-center gap-1">
            <Icon name="warning" className="text-sm" fill />
            수량 이상치 {snapshot.anomalies.length}건 발견 (작업 관리에서 확인 필요)
          </span>
        )}
      </Card>

      <Card className="p-card-padding flex flex-col gap-4 h-[60vh] min-h-[420px]">
        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
          {messages.map((m, i) => (
            <Bubble key={i} msg={m} onPick={ask} />
          ))}
          {pending && (
            <div className="flex justify-start">
              <div className="max-w-[70%] px-4 py-3 rounded-2xl text-sm bg-surface-container-high text-on-surface-variant rounded-bl-md">
                답변을 찾는 중…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-4">
          {FAQ_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => ask(q)}
              disabled={pending}
              className="px-3 py-1.5 rounded-full bg-surface-container-low text-xs font-semibold text-on-surface-variant border border-border-subtle hover:bg-surface-container-high transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              {q}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={pending}
            placeholder="예: 전체 몇 프로야? / 기계 분야 진행률은? / 지연 위험 작업 보여줘"
            className="flex-1 px-4 py-3 rounded-xl bg-surface-container-low border border-border-subtle text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          />
          <Button type="submit" disabled={pending}>
            <Icon name="send" className="text-base" />
            보내기
          </Button>
        </form>
      </Card>
    </>
  )
}
