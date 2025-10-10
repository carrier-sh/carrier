# Agent Creation Guide

Complete guide to creating and customizing Carrier agents.

## Table of Contents
1. [What are Agents?](#what-are-agents)
2. [Creating Agents](#creating-agents)
3. [Agent Configuration](#agent-configuration)
4. [Best Practices](#best-practices)
5. [Examples](#examples)

---

## What are Agents?

Agents are AI-powered task executors that perform specific roles in your fleet. Each agent:
- Has a specific purpose and expertise
- Can read and modify files based on configuration
- Uses tools (Read, Write, Edit, Bash, etc.)
- Tracks all actions in telemetry

### Agent Types

**Built-in Agents:**
- `code-analyzer` - Analyzes code and plans implementation
- `code-executor` - Executes code changes
- `quality-verifier` - Verifies implementation quality

**Custom Agents:**
- Created by you for specific tasks
- Stored in `.carrier/agents/`
- Can be used in any fleet

---

## Creating Agents

### Interactive Mode (Recommended for First-Time Users)

```bash
carrier agent create --interactive
```

This will guide you through:
1. Choosing an agent name
2. Defining its purpose
3. Setting file patterns
4. Configuring behavior

### CLI Mode (For Automation/CI)

```bash
carrier agent create \
  --name <name> \
  --purpose "<purpose>" \
  [--files "<patterns>"] \
  [--read-only] \
  [--tone <style>] \
  [--format <format>] \
  [--frameworks "<list>"]
```

**Required Flags:**
- `--name` - Agent name (lowercase, numbers, hyphens only)
- `--purpose` - What the agent should do

**Optional Flags:**
- `--files` - File patterns to focus on (default: `*.ts,*.js`)
- `--read-only` - Prevent file modifications
- `--tone` - Communication style: `concise|detailed|friendly|formal`
- `--format` - Output format: `markdown|json|plain`
- `--frameworks` - Frameworks/standards to check

---

## Agent Configuration

### Agent Name

**Rules:**
- Lowercase letters only
- Numbers allowed
- Hyphens for separation
- Descriptive and specific

**Good Examples:**
- `security-reviewer`
- `test-generator`
- `api-documenter`

**Bad Examples:**
- `SecurityReviewer` (uppercase)
- `my agent` (spaces)
- `helper` (too generic)

### Purpose Statement

The purpose defines what the agent does. Be specific!

**Good Purposes:**
```
"Review TypeScript code for security vulnerabilities and suggest fixes"
"Generate unit tests for React components using Jest and React Testing Library"
"Document API endpoints by analyzing route handlers and generating OpenAPI specs"
```

**Bad Purposes:**
```
"Help with code" (too vague)
"Fix bugs" (no specifics)
"Review files" (what for?)
```

### File Patterns

Control which files the agent can access:

**Examples:**
```bash
# TypeScript and TSX files
--files "*.ts,*.tsx"

# All JavaScript
--files "**/*.js"

# Specific directory
--files "src/api/**/*.ts"

# Multiple types
--files "*.ts,*.json,*.md"
```

### Read-Only Mode

Use `--read-only` when agents should only analyze, not modify:

**Good Use Cases:**
- Security audits
- Code reviews
- Documentation generation
- Metric collection

**Example:**
```bash
carrier agent create \
  --name security-auditor \
  --purpose "Audit code for security issues" \
  --files "**/*.ts" \
  --read-only
```

### Communication Tone

Choose how the agent communicates:

- **concise** - Short, direct responses (default)
- **detailed** - Comprehensive explanations
- **friendly** - Casual, encouraging tone
- **formal** - Professional, technical tone

### Output Format

Choose output structure:

- **markdown** - Formatted text with headers (default)
- **json** - Structured JSON output
- **plain** - Simple text, no formatting

---

## Best Practices

### 1. Single Responsibility

Each agent should do ONE thing well:

✅ **Good:**
```bash
carrier agent create \
  --name typescript-validator \
  --purpose "Validate TypeScript type safety and fix type errors"
```

❌ **Bad:**
```bash
carrier agent create \
  --name code-helper \
  --purpose "Fix bugs, write tests, and improve performance"
```

### 2. Narrow File Scope

Limit file access to what's needed:

✅ **Good:**
```bash
--files "src/components/**/*.tsx"  # Only React components
```

❌ **Bad:**
```bash
--files "**/*"  # Everything (too broad)
```

### 3. Descriptive Names

Use names that clearly indicate purpose:

✅ **Good:**
- `react-test-generator`
- `api-error-handler`
- `css-optimizer`

❌ **Bad:**
- `helper`
- `fixer`
- `tool1`

### 4. Document Frameworks

Specify relevant frameworks for context:

```bash
carrier agent create \
  --name react-component-reviewer \
  --purpose "Review React components for best practices" \
  --files "src/**/*.tsx" \
  --frameworks "React 18, TypeScript, Material-UI"
```

### 5. Use Read-Only for Audits

Always use `--read-only` for review/audit agents:

```bash
carrier agent create \
  --name accessibility-auditor \
  --purpose "Check components for WCAG compliance" \
  --read-only
```

---

## Examples

### Example 1: Security Reviewer

```bash
carrier agent create \
  --name security-reviewer \
  --purpose "Review TypeScript code for security vulnerabilities including SQL injection, XSS, CSRF, and insecure dependencies" \
  --files "src/**/*.ts,src/**/*.tsx" \
  --read-only \
  --tone detailed \
  --format markdown \
  --frameworks "Express, React, Node.js"
```

**Use Case:** Code review for security issues
**Output:** Detailed markdown report with vulnerabilities and recommendations

### Example 2: Test Generator

```bash
carrier agent create \
  --name jest-test-generator \
  --purpose "Generate comprehensive unit tests for TypeScript functions using Jest and React Testing Library" \
  --files "src/**/*.ts,src/**/*.tsx" \
  --tone concise \
  --format markdown \
  --frameworks "Jest, React Testing Library, TypeScript"
```

**Use Case:** Auto-generate test files
**Output:** Test files with describe/it blocks

### Example 3: API Documenter

```bash
carrier agent create \
  --name openapi-documenter \
  --purpose "Generate OpenAPI 3.0 specifications from Express route handlers" \
  --files "src/routes/**/*.ts,src/api/**/*.ts" \
  --tone formal \
  --format json \
  --frameworks "Express, OpenAPI 3.0"
```

**Use Case:** Auto-generate API documentation
**Output:** OpenAPI JSON specs

### Example 4: Code Formatter

```bash
carrier agent create \
  --name prettier-formatter \
  --purpose "Format code files according to project's Prettier configuration" \
  --files "src/**/*.ts,src/**/*.tsx,src/**/*.css" \
  --tone concise \
  --frameworks "Prettier, ESLint"
```

**Use Case:** Code formatting
**Output:** Formatted files

### Example 5: Dependency Updater

```bash
carrier agent create \
  --name dependency-updater \
  --purpose "Update package.json dependencies to latest compatible versions and test for breaking changes" \
  --files "package.json,package-lock.json" \
  --tone detailed \
  --frameworks "npm, semver"
```

**Use Case:** Dependency management
**Output:** Updated package.json with change notes

---

## Managing Agents

### List All Agents

```bash
carrier agent list
```

Shows all custom agents in `.carrier/agents/`

### View Agent Configuration

```bash
cat .carrier/agents/<agent-name>.md
```

Each agent is stored as a markdown file with configuration in front matter.

### Edit Agent

Manually edit the agent file:

```bash
# Open in your editor
vim .carrier/agents/<agent-name>.md

# Or use any editor
code .carrier/agents/<agent-name>.md
```

### Delete Agent

Remove the agent file:

```bash
rm .carrier/agents/<agent-name>.md
```

---

## Testing Agents

### 1. Create Test Agent

```bash
carrier agent create \
  --name test-agent \
  --purpose "Test task - review README.md" \
  --files "README.md" \
  --read-only
```

### 2. Deploy in Fleet

Use the agent in a deployment:

```bash
carrier deploy test-agent "Review README for clarity"
```

### 3. Review Output

```bash
carrier logs 1
```

### 4. Compare Performance

After multiple runs:

```bash
carrier compare test-agent another-agent
```

---

## Troubleshooting

### Agent Not Found

**Error:** `Agent 'my-agent' not found`

**Solution:**
```bash
# List available agents
carrier agent list

# Check if file exists
ls .carrier/agents/
```

### Invalid Agent Name

**Error:** `Agent name must contain only lowercase letters, numbers, and hyphens`

**Solution:** Use valid characters:
```bash
# Bad
carrier agent create --name "My Agent"

# Good
carrier agent create --name my-agent
```

### Agent Modifies Wrong Files

**Problem:** Agent edits files outside its scope

**Solution:** Set narrow file patterns:
```bash
# Too broad
--files "**/*"

# Specific
--files "src/components/**/*.tsx"
```

### Agent Output Too Verbose

**Problem:** Agent writes too much

**Solution:** Use concise tone:
```bash
carrier agent create \
  --name my-agent \
  --purpose "..." \
  --tone concise  # ← Add this
```

### Agent Missing Context

**Problem:** Agent doesn't understand frameworks

**Solution:** Specify frameworks:
```bash
carrier agent create \
  --name my-agent \
  --purpose "..." \
  --frameworks "React 18, TypeScript, Tailwind CSS"
```

---

## Advanced Topics

### Using Agents in Fleets

Create custom fleets that use your agents:

```json
{
  "id": "security-review",
  "name": "Security Review",
  "tasks": [
    {
      "id": "audit",
      "agent": "security-reviewer",
      "task": "Review all API routes for security issues"
    },
    {
      "id": "report",
      "agent": "markdown-reporter",
      "task": "Generate security audit report"
    }
  ]
}
```

### Agent Chaining

Use output from one agent as input to another:

```bash
# Agent 1: Find issues
carrier deploy code-analyzer "Find all TODO comments"

# Agent 2: Address issues
carrier deploy code-executor "Fix all TODOs found in deployment 1"
```

### Comparing Agents

Find the best agent for a task:

```bash
carrier compare security-reviewer security-auditor
```

Shows: speed, token usage, success rate, recommendation

---

## Next Steps

1. **Create your first agent:** Start with `carrier agent create --interactive`
2. **Test it:** Deploy with a simple task
3. **Refine:** Adjust purpose and file patterns
4. **Compare:** Test multiple agents and compare performance
5. **Document:** Add agents to your project's documentation

---

## Related Documentation

- [Fleet Design Patterns](./FLEET_PATTERNS.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [Command Reference](../README.md)

---

**Happy Agent Building!** 🤖
