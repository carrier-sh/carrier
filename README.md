# Carrier

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Bun](https://img.shields.io/badge/runtime-bun-ff69b4)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-blue)](https://www.typescriptlang.org/)

> Zero-touch orchestration framework for complex development workflows

Carrier is a CLI tool that manages sophisticated multi-agent workflows through fleet-based execution with subagent delegation, conditional routing, and approval gates. It integrates seamlessly with Claude Code to enable complex development tasks.

## ✨ Features

- **Fleet-Based Orchestration**: Reusable workflow templates with task sequencing
- **Subagent Delegation**: Each task runs with dedicated AI agents and fresh context
- **Conditional Routing**: Smart task routing based on execution outcomes
- **Approval Gates**: Human oversight at critical workflow points
- **Claude Code Integration**: Native support for `/carrier` commands
- **Remote API**: Cloud-based fleet management with GitHub OAuth
- **File-Based State**: No database required - uses JSON persistence

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0.0 or later
- Git
- Node.js compatible environment

### Installation

```bash
# Clone the repository
git clone https://github.com/carrier-sh/carrier.git
cd carrier

# Install dependencies
bun install

# Build the project
bun run build

# Initialize Carrier (local project)
carrier init

# Or initialize globally (system-wide)
carrier init --global

# Optional: Enable autocomplete
echo "source $(pwd)/scripts/autocomplete.sh" >> ~/.bashrc
```

### First Deployment

```bash
# List available fleets
carrier ls

# Deploy a fleet with your request
carrier deploy simple-code-change "Add error handling to the login function"

# Check status
carrier status
```

## 📖 Documentation

### Core Concepts

#### Fleet
Reusable workflow blueprint defining tasks, routing, and approval points.

```json
{
  "id": "example-fleet",
  "description": "Example workflow",
  "tasks": [
    {
      "id": "analyzer", 
      "agent": "code-analyzer.md",
      "nextTasks": [{"taskId": "executor", "condition": "success"}]
    }
  ]
}
```

#### Deployed Fleet
Active instance executing tasks with isolated state and outputs.

#### Task
Individual work unit executed by specialized AI agents with defined inputs and outputs.

### Authentication

```bash
# Authenticate with GitHub OAuth
carrier auth

# Check current user
carrier whoami

# Logout
carrier logout
```

### Fleet Management

```bash
# List fleets
carrier ls                    # Remote fleets
carrier ls --testing          # Local fleets

# Push/pull fleets
carrier push my-fleet         # To remote
carrier pull code-review      # From remote

# Remove fleets
carrier rm my-fleet --remote  # From remote
carrier rm my-fleet --testing # From local
```

### Deployment Operations

```bash
# Deploy a fleet
carrier deploy <fleet-id> "<your request>"

# Approve pending tasks
carrier approve [deployed-id]

# Check deployment status
carrier status [deployed-id]
```

## 🏗️ Architecture

### Object Model

- **Agent**: Markdown file containing AI agent prompt
- **Fleet**: Workflow template with task definitions and routing
- **DeployedFleet**: Active workflow instance with isolated execution
- **Task**: Work unit with inputs, outputs, and conditional routing

### Execution Flow

```
User Request → Fleet → Tasks → Subagents → Outputs → Routing → Completion
```

### Directory Structure

```
carrier/
├── src/                      # Source code
│   ├── cli.ts               # CLI entry point
│   ├── core.ts              # Core orchestration engine
│   ├── cli-commands.ts      # Command implementations
│   └── command-registry.ts  # Command definitions
├── seed/                     # System templates
│   ├── agents/              # Default agents
│   └── fleets/              # Default fleets
├── .carrier/                 # Runtime state (created on init)
│   ├── config.json          # Configuration
│   ├── fleets/              # Fleet templates
│   └── deployed/            # Active deployments
├── tests/                    # Test suite
├── docs/                     # Documentation
└── package.json             # Project configuration
```

## 🛠️ Development

### Setup

```bash
# Install dependencies
bun install

# Development mode
bun run dev

# Type checking
bun run lint

# Run tests
bun test
```

### Building

```bash
# Production build
bun run build

# Development build with watch
bun run dev
```

### Testing

```bash
# Run all tests
bun test

# Run specific test suite
bun test tests/unit/
bun test tests/integration/

# Watch mode
bun run test:watch
```

## 📚 Commands Reference

| Command | Description |
|---------|-------------|
| **Authentication** | |
| `carrier auth` | Authenticate with GitHub OAuth |
| `carrier whoami` | Show current user |
| `carrier logout` | Logout from API |
| **Fleet Management** | |
| `carrier ls [--remote\|--testing]` | List available fleets |
| `carrier push <fleet-id> [--testing]` | Push fleet to remote/local |
| `carrier pull <fleet-id> [--testing]` | Pull fleet from remote/local |
| `carrier rm <fleet-id> [--remote\|--testing]` | Remove fleet |
| **Deployment** | |
| `carrier deploy <fleet-id> <request>` | Deploy fleet with request |
| `carrier approve [deployed-id]` | Approve pending task |
| `carrier status [deployed-id]` | View deployment status |
| **System** | |
| `carrier init [--global] [--no-claude]` | Initialize Carrier |
| `carrier config` | Show configuration |
| `carrier uninstall [--global] [--all]` | Uninstall Carrier |
| `carrier help [command]` | Show help |

### Command Flags

- **init**: `--global`, `--no-claude`, `--dev`
- **ls**: `--remote`, `--testing`
- **push/pull**: `--testing`
- **rm**: `--remote`, `--testing`
- **status**: `--verbose`, `--json`
- **config**: `--json`
- **uninstall**: `--global`, `--all`, `--force`

## 🌐 API Integration

- **Production API**: https://carrier.sh/api
- **API Documentation**: https://carrier.sh/api/openapi.json
- **Authentication**: OAuth 2.0 with GitHub
- **Local Development**: Configure `.env` for local API testing

## 🔧 Configuration

### Environment Variables

Create `.env` for local development:

```env
# Local API endpoint
CARRIER_API_URL=http://localhost:3000/api

# Callback port (default: 8123)
CARRIER_CALLBACK_PORT=8124

# Debug logging
CARRIER_DEBUG=true
```

### Runtime Configuration

Located at `.carrier/config.json` after initialization.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Add tests for new features
- Update documentation as needed
- Use conventional commits
- Ensure all tests pass

## 📄 License

This project is licensed under the GNU Affero General Public License v3.0 or later. See the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/carrier-sh/carrier/issues)
- **API Reference**: https://carrier.sh/api/openapi.json

## 🙏 Acknowledgments

- Built with [Bun](https://bun.sh) runtime
- Powered by [Claude Code](https://claude.ai/code) integration
- Inspired by modern DevOps orchestration patterns