# Carrier - Navigation Guide for AI Agents

Quick reference for navigating the Carrier codebase. This guide tells you WHERE to find things, not what they are.

## Quick Reference - File Locations

### Core System Files
- **Main entry point**: `src/cli.ts`
- **Core orchestration logic**: `src/core.ts` (CarrierCore class)
- **Command implementations**: `src/commands.ts` (CLICommands class)
- **Individual commands**: `src/commands/*.ts`
- **Command registry**: `src/registry.ts`
- **Argument parsing**: `src/parser.ts`
- **Task orchestration**: `src/executor.ts` (TaskExecutor class)
- **Provider management**: `src/dispatcher.ts` (TaskDispatcher class)
- **Background processes**: `src/detached.ts` (DetachedExecutor class)
- **Package configuration**: `package.json`
- **TypeScript config**: `tsconfig.json`

### Type Definitions & Interfaces
- **All interfaces** (Agent, Fleet, Task, DeployedFleet): `src/core.ts`
- **CLI types**: `src/parser.ts`
- **Provider types**: `src/types/index.ts`

### Configuration & State
- **Runtime config**: `.carrier/config.json`
- **Deployment registry**: `.carrier/deployed/registry.json`
- **Fleet templates**: `.carrier/fleets/{fleet-id}/{fleet-id}.json`
- **Deployment metadata**: `.carrier/deployed/{deployment-id}/metadata.json`
- **Task outputs**: `.carrier/deployed/{deployment-id}/outputs/{task-id}.md`

### Templates & Seed Data
- **System agents**: `seed/agents/`
- **Fleet templates**: `seed/fleets/`
- **Command templates**: `seed/commands/`

### Testing
- **Test configuration**: `tests/config/test.config.ts`
- **Test helpers**: `tests/helpers/`
- **Unit tests**: `tests/unit/`
- **Integration tests**: `tests/integration/`

### Claude Code Integration
- **Generated commands**: `.claude/commands/`
- **Generated agents**: `.claude/agents/`

### API & External Services
- **Production API**: https://carrier.sh/api
- **API documentation**: https://carrier.sh/api/openapi.json
- **Environment config**: `.env` (for local development)
- **Hetzner secrets**: `../hetzner/secrets/.env`

## Navigation Patterns

### Finding Command Logic
1. Check command name in `src/registry.ts`
2. Find implementation in `src/commands.ts` or `src/commands/{command}.ts`
3. Look for core logic in `src/core.ts`

### Finding Fleet Configuration
1. Check `.carrier/fleets/{fleet-id}/{fleet-id}.json` for template
2. Check `seed/fleets/` for examples
3. See `src/core.ts` for Fleet interface definition

### Finding Task Routing Logic
1. Task definitions: `src/core.ts` Task interface
2. Routing implementation: `src/core.ts` CarrierCore.executeTask()
3. Condition types: Search `src/core.ts` for routing conditions

### Finding Test Files
1. Unit tests: `tests/unit/{feature}.test.ts`
2. Integration tests: `tests/integration/{feature}.test.ts`
3. Test helpers: `tests/helpers/{utility}.ts`

### Finding Build & Scripts
1. Build configuration: `package.json` scripts section
2. TypeScript settings: `tsconfig.json`
3. Development commands: `package.json` scripts

### Finding Documentation
1. User documentation: `README.md`
2. Test documentation: `docs/testing.md`
3. Configuration docs: `docs/configuration.md`
4. API spec: https://carrier.sh/api/openapi.json

## Environment Variables
Search for `process.env` in:
- `src/cli.ts`
- `src/core.ts`
- `src/commands.ts`
- `src/executor.ts`

## Debug Information
Check these files for debug patterns:
- `src/cli.ts` - CLI debug flags
- `src/core.ts` - Core debug logging
- Environment: `CARRIER_DEBUG=true`

## DO NOT MODIFY
- Files in `seed/` directory (system agents and templates)

## License
AGPL-3.0-or-later - see `LICENSE` file
