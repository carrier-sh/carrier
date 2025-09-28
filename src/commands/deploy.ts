import fs from 'fs';
import { CarrierCore } from '../core.js';
import { TaskExecutor } from '../task-executor.js';

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

        // Use centralized task executor
        const taskExecutor = new TaskExecutor(carrier);
        const taskResult = await taskExecutor.executeTask({
          deployedId: result.data.id,
          taskId: firstTask.id,
          agentType: firstTask.agent,
          prompt: request,
          background: isBackground,
          interactive: !isBackground
        });

        if (!taskResult.success) {
          console.error(`Task execution failed: ${taskResult.message}`);
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