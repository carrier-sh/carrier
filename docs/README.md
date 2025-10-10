# Carrier Documentation

Complete guides for using Carrier to orchestrate AI agent fleets.

## 📚 Documentation Index

### Getting Started
- **[Main README](../README.md)** - Project overview and quick start
- **[Installation](../README.md#installation)** - How to install Carrier

### User Guides
1. **[Agent Creation Guide](./AGENT_CREATION_GUIDE.md)** - Create and customize agents
   - What are agents
   - Creating agents (interactive & CLI)
   - Agent configuration
   - Best practices
   - Examples

2. **[Fleet Design Patterns](./FLEET_PATTERNS.md)** - Design effective multi-agent workflows
   - Basic patterns (Analyze → Execute → Verify)
   - Advanced patterns (Parallel review, Iterative refinement)
   - Anti-patterns to avoid
   - Performance tips

3. **[Troubleshooting Guide](./TROUBLESHOOTING.md)** - Solve common problems
   - Installation issues
   - Deployment problems
   - Agent issues
   - Performance problems
   - Error messages

### Quick Reference

#### Common Commands
```bash
# Deploy a fleet
carrier deploy <fleet> "<task>"

# Check status
carrier status [id]

# View logs
carrier logs <id>

# Watch live
carrier watch <id>

# Get summary
carrier summary <id>

# Create agent
carrier agent create --interactive

# Compare agents
carrier compare agent1 agent2

# List deployments
carrier status --all
```

#### File Locations
```
.carrier/
├── config.json              # Carrier configuration
├── agents/                  # Custom agents
│   └── <agent>.md          # Agent definition
├── fleets/                  # Fleet templates
│   └── <fleet>/
│       └── <fleet>.json    # Fleet configuration
└── deployed/                # Deployment history
    ├── registry.json        # Deployment registry
    └── <id>/               # Deployment data
        ├── metadata.json    # Deployment metadata
        ├── context/         # Task context
        ├── streams/         # Event streams
        └── outputs/         # Agent outputs
```

---

## 📖 Documentation by Task

### I want to...

**...create a custom agent**
→ [Agent Creation Guide](./AGENT_CREATION_GUIDE.md)

**...design a multi-agent workflow**
→ [Fleet Design Patterns](./FLEET_PATTERNS.md)

**...fix a deployment issue**
→ [Troubleshooting Guide](./TROUBLESHOOTING.md#deployment-problems)

**...improve agent performance**
→ [Troubleshooting Guide](./TROUBLESHOOTING.md#performance-problems)

**...compare two agents**
```bash
carrier compare agent1 agent2
```

**...see what a deployment did**
```bash
carrier summary <id>
```

**...stop a running deployment**
```bash
carrier stop <id>
```

---

## 🎓 Learning Path

### Beginner
1. Read [Main README](../README.md)
2. Run your first deployment: `carrier deploy code "Add comment to README"`
3. Check results: `carrier summary 1`
4. Create your first agent: `carrier agent create --interactive`

### Intermediate
1. Read [Agent Creation Guide](./AGENT_CREATION_GUIDE.md)
2. Create specialized agents for your workflow
3. Read [Fleet Design Patterns](./FLEET_PATTERNS.md)
4. Design custom fleets

### Advanced
1. Compare agent performance: `carrier compare agent1 agent2`
2. Optimize fleet designs for speed and cost
3. Create domain-specific agent pipelines
4. Contribute patterns back to documentation

---

## 🔍 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Command not found | `bun src/cli.ts <command>` or check installation |
| Deployment stuck | `carrier stop <id>` and retry |
| Agent not found | `carrier agent list` to see available agents |
| Poor agent results | Improve purpose statement, add frameworks |
| High token usage | Narrow file scope, use read-only mode |
| Unknown flag | `carrier <command> --help` |

Full troubleshooting: [Troubleshooting Guide](./TROUBLESHOOTING.md)

---

## 💡 Best Practices

### Agent Design
- ✅ One agent, one responsibility
- ✅ Specific purpose statements
- ✅ Narrow file patterns
- ✅ Use read-only for reviews
- ❌ Don't make generic "helper" agents

### Fleet Design
- ✅ 2-4 agents per fleet
- ✅ Always include verification step
- ✅ Sequential: Analyze → Execute → Verify
- ❌ Don't create overly complex fleets
- ❌ Don't overlap responsibilities

### Deployment
- ✅ Watch deployments: `carrier deploy --watch`
- ✅ Review results: `carrier summary <id>`
- ✅ Compare approaches: `carrier compare agent1 agent2`
- ❌ Don't deploy and forget
- ❌ Don't skip verification

---

## 📊 Examples

### Example 1: Security Review

**Create Agent:**
```bash
carrier agent create \
  --name security-reviewer \
  --purpose "Review TypeScript code for security vulnerabilities" \
  --files "src/**/*.ts" \
  --read-only \
  --tone detailed
```

**Deploy:**
```bash
carrier deploy code "Review authentication system for security issues"
```

**Review Results:**
```bash
carrier summary 1
carrier logs 1
```

### Example 2: Test Generation

**Create Agent:**
```bash
carrier agent create \
  --name test-generator \
  --purpose "Generate Jest unit tests for React components" \
  --files "src/components/**/*.tsx" \
  --frameworks "Jest, React Testing Library"
```

**Deploy:**
```bash
carrier deploy code "Generate tests for UserProfile component"
```

**Compare with Alternative:**
```bash
carrier compare test-generator vitest-generator
```

---

## 🚀 Advanced Features

### Historical Comparison
Compare agents across past deployments:
```bash
carrier compare code-analyzer code-executor
```

Shows:
- Average duration
- Token usage
- Success rate
- Cost per run
- Recommendation

### Deployment Summary
Get complete deployment breakdown:
```bash
carrier summary <id>
```

Shows:
- Task durations
- File operations
- Token usage
- Estimated cost
- Cache savings

### Benchmark
Compare multiple agents on the same task:
```bash
carrier benchmark "Review code quality" --agents=reviewer1,reviewer2,reviewer3
```

---

## 📁 Documentation Files

| File | Description |
|------|-------------|
| [AGENT_CREATION_GUIDE.md](./AGENT_CREATION_GUIDE.md) | Complete guide to creating agents |
| [FLEET_PATTERNS.md](./FLEET_PATTERNS.md) | Multi-agent workflow patterns |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common issues and solutions |
| README.md | This file - documentation index |

---

## 🤝 Contributing

Found a bug? Have a question? Want to improve docs?

1. Check [Troubleshooting Guide](./TROUBLESHOOTING.md) first
2. Search existing issues
3. File new issue with details

---

## 📝 License

AGPL-3.0-or-later

---

**Happy building with Carrier!** 🚀
