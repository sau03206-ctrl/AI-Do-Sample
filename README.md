# AI-Do-Sample — 발전소 운영관리 웹 스위트

발전소 오버홀(정기보수) 공정관리와 열원설비 고장이력 관리, 두 팀원이 각자 만든 웹앱을
하나의 Next.js 앱으로 합친 통합 프로젝트입니다.

## 폴더 구조

| 폴더 | 내용 |
|---|---|
| `src/app/` | 실제 동작하는 통합 Next.js 앱 (여기서 실행) |
| `src/app/history-app/` | 열원설비 고장이력 관리 시스템 |
| `src/app/overhaul/` | PlantSync Pro — 발전소 오버홀 공정관리 |
| `docs/` | 고장이력 시스템 PRD·화면설계 문서 |
| `stitch-export/` | 고장이력 시스템 초기 Stitch 목업 원본 |
| `legacy-plantsync-vite/` | PlantSync Pro의 예전 Vite 단독 앱 원본 (참고/보관용, 더 이상 실행하지 않음) |

## 시작하기

```bash
npm install
npm run dev      # http://localhost:3000
```

- `/` — 통합 홈(허브): 두 시스템으로 이동하는 진입점
- `/history-app` — 고장이력 관리 시스템 (서버 API + SQLite, `data/`·`uploads/`에 저장)
- `/overhaul` — PlantSync Pro 오버홀 공정관리 (브라우저 IndexedDB에 저장, 서버 데이터 공유 없음)

두 시스템은 같은 Next.js 앱 안에서 라우트만 분리되어 있고, 데이터 저장소는 아직 통합하지 않았습니다
(고장이력은 서버 SQLite, 오버홀은 브라우저 IndexedDB — 각자 독립적으로 동작).

## 기술 스택

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · better-sqlite3 (고장이력) ·
SheetJS(xlsx) + idb-keyval (오버홀)

## 각 시스템 상세 문서

- 고장이력 시스템: [`docs/PRD.md`](docs/PRD.md), [`docs/SCREEN_DESIGN.md`](docs/SCREEN_DESIGN.md)
- 오버홀 시스템: [`legacy-plantsync-vite/OH WEB APP PRD.md`](legacy-plantsync-vite/OH%20WEB%20APP%20PRD.md)
