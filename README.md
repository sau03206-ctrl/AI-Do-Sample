# AI-Do-Sample — 발전소 운영관리 웹 스위트

발전소 오버홀(정기보수) 공정관리와 열원설비 고장이력 관리, 두 팀원이 각자 만든 웹앱을
하나의 Next.js 앱으로 합친 통합 프로젝트입니다.

## 폴더 구조

| 폴더 | 내용 |
|---|---|
| [`7.22 version 1/`](7.22%20version%201/) | **현재 버전** — 고장이력 관리 + PlantSync Pro 오버홀 공정관리를 하나의 Next.js 앱으로 합친 통합 버전 (여기서 실행) |

날짜별 버전 폴더 이름 규칙을 따릅니다 (예: 이전 개별 프로젝트였던 `고장이력(7.21)`처럼, 이번 통합 버전은 `7.22 version 1`).
실행 방법과 폴더 상세 구조는 [`7.22 version 1/README.md`](7.22%20version%201/README.md)를 참고하세요.

```bash
cd "7.22 version 1"
npm install
npm run dev      # http://localhost:3000
```

- `/` — 통합 홈(허브): 두 시스템으로 이동하는 진입점
- `/history-app` — 고장이력 관리 시스템 (서버 API + SQLite)
- `/overhaul` — PlantSync Pro 오버홀 공정관리 (브라우저 IndexedDB)
