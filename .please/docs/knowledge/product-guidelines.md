# Product Guidelines

## Code Style

- **Language**: TypeScript (strict mode with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`)
- **Runtime**: Bun (test runner, package manager, script execution)
- **Linting**: @antfu/eslint-config (lib type, no JSX)
- **Formatting**: Prettier (via Bun)
- **Module system**: ESM only (`verbatimModuleSyntax`)

## Naming Conventions

- Files: `kebab-case.ts` (e.g., `language-server.ts`, `config-loader.ts`)
- Types/Interfaces: `PascalCase` (e.g., `FormatterConfig`, `LspServerDefinition`)
- Functions/Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` for true constants, `camelCase` for derived values
- Package names: `@pleaseai/{name}` scope

## Architecture Principles

1. **Provider pattern** — External integrations (JetBrains, LSP servers) are abstracted behind provider interfaces
2. **Config-driven** — Behavior is controlled via `.please/config.json` or `.please/config.yml`, not hardcoded
3. **Monorepo separation** — Each package has a clear responsibility; cross-package imports use workspace dependencies
4. **CLI-first** — All functionality is accessible via CLI; hook mode is a thin wrapper over CLI commands
5. **Graceful degradation** — Missing LSP servers or formatters should warn, not crash

## Documentation

- README in English (primary) with Korean translation (`README.ko.md`)
- CLAUDE.md maintained for AI coding context
- Inline comments only for non-obvious logic

## Testing

- Test runner: Bun test (`bun test`)
- Test files: co-located in `test/` directories within each package
- Fixtures in `test/fixtures/`
