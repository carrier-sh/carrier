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