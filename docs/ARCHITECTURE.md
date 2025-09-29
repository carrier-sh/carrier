# Architecture

## Components

### Command Registry
Central source of truth for all commands.

```
src/registry.ts
- COMMANDS object
- getCommand()
- generateHelp()
- suggestDefaultCommand()
```

### CLI
Main entry point and command router.

```
src/cli.ts → src/commands.ts → src/commands/*.ts
```

### Task Execution System
Manages task orchestration and execution.

```
src/executor.ts (TaskExecutor)
- Orchestrates task execution
- Manages task transitions
- Handles detached execution

src/dispatcher.ts (TaskDispatcher)
- Manages AI providers
- Routes tasks to providers
- Handles provider configuration

src/detached.ts (DetachedExecutor)
- Spawns background processes
- Manages PID tracking
- Handles process termination
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