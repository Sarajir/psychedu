import type { Unit, RecallEvent } from "./types";

const KEY = "psychedu.units.v1";

export function loadUnits(): Unit[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Unit[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUnits(units: Unit[]): void {
  localStorage.setItem(KEY, JSON.stringify(units));
}

export function upsertUnit(unit: Unit): Unit[] {
  const all = loadUnits();
  const idx = all.findIndex((u) => u.id === unit.id);
  if (idx === -1) all.unshift(unit);
  else all[idx] = unit;
  saveUnits(all);
  return all;
}

export function deleteUnit(id: string): Unit[] {
  const all = loadUnits().filter((u) => u.id !== id);
  saveUnits(all);
  return all;
}

export function recordRecall(
  id: string,
  event: RecallEvent,
): Unit[] {
  const all = loadUnits();
  const idx = all.findIndex((u) => u.id === id);
  if (idx === -1) return all;
  const u = all[idx];
  u.recall = [...(u.recall ?? []), event];
  all[idx] = u;
  saveUnits(all);
  return all;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SCHEDULE_DAYS = [1, 3, 7, 14, 30];

export function consecutivePasses(unit: Unit): number {
  const events = unit.recall ?? [];
  let count = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].passed) count++;
    else break;
  }
  return count;
}

export function nextDueAt(unit: Unit): number | null {
  const events = unit.recall ?? [];
  const stage = consecutivePasses(unit);
  if (stage >= SCHEDULE_DAYS.length) return null;
  const lastEvent = events[events.length - 1];
  const lastReviewedAt = lastEvent
    ? new Date(lastEvent.at).getTime()
    : new Date(unit.createdAt).getTime();
  return lastReviewedAt + SCHEDULE_DAYS[stage] * DAY_MS;
}

export function isDue(unit: Unit, now = Date.now()): boolean {
  const due = nextDueAt(unit);
  if (due === null) return false;
  return due <= now;
}

export function dueUnits(units: Unit[], now = Date.now()): Unit[] {
  return units
    .filter((u) => !u.archived)
    .filter((u) => isDue(u, now))
    .sort((a, b) => (nextDueAt(a) ?? 0) - (nextDueAt(b) ?? 0));
}

export function upcomingUnits(units: Unit[], now = Date.now()): Unit[] {
  return units
    .filter((u) => !u.archived)
    .filter((u) => {
      const due = nextDueAt(u);
      return due !== null && due > now;
    })
    .sort((a, b) => (nextDueAt(a) ?? 0) - (nextDueAt(b) ?? 0));
}

export function newId(): string {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8)
  );
}

export function exportCSV(units: Unit[]): string {
  const headers = [
    "id",
    "type",
    "topic",
    "course_or_source",
    "createdAt",
    "prediction",
    "confidence",
    "predictedMinutes",
    "actualMinutes",
    "retrieval",
    "tags",
    "reflection",
    "followUpQuestion",
    "attachment_count",
    "attachment_names",
    "recall_attempts",
    "recall_passes",
    "last_recall_at",
  ];
  const rows = units.map((u) => {
    const tags = (u.tags ?? []).join("|");
    const passes = (u.recall ?? []).filter((r) => r.passed).length;
    const last = (u.recall ?? [])[u.recall.length - 1];
    const courseOrSource =
      u.type === "concept" ? u.course ?? "" : u.source ?? "";
    const att = u.attachments ?? [];
    return [
      u.id,
      u.type,
      u.topic,
      courseOrSource,
      u.createdAt,
      u.prediction ?? "",
      u.confidence ?? "",
      u.type === "concept" ? u.predictedMinutes ?? "" : "",
      u.type === "concept" ? u.actualMinutes ?? "" : "",
      u.retrieval ?? "",
      tags,
      u.reflection ?? "",
      u.type === "reading" ? u.followUpQuestion ?? "" : "",
      att.length,
      att.map((a) => a.name).join("|"),
      (u.recall ?? []).length,
      passes,
      last?.at ?? "",
    ];
  });
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
}

export function downloadCSV(units: Unit[]): void {
  const csv = exportCSV(units);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `psychedu-units-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
