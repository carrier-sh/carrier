import { spawn } from 'child_process';
import { CarrierCore } from '../core.js';

function buildClaudeCommand(agentType: string, prompt: string, taskId: string, deployedId: string): string[] {
  // Create a comprehensive prompt that Claude can execute directly
  const fullPrompt = `[Carrier Task Execution]
Deployment ID: ${deployedId}
Task ID: ${taskId}
Agent Type: ${agentType}

Please use the Task tool with the following parameters:
- subagent_type: ${agentType}
- description: "Task ${taskId} for deployment ${deployedId}"
- prompt: "${prompt}"

Execute this task now and provide the results.`;

  return [fullPrompt];
}

export async function executeTask(carrier: CarrierCore, params: string[]): Promise<void> {
  const deployedId = params[0];
  const taskId = params[1];
  const agentTypeIndex = params.findIndex(p => p === '--agent-type');
  const agentType = agentTypeIndex !== -1 ? params[agentTypeIndex + 1] : '';
  const promptIndex = params.findIndex(p => p === '--prompt');
  const prompt = promptIndex !== -1 ? params.slice(promptIndex + 1, 
    params.findIndex((p, i) => i > promptIndex && p.startsWith('--')) > 0 ? 
    params.findIndex((p, i) => i > promptIndex && p.startsWith('--')) : undefined).join(' ') : '';
  const timeoutIndex = params.findIndex(p => p === '--timeout');
  const timeout = timeoutIndex !== -1 ? parseInt(params[timeoutIndex + 1]) : 300;
  const isBackground = params.includes('--background');
  const shouldWait = params.includes('--wait');

  if (!deployedId || !taskId || !agentType || !prompt) {
    console.error('Usage: carrier execute-task <deployed-id> <task-id> --agent-type <type> --prompt "<prompt>" [--timeout <seconds>] [--background] [--wait]');
    return;
  }

  try {
    // Update task status to active
    await carrier.updateTaskStatus(deployedId, taskId, 'active');
    
    // Build the Claude CLI command
    const claudeCommand = buildClaudeCommand(agentType, prompt, taskId, deployedId);
    
    console.log(`Launching task ${taskId} with agent type: ${agentType}`);
    
    // Import spawn from child_process
    const { spawn } = await import('child_process');
    
    if (isBackground) {
      // Launch Claude CLI in background
      const child = spawn('claude', claudeCommand, {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, CARRIER_TASK_ID: taskId, CARRIER_DEPLOYED_ID: deployedId }
      });
      
      // Store process info in metadata
      await carrier.updateTaskProcessInfo(deployedId, taskId, child.pid || 0);
      
      // Unref to allow parent to exit
      child.unref();
      
      console.log(`Task ${taskId} launched in background (PID: ${child.pid})`);
      console.log(`Check status with: carrier task-status ${deployedId} ${taskId}`);
    } else {
      // Launch Claude CLI and wait for completion
      const child = spawn('claude', claudeCommand, {
        stdio: 'inherit',
        env: { ...process.env, CARRIER_TASK_ID: taskId, CARRIER_DEPLOYED_ID: deployedId },
        timeout: timeout * 1000
      });
      
      // Store process info
      await carrier.updateTaskProcessInfo(deployedId, taskId, child.pid || 0);
      
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
        await carrier.updateTaskStatus(deployedId, taskId, 'complete');
        console.log(`\\nTask ${taskId} completed successfully`);
      } else {
        await carrier.updateTaskStatus(deployedId, taskId, 'failed');
        console.error(`\\nTask ${taskId} failed with exit code ${exitCode}`);
      }
    }
  } catch (error: any) {
    console.error(`Error executing task: ${error.message}`);
    await carrier.updateTaskStatus(deployedId, taskId, 'failed');
  }
}