/**
 * Stop command - Cancel/stop a running deployment
 * Allows users to stop fleets that are running or stuck
 */

import * as fs from 'fs';
import * as path from 'path';
import { CarrierCore } from '../core.js';
import { DetachedExecutor } from '../detached.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function stop(
  carrier: CarrierCore,
  carrierPath: string,
  params: string[]
): Promise<void> {
  const deployedId = params[0];
  const force = params.includes('--force') || params.includes('-f');
  const all = params.includes('--all');

  if (!deployedId && !all) {
    console.error('Usage: carrier stop <deployment-id> [options]');
    console.error('\nOptions:');
    console.error('  --all            Stop all active deployments');
    console.error('\nExamples:');
    console.error('  carrier stop 5              # Stop deployment 5');
    console.error('  carrier stop --all          # Stop all active deployments');
    return;
  }

  if (all) {
    // Stop all active deployments
    const registry = carrier.loadRegistry();
    const activeDeployments = registry.deployedFleets.filter(
      (d: any) => d.status === 'active' || d.status === 'pending'
    );

    if (activeDeployments.length === 0) {
      console.log('No active deployments to stop');
      return;
    }

    console.log(`Stopping ${activeDeployments.length} active deployment(s)...`);

    for (const deployment of activeDeployments) {
      await stopDeployment(carrier, carrierPath, deployment.id, true);
    }

    console.log(`\n✅ Stopped ${activeDeployments.length} deployment(s)`);
    return;
  }

  // Stop specific deployment
  const deployed = carrier.getDeployedFleet(deployedId);
  if (!deployed) {
    console.error(`Deployment ${deployedId} not found`);
    return;
  }

  if (deployed.status === 'complete') {
    console.log(`Deployment ${deployedId} is already complete`);
    return;
  }

  if (deployed.status === 'failed') {
    console.log(`Deployment ${deployedId} has already failed`);
    return;
  }

  // Just stop it directly - no confirmation needed
  await stopDeployment(carrier, carrierPath, deployedId, true);
  console.log(`\n✅ Deployment ${deployedId} stopped`);
}

/**
 * Stop a specific deployment
 */
async function stopDeployment(
  carrier: CarrierCore,
  carrierPath: string,
  deployedId: string,
  silent: boolean = false
): Promise<void> {
  if (!silent) {
    console.log(`\n🛑 Stopping deployment ${deployedId}...`);
  }

  try {
    // First, get the deployed fleet info to find current task
    const deployed = carrier.getDeployedFleet(deployedId);

    if (deployed && deployed.currentTask) {
      // Try to kill the detached process using PID file
      const killed = DetachedExecutor.kill(carrierPath, deployedId, deployed.currentTask);
      if (killed && !silent) {
        console.log(`  ✓ Stopped task process: ${deployed.currentTask}`);
      }

      // Also check for any other tasks that might be running
      for (const task of deployed.tasks) {
        if (task.taskId !== deployed.currentTask) {
          const taskKilled = DetachedExecutor.kill(carrierPath, deployedId, task.taskId);
          if (taskKilled && !silent) {
            console.log(`  ✓ Stopped task process: ${task.taskId}`);
          }
        }
      }
    }

    // Fallback: Try to find processes with the deployment ID in the command
    try {
      const { stdout } = await execAsync(`ps aux | grep "deployedId.*${deployedId}" | grep -v grep`);
      const lines = stdout.trim().split('\n').filter(line => line);

      for (const line of lines) {
        const parts = line.split(/\s+/);
        const pid = parts[1];
        if (pid) {
          if (!silent) {
            console.log(`  Killing orphan process ${pid}`);
          }
          try {
            process.kill(parseInt(pid), 'SIGTERM');
          } catch (e) {
            // Process might have already exited
          }
        }
      }
    } catch (e) {
      // No processes found, which is fine
    }

    // Update deployment status to cancelled
    await carrier.updateDeployedStatus(deployedId, 'cancelled');

    // Mark current task as cancelled if it's active
    if (deployed && deployed.currentTask) {
      await carrier.updateTaskStatus(deployedId, deployed.currentTask, 'cancelled');
    }

    // Create a stop marker file to signal any running tasks
    const stopMarkerPath = path.join(carrierPath, 'deployed', deployedId, '.stop');
    fs.writeFileSync(stopMarkerPath, new Date().toISOString());

    // Log the cancellation
    const logPath = path.join(carrierPath, 'deployed', deployedId, 'cancelled.log');
    const logContent = `Deployment cancelled at ${new Date().toISOString()}\n` +
                      `Reason: User requested stop\n` +
                      `Last task: ${deployed?.currentTask || 'unknown'}\n`;
    fs.writeFileSync(logPath, logContent);

    if (!silent) {
      console.log(`  ✓ Status updated to cancelled`);
      console.log(`  ✓ Stop signal created`);
    }

  } catch (error) {
    console.error(`Error stopping deployment: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

/**
 * Check if a deployment has been requested to stop
 * This can be called by running tasks to check if they should exit
 */
export function shouldStop(carrierPath: string, deployedId: string): boolean {
  const stopMarkerPath = path.join(carrierPath, 'deployed', deployedId, '.stop');
  return fs.existsSync(stopMarkerPath);
}