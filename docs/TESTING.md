# Testing

## Run Tests

```bash
bun test                    # All tests
bun test command-registry   # Registry tests
bun test carrier-dispatch   # Dispatcher tests
bun test cli-commands       # CLI tests
bun test integration        # Integration tests
```

## Test Structure

```
src/__tests__/
├── command-registry.test.ts  # Registry logic
├── carrier-dispatch.test.ts  # Dispatcher routing
├── cli-commands.test.ts      # CLI commands
└── integration/
    └── claude-code.test.ts   # Claude integration
```

## Coverage Areas

- Command registry (aliases, help, suggestions)
- Dispatcher (routing, auto-deploy)
- CLI commands (init, config, deploy)
- Claude Code setup (files, structure)

## Key Tests

- Command lookup by name/alias
- Auto-deploy for plain text
- Claude config generation
- Fleet initialization
- Config detection