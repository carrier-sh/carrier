/**
 * Clean command implementation
 */

import { CarrierCore } from '../core.js';

export async function clean(
  carrier: CarrierCore,
  params: string[]
): Promise<void> {
  // Filter out flags to find the deployment ID
  const nonFlagParams = params.filter(p => !p.startsWith('--'));
  const deployedId = nonFlagParams[0];
  const keepOutputs = params.includes('--keep-outputs');
  const force = params.includes('--force');

  // If a deployment ID is provided, clean that specific deployment
  if (deployedId) {
    try {
      const result = await carrier.cleanDeployment(deployedId, keepOutputs);
      if (result.success) {
        console.log(`✓ Cleaned up deployment ${deployedId}`);
        if (keepOutputs) {
          console.log('  Outputs preserved');
        }
      } else {
        console.error(`Error: ${result.error}`);
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
    }
  } else {
    // No deployment ID provided - clean all completed fleets
    try {
      const result = await carrier.cleanAllCompleted(force);
      if (result.success) {
        const data = result.data as { removed: number; remaining: number; removedIds: string[] };
        if (data.removed === 0) {
          console.log('No finished deployments to clean');
        } else {
          console.log(`✓ Cleaned ${data.removed} finished deployment(s)`);
          if (data.removedIds && data.removedIds.length > 0) {
            console.log('  Removed:');
            data.removedIds.forEach(id => console.log(`    - ${id}`));
          }

          if (data.remaining > 0) {
            console.log(`  ${data.remaining} active deployment(s) remaining`);
          }
        }
      } else {
        console.error(`Error: ${result.error}`);
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
    }
  }
}