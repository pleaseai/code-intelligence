# ADR-0001: ast-grep Integration Architecture

## Status

Accepted

## Context

Dora MCP server needs AST-aware code search and transformation capabilities. Unlike text-based search (grep/ripgrep), AST-aware search understands code structure, enabling queries like "find async functions without error handling" or "find React components using a specific hook."

### Requirements
- Support 25+ programming languages
- Pattern-based search with meta-variables (`$VAR`, `$$$`)
- Code transformation/replacement capabilities
- YAML rule file support for complex queries
- Integration with existing dora provider architecture

### Reference Implementation
- `ref/oh-my-opencode/src/tools/ast-grep/` - MCP tools implementation
- https://github.com/ast-grep/claude-skill - Official Claude skill for rule writing

## Decision

We will implement **both MCP Tools and an Agent/Skill** for ast-grep integration:

### 1. MCP Tools (Provider)

Create a new `ast-grep` provider in `packages/dora/src/providers/ast-grep/` with:

| Tool | Purpose |
|------|---------|
| `ast_grep_search` | Pattern-based code search across files |
| `ast_grep_replace` | AST-aware code transformation (dry-run by default) |

**Features:**
- Both inline patterns (`console.log($MSG)`) and YAML rule files (`--rule file.yaml`)
- CLI binary auto-download from GitHub releases (following Dart LSP pattern)
- NAPI bindings (`@ast-grep/napi`) for faster in-memory transforms (5 languages)
- Result truncation (max matches, output size, timeout)
- Helpful hints for common pattern mistakes

### 2. Agent/Skill

Create `agents/ast-grep.md` following the existing `librarian.md` pattern:

- Teaches Claude complex YAML rule writing
- Covers relational rules (`inside`, `has`, `precedes`, `follows`)
- Covers composite rules (`all`, `any`, `not`)
- Reference documentation for ast-grep syntax
- Examples for common use cases

### Architecture

```
packages/dora/
└── src/providers/ast-grep/
    ├── index.ts        # AstGrepProvider implementation
    ├── cli.ts          # CLI wrapper (runSg function)
    ├── downloader.ts   # Binary auto-download
    ├── napi.ts         # NAPI bindings for in-memory transforms
    ├── constants.ts    # Languages, defaults, platform config
    ├── types.ts        # TypeScript interfaces
    └── utils.ts        # Result formatting

agents/
└── ast-grep.md         # Rule writing skill/agent
```

### Binary Management

Follow the Dart LSP pattern:
1. Check system PATH first (`Bun.which('sg')`)
2. If not found, download to `~/.cache/dora/ast-grep/`
3. Platform-specific binaries (win-x64, linux-x64, linux-arm64, osx-x64, osx-arm64)
4. Version tracking via marker file

## Consequences

### Positive
- **Comprehensive**: Both programmatic tools (MCP) and guidance (skill) for different use cases
- **Consistent**: Follows existing provider and binary download patterns in dora
- **Flexible**: CLI for 25 languages, NAPI for faster in-memory transforms (5 languages)
- **User-friendly**: Auto-download binary, helpful error hints
- **Maintainable**: Modular structure matches reference implementation

### Negative
- **Complexity**: Two integration points (provider + agent) to maintain
- **Dependencies**: NAPI adds `@ast-grep/napi` as optional dependency
- **Binary size**: Auto-downloaded binary adds ~15-20MB to user's cache

### Neutral
- **Platform support**: Same 5 platforms as existing LSP servers
- **Version updates**: Manual version bumps in constants.ts (same as Dart/Kotlin LSP)

## Alternatives Considered

### 1. MCP Tools Only (No Skill)

**Rejected because:**
- Complex YAML rules are hard to write without guidance
- Official ast-grep recommends skill approach for rule development
- Pattern mistakes are common; skill provides best practices

### 2. Skill Only (No MCP Tools)

**Rejected because:**
- Less structured API for programmatic use
- No result formatting, truncation, error handling
- Doesn't leverage dora's provider architecture

### 3. CLI Only (No NAPI)

**Considered but expanded because:**
- NAPI provides significantly faster in-memory transforms
- 5 languages (JS/TS/TSX/CSS/HTML) cover most web development
- Small additional complexity for significant performance gain

### 4. Separate Package (`packages/ast-grep`)

**Rejected because:**
- ast-grep tools are tightly coupled with dora MCP server
- No reuse case outside of dora context
- Provider pattern keeps tools organized within dora

## References

- [ast-grep Documentation](https://ast-grep.github.io/)
- [ast-grep Prompting Guide](https://ast-grep.github.io/advanced/prompting.html)
- [ast-grep Claude Skill](https://github.com/ast-grep/claude-skill)
- [oh-my-opencode ast-grep implementation](ref/oh-my-opencode/src/tools/ast-grep/)
