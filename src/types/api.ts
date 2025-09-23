/**
 * API and Network Types
 * Remote fleet management and API communication interfaces
 */

import { Fleet } from './core.js';

// Remote fleet representation
export interface RemoteFleet {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  owner?: string;
  config?: Fleet;
}

// Fleet listing response from API
export interface FleetListResponse {
  fleets: RemoteFleet[];
  total: number;
  page: number;
  limit: number;
}