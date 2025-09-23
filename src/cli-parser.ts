/**
 * CLI Parser - Enhanced command line parsing with flag support
 */

import { ParsedCommand, CommandFlag } from './types/index.js';

export class CLIParser {
  /**
   * Parse command line arguments into structured format
   */
  static parse(argv: string[]): ParsedCommand {
    const result: ParsedCommand = {
      command: '',
      args: [],
      flags: {},
      help: false
    };

    // Skip first two args (node and script path)
    const args = argv.slice(2);
    
    if (args.length === 0) {
      result.help = true;
      return result;
    }

    // Extract command (first non-flag argument)
    let commandIndex = -1;
    for (let i = 0; i < args.length; i++) {
      if (!args[i].startsWith('-')) {
        result.command = args[i];
        commandIndex = i;
        break;
      }
    }

    // Parse remaining arguments
    let i = 0;
    while (i < args.length) {
      const arg = args[i];
      
      // Skip the command itself
      if (i === commandIndex) {
        i++;
        continue;
      }
      
      // Check for help flags
      if (arg === '--help' || arg === '-h' || arg === 'help') {
        result.help = true;
        i++;
        continue;
      }
      
      // Parse flags
      if (arg.startsWith('--')) {
        const flagName = arg.slice(2);
        
        // Check if next arg is a value for this flag
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          result.flags[flagName] = args[i + 1];
          i += 2;
        } else {
          result.flags[flagName] = true;
          i++;
        }
      } else if (arg.startsWith('-')) {
        // Short flags
        const flagName = arg.slice(1);
        result.flags[flagName] = true;
        i++;
      } else {
        // Regular arguments
        result.args.push(arg);
        i++;
      }
    }

    return result;
  }

  /**
   * Validate flags against allowed flags for a command
   */
  static validateFlags(
    flags: Record<string, boolean | string>,
    allowedFlags: string[],
    command: string
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (const flag of Object.keys(flags)) {
      if (!allowedFlags.includes(flag)) {
        errors.push(`Unknown flag '--${flag}' for command '${command}'`);
        
        // Suggest similar flags
        const suggestions = allowedFlags.filter(f => 
          f.toLowerCase().includes(flag.toLowerCase()) ||
          flag.toLowerCase().includes(f.toLowerCase())
        );
        
        if (suggestions.length > 0) {
          errors.push(`  Did you mean: ${suggestions.map(s => `--${s}`).join(', ')}?`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Format usage string with proper flag descriptions
   */
  static formatUsage(
    command: string,
    flags: CommandFlag[]
  ): string {
    let usage = `Usage: carrier ${command}`;
    
    // Add optional flags to usage line
    if (flags.length > 0) {
      usage += ' [options]';
    }
    
    // Add flag descriptions
    if (flags.length > 0) {
      usage += '\n\nOptions:\n';
      
      const maxFlagLength = Math.max(...flags.map(f => {
        const flagStr = f.shorthand ? `-${f.shorthand}, --${f.name}` : `    --${f.name}`;
        return flagStr.length;
      }));
      
      for (const flag of flags) {
        const flagStr = flag.shorthand 
          ? `-${flag.shorthand}, --${flag.name}`
          : `    --${flag.name}`;
        
        usage += `  ${flagStr.padEnd(maxFlagLength + 2)} ${flag.description}\n`;
      }
    }
    
    return usage;
  }

  /**
   * Check if help is requested for a specific command
   */
  static isHelpRequested(parsed: ParsedCommand): boolean {
    return parsed.help || parsed.flags['help'] === true || parsed.flags['h'] === true;
  }
}

/**
 * Command flag definitions
 */
export const COMMAND_FLAGS: Record<string, CommandFlag[]> = {
  init: [
    { name: 'global', description: 'Initialize globally (system-wide)', shorthand: 'g' },
    { name: 'no-claude', description: 'Skip Claude Code integration setup' },
    { name: 'dev', description: 'Initialize in dev mode (use package manager run dev instead of carrier)', shorthand: 'd' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  deploy: [
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  approve: [
    { name: 'all', description: 'Approve all awaiting fleets', shorthand: 'a' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  status: [
    { name: 'verbose', description: 'Show detailed status information', shorthand: 'v' },
    { name: 'json', description: 'Output status in JSON format' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  monitor: [
    { name: 'refresh', description: 'Auto-refresh interval in seconds', shorthand: 'r' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  ls: [
    { name: 'remote', description: 'List remote fleets from API', shorthand: 'r' },
    { name: 'testing', description: 'List fleets from testing folder' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  pull: [
    { name: 'testing', description: 'Pull from testing folder instead of API' },
    { name: 'force', description: 'Overwrite existing fleet', shorthand: 'f' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  push: [
    { name: 'testing', description: 'Push to testing folder instead of API' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  rm: [
    { name: 'remote', description: 'Remove fleet from remote API' },
    { name: 'testing', description: 'Remove fleet from testing folder' },
    { name: 'force', description: 'Force removal without confirmation', shorthand: 'f' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  config: [
    { name: 'json', description: 'Output configuration in JSON format' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  uninstall: [
    { name: 'global', description: 'Uninstall global installation', shorthand: 'g' },
    { name: 'all', description: 'Uninstall both local and global installations', shorthand: 'a' },
    { name: 'force', description: 'Skip confirmation prompt', shorthand: 'f' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  'execute-task': [
    { name: 'agent-type', description: 'Type of agent to use for execution' },
    { name: 'prompt', description: 'Prompt to send to the agent' },
    { name: 'timeout', description: 'Execution timeout in seconds (default: 300)' },
    { name: 'background', description: 'Run task in background', shorthand: 'b' },
    { name: 'wait', description: 'Wait for task to complete', shorthand: 'w' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  'task-status': [
    { name: 'json', description: 'Output status in JSON format' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  'save-output': [
    { name: 'content', description: 'Content to save as task output' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  'update-task': [
    { name: 'status', description: 'New status for the task' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  'update-fleet': [
    { name: 'status', description: 'New status for the fleet' },
    { name: 'current-task', description: 'Current task being executed' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  'get-output': [
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  fleet: [
    { name: 'json', description: 'Output fleet configuration in JSON format' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  'get-context': [
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  'clean': [
    { name: 'keep-outputs', description: 'Keep task outputs when cleaning up' },
    { name: 'force', description: 'Skip confirmation when removing all completed deployments', shorthand: 'f' },
    { name: 'help', description: 'Show help for this command', shorthand: 'h' }
  ],
  help: []
};