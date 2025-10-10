/**
 * Compare Command - Compare two agents based on historical deployment data
 */

import { CarrierCore } from '../core.js';
import { HistoryService } from '../services/history.js';
import chalk from 'chalk';

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format number with commas
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Calculate estimated cost based on token usage
 */
function calculateCost(tokens: number): number {
  // Rough estimate based on Claude 3.5 Sonnet pricing
  const avgCostPerToken = 0.009 / 1000; // Average of input/output costs
  return tokens * avgCostPerToken;
}

/**
 * Compare two agents based on historical data
 */
export async function compare(
  carrier: CarrierCore,
  carrierPath: string,
  params: string[]
): Promise<void> {
  // Parse arguments
  let agent1: string | undefined;
  let agent2: string | undefined;
  let taskFilter: string | undefined;
  let jsonOutput = false;

  for (let i = 0; i < params.length; i++) {
    const param = params[i];

    if (param === '--json') {
      jsonOutput = true;
    } else if (param === '--task' && i + 1 < params.length) {
      taskFilter = params[++i];
    } else if (param.startsWith('--task=')) {
      taskFilter = param.replace('--task=', '');
    } else if (!agent1) {
      agent1 = param;
    } else if (!agent2) {
      agent2 = param;
    }
  }

  // Validate arguments
  if (!agent1 || !agent2) {
    console.error('Usage: carrier compare <agent1> <agent2> [--task "<filter>"] [--json]');
    console.error('\nExamples:');
    console.error('  carrier compare code-analyzer code-executor');
    console.error('  carrier compare researcher debugger --task "fix auth"');
    console.error('  carrier compare security-expert implementer --task review --json');
    return;
  }

  const historyService = new HistoryService(carrierPath);

  try {
    // Perform comparison
    const comparison = await historyService.compareAgents(agent1, agent2, taskFilter);

    if (jsonOutput) {
      // Output as JSON
      console.log(JSON.stringify(comparison, null, 2));
      return;
    }

    // Format and display results
    console.log(chalk.cyan('\n📊 Historical Agent Comparison'));
    console.log(chalk.gray('─'.repeat(80)));

    if (taskFilter) {
      console.log(chalk.yellow(`📌 Task Filter: "${taskFilter}"`));
      console.log(chalk.gray('─'.repeat(80)));
    }

    // Agent 1 metrics
    const m1 = comparison.metrics.agent1;
    console.log(chalk.bold.white(`\n🤖 ${agent1}`));

    if (m1.totalDeployments === 0) {
      console.log(chalk.red('   No historical data available'));
    } else {
      console.log(`   ${chalk.green('✓')} Deployments: ${m1.totalDeployments} (${m1.successfulDeployments} successful, ${m1.failedDeployments} failed)`);
      console.log(`   ${chalk.green('✓')} Success Rate: ${chalk.bold(m1.successRate.toFixed(1) + '%')}`);
      console.log(`   ${chalk.green('✓')} Average Duration: ${chalk.bold(formatDuration(m1.averageDuration))}`);
      console.log(`   ${chalk.green('✓')} Duration Range: ${formatDuration(m1.minDuration)} - ${formatDuration(m1.maxDuration)}`);
      console.log(`   ${chalk.green('✓')} Average Tokens: ${chalk.bold(formatNumber(Math.round(m1.averageTokens)))}`);
      console.log(`   ${chalk.green('✓')} Est. Cost/Run: ${chalk.bold('$' + calculateCost(m1.averageTokens).toFixed(4))}`);
      console.log(`   ${chalk.green('✓')} Files: ${m1.averageFilesRead.toFixed(1)} read, ${m1.averageFilesWritten.toFixed(1)} written (avg)`);

      if (m1.commonTools.length > 0) {
        console.log(`   ${chalk.green('✓')} Common Tools:`);
        m1.commonTools.slice(0, 3).forEach(tool => {
          console.log(`      • ${tool.tool}: ${tool.count} calls (${tool.percentage.toFixed(1)}%)`);
        });
      }
    }

    // Agent 2 metrics
    const m2 = comparison.metrics.agent2;
    console.log(chalk.bold.white(`\n🤖 ${agent2}`));

    if (m2.totalDeployments === 0) {
      console.log(chalk.red('   No historical data available'));
    } else {
      console.log(`   ${chalk.green('✓')} Deployments: ${m2.totalDeployments} (${m2.successfulDeployments} successful, ${m2.failedDeployments} failed)`);
      console.log(`   ${chalk.green('✓')} Success Rate: ${chalk.bold(m2.successRate.toFixed(1) + '%')}`);
      console.log(`   ${chalk.green('✓')} Average Duration: ${chalk.bold(formatDuration(m2.averageDuration))}`);
      console.log(`   ${chalk.green('✓')} Duration Range: ${formatDuration(m2.minDuration)} - ${formatDuration(m2.maxDuration)}`);
      console.log(`   ${chalk.green('✓')} Average Tokens: ${chalk.bold(formatNumber(Math.round(m2.averageTokens)))}`);
      console.log(`   ${chalk.green('✓')} Est. Cost/Run: ${chalk.bold('$' + calculateCost(m2.averageTokens).toFixed(4))}`);
      console.log(`   ${chalk.green('✓')} Files: ${m2.averageFilesRead.toFixed(1)} read, ${m2.averageFilesWritten.toFixed(1)} written (avg)`);

      if (m2.commonTools.length > 0) {
        console.log(`   ${chalk.green('✓')} Common Tools:`);
        m2.commonTools.slice(0, 3).forEach(tool => {
          console.log(`      • ${tool.tool}: ${tool.count} calls (${tool.percentage.toFixed(1)}%)`);
        });
      }
    }

    // Comparison summary
    console.log(chalk.gray('\n─'.repeat(80)));
    console.log(chalk.bold.cyan('📈 Comparison Summary'));

    if (m1.totalDeployments > 0 && m2.totalDeployments > 0) {
      // Speed comparison
      const speedDiff = Math.abs(m1.averageDuration - m2.averageDuration);
      const fasterAgent = comparison.summary.fasterAgent;
      const speedPercent = ((speedDiff / Math.max(m1.averageDuration, m2.averageDuration)) * 100).toFixed(1);
      console.log(`   ${chalk.yellow('⚡')} Speed: ${chalk.bold(fasterAgent)} is ${chalk.green(formatDuration(speedDiff))} faster (${speedPercent}%)`);

      // Token efficiency comparison
      const tokenDiff = Math.abs(m1.averageTokens - m2.averageTokens);
      const efficientAgent = comparison.summary.moreEfficientAgent;
      const tokenPercent = ((tokenDiff / Math.max(m1.averageTokens, m2.averageTokens)) * 100).toFixed(1);
      console.log(`   ${chalk.yellow('💰')} Efficiency: ${chalk.bold(efficientAgent)} uses ${chalk.green(formatNumber(Math.round(tokenDiff)))} fewer tokens (${tokenPercent}%)`);

      // Success rate comparison
      const successDiff = Math.abs(m1.successRate - m2.successRate);
      const reliableAgent = comparison.summary.higherSuccessRate;
      console.log(`   ${chalk.yellow('✅')} Reliability: ${chalk.bold(reliableAgent)} has ${chalk.green(successDiff.toFixed(1) + '%')} higher success rate`);

      // Cost comparison
      const cost1 = calculateCost(m1.averageTokens);
      const cost2 = calculateCost(m2.averageTokens);
      const costDiff = Math.abs(cost1 - cost2);
      const cheaperAgent = cost1 < cost2 ? agent1 : agent2;
      const costPercent = ((costDiff / Math.max(cost1, cost2)) * 100).toFixed(1);
      console.log(`   ${chalk.yellow('💵')} Cost: ${chalk.bold(cheaperAgent)} is ${chalk.green('$' + costDiff.toFixed(4))} cheaper per run (${costPercent}%)`);
    }

    // Recommendation
    console.log(chalk.gray('\n─'.repeat(80)));
    console.log(chalk.bold.green('🎯 Recommendation'));
    console.log(`   ${comparison.summary.recommendation}`);

    // Additional insights
    if (m1.totalDeployments > 0 && m2.totalDeployments > 0) {
      console.log(chalk.gray('\n─'.repeat(80)));
      console.log(chalk.dim('💡 Additional Insights'));

      // Sample size warning
      if (m1.totalDeployments < 5 || m2.totalDeployments < 5) {
        console.log(chalk.yellow('   ⚠️  Small sample size - results may not be statistically significant'));
      }

      // Tool usage differences
      const tools1 = new Set(m1.commonTools.map(t => t.tool));
      const tools2 = new Set(m2.commonTools.map(t => t.tool));
      const uniqueTools1 = Array.from(tools1).filter(t => !tools2.has(t));
      const uniqueTools2 = Array.from(tools2).filter(t => !tools1.has(t));

      if (uniqueTools1.length > 0) {
        console.log(`   • ${agent1} uniquely uses: ${uniqueTools1.join(', ')}`);
      }
      if (uniqueTools2.length > 0) {
        console.log(`   • ${agent2} uniquely uses: ${uniqueTools2.join(', ')}`);
      }

      // Consistency analysis
      if (m1.maxDuration > m1.averageDuration * 2) {
        console.log(`   • ${agent1} has high variance in execution time (may be less predictable)`);
      }
      if (m2.maxDuration > m2.averageDuration * 2) {
        console.log(`   • ${agent2} has high variance in execution time (may be less predictable)`);
      }
    }

    console.log(chalk.gray('─'.repeat(80)));
    console.log('');

  } catch (error) {
    console.error(chalk.red('Error comparing agents:'), error);
    process.exit(1);
  }
}