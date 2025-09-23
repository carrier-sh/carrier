/**
 * Test Setup - Minimal setup for fast functional tests
 */

import { rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Test environment setup
export const TEST_DIR = join(process.cwd(), '.test-carrier');
export const TEST_API_URL = process.env.TEST_API_URL || 'http://localhost:3000/api';

// Clean test directory before each test
export function cleanTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
  
  // Create a minimal package.json so carrier uses this directory
  const packageJson = {
    name: 'test-project',
    version: '1.0.0'
  };
  require('fs').writeFileSync(
    join(TEST_DIR, 'package.json'), 
    JSON.stringify(packageJson, null, 2)
  );
}

// Run a carrier command and get results
export async function runCarrier(args: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  // For init and other commands that work with .carrier, we need to run in TEST_DIR
  const proc = Bun.spawn(['bun', join(process.cwd(), 'src/cli.ts'), ...args], {
    cwd: TEST_DIR, // Run commands in test directory
    env: {
      ...process.env,
      CARRIER_API_URL: TEST_API_URL,
      HOME: TEST_DIR, // Isolate home for tests
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { exitCode, stdout, stderr };
}

// Check if API is available
export async function isApiAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${TEST_API_URL}/openapi.json`);
    return response.ok;
  } catch {
    return false;
  }
}

// Quick auth for API tests
export async function setupTestAuth(): Promise<string> {
  // For testing, we'll use a test token if API provides one
  // Otherwise tests will run without auth
  return 'test-token';
}