import Link from "next/link";

const APPS = [
  {
    href: "/history-app",
    icon: "history_edu",
    title: "고장이력 관리",
    desc: "발전/플랜트 열원설비(보일러, 열교환기 등)의 과거 고장 이력을 등록·검색·통계화합니다.",
    tag: "서버 DB (SQLite)",
  },
  {
    href: "/overhaul",
    icon: "factory",
    title: "PlantSync Pro — 오버홀 공정관리",
    desc: "발전소 정기 오버홀 기간 중 기계·전기·제어 분야의 공정 현황을 관리합니다.",
    tag: "브라우저 저장 (IndexedDB)",
  },
];

export default function HubPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-stack-lg px-gutter py-16">
      <div className="text-center space-y-2">
        <h1 className="text-display-lg font-bold text-on-surface">발전소 운영관리 웹 스위트</h1>
        <p className="text-body-md text-on-surface-variant">이동할 시스템을 선택하세요.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter w-full max-w-3xl">
        {APPS.map((app) => (
          <Link
            key={app.href}
            href={app.href}
            className="group flex flex-col gap-4 p-8 rounded-xl border border-outline-variant bg-surface-container-lowest hover:border-primary hover:shadow-lg transition-all"
          >
            <span className="material-symbols-outlined text-4xl text-primary">{app.icon}</span>
            <div className="space-y-1">
              <h2 className="text-title-sm font-title-sm font-bold text-on-surface group-hover:text-primary transition-colors">
                {app.title}
              </h2>
              <p className="text-body-sm text-on-surface-variant">{app.desc}</p>
            </div>
            <span className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant/70 mt-auto">
              {app.tag}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
