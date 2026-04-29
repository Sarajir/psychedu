import { useMemo, useState } from "react";
import {
  consecutivePasses,
  dueUnits,
  nextDueAt,
  recordRecall,
  upcomingUnits,
} from "../storage";
import type { Unit } from "../types";
import { TagBadge } from "../components/Tag";

interface Props {
  units: Unit[];
  onChange: (units: Unit[]) => void;
}

export function QueuePage({ units, onChange }: Props) {
  const due = useMemo(() => dueUnits(units), [units]);
  const upcoming = useMemo(() => upcomingUnits(units), [units]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState("");

  const active = useMemo(
    () => due.find((u) => u.id === activeId) ?? null,
    [due, activeId],
  );

  function startReview(id: string) {
    setActiveId(id);
    setText("");
  }

  function submit(passed: boolean) {
    if (!active) return;
    const updated = recordRecall(active.id, {
      at: new Date().toISOString(),
      passed,
      notes: text.trim() || undefined,
    });
    onChange(updated);
    setActiveId(null);
    setText("");
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">Recall queue</h1>
        <p className="text-sm text-ink-500 mt-1">
          Closed book. One sentence is fine. Mark pass/fail and the system
          schedules the next return at 1 → 3 → 7 → 14 → 30 days.
        </p>
      </header>

      {active ? (
        <section className="card p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-500">
                {active.type === "concept" ? "Concept" : "Reading"} · stage{" "}
                {consecutivePasses(active) + 1}
              </div>
              <h2 className="text-lg font-semibold text-ink-900 mt-1">
                {active.topic}
              </h2>
              {active.type === "concept" && active.course && (
                <div className="text-sm text-ink-500">{active.course}</div>
              )}
              {active.type === "reading" && active.source && (
                <div className="text-sm text-ink-500">{active.source}</div>
              )}
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setActiveId(null)}
            >
              Cancel
            </button>
          </div>

          <div>
            <div className="label">Original prediction</div>
            <div className="card p-3 text-sm text-ink-700 whitespace-pre-wrap">
              {active.prediction || "—"}
            </div>
          </div>

          {active.type === "reading" && active.followUpQuestion && (
            <div>
              <div className="label">Follow-up question you set</div>
              <div className="card p-3 text-sm text-ink-700 whitespace-pre-wrap">
                {active.followUpQuestion}
              </div>
            </div>
          )}

          <div>
            <label className="label">
              Re-recall in one or two sentences
            </label>
            <textarea
              autoFocus
              className="textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="No peeking. What's the gist?"
            />
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-ink-500">
              Reveal the original recall + tags
            </summary>
            <div className="mt-3 space-y-3">
              <div className="card p-3 text-sm text-ink-700 whitespace-pre-wrap">
                {active.retrieval || "—"}
              </div>
              {active.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {active.tags.map((t) => (
                    <TagBadge key={t} tag={t} />
                  ))}
                </div>
              )}
            </div>
          </details>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn-outline"
              onClick={() => submit(false)}
            >
              Failed — bring back tomorrow
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => submit(true)}
            >
              Passed — schedule next interval
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="card p-6">
            <h2 className="text-base font-semibold text-ink-900 mb-3">
              Due now ({due.length})
            </h2>
            {due.length === 0 ? (
              <p className="text-sm text-ink-500">
                Nothing due. Add a unit on the Today page, or check back
                tomorrow.
              </p>
            ) : (
              <ul className="divide-y divide-ink-100 -mx-2">
                {due.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-3 px-2 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-wide text-ink-500">
                        {u.type === "concept" ? "Concept" : "Reading"} · stage{" "}
                        {consecutivePasses(u) + 1}
                      </div>
                      <div className="font-medium text-ink-900 truncate">
                        {u.topic}
                      </div>
                      <div className="text-xs text-ink-500 truncate">
                        {u.type === "concept" ? u.course : u.source}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-primary shrink-0"
                      onClick={() => startReview(u.id)}
                    >
                      Recall
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-6">
            <h2 className="text-base font-semibold text-ink-900 mb-3">
              Upcoming ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-500">
                Nothing scheduled yet.
              </p>
            ) : (
              <ul className="divide-y divide-ink-100 -mx-2">
                {upcoming.slice(0, 12).map((u) => {
                  const due = nextDueAt(u);
                  const ds = due
                    ? new Date(due).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    : "—";
                  return (
                    <li
                      key={u.id}
                      className="flex items-center justify-between gap-3 px-2 py-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wide text-ink-500">
                          {u.type === "concept" ? "Concept" : "Reading"}
                        </div>
                        <div className="font-medium text-ink-900 truncate">
                          {u.topic}
                        </div>
                      </div>
                      <div className="text-xs text-ink-500 shrink-0">
                        next: {ds}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
