# Parallel Investigation Process

Special case of parallel execution for debugging multiple unrelated failures that can be investigated without shared state or dependencies.

## When to Use

- 3+ test failures in different domains
- Each failure is independent (different files, subsystems)
- Fixes won't conflict with each other
- You already know what's broken (not exploratory)

## When NOT to Use

| Scenario | Why Not | Alternative |
|----------|---------|-------------|
| Related failures | Fixing one might fix others | Investigate together first |
| Need full context | Understanding requires seeing entire system | Sequential exploration |
| Exploratory debugging | You don't know what's broken yet | Single focused investigation |
| Shared state | Agents would interfere | Sequential execution |

## Full Workflow

### Step 1: Identify Independent Domains

Group failures by what's broken:

```
- File A tests: Tool approval flow
- File B tests: Batch completion behavior
- File C tests: Abort functionality
```

Each domain is independent - fixing tool approval doesn't affect abort tests.

### Step 2: Create Focused Agent Tasks

Each agent gets:

| Element | Description |
|---------|-------------|
| Specific scope | One test file or subsystem |
| Clear goal | Make these tests pass |
| Constraints | Don't change other code |
| Expected output | Summary of what you found and fixed |

### Step 3: Dispatch in Parallel

```typescript
// All three run concurrently
Task("Fix agent-tool-abort.test.ts failures")
Task("Fix batch-completion-behavior.test.ts failures")
Task("Fix tool-approval-race-conditions.test.ts failures")
```

### Step 4: Review and Integrate

When agents return:
1. Read each summary
2. Verify fixes don't conflict
3. Run full test suite
4. Integrate all changes

## Agent Prompt Template

```markdown
Fix the [N] failing tests in [test-file]:

1. "[test name 1]" - [expected vs actual]
2. "[test name 2]" - [expected vs actual]
3. "[test name 3]" - [expected vs actual]

These are [category] issues. Your task:

1. Read the test file and understand what each test verifies
2. Identify root cause - [timing issues/actual bugs/other]?
3. Fix by:
   - [Specific fix approach 1]
   - [Specific fix approach 2]
   - [Specific fix approach 3]

Do NOT [common mistake to avoid].

Return: Summary of what you found and what you fixed.
```

## Example: Real Session

### Scenario

6 test failures across 3 files after major refactoring:

**Failures:**
- `agent-tool-abort.test.ts`: 3 failures (timing issues)
- `batch-completion-behavior.test.ts`: 2 failures (tools not executing)
- `tool-approval-race-conditions.test.ts`: 1 failure (execution count = 0)

### Decision

Independent domains:
- Abort logic separate from batch completion
- Batch completion separate from race conditions
- No shared files being modified

### Agent Prompts

**Agent 1:**
```markdown
Fix the 3 failing tests in src/agents/agent-tool-abort.test.ts:

1. "should abort tool with partial output capture" - expects 'interrupted at' in message
2. "should handle mixed completed and aborted tools" - fast tool aborted instead of completed
3. "should properly track pendingToolCount" - expects 3 results but gets 0

These are timing/race condition issues. Your task:

1. Read the test file and understand what each test verifies
2. Identify root cause - timing issues or actual bugs?
3. Fix by:
   - Replacing arbitrary timeouts with event-based waiting
   - Fixing bugs in abort implementation if found
   - Adjusting test expectations if testing changed behavior

Do NOT just increase timeouts - find the real issue.

Return: Summary of what you found and what you fixed.
```

**Agent 2:**
```markdown
Fix the 2 failing tests in src/agents/batch-completion-behavior.test.ts:

1. "should execute all tools in batch" - only 1 tool executed instead of 3
2. "should report batch completion correctly" - batch never completes

Your task:
1. Understand the batch execution flow
2. Find why tools aren't being dispatched
3. Fix the execution logic

Return: Root cause and what you changed.
```

**Agent 3:**
```markdown
Fix the failing test in src/agents/tool-approval-race-conditions.test.ts:

1. "should handle concurrent approvals" - execution count is 0

Your task:
1. Understand the approval flow
2. Find why executions aren't being counted
3. Fix the race condition or tracking logic

Return: What was wrong and how you fixed it.
```

### Results

- **Agent 1:** Replaced timeouts with event-based waiting
- **Agent 2:** Fixed event structure bug (threadId in wrong place)
- **Agent 3:** Added wait for async tool execution to complete

### Integration

- All fixes independent, no conflicts
- Full suite green
- **Time saved:** 3 problems solved in parallel vs sequentially

## Verification Checklist

After agents return:

- [ ] Review each summary - Understand what changed
- [ ] Check for conflicts - Did agents edit same code?
- [ ] Run full suite - Verify all fixes work together
- [ ] Spot check - Agents can make systematic errors

## Common Mistakes to Avoid

### In Problem Identification

| Mistake | Result | Fix |
|---------|--------|-----|
| Assuming independence | Agents create conflicts | Analyze file dependencies first |
| Too many parallel agents | Context overload | Max 3-4 agents per batch |
| Vague failure descriptions | Agent guesses wrong | Paste exact error messages |

### In Agent Prompts

| Mistake | Result | Fix |
|---------|--------|-----|
| "Fix all the tests" | Agent gets lost | Specify exact test file |
| No error context | Agent searches blindly | Paste error messages |
| No constraints | Agent refactors everything | Specify what NOT to change |
| No output format | Unknown what changed | Request specific summary |
