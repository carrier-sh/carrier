# Carrier 🚀

Hi! 👋

**Fleet Orchestration System for Claude Code**

Carrier is a powerful orchestration system that enables you to deploy and manage complex multi-agent workflows (called "fleets") within Claude Code. It provides a CLI interface for deploying, monitoring, and managing sophisticated agent sequences that can handle complex software engineering tasks.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-000000?style=flat&logo=bun&logoColor=white)](https://bun.sh/)

## 🌟 Features

- **Fleet Orchestration**: Deploy and manage complex multi-agent workflows
- **Task Management**: Coordinate sequential and conditional task execution
- **Real-time Monitoring**: Track deployment status and agent progress
- **Claude Code Integration**: Seamless integration with Claude Code agents
- **Approval Gates**: Human-in-the-loop approval for critical tasks
- **Local & Remote**: Support for both local and cloud-based fleet management
- **TypeScript**: Fully typed for better developer experience

## 🚀 Quick Start

### Installation

```bash
# Install globally via npm
npm install -g @carrier-sh/carrier

# Or install locally in your project
npm install @carrier-sh/carrier
```

### Initialize Carrier

```bash
# Initialize in your project directory
carrier init

# Or initialize globally
carrier init --global
```

### Deploy Your First Fleet

```bash
# Deploy a code change fleet
carrier deploy code-change "Add dark mode toggle to settings"

# Deploy a research fleet
carrier deploy research "Analyze authentication patterns in the codebase"

# Deploy with background execution
carrier deploy code-review "Review API endpoints" --background
```

## 📖 Core Concepts

### Fleets
**Fleets** are sequences of interconnected tasks executed by specialized agents. Each fleet defines:
- **Tasks**: Individual work units with specific objectives
- **Agents**: Specialized AI agents that execute tasks
- **Routing**: Conditional logic for task progression
- **Inputs/Outputs**: Data flow between tasks

### Tasks
**Tasks** are atomic work units within a fleet:
- Executed by specific agent types (e.g., `code-analyzer`, `research-analyst`)
- Can have approval gates for human oversight
- Support conditional routing based on results
- Generate outputs consumed by subsequent tasks

### Deployments
**Deployments** are active instances of fleets:
- Track execution state and progress
- Maintain task history and outputs
- Support pause/resume functionality
- Enable monitoring and debugging

## 🛠 CLI Commands

### Core Operations
```bash
# Deploy a fleet
carrier deploy <fleet-id> "<request>" [--background]

# Check deployment status
carrier status [deployment-id]

# Approve pending tasks
carrier approve [deployment-id]

# Continue execution from current task
carrier execute <deployment-id>

# Clean up completed deployments
carrier clean [deployment-id] [--keep-outputs] [--force]
```

### Fleet Management
```bash
# List available fleets
carrier ls [--remote] [--testing]

# Get fleet configuration
carrier fleet <fleet-id> [--json]

# Pull fleet from API
carrier pull <fleet-id>

# Push local fleet to API
carrier push <fleet-id>

# Remove fleet
carrier rm <fleet-id> [--remote]
```

### System Commands
```bash
# Authenticate with API
carrier auth

# Show current user
carrier whoami

# Show configuration
carrier config

# Get help
carrier help [command]
```

## 📋 Built-in Fleet Types

Carrier comes with several pre-built fleet types:

### `code` - Code Implementation Fleet
Comprehensive code implementation with analysis, planning, execution, and verification.

```bash
carrier deploy code "Implement user authentication with JWT"
```

**Tasks:**
- `code-analyzer`: Analyzes codebase and requirements
- `code-executor`: Implements the requested changes
- `quality-verifier`: Runs tests and validates implementation

### `research` - Research Fleet
In-depth research and analysis of topics, codebases, or technologies.

```bash
carrier deploy research "Research React performance optimization techniques"
```

**Tasks:**
- `research-analyst`: Conducts comprehensive research
- `search-specialist`: Performs targeted information gathering

### `plan` - Planning Fleet
Strategic planning and requirement analysis before implementation.

```bash
carrier deploy plan "Plan microservices architecture for user management"
```

**Tasks:**
- `requirement-analyzer`: Analyzes requirements and constraints
- `code-analyzer`: Reviews existing codebase architecture

## 🔧 Configuration

Carrier stores configuration in `.carrier/config.json`:

```json
{
  "apiUrl": "https://carrier.sh/api",
  "version": "0.2.0",
  "initialized": true,
  "claudeCodeEnabled": true
}
```

### Directory Structure
```
.carrier/
├── config.json          # Main configuration
├── deployed/             # Active deployments
│   ├── registry.json     # Deployment registry
│   └── {id}/            # Individual deployments
│       ├── metadata.json # Deployment metadata
│       ├── request.md    # Original request
│       └── outputs/      # Task outputs
└── fleets/              # Local fleet definitions
    └── {fleet-id}/
        ├── {fleet-id}.json  # Fleet configuration
        └── agents/          # Fleet-specific agents
```

## 📊 Monitoring and Status

### Check Deployment Status
```bash
# List all deployments
carrier status

# Check specific deployment
carrier status 42

# Watch logs in real-time
carrier watch-logs 42 [task-id]
```

### Status Output Example
```
Deployment: 42 (code-001-20241201)
Fleet: code-change
Status: active
Current Task: code-executor

┌─────────────────┬─────────┬────────────────────┐
│ Task            │ Status  │ Agent              │
├─────────────────┼─────────┼────────────────────┤
│ code-analyzer   │ ✅ Done │ code-analyzer      │
│ code-executor   │ ⏳ Active│ code-executor      │
│ quality-verifier│ ⭕ Pending│ quality-verifier   │
└─────────────────┴─────────┴────────────────────┘

Request: Add dark mode toggle to settings
Started: 2024-12-01 10:30:15
```

## 🔄 Task Flow and Approval Gates

Some tasks require human approval before proceeding:

```bash
# Check for approval-required tasks
carrier status 42

# Approve current task
carrier approve 42

# Task continues to next step automatically
```

### Conditional Task Routing
Tasks can route conditionally based on results:

```json
{
  "nextTasks": [
    {
      "taskId": "fix-issues",
      "condition": "failed"
    },
    {
      "taskId": "deploy",
      "condition": "success"
    }
  ]
}
```

## 🧩 Creating Custom Fleets

### Fleet Configuration
Create a fleet configuration file at `.carrier/fleets/my-fleet/my-fleet.json`:

```json
{
  "id": "my-fleet",
  "name": "My Custom Fleet",
  "description": "A custom fleet for specific tasks",
  "version": "1.0.0",
  "tasks": [
    {
      "id": "analyze",
      "description": "Analyze requirements",
      "agent": "code-analyzer",
      "requiresApproval": false,
      "nextTasks": [
        {
          "taskId": "implement",
          "condition": "success"
        }
      ]
    },
    {
      "id": "implement",
      "description": "Implement solution",
      "agent": "code-executor",
      "requiresApproval": true,
      "inputs": [
        {
          "type": "output",
          "source": "analyze"
        }
      ]
    }
  ]
}
```

### Agent Types
Common agent types available:

- `code-analyzer` - Analyzes codebases and requirements
- `code-executor` - Implements code changes and features
- `quality-verifier` - Runs tests and validates implementations
- `research-analyst` - Conducts research and gathers information
- `search-specialist` - Performs targeted searches and information retrieval
- `code-reviewer` - Reviews code for quality and best practices
- `requirement-analyzer` - Analyzes requirements and system architecture

## 🔧 Development

### Prerequisites
- [Bun](https://bun.sh/) >= 1.0.0
- [Node.js](https://nodejs.org/) >= 18
- [Claude Code](https://claude.com/claude-code) (for full integration)

### Setup Development Environment
```bash
# Clone the repository
git clone https://github.com/carrier-sh/carrier.git
cd carrier

# Install dependencies
bun install

# Run in development mode
bun run dev

# Run tests
bun test

# Build the project
bun run build
```

### Available Scripts
```bash
bun run dev         # Run CLI in development mode
bun run build       # Build for production
bun run test        # Run test suite
bun run test:watch  # Run tests in watch mode
bun run lint        # Type check with TypeScript
```

## 🧪 Testing

Carrier includes comprehensive testing support:

```bash
# Run all tests
bun test

# Run specific test files
bun test tests/unit/core.test.ts

# Run tests in watch mode
bun test --watch

# Run API tests
bun run test:api
```

### Test Structure
```
tests/
├── unit/           # Unit tests
├── integration/    # Integration tests
├── helpers/        # Test utilities
└── config/         # Test configuration
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`bun test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to your branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## 📜 License

This project is licensed under the AGPL-3.0-or-later License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Website**: [https://carrier.sh](https://carrier.sh)
- **API Documentation**: [https://carrier.sh/api/openapi.json](https://carrier.sh/api/openapi.json)
- **GitHub**: [https://github.com/carrier-sh/carrier](https://github.com/carrier-sh/carrier)
- **Issues**: [https://github.com/carrier-sh/carrier/issues](https://github.com/carrier-sh/carrier/issues)

## 💡 Examples

### Complex Multi-Step Deployment
```bash
# Deploy a comprehensive code change
carrier deploy code "Implement OAuth2 authentication system"

# Monitor progress
carrier status 43

# Approve intermediate steps when prompted
carrier approve 43

# Check final results
carrier status 43
```

### Research and Analysis
```bash
# Research a technical topic
carrier deploy research "Compare authentication libraries for Node.js"

# Get detailed research output
carrier status 44
cat .carrier/deployed/44/outputs/research-analyst.md
```

### Fleet Customization
```bash
# Create custom fleet locally
# Edit .carrier/fleets/my-custom-fleet/my-custom-fleet.json

# Test the custom fleet
carrier deploy my-custom-fleet "Test custom workflow"

# Push to API for team usage
carrier push my-custom-fleet
```

---

**Built with ❤️ by the Carrier Team**

Ready to orchestrate your next software engineering workflow? Get started with `carrier init` today!