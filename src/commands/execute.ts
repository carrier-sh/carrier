export async function execute(this: any, params: string[]): Promise<void> {
  const deployedId = params[0];
  const timeoutIndex = params.findIndex(p => p === '--timeout');
  const timeout = timeoutIndex !== -1 ? parseInt(params[timeoutIndex + 1]) : 300;
  const isBackground = params.includes('--background');
  
  if (!deployedId) {
    console.error('Usage: carrier execute <deployed-id> [--timeout <seconds>] [--background]');
    return;
  }
  
  try {
    // Get deployed fleet information
    const deployed = this.carrier.getDeployedFleet(deployedId);
    
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
    
    // Execute the task using the existing executeTask method
    const executeParams = [
      deployedId,
      currentTaskId,
      '--agent-type', agentType,
      '--prompt', request
    ];
    
    if (timeoutIndex !== -1) {
      executeParams.push('--timeout', timeout.toString());
    }
    
    if (isBackground) {
      executeParams.push('--background');
    }
    
    // Call the existing executeTask implementation
    await this.executeTask(executeParams);
    
  } catch (error: any) {
    console.error(`Error executing deployment: ${error.message}`);
  }
}