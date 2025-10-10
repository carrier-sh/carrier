// Core orchestration logic for Carrier
// MVP implementation - minimal state management

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  Fleet,
  Task,
  DeployedFleet,
  DeployedTask,
  Registry,
  Result,
  FleetStatus,
  TaskStatus
} from './types/index.js';

export class CarrierCore {
  private carrierPath: string;

  constructor(carrierPath: string = '.carrier') {
    this.carrierPath = carrierPath;
  }

  loadFleet(fleetId: string): Fleet {
    // New structure: fleets/<fleet-id>/<fleet-id>.json
    const fleetPath = join(this.carrierPath, 'fleets', fleetId, `${fleetId}.json`);
    if (!existsSync(fleetPath)) {
      // Try old structure for backward compatibility
      const oldPath = join(this.carrierPath, 'fleets', `${fleetId}.json`);
      if (existsSync(oldPath)) {
        return JSON.parse(readFileSync(oldPath, 'utf-8'));
      }
      throw new Error(`Fleet ${fleetId} not found`);
    }
    return JSON.parse(readFileSync(fleetPath, 'utf-8'));
  }

  loadFleetAgents(fleetId: string): string[] {
    // Load agent files from fleets/<fleet-id>/agents/
    const agentsPath = join(this.carrierPath, 'fleets', fleetId, 'agents');
    if (!existsSync(agentsPath)) {
      return [];
    }
    
    const agentFiles: string[] = [];
    const files = readdirSync(agentsPath);
    
    for (const file of files) {
      if (file.endsWith('.md')) {
        const content = readFileSync(join(agentsPath, file), 'utf-8');
        agentFiles.push(content);
      }
    }
    
    return agentFiles;
  }

  listAvailableFleets(): string[] {
    const fleetsPath = join(this.carrierPath, 'fleets');
    if (!existsSync(fleetsPath)) {
      return [];
    }
    
    const fleets: string[] = [];
    const entries = readdirSync(fleetsPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Check if it has a fleet JSON file
        const fleetJsonPath = join(fleetsPath, entry.name, `${entry.name}.json`);
        if (existsSync(fleetJsonPath)) {
          fleets.push(entry.name);
        }
      } else if (entry.name.endsWith('.json')) {
        // Support old structure
        fleets.push(entry.name.replace('.json', ''));
      }
    }
    
    return fleets;
  }

  saveTaskOutput(deployedId: string, taskId: string, content: string): void {
    const outputPath = join(this.carrierPath, 'deployed', deployedId, 'outputs', `${taskId}.md`);
    writeFileSync(outputPath, content);
  }

  loadTaskOutput(deployedId: string, taskId: string): string {
    const outputPath = join(this.carrierPath, 'deployed', deployedId, 'outputs', `${taskId}.md`);
    if (!existsSync(outputPath)) {
      throw new Error(`Task output ${taskId}.md not found for deployment ${deployedId}`);
    }
    return readFileSync(outputPath, 'utf-8');
  }

  loadRegistry(): Registry {
    const registryPath = join(this.carrierPath, 'deployed', 'registry.json');
    if (!existsSync(registryPath)) {
      return { deployedFleets: [] };
    }
    return JSON.parse(readFileSync(registryPath, 'utf-8'));
  }

  saveRegistry(registry: Registry): void {
    const registryPath = join(this.carrierPath, 'deployed', 'registry.json');
    const deployedDir = join(this.carrierPath, 'deployed');
    if (!existsSync(deployedDir)) {
      mkdirSync(deployedDir, { recursive: true });
    }
    writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  }

  generateFleetId(fleetId: string): { id: string; uniqueId: string } {
    const registry = this.loadRegistry();
    const nextId = registry.nextId || 1;
    const count = registry.deployedFleets.filter(f => f.fleetId === fleetId).length + 1;
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const uniqueId = `${fleetId}-${count.toString().padStart(3, '0')}-${date}`;
    return { id: nextId.toString(), uniqueId };
  }

  createDeployedFleet(fleetId: string, request: string): DeployedFleet {
    const fleet = this.loadFleet(fleetId);
    const { id, uniqueId } = this.generateFleetId(fleetId);
    const now = new Date().toISOString();
    
    // Initialize deployed tasks from fleet tasks
    const deployedTasks: DeployedTask[] = fleet.tasks.map((task, index) => ({
      taskId: task.id,
      deployedAt: index === 0 ? now : '',
      completedAt: '',
      status: (index === 0 ? 'active' : 'pending') as TaskStatus
    }));
    
    // Get current agent type from first task
    const currentAgent = fleet.tasks[0]?.agent || '';
    
    const deployed: DeployedFleet = {
      id,
      uniqueId,
      fleetId,
      request,
      status: 'active',
      currentTask: fleet.tasks[0]?.id || '',
      currentAgent,
      deployedAt: now,
      completedAt: '',
      tasks: deployedTasks
    };

    // Create deployed directory using numeric ID for folder
    const deployedPath = join(this.carrierPath, 'deployed', id);
    mkdirSync(deployedPath, { recursive: true });
    mkdirSync(join(deployedPath, 'outputs'), { recursive: true });

    // Save metadata WITHOUT embedded fleet
    writeFileSync(join(deployedPath, 'metadata.json'), JSON.stringify(deployed, null, 2));
    writeFileSync(join(deployedPath, 'request.md'), request);

    // Update registry with incremented nextId
    const registry = this.loadRegistry();
    registry.deployedFleets.push(deployed);
    registry.nextId = (parseInt(id) + 1);
    this.saveRegistry(registry);

    return deployed;
  }

  getDeployedFleet(deployedId: string): DeployedFleet | undefined {
    const registry = this.loadRegistry();
    // Try to find by simple ID first, then by uniqueId for backward compatibility
    return registry.deployedFleets.find(f => f.id === deployedId || f.uniqueId === deployedId);
  }

  updateDeployedStatus(deployedId: string, status: FleetStatus, currentTask?: string, currentAgent?: string): void {
    const registry = this.loadRegistry();
    const deployedIndex = registry.deployedFleets.findIndex(f => f.id === deployedId || f.uniqueId === deployedId);
    if (deployedIndex === -1) {
      throw new Error(`Deployed fleet ${deployedId} not found`);
    }

    const deployed = registry.deployedFleets[deployedIndex];
    deployed.status = status;
    if (currentTask) {
      // When updating to a new current task, mark previous tasks as complete
      const fleet = this.loadFleet(deployed.fleetId);
      const newTaskIndex = fleet.tasks.findIndex(t => t.id === currentTask);
      
      if (newTaskIndex > 0) {
        // Mark all tasks before the new current task as complete
        for (let i = 0; i < newTaskIndex; i++) {
          const taskToComplete = deployed.tasks.find(dt => dt.taskId === fleet.tasks[i].id);
          if (taskToComplete && taskToComplete.status !== 'complete') {
            taskToComplete.status = 'complete';
            if (!taskToComplete.completedAt) {
              taskToComplete.completedAt = new Date().toISOString();
            }
          }
        }
      }
      
      // Mark the new current task as active if it's not already
      const currentDeployedTask = deployed.tasks.find(dt => dt.taskId === currentTask);
      if (currentDeployedTask && currentDeployedTask.status === 'pending') {
        currentDeployedTask.status = status === 'awaiting_approval' ? 'awaiting_approval' : 'active';
        if (!currentDeployedTask.deployedAt) {
          currentDeployedTask.deployedAt = new Date().toISOString();
        }
      }
      
      deployed.currentTask = currentTask;
      if (currentAgent) {
        deployed.currentAgent = currentAgent;
      }
      // Get agent from fleet if not provided
      if (!currentAgent) {
        const fleet = this.loadFleet(deployed.fleetId);
        const task = fleet.tasks.find(t => t.id === currentTask);
        if (task?.agent) {
          deployed.currentAgent = task.agent;
        }
      }
    }
    if (status === 'complete') {
      deployed.completedAt = new Date().toISOString();
      // Mark all tasks as complete
      deployed.tasks.forEach(task => {
        if (task.status !== 'complete') {
          task.status = 'complete';
          if (!task.completedAt) {
            task.completedAt = new Date().toISOString();
          }
        }
      });
    }

    this.saveRegistry(registry);

    // Update metadata (use numeric ID for folder path)
    const folderName = deployedId;
    const metadataPath = join(this.carrierPath, 'deployed', folderName, 'metadata.json');
    if (existsSync(metadataPath)) {
      writeFileSync(metadataPath, JSON.stringify(deployed, null, 2));
    }
  }

  async createDeployed(fleetId: string, request: string): Promise<Result<DeployedFleet>> {
    try {
      const deployed = this.createDeployedFleet(fleetId, request);
      return {
        success: true,
        message: `Created deployed fleet: ${deployed.id}`,
        data: deployed
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async approveTask(deployedId: string): Promise<Result<DeployedFleet>> {
    try {
      const registry = this.loadRegistry();
      const deployed = this.getDeployedFleet(deployedId);
      
      if (!deployed) {
        return {
          success: false,
          error: `Deployed fleet ${deployedId} not found`
        };
      }

      if (deployed.status !== 'awaiting_approval') {
        return {
          success: false,
          error: `Fleet ${deployedId} is not awaiting approval (status: ${deployed.status})`
        };
      }

      // Load fleet from fleets folder using fleetId
      const fleet = this.loadFleet(deployed.fleetId);
      
      // Find current task and get next
      const currentTask = fleet.tasks.find(t => t.id === deployed.currentTask);
      if (!currentTask) {
        return {
          success: false,
          error: `Current task ${deployed.currentTask} not found`
        };
      }
      
      // Mark current task as completed
      const deployedTask = deployed.tasks.find(t => t.taskId === currentTask.id);
      if (deployedTask) {
        deployedTask.status = 'complete';
        deployedTask.completedAt = new Date().toISOString();
      }
      
      // Save the registry with the completed task
      this.saveRegistry(registry);
      
      // Find next task based on approval condition
      const nextTaskRef = currentTask.nextTasks?.find(nt => nt.condition === 'approved' || nt.condition === 'success');
      
      if (!nextTaskRef || nextTaskRef.taskId === 'complete') {
        // All tasks completed
        deployed.status = 'complete';
        deployed.completedAt = new Date().toISOString();
        // Mark all tasks as complete
        deployed.tasks.forEach(task => {
          if (task.status !== 'complete') {
            task.status = 'complete';
            task.completedAt = new Date().toISOString();
          }
        });
        this.saveRegistry(registry);
        this.updateDeployedStatus(deployedId, 'complete');
        return {
          success: true,
          message: `Fleet ${deployedId} completed successfully`,
          data: { ...deployed, status: 'complete', tasks: deployed.tasks }
        };
      }

      const nextTask = fleet.tasks.find(t => t.id === nextTaskRef.taskId);
      if (!nextTask) {
        return {
          success: false,
          error: `Next task ${nextTaskRef.taskId} not found`
        };
      }
      
      // Start next task
      const nextDeployedTask = deployed.tasks.find(t => t.taskId === nextTask.id);
      if (nextDeployedTask) {
        nextDeployedTask.status = 'active';
        nextDeployedTask.deployedAt = new Date().toISOString();
      }

      // Save the registry with updated tasks array
      this.saveRegistry(registry);
      
      // Update status and metadata
      this.updateDeployedStatus(deployedId, 'active', nextTask.id);
      
      return {
        success: true,
        message: `Approved ${currentTask.id}. Starting ${nextTask.id} task.`,
        data: { ...deployed, status: 'active', currentTask: nextTask.id }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getStatus(deployedId?: string): Promise<Result> {
    try {
      const registry = this.loadRegistry();
      
      if (deployedId) {
        const deployed = this.getDeployedFleet(deployedId);
        if (!deployed) {
          return {
            success: false,
            error: `Deployed fleet ${deployedId} not found`
          };
        }

        // Load fleet from fleets folder using fleetId
        const fleet = this.loadFleet(deployed.fleetId);
        
        // Add task status to each task
        const tasks = fleet.tasks.map(task => {
          const deployedTask = deployed.tasks.find(dt => dt.taskId === task.id);
          let status = 'pending';
          
          if (deployedTask && deployedTask.status === 'complete') {
            // Task was explicitly marked as complete
            status = 'completed';
          } else if (task.id === deployed.currentTask) {
            // This is the current task
            status = deployed.status === 'awaiting_approval' ? 'awaiting_approval' : 'active';
          } else {
            // Check if this task comes before the current task (and should be completed)
            const currentTaskIndex = fleet.tasks.findIndex(t => t.id === deployed.currentTask);
            const thisTaskIndex = fleet.tasks.findIndex(t => t.id === task.id);
            if (currentTaskIndex > -1 && thisTaskIndex < currentTaskIndex) {
              status = 'completed';
            } else if (deployedTask && deployedTask.status === 'active') {
              // Task was started but not current (shouldn't happen normally)
              status = 'active';
            }
          }
          
          return {
            id: task.id,
            description: task.description,
            status
          };
        });

        return {
          success: true,
          data: {
            ...deployed,
            tasks
          }
        };
      } else {
        return {
          success: true,
          data: registry.deployedFleets
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getMonitorStatus(deployedId?: string): Promise<Result> {
    try {
      const registry = this.loadRegistry();
      
      if (deployedId) {
        const deployed = this.getDeployedFleet(deployedId);
        if (!deployed) {
          return {
            success: false,
            error: `Deployed fleet ${deployedId} not found`
          };
        }

        // For MVP, return simplified monitor data
        return {
          success: true,
          data: {
            id: deployed.id,
            status: deployed.status,
            fleetId: deployed.fleetId,
            deployedAt: deployed.deployedAt,
            hierarchy: [],
            currentActivity: `Task: ${deployed.currentTask} - Status: ${deployed.status}`
          }
        };
      } else {
        // System-wide monitoring
        const activeFleets = registry.deployedFleets.filter(f => 
          f.status === 'active' || f.status === 'awaiting_approval'
        );

        return {
          success: true,
          data: {
            activeFleets: activeFleets.map(f => ({
              id: f.id,
              status: f.status,
              currentTask: f.currentTask,
              activeAgents: []
            })),
            systemHealth: {
              contextUsage: 15, // Mock value for MVP
              activeAgents: 0,
              totalFleets: registry.deployedFleets.length
            }
          }
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // New state management methods for fleet orchestration
  async updateTaskStatus(deployedId: string, taskId: string, status: TaskStatus): Promise<Result> {
    try {
      const registry = this.loadRegistry();
      const deployedIndex = registry.deployedFleets.findIndex(f => f.id === deployedId || f.uniqueId === deployedId);
      
      if (deployedIndex === -1) {
        return { success: false, error: `Deployment ${deployedId} not found` };
      }

      const deployed = registry.deployedFleets[deployedIndex];
      const task = deployed.tasks.find(t => t.taskId === taskId);
      if (!task) {
        // Add the task if it doesn't exist
        deployed.tasks.push({
          taskId: taskId,
          status: status,
          deployedAt: new Date().toISOString(),
          completedAt: status === 'complete' ? new Date().toISOString() : ''
        });
      } else {
        task.status = status;
        if (status === 'complete' || status === 'failed') {
          task.completedAt = new Date().toISOString();
        }
        if (status === 'active' && !task.deployedAt) {
          task.deployedAt = new Date().toISOString();
        }
      }

      this.saveRegistry(registry);
      
      // Also update the metadata.json file directly (use numeric ID for folder)
      const folderName = deployedId;
      const metadataPath = join(this.carrierPath, 'deployed', folderName, 'metadata.json');
      if (existsSync(metadataPath)) {
        try {
          const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
          const metaTask = metadata.tasks.find((t: any) => t.taskId === taskId);
          if (metaTask) {
            metaTask.status = status;
            if (status === 'complete' || status === 'failed') {
              metaTask.completedAt = new Date().toISOString();
            }
          } else {
            // Add task if not found
            metadata.tasks.push({
              taskId: taskId,
              status: status,
              deployedAt: new Date().toISOString(),
              completedAt: status === 'complete' || status === 'failed' ? new Date().toISOString() : ''
            });
          }
          writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        } catch (error) {
          console.error(`Failed to update metadata file: ${error}`);
        }
      }
      
      return { success: true, message: `Task ${taskId} status updated to ${status}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Update task process information in metadata
  async updateTaskProcessInfo(deployedId: string, taskId: string, pid: number): Promise<Result> {
    try {
      // Use numeric ID for folder name
      const folderName = deployedId;
      const metadataPath = join(this.carrierPath, 'deployed', folderName, 'metadata.json');
      if (!existsSync(metadataPath)) {
        return { success: false, error: `Metadata file not found for deployment ${deployedId}` };
      }

      const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
      let task = metadata.tasks.find((t: any) => t.taskId === taskId);
      
      if (!task) {
        // Add the task if it doesn't exist
        task = {
          taskId: taskId,
          status: 'active',
          deployedAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          pid: pid,
          completedAt: ''
        };
        metadata.tasks.push(task);
      } else {
        // Update existing task
        task.startedAt = new Date().toISOString();
        task.pid = pid;
        task.status = 'active';
      }

      writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      
      // Also update registry
      const registry = this.loadRegistry();
      const deployedIndex = registry.deployedFleets.findIndex(f => f.id === deployedId || f.uniqueId === deployedId);
      if (deployedIndex !== -1) {
        const deployed = registry.deployedFleets[deployedIndex];
        let regTask = deployed.tasks.find(t => t.taskId === taskId);
        if (!regTask) {
          deployed.tasks.push({
            taskId: taskId,
            status: 'active',
            deployedAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            pid: pid,
            completedAt: ''
          });
        } else {
          regTask.status = 'active';
          regTask.startedAt = new Date().toISOString();
          regTask.pid = pid;
        }
        this.saveRegistry(registry);
      }
      
      return { success: true, message: `Process info updated for task ${taskId} (PID: ${pid})` };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update process info: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async updateFleetStatus(deployedId: string, status: FleetStatus, currentTask?: string): Promise<Result> {
    try {
      const registry = this.loadRegistry();
      const deployed = this.getDeployedFleet(deployedId);
      
      if (!deployed) {
        return { success: false, error: `Deployment ${deployedId} not found` };
      }

      deployed.status = status;
      if (currentTask) {
        deployed.currentTask = currentTask;
      }
      if (status === 'complete') {
        deployed.completedAt = new Date().toISOString();
      }

      this.saveRegistry(registry);
      this.updateDeployedStatus(deployedId, status, currentTask);
      
      return { success: true, message: `Fleet ${deployedId} status updated to ${status}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getTaskContext(deployedId: string, taskId: string): Promise<any> {
    const registry = this.loadRegistry();
    const deployed = this.getDeployedFleet(deployedId);
    
    if (!deployed) {
      throw new Error(`Deployment ${deployedId} not found`);
    }

    const fleet = this.loadFleet(deployed.fleetId);
    const task = fleet.tasks.find(t => t.id === taskId);
    
    if (!task) {
      throw new Error(`Task ${taskId} not found in fleet ${deployed.fleetId}`);
    }

    // Gather context based on task inputs
    const context: any = {
      deployedId,
      taskId,
      fleetId: deployed.fleetId,
      userRequest: deployed.request
    };

    // Add previous task outputs if needed
    if (task.inputs) {
      for (const input of task.inputs) {
        if (input.type === 'output' && input.source) {
          try {
            const outputContent = this.loadTaskOutput(deployedId, input.source);
            context[`${input.source}_output`] = outputContent;
          } catch {
            // Output might not exist yet
          }
        }
      }
    }

    return context;
  }

  async generateSummary(deployedId: string): Promise<string> {
    const registry = this.loadRegistry();
    const deployed = this.getDeployedFleet(deployedId);
    
    if (!deployed) {
      throw new Error(`Deployment ${deployedId} not found`);
    }

    const fleet = this.loadFleet(deployed.fleetId);
    
    let summary = `# Fleet Deployment Summary\n\n`;
    summary += `**Deployment ID:** ${deployedId}\n`;
    summary += `**Fleet:** ${deployed.fleetId}\n`;
    summary += `**Status:** ${deployed.status}\n`;
    summary += `**Request:** ${deployed.request}\n`;
    summary += `**Deployed:** ${new Date(deployed.deployedAt).toLocaleString()}\n`;
    
    if (deployed.completedAt) {
      summary += `**Completed:** ${new Date(deployed.completedAt).toLocaleString()}\n`;
    }
    
    summary += `\n## Task Execution\n\n`;
    
    for (const task of fleet.tasks) {
      const deployedTask = deployed.tasks.find(t => t.taskId === task.id);
      const status = deployedTask?.status || 'pending';
      const icon = status === 'complete' ? '✅' : status === 'active' ? '⏳' : status === 'failed' ? '❌' : '⭕';
      
      summary += `${icon} **${task.id}**\n`;
      summary += `   Status: ${status}\n`;
      
      if (deployedTask?.deployedAt) {
        summary += `   Started: ${new Date(deployedTask.deployedAt).toLocaleString()}\n`;
      }
      if (deployedTask?.completedAt) {
        summary += `   Completed: ${new Date(deployedTask.completedAt).toLocaleString()}\n`;
      }
      
      // Try to include output summary if available
      try {
        const outputPath = join(this.carrierPath, 'deployed', deployedId, 'outputs', `${task.id}.md`);
        if (existsSync(outputPath)) {
          const output = readFileSync(outputPath, 'utf-8');
          const firstLine = output.split('\n')[0].substring(0, 100);
          summary += `   Output: ${firstLine}${output.length > 100 ? '...' : ''}\n`;
        }
      } catch {
        // Output might not exist
      }
      
      summary += '\n';
    }
    
    return summary;
  }

  async cleanDeployment(deployedId: string, keepOutputs: boolean = false): Promise<Result> {
    try {
      const deploymentPath = join(this.carrierPath, 'deployed', deployedId);
      
      if (!existsSync(deploymentPath)) {
        return { success: false, error: `Deployment ${deployedId} not found` };
      }

      if (keepOutputs) {
        // Keep outputs directory, remove everything else
        const metadataPath = join(deploymentPath, 'metadata.json');
        const requestPath = join(deploymentPath, 'request.md');
        
        if (existsSync(metadataPath)) {
          writeFileSync(metadataPath, JSON.stringify({ cleaned: true, cleanedAt: new Date().toISOString() }, null, 2));
        }
        if (existsSync(requestPath)) {
          // Keep request for reference
        }
      } else {
        // Remove entire deployment directory
        const fs = await import('fs');
        fs.rmSync(deploymentPath, { recursive: true, force: true });
      }

      // Remove from registry
      const registry = this.loadRegistry();
      const deployedIndex = registry.deployedFleets.findIndex(f => f.id === deployedId || f.uniqueId === deployedId);
      if (deployedIndex !== -1) {
        registry.deployedFleets.splice(deployedIndex, 1);
      }
      this.saveRegistry(registry);

      return { success: true, message: `Deployment ${deployedId} cleaned up` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async cleanAllCompleted(force: boolean = false): Promise<Result<{ removed: number; remaining: number; removedIds: string[] }>> {
    try {
      const registry = this.loadRegistry();
      const deployedPath = join(this.carrierPath, 'deployed');
      
      if (!existsSync(deployedPath)) {
        return {
          success: true,
          message: 'No deployed fleets found',
          data: { removed: 0, remaining: 0, removedIds: [] }
        };
      }

      const removedIds: string[] = [];
      let removedCount = 0;
      let remainingCount = 0;

      // Filter deployments to clean
      const toRemove = registry.deployedFleets.filter(fleet => {
        // By default, only remove completed fleets
        // Keep active, awaiting_approval, pending, cancelled, and failed fleets
        return fleet.status === 'complete';
      });

      const toKeep = registry.deployedFleets.filter(fleet => {
        return fleet.status !== 'complete';
      });

      // If not forced and there are fleets to remove, show confirmation
      if (!force && toRemove.length > 0) {
        console.log(`Found ${toRemove.length} finished deployment(s) to clean:`);
        toRemove.forEach(fleet => {
          console.log(`  - ${fleet.id} (${fleet.status})`);
        });
        console.log('\nUse --force to skip confirmation');
        
        // In non-interactive mode, we'll proceed with cleaning
        // In a real CLI, you might want to prompt for confirmation here
      }

      // Remove deployment directories
      for (const fleet of toRemove) {
        const fleetPath = join(deployedPath, fleet.id);
        if (existsSync(fleetPath)) {
          const fs = await import('fs');
          fs.rmSync(fleetPath, { recursive: true, force: true });
          removedIds.push(fleet.id);
          removedCount++;
        }
      }

      // Update registry with only the kept deployments
      registry.deployedFleets = toKeep;
      remainingCount = toKeep.length;
      
      // Save updated registry
      this.saveRegistry(registry);

      return {
        success: true,
        message: `Cleaned ${removedCount} deployment(s)`,
        data: {
          removed: removedCount,
          remaining: remainingCount,
          removedIds
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}