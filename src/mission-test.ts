#!/usr/bin/env bun

/**
 * Test execution for The Rogue Container mission
 * Demonstrates the complete debugging workflow
 */

import { executeRogueContainerMission } from './mission-executor.js';

async function runMissionTest() {
  console.log('🚀 Starting "The Rogue Container" Mission\n');
  console.log('=' .repeat(60));
  console.log('Mission Briefing:');
  console.log('A production container is consuming excessive memory.');
  console.log('Your task: Investigate logs, analyze metrics, identify root cause.');
  console.log('=' .repeat(60) + '\n');

  try {
    console.log('📊 Phase 1: Gathering Information...');
    console.log('  • Retrieving container logs (24 hours)');
    console.log('  • Collecting memory metrics');
    console.log('  • Fetching container configuration\n');

    const result = await executeRogueContainerMission();

    console.log('🔍 Phase 2: Analysis Results\n');

    // Display objectives completion
    console.log('✅ Objectives Completed:');
    for (const [objective, status] of Object.entries(result.objectives)) {
      console.log(`  • ${objective}: ${status.completed ? '✓' : '✗'}`);
      if (status.findings.length > 0) {
        status.findings.forEach(finding => {
          console.log(`    - ${finding}`);
        });
      }
    }
    console.log();

    // Display metrics
    console.log('📈 Metrics Analyzed:');
    console.log(`  • Logs analyzed: ${result.metrics.logsAnalyzed}`);
    console.log(`  • Peak memory: ${result.metrics.memoryPeakMB}MB`);
    console.log(`  • Leak rate: ${result.metrics.leakRateMBPerHour}MB/hour`);
    console.log(`  • Time to identify: ${result.metrics.timeToIdentify}\n`);

    // Display root cause
    console.log('🎯 Root Cause Identified:');
    console.log(`  ${result.rootCause.description}\n`);

    console.log('📋 Evidence:');
    result.rootCause.evidence.forEach(item => {
      console.log(`  • ${item}`);
    });
    console.log();

    console.log('💡 Solution:');
    result.rootCause.solution.forEach(item => {
      console.log(`  • ${item}`);
    });
    console.log();

    console.log('🔧 Recommendations:');
    result.recommendations.slice(0, 5).forEach(rec => {
      console.log(`  • ${rec}`);
    });
    console.log();

    // Code fix example
    console.log('📝 Code Fix Example:');
    console.log('```javascript');
    console.log('// BEFORE (Memory Leak):');
    console.log('async function processRequest(data) {');
    console.log('  const conn = await pool.getConnection();');
    console.log('  const result = await conn.query(data.query);');
    console.log('  if (result.error) {');
    console.log('    throw new Error(result.error); // Connection never released!');
    console.log('  }');
    console.log('  conn.release();');
    console.log('  return result;');
    console.log('}');
    console.log();
    console.log('// AFTER (Fixed):');
    console.log('async function processRequest(data) {');
    console.log('  const conn = await pool.getConnection();');
    console.log('  try {');
    console.log('    const result = await conn.query(data.query);');
    console.log('    if (result.error) {');
    console.log('      throw new Error(result.error);');
    console.log('    }');
    console.log('    return result;');
    console.log('  } finally {');
    console.log('    conn.release(); // Always releases connection');
    console.log('  }');
    console.log('}');
    console.log('```\n');

    console.log('=' .repeat(60));
    console.log('✨ Mission Complete!');
    console.log('The memory leak has been identified and a fix is ready for deployment.');
    console.log('=' .repeat(60));

    return result;
  } catch (error) {
    console.error('❌ Mission failed:', error);
    process.exit(1);
  }
}

// Run the test
if (import.meta.main) {
  runMissionTest().then(() => {
    console.log('\n✅ Mission test completed successfully!');
  }).catch(error => {
    console.error('❌ Mission test failed:', error);
    process.exit(1);
  });
}

export { runMissionTest };