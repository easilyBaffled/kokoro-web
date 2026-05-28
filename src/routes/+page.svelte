<script lang="ts">
  import { onMount } from "svelte";
  import { detectWebGPU } from "$lib/client/utils";
  import { langs, models, prosodyPresetsMap, prosodyPresetIds } from "$lib/shared/resources";
  import SelectControl from "$lib/client/components/SelectControl.svelte";
  import TextareaControl from "$lib/client/components/TextareaControl.svelte";
  import RangeControl from "$lib/client/components/RangeControl.svelte";
  import AudioPlayer from "$lib/client/components/AudioPlayer.svelte";
  import { toaster } from "$lib/client/toaster";
  import VoicePicker from "./VoicePicker.svelte";
  import GenerateButton from "./GenerateButton.svelte";
  import ProfileManager from "./ProfileManager.svelte";
  import ExecutionPlacePicker from "./ExecutionPlacePicker.svelte";
  import VersionChecker from "./VersionChecker.svelte";
  import { profile } from "./store.svelte";
  import { generate } from "./generate";
  import { isChromeAIAvailable } from "./director";

  let webgpuSupported = $state(false);
  let chromeAIAvailable = $state(false);
  onMount(() => {
    webgpuSupported = detectWebGPU();
    chromeAIAvailable = isChromeAIAvailable();
  });

  let loading = $state(false);
  let voiceUrl = $state("");
  let directorSummary = $state("");

  const process = async () => {
    if (loading) return;
    if (!profile.text) return;

    loading = true;
    directorSummary = "";
    try {
      const result = await generate(profile);
      voiceUrl = result.url;
      if (result.directorSummary) {
        directorSummary = result.directorSummary;
      }
      toaster.success("Audio generated successfully");
    } catch (error) {
      console.error(error);
      toaster.error((error as any).message ?? "An error occurred, see console");
    } finally {
      loading = false;
    }
  };
</script>

<div class="space-y-4">
  <VersionChecker />

  <h2 class="text-xl font-bold">Input</h2>

  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <ProfileManager />
    <ExecutionPlacePicker />

    <SelectControl
      bind:value={profile.acceleration}
      disabled={profile.executionPlace === "api"}
      title={profile.executionPlace === "browser"
        ? "Acceleration"
        : "Acceleration (Browser only)"}
      selectClass="w-full"
    >
      <option value="cpu">CPU</option>
      {#if webgpuSupported}
        <option value="webgpu">WebGPU (Faster)</option>
      {:else}
        <option disabled>WebGPU (not supported by your browser)</option>
      {/if}
    </SelectControl>

    <SelectControl
      bind:value={profile.model}
      title="Model quantization"
      selectClass="w-full"
    >
      {#each models as mo}
        <option value={mo.id}>
          {mo.size} - {mo.id} ({mo.quantization})
        </option>
      {/each}
    </SelectControl>

    <SelectControl
      bind:value={profile.lang}
      title="Language accent (region)"
      selectClass="w-full"
    >
      {#each langs as lng}
        <option value={lng.id}>{lng.name}</option>
      {/each}
    </SelectControl>

    <VoicePicker />
  </div>

  <TextareaControl
    bind:value={profile.text}
    title="Text to process"
    helpText="Add pauses: [1s] or [0.5s]. Control phrasing: [fast], [slow], [speed:0.8]. Example: Hello[0.5s][slow]world"
    textareaClass="w-full"
  />

  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <RangeControl
      bind:value={profile.speed}
      hideValue={true}
      title={`Speed ${profile.speed}x`}
      inputClass="w-full max-w-[400px]"
      min="0.1"
      max="2"
      step="0.1"
    />

    <RangeControl
      bind:value={profile.pitchShift}
      hideValue={true}
      title={`Pitch ${profile.pitchShift > 0 ? "+" : ""}${profile.pitchShift} semitones`}
      inputClass="w-full max-w-[400px]"
      min="-3"
      max="3"
      step="1"
    />

    <SelectControl
      bind:value={profile.prosodyPreset}
      title="Style"
      selectClass="w-full"
    >
      {#each prosodyPresetIds as presetId}
        <option value={presetId} title={prosodyPresetsMap[presetId].description}>
          {prosodyPresetsMap[presetId].name}
        </option>
      {/each}
    </SelectControl>
  </div>

  <div class="fieldset w-full">
    <legend class="fieldset-legend">
      AI Director
      <span class="font-normal opacity-60">(optional)</span>
      <span class="ml-2 text-xs opacity-50">{chromeAIAvailable ? "Gemini Nano" : "keyword rules"}</span>
    </legend>
    <div class="space-y-2">
      <textarea
        class="textarea w-full"
        rows="2"
        placeholder="Direction — e.g. 'Read this as a tense thriller scene' or 'Gentle bedtime story for children'"
        bind:value={profile.directionText}
      ></textarea>
      {#if !chromeAIAvailable}
        <p class="text-xs opacity-50">
          For smarter direction, enable Gemini Nano in Chrome:
          <code>chrome://flags/#prompt-api-for-gemini-nano</code>
        </p>
      {/if}
      {#if directorSummary}
        <p class="text-sm opacity-70 italic">{directorSummary}</p>
      {/if}
    </div>
  </div>

  <GenerateButton {loading} onclick={() => process()} />

  {#if voiceUrl !== ""}
    <div class="space-y-4 pt-2">
      <h2 class="text-xl font-bold">Output</h2>
      <AudioPlayer audioUrl={voiceUrl} showSpectrogram={true} />
    </div>
  {/if}
</div>
