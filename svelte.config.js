import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

import adapterNode from "@sveltejs/adapter-node";
import adapterStatic from "@sveltejs/adapter-static";

// https://svelte.dev/docs/kit/adapter-node
let adapter = adapterNode();

// https://svelte.dev/docs/kit/adapter-static
if (process.env.ADAPTER === "static") {
  adapter = adapterStatic({
    strict: false,
    fallback: "index.html",
  });
}

// Allow overriding the base path for deployments like GitHub Pages
// e.g. VITE_BASE_PATH=/kokoro-web
const base = process.env.VITE_BASE_PATH ?? "";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    // See https://svelte.dev/docs/kit/adapters for more information about adapters.
    adapter: adapter,

    paths: {
      base,
    },

    // See https://svelte.dev/docs/kit/configuration#env
    env: {
      privatePrefix: "KW_SECRET_",
      publicPrefix: "KW_PUBLIC_",
    },
  },
};

export default config;
