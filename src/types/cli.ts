/**
 * CLI Types
 * Command line interface and argument parsing types
 */

// Parsed command structure
export interface ParsedCommand {
  command: string;
  args: string[];
  flags: Record<string, boolean | string>;
  help: boolean;
}

// Command definition
export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  usage: string;
  examples?: string[];
  category: 'core' | 'fleet' | 'system';
  requiresInit?: boolean;
}

// Command flag definition
export interface CommandFlag {
  name: string;
  description: string;
  shorthand?: string;
}