# Fleet Design Patterns

Common patterns for designing effective multi-agent workflows.

## Table of Contents
1. [Overview](#overview)
2. [Basic Patterns](#basic-patterns)
3. [Advanced Patterns](#advanced-patterns)
4. [Anti-Patterns](#anti-patterns)
5. [Examples](#examples)

---

## Overview

Fleets orchestrate multiple agents to complete complex tasks. This guide shows proven patterns for designing effective fleets.

### Fleet Anatomy

```json
{
  "id": "my-fleet",
  "name": "My Fleet",
  "tasks": [
    {
      "id": "task-1",
      "agent": "agent-name",
      "task": "What to do"
    }
  ]
}
```

**Key Concepts:**
- **Sequential execution** - Tasks run in order
- **Context passing** - Each task sees previous outputs
- **Agent specialization** - Each agent has a specific role

---

## Basic Patterns

### 1. Analyze → Execute → Verify

**Use Case:** Code changes, bug fixes, feature implementation

**Pattern:**
```json
{
  "id": "code",
  "name": "Code Change Fleet",
  "tasks": [
    {
      "id": "code-analyzer",
      "agent": "code-analyzer",
      "task": "Analyze codebase and plan implementation"
    },
    {
      "id": "code-executor",
      "agent": "code-executor",
      "task": "Execute code changes"
    },
    {
      "id": "quality-verifier",
      "agent": "code-verifier",
      "task": "Verify implementation quality"
    }
  ]
}
```

**Why it works:**
- Analyzer understands requirements
- Executor implements changes
- Verifier catches issues

**When to use:**
- Any code modification
- Feature additions
- Bug fixes
- Refactoring

### 2. Review → Report

**Use Case:** Code review, audits, analysis

**Pattern:**
```json
{
  "id": "security-review",
  "name": "Security Review",
  "tasks": [
    {
      "id": "reviewer",
      "agent": "security-reviewer",
      "task": "Review code for security issues"
    },
    {
      "id": "reporter",
      "agent": "markdown-reporter",
      "task": "Generate formatted security report"
    }
  ]
}
```

**Why it works:**
- Reviewer focuses on analysis
- Reporter formats findings

**When to use:**
- Security audits
- Code reviews
- Quality assessments
- Compliance checks

### 3. Generate → Validate

**Use Case:** Content generation, test creation

**Pattern:**
```json
{
  "id": "test-generator",
  "name": "Test Generation",
  "tasks": [
    {
      "id": "generator",
      "agent": "test-generator",
      "task": "Generate unit tests for components"
    },
    {
      "id": "validator",
      "agent": "test-validator",
      "task": "Validate tests compile and run"
    }
  ]
}
```

**Why it works:**
- Generator creates content
- Validator ensures quality

**When to use:**
- Test generation
- Documentation creation
- Code scaffolding

---

## Advanced Patterns

### 4. Parallel Review (Approval Gates)

**Use Case:** Multiple reviewers before changes

**Pattern:**
```json
{
  "id": "multi-review",
  "name": "Multi-Reviewer Fleet",
  "tasks": [
    {
      "id": "security-review",
      "agent": "security-reviewer",
      "task": "Review for security issues"
    },
    {
      "id": "performance-review",
      "agent": "performance-reviewer",
      "task": "Review for performance issues"
    },
    {
      "id": "accessibility-review",
      "agent": "accessibility-reviewer",
      "task": "Review for accessibility issues"
    },
    {
      "id": "executor",
      "agent": "code-executor",
      "task": "Implement approved changes",
      "waitFor": ["security-review", "performance-review", "accessibility-review"]
    }
  ]
}
```

**Why it works:**
- Multiple perspectives
- Catches different issues
- Quality gates before execution

**When to use:**
- High-risk changes
- Production deployments
- Public-facing features

### 5. Iterative Refinement

**Use Case:** Progressive improvement

**Pattern:**
```json
{
  "id": "iterative-improvement",
  "name": "Iterative Code Improvement",
  "tasks": [
    {
      "id": "initial-implementation",
      "agent": "code-executor",
      "task": "Implement basic version"
    },
    {
      "id": "performance-optimization",
      "agent": "performance-optimizer",
      "task": "Optimize for performance"
    },
    {
      "id": "readability-improvement",
      "agent": "readability-improver",
      "task": "Improve code readability"
    },
    {
      "id": "final-verification",
      "agent": "quality-verifier",
      "task": "Verify all improvements"
    }
  ]
}
```

**Why it works:**
- Each step improves on previous
- Focused improvements
- Cumulative quality gains

**When to use:**
- Complex implementations
- Legacy code modernization
- Performance-critical code

### 6. Specialist Pipeline

**Use Case:** Domain-specific workflows

**Pattern:**
```json
{
  "id": "api-development",
  "name": "API Development Pipeline",
  "tasks": [
    {
      "id": "schema-designer",
      "agent": "api-schema-designer",
      "task": "Design API schema and endpoints"
    },
    {
      "id": "handler-implementer",
      "agent": "api-handler-implementer",
      "task": "Implement route handlers"
    },
    {
      "id": "validator-adder",
      "agent": "api-validator-adder",
      "task": "Add input validation"
    },
    {
      "id": "test-generator",
      "agent": "api-test-generator",
      "task": "Generate API tests"
    },
    {
      "id": "documenter",
      "agent": "openapi-documenter",
      "task": "Generate OpenAPI documentation"
    }
  ]
}
```

**Why it works:**
- Each agent is domain expert
- Complete feature delivery
- Consistent patterns

**When to use:**
- Repetitive workflows
- Domain-specific tasks
- Standardized processes

---

## Anti-Patterns

### ❌ Too Many Agents

**Bad:**
```json
{
  "tasks": [
    {"agent": "analyzer"},
    {"agent": "validator"},
    {"agent": "checker"},
    {"agent": "reviewer"},
    {"agent": "tester"},
    {"agent": "formatter"},
    {"agent": "optimizer"},
    {"agent": "documenter"}
  ]
}
```

**Why it's bad:**
- Slow execution
- High cost
- Context dilution
- Diminishing returns

**Better:**
```json
{
  "tasks": [
    {"agent": "code-analyzer"},
    {"agent": "code-executor"},
    {"agent": "quality-verifier"}
  ]
}
```

### ❌ Generic Agents

**Bad:**
```json
{
  "tasks": [
    {"agent": "helper", "task": "Fix the code"},
    {"agent": "fixer", "task": "Make it better"}
  ]
}
```

**Why it's bad:**
- Vague responsibilities
- Unpredictable results
- Hard to debug

**Better:**
```json
{
  "tasks": [
    {"agent": "typescript-validator", "task": "Fix type errors"},
    {"agent": "code-formatter", "task": "Format according to ESLint"}
  ]
}
```

### ❌ Overlapping Responsibilities

**Bad:**
```json
{
  "tasks": [
    {"agent": "code-reviewer", "task": "Review and fix code"},
    {"agent": "code-fixer", "task": "Review and fix code"}
  ]
}
```

**Why it's bad:**
- Duplicate work
- Conflicting changes
- Wasted tokens

**Better:**
```json
{
  "tasks": [
    {"agent": "code-reviewer", "task": "Review code and identify issues"},
    {"agent": "code-executor", "task": "Fix identified issues"}
  ]
}
```

### ❌ Missing Verification

**Bad:**
```json
{
  "tasks": [
    {"agent": "code-executor", "task": "Implement feature"}
  ]
}
```

**Why it's bad:**
- No quality check
- Bugs may slip through
- No validation

**Better:**
```json
{
  "tasks": [
    {"agent": "code-executor", "task": "Implement feature"},
    {"agent": "quality-verifier", "task": "Verify implementation"}
  ]
}
```

---

## Examples

### Example 1: Bug Fix Fleet

```json
{
  "id": "bug-fix",
  "name": "Bug Fix Fleet",
  "tasks": [
    {
      "id": "analyzer",
      "agent": "bug-analyzer",
      "task": "Analyze bug report and identify root cause"
    },
    {
      "id": "fixer",
      "agent": "bug-fixer",
      "task": "Implement fix for identified root cause"
    },
    {
      "id": "test-generator",
      "agent": "test-generator",
      "task": "Generate regression test for this bug"
    },
    {
      "id": "verifier",
      "agent": "quality-verifier",
      "task": "Verify fix resolves issue and tests pass"
    }
  ]
}
```

**Usage:**
```bash
carrier deploy bug-fix "Fix authentication timeout issue #123"
```

### Example 2: Feature Implementation Fleet

```json
{
  "id": "feature",
  "name": "Feature Implementation",
  "tasks": [
    {
      "id": "planner",
      "agent": "feature-planner",
      "task": "Plan feature architecture and components"
    },
    {
      "id": "backend-implementer",
      "agent": "backend-implementer",
      "task": "Implement backend API changes"
    },
    {
      "id": "frontend-implementer",
      "agent": "frontend-implementer",
      "task": "Implement frontend UI changes"
    },
    {
      "id": "test-creator",
      "agent": "test-creator",
      "task": "Create integration tests"
    },
    {
      "id": "documenter",
      "agent": "feature-documenter",
      "task": "Update documentation"
    }
  ]
}
```

**Usage:**
```bash
carrier deploy feature "Add user profile editing feature"
```

### Example 3: Security Audit Fleet

```json
{
  "id": "security-audit",
  "name": "Comprehensive Security Audit",
  "tasks": [
    {
      "id": "code-scanner",
      "agent": "security-code-scanner",
      "task": "Scan code for vulnerabilities"
    },
    {
      "id": "dependency-checker",
      "agent": "dependency-checker",
      "task": "Check for vulnerable dependencies"
    },
    {
      "id": "auth-reviewer",
      "agent": "auth-reviewer",
      "task": "Review authentication and authorization"
    },
    {
      "id": "report-generator",
      "agent": "security-reporter",
      "task": "Generate comprehensive security report"
    }
  ]
}
```

**Usage:**
```bash
carrier deploy security-audit "Audit authentication system"
```

### Example 4: Migration Fleet

```json
{
  "id": "migration",
  "name": "Technology Migration",
  "tasks": [
    {
      "id": "analyzer",
      "agent": "migration-analyzer",
      "task": "Analyze current implementation and plan migration"
    },
    {
      "id": "migrator",
      "agent": "code-migrator",
      "task": "Migrate code to new technology"
    },
    {
      "id": "test-updater",
      "agent": "test-updater",
      "task": "Update tests for new technology"
    },
    {
      "id": "validator",
      "agent": "migration-validator",
      "task": "Validate migration maintains functionality"
    }
  ]
}
```

**Usage:**
```bash
carrier deploy migration "Migrate from Redux to Zustand"
```

---

## Design Checklist

When designing a fleet, ensure:

- [ ] Each agent has ONE clear responsibility
- [ ] Tasks are in logical order
- [ ] There's a verification step
- [ ] Agents are specialized (not generic)
- [ ] Fleet has 2-5 tasks (not too many)
- [ ] Each agent's output feeds the next
- [ ] No overlapping responsibilities
- [ ] Task descriptions are specific

---

## Performance Tips

### 1. Order Matters

Put expensive operations last:

✅ **Good:**
```json
["quick-validator", "heavy-analyzer", "code-executor"]
```

❌ **Bad:**
```json
["heavy-analyzer", "quick-validator", "code-executor"]
```

### 2. Minimize Agent Count

Use 2-4 agents when possible:

✅ **Good:**
```json
["analyzer", "executor", "verifier"]
```

❌ **Bad:**
```json
["analyzer", "planner", "validator", "executor", "checker", "tester", "verifier"]
```

### 3. Use Read-Only for Reviews

Set agents to read-only when they only analyze:

```json
{
  "agent": "security-reviewer",
  "config": {
    "readOnly": true
  }
}
```

### 4. Narrow File Scope

Limit file access per agent:

```json
{
  "agent": "frontend-reviewer",
  "config": {
    "files": ["src/components/**/*.tsx"]
  }
}
```

---

## Comparing Fleet Designs

Use the compare command to evaluate different designs:

```bash
# Compare two approaches
carrier compare analyzer-executor analyzer-validator-executor

# See which is faster, cheaper, more reliable
```

---

## Next Steps

1. **Start simple:** Use built-in `code` fleet
2. **Create custom fleet:** Copy and modify pattern
3. **Test and refine:** Deploy and measure results
4. **Compare designs:** Use `carrier compare` to optimize

---

## Related Documentation

- [Agent Creation Guide](./AGENT_CREATION_GUIDE.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [Command Reference](../README.md)

---

**Happy Fleet Building!** 🚀
