import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import nimbus, {
  defineConfig as defineNimbusConfig,
} from "@cloudflare/nimbus-docs";
import { tableScroll } from "@cloudflare/nimbus-docs/markdown";

const nimbusConfig = defineNimbusConfig({
  site: "https://code-please.pages.dev",
  title: "Code Please",
  description: "Auto-format and type-check hooks for AI coding",
  locale: "en",
  github: "https://github.com/pleaseai/code-intelligence",
  socialImageAlt: "Code Please documentation preview",
  sidebar: {
    items: [
      "index",
      { label: "Getting Started", autogenerate: { directory: "getting-started" } },
      { label: "Guides", autogenerate: { directory: "guides" } },
      { label: "Configuration", autogenerate: { directory: "configuration" } },
      { label: "Reference", autogenerate: { directory: "reference" } },
    ],
  },
});

export default defineConfig({
  // nimbus:adapter
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
    nimbus(nimbusConfig, {
      rules: {
        "nimbus/frontmatter-shape": "error",
        "nimbus/internal-link": "error",
      },
      markdown: {
        hastPlugins: [tableScroll()],
        // `## Install {#install}` gives a heading a fixed id. A heading that
        // ends in other `{…}` text, such as `{account_id}` in a .md file, is
        // read as attributes too; remove this to keep it as text.
        features: { headingAttributes: true },
      },
    }),
  ],
});
