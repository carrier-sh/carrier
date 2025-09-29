/**
 * Centralized Command Registry
 * Single source of truth for all carrier commands
 */

import { Command } from './types/index.js';

export const COMMANDS: Record<string, Command> = {
  auth: {
    name: 'auth',
    aliases: ['login'],
    description: 'Authenticate with Carrier API via GitHub OAuth',
    usage: 'carrier auth',
    examples: ['carrier auth'],
    category: 'system',
    requiresInit: false
  },

  whoami: {
    name: 'whoami',
    description: 'Show current authenticated user information',
    usage: 'carrier whoami',
    examples: ['carrier whoami'],
    category: 'system',
    requiresInit: false
  },

  logout: {
    name: 'logout',
    description: 'Logout from Carrier API',
    usage: 'carrier logout',
    examples: ['carrier logout'],
    category: 'system',
    requiresInit: false
  },

  deploy: {
    name: 'deploy',
    aliases: ['d'],
    description: 'Deploy a fleet with a request',
    usage: 'carrier deploy <fleet-id> "<request>" [--detach] [--watch]',
    examples: [
      'carrier deploy code-change "Add dark mode to settings"',
      'carrier deploy code-change "Add dark mode" --detach  # Run in background',
      'carrier deploy code-change "Add dark mode" --watch   # Deploy with live monitoring',
      'carrier deploy test-suite "Write tests for auth module"'
    ],
    category: 'core',
    requiresInit: true
  },
  
  approve: {
    name: 'approve',
    aliases: ['a'],
    description: 'Approve current task to proceed',
    usage: 'carrier approve [deployment-id]',
    examples: ['carrier approve', 'carrier approve fleet-abc123'],
    category: 'core',
    requiresInit: true
  },
  
  status: {
    name: 'status',
    aliases: ['s'],
    description: 'Check status of deployments with enhanced details',
    usage: 'carrier status [deployment-id] [--all] [--streams]',
    examples: [
      'carrier status                    # Show active deployments',
      'carrier status fleet-xyz789       # Show specific deployment',
      'carrier status --all              # Show all deployments',
      'carrier status fleet-xyz789 --streams  # Include stream statistics'
    ],
    category: 'core',
    requiresInit: true
  },
  
  
  ls: {
    name: 'ls',
    aliases: ['list'],
    description: 'List fleets (default: local, --remote: API, --testing: test folder)',
    usage: 'carrier ls [--remote] [--testing]',
    examples: ['carrier ls', 'carrier ls --remote', 'carrier ls --testing'],
    category: 'fleet',
    requiresInit: true
  },
  
  pull: {
    name: 'pull',
    description: 'Pull fleet from API (default) or testing folder (--testing)',
    usage: 'carrier pull <fleet-id> [--testing]',
    examples: ['carrier pull code-review', 'carrier pull code-review --testing'],
    category: 'fleet',
    requiresInit: true
  },

  push: {
    name: 'push',
    description: 'Push fleet to API (default) or testing folder (--testing)',
    usage: 'carrier push <fleet-id> [--testing]',
    examples: ['carrier push my-fleet', 'carrier push my-fleet --testing'],
    category: 'fleet',
    requiresInit: true
  },
  
  rm: {
    name: 'rm',
    aliases: ['remove'],
    description: 'Remove fleet locally (default), from API (--remote), or testing (--testing)',
    usage: 'carrier rm <fleet-id> [--remote] [--testing]',
    examples: ['carrier rm old-fleet', 'carrier rm old-fleet --remote', 'carrier rm old-fleet --testing'],
    category: 'fleet',
    requiresInit: true
  },
  
  init: {
    name: 'init',
    description: 'Initialize carrier and Claude Code integration',
    usage: 'carrier init [--global] [--no-claude] [--dev]',
    examples: [
      'carrier init                  # Initialize locally with Claude Code',
      'carrier init --global         # Initialize globally with Claude Code',
      'carrier init --no-claude      # Initialize without Claude Code',
      'carrier init --dev            # Initialize in dev mode (use npm run dev instead of carrier)'
    ],
    category: 'system',
    requiresInit: false
  },
  
  config: {
    name: 'config',
    aliases: ['cfg'],
    description: 'Show carrier configuration',
    usage: 'carrier config',
    examples: ['carrier config'],
    category: 'system',
    requiresInit: false
  },
  
  help: {
    name: 'help',
    aliases: ['--help', '-h'],
    description: 'Show help information',
    usage: 'carrier help [command]',
    examples: ['carrier help', 'carrier help deploy'],
    category: 'system',
    requiresInit: false
  },
  
  uninstall: {
    name: 'uninstall',
    description: 'Uninstall carrier and remove all configurations',
    usage: 'carrier uninstall [--global] [--all] [--force]',
    examples: [
      'carrier uninstall         # Remove local installation',
      'carrier uninstall --global # Remove global installation',
      'carrier uninstall --all    # Remove both local and global',
      'carrier uninstall --force  # Skip confirmation prompt'
    ],
    category: 'system',
    requiresInit: false
  },

  fleet: {
    name: 'fleet',
    aliases: ['f'],
    description: 'Get fleet configuration',
    usage: 'carrier fleet <fleet-id> [--json]',
    examples: [
      'carrier fleet code-change',
      'carrier fleet code-change --json'
    ],
    category: 'fleet',
    requiresInit: true
  },




  clean: {
    name: 'clean',
    aliases: ['cleanup'],
    description: 'Clean up deployment resources or all completed fleets',
    usage: 'carrier clean [deployed-id] [--keep-outputs] [--force]',
    examples: [
      'carrier clean                     # Clean all completed fleets',
      'carrier clean fleet-abc123        # Clean specific deployment',
      'carrier clean fleet-abc123 --keep-outputs  # Clean but keep outputs',
      'carrier clean --force             # Clean all completed fleets without confirmation'
    ],
    category: 'core',
    requiresInit: true
  },

  'watch': {
    name: 'watch',
    aliases: ['w'],
    description: 'Watch fleet execution in real-time with detailed agent activity',
    usage: 'carrier watch <deployment-id> [--no-follow] [--tail=<n>] [--filter=<pattern>]',
    examples: [
      'carrier watch abc123              # Watch deployment live',
      'carrier watch abc123 --tail=50    # Show last 50 events and follow',
      'carrier watch abc123 --no-follow  # Show logs and exit',
      'carrier watch abc123 --filter="tool_use"  # Only show tool usage'
    ],
    category: 'core',
    requiresInit: true
  },

  'logs': {
    name: 'logs',
    aliases: ['l'],
    description: 'View and tail fleet execution logs',
    usage: 'carrier logs <deployment-id> [-f] [--tail=<n>] [--streams]',
    examples: [
      'carrier logs abc123              # Show all logs',
      'carrier logs abc123 -f           # Follow logs in real-time',
      'carrier logs abc123 --tail=50    # Show last 50 lines',
      'carrier logs abc123 --streams    # Show detailed stream events'
    ],
    category: 'core',
    requiresInit: true
  },

  'stop': {
    name: 'stop',
    aliases: ['cancel'],
    description: 'Stop/cancel a running deployment',
    usage: 'carrier stop <deployment-id> [--force]',
    examples: [
      'carrier stop 5                   # Stop deployment 5 with confirmation',
      'carrier stop 5 --force           # Force stop without confirmation',
      'carrier stop --all               # Stop all active deployments',
      'carrier cancel 5                 # Same as stop (alias)'
    ],
    category: 'core',
    requiresInit: true
  },

  'resume': {
    name: 'resume',
    aliases: ['continue'],
    description: 'Resume a stopped/cancelled deployment with context',
    usage: 'carrier resume <deployment-id> [--force] [--from-start]',
    examples: [
      'carrier resume 5                 # Resume deployment 5 from where it stopped',
      'carrier resume 5 --force         # Resume without confirmation',
      'carrier resume 5 --from-start    # Restart from the beginning',
      'carrier continue 5               # Same as resume (alias)'
    ],
    category: 'core',
    requiresInit: true
  }
};

// Helper to get command by name or alias
export function getCommand(name: string): Command | undefined {
  // Direct match
  if (COMMANDS[name]) {
    return COMMANDS[name];
  }
  
  // Check aliases
  for (const cmd of Object.values(COMMANDS)) {
    if (cmd.aliases?.includes(name)) {
      return cmd;
    }
  }
  
  return undefined;
}

// Get all commands by category
export function getCommandsByCategory(category: 'core' | 'fleet' | 'system'): Command[] {
  return Object.values(COMMANDS).filter(cmd => cmd.category === category);
}

// Generate help text
export function generateHelp(commandName?: string): string {
  if (commandName) {
    const cmd = getCommand(commandName);
    if (!cmd) {
      return `Unknown command: ${commandName}\nRun "carrier help" for available commands`;
    }
    
    let help = `\n${cmd.name.toUpperCase()}\n`;
    help += `${cmd.description}\n\n`;
    help += `Usage: ${cmd.usage}\n`;
    
    if (cmd.aliases && cmd.aliases.length > 0) {
      help += `\nAliases: ${cmd.aliases.join(', ')}\n`;
    }
    
    if (cmd.examples && cmd.examples.length > 0) {
      help += `\nExamples:\n`;
      cmd.examples.forEach(ex => {
        help += `  ${ex}\n`;
      });
    }
    
    return help;
  }
  
  // General help
  let help = `Carrier - Fleet Orchestration System\n\n`;
  help += `Usage: carrier <command> [options]\n\n`;
  
  // Core commands
  help += `Core Commands:\n`;
  getCommandsByCategory('core').forEach(cmd => {
    help += `  ${cmd.name.padEnd(12)} ${cmd.description}\n`;
  });
  
  help += `\nFleet Management:\n`;
  getCommandsByCategory('fleet').forEach(cmd => {
    help += `  ${cmd.name.padEnd(12)} ${cmd.description}\n`;
  });
  
  help += `\nSystem Commands:\n`;
  getCommandsByCategory('system').forEach(cmd => {
    help += `  ${cmd.name.padEnd(12)} ${cmd.description}\n`;
  });
  
  help += `\nExamples:\n`;
  help += `  carrier init                                    # Initialize project\n`;
  help += `  carrier deploy code-change "Add feature X"      # Deploy fleet\n`;
  help += `  carrier status                                  # Check status\n`;
  help += `  carrier config                                  # Show configuration\n`;
  
  help += `\nFor command-specific help: carrier help <command>\n`;
  
  return help;
}

// Generate default command suggestion
export function suggestDefaultCommand(input: string): string {
  // If no valid command found, suggest the most likely one
  const suggestion = `carrier deploy code-change "${input || 'your request here'}"`;
  return `\nDid you mean to deploy a fleet?\nTry: ${suggestion}\n`;
}