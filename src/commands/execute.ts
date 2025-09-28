import { CarrierCore } from '../core.js';
import { TaskExecutor } from '../task-executor.js';

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

    // Use centralized task executor
    const taskExecutor = new TaskExecutor(carrier);
    const taskResult = await taskExecutor.executeTask({
      deployedId: deployedId,
      taskId: currentTaskId,
      agentType: agentType,
      prompt: request,
      background: isBackground,
      interactive: !isBackground
    });

    if (!taskResult.success) {
      console.error(`Task execution failed: ${taskResult.message}`);
    }

  } catch (error: any) {
    console.error(`Error executing deployment: ${error.message}`);
  }
}