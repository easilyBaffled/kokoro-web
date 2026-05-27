<script lang="ts">
  import VoicePickerSimple from "./VoicePickerSimple.svelte";
  import VoicePickerAdvanced from "./VoicePickerAdvanced.svelte";
  import { voicesByLang, voicePresets, type LangId } from "$lib/shared/resources";
  import { profile } from "./store.svelte";

  let isSimpleMode = $derived(profile.voiceMode === "simple");

  function toggleMode() {
    profile.voiceMode = profile.voiceMode === "simple" ? "advanced" : "simple";
  }

  // Order voices by language, with the selected language first.
  let orderedVoices = $derived.by(() => {
    let langVoices = voicesByLang[profile.lang];
    let combinedVoices = [langVoices];

    let otherVoices = { ...voicesByLang };
    delete otherVoices[profile.lang];

    for (let voices of Object.values(otherVoices)) {
      combinedVoices.push(voices);
    }

    return combinedVoices;
  });

  // Presets relevant to the active language.
  let filteredPresets = $derived(
    voicePresets.filter((p) => !p.langId || p.langId === profile.lang),
  );

  function applyPreset(e: Event) {
    const select = e.currentTarget as HTMLSelectElement;
    const id = select.value;
    const preset = filteredPresets.find((p) => p.id === id);
    if (preset) {
      profile.voiceFormula = preset.formula;
      profile.voiceMode = "advanced";
    }
    // Reset so the placeholder shows after applying.
    select.value = "";
  }
</script>

<div class="space-y-2">
  {#if filteredPresets.length > 0}
    <div class="fieldset w-full">
      <legend class="fieldset-legend">Voice preset</legend>
      <select class="select w-full" onchange={applyPreset}>
        <option value="">— apply a preset —</option>
        {#each filteredPresets as preset}
          <option value={preset.id} title={preset.description}
            >{preset.name}</option
          >
        {/each}
      </select>
    </div>
  {/if}

  <div>
    <div class="flex items-end justify-between">
      <span class="text-xs font-semibold">
        {isSimpleMode ? "Voice (quality)" : "Voice formula"}
      </span>

      <label class="flex items-center space-x-2">
        <input
          type="checkbox"
          class="toggle toggle-sm"
          checked={profile.voiceMode == "advanced"}
          onclick={toggleMode}
        />
        <span>Advanced Mode</span>
      </label>
    </div>

    {#if isSimpleMode}
      <VoicePickerSimple {orderedVoices} />
    {:else}
      <VoicePickerAdvanced {orderedVoices} />
    {/if}
  </div>
</div>
