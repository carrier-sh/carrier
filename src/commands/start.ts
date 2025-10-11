/**
 * Start command - Start or start a stopped/cancelled deployment
 * Continues execution from where it was stopped with full context
 */

import * as fs from 'fs';
import * as path from 'path';
import { CarrierCore } from '../core.js';
import { TaskExecutor } from '../executor.js';
import { ContextExtractor } from '../context-extractor.js';

export async function start(
  carrier: CarrierCore,
  carrierPath: string,
  params: string[]
): Promise<void> {
  const deployedId = params[0];
  const force = params.includes('--force') || params.includes('-f');
  const fromStart = params.includes('--from-start');
  const isDetached = params.includes('--detach') || params.includes('-d');

  if (!deployedId) {
    console.error('Usage: carrier start <deployment-id> [options]');
    console.error('\nOptions:');
    console.error('  -f, --force        Start without confirmation');
    console.error('  -d, --detach       Start in background (don\'t attach to output)');
    console.error('  --from-start       Restart from the beginning (re-run all tasks)');
    console.error('\nExamples:');
    console.error('  carrier start 5              # Start and attach to output');
    console.error('  carrier start 5 --detach     # Start in background');
    console.error('  carrier start 5 --from-start # Restart from first task');
    return;
  }

  // Get deployment details
  const deployed = carrier.getDeployedFleet(deployedId);
  if (!deployed) {
    console.error(`Deployment ${deployedId} not found`);
    return;
  }

  // Check current status
  if (deployed.status === 'active') {
    // Check if the current task actually failed
    const currentTaskStatus = deployed.tasks.find(t => t.taskId === deployed.currentTask);
    if (currentTaskStatus && currentTaskStatus.status === 'failed') {
      console.log(`Deployment ${deployedId} has a failed task: ${deployed.currentTask}`);
      console.log('Proceeding with start...');
    } else {
      console.log(`Deployment ${deployedId} is already active`);
      console.log('Use "carrier status" to check progress');
      return;
    }
  }

  if (deployed.status === 'complete') {
    console.log(`Deployment ${deployedId} is already complete`);
    return;
  }

  // Allow start if status is cancelled, failed, or has a failed task
  const hasFailedTask = deployed.tasks.some(t => t.status === 'failed');
  if (deployed.status !== 'cancelled' && deployed.status !== 'failed' && !hasFailedTask && !fromStart) {
    console.log(`Deployment ${deployedId} has status: ${deployed.status}`);
    console.log('Only cancelled, failed, or deployments with failed tasks can be started');
    console.log('Use --from-start to restart from the beginning');
    return;
  }

  // Show confirmation unless forced
  if (!force) {
    console.log(`\n📋 About to start deployment ${deployedId}`);
    console.log(`   Fleet: ${deployed.fleetId}`);
    console.log(`   Request: ${deployed.request}`);
    console.log(`   Previous status: ${deployed.status}`);

    if (fromStart) {
      console.log(`   ⚠️  Will restart from the first task`);
    } else {
      console.log(`   Will continue from: ${deployed.currentTask || 'beginning'}`);
    }

  }

  // Remove stop marker if it exists
  const stopMarkerPath = path.join(carrierPath, 'deployed', deployedId, '.stop');
  if (fs.existsSync(stopMarkerPath)) {
    fs.unlinkSync(stopMarkerPath);
    console.log('✓ Removed stop marker');
  }

  // Get the fleet configuration
  const fleet = carrier.loadFleet(deployed.fleetId);

  // Determine which task to start from
  let taskToStart: any;
  let taskIndex = 0;

  if (fromStart) {
    // Start from the beginning
    taskToStart = fleet.tasks[0];
    taskIndex = 0;
    console.log(`\n🔄 Restarting from first task: ${taskToStart.id}`);

    // Reset all task statuses
    for (const task of deployed.tasks) {
      await carrier.updateTaskStatus(deployedId, task.taskId, 'pending');
    }
  } else {
    // Find the task that was interrupted
    if (deployed.currentTask) {
      // Start from current task
      taskToStart = fleet.tasks.find(t => t.id === deployed.currentTask);
      taskIndex = fleet.tasks.findIndex(t => t.id === deployed.currentTask);

      if (!taskToStart) {
        console.error(`Could not find task ${deployed.currentTask} in fleet`);
        return;
      }

      console.log(`\n🔄 Starting from task: ${taskToStart.id}`);
    } else {
      // Find first non-complete task
      for (let i = 0; i < fleet.tasks.length; i++) {
        const task = fleet.tasks[i];
        const deployedTask = deployed.tasks.find(dt => dt.taskId === task.id);

        if (!deployedTask || deployedTask.status !== 'complete') {
          taskToStart = task;
          taskIndex = i;
          break;
        }
      }

      if (!taskToStart) {
        console.log('All tasks are complete, nothing to start');
        return;
      }

      console.log(`\n🔄 Starting from task: ${taskToStart.id}`);
    }
  }

  // Update deployment status to active
  await carrier.updateDeployedStatus(deployedId, 'active', taskToStart.id, taskToStart.agent);
  console.log('✓ Updated deployment status to active');

  // Build smart context using the context extractor
  let contextPrompt = deployed.request; // Start with original request

  if (!fromStart) {
    console.log('📚 Extracting context from previous execution...');

    const contextExtractor = new ContextExtractor(carrierPath);

    try {
      // Extract context from original files (non-destructive)
      // This reads all task context JSON files and aggregates them in-memory
      const deploymentContext = await contextExtractor.extractDeploymentContext(deployedId);

      // Generate compact resumption prompt (in-memory, doesn't modify files)
      contextPrompt = contextExtractor.generateResumptionPrompt(deploymentContext);

      // Save compacted summary to cache for fast future access
      // Original context files remain untouched for audit/debugging
      await contextExtractor.saveContextCache(deployedId);

      console.log('✓ Context extracted and compacted:');
      console.log(`  - Original context: ${deploymentContext.tasksCompleted.length} tasks, full detail preserved`);
      console.log(`  - Files read: ${deploymentContext.globalFilesRead.size}`);
      console.log(`  - Files modified: ${deploymentContext.globalFilesModified.size}`);
      console.log(`  - Compacted prompt: ${(contextPrompt.length / 1024).toFixed(1)} KB`);

      // Add task-specific context if starting from a specific task
      const currentTaskContext = deploymentContext.taskContexts.get(taskToStart.id);
      if (currentTaskContext && currentTaskContext.filesAccessed.length > 0) {
        console.log(`  - Current task progress: ${currentTaskContext.lastActivity || 'In progress'}`);
      }
    } catch (error) {
      console.warn('⚠️  Could not extract smart context, falling back to basic context');

      // Fallback to loading output files
      const contextSections: string[] = [];
      for (let i = 0; i < taskIndex; i++) {
        const prevTask = fleet.tasks[i];
        const outputPath = path.join(carrierPath, 'deployed', deployedId, 'outputs', `${prevTask.id}.md`);

        if (fs.existsSync(outputPath)) {
          try {
            const outputContent = fs.readFileSync(outputPath, 'utf-8');
            contextSections.push(`## Previous Task: ${prevTask.id}\n\n${outputContent}`);
            console.log(`  ✓ Loaded output from ${prevTask.id}`);
          } catch (error) {
            console.warn(`  ⚠️  Could not load output from ${prevTask.id}`);
          }
        }
      }

      if (contextSections.length > 0) {
        contextPrompt = `${deployed.request}\n\n## Context from Previous Tasks\n\n${contextSections.join('\n\n')}\n\n## Instructions\nYou are resuming a stopped deployment. Continue from where the previous tasks left off.`;
      }
    }
  }

  // Create task executor with context
  const taskExecutor = new TaskExecutor(carrier, carrierPath);

  console.log('\n🚀 Starting task execution...');

  // Use detached execution for proper process management
  const detachResult = taskExecutor.executeDetached({
    deployedId: deployedId,
    taskId: taskToStart.id,
    agentType: taskToStart.agent,
    prompt: contextPrompt
  });

  if (!detachResult.success) {
    console.error(`Failed to start task: ${detachResult.message}`);
    return;
  }

  console.log(`✅ Deployment ${deployedId} started`);

  if (isDetached) {
    // Detached mode: Return immediately
    console.log(`✨ Running in detached mode`);
    console.log(`\nDeployment ID: ${deployedId}`);
    console.log(`Watch output: carrier watch ${deployedId}`);
    console.log(`View logs: carrier logs ${deployedId}`);
    console.log(`Check status: carrier status ${deployedId}`);
    console.log(`Stop deployment: carrier stop ${deployedId}`);
  } else {
    // Default: Watch the output stream
    // Give it a moment to start
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('\nStreaming output (Press Ctrl+C to detach)...');
    console.log('────────────────────────────────────────────────\n');

    const { StreamManager } = await import('../stream.js');
    const streamManager = new StreamManager(carrierPath);

    // Set up Ctrl+C handler to detach gracefully
    const detachHandler = () => {
      console.log('\n\n✅ Detached from deployment');
      console.log(`Deployment ${deployedId} continues running in background`);
      console.log(`\nWatch output: carrier watch ${deployedId}`);
      console.log(`Check status: carrier status ${deployedId}`);
      console.log(`View logs: carrier logs ${deployedId}`);
      console.log(`Stop deployment: carrier stop ${deployedId}`);
      process.exit(0);
    };

    process.on('SIGINT', detachHandler);

    // Watch the stream
    await streamManager.watchStream(deployedId, {
      follow: true,
      tail: 50,
      format: 'pretty'
    });
  }
}