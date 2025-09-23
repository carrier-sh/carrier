/**
 * Save task output command implementation
 */

import { CarrierCore } from '../core.js';

export async function saveOutput(
  carrier: CarrierCore,
  params: string[]
): Promise<void> {
  const deployedId = params[0];
  const taskId = params[1];
  const contentIndex = params.findIndex(p => p === '--content');
  const content = contentIndex !== -1 ? params.slice(contentIndex + 1).join(' ') : '';

  if (!deployedId || !taskId || !content) {
    console.error('Usage: carrier save-output <deployed-id> <task-id> --content "<content>"');
    return;
  }

  try {
    carrier.saveTaskOutput(deployedId, taskId, content);
    console.log(`✓ Saved output for task ${taskId} in deployment ${deployedId}`);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
  }
}