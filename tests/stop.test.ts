/**
 * Stop Command Tests
 * Tests for the carrier stop command functionality
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { cleanTestDir, runCarrier, TEST_DIR } from './setup';
import { shouldStop } from '../src/commands/stop';
import { DetachedExecutor } from '../src/detached';

describe('stop command', () => {
  beforeEach(() => {
    cleanTestDir();
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test('basic stop functionality - stops single active deployment', async () => {
    // Initialize carrier first
    await runCarrier(['init']);

    // Create a deployment with active status
    const deployedDir = join(TEST_DIR, '.carrier/deployed');
    mkdirSync(deployedDir, { recursive: true });

    const deploymentDir = join(deployedDir, '1');
    mkdirSync(deploymentDir, { recursive: true });

    // Create registry with active deployment
    const registryPath = join(deployedDir, 'registry.json');
    const registry = {
      deployedFleets: [{
        id: '1',
        fleetId: 'test-fleet',
        status: 'active',
        currentTask: 'task-1',
        tasks: [
          { taskId: 'task-1', status: 'running' }
        ],
        startedAt: new Date().toISOString()
      }]
    };
    writeFileSync(registryPath, JSON.stringify(registry, null, 2));

    // Run stop command
    const result = await runCarrier(['stop', '1']);

    // Verify deployment was stopped
    expect(result.stdout).toContain('Deployment 1 stopped');

    // Verify status was updated
    const updatedRegistry = JSON.parse(readFileSync(registryPath, 'utf-8'));
    expect(updatedRegistry.deployedFleets[0].status).toBe('cancelled');

    // Verify stop marker was created
    const stopMarker = join(deploymentDir, '.stop');
    expect(existsSync(stopMarker)).toBe(true);
  });

  test('stop --all functionality - stops all active deployments', async () => {
    // Initialize carrier
    await runCarrier(['init']);

    // Create multiple deployments with various statuses
    const deployedDir = join(TEST_DIR, '.carrier/deployed');
    mkdirSync(deployedDir, { recursive: true });

    // Create deployment directories
    ['1', '2', '3'].forEach(id => {
      mkdirSync(join(deployedDir, id), { recursive: true });
    });

    // Create registry with multiple deployments
    const registryPath = join(deployedDir, 'registry.json');
    const registry = {
      deployedFleets: [
        {
          id: '1',
          fleetId: 'test-fleet-1',
          status: 'active',
          currentTask: 'task-1',
          tasks: [],
          startedAt: new Date().toISOString()
        },
        {
          id: '2',
          fleetId: 'test-fleet-2',
          status: 'pending',
          currentTask: null,
          tasks: [],
          startedAt: new Date().toISOString()
        },
        {
          id: '3',
          fleetId: 'test-fleet-3',
          status: 'complete',
          currentTask: null,
          tasks: [],
          startedAt: new Date().toISOString()
        }
      ]
    };
    writeFileSync(registryPath, JSON.stringify(registry, null, 2));

    // Run stop --all
    const result = await runCarrier(['stop', '--all']);

    // Verify output
    expect(result.stdout).toContain('Stopping 2 active deployment(s)');
    expect(result.stdout).toContain('Stopped 2 deployment(s)');

    // Verify statuses were updated
    const updatedRegistry = JSON.parse(readFileSync(registryPath, 'utf-8'));
    expect(updatedRegistry.deployedFleets[0].status).toBe('cancelled');
    expect(updatedRegistry.deployedFleets[1].status).toBe('cancelled');
    expect(updatedRegistry.deployedFleets[2].status).toBe('complete'); // Should remain unchanged

    // Verify stop markers were created for active deployments
    expect(existsSync(join(deployedDir, '1', '.stop'))).toBe(true);
    expect(existsSync(join(deployedDir, '2', '.stop'))).toBe(true);
    expect(existsSync(join(deployedDir, '3', '.stop'))).toBe(false);
  });

  test('handles invalid deployment ID', async () => {
    // Initialize carrier
    await runCarrier(['init']);

    // Create empty registry
    const deployedDir = join(TEST_DIR, '.carrier/deployed');
    mkdirSync(deployedDir, { recursive: true });
    const registryPath = join(deployedDir, 'registry.json');
    writeFileSync(registryPath, JSON.stringify({ deployedFleets: [] }, null, 2));

    // Try to stop non-existent deployment
    const result = await runCarrier(['stop', '999']);

    // Verify error message
    expect(result.stderr).toContain('Deployment 999 not found');
  });

  test('creates stop marker file', async () => {
    // Initialize carrier
    await runCarrier(['init']);

    // Create active deployment
    const deployedDir = join(TEST_DIR, '.carrier/deployed');
    mkdirSync(deployedDir, { recursive: true });

    const deploymentDir = join(deployedDir, '5');
    mkdirSync(deploymentDir, { recursive: true });

    const registryPath = join(deployedDir, 'registry.json');
    const registry = {
      deployedFleets: [{
        id: '5',
        fleetId: 'test-fleet',
        status: 'active',
        currentTask: 'task-1',
        tasks: [],
        startedAt: new Date().toISOString()
      }]
    };
    writeFileSync(registryPath, JSON.stringify(registry, null, 2));

    // Run stop command
    await runCarrier(['stop', '5']);

    // Verify .stop marker file exists and contains timestamp
    const stopMarker = join(deploymentDir, '.stop');
    expect(existsSync(stopMarker)).toBe(true);

    const stopContent = readFileSync(stopMarker, 'utf-8');
    // Verify it's a valid ISO timestamp
    expect(new Date(stopContent).toISOString()).toBe(stopContent);
  });

  test('handles already completed deployment', async () => {
    // Initialize carrier
    await runCarrier(['init']);

    // Create completed deployment
    const deployedDir = join(TEST_DIR, '.carrier/deployed');
    mkdirSync(deployedDir, { recursive: true });

    const deploymentDir = join(deployedDir, '7');
    mkdirSync(deploymentDir, { recursive: true });

    const registryPath = join(deployedDir, 'registry.json');
    const registry = {
      deployedFleets: [{
        id: '7',
        fleetId: 'test-fleet',
        status: 'complete',
        currentTask: null,
        tasks: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      }]
    };
    writeFileSync(registryPath, JSON.stringify(registry, null, 2));

    // Try to stop completed deployment
    const result = await runCarrier(['stop', '7']);

    // Verify friendly message
    expect(result.stdout).toContain('Deployment 7 is already complete');

    // Verify status remains unchanged
    const updatedRegistry = JSON.parse(readFileSync(registryPath, 'utf-8'));
    expect(updatedRegistry.deployedFleets[0].status).toBe('complete');

    // Verify no stop marker was created
    const stopMarker = join(deploymentDir, '.stop');
    expect(existsSync(stopMarker)).toBe(false);
  });

  test('handles already failed deployment', async () => {
    // Initialize carrier
    await runCarrier(['init']);

    // Create failed deployment
    const deployedDir = join(TEST_DIR, '.carrier/deployed');
    mkdirSync(deployedDir, { recursive: true });

    const deploymentDir = join(deployedDir, '8');
    mkdirSync(deploymentDir, { recursive: true });

    const registryPath = join(deployedDir, 'registry.json');
    const registry = {
      deployedFleets: [{
        id: '8',
        fleetId: 'test-fleet',
        status: 'failed',
        currentTask: null,
        tasks: [],
        startedAt: new Date().toISOString(),
        failedAt: new Date().toISOString()
      }]
    };
    writeFileSync(registryPath, JSON.stringify(registry, null, 2));

    // Try to stop failed deployment
    const result = await runCarrier(['stop', '8']);

    // Verify friendly message
    expect(result.stdout).toContain('Deployment 8 has already failed');

    // Verify status remains unchanged
    const updatedRegistry = JSON.parse(readFileSync(registryPath, 'utf-8'));
    expect(updatedRegistry.deployedFleets[0].status).toBe('failed');

    // Verify no stop marker was created
    const stopMarker = join(deploymentDir, '.stop');
    expect(existsSync(stopMarker)).toBe(false);
  });

  test('shouldStop utility function detects stop marker', () => {
    // Create deployment directory with stop marker
    const carrierPath = join(TEST_DIR, '.carrier');
    const deploymentDir = join(carrierPath, 'deployed', '10');
    mkdirSync(deploymentDir, { recursive: true });

    const stopMarker = join(deploymentDir, '.stop');

    // Initially should not stop
    expect(shouldStop(carrierPath, '10')).toBe(false);

    // Create stop marker
    writeFileSync(stopMarker, new Date().toISOString());

    // Now should stop
    expect(shouldStop(carrierPath, '10')).toBe(true);

    // Clean up
    rmSync(stopMarker);

    // Should not stop after removal
    expect(shouldStop(carrierPath, '10')).toBe(false);
  });

  test('DetachedExecutor.kill terminates process via PID', async () => {
    // Create deployment directory structure
    const carrierPath = join(TEST_DIR, '.carrier');
    const logsDir = join(carrierPath, 'deployed', '11', 'logs');
    mkdirSync(logsDir, { recursive: true });

    // Start a simple long-running process
    const child = spawn('sleep', ['30']);
    const pid = child.pid;

    // Create PID file
    const pidFile = join(logsDir, 'test-task.pid');
    writeFileSync(pidFile, pid.toString());

    // Verify process is running
    let isRunning = true;
    try {
      process.kill(pid, 0);
    } catch {
      isRunning = false;
    }
    expect(isRunning).toBe(true);

    // Kill using DetachedExecutor
    const killed = DetachedExecutor.kill(carrierPath, '11', 'test-task');
    expect(killed).toBe(true);

    // Give process time to exit
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify process is terminated
    let isStillRunning = false;
    try {
      process.kill(pid, 0);
      isStillRunning = true;
    } catch {
      isStillRunning = false;
    }
    expect(isStillRunning).toBe(false);

    // Verify PID file was removed
    expect(existsSync(pidFile)).toBe(false);
  });

  test('creates cancelled.log with timestamp and reason', async () => {
    // Initialize carrier
    await runCarrier(['init']);

    // Create active deployment
    const deployedDir = join(TEST_DIR, '.carrier/deployed');
    mkdirSync(deployedDir, { recursive: true });

    const deploymentDir = join(deployedDir, '12');
    mkdirSync(deploymentDir, { recursive: true });

    const registryPath = join(deployedDir, 'registry.json');
    const registry = {
      deployedFleets: [{
        id: '12',
        fleetId: 'test-fleet',
        status: 'active',
        currentTask: 'analyze-code',
        tasks: [
          { taskId: 'analyze-code', status: 'running' }
        ],
        startedAt: new Date().toISOString()
      }]
    };
    writeFileSync(registryPath, JSON.stringify(registry, null, 2));

    // Run stop command
    await runCarrier(['stop', '12']);

    // Verify cancelled.log exists
    const cancelledLog = join(deploymentDir, 'cancelled.log');
    expect(existsSync(cancelledLog)).toBe(true);

    // Verify log contents
    const logContent = readFileSync(cancelledLog, 'utf-8');
    expect(logContent).toContain('Deployment cancelled at');
    expect(logContent).toContain('Reason: User requested stop');
    expect(logContent).toContain('Last task: analyze-code');

    // Verify timestamp format
    const timestampMatch = logContent.match(/Deployment cancelled at ([\d\-T:.Z]+)/);
    expect(timestampMatch).toBeTruthy();
    if (timestampMatch) {
      const timestamp = new Date(timestampMatch[1]);
      expect(timestamp.toISOString()).toBe(timestampMatch[1]);
    }
  });
});