import { CarrierCore } from '../core.js';
import { TaskExecutor } from '../task-executor.js';

export async function watchLogs(
  core: CarrierCore,
  params: string[],
  carrierPath?: string
): Promise<void> {
  const deployedId = params[0];
  const taskId = params[1];

  if (!deployedId) {
    console.error('Usage: carrier watch-logs <deployed-id> [task-id]');
    console.error('       carrier watch-logs <deployed-id> --list    # List available logs');
    return;
  }

  const taskExecutor = new TaskExecutor(core, carrierPath);

  if (params.includes('--list') || !taskId) {
    // List available logs
    taskExecutor.listSessionLogs(deployedId);
    return;
  }

  // Watch specific task logs
  await taskExecutor.watchSessionLogs(deployedId, taskId);
}