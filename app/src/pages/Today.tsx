import { useState } from "react";
import { COMPARE_TAGS } from "../types";
import type {
  AttachmentMeta,
  CompareTag,
  ConceptUnit,
  Confidence,
  ReadingUnit,
  Unit,
  UnitType,
} from "../types";
import { newId, upsertUnit } from "../storage";
import { RetrievalTimer } from "../components/RetrievalTimer";
import { AttachmentPanel } from "../components/AttachmentPanel";

type Stage = "predict" | "retrieve" | "compare" | "saved";

interface Props {
  onSaved: (units: Unit[]) => void;
}

export function TodayPage({ onSaved }: Props) {
  const [type, setType] = useState<UnitType>("concept");
  const [stage, setStage] = useState<Stage>("predict");
  /** Stable id for this draft unit so uploads land in IndexedDB before Save. */
  const [draftUnitId, setDraftUnitId] = useState(() => newId());
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);

  const [topic, setTopic] = useState("");
  const [course, setCourse] = useState("");
  const [source, setSource] = useState("");
  const [prediction, setPrediction] = useState("");
  const [confidence, setConfidence] = useState<Confidence>(3);
  const [predictedMinutes, setPredictedMinutes] = useState<number | "">("");
  const [actualMinutes, setActualMinutes] = useState<number | "">("");

  const [retrieval, setRetrieval] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [tags, setTags] = useState<CompareTag[]>([]);
  const [reflection, setReflection] = useState("");
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(90);

  function reset() {
    setStage("predict");
    setDraftUnitId(newId());
    setAttachments([]);
    setTopic("");
    setCourse("");
    setSource("");
    setPrediction("");
    setConfidence(3);
    setPredictedMinutes("");
    setActualMinutes("");
    setRetrieval("");
    setFollowUp("");
    setTags([]);
    setReflection("");
    setTimerRunning(false);
  }

  function toggleTag(tag: CompareTag) {
    setTags((cur) =>
      cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag],
    );
  }

  function startRetrieve() {
    if (!prediction.trim()) return;
    if (!topic.trim()) {
      setTopic(type === "reading" ? "Reading unit" : "Concept unit");
    }
    setStage("retrieve");
    setTimerRunning(true);
  }

  function finishRetrieve() {
    setTimerRunning(false);
    setStage("compare");
  }

  function save() {
    const now = new Date().toISOString();
    const att =
      attachments.length > 0 ? attachments.map((a) => ({ ...a })) : undefined;
    let unit: Unit;
    if (type === "concept") {
      const u: ConceptUnit = {
        id: draftUnitId,
        type: "concept",
        topic: topic.trim() || "Untitled concept",
        course: course.trim() || undefined,
        createdAt: now,
        prediction: prediction.trim(),
        confidence,
        predictedMinutes:
          predictedMinutes === "" ? undefined : Number(predictedMinutes),
        actualMinutes:
          actualMinutes === "" ? undefined : Number(actualMinutes),
        retrieval: retrieval.trim(),
        tags,
        reflection: reflection.trim() || undefined,
        recall: [],
        attachments: att,
      };
      unit = u;
    } else {
      const u: ReadingUnit = {
        id: draftUnitId,
        type: "reading",
        topic: topic.trim() || "Untitled reading",
        source: source.trim() || undefined,
        createdAt: now,
        prediction: prediction.trim(),
        confidence,
        retrieval: retrieval.trim(),
        followUpQuestion: followUp.trim(),
        tags,
        reflection: reflection.trim() || undefined,
        recall: [],
        attachments: att,
      };
      unit = u;
    }
    const all = upsertUnit(unit);
    onSaved(all);
    setStage("saved");
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">
          Today&rsquo;s unit
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Predict before you study, then write a closed-book recall, then
          compare. The system stores everything for you.
        </p>
        <p className="text-xs text-ink-500 mt-2">
          不清楚每一步在做什么？请点顶部导航里的{" "}
          <strong className="text-ink-700">「入门」</strong>查看中文教程。
        </p>
      </header>

      {stage !== "saved" && (
        <div className="card p-1 inline-flex">
          {(["concept", "reading"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                type === t
                  ? "bg-accent text-white"
                  : "text-ink-700 hover:bg-ink-100"
              }`}
            >
              {t === "concept" ? "Concept / Course unit" : "Reading / Paper unit"}
            </button>
          ))}
        </div>
      )}

      {stage === "predict" && (
        <section className="card p-6 space-y-5">
          <div>
            <label className="label">Topic</label>
            <input
              className="input"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={
                type === "concept"
                  ? "e.g. Synaptic plasticity – LTP vs LTD"
                  : "e.g. Karpicke & Roediger (2008) — testing effect"
              }
            />
          </div>

          {type === "concept" ? (
            <div>
              <label className="label">Course (optional)</label>
              <input
                className="input"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="e.g. PSYC 106 Cognition"
              />
            </div>
          ) : (
            <div>
              <label className="label">Source (optional)</label>
              <input
                className="input"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="paper title, chapter, or URL"
              />
            </div>
          )}

          <div>
            <label className="label">
              One testable prediction
              <span className="ml-2 normal-case text-ink-500 font-normal">
                ({type === "concept"
                  ? "what you expect to know / what will trip you up"
                  : "what claim or finding you expect, before reading"}
                )
              </span>
            </label>
            <textarea
              className="textarea"
              value={prediction}
              onChange={(e) => setPrediction(e.target.value)}
              placeholder="One concrete sentence. Vague predictions are not useful later."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Confidence (1–5)</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setConfidence(n as Confidence)}
                    className={`w-10 h-10 rounded-md text-sm font-medium border ${
                      confidence === n
                        ? "bg-accent text-white border-accent"
                        : "bg-white text-ink-700 border-ink-300 hover:bg-ink-100"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {type === "concept" && (
              <>
                <div>
                  <label className="label">Predicted time (min)</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    value={predictedMinutes}
                    onChange={(e) =>
                      setPredictedMinutes(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    placeholder="e.g. 30"
                  />
                </div>
                <div>
                  <label className="label">Actual time (fill later)</label>
                  <input
                    type="number"
                    className="input"
                    min={0}
                    value={actualMinutes}
                    onChange={(e) =>
                      setActualMinutes(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    placeholder="optional"
                  />
                </div>
              </>
            )}
          </div>

          <AttachmentPanel
            unitId={draftUnitId}
            attachments={attachments}
            onChange={setAttachments}
            allowUpload
          />

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-ink-500 order-2 sm:order-1">
              Closed-book retrieval limit:{" "}
              <select
                className="ml-1 rounded border border-ink-300 px-1 py-0.5 text-xs bg-white"
                value={timerSeconds}
                onChange={(e) => setTimerSeconds(Number(e.target.value))}
              >
                <option value={60}>60s</option>
                <option value={90}>90s</option>
                <option value={120}>2 min</option>
                <option value={180}>3 min</option>
                <option value={300}>5 min</option>
              </select>
            </div>
            <div className="order-1 sm:order-2 flex flex-col items-stretch sm:items-end gap-1.5 w-full sm:w-auto">
              <button
                type="button"
                className="btn-primary w-full sm:w-auto min-h-[44px]"
                onClick={startRetrieve}
                disabled={!prediction.trim()}
              >
                Start closed-book recall →
              </button>
              {!prediction.trim() && (
                <p className="text-xs text-amber-800 text-center sm:text-right">
                  请先填写「One testable prediction」一句话，按钮即可点击。
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {stage === "retrieve" && (
        <section className="card p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">
              Closed book. Write what you remember.
            </h2>
            <p className="text-sm text-ink-500 mt-1">
              Don&rsquo;t look at the source. Bullets are fine. Stop early
              with the button — partial credit is the point.
            </p>
            {attachments.length > 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 mt-2">
                You uploaded {attachments.length} file
                {attachments.length > 1 ? "s" : ""} — keep them closed until
                Compare.
              </p>
            )}
          </div>
          <RetrievalTimer
            seconds={timerSeconds}
            running={timerRunning}
            onElapsed={() => setTimerRunning(false)}
          />
          <textarea
            autoFocus
            className="textarea min-h-[12rem]"
            value={retrieval}
            onChange={(e) => setRetrieval(e.target.value)}
            placeholder="Write the key points, definitions, mechanisms — whatever surfaces."
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setStage("predict")}
            >
              ← Back
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={finishRetrieve}
            >
              Done — compare to source →
            </button>
          </div>
        </section>
      )}

      {stage === "compare" && (
        <section className="card p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">
              Compare with the source
            </h2>
            <p className="text-sm text-ink-500 mt-1">
              Open the textbook / paper / notes. Then tag what you noticed.
              These tags are how the &ldquo;My biases&rdquo; page gets built.
            </p>
          </div>

          {attachments.length > 0 && (
            <AttachmentPanel
              unitId={draftUnitId}
              attachments={attachments}
              onChange={setAttachments}
              allowUpload={false}
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="label">Your prediction</div>
              <div className="card p-3 text-sm text-ink-700 whitespace-pre-wrap">
                {prediction || "—"}
              </div>
            </div>
            <div>
              <div className="label">Your closed-book recall</div>
              <div className="card p-3 text-sm text-ink-700 whitespace-pre-wrap">
                {retrieval || "—"}
              </div>
            </div>
          </div>

          <div>
            <div className="label">Tag what you noticed</div>
            <div className="flex flex-wrap gap-2">
              {COMPARE_TAGS.map((t) => {
                const active = tags.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    title={t.hint}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-accent text-white border-accent"
                        : "bg-white text-ink-700 border-ink-300 hover:bg-ink-100"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {type === "reading" && (
            <div>
              <label className="label">
                One follow-up question for next time
              </label>
              <input
                className="input"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="What you'd ask the author / want to test next."
              />
            </div>
          )}

          <div>
            <label className="label">
              One-line reflection (optional)
            </label>
            <input
              className="input"
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="What surprised you? What will you do differently?"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setStage("retrieve")}
            >
              ← Back to recall
            </button>
            <button type="button" className="btn-primary" onClick={save}>
              Save unit
            </button>
          </div>
        </section>
      )}

      {stage === "saved" && (
        <section className="card p-6 space-y-4 text-center">
          <h2 className="text-lg font-semibold text-ink-900">Saved.</h2>
          <p className="text-sm text-ink-500">
            It&rsquo;ll come back in your recall queue in 1 day.
          </p>
          <div className="flex justify-center gap-2">
            <button type="button" className="btn-primary" onClick={reset}>
              Add another unit
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
