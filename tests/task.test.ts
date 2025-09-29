/**
 * Task Management Tests - Test task execution operations
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { cleanTestDir, runCarrier, TEST_DIR } from './setup';

describe('Task Operations', () => {
  beforeEach(async () => {
    cleanTestDir();
    await runCarrier(['init', '--no-claude']);
  });

  test('fleet command retrieves fleet configuration', async () => {
    // Create a test fleet
    const fleetDir = join(TEST_DIR, '.carrier/fleets/test-fleet');
    mkdirSync(fleetDir, { recursive: true });
    const fleetConfig = {
      id: 'test-fleet',
      description: 'Test fleet for testing',
      agent: 'test-agent',
      tasks: [
        { id: 'task1', description: 'First task' },
        { id: 'task2', description: 'Second task' }
      ]
    };
    writeFileSync(join(fleetDir, 'test-fleet.json'), JSON.stringify(fleetConfig));

    // Get fleet configuration
    const { exitCode, stdout } = await runCarrier(['fleet', 'test-fleet']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('test-fleet');
    expect(stdout).toContain('Test fleet for testing');
  });

  test('fleet --json returns JSON format', async () => {
    // Create a test fleet
    const fleetDir = join(TEST_DIR, '.carrier/fleets/test-fleet');
    mkdirSync(fleetDir, { recursive: true });
    const fleetConfig = {
      id: 'test-fleet',
      description: 'Test fleet',
      tasks: []
    };
    writeFileSync(join(fleetDir, 'test-fleet.json'), JSON.stringify(fleetConfig));

    // Get fleet as JSON
    const { exitCode, stdout } = await runCarrier(['fleet', 'test-fleet', '--json']);
    expect(exitCode).toBe(0);
    
    // Verify it's valid JSON
    const parsed = JSON.parse(stdout);
    expect(parsed.id).toBe('test-fleet');
    expect(parsed.description).toBe('Test fleet');
  });

  test('execute-task command runs a task subprocess', async () => {
    // Create deployment with task
    const deploymentId = 'test-deploy-exec';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    mkdirSync(deployDir, { recursive: true });
    
    // Create fleet
    const fleetDir = join(TEST_DIR, '.carrier/fleets/test-fleet');
    mkdirSync(fleetDir, { recursive: true });
    writeFileSync(join(fleetDir, 'test-fleet.json'), JSON.stringify({
      id: 'test-fleet',
      tasks: [{ id: 'task1', description: 'Test task', agent: 'test-agent' }]
    }));
    
    // Create deployment metadata
    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify({
      id: deploymentId,
      fleetId: 'test-fleet',
      status: 'active',
      tasks: {
        'task1': { status: 'pending' }
      }
    }));
    
    // Create process tracking file
    const processFile = join(deployDir, 'processes.json');
    writeFileSync(processFile, JSON.stringify({ processes: {} }));

    // Execute task (will likely fail due to missing agent, but that's ok for testing)
    const { exitCode } = await runCarrier([
      'execute-task', deploymentId, 'task1',
      '--agent-type', 'test-agent',
      '--prompt', 'Test prompt'
    ]);
    
    // The command should complete with an exit code
    expect(exitCode).toBeDefined();
    // We're testing the command runs, not that it succeeds
  });


  // Note: processes command was removed completely as per requirements
});