/**
 * Core Functional Tests - Test actual functionality, not text output
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { cleanTestDir, runCarrier, TEST_DIR } from './setup';

describe('Core Commands', () => {
  beforeEach(() => {
    cleanTestDir();
  });

  test('init creates .carrier directory', async () => {
    const { exitCode } = await runCarrier(['init', '--no-claude']);
    
    expect(exitCode).toBe(0);
    expect(existsSync(join(TEST_DIR, '.carrier'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.carrier/config.json'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.carrier/fleets'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.carrier/deployed'))).toBe(true);
  });

  test('deploy creates deployment', async () => {
    // Init first
    await runCarrier(['init', '--no-claude']);
    
    // Create a minimal test fleet
    const fleetDir = join(TEST_DIR, '.carrier/fleets/test-fleet');
    mkdirSync(fleetDir, { recursive: true });
    writeFileSync(join(fleetDir, 'test-fleet.json'), JSON.stringify({
      id: 'test-fleet',
      agent: 'test-agent',
      tasks: [{
        id: 'task1',
        agent: 'test-agent'
      }]
    }));

    // Deploy
    const { exitCode } = await runCarrier(['deploy', 'test-fleet', 'test request']);
    
    expect(exitCode).toBe(0);
    
    // Check deployment was created
    const registry = JSON.parse(
      readFileSync(join(TEST_DIR, '.carrier/deployed/registry.json'), 'utf-8')
    );
    expect(registry.deployedFleets.length).toBeGreaterThan(0);
    expect(registry.deployedFleets[0].fleetId).toBe('test-fleet');
    expect(registry.deployedFleets[0].request).toBe('test request');
  });

  test('status shows deployments', async () => {
    await runCarrier(['init', '--no-claude']);
    
    // Status should work even with no deployments
    const { exitCode } = await runCarrier(['status']);
    expect(exitCode).toBe(0);
  });

  test('ls lists local fleets', async () => {
    await runCarrier(['init', '--no-claude']);
    
    // Create test fleet
    const fleetDir = join(TEST_DIR, '.carrier/fleets/test-fleet');
    mkdirSync(fleetDir, { recursive: true });
    writeFileSync(join(fleetDir, 'test-fleet.json'), JSON.stringify({
      id: 'test-fleet',
      agent: 'test-agent',
      tasks: []
    }));

    const { exitCode, stdout } = await runCarrier(['ls']);
    
    expect(exitCode).toBe(0);
    expect(stdout).toContain('test-fleet');
  });

  test('rm removes fleet', async () => {
    await runCarrier(['init', '--no-claude']);
    
    // Create fleet
    const fleetDir = join(TEST_DIR, '.carrier/fleets/test-fleet');
    mkdirSync(fleetDir, { recursive: true });
    writeFileSync(join(fleetDir, 'test-fleet.json'), '{}');
    
    expect(existsSync(fleetDir)).toBe(true);
    
    // Remove it
    const { exitCode } = await runCarrier(['rm', 'test-fleet']);
    
    expect(exitCode).toBe(0);
    expect(existsSync(fleetDir)).toBe(false);
  });

  test('config shows configuration', async () => {
    await runCarrier(['init', '--no-claude']);
    
    const { exitCode, stdout } = await runCarrier(['config']);
    
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Carrier Configuration');
  });
});