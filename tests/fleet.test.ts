/**
 * Fleet Management Tests - Test fleet operations
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { cleanTestDir, runCarrier, TEST_DIR } from './setup';

describe('Fleet Management', () => {
  beforeEach(async () => {
    cleanTestDir();
    await runCarrier(['init', '--no-claude']);
  });

  test('push --testing copies to testing folder', async () => {
    // Create a fleet
    const fleetDir = join(TEST_DIR, '.carrier/fleets/test-fleet');
    mkdirSync(fleetDir, { recursive: true });
    writeFileSync(join(fleetDir, 'test-fleet.json'), JSON.stringify({
      id: 'test-fleet',
      agent: 'test',
      tasks: []
    }));

    // Set testing path
    process.env.CARRIER_TESTING_PATH = join(TEST_DIR, 'testing-fleets');
    
    const { exitCode } = await runCarrier(['push', 'test-fleet', '--testing']);
    
    expect(exitCode).toBe(0);
    expect(existsSync(join(TEST_DIR, 'testing-fleets/test-fleet'))).toBe(true);
    
    delete process.env.CARRIER_TESTING_PATH;
  });

  test('pull --testing copies from testing folder', async () => {
    // Create testing folder with fleet
    const testingPath = join(TEST_DIR, 'testing-fleets/test-fleet');
    mkdirSync(testingPath, { recursive: true });
    writeFileSync(join(testingPath, 'test-fleet.json'), JSON.stringify({
      id: 'test-fleet',
      agent: 'test',
      tasks: []
    }));

    process.env.CARRIER_TESTING_PATH = join(TEST_DIR, 'testing-fleets');
    
    const { exitCode } = await runCarrier(['pull', 'test-fleet', '--testing']);
    
    expect(exitCode).toBe(0);
    expect(existsSync(join(TEST_DIR, '.carrier/fleets/test-fleet'))).toBe(true);
    
    delete process.env.CARRIER_TESTING_PATH;
  });

  test('ls --testing lists testing folder', async () => {
    // Create testing folder with fleet
    const testingPath = join(TEST_DIR, 'testing-fleets/test-fleet');
    mkdirSync(testingPath, { recursive: true });
    writeFileSync(join(testingPath, 'test-fleet.json'), JSON.stringify({
      id: 'test-fleet',
      description: 'Test fleet',
      agent: 'test',
      tasks: []
    }));

    process.env.CARRIER_TESTING_PATH = join(TEST_DIR, 'testing-fleets');
    
    const { exitCode, stdout } = await runCarrier(['ls', '--testing']);
    
    expect(exitCode).toBe(0);
    expect(stdout).toContain('test-fleet');
    expect(stdout).toContain('Test fleet');
    
    delete process.env.CARRIER_TESTING_PATH;
  });

  test('rm --testing removes from testing folder', async () => {
    // Create testing folder with fleet
    const testingPath = join(TEST_DIR, 'testing-fleets/test-fleet');
    mkdirSync(testingPath, { recursive: true });
    writeFileSync(join(testingPath, 'test-fleet.json'), '{}');

    process.env.CARRIER_TESTING_PATH = join(TEST_DIR, 'testing-fleets');
    
    expect(existsSync(testingPath)).toBe(true);
    
    const { exitCode } = await runCarrier(['rm', 'test-fleet', '--testing']);
    
    expect(exitCode).toBe(0);
    expect(existsSync(testingPath)).toBe(false);
    
    delete process.env.CARRIER_TESTING_PATH;
  });
});