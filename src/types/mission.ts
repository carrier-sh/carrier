/**
 * Mission Types
 * Missions are fancy task definitions with objectives and success criteria
 */

// Mission objective that needs to be completed
export interface MissionObjective {
  id: string;
  description: string;
  required: boolean;
  validation?: string; // How to validate: "agent:<file>", "api:<endpoint>", or "user"
}

// Available actions during the mission
export interface MissionAction {
  name: string;
  description: string;
  parameters?: Record<string, any>;
}

// Success criteria for mission completion
export interface MissionSuccessCriteria {
  allObjectivesComplete: boolean;
  requiredActions?: string[];
  validatorAgent?: string; // Optional agent that validates completion
}

// Core mission definition - metadata about what a deployment should accomplish
export interface Mission {
  id: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedDuration: string;

  // Mission configuration
  initialState?: {
    environmentUrl?: string;
    hints: string[];
  };

  objectives: MissionObjective[];
  availableActions: MissionAction[];
  successCriteria: MissionSuccessCriteria;

  // Fleet to use for this mission
  fleetId: string;

  // Metadata
  createdAt?: string;
  updatedAt?: string;
}
