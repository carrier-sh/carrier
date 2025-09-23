/**
 * Configuration Types
 * System configuration and authentication interfaces
 */

import { ProviderConfig } from './providers.js';

// Main Carrier configuration
export interface CarrierConfig {
  version: string;
  initialized: string;
  global?: boolean;
  dev?: boolean;
  packageManager?: string;
  provider: {
    default: string;
    configs: Record<string, ProviderConfig>;
  };
}

// Authentication configuration
export interface AuthConfig {
  accessToken?: string;
  refreshToken?: string;
  userId?: string;
  username?: string;
  email?: string;
  expiresAt?: string;
}

// User profile information
export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  avatarUrl?: string;
}