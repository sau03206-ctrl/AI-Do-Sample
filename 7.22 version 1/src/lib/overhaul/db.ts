import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { buildSeedProject, buildSeedTasks } from "./seed";

// Server-only data layer for /overhaul (PlantSync Pro) — replaces the old
// idb-keyval (browser IndexedDB) storage so the team shares one dataset
// instead of each browser having its own.
//
// Targets the pre-existing Supabase schema (overhaul_projects, overhaul_tasks,
// daily_progress, task_photos — already set up before this migration, with
// proper enums/FKs) rather than inventing a parallel one. See supabase/schema.sql
// for the small additive columns (tag/remark/issues) layered on top of it.
//
// Not wired up here: task_import_staging (upload review — this app still
// reviews the analysis client-side before ever touching the DB, matching the
// existing UploadAnalysis flow), profiles/auth (no login in this app —
// assigned_user_id/uploaded_by/input_by are left null), notifications (unused
// by the current UI).
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

const PHOTOS_BUCKET = "task-photos";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

function taskProgress(planQty: number, doneQty: number): number {
  if (planQty <= 0) return 0;
  return Math.min(100, Math.round((doneQty / planQty) * 1000) / 10);
}

function taskStatus(planQty: number, doneQty: number): string {
  const p = taskProgress(planQty, doneQty);
  if (p >= 100) return "완료";
  if (p > 0) return "진행중";
  return "예정";
}

// discipline is a fixed enum (기계/전기/제어) — analyzed Excel rows that
// couldn't be classified come through as '미분류', which the enum has no
// slot for, so they fall back to '기계' rather than fail the insert.
function toDiscipline(field: string | undefined): string {
  return field === "전기" || field === "제어" ? field : "기계";
}

export interface OverhaulTask {
  id: string;
  field: string;
  equipment: string;
  name: string;
  spec: string;
  unit: string;
  planQty: number;
  doneQty: number;
  remark: string;
  tag: string | null;
  planStart: string | null;
  planEnd: string | null;
  sheetName: string | null;
  sourceRow: number;
  issues: string[];
  assignee: string | null;
  entries: OverhaulEntry[];
}

export interface OverhaulEntry {
  date: string;
  doneToday: number;
  cumulative: number;
  notes: string;
  delayReason: string;
  plan: string;
  photos: { before: string | null; after: string | null };
}

export interface OverhaulProject {
  name: string;
  unit: string;
  plant: string;
  startDate: string;
  endDate: string;
  today: string;
  source: string;
}

export interface OverhaulState {
  project: OverhaulProject;
  lastAnalysis: unknown;
  tasks: OverhaulTask[];
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function photoPathToUrl(storedName: string | null): string | null {
  return storedName ? `/api/overhaul/photos/${encodeURIComponent(storedName)}` : null;
}

/** The single active project row — created from seed data on first use. */
async function getOrCreateProjectId(): Promise<string> {
  const existing = unwrap(
    await supabase.from("overhaul_projects").select("id").order("created_at", { ascending: true }).limit(1),
  ) as { id: string }[];
  if (existing.length > 0) return existing[0].id;

  const seed = buildSeedProject();
  const row = unwrap(
    await supabase
      .from("overhaul_projects")
      .insert({
        project_name: seed.name,
        plant_name: seed.plant,
        unit_name: seed.unit,
        start_date: seed.startDate,
        end_date: seed.endDate,
        status: "진행중",
      })
      .select("id")
      .single(),
  ) as { id: string };
  return row.id;
}

async function seedTasksIfEmpty(projectId: string): Promise<void> {
  const existing = unwrap(
    await supabase.from("overhaul_tasks").select("id").eq("project_id", projectId).limit(1),
  ) as { id: string }[];
  if (existing.length > 0) return;

  const seedTasks = buildSeedTasks();
  unwrap(
    await supabase.from("overhaul_tasks").insert(
      seedTasks.map((t) => ({
        project_id: projectId,
        discipline: toDiscipline(t.field),
        equipment_group: t.equipment,
        item_name: t.name,
        specification: t.spec,
        plan_qty: t.planQty,
        unit: t.unit,
        actual_qty: t.doneQty,
        status: taskStatus(t.planQty, t.doneQty),
        source_sheet_name: t.sheetName,
        source_row_no: t.sourceRow,
        tag: t.tag,
        remark: t.remark,
        issues: t.issues,
      })),
    ),
  );
}

export async function getState(): Promise<OverhaulState> {
  const projectId = await getOrCreateProjectId();
  await seedTasksIfEmpty(projectId);

  const projectRow = unwrap(
    await supabase.from("overhaul_projects").select("*").eq("id", projectId).single(),
  ) as Record<string, unknown>;
  const taskRows = unwrap(
    await supabase.from("overhaul_tasks").select("*").eq("project_id", projectId),
  ) as Record<string, unknown>[];
  const taskIds = taskRows.map((r) => r.id as string);

  const progressRows = taskIds.length
    ? (unwrap(
        await supabase.from("daily_progress").select("*").in("task_id", taskIds).order("work_date", { ascending: true }),
      ) as Record<string, unknown>[])
    : [];
  const photoRows = taskIds.length
    ? (unwrap(await supabase.from("task_photos").select("*").in("task_id", taskIds)) as Record<string, unknown>[])
    : [];

  // task_photos isn't linked to a specific day (no work_date/daily_progress
  // FK on it) — treat it as "current before/after photo for this task" and
  // show the same latest one regardless of which day's entry is open.
  type PhotoSlot = { before: string | null; after: string | null };
  const latestPhotoByTask = new Map<string, PhotoSlot>();
  const latestUploadedAtByTask = new Map<string, { before?: string; after?: string }>();
  for (const row of photoRows) {
    const taskId = row.task_id as string;
    const key = row.photo_type === "분해전" ? "before" : row.photo_type === "분해후" ? "after" : null;
    if (!key) continue;

    const uploadedAt = row.uploaded_at as string;
    const seenAt = latestUploadedAtByTask.get(taskId) ?? {};
    if (seenAt[key] && seenAt[key]! >= uploadedAt) continue;

    seenAt[key] = uploadedAt;
    latestUploadedAtByTask.set(taskId, seenAt);
    const slot = latestPhotoByTask.get(taskId) ?? { before: null, after: null };
    slot[key] = photoPathToUrl(row.file_url as string);
    latestPhotoByTask.set(taskId, slot);
  }

  const entriesByTask = new Map<string, OverhaulEntry[]>();
  for (const row of progressRows) {
    const taskId = row.task_id as string;
    const list = entriesByTask.get(taskId) ?? [];
    list.push({
      date: row.work_date as string,
      doneToday: Number(row.today_qty ?? 0),
      cumulative: Number(row.cumulative_qty ?? 0),
      notes: (row.work_memo as string) ?? "",
      delayReason: (row.delay_reason as string) ?? "",
      plan: (row.action_plan as string) ?? "",
      photos: latestPhotoByTask.get(taskId) ?? { before: null, after: null },
    });
    entriesByTask.set(taskId, list);
  }

  const tasks: OverhaulTask[] = taskRows.map((row) => ({
    id: row.id as string,
    field: row.discipline as string,
    equipment: row.equipment_group as string,
    name: row.item_name as string,
    spec: (row.specification as string) ?? "",
    unit: row.unit as string,
    planQty: Number(row.plan_qty ?? 0),
    doneQty: Number(row.actual_qty ?? 0),
    remark: (row.remark as string) ?? "",
    tag: (row.tag as string) ?? null,
    planStart: (row.planned_start_date as string) ?? null,
    planEnd: (row.planned_end_date as string) ?? null,
    sheetName: (row.source_sheet_name as string) ?? null,
    sourceRow: Number(row.source_row_no ?? 0),
    issues: (row.issues as string[]) ?? [],
    assignee: null,
    entries: entriesByTask.get(row.id as string) ?? [],
  }));

  return {
    project: {
      name: projectRow.project_name as string,
      unit: projectRow.unit_name as string,
      plant: projectRow.plant_name as string,
      startDate: projectRow.start_date as string,
      endDate: projectRow.end_date as string,
      today: todayStr(),
      source: "Supabase",
    },
    lastAnalysis: null,
    tasks,
  };
}

export async function updateProject(patch: Partial<OverhaulProject>): Promise<void> {
  const projectId = await getOrCreateProjectId();
  const columnMap: Record<string, string> = {
    name: "project_name",
    unit: "unit_name",
    plant: "plant_name",
    startDate: "start_date",
    endDate: "end_date",
  };
  const dbPatch: Record<string, string> = {};
  for (const [key, column] of Object.entries(columnMap)) {
    if (key in patch) dbPatch[column] = (patch as Record<string, string>)[key];
  }
  if (Object.keys(dbPatch).length === 0) return;
  unwrap(await supabase.from("overhaul_projects").update(dbPatch).eq("id", projectId));
}

export interface AnalysisTaskInput {
  id: string;
  field: string;
  equipment: string;
  name: string;
  spec: string;
  unit: string;
  planQty: number;
  remark?: string;
  tag: string;
  planStart?: string | null;
  planEnd?: string | null;
  sheetName: string;
  sourceRow: number;
  issues: string[];
}

export interface AnalysisSummary {
  fileName: string;
  sheetCount: number;
  totalRows: number;
  extractedCount: number;
  excludedCount: number;
  byField: Record<string, number>;
  byEquipment: Record<string, number>;
  tasks: AnalysisTaskInput[];
}

/** Replaces all tasks with a freshly-confirmed Excel analysis (daily_progress/task_photos cascade-delete with them via task_id FK). */
export async function commitAnalysis(analysis: AnalysisSummary): Promise<void> {
  const projectId = await getOrCreateProjectId();

  unwrap(await supabase.from("overhaul_tasks").delete().eq("project_id", projectId));

  unwrap(
    await supabase.from("overhaul_tasks").insert(
      analysis.tasks.map((t) => ({
        project_id: projectId,
        discipline: toDiscipline(t.field),
        equipment_group: t.equipment,
        item_name: t.name,
        specification: t.spec,
        plan_qty: t.planQty,
        unit: t.unit,
        actual_qty: 0,
        status: "예정",
        planned_start_date: t.planStart ?? null,
        planned_end_date: t.planEnd ?? null,
        source_file_name: analysis.fileName,
        source_sheet_name: t.sheetName,
        source_row_no: t.sourceRow,
        tag: t.tag,
        remark: t.remark ?? "",
        issues: t.issues,
      })),
    ),
  );
}

export async function assignTask(id: string, assignee: string | null): Promise<void> {
  // No profiles/auth wiring yet (assigned_user_id is a profiles FK, and this
  // app has no login) — kept as a no-op so the store's contract stays intact
  // for when that lands.
  void id;
  void assignee;
}

/** Decodes a `data:<mime>;base64,<data>` string; returns null for anything else (an existing photo URL, or nothing). */
function decodeDataUrl(value: string): { buffer: Buffer; contentType: string } | null {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { buffer: Buffer.from(match[2], "base64"), contentType: match[1] };
}

/** New base64 photo -> uploads to Storage + records a task_photos row. Anything else (existing URL, or null) is left as-is. */
async function maybeUploadPhoto(taskId: string, value: string | null, photoType: "분해전" | "분해후"): Promise<void> {
  if (!value) return;
  const decoded = decodeDataUrl(value);
  if (!decoded) return; // already an existing /api/overhaul/photos/... URL — nothing new to store

  const ext = decoded.contentType.split("/")[1] ?? "jpg";
  // Storage keys must be ASCII — use "before"/"after", not the Korean enum value.
  const slot = photoType === "분해전" ? "before" : "after";
  const storedName = `${taskId}-${slot}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(storedName, decoded.buffer, {
    contentType: decoded.contentType,
  });
  if (error) throw new Error(error.message);

  unwrap(
    await supabase.from("task_photos").insert({
      task_id: taskId,
      photo_type: photoType,
      file_url: storedName,
    }),
  );
}

export interface EntryInput {
  date: string;
  doneToday: number;
  cumulative: number;
  notes: string;
  delayReason: string;
  plan: string;
  photos: { before: string | null; after: string | null };
}

/** Upserts one day's entry for a task (one row per task+date, matched at the application level), then recomputes the task's actual_qty/progress/status. */
export async function addEntry(taskId: string, entry: EntryInput): Promise<void> {
  await Promise.all([
    maybeUploadPhoto(taskId, entry.photos.before, "분해전"),
    maybeUploadPhoto(taskId, entry.photos.after, "분해후"),
  ]);

  const existing = unwrap(
    await supabase.from("daily_progress").select("id").eq("task_id", taskId).eq("work_date", entry.date).maybeSingle(),
  ) as { id: string } | null;

  const progressPatch = {
    task_id: taskId,
    work_date: entry.date,
    today_qty: entry.doneToday,
    cumulative_qty: entry.cumulative,
    progress_rate: 0, // filled in below once we know the task's plan_qty
    work_memo: entry.notes,
    delay_reason: entry.delayReason,
    action_plan: entry.plan,
    input_at: new Date().toISOString(),
  };

  const taskRow = unwrap(
    await supabase.from("overhaul_tasks").select("plan_qty").eq("id", taskId).single(),
  ) as { plan_qty: number };
  progressPatch.progress_rate = taskProgress(Number(taskRow.plan_qty ?? 0), entry.cumulative);

  if (existing) {
    unwrap(await supabase.from("daily_progress").update(progressPatch).eq("id", existing.id));
  } else {
    unwrap(await supabase.from("daily_progress").insert(progressPatch));
  }

  const allEntries = unwrap(
    await supabase.from("daily_progress").select("cumulative_qty").eq("task_id", taskId),
  ) as { cumulative_qty: number }[];
  const doneQty = Math.max(0, ...allEntries.map((e) => Number(e.cumulative_qty ?? 0)));
  unwrap(
    await supabase
      .from("overhaul_tasks")
      .update({
        actual_qty: doneQty,
        status: taskStatus(Number(taskRow.plan_qty ?? 0), doneQty),
      })
      .eq("id", taskId),
  );
}

export async function downloadPhoto(storedName: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const { data, error } = await supabase.storage.from(PHOTOS_BUCKET).download(storedName);
  if (error || !data) return null;
  return { buffer: Buffer.from(await data.arrayBuffer()), contentType: data.type || "application/octet-stream" };
}

/** Wipes this project's tasks/entries/photos and reseeds — mirrors the old StoreProvider.resetDemo. */
export async function resetToSeed(): Promise<void> {
  const projectId = await getOrCreateProjectId();

  const taskRows = unwrap(
    await supabase.from("overhaul_tasks").select("id").eq("project_id", projectId),
  ) as { id: string }[];
  const taskIds = taskRows.map((r) => r.id);

  if (taskIds.length) {
    const photoRows = unwrap(
      await supabase.from("task_photos").select("file_url").in("task_id", taskIds),
    ) as { file_url: string }[];
    if (photoRows.length) {
      await supabase.storage.from(PHOTOS_BUCKET).remove(photoRows.map((p) => p.file_url));
    }
  }

  unwrap(await supabase.from("overhaul_tasks").delete().eq("project_id", projectId));
  await seedTasksIfEmpty(projectId);
}
