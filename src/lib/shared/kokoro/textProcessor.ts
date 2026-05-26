import { tokenize } from "./tokenizer";
import type { LangId } from "$lib/shared/resources";
import { phonemize } from "$lib/shared/phonemizer";

export interface TextChunk {
  type: "text";
  content: string;
  tokens: number[];
  /** Per-chunk speed multiplier derived from trailing punctuation. Default: 1.0. */
  speed?: number;
}

export interface SilenceChunk {
  type: "silence";
  durationSeconds: number;
}

export interface SpeedChunk {
  type: "speed";
  /** Absolute speed multiplier applied to all subsequent text chunks until reset. */
  multiplier: number;
}

export type TextProcessorChunk = TextChunk | SilenceChunk | SpeedChunk;

/**
 * Replace punctuation and newlines with silence markers.
 *
 * Ordering matters: longer/more-specific patterns must precede shorter ones
 * (e.g. paragraph breaks before single newlines, ellipsis before single dots).
 */
export function sanitizeText(rawText: string): string {
  const sanitizedText = rawText
    // Paragraph break (2+ newlines) — must come before the single-newline rule.
    .replace(/\n{2,}/g, "[0.8s]")
    // Ellipsis variants — must come before the single-dot rule.
    .replace(/\.{3,}/g, "[0.6s]")
    .replace(/…/g, "[0.6s]")
    // Em-dash — no whitespace requirement (often appears as word—word).
    .replace(/—/g, "[0.5s]")
    // Standard punctuation.
    .replace(/\.\s+/g, "[0.4s]")
    .replace(/,\s+/g, "[0.2s]")
    .replace(/;\s+/g, "[0.4s]")
    .replace(/:\s+/g, "[0.3s]")
    .replace(/!\s+/g, "![0.3s]")
    .replace(/\?\s+/g, "?[0.3s]")
    // Single newline — after the paragraph-break rule.
    .replace(/\n+/g, "[0.4s]")
    .trim();

  console.log(sanitizedText);
  return sanitizedText;
}

/**
 * Splits the sanitized string into segments using silence and speed markers as delimiters.
 */
export function segmentText(sanitizedText: string): string[] {
  const regex =
    /(\[[0-9]+(?:\.[0-9]+)?s\]|\[speed:[0-9]*\.?[0-9]+\]|\[fast\]|\[slow\])/g;
  return sanitizedText
    .split(regex)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/**
 * Verifies that the token count of a phonemized text does not exceed the limit.
 * If it does, the segment is split into smaller parts.
 */
function createPhonemeSubChunks(
  phonemes: string,
  tokensPerChunk: number,
): string[] {
  if (phonemes.length <= tokensPerChunk) return [phonemes];

  const chunks: string[] = [];

  let currentChunk: string = "";
  for (const phoneme of phonemes) {
    if (currentChunk.length >= tokensPerChunk) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += phoneme;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Returns a speed multiplier (relative to the user's base speed) based on the
 * trailing punctuation of a sentence. Exclamatory sentences run slightly faster;
 * questions run slightly slower — matching natural speech patterns.
 */
function getSentenceSpeedMultiplier(segment: string): number {
  const t = segment.trimEnd();
  if (t.endsWith("!")) return 1.05;
  if (t.endsWith("?")) return 0.95;
  return 1.0;
}

/**
 * Returns true when a segment is a user-authored speed marker:
 * [speed:X], [fast], or [slow].
 */
export function isSpeedMarker(segment: string): boolean {
  const s = segment.trim();
  return /^\[speed:[0-9]*\.?[0-9]+\]$/.test(s) || s === "[fast]" || s === "[slow]";
}

/**
 * Extracts the speed multiplier from a speed marker.
 */
export function extractSpeedMultiplier(marker: string): number {
  const s = marker.trim();
  const m = s.match(/^\[speed:([0-9]*\.?[0-9]+)\]$/);
  if (m) return Math.max(0.1, parseFloat(m[1]));
  if (s === "[fast]") return 1.3;
  if (s === "[slow]") return 0.75;
  return 1.0;
}

/**
 * Main preprocessText function:
 * 1. Sanitizes the input text.
 * 2. Segments the sanitized text into parts (text and silence markers).
 * 3. For non-silence segments, tokenizes them.
 * 4. Enforces the token limit on each tokenized segment.
 *
 * @param text - Original input text.
 * @param lang - Language for phonemization.
 * @param tokensPerChunk - Maximum allowed tokens per segment.
 * @returns Array of TextProcessorChunk.
 */
export async function preprocessText(
  text: string,
  lang: LangId | string,
  tokensPerChunk: number,
): Promise<TextProcessorChunk[]> {
  const chunks: TextProcessorChunk[] = [];
  const sanitized = sanitizeText(text);
  const segments = segmentText(sanitized);

  for (const segment of segments) {
    if (isSilenceMarker(segment)) {
      const durationSeconds = extractSilenceDuration(segment);
      chunks.push({ type: "silence", durationSeconds });
      continue;
    }

    if (isSpeedMarker(segment)) {
      const multiplier = extractSpeedMultiplier(segment);
      chunks.push({ type: "speed", multiplier });
      continue;
    }

    const speed = getSentenceSpeedMultiplier(segment);
    const phonemized = await phonemize(segment, lang);
    const phonemizedChunks = createPhonemeSubChunks(phonemized, tokensPerChunk);

    for (const phonemeChunk of phonemizedChunks) {
      const tokens = tokenize(phonemeChunk);
      chunks.push({ type: "text", content: phonemeChunk, tokens, speed });
    }
  }

  return chunks;
}

/**
 * Checks whether a segment is a silence marker.
 * Accepts only the "[number s]" format (e.g. "[1.5s]").
 */
export function isSilenceMarker(segment: string): boolean {
  return /^\[[0-9]+(?:\.[0-9]+)?s\]$/.test(segment.trim());
}

/**
 * Extracts the duration from a silence marker.
 * Accepts only the "[number s]" format.
 *
 * @param marker - The silence marker string.
 * @returns The duration in seconds.
 */
export function extractSilenceDuration(marker: string): number {
  const match = marker.trim().match(/^\[([0-9]+(?:\.[0-9]+)?)s\]$/);
  return match ? parseFloat(match[1]) : 0;
}
