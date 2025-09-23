/**
 * Remote fleet management for Carrier API
 * Handles push, pull, list, and delete operations with remote API
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { join, basename } from 'path';
import { AuthManager } from './auth.js';
import { Fleet, RemoteFleet, FleetListResponse } from './types/index.js';

export class RemoteFleetManager {
  private auth: AuthManager;
  private carrierPath: string;
  private useLocal: boolean = false;

  constructor(carrierPath: string, auth: AuthManager) {
    this.carrierPath = carrierPath;
    this.auth = auth;
  }

  /**
   * Set whether to use local storage (for --testing flag)
   */
  setUseLocal(useLocal: boolean): void {
    this.useLocal = useLocal;
  }

  /**
   * List fleets (remote or local based on flag)
   */
  async list(useRemote: boolean = true): Promise<string[]> {
    if (!useRemote || this.useLocal) {
      // Use local storage (testing mode)
      const testingPath = join(this.carrierPath, 'testing');
      if (!existsSync(testingPath)) {
        return [];
      }
      
      const fleets: string[] = [];
      const entries = readdirSync(testingPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          fleets.push(entry.name.replace('.json', ''));
        }
      }
      
      return fleets;
    }

    // Use remote API
    try {
      const response = await this.auth.apiRequest('/fleets');
      
      if (!response.ok) {
        throw new Error(`Failed to list fleets: ${response.statusText}`);
      }
      
      const data: FleetListResponse = await response.json();
      return data.fleets.map(fleet => fleet.id);
    } catch (error) {
      throw new Error(`Failed to list remote fleets: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Pull fleet from remote or local storage
   */
  async pull(fleetId: string, force: boolean = false): Promise<void> {
    const localFleetDir = join(this.carrierPath, 'fleets', fleetId);
    const localFleetPath = join(localFleetDir, `${fleetId}.json`);
    
    // Check if local fleet exists and force is not set
    if (existsSync(localFleetPath) && !force) {
      throw new Error(`Fleet '${fleetId}' already exists locally. Use --force to overwrite.`);
    }
    
    if (this.useLocal) {
      // Pull from testing folder
      const testingPath = join(this.carrierPath, 'testing', `${fleetId}.json`);
      if (!existsSync(testingPath)) {
        throw new Error(`Fleet '${fleetId}' not found in testing folder`);
      }
      
      const fleetData = JSON.parse(readFileSync(testingPath, 'utf-8'));
      
      // Ensure local directory exists
      if (!existsSync(localFleetDir)) {
        mkdirSync(localFleetDir, { recursive: true });
      }
      
      writeFileSync(localFleetPath, JSON.stringify(fleetData, null, 2));
    } else {
      // Pull from remote API
      try {
        const response = await this.auth.apiRequest(`/fleets/${fleetId}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`Fleet '${fleetId}' not found on remote`);
          }
          throw new Error(`Failed to fetch fleet: ${response.statusText}`);
        }
        
        const remoteFleet: RemoteFleet = await response.json();
        
        if (!remoteFleet.config) {
          throw new Error('Remote fleet has no configuration');
        }
        
        // Ensure local directory exists
        if (!existsSync(localFleetDir)) {
          mkdirSync(localFleetDir, { recursive: true });
        }
        
        writeFileSync(localFleetPath, JSON.stringify(remoteFleet.config, null, 2));
      } catch (error) {
        throw new Error(`Failed to pull fleet: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Push fleet to remote or local storage
   */
  async push(fleetId: string): Promise<void> {
    const localFleetPath = join(this.carrierPath, 'fleets', fleetId, `${fleetId}.json`);
    
    if (!existsSync(localFleetPath)) {
      throw new Error(`Fleet '${fleetId}' not found locally`);
    }
    
    const fleetData: Fleet = JSON.parse(readFileSync(localFleetPath, 'utf-8'));
    
    if (this.useLocal) {
      // Push to testing folder
      const testingDir = join(this.carrierPath, 'testing');
      const testingPath = join(testingDir, `${fleetId}.json`);
      
      if (!existsSync(testingDir)) {
        mkdirSync(testingDir, { recursive: true });
      }
      
      writeFileSync(testingPath, JSON.stringify(fleetData, null, 2));
    } else {
      // Push to remote API
      try {
        const response = await this.auth.apiRequest(`/fleets/${fleetId}`, {
          method: 'PUT',
          body: JSON.stringify(fleetData)
        });
        
        if (!response.ok) {
          throw new Error(`Failed to push fleet: ${response.statusText}`);
        }
      } catch (error) {
        throw new Error(`Failed to push fleet: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Remove fleet from remote or local storage
   */
  async remove(fleetId: string, force: boolean = false): Promise<void> {
    if (this.useLocal) {
      // Remove from testing folder
      const testingPath = join(this.carrierPath, 'testing', `${fleetId}.json`);
      
      if (!existsSync(testingPath)) {
        throw new Error(`Fleet '${fleetId}' not found in testing folder`);
      }
      
      if (!force) {
        console.log(`This will remove fleet '${fleetId}' from testing folder.`);
        console.log('Use --force to skip this confirmation.');
        return;
      }
      
      rmSync(testingPath);
    } else {
      // Remove from remote API
      if (!force) {
        console.log(`This will permanently remove fleet '${fleetId}' from the remote API.`);
        console.log('Use --force to skip this confirmation.');
        return;
      }
      
      try {
        const response = await this.auth.apiRequest(`/fleets/${fleetId}`, {
          method: 'DELETE'
        });
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`Fleet '${fleetId}' not found on remote`);
          }
          throw new Error(`Failed to remove fleet: ${response.statusText}`);
        }
      } catch (error) {
        throw new Error(`Failed to remove fleet: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Get fleet details from remote
   */
  async getFleet(fleetId: string): Promise<RemoteFleet> {
    if (this.useLocal) {
      // Get from testing folder
      const testingPath = join(this.carrierPath, 'testing', `${fleetId}.json`);
      
      if (!existsSync(testingPath)) {
        throw new Error(`Fleet '${fleetId}' not found in testing folder`);
      }
      
      const config: Fleet = JSON.parse(readFileSync(testingPath, 'utf-8'));
      
      return {
        id: fleetId,
        name: config.id || fleetId,
        description: config.description,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        config
      };
    } else {
      // Get from remote API
      try {
        const response = await this.auth.apiRequest(`/fleets/${fleetId}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`Fleet '${fleetId}' not found on remote`);
          }
          throw new Error(`Failed to fetch fleet: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        throw new Error(`Failed to get fleet: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * List all remote fleets with details
   */
  async listDetailed(): Promise<RemoteFleet[]> {
    if (this.useLocal) {
      // List from testing folder
      const testingPath = join(this.carrierPath, 'testing');
      if (!existsSync(testingPath)) {
        return [];
      }
      
      const fleets: RemoteFleet[] = [];
      const entries = readdirSync(testingPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          const fleetId = entry.name.replace('.json', '');
          try {
            const fleet = await this.getFleet(fleetId);
            fleets.push(fleet);
          } catch {
            // Skip fleets that can't be loaded
          }
        }
      }
      
      return fleets;
    } else {
      // List from remote API
      try {
        const response = await this.auth.apiRequest('/fleets');
        
        if (!response.ok) {
          throw new Error(`Failed to list fleets: ${response.statusText}`);
        }
        
        const data: FleetListResponse = await response.json();
        return data.fleets;
      } catch (error) {
        throw new Error(`Failed to list detailed fleets: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}