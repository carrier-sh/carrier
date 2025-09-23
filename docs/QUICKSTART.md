# Quick Start

## Setup

```bash
# Install
npm install -g carrier

# Initialize project
carrier init

# Setup Claude Code
carrier init claude
```

## Usage

### In Terminal
```bash
carrier deploy code-change "fix auth bug"
carrier status
carrier approve
```

### In Claude Code
```
/carrier → "status"
/carrier → "fix the login issue"
```

## Fleets

Default: `code-change`
- RESEARCH → DESIGN → IMPLEMENTATION

## Config

```bash
carrier config  # Check setup
carrier ls      # List fleets
carrier help    # Get help
```