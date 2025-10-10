# Active Work - Carrier Self-Improvement

**Started:** 2025-10-10 13:04
**Strategy:** Using Carrier to fix Carrier (dogfooding)

---

## 🤖 Deployed Agents

### Deployment #2: Token Usage Capture Fix
**Status:** Running
**Agent Fleet:** code (3 tasks: analyzer → executor → verifier)
**Task:** Fix token usage capture in `claude-provider.ts`

**What it's fixing:**
- Extract token counts from SDK result messages
- Add token stats to context JSONs
- Include tokens in output bundles
- Track per-tool-call token usage

**Files being modified:**
- `src/providers/claude-provider.ts` (lines ~130-150, ~760-790, ~865-920)

**Monitor:**
```bash
carrier watch 2          # Live output
carrier status 2         # Current status
carrier logs 2           # View logs
```

---

### Deployment #3: Unified Summary Command
**Status:** Running
**Agent Fleet:** code (3 tasks: analyzer → executor → verifier)
**Task:** Create new `carrier summary` command

**What it's building:**
- New file: `src/commands/summary.ts`
- Shows: tasks, durations, file ops, token usage, cost
- Supports: `--json` flag, in-progress deployments
- Registers in: `commands/index.ts` and `registry.ts`

**Files being created/modified:**
- `src/commands/summary.ts` (new)
- `src/commands/index.ts` (register)
- `src/registry.ts` (add to registry)

**Monitor:**
```bash
carrier watch 3
carrier status 3
carrier logs 3
```

---

### Deployment #4: Benchmark Edge Case Fixes
**Status:** Running
**Agent Fleet:** code (3 tasks: analyzer → executor → verifier)
**Task:** Fix benchmark command reliability

**What it's fixing:**
- Add validation that agents exist before running
- Cleanup temp fleets after completion
- Better error messages
- Verify metrics accuracy
- Handle failures gracefully

**Files being modified:**
- `src/commands/benchmark.ts` (lines 26-43, 115-129, 152-157)

**Monitor:**
```bash
carrier watch 4
carrier status 4
carrier logs 4
```

---

## 📊 Progress Tracking

### Check All Deployments
```bash
carrier status --all
```

### Monitor Specific Deployment
```bash
# Live streaming output
carrier watch <deployment-id>

# Static status check
carrier status <deployment-id>

# View all logs
carrier logs <deployment-id>
```

### Check Completion
```bash
# Each deployment should go through:
# 1. code-analyzer (active) → 2. code-executor (active) → 3. quality-verifier (active) → Complete

# When complete, status will show:
carrier status <deployment-id>
# Output: "✅ <id> - code (complete)"
```

---

## ✅ Verification Plan

Once all deployments complete, verify each fix:

### 1. Token Usage Capture (Deployment #2)
**Test:**
```bash
# Run a simple deployment
carrier deploy code "Review test-file.js"

# Check context JSON for token stats
cat .carrier/deployed/<id>/context/*.json | jq '.tokenUsage'

# Expected: Should show input, output, cache tokens
```

**Acceptance:**
- [ ] Context JSONs include `tokenUsage` object
- [ ] Output bundles include token stats
- [ ] Token counts are accurate
- [ ] Can track per-task token usage

---

### 2. Summary Command (Deployment #3)
**Test:**
```bash
# Try the new command on a completed deployment
carrier summary 1

# Try on in-progress
carrier summary 2

# Try JSON output
carrier summary 1 --json
```

**Acceptance:**
- [ ] Command exists and runs
- [ ] Shows all tasks with durations
- [ ] Shows file operations
- [ ] Shows token usage per task
- [ ] Shows cost estimate
- [ ] JSON output works
- [ ] Works for in-progress deployments

---

### 3. Benchmark Fixes (Deployment #4)
**Test:**
```bash
# Test with non-existent agent
carrier benchmark "test task" --agents=fake-agent,another-fake

# Test with existing agents
carrier benchmark "review code" --agents=code-analyzer,code-executor

# Check cleanup
ls .carrier/fleets/benchmark-*
# Should be empty after completion
```

**Acceptance:**
- [ ] Validates agents exist before running
- [ ] Shows clear error for missing agents
- [ ] Cleans up temp fleets
- [ ] Metrics are accurate
- [ ] Handles failures gracefully

---

## 🎯 Next Steps

**While agents are running:**
1. Monitor progress with `carrier status --all`
2. Check individual agents with `carrier watch <id>`
3. Wait for all to complete (3 fleets × 3 tasks = 9 agent executions)

**After completion:**
1. Run verification tests for each fix
2. Check acceptance criteria
3. Test edge cases
4. Update WORK_ITEMS.md with results

**If any fail:**
1. Check error logs: `carrier logs <id>`
2. Review agent outputs: `cat .carrier/deployed/<id>/outputs/*.md`
3. Re-deploy with refined instructions
4. Iterate until complete

---

## 📈 Success Metrics

**Quality indicators:**
- All 3 deployments complete successfully
- All acceptance criteria met
- No regressions in existing functionality
- Telemetry shows improved data capture

**Time estimate:**
- Each fleet takes ~1-3 minutes per task
- Total: ~10-20 minutes for all fixes
- Verification: ~5 minutes
- **Total time: ~15-25 minutes**

---

## 🔍 Current Status

Last checked: 2025-10-10 13:06

```
Deployment 2: Active (code-analyzer running)
Deployment 3: Active (code-analyzer running)
Deployment 4: Active (code-analyzer running)
```

**Check again in 5 minutes with:**
```bash
carrier status --all
```

---

## 💡 Meta Note

This is Carrier fixing itself. We're dogfooding the system to improve the system.

**What we're learning:**
- Does the fleet system actually work end-to-end?
- Can agents handle complex code changes?
- Is the telemetry capturing what we need?
- Are the verification steps automated enough?

**This is the real test.**
