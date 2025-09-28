import { CarrierCore } from '../core.js';
import { TaskExecutor } from '../task-executor.js';

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
    console.log(`Launching task ${taskId} with agent type: ${agentType}`);

    // Use centralized task executor
    const taskExecutor = new TaskExecutor(carrier);
    const taskResult = await taskExecutor.executeTask({
      deployedId: deployedId,
      taskId: taskId,
      agentType: agentType,
      prompt: prompt,
      background: isBackground,
      interactive: !isBackground,
      timeout: timeout
    });

    if (!taskResult.success) {
      console.error(`Task execution failed: ${taskResult.message}`);
      await carrier.updateTaskStatus(deployedId, taskId, 'failed');
    }
  } catch (error: any) {
    console.error(`Error executing task: ${error.message}`);
    await carrier.updateTaskStatus(deployedId, taskId, 'failed');
  }
}