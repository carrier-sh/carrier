import fs from 'fs';
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

export async function deploy(
  carrier: CarrierCore,
  carrierPath: string,
  params: string[]
): Promise<void> {
  const fleetId = params[0];
  const isBackground = params.includes('--background');

  // Remove --background from params to get the request
  const requestParams = params.filter(p => p !== '--background');
  const request = requestParams.slice(1).join(' ');

  if (!fleetId || !request) {
    console.error('Usage: carrier deploy <fleet-id> "<request>" [--background]');
    console.error('Example: carrier deploy code-change "Add dark mode to settings"');
    return;
  }

  // Ensure carrier is initialized
  if (!fs.existsSync(carrierPath)) {
    console.error('Carrier not initialized. Run "carrier init" first');
    return;
  }

  try {
    console.log(`🚀 Deploying fleet: ${fleetId}`);
    console.log(`📝 Request: ${request}\n`);

    const result = await carrier.createDeployed(fleetId, request);

    if (result.success && result.data) {
      console.log(`✓ Fleet deployed: ${result.data.id}`);
      console.log(`  Status: ${result.data.status}`);
      console.log(`  Current task: ${result.data.currentTask}\n`);

      // Get the first task to execute
      const fleet = carrier.loadFleet(fleetId);
      const firstTask = fleet.tasks[0];

      if (firstTask && firstTask.agent) {
        console.log(`Starting first task: ${firstTask.id} with agent: ${firstTask.agent}`);

        // Update task status to active
        await carrier.updateTaskStatus(result.data.id, firstTask.id, 'active');

        // Build the Claude command
        const claudeCommand = buildClaudeCommand(
          firstTask.agent,
          request,
          firstTask.id,
          result.data.id
        );

        if (isBackground) {
          // Launch Claude CLI in background
          const child = spawn('claude', claudeCommand, {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
              ...process.env,
              CARRIER_TASK_ID: firstTask.id,
              CARRIER_DEPLOYED_ID: result.data.id
            }
          });

          // Store process info
          await carrier.updateTaskProcessInfo(result.data.id, firstTask.id, child.pid || 0);

          // Unref to allow parent to exit
          child.unref();

          console.log(`\nTask ${firstTask.id} launched in background (PID: ${child.pid})`);
          console.log(`Check status with: carrier status ${result.data.id}`);
        } else {
          // Launch Claude CLI interactively
          console.log('\nLaunching interactive Claude Code session...');
          console.log('(Press Ctrl+C to cancel)\n');

          const child = spawn('claude', claudeCommand, {
            stdio: 'inherit',
            env: {
              ...process.env,
              CARRIER_TASK_ID: firstTask.id,
              CARRIER_DEPLOYED_ID: result.data.id
            }
          });

          // Store process info
          await carrier.updateTaskProcessInfo(result.data.id, firstTask.id, child.pid || 0);

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
            await carrier.updateTaskStatus(result.data.id, firstTask.id, 'complete');
            console.log(`\nTask ${firstTask.id} completed successfully`);
            console.log(`Use "carrier status ${result.data.id}" to check fleet status`);
          } else {
            await carrier.updateTaskStatus(result.data.id, firstTask.id, 'failed');
            console.error(`\nTask ${firstTask.id} failed with exit code ${exitCode}`);
          }
        }
      } else {
        console.log(`Use "carrier status ${result.data.id}" to check progress`);
      }
    } else {
      console.error(`Deployment failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}