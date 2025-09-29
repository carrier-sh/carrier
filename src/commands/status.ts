/**
 * Enhanced Status command - Quick overview of fleet execution
 * Shows real-time progress and detailed task information
 */

import * as fs from 'fs';
import * as path from 'path';
import { CarrierCore } from '../core.js';
import { StreamManager } from '../stream-manager.js';

export async function status(
  carrier: CarrierCore,
  params: string[]
): Promise<void> {
  const deployedId = params[0];
  const isJsonOutput = params.includes('--json');
  const showStreams = params.includes('--streams');
  const showAll = params.includes('--all') || params.includes('-a');
  
  if (!deployedId) {
    // Show all deployments
    try {
      const registry = carrier.loadRegistry();
      
      if (registry.deployedFleets.length === 0) {
        console.log('No deployments found');
        return;
      }
      
      const activeFleets = registry.deployedFleets.filter((f: any) => f.status !== 'complete' && f.status !== 'failed');
      const completedFleets = registry.deployedFleets.filter((f: any) => f.status === 'complete' || f.status === 'failed');
      
      if (activeFleets.length > 0) {
        console.log('🔄 Active Deployments:\n');
        activeFleets.forEach((fleet: any) => {
          const emoji = fleet.status === 'awaiting_approval' ? '⏸️' : '▶️';
          console.log(`  ${emoji} ${fleet.id} - ${fleet.fleetId}`);
          console.log(`     Status: ${fleet.status}`);
          console.log(`     Current: ${fleet.currentTask}`);
          console.log(`     Request: ${fleet.request.substring(0, 60)}${fleet.request.length > 60 ? '...' : ''}`);
          console.log('');
        });
      }
      
      if (completedFleets.length > 0 && completedFleets.length <= 10) {
        console.log('\n✓ Recent Completed:\n');
        completedFleets.slice(-5).forEach((fleet: any) => {
          const emoji = fleet.status === 'complete' ? '✅' : '❌';
          console.log(`  ${emoji} ${fleet.id} - ${fleet.fleetId} (${fleet.status})`);
        });
      }
      
      if (activeFleets.length === 0 && completedFleets.length === 0) {
        console.log('No deployments found');
      }
    } catch (error) {
      console.error('Error loading deployments:', error instanceof Error ? error.message : 'Unknown error');
    }
  } else {
    // Show specific deployment status
    try {
      const registry = carrier.loadRegistry();
      const deployed = carrier.getDeployedFleet(deployedId);
      
      if (!deployed) {
        console.error(`Deployment ${deployedId} not found`);
        return;
      }
      
      const fleet = carrier.loadFleet(deployed.fleetId);
      
      if (isJsonOutput) {
        console.log(JSON.stringify(deployed, null, 2));
        return;
      }
      
      // Status display with emojis
      const statusEmoji = {
        'pending': '⏳',
        'active': '▶️',
        'awaiting_approval': '⏸️',
        'complete': '✅',
        'failed': '❌',
        'cancelled': '🚫'
      };
      
      console.log(`\n${statusEmoji[deployed.status as keyof typeof statusEmoji]} Deployment: ${deployed.id}`);
      console.log(`  Fleet: ${deployed.fleetId}`);
      console.log(`  Status: ${deployed.status}`);
      console.log(`  Request: ${deployed.request}`);
      console.log(`  Started: ${new Date(deployed.deployedAt).toLocaleString()}`);
      
      if (deployed.completedAt) {
        console.log(`  Completed: ${new Date(deployed.completedAt).toLocaleString()}`);
      }
      
      // Task progress
      console.log(`\n📋 Task Progress:\n`);
      
      fleet.tasks.forEach((task: any, index: number) => {
        const deployedTask = deployed.tasks.find((dt: any) => dt.taskId === task.id);
        const taskStatus = deployedTask?.status || 'pending';
        const taskEmoji = {
          'pending': '⏳',
          'active': '▶️',
          'awaiting_approval': '⏸️',
          'complete': '✅',
          'failed': '❌',
          'cancelled': '🚫'
        };
        
        const isCurrent = deployed.currentTask === task.id;
        const prefix = isCurrent ? '→ ' : '  ';
        
        console.log(`${prefix}${taskEmoji[taskStatus as keyof typeof taskEmoji]} ${task.id}`);
        console.log(`     ${task.description || 'No description'}`);
        
        if (taskStatus === 'awaiting_approval') {
          console.log(`     ⚠️  Awaiting approval - run: carrier approve ${deployed.id}`);
        }
      });
      
      // Show stream statistics if requested
      if (showStreams) {
        const carrierPath = (carrier as any).carrierPath || '.carrier';
        const streamManager = new StreamManager(carrierPath);
        const streamStats = await streamManager.getStreamStats(deployedId);

        console.log(`\n📡 Stream Activity:`);
        console.log(`  • Total events: ${streamStats.events}`);
        if (streamStats.byType && Object.keys(streamStats.byType).length > 0) {
          console.log(`  • By type:`);
          for (const [type, count] of Object.entries(streamStats.byType)) {
            console.log(`    - ${type}: ${count}`);
          }
        }
      }

      // Show next steps
      if (deployed.status === 'awaiting_approval') {
        console.log(`\n⚠️  Action Required: Run 'carrier approve ${deployed.id}' to continue`);
      } else if (deployed.status === 'active') {
        console.log(`\n▶️  Fleet is running.`);
        console.log(`   • Watch live: carrier watch ${deployed.id}`);
        console.log(`   • View logs: carrier logs ${deployed.id}`);
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}