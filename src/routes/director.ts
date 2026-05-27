import type { ProsodyPresetId } from "$lib/shared/resources";

export interface DirectorResult {
  prosodyPreset: ProsodyPresetId;
  speed: number;
  pitchShift: number;
  annotatedText: string;
  summary: string;
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
  apiKey: string,
): Promise<DirectorResult> {
  // Send up to 3000 chars for annotation; longer texts get global settings only.
  const truncated = text.length > 3000;
  const preview = truncated ? text.slice(0, 3000) + "\n\n[...continues...]" : text;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Direction: ${direction}\n\nText:\n${preview}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as any).error?.message ?? `Anthropic API error ${response.status}`,
    );
  }

  const data = await response.json();
  const content: string = (data as any).content?.[0]?.text ?? "";

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Director returned an unreadable response");

  const result = JSON.parse(jsonMatch[0]) as DirectorResult;

  // Clamp values to valid ranges
  result.speed = Math.max(0.5, Math.min(2.0, result.speed ?? 1.0));
  result.pitchShift = Math.max(-3, Math.min(3, Math.round(result.pitchShift ?? 0)));

  // If text was truncated, keep the full original (only global settings apply)
  if (truncated) {
    result.annotatedText = text;
    result.summary += " (text too long to annotate — global settings applied)";
  }

  return result;
}
