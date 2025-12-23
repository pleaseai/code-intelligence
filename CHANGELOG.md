# Changelog

## [0.1.15](https://github.com/chatbot-pf/code-please/compare/code-please-v0.1.14...code-please-v0.1.15) (2025-12-23)


### Features

* **librarian:** add DeepWiki MCP integration for documentation lookup ([#70](https://github.com/chatbot-pf/code-please/issues/70)) ([e5488e1](https://github.com/chatbot-pf/code-please/commit/e5488e1af3849991d22ef26751500b786f889a1b))


### Bug Fixes

* **hooks:** use versioned bunx to avoid cache issues ([#67](https://github.com/chatbot-pf/code-please/issues/67)) ([36abb66](https://github.com/chatbot-pf/code-please/commit/36abb6658ef1487b0a0a9a2f3ffac193b7aca382))

## [0.1.14](https://github.com/chatbot-pf/code-please/compare/code-please-v0.1.13...code-please-v0.1.14) (2025-12-23)


### Features

* **plugins:** add reflexion plugin for self-refinement ([#65](https://github.com/chatbot-pf/code-please/issues/65)) ([b0ebea5](https://github.com/chatbot-pf/code-please/commit/b0ebea5b2e0edf97ee35bb66e340272892330694))

## [0.1.13](https://github.com/chatbot-pf/code-please/compare/code-please-v0.1.12...code-please-v0.1.13) (2025-12-23)


### Bug Fixes

* **deps:** add zod dependency to format package ([#61](https://github.com/chatbot-pf/code-please/issues/61)) ([a7ab870](https://github.com/chatbot-pf/code-please/commit/a7ab870cd37d665ba1a7c1a50c250fe454bd516c))

## [0.1.12](https://github.com/chatbot-pf/code-please/compare/code-please-v0.1.11...code-please-v0.1.12) (2025-12-23)


### Features

* add ast-grep SessionStart hook and setup command ([#58](https://github.com/chatbot-pf/code-please/issues/58)) ([b2d2910](https://github.com/chatbot-pf/code-please/commit/b2d291047dd105091f6340104bcb067c7a307400))
* add PostToolUse hooks for auto-format and LSP diagnostics ([#48](https://github.com/chatbot-pf/code-please/issues/48)) ([c78da98](https://github.com/chatbot-pf/code-please/commit/c78da98f7e299285a22f6e24c2a04e9d12144215))
* **agents:** add code-explorer and code-architect agents ([#60](https://github.com/chatbot-pf/code-please/issues/60)) ([2851b5a](https://github.com/chatbot-pf/code-please/commit/2851b5af51e936969694efddb6a7f91c3abe94f1))
* **docs:** add documentation site at apps/docs ([#54](https://github.com/chatbot-pf/code-please/issues/54)) ([ad05127](https://github.com/chatbot-pf/code-please/commit/ad051278d3294e0e291346eafe269a0741f4ea55))
* **lsp:** add 20 additional LSP servers from OpenCode reference ([#51](https://github.com/chatbot-pf/code-please/issues/51)) ([bd66e30](https://github.com/chatbot-pf/code-please/commit/bd66e305f23ad347e5e3133a50915f846b254a6e))
* **lsp:** add Claude Code LSP plugins with multi-language server support ([#52](https://github.com/chatbot-pf/code-please/issues/52)) ([06366c2](https://github.com/chatbot-pf/code-please/commit/06366c21795934efa371ef35cb24df5a4e3e3726))


### Bug Fixes

* **docs:** resolve bun build issues and update component syntax ([#57](https://github.com/chatbot-pf/code-please/issues/57)) ([204ef32](https://github.com/chatbot-pf/code-please/commit/204ef32993dd0d532b7fb07a0c249b6c37329f66))
* **docs:** use nodejs_compat_v2 for Cloudflare Pages ([#56](https://github.com/chatbot-pf/code-please/issues/56)) ([1703e51](https://github.com/chatbot-pf/code-please/commit/1703e5104b10c02b62ece72c1d1813fae2e6e33a))

## [0.1.11](https://github.com/chatbot-pf/code-please/compare/code-please-v0.1.10...code-please-v0.1.11) (2025-12-19)


### Bug Fixes

* **ci:** disable npm provenance for private repository ([#46](https://github.com/chatbot-pf/code-please/issues/46)) ([ad277ab](https://github.com/chatbot-pf/code-please/commit/ad277abbe145393febc2ac9fa1c907675a258104))

## [0.1.10](https://github.com/chatbot-pf/code-please/compare/code-please-v0.1.9...code-please-v0.1.10) (2025-12-19)


### Bug Fixes

* **ci:** upgrade to Node.js 24 for npm trusted publishing ([#44](https://github.com/chatbot-pf/code-please/issues/44)) ([0de05cf](https://github.com/chatbot-pf/code-please/commit/0de05cfe4d47e788f35c1262654590ff605546be))

## [0.1.9](https://github.com/chatbot-pf/code-please/compare/code-please-v0.1.8...code-please-v0.1.9) (2025-12-19)


### Bug Fixes

* **ci:** use actions/cache for GitHub-hosted runners ([#42](https://github.com/chatbot-pf/code-please/issues/42)) ([041da12](https://github.com/chatbot-pf/code-please/commit/041da12844457d42c41e7334df1636b8ac2e7390))

## [0.1.8](https://github.com/chatbot-pf/code-please/compare/code-please-v0.1.7...code-please-v0.1.8) (2025-12-19)


### Features

* **lsp:** add ESLint language server support ([#39](https://github.com/chatbot-pf/code-please/issues/39)) ([285a0d9](https://github.com/chatbot-pf/code-please/commit/285a0d9dca8eebd5479a7675188fbc6348f483cb)), closes [#38](https://github.com/chatbot-pf/code-please/issues/38)


### Bug Fixes

* **ci:** use GitHub-hosted runners for npm publish workflow ([#41](https://github.com/chatbot-pf/code-please/issues/41)) ([17db1f4](https://github.com/chatbot-pf/code-please/commit/17db1f4f17bc89c56eafbfd9cff939d07b3c02b8))

## [0.1.7](https://github.com/chatbot-pf/code-please/compare/code-please-v0.1.6...code-please-v0.1.7) (2025-12-19)


### Features

* **agents:** add librarian agent for codebase exploration ([#32](https://github.com/chatbot-pf/code-please/issues/32)) ([9d74066](https://github.com/chatbot-pf/code-please/commit/9d740665164876702a5e0c619216cae2354e8d5a))
* **dora:** add ast-grep provider for AST-aware code search ([#35](https://github.com/chatbot-pf/code-please/issues/35)) ([74117d3](https://github.com/chatbot-pf/code-please/commit/74117d32136181ecb03ab1e7a054524c12101c9e))
* **logger:** add shared logger package with pino integration ([#37](https://github.com/chatbot-pf/code-please/issues/37)) ([c208f35](https://github.com/chatbot-pf/code-please/commit/c208f352d59a0c94d9664e29776334ac015e94ad))

## [0.1.6](https://github.com/chatbot-pf/code-please/compare/code-please-v0.1.5...code-please-v0.1.6) (2025-12-18)


### Features

* **config:** implement unified configuration system ([#26](https://github.com/chatbot-pf/code-please/issues/26)) ([1fe9cab](https://github.com/chatbot-pf/code-please/commit/1fe9cabcc25de195bbe13d947c618480f7eee436))
* **dora:** add FileProvider with Serena-inspired file tools ([#27](https://github.com/chatbot-pf/code-please/issues/27)) ([7938021](https://github.com/chatbot-pf/code-please/commit/793802161d47fdacfe50e3ea23340d230004773a))
* **lsp:** add Prisma Language Server support ([#23](https://github.com/chatbot-pf/code-please/issues/23)) ([9a691e1](https://github.com/chatbot-pf/code-please/commit/9a691e1955ca84665ab13f25a1942ee969c766e7))

## [0.1.5](https://github.com/chatbot-pf/code-please/compare/code-please-v0.1.4...code-please-v0.1.5) (2025-12-18)


### Features

* **lsp:** add Rename Symbol support ([#19](https://github.com/chatbot-pf/code-please/issues/19)) ([12ec597](https://github.com/chatbot-pf/code-please/commit/12ec59785b6eefdc8cdd56e18c21fdf2466e8a7d))

## [0.1.4](https://github.com/chatbot-pf/code-please/compare/code-please-v0.1.3...code-please-v0.1.4) (2025-12-18)


### Features

* **lsp:** add completion method to LSPManager ([#16](https://github.com/chatbot-pf/code-please/issues/16)) ([f9423ec](https://github.com/chatbot-pf/code-please/commit/f9423ecec193f49bf5ee49b7f071878d46b8239c))
* **lsp:** add definition and references methods to LSPManager ([#14](https://github.com/chatbot-pf/code-please/issues/14)) ([45e82f3](https://github.com/chatbot-pf/code-please/commit/45e82f3068b5c26c5a874aa521d4f2dfa02f13ce)), closes [#13](https://github.com/chatbot-pf/code-please/issues/13)

## [0.1.3](https://github.com/chatbot-pf/code-please/compare/code-please-v0.1.2...code-please-v0.1.3) (2025-12-17)


### Features

* add @pleaseai/code package with LSP hooks and npm distribution ([8361095](https://github.com/chatbot-pf/code-please/commit/83610954436d71d897c3beb4162946c2eb9efb57))
* **lsp:** add Dart Language Server support ([#9](https://github.com/chatbot-pf/code-please/issues/9)) ([c0a42d5](https://github.com/chatbot-pf/code-please/commit/c0a42d52f232078e717b03a67f494a81d93bb092))
* **lsp:** add Kotlin Language Server support ([#7](https://github.com/chatbot-pf/code-please/issues/7)) ([f71d8dd](https://github.com/chatbot-pf/code-please/commit/f71d8dd83bdee90cebcc147064b9d5bd77a71497))
* **lsp:** add oxlint LSP server support ([#4](https://github.com/chatbot-pf/code-please/issues/4)) ([b233bb3](https://github.com/chatbot-pf/code-please/commit/b233bb36ea95b2ca44d0878629ad5d148da04481))
* **lsp:** add Vue Language Server support ([#12](https://github.com/chatbot-pf/code-please/issues/12)) ([8e820e7](https://github.com/chatbot-pf/code-please/commit/8e820e7371c87ed95b6079081783c870411ba925))


### Bug Fixes

* correct .mcp.json structure with mcpServers wrapper ([cf9c1ac](https://github.com/chatbot-pf/code-please/commit/cf9c1ac99d195cf4b762bea7e6ea5bfdd9653f2c))

## [0.1.2](https://github.com/chatbot-pf/code-please/compare/v0.1.1...v0.1.2) (2025-12-17)


### Bug Fixes

* correct .mcp.json structure with mcpServers wrapper ([cf9c1ac](https://github.com/chatbot-pf/code-please/commit/cf9c1ac99d195cf4b762bea7e6ea5bfdd9653f2c))

## [0.1.1](https://github.com/chatbot-pf/code-please/compare/v0.1.0...v0.1.1) (2025-12-17)


### Features

* add @pleaseai/code package with LSP hooks and npm distribution ([8361095](https://github.com/chatbot-pf/code-please/commit/83610954436d71d897c3beb4162946c2eb9efb57))
