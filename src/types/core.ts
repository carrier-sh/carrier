/**
 * Core Domain Types
 * Central definitions for fleet orchestration business logic
 */

// Base status types used across the system
export type FleetStatus = 'pending' | 'active' | 'awaiting_approval' | 'complete' | 'failed';
export type TaskStatus = 'pending' | 'active' | 'awaiting_approval' | 'complete' | 'failed';

// Generic result wrapper for operations
export interface Result<T = any> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

// Input/Output definitions for agents
export interface InputDefinition {
  type: string;
  source: string;
}

export interface OutputDefinition {
  type: string;
  path: string;
}

// Base agent interface
export interface Agent {
  id: string;
  description?: string;
  agent: string;
  inputs?: InputDefinition[];
  outputs?: OutputDefinition[];
}

// Task routing and conditions
export interface TaskRoute {
  taskId: string;
  condition: string;
  context?: string;
}

// Fleet task definition
export interface Task extends Agent {
  nextTasks?: TaskRoute[];
  approval_required?: boolean;
}

// Fleet definition (collection of tasks)
export interface Fleet extends Agent {
  tasks: Task[];
}

// Base deployment information
export interface DeploymentInfo {
  deployedAt: string;
  completedAt: string;
  status: FleetStatus;
}

// Deployed task tracking
export interface DeployedTask extends DeploymentInfo {
  taskId: string;
  startedAt?: string;  // When the task process was launched
  pid?: number;        // Process ID for tracking
}

// Deployed fleet tracking
export interface DeployedFleet extends DeploymentInfo {
  id: string;  // Simple incremental ID (1, 2, 3...)
  uniqueId?: string;  // Full unique ID for backward compatibility
  fleetId: string;
  request: string;
  currentTask: string;
  currentAgent?: string;  // Store the agent type for current task
  tasks: DeployedTask[];
}

// Registry for deployed fleets
export interface Registry {
  deployedFleets: DeployedFleet[];
  nextId?: number;  // Track next incremental ID
}