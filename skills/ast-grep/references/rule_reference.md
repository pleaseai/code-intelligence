# ast-grep Rule Reference

This document provides comprehensive documentation for ast-grep rule syntax, covering all rule types and metavariables.

## Introduction to ast-grep Rules

ast-grep rules are declarative specifications for matching and filtering Abstract Syntax Tree (AST) nodes. They enable structural code search and analysis by defining conditions an AST node must meet to be matched.

### Rule Categories

ast-grep rules are categorized into three types:

- **Atomic Rules**: Match individual AST nodes based on intrinsic properties like code patterns (`pattern`), node type (`kind`), or text content (`regex`).
- **Relational Rules**: Define conditions based on a target node's position or relationship to other nodes (e.g., `inside`, `has`, `precedes`, `follows`).
- **Composite Rules**: Combine other rules using logical operations (AND, OR, NOT) to form complex matching criteria (e.g., `all`, `any`, `not`, `matches`).

## Rule Object Structure

The ast-grep rule object is the core configuration unit defining how ast-grep identifies and filters AST nodes. It's typically written in YAML format.

### General Structure

Every field within an ast-grep Rule Object is optional, but at least one "positive" key (e.g., `kind`, `pattern`) must be present.

A node matches a rule if it satisfies all fields defined within that rule object, implying an implicit logical AND operation.

For rules using metavariables that depend on prior matching, explicit `all` composite rules are recommended to guarantee execution order.

### Rule Object Properties

| Property | Type | Category | Purpose |
|----------|------|----------|---------|
| `pattern` | String or Object | Atomic | Matches AST node by code pattern |
| `kind` | String | Atomic | Matches AST node by its kind name |
| `regex` | String | Atomic | Matches node's text by Rust regex |
| `nthChild` | number, string, Object | Atomic | Matches nodes by index within parent |
| `range` | RangeObject | Atomic | Matches node by character positions |
| `inside` | Object | Relational | Target node must be inside matching node |
| `has` | Object | Relational | Target node must have matching descendant |
| `precedes` | Object | Relational | Target node must appear before matching node |
| `follows` | Object | Relational | Target node must appear after matching node |
| `all` | Array | Composite | Matches if all sub-rules match |
| `any` | Array | Composite | Matches if any sub-rules match |
| `not` | Object | Composite | Matches if sub-rule does not match |
| `matches` | String | Composite | Matches if predefined utility rule matches |

## Atomic Rules

Atomic rules match individual AST nodes based on their intrinsic properties.

### pattern: String and Object Forms

The `pattern` rule matches a single AST node based on a code pattern.

**String Pattern**: Directly matches using ast-grep's pattern syntax with metavariables.

```yaml
pattern: console.log($ARG)
```

**Object Pattern**: Offers granular control for ambiguous patterns or specific contexts.

```yaml
# Using selector to pinpoint specific part
pattern:
  selector: field_definition
  context: class { $F }
```

```yaml
# Using strictness to modify matching algorithm
pattern:
  context: foo($BAR)
  strictness: relaxed
```

**Strictness options**: `cst`, `smart`, `ast`, `relaxed`, `signature`

### kind: Matching by Node Type

The `kind` rule matches an AST node by its tree-sitter node kind name.

```yaml
kind: call_expression
```

Common node types by language:

| Language | Function | Class | Variable |
|----------|----------|-------|----------|
| JavaScript | `function_declaration` | `class_declaration` | `variable_declaration` |
| TypeScript | `function_declaration` | `class_declaration` | `lexical_declaration` |
| Python | `function_definition` | `class_definition` | `assignment` |
| Go | `function_declaration` | `type_declaration` | `short_var_declaration` |
| Rust | `function_item` | `struct_item` | `let_declaration` |

### regex: Text-Based Node Matching

The `regex` rule matches the entire text content of an AST node using a Rust regular expression.

```yaml
rule:
  kind: identifier
  regex: ^test_
```

**Note**: It's not a "positive" rule, meaning it matches any node whose text satisfies the regex.

### nthChild: Positional Node Matching

The `nthChild` rule finds nodes by their 1-based index within their parent's children list.

**Number form**: Match exact position

```yaml
nthChild: 1
```

**String form**: Match using An+B formula

```yaml
nthChild: 2n+1
```

**Object form**: Granular control

```yaml
nthChild:
  position: 2
  reverse: true
  ofRule:
    kind: argument
```

### range: Position-Based Node Matching

The `range` rule matches an AST node based on its character-based start and end positions.

```yaml
rule:
  range:
    start: {line: 0, column: 0}
    end: {line: 10, column: 0}
```

## Relational Rules

Relational rules filter targets based on their position relative to other AST nodes.

### inside: Matching Within a Parent Node

Requires the target node to be inside another node matching the `inside` sub-rule.

```yaml
rule:
  pattern: console.log($MSG)
  inside:
    kind: class_body
    stopBy: end
```

### has: Matching with a Descendant Node

Requires the target node to have a descendant node matching the `has` sub-rule.

```yaml
rule:
  kind: function_declaration
  has:
    pattern: await $EXPR
    stopBy: end
```

### precedes and follows: Sequential Node Matching

- `precedes`: Target node must appear before a matching node
- `follows`: Target node must appear after a matching node

```yaml
rule:
  pattern: $X = null
  precedes:
    pattern: if ($X == null)
    stopBy: neighbor
```

### stopBy and field Options

**stopBy**: Controls search termination for relational rules.

| Value | Description |
|-------|-------------|
| `neighbor` | Stops when immediate surrounding node doesn't match (default) |
| `end` | Searches to the end of the direction |
| Rule object | Stops when surrounding node matches provided rule |

**field**: Specifies a sub-node within the target that should match. Only for `inside` and `has`.

```yaml
rule:
  kind: binary_expression
  has:
    field: operator
    pattern: $$OP
```

**Best Practice**: When unsure, always use `stopBy: end` to ensure the search goes to the end of the direction.

## Composite Rules

Composite rules combine atomic and relational rules using logical operations.

### all: Conjunction (AND) of Rules

Matches a node only if all sub-rules in the list match. Guarantees order of rule matching.

```yaml
rule:
  all:
    - kind: function_declaration
    - has:
        pattern: await $EXPR
        stopBy: end
    - not:
        has:
          kind: try_statement
          stopBy: end
```

### any: Disjunction (OR) of Rules

Matches a node if any sub-rules in the list match.

```yaml
rule:
  any:
    - pattern: console.log($$$)
    - pattern: console.warn($$$)
    - pattern: console.error($$$)
```

### not: Negation (NOT) of a Rule

Matches a node if the single sub-rule does not match.

```yaml
rule:
  kind: function_declaration
  not:
    has:
      kind: return_statement
      stopBy: end
```

### matches: Rule Reuse and Utility Rules

Takes a rule-id string, matching if the referenced utility rule matches.

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

## Metavariables

Metavariables are placeholders in patterns to match dynamic content in the AST.

### $VAR: Single Named Node Capture

Captures a single named node in the AST.

- **Valid**: `$META`, `$META_VAR`, `$_`
- **Invalid**: `$invalid`, `$123`, `$KEBAB-CASE`
- **Reuse**: `$A == $A` matches `a == a` but not `a == b`

### $$VAR: Single Unnamed Node Capture

Captures a single unnamed node (e.g., operators, punctuation).

```yaml
rule:
  kind: binary_expression
  has:
    field: operator
    pattern: $$OP
```

### $$$MULTI: Multi-Node Capture

Matches zero or more AST nodes (non-greedy).

- `console.log($$$)` matches any number of arguments
- `function $FUNC($$$ARGS) { $$$ }` matches varying parameters/statements

### Non-Capturing Metavariables (_VAR)

Metavariables starting with underscore (`_`) are not captured. They can match different content even if named identically.

- `$_FUNC($_FUNC)` matches `test(a)` and `testFunc(1 + 1)`

### Important Considerations

- **Syntax Matching**: Only exact metavariable syntax is recognized
- **Exclusive Content**: Metavariable text must be the only text within an AST node
- **Non-working examples**: `obj.on$EVENT`, `"Hello $WORLD"`, `$jq`

## Common Patterns

### Find Functions with Specific Content

```yaml
rule:
  kind: function_declaration
  has:
    pattern: await $EXPR
    stopBy: end
```

### Find Code Inside Specific Contexts

```yaml
rule:
  pattern: console.log($$$)
  inside:
    kind: method_definition
    stopBy: end
```

### Combining Multiple Conditions

```yaml
rule:
  all:
    - kind: function_declaration
    - has:
        pattern: await $EXPR
        stopBy: end
    - not:
        has:
          kind: try_statement
          stopBy: end
```

### Matching Multiple Alternatives

```yaml
rule:
  any:
    - pattern: console.log($$$)
    - pattern: console.warn($$$)
    - pattern: console.error($$$)
```

## Troubleshooting Tips

1. **Rule doesn't match**: Use `--debug-query=cst` to see actual AST structure
2. **Relational rule issues**: Ensure `stopBy: end` is set for deep searches
3. **Wrong node kind**: Check the language's tree-sitter grammar for correct kind names
4. **Metavariable not working**: Ensure it's the only content in its AST node
5. **Pattern too complex**: Break it down into simpler sub-rules using `all`
