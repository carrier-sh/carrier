/**
 * Deploy fleet command implementation
 */

import fs from 'fs';
import { CarrierCore } from '../core.js';

export async function deploy(
  carrier: CarrierCore,
  carrierPath: string,
  params: string[]
): Promise<void> {
  const fleetId = params[0];
  const request = params.slice(1).join(' ');

  if (!fleetId || !request) {
    console.error('Usage: carrier deploy <fleet-id> "<request>"');
    console.error('Example: carrier deploy code-change "Add dark mode to settings"');
    return;
  }

  // Ensure carrier is initialized
  if (!fs.existsSync(carrierPath)) {
    console.error('Carrier not initialized. Run "carrier init" first');
    return;
  }

  try {
    console.log(`🚀 Deploying fleet: ${fleetId}`);
    console.log(`📝 Request: ${request}\n`);

    const result = await carrier.createDeployed(fleetId, request);

    if (result.success && result.data) {
      console.log(`✓ Fleet deployed: ${result.data.id}`);
      console.log(`  Status: ${result.data.status}`);
      console.log(`  Current task: ${result.data.currentTask}`);
      console.log(`\nUse "carrier status ${result.data.id}" to check progress`);
    } else {
      console.error(`Deployment failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}