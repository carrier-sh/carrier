/**
 * Get task output command implementation
 */

import { CarrierCore } from '../core.js';

export async function getOutput(
  carrier: CarrierCore,
  params: string[]
): Promise<void> {
  const deployedId = params[0];
  const taskId = params[1];

  if (!deployedId || !taskId) {
    console.error('Usage: carrier get-output <deployed-id> <task-id>');
    return;
  }

  try {
    const content = carrier.loadTaskOutput(deployedId, taskId);
    console.log(content);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
  }
}