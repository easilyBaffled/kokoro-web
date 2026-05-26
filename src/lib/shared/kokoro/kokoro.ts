import { getModel, prosodyPresetsMap } from "$lib/shared/resources";
import type { LangId, ModelId, ProsodyPresetId } from "$lib/shared/resources";
import { detectWebGPU } from "$lib/client/utils";
import { combineVoices } from "./combineVoices";
import { preprocessText, type TextProcessorChunk } from "./textProcessor";
import { trimWaveform } from "./trimWaveform";
import { getOnnxRuntime } from "./getOnnxRuntime";
import { modifyWavSpeed, wavToMp3 } from "../ffmpeg";
import { createWavBuffer } from "./createWavBuffer";
import { parseVoiceFormula } from "./voiceFormula";

const MODEL_CONTEXT_WINDOW = 512;
const SAMPLE_RATE = 24000; // sample rate in Hz
// Approximate training range for the model's native speed input.
// Values outside this are handled via FFmpeg post-processing.
const MODEL_SPEED_MIN = 0.5;
const MODEL_SPEED_MAX = 2.0;
// 5 ms crossfade between adjacent text chunks to prevent clicks at speed boundaries.
const CROSSFADE_SAMPLES = Math.round(0.005 * SAMPLE_RATE);

/**
 * Linear crossfade between two waveforms. Overlaps the tail of `a` with the
 * head of `b` over `samples` frames and returns a single combined waveform.
 */
function crossfade(
  a: Float32Array<ArrayBuffer>,
  b: Float32Array<ArrayBuffer>,
  samples: number,
): Float32Array<ArrayBuffer> {
  const overlap = Math.min(samples, a.length, b.length);
  const result = new Float32Array(a.length + b.length - overlap);
  result.set(a.slice(0, a.length - overlap));
  for (let i = 0; i < overlap; i++) {
    const t = i / overlap;
    result[a.length - overlap + i] =
      a[a.length - overlap + i] * (1 - t) + b[i] * t;
  }
  result.set(b.slice(overlap), a.length);
  return result;
}

/**
 * Generates a voice from a given text.
 *
 * The raw text is preprocessed so that silence markers are detected before phonemization.
 * For text segments the phonemizer is called, then punctuation splitting and token generation are applied.
 * Silence chunks produce silent waveforms.
 *
 * The voice formula is parsed into an array of voice weights.
 *
 * @param params - Generation parameters.
 * @param params.text - The input text.
 * @param params.lang - The language ID (for phonemization).
 * @param params.voiceFormula - The voice formula.
 * @param params.model - The model ID.
 * @param params.speed - The speed factor.
 * @param params.format - The output format.
 * @param params.acceleration - "cpu" or "webgpu" to select acceleration.
 * @returns Concatenated waveform.
 */
export async function generateVoice(params: {
  text: string;
  lang: LangId | string;
  voiceFormula: string;
  model: ModelId | string;
  speed: number;
  format: "wav" | "mp3";
  acceleration: "cpu" | "webgpu";
  prosodyPreset?: ProsodyPresetId;
}): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  if (params.acceleration === "webgpu" && !detectWebGPU()) {
    throw new Error("WebGPU is not supported in this environment");
  }
  if (params.speed < 0.1 || params.speed > 5) {
    throw new Error("Speed must be between 0.1 and 5");
  }

  const ort = await getOnnxRuntime();

  const preset =
    prosodyPresetsMap[params.prosodyPreset ?? "expressive"];

  const tokensPerChunk = MODEL_CONTEXT_WINDOW - 2;
  const chunks: TextProcessorChunk[] = await preprocessText(
    params.text,
    params.lang,
    tokensPerChunk,
    {
      silenceMultiplier: preset.silenceMultiplier,
      sentenceVariation: preset.sentenceVariation,
    },
  );

  const modelBuffer = await getModel(params.model);
  const voices = parseVoiceFormula(params.voiceFormula);
  const combinedVoice = await combineVoices(voices);

  const session = await ort.InferenceSession.create(modelBuffer, {
    executionProviders: [params.acceleration],
  });

  const waveforms: Float32Array<ArrayBuffer>[] = [];
  const waveformIsText: boolean[] = [];
  let waveformsLen = 0;

  // Track speed overrides from inline [speed:X] / [fast] / [slow] markers.
  let speedOverride: number | null = null;

  // Process each chunk based on its type.
  for (const chunk of chunks) {
    if (chunk.type === "speed") {
      speedOverride = chunk.multiplier;
      continue;
    }

    if (chunk.type === "silence") {
      console.log(chunk);

      const silenceLength = Math.floor(chunk.durationSeconds * SAMPLE_RATE);
      const silenceWave = new Float32Array(silenceLength);
      waveforms.push(silenceWave);
      waveformIsText.push(false);
      waveformsLen += silenceLength;
    }

    if (chunk.type === "text") {
      const tokensLength = chunk.tokens?.length ?? 0;
      if (tokensLength < 1) {
        console.log("Skipping chunk with no tokens");
        continue;
      }

      console.log({ type: chunk.type, content: chunk.content });

      const tokens = chunk.tokens;
      const ref_s = combinedVoice[tokens.length - 1][0];
      const paddedTokens = [0, ...tokens, 0];
      const input_ids = new ort.Tensor("int64", paddedTokens, [
        1,
        paddedTokens.length,
      ]);
      const style = new ort.Tensor("float32", ref_s, [1, ref_s.length]);

      // Use the model's native speed input for natural prosody. Per-chunk
      // multipliers (from sentence type or inline markers) are applied here.
      // Values outside the model's training range are clamped; any remaining
      // factor is applied via FFmpeg after assembly.
      const chunkMultiplier = speedOverride ?? (chunk.speed ?? 1.0);
      const effectiveSpeed = params.speed * chunkMultiplier;
      const modelSpeed = Math.max(
        MODEL_SPEED_MIN,
        Math.min(MODEL_SPEED_MAX, effectiveSpeed),
      );
      const speed = new ort.Tensor("float32", [modelSpeed], [1]);

      // Get the raw waveform and trim extra silence duration.
      const result = await session.run({ input_ids, style, speed });
      let waveform = (await result.waveform.getData()) as Float32Array;
      waveform = trimWaveform(waveform);

      waveforms.push(waveform as Float32Array<ArrayBuffer>);
      waveformIsText.push(true);
      waveformsLen += waveform.length;
    }
  }

  if (waveforms.length === 0) {
    throw new Error("No waveforms generated");
  }

  // Assemble waveforms, applying a short crossfade between adjacent text chunks
  // to prevent audible clicks at speed-change boundaries.
  let finalWaveform = waveforms[0];
  for (let i = 1; i < waveforms.length; i++) {
    if (waveformIsText[i - 1] && waveformIsText[i]) {
      finalWaveform = crossfade(finalWaveform, waveforms[i], CROSSFADE_SAMPLES);
    } else {
      const combined = new Float32Array(
        finalWaveform.length + waveforms[i].length,
      );
      combined.set(finalWaveform);
      combined.set(waveforms[i], finalWaveform.length);
      finalWaveform = combined;
    }
  }

  let wavBuffer = await createWavBuffer(finalWaveform, SAMPLE_RATE);
  // Apply FFmpeg only if the global speed falls outside the model's training range,
  // to handle the overflow factor beyond what the model can express natively.
  const clampedGlobalSpeed = Math.max(
    MODEL_SPEED_MIN,
    Math.min(MODEL_SPEED_MAX, params.speed),
  );
  const ffmpegFactor = params.speed / clampedGlobalSpeed;
  if (Math.abs(ffmpegFactor - 1) > 0.01) {
    wavBuffer = await modifyWavSpeed(wavBuffer, ffmpegFactor);
  }

  if (params.format === "wav") {
    return { buffer: wavBuffer, mimeType: "audio/wav" };
  }

  return { buffer: await wavToMp3(wavBuffer), mimeType: "audio/mpeg" };
}
