import type { CompareTag } from "../types";

const STYLES: Record<CompareTag, string> = {
  on_target: "bg-emerald-50 text-emerald-700 border-emerald-200",
  overestimate_time: "bg-amber-50 text-amber-700 border-amber-200",
  underestimate_time: "bg-orange-50 text-orange-700 border-orange-200",
  confusion: "bg-rose-50 text-rose-700 border-rose-200",
  gap: "bg-violet-50 text-violet-700 border-violet-200",
};

const LABELS: Record<CompareTag, string> = {
  on_target: "On target",
  overestimate_time: "Overestimated",
  underestimate_time: "Underestimated",
  confusion: "Mixed up",
  gap: "Missed chunk",
};

export function TagBadge({ tag }: { tag: CompareTag }) {
  return (
    <span className={`pill border ${STYLES[tag]}`}>{LABELS[tag]}</span>
  );
}
