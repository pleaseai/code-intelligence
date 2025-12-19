# ast-grep Pattern Writing Guide

> AST-aware structural code search and transformation using pattern matching

## When to Use This Skill

This skill is activated when you need to:

- Write ast-grep patterns for structural code search
- Create YAML rules for complex queries
- Debug patterns that aren't matching
- Transform code using AST-aware rewriting
- User mentions: `ast-grep pattern`, `AST search`, `structural search`, `code pattern`, `meta-variables`

## What is ast-grep?

**ast-grep** performs **syntax-aware pattern matching** using Abstract Syntax Trees (AST). Unlike text-based search (grep/ripgrep), it understands code structure.

**Key differences from text search:**
- Matches code semantics, not text
- Ignores whitespace and formatting
- Can match across multiple lines
- Understands language syntax

## Meta-variables

Meta-variables capture parts of the AST:

| Syntax | Meaning | Example |
|--------|---------|---------|
| `$VAR` | Single named node (identifier, expression) | `console.log($MSG)` |
| `$$VAR` | Unnamed node (operators, punctuation) | `$A $$OP $B` |
| `$$$MULTI` | Zero or more nodes (non-greedy) | `function $NAME($$$ARGS)` |
| `_` | Wildcard (anonymous, non-capturing) | `if ($_) { $$$ }` |

**Naming rules:** Use UPPERCASE letters, numbers, underscores only.

## Pattern Syntax

### Simple Patterns

```bash
# Find console.log calls
ast-grep run --pattern 'console.log($MSG)' --lang javascript

# Find function definitions
ast-grep run --pattern 'function $NAME($$$) { $$$ }' --lang javascript

# Find Python class definitions
ast-grep run --pattern 'class $NAME' --lang python
```

### Pattern Rules

1. **Patterns must be valid code** - they're parsed as AST
2. **No trailing colons in Python** - `def $NAME($$$)` not `def $NAME($$$):`
3. **Include body for functions** - `function $NAME($$$) { $$$ }` not `function $NAME`

## YAML Rule Syntax

For complex queries, use YAML rules with operators.

### Rule Structure

```yaml
id: rule-name
language: javascript
rule:
  pattern: console.log($MSG)
message: Explanation of what was found
```

### Atomic Rules

| Rule | Purpose | Example |
|------|---------|---------|
| `pattern` | Match AST pattern | `pattern: console.log($MSG)` |
| `kind` | Match node type | `kind: function_declaration` |
| `regex` | Match text with regex | `regex: "^test_"` |
| `nthChild` | Match by position | `nthChild: 1` |

### Relational Rules

| Rule | Purpose | Example |
|------|---------|---------|
| `inside` | Node is inside another | `inside: { kind: class_body }` |
| `has` | Node contains another | `has: { pattern: await $X }` |
| `precedes` | Node comes before | `precedes: { kind: return_statement }` |
| `follows` | Node comes after | `follows: { kind: import_statement }` |

**Important:** Always use `stopBy: end` for relational rules to search the entire subtree.

### Composite Rules

| Rule | Purpose | Example |
|------|---------|---------|
| `all` | AND - all must match | `all: [rule1, rule2]` |
| `any` | OR - any must match | `any: [rule1, rule2]` |
| `not` | Negate a rule | `not: { pattern: ... }` |
| `matches` | Reference utility rule | `matches: utility-rule-id` |

## Common Patterns by Language

### JavaScript/TypeScript

```yaml
# Find async functions without try-catch
id: async-without-try
language: javascript
rule:
  kind: function_declaration
  has:
    pattern: async
  not:
    has:
      kind: try_statement
      stopBy: end
```

```yaml
# Find React useState in component
id: usestate-in-component
language: tsx
rule:
  pattern: useState($INIT)
  inside:
    kind: function_declaration
    stopBy: end
```

```yaml
# Find console.log in production code
id: no-console-log
language: javascript
rule:
  pattern: console.log($$$)
  not:
    inside:
      regex: test|spec|__tests__
      kind: string
```

### Python

```yaml
# Find functions without docstrings
id: missing-docstring
language: python
rule:
  kind: function_definition
  not:
    has:
      kind: expression_statement
      has:
        kind: string
      nthChild: 1
      stopBy: end
```

```yaml
# Find bare except clauses
id: bare-except
language: python
rule:
  kind: except_clause
  not:
    has:
      kind: identifier
```

### Go

```yaml
# Find error not checked
id: unchecked-error
language: go
rule:
  pattern: $_, $ERR := $CALL
  not:
    precedes:
      pattern: if $ERR != nil
      stopBy: neighbor
```

## Debugging Patterns

### Check AST structure

```bash
# Dump CST (Concrete Syntax Tree)
ast-grep run --pattern '$ROOT' --debug-query=cst --lang javascript file.js

# Dump AST
ast-grep run --pattern '$ROOT' --debug-query=ast --lang javascript file.js

# Show pattern parse result
ast-grep run --pattern 'console.log($X)' --debug-query=pattern --lang javascript file.js
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| `def $NAME():` | Trailing colon in Python | `def $NAME($$$)` |
| `function $NAME` | Incomplete pattern | `function $NAME($$$) { $$$ }` |
| `$a` | Lowercase meta-var | `$A` (uppercase) |
| Missing `stopBy: end` | Only searches immediate children | Add `stopBy: end` to relational rules |

## Workflow

1. **Understand the query** - What code structure are you looking for?
2. **Create example code** - Write sample code that matches what you want to find
3. **Write the pattern/rule** - Start simple, add complexity as needed
4. **Test the pattern** - Use `--debug-query` to verify AST structure
5. **Run the search** - Apply to codebase

## Supported Languages (25)

bash, c, cpp, csharp, css, elixir, go, haskell, html, java, javascript, json, kotlin, lua, nix, php, python, ruby, rust, scala, solidity, swift, typescript, tsx, yaml

## References

- [ast-grep Documentation](https://ast-grep.github.io/)
- [Pattern Syntax](https://ast-grep.github.io/guide/pattern-syntax.html)
- [Rule Configuration](https://ast-grep.github.io/reference/rule.html)
- [Playground](https://ast-grep.github.io/playground.html)

See `references/rule_reference.md` for detailed rule syntax documentation.

## Related Agent

For using ast-grep with dora MCP tools, see the `code-please:ast-grep` agent definition.
