import OpenAI from "openai";
import { generateVoice } from "$lib/shared/kokoro";
import type { ProfileData } from "./store.svelte";
import umami from "$lib/client/umami";

/**
 * Generate runs the text to speech generation process both in the browser
 * and in the API.
 */
export async function generate(profile: ProfileData): Promise<string> {
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

  if (profile.executionPlace === "browser") {
    const result = await generateVoice({
      text: profile.text,
      lang: profile.lang,
      voiceFormula: profile.voiceFormula,
      model: profile.model,
      speed: profile.speed,
      format: profile.format,
      acceleration: profile.acceleration,
      prosodyPreset: profile.prosodyPreset,
      pitchShift: profile.pitchShift,
    });

    const resBlob = new Blob([result.buffer], { type: result.mimeType });
    const url = URL.createObjectURL(resBlob);

    return url;
  }

  const openai = new OpenAI({
    dangerouslyAllowBrowser: true,
    baseURL: profile.apiBaseUrl,
    apiKey: profile.apiKey,
  });

  const mp3 = await openai.audio.speech.create({
    input: profile.text,
    voice: profile.voiceFormula as OpenAI.Audio.SpeechCreateParams["voice"],
    model: profile.model,
    speed: profile.speed,
    response_format: "mp3",
  });

  const resBlob = new Blob([await mp3.arrayBuffer()], { type: "audio/mpeg" });
  const url = URL.createObjectURL(resBlob);

  return url;
}
