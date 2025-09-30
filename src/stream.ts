/**
 * Stream Manager - Real-time activity streaming for fleet execution
 * Provides live updates of agent actions, tool usage, and progress
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { createReadStream, createWriteStream, WriteStream } from 'fs';
import * as readline from 'readline';
import { APIReporter } from './api-reporter.js';

export interface StreamEvent {
  timestamp: string;
  type: 'agent_activity' | 'tool_use' | 'thinking' | 'output' | 'error' | 'status' | 'progress';
  deployedId: string;
  taskId: string;
  content: any;
  metadata?: Record<string, any>;
}

export interface StreamOptions {
  follow?: boolean;
  tail?: number;
  filter?: string;
  format?: 'json' | 'pretty' | 'raw';
}

export class StreamManager extends EventEmitter {
  private activeStreams: Map<string, WriteStream> = new Map();
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private carrierPath: string;
  private apiReporter: APIReporter | null = null;
  private eventBuffer: Map<string, StreamEvent[]> = new Map(); // Buffer events per task
  private batchInterval: NodeJS.Timeout | null = null;

  constructor(carrierPath: string = '.carrier') {
    super();
    this.carrierPath = carrierPath;
    this.initializeAPIReporter();
  }

  /**
   * Initialize API reporter from config
   */
  private initializeAPIReporter(): void {
    const apiUrl = process.env.CARRIER_API_URL;
    const apiKey = process.env.CARRIER_API_KEY;
    const enabled = process.env.CARRIER_API_REPORTING === 'true' && !!apiUrl;

    if (enabled && apiUrl) {
      this.apiReporter = new APIReporter({
        apiUrl,
        apiKey,
        enabled: true
      });

      // Start batch reporting every 2 seconds
      this.batchInterval = setInterval(() => {
        this.flushEventBuffers();
      }, 2000);

      console.log('📡 API reporting enabled:', apiUrl);
    }
  }

  /**
   * Set deployment ID for API reporting
   */
  setDeploymentId(deploymentId: string): void {
    if (this.apiReporter) {
      this.apiReporter.setDeploymentId(deploymentId);
    }
  }

  /**
   * Flush all buffered events to API
   */
  private async flushEventBuffers(): Promise<void> {
    if (!this.apiReporter) return;

    for (const [taskKey, events] of this.eventBuffer.entries()) {
      if (events.length === 0) continue;

      const [deployedId, taskId] = taskKey.split(':');
      await this.apiReporter.batchReportLogs(deployedId, taskId, events);

      // Clear buffer after sending
      this.eventBuffer.set(taskKey, []);
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
    // Flush any remaining events
    this.flushEventBuffers();
  }

  /**
   * Start streaming for a deployment
   */
  startStream(deployedId: string, taskId: string): WriteStream {
    const streamKey = `${deployedId}:${taskId}`;

    // Close existing stream if any
    if (this.activeStreams.has(streamKey)) {
      this.activeStreams.get(streamKey)!.end();
    }

    // Create stream directory
    const streamDir = path.join(this.carrierPath, 'deployed', deployedId, 'streams');
    if (!fs.existsSync(streamDir)) {
      fs.mkdirSync(streamDir, { recursive: true });
    }

    // Create stream file
    const streamPath = path.join(streamDir, `${taskId}.stream`);
    const stream = createWriteStream(streamPath, { flags: 'a' });

    this.activeStreams.set(streamKey, stream);

    // Emit start event
    this.writeEvent(deployedId, taskId, {
      type: 'status',
      content: { status: 'started', message: 'Task execution started' }
    });

    return stream;
  }

  /**
   * Write an event to the stream
   */
  writeEvent(deployedId: string, taskId: string, event: Partial<StreamEvent>): void {
    const streamKey = `${deployedId}:${taskId}`;
    const stream = this.activeStreams.get(streamKey);

    if (!stream) {
      // Create stream if it doesn't exist
      this.startStream(deployedId, taskId);
    }

    const fullEvent: StreamEvent = {
      timestamp: new Date().toISOString(),
      deployedId,
      taskId,
      type: event.type || 'agent_activity',
      content: event.content,
      metadata: event.metadata
    };

    // Write to stream file
    const streamData = JSON.stringify(fullEvent) + '\n';
    const activeStream = this.activeStreams.get(streamKey);
    if (activeStream) {
      activeStream.write(streamData);
    }

    // Emit to listeners
    this.emit('event', fullEvent);

    // Buffer event for API reporting
    if (this.apiReporter) {
      if (!this.eventBuffer.has(streamKey)) {
        this.eventBuffer.set(streamKey, []);
      }
      this.eventBuffer.get(streamKey)!.push(fullEvent);
    }
  }

  /**
   * Report task start to API
   */
  async reportTaskStart(deployedId: string, taskId: string, agentName: string): Promise<void> {
    if (this.apiReporter) {
      await this.apiReporter.reportTaskStart(deployedId, taskId, agentName);
    }
  }

  /**
   * Report task completion to API
   */
  async reportTaskComplete(
    deployedId: string,
    taskId: string,
    output: string,
    status: 'completed' | 'failed',
    error?: string
  ): Promise<void> {
    // Flush any remaining buffered events for this task
    const streamKey = `${deployedId}:${taskId}`;
    if (this.apiReporter && this.eventBuffer.has(streamKey)) {
      const events = this.eventBuffer.get(streamKey)!;
      if (events.length > 0) {
        await this.apiReporter.batchReportLogs(deployedId, taskId, events);
        this.eventBuffer.set(streamKey, []);
      }
    }

    if (this.apiReporter) {
      await this.apiReporter.reportTaskComplete(deployedId, taskId, output, status, error);
    }
  }

  /**
   * Watch a deployment stream in real-time
   */
  async watchStream(deployedId: string, options: StreamOptions = {}): Promise<void> {
    const streamDir = path.join(this.carrierPath, 'deployed', deployedId, 'streams');

    // Get all stream files in the directory
    const streamFiles = fs.existsSync(streamDir)
      ? fs.readdirSync(streamDir).filter(f => f.endsWith('.stream'))
      : [];

    if (streamFiles.length === 0) {
      console.log('No active streams found for this deployment');
      return;
    }

    // Watch all stream files
    for (const file of streamFiles) {
      const streamPath = path.join(streamDir, file);
      const taskId = path.basename(file, '.stream');

      // Show existing content first
      if (options.tail) {
        await this.tailStream(streamPath, options.tail, options);
      }

      if (options.follow) {
        // Watch for new content
        this.watchFile(streamPath, deployedId, taskId, options);
      }
    }

    // Also watch for new stream files
    if (options.follow) {
      const watcher = fs.watch(streamDir, (eventType, filename) => {
        if (filename && filename.endsWith('.stream') && eventType === 'rename') {
          const streamPath = path.join(streamDir, filename);
          const taskId = path.basename(filename, '.stream');

          // Start watching the new file
          if (fs.existsSync(streamPath)) {
            this.watchFile(streamPath, deployedId, taskId, options);
          }
        }
      });

      this.watchers.set(`${deployedId}:dir`, watcher);
    }
  }

  /**
   * Watch a specific file for changes
   */
  private watchFile(streamPath: string, deployedId: string, taskId: string, options: StreamOptions): void {
    const watchKey = `${deployedId}:${taskId}`;

    // Close existing watcher if any
    if (this.watchers.has(watchKey)) {
      this.watchers.get(watchKey)!.close();
    }

    // Create readline interface for the file
    let lastPosition = fs.statSync(streamPath).size;

    const watcher = fs.watch(streamPath, (eventType) => {
      if (eventType === 'change') {
        // Read new content from last position
        const stream = fs.createReadStream(streamPath, {
          start: lastPosition,
          encoding: 'utf-8'
        });

        const rl = readline.createInterface({
          input: stream,
          crlfDelay: Infinity
        });

        rl.on('line', (line) => {
          try {
            const event = JSON.parse(line) as StreamEvent;
            this.displayEvent(event, options);
          } catch (error) {
            // Ignore parse errors for partial lines
          }
        });

        rl.on('close', () => {
          lastPosition = fs.statSync(streamPath).size;
        });
      }
    });

    this.watchers.set(watchKey, watcher);
  }

  /**
   * Display an event based on format options
   */
  private displayEvent(event: StreamEvent, options: StreamOptions): void {
    // Apply filter if specified
    if (options.filter) {
      const filterRegex = new RegExp(options.filter, 'i');
      const eventStr = JSON.stringify(event);
      if (!filterRegex.test(eventStr)) {
        return;
      }
    }

    // Format based on options
    switch (options.format) {
      case 'json':
        console.log(JSON.stringify(event));
        break;

      case 'raw':
        console.log(event.content);
        break;

      case 'pretty':
      default:
        this.prettyPrintEvent(event);
        break;
    }
  }

  /**
   * Pretty print an event
   */
  private prettyPrintEvent(event: StreamEvent): void {
    const time = new Date(event.timestamp).toLocaleTimeString();
    const taskPrefix = `[${event.taskId}]`;

    switch (event.type) {
      case 'agent_activity':
        console.log(`${time} ${taskPrefix} 🤖 ${event.content.activity || event.content}`);
        break;

      case 'tool_use':
        const tool = event.content;
        if (tool.name) {
          const params = this.formatToolParams(tool);
          console.log(`${time} ${taskPrefix} 🔧 ${tool.name}${params ? `: ${params}` : ''}`);
        }
        break;

      case 'thinking':
        const thought = event.content;
        if (typeof thought === 'string') {
          const preview = thought.substring(0, 100);
          console.log(`${time} ${taskPrefix} 💭 ${preview}${thought.length > 100 ? '...' : ''}`);
        }
        break;

      case 'output':
        console.log(`${time} ${taskPrefix} 📝 ${event.content}`);
        break;

      case 'error':
        console.log(`${time} ${taskPrefix} ❌ ${event.content.message || event.content}`);
        break;

      case 'status':
        console.log(`${time} ${taskPrefix} ℹ️  ${event.content.message || event.content.status}`);
        break;

      case 'progress':
        const progress = event.content;
        if (progress.percentage !== undefined) {
          const bar = this.createProgressBar(progress.percentage);
          console.log(`${time} ${taskPrefix} ${bar} ${progress.message || ''}`);
        } else {
          console.log(`${time} ${taskPrefix} ⏳ ${progress.message || 'Processing...'}`);
        }
        break;
    }
  }

  /**
   * Format tool parameters for display
   */
  private formatToolParams(tool: any): string {
    if (!tool.input) return '';

    // Extract key parameters based on tool name
    switch (tool.name) {
      case 'Read':
      case 'Write':
      case 'Edit':
        return tool.input.file_path || '';

      case 'Bash':
        return tool.input.command ? `"${tool.input.command.substring(0, 50)}..."` : '';

      case 'Search':
      case 'Grep':
        return tool.input.pattern ? `"${tool.input.pattern}"` : '';

      default:
        // Show first parameter value
        const firstKey = Object.keys(tool.input)[0];
        if (firstKey) {
          const value = tool.input[firstKey];
          if (typeof value === 'string') {
            return value.length > 50 ? `${value.substring(0, 50)}...` : value;
          }
        }
        return '';
    }
  }

  /**
   * Create a progress bar
   */
  private createProgressBar(percentage: number): string {
    const width = 20;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'-'.repeat(empty)}] ${percentage}%`;
  }

  /**
   * Tail the last N lines of a stream
   */
  private async tailStream(streamPath: string, lines: number, options: StreamOptions): Promise<void> {
    if (!fs.existsSync(streamPath)) {
      return;
    }

    const fileContent = fs.readFileSync(streamPath, 'utf-8');
    const allLines = fileContent.trim().split('\n');
    const tailLines = allLines.slice(-lines);

    for (const line of tailLines) {
      try {
        const event = JSON.parse(line) as StreamEvent;
        this.displayEvent(event, options);
      } catch (error) {
        // Ignore parse errors
      }
    }
  }

  /**
   * Stop watching a deployment
   */
  stopWatch(deployedId: string): void {
    // Close all watchers for this deployment
    for (const [key, watcher] of this.watchers.entries()) {
      if (key.startsWith(`${deployedId}:`)) {
        watcher.close();
        this.watchers.delete(key);
      }
    }
  }

  /**
   * Stop all streams and watchers
   */
  stopAll(): void {
    // Close all active streams
    for (const stream of this.activeStreams.values()) {
      stream.end();
    }
    this.activeStreams.clear();

    // Close all watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }

  /**
   * Get stream statistics for a deployment
   */
  async getStreamStats(deployedId: string): Promise<any> {
    const streamDir = path.join(this.carrierPath, 'deployed', deployedId, 'streams');

    if (!fs.existsSync(streamDir)) {
      return { streams: 0, events: 0 };
    }

    const stats = {
      streams: 0,
      events: 0,
      byType: {} as Record<string, number>,
      byTask: {} as Record<string, number>
    };

    const streamFiles = fs.readdirSync(streamDir).filter(f => f.endsWith('.stream'));
    stats.streams = streamFiles.length;

    for (const file of streamFiles) {
      const streamPath = path.join(streamDir, file);
      const content = fs.readFileSync(streamPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as StreamEvent;
          stats.events++;
          stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
          stats.byTask[event.taskId] = (stats.byTask[event.taskId] || 0) + 1;
        } catch (error) {
          // Ignore parse errors
        }
      }
    }

    return stats;
  }
}