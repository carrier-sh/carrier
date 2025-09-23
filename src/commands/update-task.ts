/**
 * Update task status command implementation
 */

import { CarrierCore } from '../core.js';

export async function updateTask(
  carrier: CarrierCore,
  params: string[]
): Promise<void> {
  const deployedId = params[0];
  const taskId = params[1];
  const statusIndex = params.findIndex(p => p === '--status');
  const status = statusIndex !== -1 ? params[statusIndex + 1] : '';

  if (!deployedId || !taskId || !status) {
    console.error('Usage: carrier update-task <deployed-id> <task-id> --status <status>');
    return;
  }

  try {
    const result = await carrier.updateTaskStatus(deployedId, taskId, status as any);
    if (result.success) {
      console.log(`✓ Updated task ${taskId} status to ${status}`);
    } else {
      console.error(`Error: ${result.error}`);
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
  }
}