# Testing

## Run Tests

```bash
bun test                    # All tests
bun test registry           # Registry tests
bun test commands           # CLI commands tests
bun test executor           # Task executor tests
bun test integration        # Integration tests
```

## Test Structure

```
src/__tests__/
├── registry.test.ts          # Registry logic
├── commands.test.ts          # CLI commands
├── executor.test.ts          # Task executor
├── dispatcher.test.ts        # Provider dispatcher
└── integration/
    └── claude-code.test.ts   # Claude integration
```

## Coverage Areas

- Command registry (aliases, help, suggestions)
- Task execution (orchestration, transitions)
- Provider management (Claude integration)
- CLI commands (init, config, deploy, stop, resume)
- Background process management

## Key Tests

- Command lookup by name/alias
- Auto-deploy for plain text
- Claude config generation
- Fleet initialization
- Config detection