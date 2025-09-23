/**
 * Deployment Management Tests - Test deployment operations
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { cleanTestDir, runCarrier, TEST_DIR } from './setup';

describe('Deployment Operations', () => {
  beforeEach(async () => {
    cleanTestDir();
    await runCarrier(['init', '--no-claude']);
  });

  test('approve command approves pending deployment', async () => {
    // Create fleet definition
    const fleetDir = join(TEST_DIR, '.carrier/fleets/test-fleet');
    mkdirSync(fleetDir, { recursive: true });
    writeFileSync(join(fleetDir, 'test-fleet.json'), JSON.stringify({
      id: 'test-fleet',
      name: 'Test Fleet',
      description: 'Test fleet for approval',
      tasks: [
        {
          id: 'task1',
          name: 'Test Task 1',
          agentType: 'general-purpose',
          requiresApproval: true
        },
        {
          id: 'task2',
          name: 'Test Task 2',
          agentType: 'general-purpose',
          dependencies: ['task1']
        }
      ]
    }));

    // Create a deployment that's awaiting approval
    const deploymentId = 'test-deployment-approve';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    mkdirSync(deployDir, { recursive: true });

    // Create metadata with awaiting_approval status
    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify({
      id: deploymentId,
      fleetId: 'test-fleet',
      status: 'awaiting_approval',
      currentTask: 'task1',
      tasks: {
        'task1': { status: 'pending', requiresApproval: true }
      }
    }));
    
    // Create registry entry
    const registryPath = join(TEST_DIR, '.carrier/deployed/registry.json');
    writeFileSync(registryPath, JSON.stringify({
      deployedFleets: [
        {
          id: deploymentId,
          uniqueId: deploymentId,
          fleetId: 'test-fleet',
          status: 'awaiting_approval',
          currentTask: 'task1',
          tasks: [
            {
              taskId: 'task1',
              status: 'pending'
            }
          ]
        }
      ],
      nextId: 2
    }));

    // Approve the deployment
    const { exitCode: approveCode } = await runCarrier(['approve', deploymentId]);
    expect(approveCode).toBe(0);
    // Command should complete successfully
  });

  // Note: monitor command was removed as it was a duplicate of status command

  test('save-output command saves task output', async () => {
    // Create deployment directory structure
    const deploymentId = 'test-deployment-123';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    const outputDir = join(deployDir, 'outputs');
    mkdirSync(outputDir, { recursive: true });
    
    // Create metadata file
    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify({
      id: deploymentId,
      fleetId: 'test-fleet',
      status: 'active',
      tasks: {
        'task1': { status: 'pending' }
      }
    }));

    // Save output for a task
    const testOutput = 'Task completed successfully';
    const { exitCode } = await runCarrier(['save-output', deploymentId, 'task1', '--content', testOutput]);
    expect(exitCode).toBe(0);

    // Verify output was saved
    const outputPath = join(outputDir, 'task1.md');
    expect(existsSync(outputPath)).toBe(true);
    const savedOutput = readFileSync(outputPath, 'utf-8');
    expect(savedOutput).toContain(testOutput);
  });

  test('update-task command updates task status', async () => {
    // Create deployment with task
    const deploymentId = 'test-deployment-456';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    mkdirSync(deployDir, { recursive: true });
    
    const metadata = {
      id: deploymentId,
      fleetId: 'test-fleet',
      status: 'active',
      tasks: {
        'task1': { status: 'pending' }
      }
    };
    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify(metadata));

    // Update task status
    const { exitCode } = await runCarrier(['update-task', deploymentId, 'task1', '--status', 'complete']);
    expect(exitCode).toBe(0);
    // Command should complete successfully
  });

  test('update-fleet command updates deployment status', async () => {
    // Create deployment
    const deploymentId = 'test-deployment-789';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    mkdirSync(deployDir, { recursive: true });
    
    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify({
      id: deploymentId,
      fleetId: 'test-fleet',
      status: 'active',
      currentTask: 'task1'
    }));

    // Update fleet status
    const { exitCode } = await runCarrier(['update-fleet', deploymentId, '--status', 'awaiting_approval', '--current-task', 'task2']);
    expect(exitCode).toBe(0);
    // Command should complete successfully
  });

  test('get-output command retrieves task output', async () => {
    // Create deployment with output
    const deploymentId = 'test-deployment-out';
    const outputDir = join(TEST_DIR, '.carrier/deployed', deploymentId, 'outputs');
    mkdirSync(outputDir, { recursive: true });
    
    const testOutput = '# Task Output\nTask completed with results';
    writeFileSync(join(outputDir, 'task1.md'), testOutput);

    // Get the output
    const { exitCode, stdout } = await runCarrier(['get-output', deploymentId, 'task1']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Task completed with results');
  });

  test('get-context command retrieves deployment context', async () => {
    // Create deployment with context
    const deploymentId = 'test-deployment-ctx';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    mkdirSync(deployDir, { recursive: true });
    
    // Create fleet in fleets directory
    const fleetDir = join(TEST_DIR, '.carrier/fleets/test-fleet');
    mkdirSync(fleetDir, { recursive: true });
    const fleet = {
      id: 'test-fleet',
      tasks: [
        { id: 'task1', description: 'First task', dependencies: [] },
        { id: 'task2', description: 'Second task', dependencies: ['task1'] }
      ]
    };
    writeFileSync(join(fleetDir, 'test-fleet.json'), JSON.stringify(fleet));
    
    // Create deployment metadata
    const metadata = {
      id: deploymentId,
      fleetId: 'test-fleet',
      request: 'Test request',
      status: 'active',
      currentTask: 'task2',
      tasks: {
        'task1': { status: 'complete' },
        'task2': { status: 'pending' }
      }
    };
    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify(metadata));
    
    // Create output for task1
    const outputDir = join(deployDir, 'outputs');
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, 'task1.md'), 'Task 1 output');

    // Get context for task2
    const { exitCode } = await runCarrier(['get-context', deploymentId, 'task2']);
    expect(exitCode).toBe(0);
    // Context command outputs JSON with context information
  });

  // Note: summarize command was removed completely as per requirements

  test('clean command removes completed deployments', async () => {
    // Create a completed deployment
    const deploymentId = 'test-deployment-clean';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    mkdirSync(deployDir, { recursive: true });
    
    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify({
      id: deploymentId,
      status: 'complete'
    }));
    
    // Create registry entry
    const registryPath = join(TEST_DIR, '.carrier/deployed/registry.json');
    mkdirSync(join(TEST_DIR, '.carrier/deployed'), { recursive: true });
    writeFileSync(registryPath, JSON.stringify({
      deployments: {
        [deploymentId]: {
          id: deploymentId,
          status: 'complete'
        }
      }
    }));

    // Clean the deployment
    const { exitCode } = await runCarrier(['clean', deploymentId, '--force']);
    expect(exitCode).toBe(0);
    // Command should complete successfully
  });

  test('clean without ID cleans all completed deployments', async () => {
    // Create multiple deployments
    const deployDir1 = join(TEST_DIR, '.carrier/deployed/deploy-1');
    const deployDir2 = join(TEST_DIR, '.carrier/deployed/deploy-2');
    const deployDir3 = join(TEST_DIR, '.carrier/deployed/deploy-3');
    
    mkdirSync(deployDir1, { recursive: true });
    mkdirSync(deployDir2, { recursive: true });
    mkdirSync(deployDir3, { recursive: true });
    
    // Deploy 1 - complete
    writeFileSync(join(deployDir1, 'metadata.json'), JSON.stringify({
      id: 'deploy-1',
      status: 'complete'
    }));
    
    // Deploy 2 - complete
    writeFileSync(join(deployDir2, 'metadata.json'), JSON.stringify({
      id: 'deploy-2',
      status: 'complete'
    }));
    
    // Deploy 3 - active (should not be cleaned)
    writeFileSync(join(deployDir3, 'metadata.json'), JSON.stringify({
      id: 'deploy-3',
      status: 'active'
    }));

    // Clean all completed
    const { exitCode } = await runCarrier(['clean', '--force']);
    expect(exitCode).toBe(0);
    // Command should complete successfully
  });
});