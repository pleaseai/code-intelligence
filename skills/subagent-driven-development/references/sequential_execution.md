# Sequential Execution Process

Detailed workflow for executing tasks one-by-one with code review between each.

## When to Use

- Tasks are tightly coupled
- Tasks should be executed in order
- Later tasks depend on earlier results

## Full Workflow

### Step 1: Load Plan

1. Read plan file
2. Create TodoWrite with all tasks
3. Review critically - identify any questions or concerns

### Step 2: Execute Task with Subagent

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

**Important:** Subagent reports back with summary of work.

### Step 3: Review Subagent's Work

Dispatch code-reviewer subagent:

```
Task tool (please:please-code-reviewer):
  WHAT_WAS_IMPLEMENTED: [from subagent's report]
  PLAN_OR_REQUIREMENTS: Task N from [plan-file]
  BASE_SHA: [commit before task]
  HEAD_SHA: [current commit]
  DESCRIPTION: [task summary]
```

**Code reviewer returns:**
- Strengths
- Issues (Critical/Important/Minor)
- Assessment

### Step 4: Apply Review Feedback

**If issues found:**
- Fix Critical issues immediately
- Fix Important issues before next task
- Note Minor issues for later

**Dispatch follow-up subagent if needed:**

```
"Fix issues from code review: [list issues]"
```

### Step 5: Mark Complete, Next Task

- Mark task as completed in TodoWrite
- Move to next task
- Repeat steps 2-5

### Step 6: Final Review

After all tasks complete, dispatch final code-reviewer:
- Reviews entire implementation
- Checks all plan requirements met
- Validates overall architecture

### Step 7: Complete Development

After final review passes:
- All tests pass
- All requirements met
- Ready to merge

## Error Handling

### If Subagent Fails Task

1. **DO NOT** try to fix manually (context pollution)
2. Dispatch fix subagent with specific instructions:
   ```
   "Fix the following issue from Task N: [specific issue]

   Context: [what the task was supposed to do]
   Error: [what went wrong]

   Return: What you fixed and how you verified it"
   ```

### If Review Finds Critical Issues

1. Stop implementation of new tasks
2. Dispatch fix subagent
3. Re-run code review
4. Only proceed when Critical issues resolved

## Tips for Success

### Clear Subagent Prompts

| Element | Purpose | Example |
|---------|---------|---------|
| Task reference | What to implement | "Task 3 from plan.md" |
| Specific goal | What success looks like | "Create user model with validation" |
| Work directory | Where to work | "/src/models" |
| Report format | What to return | "List files changed, test results" |

### Effective Code Reviews

Get git SHAs before dispatching reviewer:
```bash
git rev-parse HEAD~1  # BASE_SHA (before task)
git rev-parse HEAD    # HEAD_SHA (after task)
```

### Tracking Progress

Use TodoWrite throughout:
```
[in_progress] Task 1: Create user model
[pending] Task 2: Add validation
[pending] Task 3: Write tests
```

Update after each task completes:
```
[completed] Task 1: Create user model
[in_progress] Task 2: Add validation
[pending] Task 3: Write tests
```
