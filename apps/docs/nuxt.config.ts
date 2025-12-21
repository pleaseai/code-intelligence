import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  extends: ['docs-please'],
  site: {
    name: 'Code Please Docs',
    url: 'https://code-please.pages.dev',
  },
  content: {
    database: {
      type: 'd1',
      bindingName: 'DB',
    },
  },
  routeRules: {
    '/': { prerender: true },
  },
  compatibilityDate: '2025-12-21',
  nitro: {
    preset: 'cloudflare_pages',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },
  llms: {
    domain: 'https://code-please.pages.dev',
    title: 'Code Please',
    description: 'Auto-format and type-check hooks for AI coding',
    full: {
      title: 'Code Please Documentation',
      description: 'Complete documentation for @pleaseai/code - Auto-format and type-check hooks for AI coding',
    },
  },
})
