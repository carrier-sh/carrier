import { CarrierCore } from '../core.js';
import { TaskExecutor } from '../task-executor.js';

export async function execute(
  carrier: CarrierCore,
  params: string[],
  carrierPath?: string
): Promise<void> {
  const deployedId = params[0];
  const isBackground = params.includes('--background');

  if (!deployedId) {
    console.error('Usage: carrier execute <deployed-id> [--background]');
    return;
  }

  try {
    // Initialize task executor once
    const taskExecutor = new TaskExecutor(carrier, carrierPath);

    // Continue executing tasks until fleet is complete, requires approval, or fails
    while (true) {
      // Get current deployed fleet information
      const deployed = carrier.getDeployedFleet(deployedId);

      if (!deployed) {
        console.error(`Deployment ${deployedId} not found`);
        return;
      }

      if (deployed.status === 'complete') {
        console.log(`🎉 Deployment ${deployedId} is complete!`);
        return;
      }

      if (deployed.status === 'awaiting_approval') {
        console.log(`⏸️  Deployment ${deployedId} is awaiting approval`);
        console.log(`Use "carrier approve ${deployedId}" to continue`);
        return;
      }

      if (deployed.status === 'failed') {
        console.log(`❌ Deployment ${deployedId} has failed`);
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

      // Execute the current task
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
        return;
      }

      // Check if we should continue to the next task
      const updatedDeployed = carrier.getDeployedFleet(deployedId);
      if (!updatedDeployed) {
        console.error(`Deployment ${deployedId} not found after task completion`);
        return;
      }

      // If the current task changed, we have a transition - continue automatically
      // If status changed to complete, awaiting_approval, or failed, the loop will handle it on next iteration
      // If the current task is the same and status is still active, no transition occurred
      if (updatedDeployed.currentTask === currentTaskId && updatedDeployed.status === 'active') {
        console.log(`⚠️  No automatic transition available for task ${currentTaskId}`);
        return;
      }

      // Continue with the next task if we have a transition
      if (updatedDeployed.currentTask !== currentTaskId) {
        console.log(`\n➡️  Continuing to next task automatically...\n`);
      }
    }

  } catch (error: any) {
    console.error(`Error executing deployment: ${error.message}`);
  }
}