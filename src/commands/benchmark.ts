import { CarrierCore } from '../core.js';
import { TaskExecutor } from '../executor.js';
import { StreamManager } from '../stream.js';
import { join } from 'path';
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, rmSync } from 'fs';

interface BenchmarkResult {
  agentName: string;
  deploymentId: number;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'running' | 'completed' | 'failed';
  filesRead: number;
  filesModified: number;
  commandsRun: number;
  errors: number;
  success: boolean;
}

interface ContextMetrics {
  filesAccessed: Array<{ path: string; operation: string }>;
  commandsExecuted: Array<any>;
  toolsUsed: Record<string, number>;
}

export async function benchmark(
  carrier: CarrierCore,
  carrierPath: string,
  params: string[]
): Promise<void> {
  const task = params[0];

  // Handle both --agents=value and --agents value formats
  let agentsValue: string | undefined;
  const agentsFlag = params.find(p => p.startsWith('--agents='));

  if (agentsFlag) {
    agentsValue = agentsFlag.replace('--agents=', '');
  } else {
    const agentsIndex = params.findIndex(p => p === '--agents');
    if (agentsIndex !== -1 && agentsIndex + 1 < params.length) {
      agentsValue = params[agentsIndex + 1];
    }
  }

  if (!task || !agentsValue) {
    console.error('Usage: carrier benchmark "<task>" --agents=<agent1,agent2,...>');
    console.error('\nExamples:');
    console.error('  carrier benchmark "fix auth bug" --agents=researcher,debugger,security-expert');
    console.error('  carrier benchmark "add feature" --agents=designer,implementer');
    return;
  }

  const agentNames = agentsValue.split(',').map(a => a.trim());

  if (agentNames.length < 2) {
    console.error('Error: At least 2 agents are required for benchmarking');
    return;
  }

  // Validate that all agents exist
  const agentsDir = join(carrierPath, 'agents');
  const availableAgents: string[] = [];

  if (existsSync(agentsDir)) {
    availableAgents.push(...readdirSync(agentsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', '')));
  }

  // Check seed agents as well
  const seedAgentsPath = join(process.cwd(), 'seed', 'agents');
  if (existsSync(seedAgentsPath)) {
    const seedAgents = readdirSync(seedAgentsPath)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));

    seedAgents.forEach(agent => {
      if (!availableAgents.includes(agent)) {
        availableAgents.push(agent);
      }
    });
  }

  const missingAgents = agentNames.filter(name => !availableAgents.includes(name));

  if (missingAgents.length > 0) {
    console.error(`❌ Error: The following agents were not found: ${missingAgents.join(', ')}`);
    console.error('\n📋 Available agents:');
    availableAgents.forEach(agent => console.error(`  • ${agent}`));
    console.error('\n💡 Suggestions:');
    console.error('  1. Check agent names for typos');
    console.error('  2. Create missing agents with: carrier agent create --interactive');
    console.error('  3. Pull agents from a fleet with: carrier pull <fleet-name>');
    return;
  }

  console.log(`\n📊 Benchmark: ${task}`);
  console.log(`🤖 Agents: ${agentNames.join(', ')}\n`);

  // Create temporary fleets for each agent
  const results: BenchmarkResult[] = [];
  const startTime = Date.now();
  const tempFleetIds: string[] = [];  // Track fleets for cleanup

  // Run agents in parallel
  const promises = agentNames.map(async (agentName) => {
    const result: BenchmarkResult = {
      agentName,
      deploymentId: 0,
      startTime: Date.now(),
      status: 'running',
      filesRead: 0,
      filesModified: 0,
      commandsRun: 0,
      errors: 0,
      success: false
    };

    let fleetId: string | null = null;

    try {
      // Create a simple single-task fleet for this agent
      fleetId = `benchmark-${agentName}-${Date.now()}`;
      tempFleetIds.push(fleetId); // Track for cleanup

      const fleet = {
        id: fleetId,
        description: `Benchmark fleet for ${agentName}`,
        tasks: [
          {
            id: 'benchmark-task',
            description: task,
            agent: agentName,
            inputs: [],
            outputs: [],
            nextTasks: []
          }
        ]
      };

      // Save temporary fleet to filesystem
      const fleetDir = join(carrierPath, 'fleets', fleetId);
      const fleetPath = join(fleetDir, `${fleetId}.json`);
      mkdirSync(fleetDir, { recursive: true });
      writeFileSync(fleetPath, JSON.stringify(fleet, null, 2));

      // Deploy the fleet
      const deployment = await carrier.createDeployed(fleetId, task);

      if (!deployment.success || !deployment.data) {
        result.status = 'failed';
        result.success = false;
        return result;
      }

      result.deploymentId = deployment.data.id as unknown as number;

      // Execute the task
      const taskExecutor = new TaskExecutor(carrier, carrierPath, {
        isGlobal: false,
        providerOptions: {
          claude: {
            carrierPath,
            isGlobal: false,
            permissionMode: 'acceptEdits',
            cwd: process.cwd()
          }
        }
      });

      // We'll use the stream manager but won't rely on stream events for metrics
      const streamManager = new StreamManager(carrierPath);

      const taskResult = await taskExecutor.executeTask({
        deployedId: deployment.data.id,
        taskId: fleet.tasks[0].id,
        agentType: agentName,
        prompt: task
      });

      result.endTime = Date.now();
      result.duration = result.endTime - result.startTime;
      result.status = taskResult.success ? 'completed' : 'failed';
      result.success = taskResult.success;

      // Read actual metrics from context JSON for accuracy
      try {
        const contextPath = join(carrierPath, 'deployed', deployment.data.id.toString(), 'context', 'benchmark-task.json');
        if (existsSync(contextPath)) {
          const contextData = JSON.parse(readFileSync(contextPath, 'utf-8')) as ContextMetrics;

          // Count files read and modified from filesAccessed
          if (contextData.filesAccessed) {
            result.filesRead = contextData.filesAccessed.filter(f => f.operation === 'read').length;
            result.filesModified = contextData.filesAccessed.filter(f => f.operation === 'write' || f.operation === 'edit').length;
          }

          // Count commands executed
          if (contextData.commandsExecuted) {
            result.commandsRun = contextData.commandsExecuted.length;
          }

          // Count tool usage for better accuracy
          if (contextData.toolsUsed) {
            // Use toolsUsed counts which are more accurate
            result.filesRead = contextData.toolsUsed.Read || 0;
            const writes = (contextData.toolsUsed.Write || 0) + (contextData.toolsUsed.Edit || 0) + (contextData.toolsUsed.MultiEdit || 0);
            result.filesModified = writes;
            result.commandsRun = contextData.toolsUsed.Bash || 0;
          }
        }
      } catch (metricsError) {
        console.error(`⚠️ Could not read metrics for ${agentName}: ${metricsError}`);
        // Fall back to basic results
      }

      return result;

    } catch (error) {
      result.endTime = Date.now();
      result.duration = result.endTime - result.startTime;
      result.status = 'failed';
      result.success = false;

      // Capture specific error for better reporting
      if (error instanceof Error) {
        result.errors = 1;
        console.error(`⚠️ ${agentName} failed: ${error.message}`);
      } else {
        result.errors = 1;
        console.error(`⚠️ ${agentName} failed with unknown error`);
      }

      return result;
    }
  });

  // Wait for all agents to complete
  const completedResults = await Promise.all(promises);
  results.push(...completedResults);

  const totalTime = Date.now() - startTime;

  // Cleanup temporary benchmark fleets
  console.log('🧹 Cleaning up temporary benchmark fleets...');
  for (const fleetId of tempFleetIds) {
    try {
      const fleetDir = join(carrierPath, 'fleets', fleetId);
      if (existsSync(fleetDir)) {
        rmSync(fleetDir, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      console.warn(`⚠️ Could not clean up fleet ${fleetId}: ${cleanupError}`);
    }
  }

  // Display results in a table
  console.log('\n┌─ Benchmark Results ─────────────────────────────────────────────┐');
  console.log('│                                                                  │');

  // Header
  console.log('│ Agent              Time    Files   Commands   Errors   Status   │');
  console.log('│ ────────────────────────────────────────────────────────────────│');

  // Sort by duration (fastest first)
  const sortedResults = results.sort((a, b) => (a.duration || 0) - (b.duration || 0));

  sortedResults.forEach((result, index) => {
    const isWinner = index === 0 && result.success;
    const name = result.agentName.padEnd(16).substring(0, 16);
    const time = result.duration ? `${(result.duration / 1000).toFixed(1)}s`.padEnd(7) : 'N/A    ';
    const files = `${result.filesRead}/${result.filesModified}`.padEnd(7);
    const commands = result.commandsRun.toString().padEnd(10);
    const errors = result.errors.toString().padEnd(8);
    const status = result.success ? '✓' : '✗';
    const winner = isWinner ? '🏆' : '  ';

    console.log(`│ ${winner}${name} ${time} ${files} ${commands} ${errors} ${status}       │`);
  });

  console.log('│                                                                  │');
  console.log('└──────────────────────────────────────────────────────────────────┘\n');

  // Summary
  const successfulRuns = results.filter(r => r.success).length;
  const fastestAgent = sortedResults.find(r => r.success);

  console.log(`📊 Summary:`);
  console.log(`   Total time: ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`   Successful runs: ${successfulRuns}/${results.length}`);

  if (fastestAgent) {
    console.log(`   🏆 Winner: ${fastestAgent.agentName} (${(fastestAgent.duration! / 1000).toFixed(1)}s)`);
  } else if (successfulRuns === 0) {
    console.log(`   ❌ All agents failed to complete the task`);
  }

  // Recommendations
  if (successfulRuns > 0) {
    console.log('\n💡 Recommendations:');

    if (fastestAgent) {
      console.log(`   - Use '${fastestAgent.agentName}' for speed`);
    }

    const successfulAgents = sortedResults.filter(r => r.success);
    const mostThorough = successfulAgents.reduce((max, r) =>
      (r.filesRead + r.filesModified) > (max.filesRead + max.filesModified) ? r : max,
      successfulAgents[0]
    );

    if (mostThorough && mostThorough !== fastestAgent) {
      console.log(`   - Use '${mostThorough.agentName}' for thoroughness (${mostThorough.filesRead + mostThorough.filesModified} files touched)`);
    }

    const leastErrors = successfulAgents.reduce((min, r) =>
      r.errors < min.errors ? r : min, successfulAgents[0]
    );

    if (leastErrors && leastErrors.errors === 0 && leastErrors !== fastestAgent && leastErrors !== mostThorough) {
      console.log(`   - Use '${leastErrors.agentName}' for reliability (0 errors)`);
    }
  } else {
    console.log('\n⚠️ Troubleshooting Tips:');
    console.log('   - Check that agents are appropriate for this task');
    console.log('   - Review agent configurations for required tools');
    console.log('   - Try running individual agents with: carrier deploy <fleet> "<task>"');
    console.log('   - Check deployment logs in .carrier/deployed/*/logs/');
  }

  console.log('\n');
}
