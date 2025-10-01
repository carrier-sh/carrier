#!/usr/bin/env bun

/**
 * Carrier CLI - Simplified version using CLICommands
 */

// Test comment added for verification

import * as fs from 'fs';
import * as path from 'path';
import { CarrierCore } from './core.js';
import { CLICommands } from './commands.js';
import { getCommand, suggestDefaultCommand } from './registry.js';
import { CLIParser, COMMAND_FLAGS } from './parser.js';

/**
 * Find the project root by looking for package.json
 * Walks up from current directory until package.json is found
 * @returns Project root path or current directory if no package.json found
 */
function findProjectRoot(): string {
  let dir = process.cwd();
  const root = path.parse(dir).root;
  
  // Walk up the directory tree looking for package.json
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  
  // Check root directory as well
  if (fs.existsSync(path.join(root, 'package.json'))) {
    return root;
  }
  
  // If no package.json found, warn and use current directory
  console.warn('⚠️  No package.json found in parent directories.');
  console.warn('⚠️  Using current directory. Consider running from your project root.');
  return process.cwd();
}

// Parse command-line arguments with enhanced parser
const parsed = CLIParser.parse(process.argv);
const command = parsed.command;
const params = parsed.args;
const flags = parsed.flags;

// Default to local installation unless explicitly set to global
const isGlobal = flags['global'] === true || flags['g'] === true;

// Initialize core with proper path
// For local installations, find the project root with package.json
const projectRoot = isGlobal ? process.cwd() : findProjectRoot();
const carrierPath = isGlobal ? 
  path.join(process.env.HOME || '', '.carrier') :
  path.join(projectRoot, '.carrier');

const carrier = new CarrierCore(carrierPath);
const cli = new CLICommands({ carrierPath: carrierPath, isGlobal: isGlobal });

// Command handlers
async function handleCommand() {
  // Check for help flag first
  if (parsed.help || !command) {
    return await cli.help(command ? [command] : []);
  }
  
  // Use command registry to find command
  const cmd = getCommand(command);
  
  if (!cmd) {
    // No valid command found - suggest default
    console.error(`Unknown command: ${command}`);
    console.log(suggestDefaultCommand(parsed.args.join(' ')));
    console.error('Run "carrier help" for usage information');
    process.exit(1);
  }
  
  // Check for command-specific help
  if (CLIParser.isHelpRequested(parsed)) {
    return await cli.help([command]);
  }
  
  // Validate flags for the command
  const allowedFlags = COMMAND_FLAGS[cmd.name]?.map(f => f.name) || [];
  const validation = CLIParser.validateFlags(flags, allowedFlags, cmd.name);
  
  if (!validation.valid) {
    validation.errors.forEach(error => console.error(error));
    console.error(`\nRun "carrier ${cmd.name} --help" for usage information`);
    process.exit(1);
  }
  
  // Prepare params with flags
  const allParams = [...params];
  Object.entries(flags).forEach(([key, value]) => {
    if (value === true) {
      allParams.push(`--${key}`);
    } else {
      allParams.push(`--${key}`, value as string);
    }
  });
  
  // Route to appropriate handler
  switch (cmd.name) {
    case 'auth':
      return await cli.auth(allParams);
    case 'whoami':
      return await cli.whoami(allParams);
    case 'logout':
      return await cli.logout(allParams);
    case 'deploy':
      return await cli.deploy(allParams);
    case 'approve':
      return await cli.approve(allParams);
    case 'status':
      return await cli.status(allParams);
    case 'init':
      return await cli.init(allParams);
    case 'ls':
      return await cli.ls(allParams);
    case 'push':
      return await cli.push(allParams);
    case 'pull':
      return await cli.pull(allParams);
    case 'rm':
      return await cli.rm(allParams);
    case 'config':
      return await cli.config(allParams);
    case 'uninstall':
      return await cli.uninstall(allParams);
    case 'clean':
    case 'cleanup':
      return await cli.clean(allParams);
    case 'watch':
      return await cli.watch(allParams);
    case 'logs':
      return await cli.logs(allParams);
    case 'stop':
    case 's':
    case 'cancel':
      return await cli.stop(allParams);
    case 'start':
    case 'resume':
    case 'continue':
      return await cli.start(allParams);
    case 'agent':
      return await cli.agent(allParams);
    case 'benchmark':
    case 'bench':
      return await cli.benchmark(allParams);
    case 'help':
      return await cli.help(params);
    default:
      return await cli.help([]);
  }
}

// Export for testing
export async function processCommand(testArgs?: string[]) {
  if (testArgs) {
    const originalArgs = process.argv;
    process.argv = ['node', 'cli.ts', ...testArgs];
    return await handleCommand();
  }
  return await handleCommand();
}

// Run the CLI if not being imported
if (import.meta.url === `file://${process.argv[1]}`) {
  handleCommand().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}