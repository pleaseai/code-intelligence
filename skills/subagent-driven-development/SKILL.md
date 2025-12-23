---
name: subagent-driven-development
description: |
  Use when executing implementation plans with independent tasks in the current session or facing 3+ independent issues that can be investigated without shared state or dependencies. Dispatches fresh subagent for each task with code review between tasks, enabling fast iteration with quality gates.
metadata:
  version: "1.0.0"
  lastUpdated: "2025-12-23"
---

# Subagent-Driven Development

Create and execute plan by dispatching fresh subagent per task or issue, with code and output review after each or batch of tasks.

**Core principle:** Fresh subagent per task + review between or after tasks = high quality, fast iteration.

## When to Use This Skill

Use this skill when:
- You have a plan with 3+ implementation tasks that can be executed independently
- You're facing multiple unrelated failures that need investigation
- Tasks can be parallelized without shared state or file conflicts
- You want fast iteration with quality gates between tasks

## Benefits of Subagent Execution

| Aspect | Benefit |
|--------|---------|
| Same session | No context switch between tasks |
| Fresh subagent per task | No context pollution from previous work |
| Code review after each task | Catch issues early |
| Faster iteration | No human-in-loop between tasks |

## Supported Execution Types

### 1. Sequential Execution

When tasks are tightly coupled and must execute in order.

**When to use:**
- Tasks depend on each other
- Later tasks build on earlier results
- File modifications must happen in sequence

See `references/sequential_execution.md` for detailed workflow.

### 2. Parallel Execution

When tasks are independent and can run concurrently.

**When to use:**
- Tasks modify different files/subsystems
- No shared state between tasks
- Review can be done after all tasks complete

See `references/parallel_execution.md` for detailed workflow.

### 3. Parallel Investigation

Special case for debugging multiple independent failures.

**When to use:**
- 3+ test failures in different domains
- Each failure is independent
- Fixes won't conflict with each other

See `references/parallel_investigation.md` for detailed workflow.

## Quick Start: Sequential Execution

### 1. Load Plan

Read plan file, create TodoWrite with all tasks.

### 2. Execute Task with Subagent

For each task, dispatch a fresh subagent:

```
Task tool (general-purpose):
  description: "Implement Task N: [task name]"
  prompt: |
    You are implementing Task N from [plan-file].

    Read that task carefully. Your job is to:
    1. Implement exactly what the task specifies
    2. Write tests (following TDD if task says to)
    3. Verify implementation works
    4. Commit your work
    5. Report back

    Work from: [directory]

    Report: What you implemented, what you tested, test results, files changed, any issues
```

### 3. Review Subagent's Work

Run code review using SlashCommand after each task:

```
SlashCommand("/please:review-pr")
```

Or with specific review aspects:

```
SlashCommand("/please:review-pr code tests errors")
```

**Code reviewer returns:** Strengths, Issues (Critical/Important/Minor), Assessment

### 4. Apply Review Feedback

- Fix Critical issues immediately
- Fix Important issues before next task
- Note Minor issues for later

If fixes needed, dispatch follow-up subagent:
```
"Fix issues from code review: [list issues]"
```

### 5. Mark Complete, Next Task

- Mark task as completed in TodoWrite
- Move to next task
- Repeat steps 2-5

### 6. Final Review

After all tasks complete, run comprehensive code review:

```
SlashCommand("/please:review-pr all")
```

This reviews:
- Entire implementation
- All plan requirements met
- Overall architecture validation

## Example Workflow

```
You: I'm using Subagent-Driven Development to execute this plan.

[Load plan, create TodoWrite]

Task 1: Hook installation script

[Dispatch implementation subagent]
Subagent: Implemented install-hook with tests, 5/5 passing

[Run SlashCommand("/please:review-pr")]
Reviewer: Strengths: Good test coverage. Issues: None. Ready.

[Mark Task 1 complete]

Task 2: Recovery modes

[Dispatch implementation subagent]
Subagent: Added verify/repair, 8/8 tests passing

[Run SlashCommand("/please:review-pr")]
Reviewer: Strengths: Solid. Issues (Important): Missing progress reporting

[Dispatch fix subagent]
Fix subagent: Added progress every 100 conversations

[Verify fix, mark Task 2 complete]

...

[After all tasks]
[Run SlashCommand("/please:review-pr all")]
Final reviewer: All requirements met, ready to merge

Done!
```

## Red Flags

**Never:**
- Skip code review between tasks
- Proceed with unfixed Critical issues
- Dispatch multiple implementation subagents in parallel for sequential tasks (conflicts)
- Implement without reading plan task

**If subagent fails task:**
- Dispatch fix subagent with specific instructions
- Don't try to fix manually (context pollution)

## Best Practices

### Agent Prompt Structure

Good agent prompts are:

1. **Focused** - One clear problem domain
2. **Self-contained** - All context needed to understand the problem
3. **Specific about output** - What should the agent return?

### Common Mistakes

| Mistake | Problem | Solution |
|---------|---------|----------|
| Too broad scope | Agent gets lost | Focus on one file/subsystem |
| No context | Agent doesn't know where | Paste error messages, test names |
| No constraints | Agent might refactor everything | Specify what NOT to change |
| Vague output | You don't know what changed | Request specific summary format |

### When NOT to Use Subagent-Driven Development

- **Related failures** - Fixing one might fix others; investigate together first
- **Need full context** - Understanding requires seeing entire system
- **Exploratory debugging** - You don't know what's broken yet
- **Shared state** - Agents would interfere (editing same files)

## References

- `references/sequential_execution.md` - Full sequential workflow
- `references/parallel_execution.md` - Parallel task execution
- `references/parallel_investigation.md` - Debugging independent failures

## Related Commands & Skills

- `/please:review-pr` - Code review slash command (preferred for reviews)
- `general-purpose` - General implementation agent for task execution
