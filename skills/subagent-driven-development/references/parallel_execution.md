# Parallel Execution Process

Load plan, review critically, execute tasks in batches, report for review between batches.

**Core principle:** Batch execution with checkpoints for architect review.

## When to Use

- Tasks are mostly independent
- Different files or subsystems
- Overall review can be done after all tasks complete

## Full Workflow

**Announce at start:** "I'm using Subagent-Driven Development with parallel execution to implement this plan."

### Step 1: Load and Review Plan

1. Read plan file
2. Review critically - identify any questions or concerns about the plan
3. If concerns: Raise them with your human partner before starting
4. If no concerns: Create TodoWrite and proceed

### Step 2: Execute Batch

**Default: First 3 tasks**

For each task in parallel:
1. Mark as in_progress
2. Dispatch subagent with clear, focused prompt
3. Let agents work concurrently

```typescript
// Example: Dispatch 3 agents in parallel
Task("Implement user model in src/models/user.ts")
Task("Create login UI in src/components/Login.vue")
Task("Add API endpoint in src/api/auth.ts")
// All three run concurrently
```

### Step 3: Wait and Collect Results

Wait for all agents to complete, then:
- Read each summary
- Verify no conflicts (same files edited)
- Check all tests pass

### Step 4: Report

When batch complete:
- Show what was implemented
- Show verification output
- Say: "Ready for feedback."

### Step 5: Continue

Based on feedback:
- Apply changes if needed
- Execute next batch
- Repeat until complete

### Step 6: Complete Development

After all tasks complete and verified:
- Run final code review
- Ensure all plan requirements met
- Ready to merge

## Batch Size Guidelines

| Project Size | Recommended Batch | Reason |
|--------------|-------------------|--------|
| Small (<10 tasks) | 3 tasks | Quick iteration |
| Medium (10-20 tasks) | 5 tasks | Balance speed/review |
| Large (>20 tasks) | 3 tasks | More checkpoints |

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker mid-batch (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Key Differences from Sequential

| Aspect | Sequential | Parallel |
|--------|------------|----------|
| Agent dispatch | One at a time | Multiple concurrent |
| Review timing | After each task | After each batch |
| File conflicts | Not a concern | Must verify no conflicts |
| Progress speed | Slower, more controlled | Faster, batch checkpoints |
| Error handling | Stop immediately | Complete batch, then assess |

## Example: 6 Tasks in 2 Batches

```
Plan:
T001 [P] Create user model
T002 [P] Build login UI
T003 [P] Add API endpoint
T004 Integrate model with API (depends on T001, T003)
T005 Connect UI to API (depends on T002, T004)
T006 Add tests for full flow

Execution:

Batch 1 (parallel - marked [P]):
- Dispatch T001 subagent
- Dispatch T002 subagent
- Dispatch T003 subagent
[Wait for all to complete]
[Report: 3 tasks done, all tests pass]

Batch 2 (sequential - dependencies):
- T004 after T001, T003 complete
- T005 after T002, T004 complete
- T006 after T005 complete
[Report: 3 tasks done, full suite passes]

Done!
```

## Remember

- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Between batches: just report and wait
- Stop when blocked, don't guess
