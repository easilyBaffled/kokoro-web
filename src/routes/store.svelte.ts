import { browser } from "$app/environment";
import { detectWebGPU } from "$lib/client/utils";
import {
  getRandomQuote,
  modelsMap,
  voicesMap,
  type LangId,
  type ModelId,
  type ProsodyPresetId,
} from "$lib/shared/resources";

export interface ProfileData {
  name: string;
  text: string;
  lang: LangId;
  voiceMode: "simple" | "advanced";
  voiceFormula: string;
  model: ModelId;
  speed: number;
  format: "mp3" | "wav";
  acceleration: "cpu" | "webgpu";
  executionPlace: "browser" | "api";
  apiBaseUrl: string;
  apiKey: string;
  prosodyPreset: ProsodyPresetId;
}

function getCurrentHost() {
  if (!browser) return "";
  return `${window.location.protocol}//${window.location.host}`;
}

export const defaultProfile: ProfileData = {
  name: "default",
  text: getRandomQuote(),
  lang: voicesMap["af_alloy"].lang.id,
  voiceMode: "simple",
  voiceFormula: voicesMap["af_alloy"].id,
  model: modelsMap.model.id,
  speed: 1,
  format: "mp3",
  acceleration: detectWebGPU() ? "webgpu" : "cpu",
  executionPlace: "browser",
  apiBaseUrl: `${getCurrentHost()}/api/v1`,
  apiKey: "",
  prosodyPreset: "expressive",
};

export const profile: ProfileData = $state({
  ...defaultProfile,
});

export const loadProfile = (newProfile: ProfileData) => {
  const keys = Object.keys(newProfile);
  for (const key of keys) {
    // @ts-ignore
    profile[key] = newProfile[key];
  }
};
