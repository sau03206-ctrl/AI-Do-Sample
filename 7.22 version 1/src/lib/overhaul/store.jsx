"use client";

// 전역 데이터 스토어 — React Context + Supabase(서버 API) 영속화
// (예전엔 idb-keyval로 브라우저에만 저장했는데, 팀 전체가 같은 데이터를 보도록
// 서버 API(/api/overhaul/*)를 거쳐 Supabase에 저장하는 방식으로 변경.
// role은 "권한 전환 데모"용 로컬 토글이라 그대로 브라우저에만 남겨둠.)
import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const ROLE_KEY = 'plantsync-role-v1'
const StoreCtx = createContext(null)

const ROLES = {
  admin: { label: '관리자', can: { upload: true, edit: true, assign: true, report: true, manageUsers: true } },
  editor: { label: '담당자', can: { upload: false, edit: true, assign: false, report: true, manageUsers: false } },
  viewer: { label: '조회자', can: { upload: false, edit: false, assign: false, report: true, manageUsers: false } },
}

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!res.ok) throw new Error(`${path} failed (${res.status})`)
  return res.json()
}

export function StoreProvider({ children }) {
  const [role, setRoleState] = useState('admin')
  const [state, setState] = useState(null)

  useEffect(() => {
    const saved = window.localStorage.getItem(ROLE_KEY)
    if (saved && ROLES[saved]) setRoleState(saved)
  }, [])

  const refresh = useCallback(async () => {
    const data = await api('/api/overhaul/state')
    setState(data)
  }, [])

  useEffect(() => {
    let alive = true
    refresh().catch((err) => {
      if (alive) console.error('오버홀 데이터를 불러오지 못했습니다', err)
    })
    return () => {
      alive = false
    }
  }, [refresh])

  const setRole = (r) => {
    setRoleState(r)
    window.localStorage.setItem(ROLE_KEY, r)
  }

  const value = {
    state,
    role,
    roleInfo: ROLES[role],
    can: ROLES[role].can,

    setRole,

    setProject: async (patch) => {
      await api('/api/overhaul/project', { method: 'PATCH', body: JSON.stringify(patch) })
      await refresh()
    },

    // 엑셀 분석 결과를 작업항목으로 확정
    commitAnalysis: async (analysis) => {
      await api('/api/overhaul/commit-analysis', { method: 'POST', body: JSON.stringify(analysis) })
      await refresh()
    },

    assignTask: async (id, assignee) => {
      await api(`/api/overhaul/tasks/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ assignee }) })
      await refresh()
    },

    // 실적 입력 (하루 1회 — 서버에서 task_id+date 기준으로 upsert)
    addEntry: async (id, entry) => {
      await api(`/api/overhaul/tasks/${id}/entries`, { method: 'POST', body: JSON.stringify(entry) })
      await refresh()
    },

    resetDemo: async () => {
      await api('/api/overhaul/reset', { method: 'POST' })
      await refresh()
    },
  }

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

export { ROLES }
