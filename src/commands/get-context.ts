/**
 * Get task context command implementation
 */

import { CarrierCore } from '../core.js';

export async function getContext(
  carrier: CarrierCore,
  params: string[]
): Promise<void> {
  const deployedId = params[0];
  const taskId = params[1];

  if (!deployedId || !taskId) {
    console.error('Usage: carrier get-context <deployed-id> <task-id>');
    return;
  }

  try {
    const context = await carrier.getTaskContext(deployedId, taskId);
    console.log(JSON.stringify(context, null, 2));
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
  }
}