import { spawn } from 'child_process';
import { CarrierCore } from '../core.js';

function buildClaudeCommand(agentType: string, prompt: string, taskId: string, deployedId: string): string[] {
  const command = [
    '/Task',
    `subagent_type=${agentType}`,
    `description="Task ${taskId} for deployment ${deployedId}"`,
    `prompt="${prompt}"`
  ];
  return command;
}

export async function execute(
  carrier: CarrierCore,
  params: string[]
): Promise<void> {
  const deployedId = params[0];
  const isBackground = params.includes('--background');

  if (!deployedId) {
    console.error('Usage: carrier execute <deployed-id> [--background]');
    return;
  }

  try {
    // Get deployed fleet information
    const deployed = carrier.getDeployedFleet(deployedId);

    if (!deployed) {
      console.error(`Deployment ${deployedId} not found`);
      return;
    }

    if (deployed.status === 'complete') {
      console.log(`Deployment ${deployedId} is already complete`);
      return;
    }

    // Get current task and agent type
    const currentTaskId = deployed.currentTask;
    const agentType = deployed.currentAgent;
    const request = deployed.request;

    if (!currentTaskId || !agentType) {
      console.error(`Unable to determine current task or agent type for deployment ${deployedId}`);
      return;
    }

    console.log(`Continuing deployment ${deployedId}:`);
    console.log(`  Fleet: ${deployed.fleetId}`);
    console.log(`  Current Task: ${currentTaskId}`);
    console.log(`  Agent Type: ${agentType}`);
    console.log(`  Request: ${request}\n`);

    // Update task status to active
    await carrier.updateTaskStatus(deployedId, currentTaskId, 'active');

    // Build the Claude command
    const claudeCommand = buildClaudeCommand(agentType, request, currentTaskId, deployedId);

    if (isBackground) {
      // Launch Claude CLI in background
      const child = spawn('claude', claudeCommand, {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CARRIER_TASK_ID: currentTaskId,
          CARRIER_DEPLOYED_ID: deployedId
        }
      });

      // Store process info
      await carrier.updateTaskProcessInfo(deployedId, currentTaskId, child.pid || 0);

      // Unref to allow parent to exit
      child.unref();

      console.log(`Task ${currentTaskId} launched in background (PID: ${child.pid})`);
      console.log(`Check status with: carrier status ${deployedId}`);
    } else {
      // Launch Claude CLI interactively
      console.log('Launching interactive Claude Code session...');
      console.log('(Press Ctrl+C to cancel)\n');

      const child = spawn('claude', claudeCommand, {
        stdio: 'inherit',
        env: {
          ...process.env,
          CARRIER_TASK_ID: currentTaskId,
          CARRIER_DEPLOYED_ID: deployedId
        }
      });

      // Store process info
      await carrier.updateTaskProcessInfo(deployedId, currentTaskId, child.pid || 0);

      // Wait for process to complete
      const exitCode = await new Promise<number>((resolve) => {
        child.on('exit', (code) => {
          resolve(code || 0);
        });

        child.on('error', (err) => {
          console.error(`Error launching task: ${err.message}`);
          resolve(1);
        });
      });

      // Update task status based on exit code
      if (exitCode === 0) {
        await carrier.updateTaskStatus(deployedId, currentTaskId, 'complete');
        console.log(`\nTask ${currentTaskId} completed successfully`);
        console.log(`Use "carrier status ${deployedId}" to check fleet status`);
      } else {
        await carrier.updateTaskStatus(deployedId, currentTaskId, 'failed');
        console.error(`\nTask ${currentTaskId} failed with exit code ${exitCode}`);
      }
    }

  } catch (error: any) {
    console.error(`Error executing deployment: ${error.message}`);
  }
}