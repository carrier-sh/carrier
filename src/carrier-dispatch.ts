#!/usr/bin/env bun

/**
 * Carrier Dispatcher - Ultra-fast command router
 * Designed for instant execution from Claude Code
 */

import { spawn } from 'child_process';
import { getCommand, suggestDefaultCommand, COMMANDS } from './command-registry.js';

// Get input from command line
const input = process.argv.slice(2).join(' ').trim();

// Parse the input to detect command
function parseInput(input: string): { command: string | null, args: string[] } {
  const parts = input.split(' ').filter(p => p);
  
  if (parts.length === 0) {
    return { command: null, args: [] };
  }
  
  // Check if first part is a valid command
  const cmd = getCommand(parts[0]);
  if (cmd) {
    return { command: cmd.name, args: parts.slice(1) };
  }
  
  // Check two-word commands (e.g., "deploy code-change")
  if (parts.length >= 2 && parts[0] === 'deploy') {
    return { command: 'deploy', args: parts.slice(1) };
  }
  
  // No valid command found
  return { command: null, args: parts };
}

// Execute carrier command
function executeCarrier(command: string, args: string[]) {
  const carrierArgs = [command, ...args];
  
  // Use spawn for real-time output
  const carrier = spawn('bun', ['run', 'carrier', ...carrierArgs], {
    stdio: 'inherit',
    shell: false
  });
  
  carrier.on('error', (err) => {
    console.error('Failed to execute carrier:', err);
    process.exit(1);
  });
  
  carrier.on('exit', (code) => {
    process.exit(code || 0);
  });
}

// Main dispatcher logic
const { command, args } = parseInput(input);

if (command) {
  // Valid command found - execute immediately
  executeCarrier(command, args);
} else if (input) {
  // No command but has input - treat as deploy request
  console.log(`Deploying default fleet with: "${input}"`);
  executeCarrier('deploy', ['code-change', input]);
} else {
  // No input - show quick help
  console.log('Carrier Dispatcher - Quick Commands:');
  console.log('');
  console.log('  carrier deploy code-change "your request"');
  console.log('  carrier status');
  console.log('  carrier config');
  console.log('  carrier approve');
  console.log('');
  console.log('Or just type your request to auto-deploy!');
}