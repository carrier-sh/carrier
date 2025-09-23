/**
 * Authentication module for Carrier API
 * Handles OAuth 2.0 flow with GitHub and token management
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createServer } from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';
import { AuthConfig, UserProfile } from './types/index.js';

const execAsync = promisify(exec);

export class AuthManager {
  private configPath: string;
  private apiBaseUrl: string;
  private localPort: number;

  constructor(carrierPath: string) {
    this.configPath = join(carrierPath, 'auth.json');
    
    // Use environment variable for API URL, fallback to production
    this.apiBaseUrl = process.env.CARRIER_API_URL || 'https://carrier.sh/api';
    
    // Allow configurable callback port for testing
    this.localPort = process.env.CARRIER_CALLBACK_PORT ? 
      parseInt(process.env.CARRIER_CALLBACK_PORT, 10) : 8123;
    
    // Debug logging if enabled
    if (process.env.CARRIER_DEBUG === 'true') {
      console.log(`[DEBUG] Using API: ${this.apiBaseUrl}`);
      console.log(`[DEBUG] Callback port: ${this.localPort}`);
    }
  }

  /**
   * Get current authentication config
   */
  getConfig(): AuthConfig {
    if (!existsSync(this.configPath)) {
      return {};
    }
    try {
      return JSON.parse(readFileSync(this.configPath, 'utf-8'));
    } catch {
      return {};
    }
  }

  /**
   * Save authentication config
   */
  saveConfig(config: AuthConfig): void {
    const dirPath = join(this.configPath, '..');
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const config = this.getConfig();
    if (!config.accessToken) return false;
    
    // Check if token is expired
    if (config.expiresAt) {
      const expiryDate = new Date(config.expiresAt);
      if (expiryDate <= new Date()) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get authorization headers for API requests
   */
  getAuthHeaders(): Record<string, string> {
    const config = this.getConfig();
    if (!config.accessToken) {
      throw new Error('Not authenticated. Please run "carrier auth" first.');
    }
    return {
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Start OAuth flow with GitHub
   */
  async authenticate(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer(async (req, res) => {
        const url = new URL(req.url || '', `http://localhost:${this.localPort}`);
        
        if (url.pathname === '/callback') {
          const token = url.searchParams.get('token');  // Exchange token from API
          const code = url.searchParams.get('code');    // Legacy support
          const state = url.searchParams.get('state');
          
          if (token) {
            // New flow: Exchange temporary token for actual tokens
            try {
              const exchangeResponse = await fetch(`${this.apiBaseUrl}/auth/exchange`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token })
              });
              
              if (!exchangeResponse.ok) {
                const errorText = await exchangeResponse.text();
                throw new Error(`Failed to exchange token: ${errorText}`);
              }
              
              const tokenData = await exchangeResponse.json();
              
              // Save tokens and user info
              const config: AuthConfig = {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresAt: tokenData.expires_at || 
                  new Date(Date.now() + (tokenData.expires_in || 900) * 1000).toISOString(),
                userId: tokenData.user?.id,
                username: tokenData.user?.username || tokenData.user?.githubUsername,
                email: tokenData.user?.email
              };
              
              this.saveConfig(config);
              
              // Send success response
              const successHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>Authentication Successful</title>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; padding: 40px; text-align: center; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #22c55e;">Authentication Successful!</h1>
  <p style="font-size: 18px;">Logged in as: <strong>${config.username}</strong></p>
  <p style="color: #666;">You can now close this window and return to your terminal.</p>
  <p style="color: #999; font-size: 14px;">This window will close automatically in 3 seconds...</p>
  <script>setTimeout(() => window.close(), 3000);</script>
</body>
</html>`;
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(successHtml);
              
              server.close(() => resolve());
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              const errorHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>Authentication Failed</title>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; padding: 40px; text-align: center; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #ef4444;">Authentication Failed</h1>
  <p style="color: #666;">${errorMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  <p style="color: #999; font-size: 14px;">Please return to your terminal and try again.</p>
</body>
</html>`;
              res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(errorHtml);
              server.close(() => reject(error));
              return;
            }
          } else {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing authorization token or code');
            server.close(() => reject(new Error('Missing authorization token or code')));
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
        }
      });

      server.listen(this.localPort, async () => {
        const authUrl = `${this.apiBaseUrl}/auth/github?redirect_uri=http://localhost:${this.localPort}/callback`;
        
        console.log('Opening browser for GitHub authentication...');
        console.log(`If the browser doesn't open, visit: ${authUrl}`);
        
        // Try to open browser
        const platform = process.platform;
        try {
          if (platform === 'darwin') {
            await execAsync(`open "${authUrl}"`);
          } else if (platform === 'win32') {
            await execAsync(`start "${authUrl}"`);
          } else {
            await execAsync(`xdg-open "${authUrl}"`);
          }
        } catch {
          console.log('Could not open browser automatically.');
          console.log(`Please visit: ${authUrl}`);
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close(() => reject(new Error('Authentication timeout')));
      }, 300000);
    });
  }

  /**
   * Get current user profile
   */
  async whoami(): Promise<UserProfile> {
    const config = this.getConfig();
    
    if (!config.accessToken) {
      throw new Error('Not authenticated. Please run "carrier auth" first.');
    }

    const response = await fetch(`${this.apiBaseUrl}/auth/me`, {
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication expired. Please run "carrier auth" again.');
      }
      throw new Error(`Failed to get user profile: ${response.statusText}`);
    }

    const profile = await response.json();
    
    // Update stored user info
    config.userId = profile.id;
    config.username = profile.username || profile.login;
    config.email = profile.email;
    this.saveConfig(config);

    return profile;
  }

  /**
   * Logout and clear stored credentials
   */
  async logout(): Promise<void> {
    const config = this.getConfig();
    
    if (config.accessToken) {
      try {
        // Notify server about logout
        await fetch(`${this.apiBaseUrl}/auth/logout`, {
          method: 'POST',
          headers: this.getAuthHeaders()
        });
      } catch {
        // Ignore errors during logout
      }
    }

    // Remove local auth config
    if (existsSync(this.configPath)) {
      unlinkSync(this.configPath);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(): Promise<void> {
    const config = this.getConfig();
    
    if (!config.refreshToken) {
      throw new Error('No refresh token available. Please authenticate again.');
    }

    const response = await fetch(`${this.apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refresh_token: config.refreshToken
      })
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token. Please authenticate again.');
    }

    const data = await response.json();
    
    config.accessToken = data.access_token;
    config.expiresAt = data.expires_at || new Date(Date.now() + 3600000).toISOString();
    
    if (data.refresh_token) {
      config.refreshToken = data.refresh_token;
    }

    this.saveConfig(config);
  }

  /**
   * Make an authenticated API request
   */
  async apiRequest(
    path: string, 
    options: RequestInit = {}
  ): Promise<Response> {
    // Check and refresh token if needed
    if (!this.isAuthenticated()) {
      const config = this.getConfig();
      if (config.refreshToken) {
        await this.refreshToken();
      } else {
        throw new Error('Not authenticated. Please run "carrier auth" first.');
      }
    }

    const url = `${this.apiBaseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getAuthHeaders(),
        ...(options.headers || {})
      }
    });

    // Handle token expiration
    if (response.status === 401) {
      const config = this.getConfig();
      if (config.refreshToken) {
        await this.refreshToken();
        // Retry request with new token
        return fetch(url, {
          ...options,
          headers: {
            ...this.getAuthHeaders(),
            ...(options.headers || {})
          }
        });
      }
    }

    return response;
  }
}