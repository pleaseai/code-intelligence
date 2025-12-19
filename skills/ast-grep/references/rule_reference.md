# ast-grep Rule Reference

> Complete reference for ast-grep rule syntax and operators

## Rule Object Structure

Every field within an ast-grep Rule Object is optional, but at least one **positive** key (e.g., `kind`, `pattern`) must be present.

### Properties Table

| Property | Type | Description |
|----------|------|-------------|
| `pattern` | string | AST pattern to match |
| `kind` | string | Node type to match |
| `regex` | string | Regular expression for text matching |
| `nthChild` | number or object | Match by position in parent |
| `range` | object | Match by source position |
| `inside` | Rule | Match if inside another node |
| `has` | Rule | Match if contains another node |
| `precedes` | Rule | Match if before another node |
| `follows` | Rule | Match if after another node |
| `all` | Rule[] | All rules must match (AND) |
| `any` | Rule[] | Any rule must match (OR) |
| `not` | Rule | Negate a rule |
| `matches` | string | Reference a utility rule by ID |
| `stopBy` | string | Control traversal depth |

## Atomic Rules

### pattern

Matches nodes using AST pattern syntax with meta-variables.

```yaml
rule:
  pattern: console.log($MSG)
```

**Meta-variable types:**
- `$VAR` - Single named node
- `$$VAR` - Single unnamed node (operators)
- `$$$VAR` - Multiple nodes (variadic)
- `$_` - Anonymous wildcard

**Important:** Meta-variables must be the only text within an AST node to function correctly.

### kind

Matches nodes by their AST node type.

```yaml
rule:
  kind: function_declaration
```

Common node types by language:

| Language | Function | Class | Variable |
|----------|----------|-------|----------|
| JavaScript | `function_declaration` | `class_declaration` | `variable_declaration` |
| TypeScript | `function_declaration` | `class_declaration` | `lexical_declaration` |
| Python | `function_definition` | `class_definition` | `assignment` |
| Go | `function_declaration` | `type_declaration` | `short_var_declaration` |
| Rust | `function_item` | `struct_item` | `let_declaration` |

### regex

Matches the text content of a node against a regular expression.

```yaml
rule:
  kind: identifier
  regex: ^test_
```

### nthChild

Matches nodes by their position within the parent.

```yaml
# Match first child
rule:
  nthChild: 1
```

```yaml
# Match with options
rule:
  nthChild:
    position: 2
    ofRule:
      kind: argument
```

### range

Matches nodes by source position.

```yaml
rule:
  range:
    start: {line: 10, column: 0}
    end: {line: 20, column: 0}
```

## Relational Rules

### inside

Matches if the node is inside another node matching the rule.

```yaml
rule:
  pattern: console.log($MSG)
  inside:
    kind: class_body
    stopBy: end # Always include this
```

### has

Matches if the node contains another node matching the rule.

```yaml
rule:
  kind: function_declaration
  has:
    pattern: await $EXPR
    stopBy: end # Always include this
```

### precedes

Matches if the node comes before another node matching the rule.

```yaml
rule:
  pattern: $X = null
  precedes:
    pattern: if ($X == null)
    stopBy: neighbor # Only check immediate siblings
```

### follows

Matches if the node comes after another node matching the rule.

```yaml
rule:
  kind: return_statement
  follows:
    kind: if_statement
    stopBy: neighbor
```

### stopBy Options

Controls how far relational rules traverse:

| Value | Description |
|-------|-------------|
| `end` | Search entire subtree (recommended default) |
| `neighbor` | Only check immediate siblings |
| `{ kind: "node_type" }` | Stop at specific node type |
| `{ pattern: "..." }` | Stop at pattern match |

**Critical:** Without `stopBy: end`, relational rules only search immediate children.

## Composite Rules

### all

All sub-rules must match (logical AND).

```yaml
rule:
  all:
    - kind: function_declaration
    - has:
        pattern: async
    - not:
        has:
          kind: try_statement
          stopBy: end
```

### any

Any sub-rule must match (logical OR).

```yaml
rule:
  any:
    - pattern: console.log($X)
    - pattern: console.warn($X)
    - pattern: console.error($X)
```

### not

Negates a rule.

```yaml
rule:
  kind: function_declaration
  not:
    has:
      kind: return_statement
      stopBy: end
```

### matches

References a utility rule defined in the same file.

```yaml
utils:
  has-error-handling:
    has:
      kind: try_statement
      stopBy: end

rules:
  - id: async-without-error-handling
    language: javascript
    rule:
      kind: function_declaration
      has:
        pattern: async
      not:
        matches: has-error-handling
```

## Fix and Rewrite

### Basic Rewrite

```yaml
id: replace-console-log
language: javascript
rule:
  pattern: console.log($MSG)
fix: logger.info($MSG)
```

### Conditional Fix

```yaml
id: add-type-annotation
language: typescript
rule:
  pattern: const $NAME = $VALUE
  not:
    pattern: 'const $NAME: $TYPE = $VALUE'
fix: 'const $NAME: unknown = $VALUE'
```

### Multi-line Fix

```yaml
fix: |
  try {
    $BODY
  } catch (error) {
    console.error(error)
  }
```

## Complete Examples

### Find Async Functions Without Error Handling

```yaml
id: async-no-try-catch
language: typescript
severity: warning
rule:
  all:
    - kind: function_declaration
    - has:
        pattern: async
    - not:
        has:
          kind: try_statement
          stopBy: end
message: Async function without try-catch error handling
```

### Find Unused Variables

```yaml
id: unused-variable
language: javascript
rule:
  kind: variable_declarator
  pattern: $NAME = $VALUE
  not:
    precedes:
      pattern: $NAME
      stopBy: end
message: Variable '$NAME' is declared but never used
```

### Find React Hooks Outside Components

```yaml
id: hooks-outside-component
language: tsx
rule:
  any:
    - pattern: useState($$$)
    - pattern: useEffect($$$)
    - pattern: useMemo($$$)
  not:
    inside:
      any:
        - kind: function_declaration
        - kind: arrow_function
      stopBy: end
message: React hooks must be called inside function components
```

### Find SQL Injection Risks

```yaml
id: sql-injection-risk
language: javascript
rule:
  pattern: $DB.query(`$$$${$VAR}$$$`)
message: Potential SQL injection - use parameterized queries
fix: $DB.query($SQL, [$VAR])
```

## Troubleshooting

### Pattern Not Matching

1. **Check AST structure:**
   ```bash
   ast-grep run --pattern '$ROOT' --debug-query=cst --lang javascript file.js
   ```

2. **Verify node type:**
   ```bash
   ast-grep run --pattern '$ROOT' --debug-query=ast --lang javascript file.js
   ```

3. **Test pattern parsing:**
   ```bash
   ast-grep run --pattern 'your_pattern' --debug-query=pattern --lang javascript file.js
   ```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| No matches | Incomplete pattern | Ensure pattern is complete AST node |
| No matches | Wrong node type | Use `--debug-query=cst` to check actual types |
| Partial matches | Missing `stopBy: end` | Add `stopBy: end` to relational rules |
| Too many matches | Pattern too broad | Add constraints with `kind` or `inside` |

### Debugging Checklist

- [ ] Pattern is valid code that parses correctly
- [ ] Meta-variables use UPPERCASE names
- [ ] Relational rules have `stopBy: end`
- [ ] Node types match the target language
- [ ] Pattern captures complete AST nodes
