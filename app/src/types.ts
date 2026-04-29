export type UnitType = "concept" | "reading";

export type Confidence = 1 | 2 | 3 | 4 | 5;

export type CompareTag =
  | "overestimate_time"
  | "underestimate_time"
  | "confusion"
  | "gap"
  | "on_target";

export const COMPARE_TAGS: { id: CompareTag; label: string; hint: string }[] = [
  {
    id: "on_target",
    label: "On target",
    hint: "Prediction held up; recall ~ matched the source.",
  },
  {
    id: "overestimate_time",
    label: "Overestimated difficulty / time",
    hint: "I thought it would be harder or take longer than it did.",
  },
  {
    id: "underestimate_time",
    label: "Underestimated difficulty / time",
    hint: "It was harder or took longer than I predicted.",
  },
  {
    id: "confusion",
    label: "Mixed up concepts",
    hint: "Recall was confident but partly wrong: I confused things.",
  },
  {
    id: "gap",
    label: "Missed a whole chunk",
    hint: "There were parts I just didn't have in mind at all.",
  },
];

export interface RecallEvent {
  at: string;
  passed: boolean;
  notes?: string;
}

export interface BaseUnit {
  id: string;
  type: UnitType;
  topic: string;
  createdAt: string;
  prediction: string;
  confidence?: Confidence;
  retrieval: string;
  tags: CompareTag[];
  reflection?: string;
  recall: RecallEvent[];
  archived?: boolean;
}

export interface ConceptUnit extends BaseUnit {
  type: "concept";
  course?: string;
  predictedMinutes?: number;
  actualMinutes?: number;
}

export interface ReadingUnit extends BaseUnit {
  type: "reading";
  source?: string;
  followUpQuestion: string;
}

export type Unit = ConceptUnit | ReadingUnit;
