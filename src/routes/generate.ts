import OpenAI from "openai";
import { generateVoice } from "$lib/shared/kokoro";
import type { ProfileData } from "./store.svelte";
import { applyDirection } from "./director";
import umami from "$lib/client/umami";

export interface GenerateResult {
  url: string;
  directorSummary?: string;
}

/**
 * Generate runs the text to speech generation process both in the browser
 * and in the API.
 */
export async function generate(profile: ProfileData): Promise<GenerateResult> {
  umami.track("generate", {
    lang: profile.lang,
    voiceMode: profile.voiceMode,
    voiceFormula: profile.voiceFormula,
    model: profile.model,
    speed: profile.speed,
    format: profile.format,
    acceleration: profile.acceleration,
    executionPlace: profile.executionPlace,
  });

  // Resolve effective params, optionally overridden by AI direction.
  let text = profile.text;
  let speed = profile.speed;
  let prosodyPreset = profile.prosodyPreset;
  let pitchShift = profile.pitchShift;
  let directorSummary: string | undefined;

  if (profile.directionText.trim() && profile.anthropicApiKey.trim()) {
    const directed = await applyDirection(
      profile.text,
      profile.directionText,
      profile.anthropicApiKey,
    );
    text = directed.annotatedText;
    speed = directed.speed;
    prosodyPreset = directed.prosodyPreset;
    pitchShift = directed.pitchShift;
    directorSummary = directed.summary;
  }

  if (profile.executionPlace === "browser") {
    const result = await generateVoice({
      text,
      lang: profile.lang,
      voiceFormula: profile.voiceFormula,
      model: profile.model,
      speed,
      format: profile.format,
      acceleration: profile.acceleration,
      prosodyPreset,
      pitchShift,
    });

    const resBlob = new Blob([result.buffer], { type: result.mimeType });
    const url = URL.createObjectURL(resBlob);
    return { url, directorSummary };
  }

  const openai = new OpenAI({
    dangerouslyAllowBrowser: true,
    baseURL: profile.apiBaseUrl,
    apiKey: profile.apiKey,
  });

  const mp3 = await openai.audio.speech.create({
    input: text,
    voice: profile.voiceFormula as OpenAI.Audio.SpeechCreateParams["voice"],
    model: profile.model,
    speed,
    response_format: "mp3",
  });

  const resBlob = new Blob([await mp3.arrayBuffer()], { type: "audio/mpeg" });
  const url = URL.createObjectURL(resBlob);
  return { url, directorSummary };
}
