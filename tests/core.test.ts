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

  // Test that the rm command properly removes fleet directories
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