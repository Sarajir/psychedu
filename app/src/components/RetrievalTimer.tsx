import { useEffect, useRef, useState } from "react";

interface Props {
  seconds: number;
  onElapsed?: () => void;
  running: boolean;
}

export function RetrievalTimer({ seconds, onElapsed, running }: Props) {
  const [remaining, setRemaining] = useState(seconds);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now();
    setRemaining(seconds);
    const id = window.setInterval(() => {
      const elapsedSec = Math.floor(
        (Date.now() - (startRef.current ?? Date.now())) / 1000,
      );
      const left = Math.max(0, seconds - elapsedSec);
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(id);
        onElapsed?.();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [running, seconds, onElapsed]);

  const mm = String(Math.floor(remaining / 60)).padStart(1, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const pct = Math.max(0, Math.min(1, remaining / seconds));

  return (
    <div className="flex items-center gap-3">
      <div className="font-mono text-2xl tabular-nums text-ink-900">
        {mm}:{ss}
      </div>
      <div className="flex-1 h-2 rounded-full bg-ink-100 overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-200"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}
