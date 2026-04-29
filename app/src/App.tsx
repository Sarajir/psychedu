import { useEffect, useMemo, useState } from "react";
import { TodayPage } from "./pages/Today";
import { QueuePage } from "./pages/Queue";
import { BiasesPage } from "./pages/Biases";
import { GuidePage } from "./pages/Guide";
import { AiPage } from "./pages/Ai";
import { dueUnits, loadUnits } from "./storage";
import type { Unit } from "./types";

const INTRO_BANNER_KEY = "psychedu.dismissIntroBanner";

type Tab = "guide" | "ai" | "today" | "queue" | "biases";

const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: "guide", label: "入门", sub: "教程" },
  { id: "ai", label: "AI", sub: "BYOK 生成" },
  { id: "today", label: "Today", sub: "Predict → recall → compare" },
  { id: "queue", label: "Recall queue", sub: "Closed-book re-recall" },
  { id: "biases", label: "My biases", sub: "Aggregate + export" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("guide");
  const [units, setUnits] = useState<Unit[]>([]);
  const [showIntroBanner, setShowIntroBanner] = useState(false);

  useEffect(() => {
    setUnits(loadUnits());
  }, []);

  useEffect(() => {
    try {
      setShowIntroBanner(!localStorage.getItem(INTRO_BANNER_KEY));
    } catch {
      setShowIntroBanner(false);
    }
  }, []);

  const dueCount = useMemo(() => dueUnits(units).length, [units]);

  function dismissIntroBanner() {
    try {
      localStorage.setItem(INTRO_BANNER_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowIntroBanner(false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-ink-100 bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col gap-3">
          {showIntroBanner && (
            <div
              role="region"
              aria-label="入门提示"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50/80 px-3 py-2 text-sm text-ink-800"
            >
              <span>
                第一次使用？先看<strong className="mx-0.5">「入门」</strong>
                了解每一步在做什么。
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="btn-primary text-xs py-1.5"
                  onClick={() => {
                    setTab("guide");
                    dismissIntroBanner();
                  }}
                >
                  查看教程
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs py-1.5 text-ink-600"
                  onClick={dismissIntroBanner}
                >
                  不再显示
                </button>
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-3 min-w-0">
              <div className="text-lg font-semibold text-ink-900 tracking-tight shrink-0">
                psychedu
              </div>
              <div className="text-xs text-ink-500 hidden sm:block truncate">
                n=1 study lab · predict, retrieve, compare
              </div>
            </div>
            <nav className="flex items-center gap-0.5 sm:gap-1 flex-wrap justify-end">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`relative px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    tab === t.id
                      ? "bg-ink-100 text-ink-900"
                      : "text-ink-500 hover:text-ink-900 hover:bg-ink-100/60"
                  }`}
                >
                  {t.label}
                  {t.id === "queue" && dueCount > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-semibold bg-accent text-white">
                      {dueCount}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {tab === "guide" && (
          <GuidePage onStart={() => setTab("today")} />
        )}
        {tab === "ai" && <AiPage />}
        {tab === "today" && <TodayPage onSaved={setUnits} />}
        {tab === "queue" && (
          <QueuePage units={units} onChange={setUnits} />
        )}
        {tab === "biases" && <BiasesPage units={units} />}
      </main>

      <footer className="border-t border-ink-100 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3 text-xs text-ink-500 flex items-center justify-between">
          <span>
            Local-only core · optional AI calls your Worker + Gemini (BYOK).
          </span>
          <span className="hidden sm:block">
            metacognition · retrieval practice · spaced review
          </span>
        </div>
      </footer>
    </div>
  );
}
