/**
 * Task status command implementation
 */

import fs from 'fs';
import path from 'path';

export async function taskStatus(
  carrierPath: string,
  params: string[]
): Promise<void> {
  const deployedId = params[0];
  const taskId = params[1];
  const jsonFormat = params.includes('--json');

  if (!deployedId || !taskId) {
    console.error('Usage: carrier task-status <deployed-id> <task-id> [--json]');
    return;
  }

  try {
    // Load deployment metadata
    const deploymentPath = path.join(carrierPath, 'deployed', deployedId);
    const metadataPath = path.join(deploymentPath, 'metadata.json');

    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Deployment ${deployedId} not found`);
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const task = metadata.tasks?.find((t: any) => t.taskId === taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found in deployment ${deployedId}`);
    }

    if (jsonFormat) {
      console.log(JSON.stringify({
        deployedId,
        taskId,
        status: task.status || 'pending',
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        output: task.output
      }, null, 2));
    } else {
      console.log(`Task: ${taskId}`);
      console.log(`Deployment: ${deployedId}`);
      console.log(`Status: ${task.status || 'pending'}`);
      if (task.startedAt) console.log(`Started: ${task.startedAt}`);
      if (task.completedAt) console.log(`Completed: ${task.completedAt}`);
    }
  } catch (error: any) {
    if (jsonFormat) {
      console.log(JSON.stringify({ error: error.message }, null, 2));
    } else {
      console.error(`Error: ${error.message}`);
    }
  }
}