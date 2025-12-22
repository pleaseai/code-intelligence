# Specification: Documentation Site (apps/docs)

**Version**: 1.0
**Created**: 2025-12-21
**Status**: Approved

## Summary

Create a documentation website at `apps/docs` for the code-please project, using the `docs-please` Nuxt layer from the pleaseai/docs repository. The site will document the four packages: @pleaseai/code, @pleaseai/code-format, @pleaseai/code-lsp, and @pleaseai/dora.

## Problem Statement

**Current State**: The code-please project has documentation scattered across README.md and CLAUDE.md files. There's no unified, navigable documentation site for users.

**Desired State**: A professional documentation website that provides:
- Quick start guides for new users
- Comprehensive reference documentation
- Searchable, navigable content
- Deployment to Cloudflare Pages

## Scope

### In Scope
1. **Monorepo Integration**
   - Add `apps/*` to workspace configuration
   - Create `apps/docs/` directory structure
   - Configure Nuxt app extending docs-please layer

2. **Documentation Content**
   - Introduction and overview
   - Installation and quick start
   - Claude Code hooks setup
   - Auto-formatting guide
   - LSP diagnostics guide
   - Configuration reference
   - CLI commands reference
   - Supported languages matrix
   - MCP server (Dora) documentation
   - API reference

3. **Deployment Configuration**
   - Cloudflare Pages with D1 database
   - wrangler.jsonc configuration
   - Route rules for prerendering

### Out of Scope
- Custom components beyond docs-please layer
- Multi-language (i18n) support (English only initially)
- API documentation auto-generation from TypeScript
- Blog or changelog features

## Functional Requirements

### FR1: Nuxt App Setup
- The documentation site SHALL extend the `docs-please` layer
- The app SHALL be located at `apps/docs/`
- The app SHALL use Bun as the package manager

### FR2: Content Structure
- Content SHALL follow @nuxt/content collection patterns
- Navigation SHALL be defined via `.navigation.yml` files
- Content SHALL be written in Markdown with MDC components

### FR3: Configuration
- Site title: "Code Please"
- Site URL: https://code-please.pages.dev
- GitHub integration: link to chatbot-pf/code-please

### FR4: Build Integration
- The app SHALL be buildable via `turbo build`
- The app SHALL support `bun run dev` for development
- The app SHALL generate static assets for Cloudflare Pages

## Non-Functional Requirements

### NFR1: Compatibility
- Nuxt 4.x compatibility
- Node.js 20+ / Bun 1.0+ runtime

### NFR2: Performance
- Page load under 3 seconds
- All pages prerendered where possible

### NFR3: Accessibility
- WCAG 2.1 AA compliance (inherited from docs-please)

## Content Structure

```
content/
├── index.md                      # Landing page
└── docs/
    ├── .navigation.yml           # Top-level navigation
    ├── 1.getting-started/
    │   ├── .navigation.yml
    │   ├── 1.introduction.md
    │   ├── 2.installation.md
    │   └── 3.quick-start.md
    ├── 2.guides/
    │   ├── .navigation.yml
    │   ├── 1.claude-code-hooks.md
    │   ├── 2.auto-formatting.md
    │   ├── 3.lsp-diagnostics.md
    │   └── 4.mcp-server.md
    ├── 3.configuration/
    │   ├── .navigation.yml
    │   ├── 1.overview.md
    │   ├── 2.formatter-config.md
    │   └── 3.lsp-config.md
    └── 4.reference/
        ├── .navigation.yml
        ├── 1.cli-commands.md
        ├── 2.supported-languages.md
        └── 3.api.md
```

## Technical Approach

### Dependencies
- docs-please (from npm registry)
- @tailwindcss/vite
- nuxt 4.x

### File Structure (apps/docs/)
```
apps/docs/
├── .gitignore
├── app/
│   ├── app.config.ts     # Site configuration
│   └── app.vue           # (optional override)
├── content/              # Markdown documentation
├── nuxt.config.ts        # Nuxt configuration
├── package.json          # Dependencies
├── public/               # Static assets
├── tsconfig.json         # TypeScript config
└── wrangler.jsonc        # Cloudflare config
```

## Acceptance Criteria

1. **Build Success**: `turbo build` completes without errors
2. **Development Mode**: `bun run dev` starts development server at apps/docs
3. **Content Renders**: All markdown pages render correctly
4. **Navigation Works**: Sidebar navigation and search function properly
5. **Deployment Ready**: wrangler.jsonc configured for Cloudflare Pages

## Clarified Decisions

1. **Dependency**: docs-please from npm registry (simpler setup, versioned updates)
2. **Deployment URL**: code-please.pages.dev (Cloudflare Pages default domain)
3. **Branding**: Default docs-please branding with just title/description changes

## References

- [pleaseai/docs repository](https://github.com/pleaseai/docs)
- [docs-please demo](https://docs-please.pages.dev)
- [Nuxt Content documentation](https://content.nuxt.com)
