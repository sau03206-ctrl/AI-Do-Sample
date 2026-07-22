-- 고장이력 관리 시스템 — Supabase Postgres 스키마
-- Supabase 대시보드 > SQL Editor에서 1회 실행하세요.
--
-- 날짜/시각 컬럼은 기존 SQLite와 동일하게 text로 둡니다 (substr/LIKE 기반
-- 필터링 로직을 그대로 유지하기 위함 — occurred_at >= '2026-01' 같은 문자열
-- 비교, substr(occurred_at, 1, 7) 같은 월별 집계가 애플리케이션 코드에 이미
-- 그대로 있음).

create table if not exists failure_history (
  id bigint generated always as identity primary key,
  title text,
  report_type text default '고장상보',
  branch text,
  heat_facility text,
  equipment_name text,
  device_name text,
  failure_field text,
  status text default '조치중',
  occurred_at text,
  recovered_at text,
  apt_count text,
  building_count text,
  interruption_duration text,
  interruption_period text,
  cause_manager_raw text,
  cause_owner_raw text,
  situation text,
  alarm_status text,
  cause_4m1e text,
  impact_heat_loss text,
  impact_duration text,
  emergency_action text,
  recovery_detail text,
  recurrence_prevention text,
  content_summary text,
  reporter text,
  source text default 'manual',
  created_at text default to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS'),
  updated_at text default to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS')
);

create table if not exists attachments (
  id bigint generated always as identity primary key,
  failure_id bigint not null references failure_history(id) on delete cascade,
  file_name text not null,
  stored_name text not null,
  created_at text default to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS')
);

-- RLS 활성화 + 정책 없음: 이 앱은 서버(Next.js API 라우트)에서만 secret key로
-- 접근하고, secret key는 RLS를 우회하므로 정책이 필요 없습니다. 나중에
-- publishable key가 클라이언트에서 직접 이 테이블에 접근하는 일이 생기더라도
-- 정책이 없으니 기본적으로 전부 막혀 있습니다.
alter table failure_history enable row level security;
alter table attachments enable row level security;

-- 첨부파일(PDF/HWP) 저장용 Storage 버킷은 앱 코드가 최초 실행 시 자동으로
-- 만듭니다 (supabase.storage.createBucket) — 여기서 따로 만들 필요 없음.

-- ============================================================
-- PlantSync Pro (/overhaul) — 브라우저 IndexedDB에서 마이그레이션
--
-- 이미 준비되어 있던 overhaul_projects / overhaul_tasks / daily_progress /
-- task_photos 테이블을 그대로 사용합니다. 여기서는 그 테이블들에 원래
-- 앱에는 있었지만 저 스키마엔 없는 필드(태그, 비고, 엑셀 분석 시 확인필요
-- 항목 플래그)를 잃지 않도록 nullable 컬럼만 추가합니다 — 기존 컬럼/제약/
-- 다른 테이블은 전혀 건드리지 않는 순수 추가(additive) 마이그레이션입니다.
-- ============================================================
alter table overhaul_tasks add column if not exists tag text;
alter table overhaul_tasks add column if not exists remark text default '';
alter table overhaul_tasks add column if not exists issues jsonb default '[]'::jsonb;
