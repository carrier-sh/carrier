/**
 * Update fleet status command implementation
 */

import { CarrierCore } from '../core.js';

export async function updateFleet(
  carrier: CarrierCore,
  params: string[]
): Promise<void> {
  const deployedId = params[0];
  const statusIndex = params.findIndex(p => p === '--status');
  const status = statusIndex !== -1 ? params[statusIndex + 1] : '';
  const taskIndex = params.findIndex(p => p === '--current-task');
  const currentTask = taskIndex !== -1 ? params[taskIndex + 1] : undefined;

  if (!deployedId || !status) {
    console.error('Usage: carrier update-fleet <deployed-id> --status <status> [--current-task <task>]');
    return;
  }

  try {
    const result = await carrier.updateFleetStatus(deployedId, status as any, currentTask);
    if (result.success) {
      console.log(`✓ Updated fleet ${deployedId} status to ${status}`);
      if (currentTask) {
        console.log(`✓ Current task: ${currentTask}`);
      }
    } else {
      console.error(`Error: ${result.error}`);
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
  }
}