import { CarrierCore } from '../core.js';
import { TaskExecutor } from '../executor.js';
import { StreamManager } from '../stream.js';

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

export async function benchmark(
  carrier: CarrierCore,
  carrierPath: string,
  params: string[]
): Promise<void> {
  const task = params[0];
  const agentsFlag = params.find(p => p.startsWith('--agents='));

  if (!task || !agentsFlag) {
    console.error('Usage: carrier benchmark "<task>" --agents=<agent1,agent2,...>');
    console.error('\nExamples:');
    console.error('  carrier benchmark "fix auth bug" --agents=researcher,debugger,security-expert');
    console.error('  carrier benchmark "add feature" --agents=designer,implementer');
    return;
  }

  const agentNames = agentsFlag.replace('--agents=', '').split(',').map(a => a.trim());

  if (agentNames.length < 2) {
    console.error('Error: At least 2 agents are required for benchmarking');
    return;
  }

  console.log(`\n📊 Benchmark: ${task}`);
  console.log(`🤖 Agents: ${agentNames.join(', ')}\n`);

  // Create temporary fleets for each agent
  const results: BenchmarkResult[] = [];
  const startTime = Date.now();

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

    try {
      // Create a simple single-task fleet for this agent
      const fleetId = `benchmark-${agentName}-${Date.now()}`;
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

      // Save temporary fleet
      carrier.saveFleet(fleet);

      // Deploy the fleet
      const deployment = await carrier.createDeployed(fleetId, task);

      if (!deployment.success || !deployment.data) {
        result.status = 'failed';
        result.success = false;
        return result;
      }

      result.deploymentId = deployment.data.id;

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

      const streamManager = new StreamManager(carrierPath, deployment.data.id);

      // Track metrics from stream events
      const unsubscribe = streamManager.subscribe((event) => {
        if (event.type === 'tool_use' && event.content.name === 'Read') {
          result.filesRead++;
        }
        if (event.type === 'tool_use' && (event.content.name === 'Write' || event.content.name === 'Edit')) {
          result.filesModified++;
        }
        if (event.type === 'tool_use' && event.content.name === 'Bash') {
          result.commandsRun++;
        }
        if (event.type === 'error') {
          result.errors++;
        }
      });

      const taskResult = await taskExecutor.executeTask(
        deployment.data.id,
        fleet.tasks[0],
        task,
        {}
      );

      unsubscribe();

      result.endTime = Date.now();
      result.duration = result.endTime - result.startTime;
      result.status = taskResult.success ? 'completed' : 'failed';
      result.success = taskResult.success;

      return result;

    } catch (error) {
      result.endTime = Date.now();
      result.duration = result.endTime - result.startTime;
      result.status = 'failed';
      result.success = false;
      return result;
    }
  });

  // Wait for all agents to complete
  const completedResults = await Promise.all(promises);
  results.push(...completedResults);

  const totalTime = Date.now() - startTime;

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
  }

  // Recommendations
  console.log('\n💡 Recommendations:');

  if (fastestAgent) {
    console.log(`   - Use '${fastestAgent.agentName}' for speed`);
  }

  const mostThorough = sortedResults.reduce((max, r) =>
    (r.filesRead + r.filesModified) > (max.filesRead + max.filesModified) ? r : max
  );

  if (mostThorough && mostThorough.success) {
    console.log(`   - Use '${mostThorough.agentName}' for thoroughness (${mostThorough.filesRead + mostThorough.filesModified} files touched)`);
  }

  console.log('\n');
}
