import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { COMPARE_TAGS } from "../types";
import type { CompareTag, Unit } from "../types";
import { downloadCSV } from "../storage";

interface Props {
  units: Unit[];
}

const TAG_COLORS: Record<CompareTag, string> = {
  on_target: "#10b981",
  overestimate_time: "#f59e0b",
  underestimate_time: "#fb923c",
  confusion: "#f43f5e",
  gap: "#8b5cf6",
};

export function BiasesPage({ units }: Props) {
  const stats = useMemo(() => {
    const total = units.length;
    const tagCounts: Record<CompareTag, number> = {
      on_target: 0,
      overestimate_time: 0,
      underestimate_time: 0,
      confusion: 0,
      gap: 0,
    };
    let recallAttempts = 0;
    let recallPasses = 0;
    let timePredSum = 0;
    let timeActualSum = 0;
    let timePairs = 0;

    const days = new Set<string>();
    for (const u of units) {
      days.add(u.createdAt.slice(0, 10));
      for (const t of u.tags) tagCounts[t]++;
      for (const r of u.recall ?? []) {
        recallAttempts++;
        if (r.passed) recallPasses++;
        days.add(r.at.slice(0, 10));
      }
      if (u.type === "concept") {
        if (u.predictedMinutes != null && u.actualMinutes != null) {
          timePredSum += u.predictedMinutes;
          timeActualSum += u.actualMinutes;
          timePairs++;
        }
      }
    }
    const recallRate = recallAttempts > 0 ? recallPasses / recallAttempts : 0;
    const avgTimeBias =
      timePairs > 0 ? (timePredSum - timeActualSum) / timePairs : null;

    return {
      total,
      tagCounts,
      recallAttempts,
      recallPasses,
      recallRate,
      activeDays: days.size,
      avgTimeBias,
    };
  }, [units]);

  const tagData = COMPARE_TAGS.map((t) => ({
    id: t.id,
    label: t.label,
    count: stats.tagCounts[t.id],
    color: TAG_COLORS[t.id],
  }));

  const recentActivity = useMemo(() => {
    const buckets = new Map<string, number>();
    const days: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push(key);
      buckets.set(key, 0);
    }
    for (const u of units) {
      const k = u.createdAt.slice(0, 10);
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
      for (const r of u.recall ?? []) {
        const rk = r.at.slice(0, 10);
        if (buckets.has(rk)) buckets.set(rk, (buckets.get(rk) ?? 0) + 1);
      }
    }
    return days.map((d) => ({
      day: d.slice(5),
      events: buckets.get(d) ?? 0,
    }));
  }, [units]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">My biases</h1>
          <p className="text-sm text-ink-500 mt-1">
            Aggregated across all units. Small numbers are still informative —
            the point is the pattern, not the count.
          </p>
        </div>
        <button
          type="button"
          className="btn-outline"
          onClick={() => downloadCSV(units)}
          disabled={units.length === 0}
        >
          Export CSV
        </button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Units" value={stats.total} />
        <Stat label="Active days" value={stats.activeDays} />
        <Stat
          label="Recall pass rate"
          value={
            stats.recallAttempts === 0
              ? "—"
              : `${Math.round(stats.recallRate * 100)}%`
          }
          sub={
            stats.recallAttempts === 0
              ? "no reviews yet"
              : `${stats.recallPasses}/${stats.recallAttempts}`
          }
        />
        <Stat
          label="Avg time bias (min)"
          value={
            stats.avgTimeBias === null
              ? "—"
              : `${stats.avgTimeBias > 0 ? "+" : ""}${stats.avgTimeBias.toFixed(1)}`
          }
          sub={
            stats.avgTimeBias === null
              ? "log predicted + actual minutes"
              : stats.avgTimeBias > 0
                ? "you tend to overestimate"
                : stats.avgTimeBias < 0
                  ? "you tend to underestimate"
                  : "calibrated"
          }
        />
      </div>

      <section className="card p-6">
        <h2 className="text-base font-semibold text-ink-900 mb-4">
          Where the misses cluster
        </h2>
        {stats.total === 0 ? (
          <p className="text-sm text-ink-500">
            Add a unit on the Today page to see your tag distribution.
          </p>
        ) : (
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart
                data={tagData}
                margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
              >
                <CartesianGrid stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  interval={0}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                />
                <Tooltip
                  cursor={{ fill: "#f3f4f6" }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {tagData.map((d) => (
                    <Cell key={d.id} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="card p-6">
        <h2 className="text-base font-semibold text-ink-900 mb-4">
          Last 14 days · units + recalls
        </h2>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <BarChart
              data={recentActivity}
              margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
            >
              <CartesianGrid stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                interval={1}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#6b7280" }}
              />
              <Tooltip
                cursor={{ fill: "#f3f4f6" }}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="events"
                name="events"
                fill="#0f766e"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-base font-semibold text-ink-900 mb-3">
          Recent units
        </h2>
        {units.length === 0 ? (
          <p className="text-sm text-ink-500">No units yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100 -mx-2">
            {units.slice(0, 12).map((u) => (
              <li key={u.id} className="px-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wide text-ink-500">
                      {u.type === "concept" ? "Concept" : "Reading"} ·{" "}
                      {new Date(u.createdAt).toLocaleDateString()}
                    </div>
                    <div className="font-medium text-ink-900 truncate">
                      {u.topic}
                    </div>
                    {(u.attachments?.length ?? 0) > 0 && (
                      <div className="text-xs text-ink-500 mt-0.5">
                        {u.attachments?.length} file
                        {(u.attachments?.length ?? 0) === 1 ? "" : "s"} attached
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {u.tags.map((t) => (
                      <span
                        key={t}
                        className="pill border"
                        style={{
                          background: `${TAG_COLORS[t]}1a`,
                          color: TAG_COLORS[t],
                          borderColor: `${TAG_COLORS[t]}55`,
                        }}
                      >
                        {COMPARE_TAGS.find((c) => c.id === t)?.label}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-ink-500">
        {label}
      </div>
      <div className="text-2xl font-semibold text-ink-900 mt-1 tabular-nums">
        {value}
      </div>
      {sub && <div className="text-xs text-ink-500 mt-1">{sub}</div>}
    </div>
  );
}
