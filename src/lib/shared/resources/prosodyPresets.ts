export type ProsodyPresetId = "neutral" | "expressive" | "dramatic";

export interface ProsodyPreset {
  id: ProsodyPresetId;
  name: string;
  description: string;
  /** Scales all auto-inserted silence durations (e.g. 1.6 = 60% longer pauses). */
  silenceMultiplier: number;
  /** ± fraction applied to per-sentence speed variation (0 = no variation). */
  sentenceVariation: number;
}

export const prosodyPresetsMap: Record<ProsodyPresetId, ProsodyPreset> = {
  neutral: {
    id: "neutral",
    name: "Neutral",
    description: "Minimal pauses, consistent pace — best for informational text",
    silenceMultiplier: 0.7,
    sentenceVariation: 0.0,
  },
  expressive: {
    id: "expressive",
    name: "Expressive",
    description: "Natural conversational pacing with breathing room",
    silenceMultiplier: 1.0,
    sentenceVariation: 0.05,
  },
  dramatic: {
    id: "dramatic",
    name: "Dramatic",
    description: "Exaggerated pauses and dynamic pacing — best for narration",
    silenceMultiplier: 1.6,
    sentenceVariation: 0.12,
  },
};

export const prosodyPresetIds = Object.keys(
  prosodyPresetsMap,
) as ProsodyPresetId[];
