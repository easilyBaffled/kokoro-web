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

export async function applyDirection(
  text: string,
  direction: string,
): Promise<DirectorResult> {
  const ai = (window as any).ai;
  if (!ai?.languageModel) {
    throw new Error(
      "Chrome AI not detected. Enable the Prompt API at chrome://flags/#prompt-api-for-gemini-nano and relaunch Chrome.",
    );
  }

  const capabilities = await ai.languageModel.capabilities();
  if (capabilities.available === "no") {
    throw new Error(
      "Gemini Nano is not yet downloaded. Visit chrome://on-device-ai or wait for Chrome to download it in the background.",
    );
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
    result.pitchShift = Math.max(
      -3,
      Math.min(3, Math.round(result.pitchShift ?? 0)),
    );

    if (truncated) {
      result.annotatedText = text;
      result.summary += " (text too long to annotate — global settings applied)";
    }

    return result;
  } finally {
    session.destroy();
  }
}
