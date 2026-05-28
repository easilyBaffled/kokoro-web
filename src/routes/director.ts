import type { ProsodyPresetId } from "$lib/shared/resources";

export interface DirectorResult {
  prosodyPreset: ProsodyPresetId;
  speed: number;
  pitchShift: number;
  annotatedText: string;
  summary: string;
}

export function isChromeAIAvailable(): boolean {
  return typeof window !== "undefined" && !!(window as any).ai?.languageModel;
}

const SYSTEM_PROMPT = `You are a voice direction assistant for a text-to-speech system. Given a performance direction and the text to read, output settings that make the TTS match the intended emotion and style.

Available controls:
- prosodyPreset: "neutral" (minimal pauses, flat pace) | "expressive" (natural, default) | "dramatic" (long pauses, dynamic pacing)
- speed: 0.5–2.0 (1.0 = normal; lower = slower and weightier)
- pitchShift: -3 to +3 semitones (negative = lower/darker, positive = higher/brighter, 0 = unchanged)
- annotatedText: the original text with inline markers added:
    [Xs]       — pause X seconds, e.g. [0.5s] [1s] [2s]
    [slow]     — next sentence slower
    [fast]     — next sentence faster
    [speed:X]  — next sentence at X× speed, e.g. [speed:0.8]

Rules:
- Copy every word of the original text exactly — only INSERT markers, never rewrite words
- Use markers sparingly; prefer prosodyPreset and speed for overall tone
- Respond with valid JSON only, no markdown fences, no other text

Response schema:
{
  "prosodyPreset": "expressive",
  "speed": 1.0,
  "pitchShift": 0,
  "annotatedText": "...",
  "summary": "One sentence describing what you adjusted and why"
}`;

// Keyword rules used when Chrome AI is unavailable.
const RULES: Array<{
  pattern: RegExp;
  preset: ProsodyPresetId;
  speed: number;
  pitch: number;
  label: string;
}> = [
  {
    pattern: /\b(dramatic|intense|epic|villain|evil|menacing|dark|sinister|ominous|tense|thriller|horror|scary|suspense)\b/,
    preset: "dramatic", speed: 0.9, pitch: -1,
    label: "dramatic — slower, lower pitch, expressive pauses",
  },
  {
    pattern: /\b(gentle|soft|calm|soothing|peaceful|quiet|bedtime|children|kids|lullaby|relaxing|meditation)\b/,
    preset: "expressive", speed: 0.85, pitch: 1,
    label: "gentle — slower, slightly brighter, natural pacing",
  },
  {
    pattern: /\b(excited|energetic|upbeat|lively|enthusiastic|happy|joyful|fun|playful)\b/,
    preset: "expressive", speed: 1.15, pitch: 1,
    label: "energetic — faster, brighter",
  },
  {
    pattern: /\b(professional|formal|news|announcement|business|clear|neutral|monotone|robot)\b/,
    preset: "neutral", speed: 1.0, pitch: 0,
    label: "professional — neutral pacing, flat delivery",
  },
  {
    pattern: /\b(slow|deliberate|thoughtful|pensive|sad|melancholy|grief|mourning|solemn)\b/,
    preset: "dramatic", speed: 0.8, pitch: -1,
    label: "slow and deliberate — reduced pace, lower pitch",
  },
  {
    pattern: /\b(fast|quick|urgent|rushed|hurried|nervous|anxious)\b/,
    preset: "neutral", speed: 1.25, pitch: 0,
    label: "fast and urgent — increased pace",
  },
  {
    pattern: /\b(heroic|confident|powerful|authoritative|inspiring|motivational|bold)\b/,
    preset: "dramatic", speed: 0.95, pitch: -1,
    label: "authoritative — measured pace, lower pitch",
  },
];

function applyDirectionRuleBased(text: string, direction: string): DirectorResult {
  const d = direction.toLowerCase();
  for (const rule of RULES) {
    if (rule.pattern.test(d)) {
      return {
        prosodyPreset: rule.preset,
        speed: rule.speed,
        pitchShift: rule.pitch,
        annotatedText: text,
        summary: `Applied ${rule.label}`,
      };
    }
  }
  return {
    prosodyPreset: "expressive",
    speed: 1.0,
    pitchShift: 0,
    annotatedText: text,
    summary: "No matching keywords found — using default settings",
  };
}

export async function applyDirection(
  text: string,
  direction: string,
): Promise<DirectorResult> {
  if (!isChromeAIAvailable()) {
    return applyDirectionRuleBased(text, direction);
  }

  const ai = (window as any).ai;
  const capabilities = await ai.languageModel.capabilities();
  if (capabilities.available === "no") {
    return applyDirectionRuleBased(text, direction);
  }

  const truncated = text.length > 3000;
  const preview = truncated
    ? text.slice(0, 3000) + "\n\n[...continues...]"
    : text;

  const session = await ai.languageModel.create({ systemPrompt: SYSTEM_PROMPT });

  try {
    const response = await session.prompt(
      `Direction: ${direction}\n\nText:\n${preview}`,
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Director returned an unreadable response");

    const result = JSON.parse(jsonMatch[0]) as DirectorResult;
    result.speed = Math.max(0.5, Math.min(2.0, result.speed ?? 1.0));
    result.pitchShift = Math.max(-3, Math.min(3, Math.round(result.pitchShift ?? 0)));

    if (truncated) {
      result.annotatedText = text;
      result.summary += " (text too long to annotate — global settings applied)";
    }

    return result;
  } finally {
    session.destroy();
  }
}

