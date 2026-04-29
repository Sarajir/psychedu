import { useEffect, useMemo, useState } from "react";
import { TodayPage } from "./pages/Today";
import { QueuePage } from "./pages/Queue";
import { BiasesPage } from "./pages/Biases";
import { dueUnits, loadUnits } from "./storage";
import type { Unit } from "./types";

type Tab = "today" | "queue" | "biases";

const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: "today", label: "Today", sub: "Predict → recall → compare" },
  { id: "queue", label: "Recall queue", sub: "Closed-book re-recall" },
  { id: "biases", label: "My biases", sub: "Aggregate + export" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [units, setUnits] = useState<Unit[]>([]);

  useEffect(() => {
    setUnits(loadUnits());
  }, []);

  const dueCount = useMemo(() => dueUnits(units).length, [units]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-ink-100 bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <div className="text-lg font-semibold text-ink-900 tracking-tight">
              psychedu
            </div>
            <div className="text-xs text-ink-500 hidden sm:block">
              n=1 study lab · predict, retrieve, compare
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === t.id
                    ? "bg-ink-100 text-ink-900"
                    : "text-ink-500 hover:text-ink-900 hover:bg-ink-100/60"
                }`}
              >
                {t.label}
                {t.id === "queue" && dueCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-semibold bg-accent text-white">
                    {dueCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {tab === "today" && <TodayPage onSaved={setUnits} />}
        {tab === "queue" && (
          <QueuePage units={units} onChange={setUnits} />
        )}
        {tab === "biases" && <BiasesPage units={units} />}
      </main>

      <footer className="border-t border-ink-100 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3 text-xs text-ink-500 flex items-center justify-between">
          <span>
            Local-only · everything lives in this browser&rsquo;s storage.
          </span>
          <span className="hidden sm:block">
            metacognition · retrieval practice · spaced review
          </span>
        </div>
      </footer>
    </div>
  );
}
