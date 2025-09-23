# Architecture

## Components

### Command Registry
Central source of truth for all commands.

```
src/command-registry.ts
- COMMANDS object
- getCommand()
- generateHelp()
- suggestDefaultCommand()
```

### CLI
Routes commands to handlers.

```
src/cli.ts → src/cli-commands.ts
```

### Dispatcher
Ultra-fast command router for Claude Code.

```
src/carrier-dispatch.ts
- Parses input
- Routes to carrier
- Auto-deploys plain text
```

## Directory Structure

```
.carrier/
├── config.json
├── fleets/
│   └── <fleet-id>/
│       ├── <fleet-id>.json
│       └── agents/
└── deployed/
    └── registry.json

.claude/
├── commands.json    # /carrier command
└── subagents.json   # dispatcher agent
```

## Flow

1. User → `/carrier` → Dispatcher → CLI → Command
2. Plain text → Auto-deploy → `carrier deploy code-change`
3. Valid command → Direct execution