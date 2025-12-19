---
name: ast-grep
description: Guide for writing ast-grep rules to perform structural code search and analysis. Use when users need to search codebases using Abstract Syntax Tree (AST) patterns, find specific code structures, or perform complex code queries that go beyond simple text search. This skill should be used when users ask to search for code patterns, find specific language constructs, or locate code with particular structural characteristics.
---

# ast-grep Code Search

> Guide for writing ast-grep rules to perform structural code search and analysis

## Overview

This skill helps translate natural language queries into ast-grep rules for structural code search. ast-grep uses Abstract Syntax Tree (AST) patterns to match code based on its structure rather than just text, enabling powerful and precise code search across large codebases.

## When to Use This Skill

Use this skill when users:
- Need to search for code patterns using structural matching (e.g., "find all async functions that don't have error handling")
- Want to locate specific language constructs (e.g., "find all function calls with specific parameters")
- Request searches that require understanding code structure rather than just text
- Ask to search for code with particular AST characteristics
- Need to perform complex code queries that traditional text search cannot handle

## General Workflow

Follow this process to help users write effective ast-grep rules:

### Step 1: Understand the Query

Clearly understand what the user wants to find. Ask clarifying questions if needed:
- What specific code pattern or structure are they looking for?
- Which programming language?
- Are there specific edge cases or variations to consider?
- What should be included or excluded from matches?

### Step 2: Create Example Code

Write a simple code snippet that represents what the user wants to match. Save this to a temporary file for testing.

**Example:**
If searching for "async functions that use await", create a test file:

```javascript
// test_example.js
async function example() {
  const result = await fetchData()
  return result
}
```

### Step 3: Write the ast-grep Rule

Translate the pattern into an ast-grep rule. Start simple and add complexity as needed.

**Key principles:**
- Always use `stopBy: end` for relational rules (`inside`, `has`) to ensure search goes to the end of the direction
- Use `pattern` for simple structures
- Use `kind` with `has`/`inside` for complex structures
- Break complex queries into smaller sub-rules using `all`, `any`, or `not`

**Example rule file (test_rule.yml):**

```yaml
id: async-with-await
language: javascript
rule:
  kind: function_declaration
  has:
    pattern: await $EXPR
    stopBy: end
```

See `references/rule_reference.md` for comprehensive rule documentation.

### Step 4: Test the Rule

Use ast-grep CLI to verify the rule matches the example code.

**Option A: Test with inline rules (for quick iterations)**

```bash
echo "async function test() { await fetch(); }" | ast-grep scan --inline-rules "id: test
language: javascript
rule:
  kind: function_declaration
  has:
    pattern: await \$EXPR
    stopBy: end" --stdin
```

**Option B: Test with rule files (recommended for complex rules)**

```bash
ast-grep scan --rule test_rule.yml test_example.js
```

**Debugging if no matches:**
1. Simplify the rule (remove sub-rules)
2. Add `stopBy: end` to relational rules if not present
3. Use `--debug-query` to understand the AST structure
4. Check if `kind` values are correct for the language

### Step 5: Search the Codebase

Once the rule matches the example code correctly, search the actual codebase:

**For simple pattern searches:**

```bash
ast-grep run --pattern 'console.log($ARG)' --lang javascript /path/to/project
```

**For complex rule-based searches:**

```bash
ast-grep scan --rule my_rule.yml /path/to/project
```

## ast-grep CLI Commands

### Inspect Code Structure (--debug-query)

Dump the AST structure to understand how code is parsed:

```bash
ast-grep run --pattern 'async function example() { await fetch(); }' \
  --lang javascript \
  --debug-query=cst
```

**Available formats:**
- `cst`: Concrete Syntax Tree (shows all nodes including punctuation)
- `ast`: Abstract Syntax Tree (shows only named nodes)
- `pattern`: Shows how ast-grep interprets your pattern

### Test Rules (scan with --stdin)

Test a rule against code snippet without creating files:

```bash
echo "const x = await fetch();" | ast-grep scan --inline-rules "id: test
language: javascript
rule:
  pattern: await \$EXPR" --stdin
```

### Search with Patterns (run)

Simple pattern-based search for single AST node matches:

```bash
# Basic pattern search
ast-grep run --pattern 'console.log($ARG)' --lang javascript .

# JSON output for programmatic use
ast-grep run --pattern 'function $NAME($$$)' --lang javascript --json .
```

### Search with Rules (scan)

YAML rule-based search for complex structural queries:

```bash
# With rule file
ast-grep scan --rule my_rule.yml /path/to/project

# With inline rules
ast-grep scan --inline-rules "id: find-async
language: javascript
rule:
  kind: function_declaration" .
```

## Best Practices

### Always Use stopBy: end

For relational rules (`inside`, `has`), always include `stopBy: end`:

```yaml
has:
  pattern: await $EXPR
  stopBy: end
```

This ensures the search traverses the entire subtree rather than stopping at the first non-matching node.

### Start Simple, Then Add Complexity

1. Try a `pattern` first
2. If that doesn't work, try `kind` to match the node type
3. Add relational rules (`has`, `inside`) as needed
4. Combine with composite rules (`all`, `any`, `not`) for complex logic

### Use the Right Rule Type

- **Pattern**: For simple, direct code matching (e.g., `console.log($ARG)`)
- **Kind + Relational**: For complex structures (e.g., "function containing await")
- **Composite**: For logical combinations (e.g., "function with await but not in try-catch")

### Debug with AST Inspection

When rules don't match:
1. Use `--debug-query=cst` to see the actual AST structure
2. Check if metavariables are being detected correctly
3. Verify the node `kind` matches what you expect
4. Ensure relational rules are searching in the right direction

### Escaping in Inline Rules

When using `--inline-rules`, escape metavariables in shell commands:
- Use `\$VAR` instead of `$VAR` (shell interprets `$` as variable)
- Or use single quotes: `'$VAR'` works in most shells

## Common Use Cases

### Find Functions with Specific Content

Find async functions that use await:

```bash
ast-grep scan --inline-rules "id: async-await
language: javascript
rule:
  all:
    - kind: function_declaration
    - has:
        pattern: await \$EXPR
        stopBy: end" /path/to/project
```

### Find Code Inside Specific Contexts

Find console.log inside class methods:

```bash
ast-grep scan --inline-rules "id: console-in-class
language: javascript
rule:
  pattern: console.log(\$\$\$)
  inside:
    kind: method_definition
    stopBy: end" /path/to/project
```

### Find Code Missing Expected Patterns

Find async functions without try-catch:

```bash
ast-grep scan --inline-rules "id: async-no-trycatch
language: javascript
rule:
  all:
    - kind: function_declaration
    - has:
        pattern: await \$EXPR
        stopBy: end
    - not:
        has:
          pattern: try { \$\$\$ } catch (\$E) { \$\$\$ }
          stopBy: end" /path/to/project
```

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
