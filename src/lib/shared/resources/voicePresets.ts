export interface VoicePreset {
  id: string;
  name: string;
  description: string;
  formula: string;
  /** If set, only show this preset when the active language matches. */
  langId?: string;
}

/**
 * Curated voice formula blends for common emotional tones.
 * Weights sum to 1.0 and use the highest-quality voices for each language.
 */
export const voicePresets: VoicePreset[] = [
  // English (US) ─────────────────────────────────────────────────────────────
  {
    id: "en-us-warm",
    name: "Warm",
    description: "Intimate and approachable — good for personal narration",
    formula: "af_heart*0.7 + af_nicole*0.3",
    langId: "en-us",
  },
  {
    id: "en-us-storyteller",
    name: "Storyteller",
    description: "Expressive narrative voice — good for fiction and audiobooks",
    formula: "af_bella*0.5 + af_heart*0.5",
    langId: "en-us",
  },
  {
    id: "en-us-professional",
    name: "Professional",
    description: "Clear and polished — good for business and announcements",
    formula: "af_nicole*0.8 + af_heart*0.2",
    langId: "en-us",
  },
  {
    id: "en-us-authoritative",
    name: "Authoritative",
    description: "Confident and grounded — good for instructional content",
    formula: "am_fenrir*0.6 + am_michael*0.4",
    langId: "en-us",
  },
  {
    id: "en-us-energetic",
    name: "Energetic",
    description: "Lively and upbeat — good for ads and short-form content",
    formula: "af_bella*0.4 + am_puck*0.3 + af_kore*0.3",
    langId: "en-us",
  },
  // English (GB) ──────────────────────────────────────────────────────────────
  {
    id: "en-gb-refined",
    name: "Refined",
    description: "Elegant British female — good for formal or literary content",
    formula: "bf_emma*0.7 + bf_isabella*0.3",
    langId: "en-gb",
  },
  {
    id: "en-gb-scholarly",
    name: "Scholarly",
    description: "Measured British male — good for educational content",
    formula: "bm_george*0.6 + bm_fable*0.4",
    langId: "en-gb",
  },
];
