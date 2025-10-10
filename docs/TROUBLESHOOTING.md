# Troubleshooting Guide

Common issues and solutions when using Carrier.

## Table of Contents
1. [Installation Issues](#installation-issues)
2. [Deployment Problems](#deployment-problems)
3. [Agent Issues](#agent-issues)
4. [Performance Problems](#performance-problems)
5. [Error Messages](#error-messages)

---

## Installation Issues

### Command Not Found: carrier

**Error:**
```bash
carrier: command not found
```

**Solution:**
```bash
# Check if installed
which carrier

# Install locally
bun install

# Use via bun
bun src/cli.ts <command>

# Or create alias
alias carrier="bun src/cli.ts"
```

### Permission Denied

**Error:**
```bash
EACCES: permission denied
```

**Solution:**
```bash
# Make executable
chmod +x src/cli.ts

# Or run with bun
bun src/cli.ts <command>
```

---

## Deployment Problems

### Deployment Stuck/Hanging

**Problem:** Deployment doesn't progress

**Diagnosis:**
```bash
# Check deployment status
carrier status <id>

# Watch live logs
carrier watch <id>

# Check for errors
carrier logs <id>
```

**Solutions:**

**1. Agent waiting for approval:**
```bash
# Check if fleet has approval gates
carrier logs <id> | grep -i "approval"

# Approve if needed
carrier approve <id>
```

**2. Task infinite loop:**
```bash
# Stop the deployment
carrier stop <id>

# Review what it was doing
carrier logs <id> --tail 50
```

**3. Provider timeout:**
```bash
# Check provider connection
# Stop and retry
carrier stop <id>
carrier deploy <fleet> "<task>"
```

### Deployment Fails Immediately

**Problem:** Deployment fails right after starting

**Common Causes:**

**1. Invalid fleet:**
```bash
# List available fleets
carrier ls

# Check fleet configuration
cat .carrier/fleets/<fleet>/<fleet>.json
```

**2. Missing agent:**
```bash
# List agents
carrier agent list

# Check if agent exists
ls .carrier/agents/<agent>.md
```

**3. Invalid configuration:**
```bash
# Check carrier config
cat .carrier/config.json

# Reinitialize if needed
carrier init
```

### Can't Find Deployment

**Error:**
```bash
Deployment not found: 5
```

**Solution:**
```bash
# List all deployments
carrier status --all

# Check deployment registry
cat .carrier/deployed/registry.json | jq '.deployedFleets | keys'

# Use correct ID
carrier status <correct-id>
```

---

## Agent Issues

### Agent Not Found

**Error:**
```bash
Agent 'my-agent' not found
```

**Solution:**
```bash
# List available agents
carrier agent list

# Check spelling
ls .carrier/agents/

# Create if missing
carrier agent create --name my-agent --purpose "..."
```

### Agent Modifies Wrong Files

**Problem:** Agent edits files outside scope

**Solution:**

**1. Set file patterns:**
```bash
# Edit agent file
vim .carrier/agents/<agent>.md

# Add file patterns in front matter
files:
  - "src/components/**/*.tsx"
  - "!src/components/**/*.test.tsx"
```

**2. Use read-only mode:**
```bash
carrier agent create \
  --name my-agent \
  --purpose "..." \
  --read-only  # ← Prevents modifications
```

### Agent Produces Poor Results

**Problem:** Agent output doesn't meet expectations

**Solutions:**

**1. Improve purpose statement:**
```markdown
<!-- Bad -->
purpose: "Fix code"

<!-- Good -->
purpose: "Fix TypeScript type errors in React components, ensuring strict type safety and proper prop typing"
```

**2. Add framework context:**
```markdown
frameworks:
  - "React 18"
  - "TypeScript 5"
  - "Material-UI"
```

**3. Use better tone:**
```bash
# For detailed explanations
carrier agent create --tone detailed

# For concise output
carrier agent create --tone concise
```

**4. Compare agents:**
```bash
# Find which agent works best
carrier compare agent1 agent2
```

### Agent Validation Errors

**Error:**
```bash
Agent name must contain only lowercase letters, numbers, and hyphens
```

**Solution:**
```bash
# Bad names
"My Agent"     # Spaces
"myAgent"      # Camelcase
"my_agent"     # Underscores

# Good names
"my-agent"
"code-reviewer-v2"
"security-auditor"
```

---

## Performance Problems

### Slow Deployments

**Problem:** Deployments take too long

**Diagnosis:**
```bash
# Check deployment duration
carrier summary <id>

# Compare agents
carrier compare slow-agent fast-agent
```

**Solutions:**

**1. Too many agents in fleet:**
```json
// Bad - 8 agents
["a", "b", "c", "d", "e", "f", "g", "h"]

// Good - 3 agents
["analyzer", "executor", "verifier"]
```

**2. Agents doing too much:**
```bash
# Split into focused agents
carrier agent create --name type-checker --purpose "Check TypeScript types only"
carrier agent create --name linter --purpose "Run ESLint only"
```

**3. Wide file scope:**
```yaml
# Bad
files: ["**/*"]

# Good
files: ["src/components/**/*.tsx"]
```

### High Token Usage

**Problem:** Deployments cost too much

**Diagnosis:**
```bash
# Check token usage
carrier summary <id>

# Compare efficiency
carrier compare agent1 agent2
```

**Solutions:**

**1. Narrow file access:**
```yaml
# Only read necessary files
files:
  - "src/api/routes.ts"
  - "!**/*.test.ts"
```

**2. Use read-only when possible:**
```bash
# For audits/reviews
carrier agent create --read-only
```

**3. Concise tone:**
```bash
carrier agent create --tone concise
```

**4. Choose efficient agents:**
```bash
# Use compare to find cheapest
carrier compare code-analyzer code-reviewer
# Look for "Cost" comparison
```

---

## Error Messages

### Unknown Command

**Error:**
```bash
Unknown command: foobar
Run "carrier help" for usage information
```

**Solution:**
```bash
# List available commands
carrier help

# Common commands
carrier deploy <fleet> "<task>"
carrier status
carrier logs <id>
carrier agent create
```

### Unknown Flag

**Error:**
```bash
Unknown flag '--foobar' for command 'deploy'
```

**Solution:**
```bash
# Check command help
carrier deploy --help

# Common flags
carrier deploy code "task" --watch
carrier status --all
carrier logs <id> --follow
```

### Missing Required Parameters

**Error:**
```bash
Usage: carrier compare <agent1> <agent2>
```

**Solution:**
```bash
# Provide required parameters
carrier compare code-analyzer code-executor

# Check usage
carrier <command> --help
```

### Parser Errors

**Error:**
```bash
Failed to parse fleet configuration
```

**Solution:**
```bash
# Check JSON syntax
cat .carrier/fleets/<fleet>/<fleet>.json | jq .

# Common issues
# - Missing commas
# - Unclosed brackets
# - Invalid JSON

# Validate JSON
jq . < .carrier/fleets/<fleet>/<fleet>.json
```

### No Historical Data

**Error:**
```bash
No historical data available for agent
```

**Solution:**
```bash
# Agent needs to run first
carrier deploy <fleet> "test task"

# Then compare
carrier compare agent1 agent2
```

---

## Debug Mode

### Enable Verbose Logging

```bash
# Set environment variable
export CARRIER_DEBUG=true

# Run command
carrier deploy code "task"

# See detailed logs
carrier logs <id> --streams
```

### Check Internal State

```bash
# View deployment metadata
cat .carrier/deployed/<id>/metadata.json | jq .

# View task context
cat .carrier/deployed/<id>/context/<task-id>.json | jq .

# View stream events
cat .carrier/deployed/<id>/streams/<task-id>.stream | jq -s .
```

---

## Getting Help

### Check Documentation

```bash
# Command help
carrier help

# Specific command
carrier <command> --help

# Read guides
cat docs/AGENT_CREATION_GUIDE.md
cat docs/FLEET_PATTERNS.md
```

### Check Logs

```bash
# Recent deployment
carrier logs <id>

# Follow live
carrier watch <id>

# With context
carrier logs <id> --streams
```

### Review Output

```bash
# Task output
cat .carrier/deployed/<id>/outputs/<task-id>.md

# Summary
carrier summary <id>
```

---

## Common Workflows

### Debugging Failed Deployment

```bash
# 1. Check status
carrier status <id>

# 2. Read logs
carrier logs <id>

# 3. Review task output
carrier summary <id>

# 4. Check for errors
cat .carrier/deployed/<id>/streams/<task-id>.stream | grep -i error

# 5. Fix and retry
carrier deploy <fleet> "updated task"
```

### Optimizing Performance

```bash
# 1. Measure current performance
carrier summary <id>

# 2. Compare agents
carrier compare agent1 agent2

# 3. Choose best agent
carrier deploy <fleet> "task" # with optimal agent

# 4. Verify improvement
carrier summary <new-id>
```

### Troubleshooting Agent

```bash
# 1. Test agent
carrier deploy <fleet> "simple test task"

# 2. Review results
carrier logs <id>

# 3. Adjust agent
vim .carrier/agents/<agent>.md

# 4. Retest
carrier deploy <fleet> "same test task"

# 5. Compare results
carrier compare <id1> <id2>
```

---

## Best Practices for Avoiding Issues

### 1. Start Simple

✅ **Good:**
```bash
# Test with simple task first
carrier deploy code "Add a comment to README"
```

❌ **Bad:**
```bash
# Complex task immediately
carrier deploy code "Refactor entire authentication system"
```

### 2. Use Built-in Fleets

✅ **Good:**
```bash
# Use tested fleet
carrier deploy code "fix bug"
```

❌ **Bad:**
```bash
# Create custom fleet immediately
carrier deploy my-untested-fleet "fix bug"
```

### 3. Monitor Deployments

✅ **Good:**
```bash
# Watch progress
carrier deploy code "task" --watch
```

❌ **Bad:**
```bash
# Deploy and forget
carrier deploy code "task"
# ... hours later ... "where's my deployment?"
```

### 4. Review Before Merging

✅ **Good:**
```bash
# Check what changed
carrier summary <id>
git diff
```

❌ **Bad:**
```bash
# Trust without verification
git add .
git commit
```

---

## FAQ

**Q: How do I stop a deployment?**
```bash
carrier stop <id>
```

**Q: How do I see what a deployment did?**
```bash
carrier summary <id>
```

**Q: How do I retry a failed deployment?**
```bash
carrier deploy <fleet> "<task>"  # Create new deployment
```

**Q: How do I delete a deployment?**
```bash
carrier clean <id>
```

**Q: How do I compare two agents?**
```bash
carrier compare agent1 agent2
```

**Q: How do I create a custom agent?**
```bash
carrier agent create --interactive
```

**Q: How do I see all deployments?**
```bash
carrier status --all
```

**Q: How do I watch a deployment live?**
```bash
carrier watch <id>
```

---

## Still Need Help?

1. Check command help: `carrier <command> --help`
2. Review logs: `carrier logs <id>`
3. Read documentation: `docs/` folder
4. File an issue: GitHub repository

---

**Good luck!** 🚀
