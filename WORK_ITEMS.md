# Carrier - Work Items & Priorities

**Last Updated:** 2025-10-10

---

## 🔴 Critical Issues (Blocking Core Value)

### 1. Token Usage Not Captured ⚠️
**Priority:** P0 - Blocking
**Impact:** Can't track costs or optimize performance
**Status:** Missing

**Problem:**
- Stream files and context JSONs don't include token counts
- No input/output/cache token breakdown
- Missing from summary analytics

**What needs fixing:**
- `/carrier/src/providers/claude-provider.ts` - Token extraction from SDK result messages
- Context bundle creation should include token stats
- Summary JSON should have token breakdown

**Acceptance Criteria:**
- [ ] `context/{task}.json` includes `tokenUsage: { input, output, cacheRead, cacheWrite, total }`
- [ ] `outputs/{task}.json` (bundle) includes token stats
- [ ] Stream events include token progress updates
- [ ] Can see token usage per tool call

**Files to modify:**
- `src/providers/claude-provider.ts` - Line ~130-150 (result message handling)
- `src/providers/claude-provider.ts` - Line ~760-790 (context update)
- `src/providers/claude-provider.ts` - Line ~865-920 (bundle creation)

---

### 2. No Unified Summary Command
**Priority:** P0 - Blocking
**Impact:** Can't easily see what happened
**Status:** Missing

**Problem:**
- Data is scattered across streams/, context/, outputs/, logs/
- Have to manually piece together what an agent did
- No single view of "here's what happened"

**What needs building:**
```bash
carrier summary <deployment-id> [task-id]

Output:
┌─ Deployment 1: code ──────────────────────┐
│ Status: Complete                           │
│ Duration: 78s                              │
│ Tasks: 3/3 complete                        │
│                                            │
│ Task: code-analyzer (17s)                  │
│   Files: 1 read, 1 written                 │
│   Tools: Read(1), Write(1)                 │
│   Tokens: 1,245 (850 input, 395 output)    │
│   Cache: 500 tokens saved                  │
│                                            │
│ Task: code-executor (23s)                  │
│   Files: 1 read, 1 written                 │
│   Tools: Read(1), Write(1)                 │
│   Tokens: 2,180 (1,200 input, 980 output)  │
│   Cache: 800 tokens saved                  │
│                                            │
│ Total Cost: ~$0.04                         │
└────────────────────────────────────────────┘
```

**Files to create:**
- `src/commands/summary.ts` - New command
- `src/commands/index.ts` - Register command
- `src/registry.ts` - Add to registry

**Acceptance Criteria:**
- [ ] Shows all tasks with durations
- [ ] Shows file operations per task
- [ ] Shows token usage per task + total
- [ ] Shows estimated cost
- [ ] Works for both complete and in-progress deployments
- [ ] Optional `--json` flag for machine-readable output

---

### 3. Benchmark Has Edge Cases
**Priority:** P1 - Important
**Impact:** Unreliable comparisons
**Status:** Partially working

**Problems found:**
- No error handling when agent doesn't exist
- No cleanup of temporary benchmark fleets
- Parallel execution might race on file access
- No validation that agents are comparable
- Stream metrics (`filesRead`, `commandsRun`) might not match actual counts

**What needs fixing:**
- Input validation (agents exist?)
- Cleanup after benchmark completes
- Better error messages
- Verification that metrics are accurate

**Files to modify:**
- `src/commands/benchmark.ts` - Lines 26-43 (validation)
- `src/commands/benchmark.ts` - Lines 152-157 (cleanup)
- `src/commands/benchmark.ts` - Lines 115-129 (metric tracking)

**Acceptance Criteria:**
- [ ] Validates all agents exist before running
- [ ] Cleans up temp fleets after completion
- [ ] Shows clear error if agent not found
- [ ] Metrics match reality (verify against context JSONs)
- [ ] Handles agent failures gracefully

---

## 🟡 High Priority (Improves Usability)

### 4. Agent Builder Can't Be Tested Non-Interactively
**Priority:** P1
**Impact:** Can't automate agent creation
**Status:** Working but limited

**Problem:**
- `agent create --interactive` requires terminal prompts
- Can't script agent creation
- Can't test in CI/CD

**What needs adding:**
```bash
# Non-interactive mode
carrier agent create \
  --name security-reviewer \
  --purpose "Review TS for security issues" \
  --files "*.ts,*.tsx" \
  --read-only \
  --tone concise \
  --format markdown
```

**Files to modify:**
- `src/commands/agent.ts` - Add non-interactive mode support

**Acceptance Criteria:**
- [ ] Supports all flags from interactive mode
- [ ] Falls back to interactive if flags missing
- [ ] Can create agents via scripts/CI

---

### 5. No Historical Comparison
**Priority:** P1
**Impact:** Can't learn from past runs
**Status:** Not implemented

**What needs building:**
```bash
carrier compare <agent1> <agent2> --task "review auth"

Shows historical performance across past deployments
```

**Requirements:**
- Need to store deployment results in database (or indexed locally)
- Query by agent name + similar tasks
- Aggregate metrics across runs
- Show trends

**Files to create:**
- `src/commands/compare.ts`
- `src/services/history.ts` (aggregation logic)

**Acceptance Criteria:**
- [ ] Can compare two agents based on historical data
- [ ] Shows average duration, tokens, success rate
- [ ] Filters by task similarity
- [ ] Works with local storage (DB optional)

---

### 6. Stream Files Are Verbose
**Priority:** P2
**Impact:** Noise in logs
**Status:** Working but noisy

**Problem:**
- Too many "Preparing tool parameters..." events
- Stream files get large quickly
- Hard to find signal in the noise

**What needs tuning:**
- Reduce verbosity of progress events
- Aggregate similar events
- Add filtering options

**Files to modify:**
- `src/providers/claude-provider.ts` - Lines 315-340 (delta events)
- `src/stream.ts` - Add event filtering

**Acceptance Criteria:**
- [ ] Fewer duplicate progress messages
- [ ] Can filter stream by event type
- [ ] Stream files stay readable even for long runs

---

## 🟢 Medium Priority (Polish)

### 7. No Quality Verification Command
**Priority:** P2
**Impact:** Can't test agents before using
**Status:** Not implemented

**What needs building:**
```bash
carrier verify <agent-name> --test-cases cases.json

Runs agent against test cases, shows pass/fail
```

**Requirements:**
- Test case format definition
- Agent execution against test cases
- Pass/fail determination logic
- Success rate calculation

**Files to create:**
- `src/commands/verify.ts`
- `src/types/test-cases.ts`

---

### 8. Web Dashboard
**Priority:** P2
**Impact:** Better UX for non-CLI users
**Status:** Not implemented

**What needs building:**
- Visual timeline of agent actions
- Token usage graphs
- Cost tracking over time
- Agent comparison UI

**Scope:**
- This is a larger project (days not hours)
- Requires `/carrier-webapp` work
- API endpoints to serve telemetry data

---

### 9. Better Error Handling Throughout
**Priority:** P2
**Impact:** Confusing errors
**Status:** Needs improvement

**Problems:**
- Generic error messages
- No recovery suggestions
- Stack traces exposed to users

**What needs fixing:**
- Consistent error format
- Helpful error messages
- Recovery suggestions
- User-friendly stack traces

---

### 10. Documentation Gaps
**Priority:** P2
**Impact:** Hard to onboard
**Status:** ✅ COMPLETE

**What was written:**
- ✅ Agent creation guide (docs/AGENT_CREATION_GUIDE.md)
- ✅ Fleet design patterns (docs/FLEET_PATTERNS.md)
- ✅ Troubleshooting guide (docs/TROUBLESHOOTING.md)
- ✅ Documentation index (docs/README.md)
- ⏳ API documentation (future)
- ⏳ Architecture deep-dive (future)

---

## 📊 Metrics to Track Success

For each fix, verify:
- [ ] Works end-to-end
- [ ] Error cases handled
- [ ] Performance acceptable
- [ ] User experience improved
- [ ] Documentation updated

---

## Next Steps

**Phase 1: Critical Fixes (Today)**
1. Fix token usage capture ← START HERE
2. Build unified summary command
3. Fix benchmark edge cases

**Phase 2: Usability (This Week)**
4. Add non-interactive agent builder
5. Reduce stream verbosity
6. Better error handling

**Phase 3: Features (Next Week)**
7. Historical comparison
8. Quality verification
9. Documentation

**Phase 4: Polish (Future)**
10. Web dashboard
11. Advanced analytics
12. Team features

---

## Testing Strategy

For each fix:
1. **Unit test**: Test the function in isolation
2. **Integration test**: Deploy real agent, verify telemetry
3. **Smoke test**: Run through common workflows
4. **Edge cases**: Test error conditions

---

## How to Use This Document

**For each work item:**
1. Mark status as you work
2. Create git branch: `fix/token-usage-capture`
3. Deploy agent to fix (dogfood the system!)
4. Verify with acceptance criteria
5. Update status when complete
6. Commit with reference to work item number

**Priority Legend:**
- P0 = Blocking, must fix now
- P1 = Important, fix this week
- P2 = Nice to have, fix when possible

---

**Last Test Results:** 2025-10-10 (Updated after dogfooding session #2)
- ✅ Telemetry capture works
- ✅ Real-time streaming works
- ✅ Context tracking works
- ✅ Fleet orchestration works
- ✅ Token usage FIXED - Full token breakdown with per-model stats and caching
- ✅ Unified summary command IMPLEMENTED - Shows tasks, files, tokens, and cost
- ✅ Benchmark edge cases FIXED - Validation, cleanup, and better error messages
- ✅ Benchmark flag parsing FIXED - Parser now recognizes --agents flag
- ✅ Stream verbosity FIXED - Removed excessive "Preparing tool parameters..." messages
- ✅ Non-interactive agent builder IMPLEMENTED - Full CLI flag support with fallback to interactive mode
- ✅ Historical comparison command IMPLEMENTED - Compare agents across past deployments with metrics

**Bugs Found & Fixed During Testing:**
1. Benchmark command flags not registered in parser (src/parser.ts:274-277)
2. Benchmark flag parsing didn't handle separated values (src/commands/benchmark.ts:34-45)
3. Stream spam from input_json_delta events (src/providers/claude-provider.ts:324-335)
4. Agent command flags not registered in parser (src/parser.ts:282-292)
5. History service used wrong metadata field (metadata.agents vs metadata.tasks) (src/services/history.ts:92)
6. History service used wrong registry structure (needed registry.deployedFleets) (src/services/history.ts:77)
7. History service checked wrong status values (complete vs completed) (src/services/history.ts:218,246)
