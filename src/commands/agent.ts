import fs from 'fs';
import path from 'path';
import prompts from 'prompts';
import { CarrierCore } from '../core.js';

interface AgentConfig {
  purpose: string;
  filePatterns: string[];
  canModify: boolean;
  tone: 'concise' | 'detailed' | 'friendly' | 'formal';
  outputFormat: 'markdown' | 'json' | 'plain';
  frameworks?: string;
}

export async function agent(
  carrier: CarrierCore,
  carrierPath: string,
  params: string[]
): Promise<void> {
  const subcommand = params[0];

  if (subcommand === 'create') {
    // Check if interactive mode is requested
    if (params.includes('--interactive')) {
      await createAgentInteractive(carrierPath);
    } else {
      // Try to create agent from CLI flags
      await createAgentFromFlags(carrierPath, params);
    }
  } else if (subcommand === 'list') {
    await listAgents(carrierPath);
  } else {
    console.error('Usage:');
    console.error('  carrier agent create --interactive    Create agent through conversation');
    console.error('  carrier agent create --name <name> --purpose "<purpose>" [options]');
    console.error('  carrier agent list                    List all custom agents');
    console.error('\nOptions for non-interactive mode:');
    console.error('  --name <name>          Agent name (required)');
    console.error('  --purpose "<purpose>"  What the agent should do (required)');
    console.error('  --files <patterns>     File patterns to focus on (default: "*.ts,*.js")');
    console.error('  --read-only           Make agent read-only (no modifications)');
    console.error('  --tone <style>        Communication style: concise|detailed|friendly|formal (default: concise)');
    console.error('  --format <format>     Output format: markdown|json|plain (default: markdown)');
    console.error('  --frameworks "<list>" Frameworks or standards to check (optional)');
    console.error('\nExamples:');
    console.error('  carrier agent create --interactive');
    console.error('  carrier agent create --name security-reviewer --purpose "Review TS for security issues" --files "*.ts,*.tsx" --read-only');
    console.error('  carrier agent create --name formatter --purpose "Format code with prettier" --tone concise --format plain');
    console.error('  carrier agent list');
  }
}

async function createAgentFromFlags(carrierPath: string, params: string[]): Promise<void> {
  // Parse flags from params
  const flags: Record<string, string | boolean> = {};
  let i = 1; // Skip 'create' subcommand

  while (i < params.length) {
    const param = params[i];
    if (param.startsWith('--')) {
      const flagName = param.slice(2);

      // Check for boolean flags
      if (flagName === 'read-only') {
        flags[flagName] = true;
        i++;
      } else if (i + 1 < params.length && !params[i + 1].startsWith('--')) {
        // Flag with value
        flags[flagName] = params[i + 1];
        i += 2;
      } else {
        // Flag without value
        flags[flagName] = true;
        i++;
      }
    } else {
      i++;
    }
  }

  // Validate required flags
  if (!flags.name || !flags.purpose) {
    // Fall back to interactive mode if required flags are missing
    console.log('Missing required flags (--name and --purpose). Switching to interactive mode...\n');
    return await createAgentInteractive(carrierPath);
  }

  // Build config from flags
  const config: AgentConfig & { agentName: string } = {
    agentName: flags.name as string,
    purpose: flags.purpose as string,
    filePatterns: flags.files
      ? (flags.files as string).split(',').map(p => p.trim())
      : ['*.ts', '*.js'],
    canModify: !flags['read-only'],
    tone: (flags.tone as 'concise' | 'detailed' | 'friendly' | 'formal') || 'concise',
    outputFormat: (flags.format as 'markdown' | 'json' | 'plain') || 'markdown',
    frameworks: flags.frameworks as string || undefined
  };

  // Validate agent name
  if (!/^[a-z0-9-]+$/.test(config.agentName)) {
    console.error('❌ Error: Agent name must contain only lowercase letters, numbers, and hyphens');
    return;
  }

  // Validate tone
  if (flags.tone && !['concise', 'detailed', 'friendly', 'formal'].includes(flags.tone as string)) {
    console.error('❌ Error: Invalid tone. Must be one of: concise, detailed, friendly, formal');
    return;
  }

  // Validate format
  if (flags.format && !['markdown', 'json', 'plain'].includes(flags.format as string)) {
    console.error('❌ Error: Invalid format. Must be one of: markdown, json, plain');
    return;
  }

  // Generate agent markdown
  const agentMarkdown = generateAgentMarkdown(config);

  // Save to .carrier/agents/
  const agentsDir = path.join(carrierPath, 'agents');
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  const agentPath = path.join(agentsDir, `${config.agentName}.md`);

  // Check if agent already exists
  if (fs.existsSync(agentPath)) {
    console.error(`❌ Error: Agent '${config.agentName}' already exists at ${agentPath}`);
    return;
  }

  fs.writeFileSync(agentPath, agentMarkdown, 'utf-8');

  console.log('✅ Agent created successfully!');
  console.log(`📁 Saved to: ${agentPath}`);
  console.log('\n💡 Usage:');
  console.log(`   Add to a fleet's task with: "agent": "${config.agentName}.md"`);
  console.log(`   Or create a new fleet with this agent`);
}

async function createAgentInteractive(carrierPath: string): Promise<void> {
  console.log('🎨 Interactive Agent Builder\n');
  console.log('Answer a few questions to create your custom AI agent...\n');

  try {
    const response = await prompts([
      {
        type: 'text',
        name: 'purpose',
        message: 'What should this agent do?',
        validate: (value: string) => value.length > 0 ? true : 'Purpose is required'
      },
      {
        type: 'text',
        name: 'filePatterns',
        message: 'What files should it focus on? (comma-separated patterns)',
        initial: '*.ts, *.js',
        format: (value: string) => value.split(',').map(p => p.trim())
      },
      {
        type: 'select',
        name: 'canModify',
        message: 'Should it make changes or just report?',
        choices: [
          { title: 'Report only (safer)', value: false },
          { title: 'Make changes', value: true }
        ]
      },
      {
        type: 'text',
        name: 'frameworks',
        message: 'Any specific frameworks or standards to check? (optional)',
        initial: ''
      },
      {
        type: 'select',
        name: 'tone',
        message: 'Communication style?',
        choices: [
          { title: 'Concise (brief and to the point)', value: 'concise' },
          { title: 'Detailed (thorough explanations)', value: 'detailed' },
          { title: 'Friendly (casual and approachable)', value: 'friendly' },
          { title: 'Formal (professional and structured)', value: 'formal' }
        ],
        initial: 0
      },
      {
        type: 'select',
        name: 'outputFormat',
        message: 'Output format?',
        choices: [
          { title: 'Markdown (formatted reports)', value: 'markdown' },
          { title: 'JSON (structured data)', value: 'json' },
          { title: 'Plain text (simple output)', value: 'plain' }
        ],
        initial: 0
      },
      {
        type: 'text',
        name: 'agentName',
        message: 'Agent name (will be saved as <name>.md)?',
        validate: (value: string) => {
          if (value.length === 0) return 'Name is required';
          if (!/^[a-z0-9-]+$/.test(value)) return 'Use lowercase letters, numbers, and hyphens only';
          return true;
        }
      }
    ]);

    if (!response.purpose || !response.agentName) {
      console.log('\n❌ Agent creation cancelled');
      return;
    }

    // Generate agent markdown
    const agentMarkdown = generateAgentMarkdown(response);

    // Save to .carrier/agents/
    const agentsDir = path.join(carrierPath, 'agents');
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }

    const agentPath = path.join(agentsDir, `${response.agentName}.md`);
    fs.writeFileSync(agentPath, agentMarkdown, 'utf-8');

    console.log('\n✅ Agent created successfully!');
    console.log(`📁 Saved to: ${agentPath}`);
    console.log('\n💡 Usage:');
    console.log(`   Add to a fleet's task with: "agent": "${response.agentName}.md"`);
    console.log(`   Or create a new fleet with this agent`);

  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      console.error(`\n❌ Error: ${error.message}`);
    } else {
      console.error('\n❌ Agent creation cancelled');
    }
  }
}

function generateAgentMarkdown(config: AgentConfig & { agentName: string }): string {
  const capability = config.canModify ? 'analyze and modify' : 'analyze';
  const toolPermissions = config.canModify
    ? 'You have access to Read, Write, Edit, and Bash tools.'
    : 'You have access to Read and Grep tools only. Do not modify any files.';

  const toneGuidance = {
    concise: 'Be brief and to the point. Use short sentences.',
    detailed: 'Provide thorough explanations and reasoning.',
    friendly: 'Use casual, approachable language.',
    formal: 'Maintain professional, structured communication.'
  };

  const formatGuidance = {
    markdown: 'Format your output in Markdown with headers, lists, and code blocks.',
    json: 'Structure your findings as valid JSON.',
    plain: 'Use simple plain text without special formatting.'
  };

  return `# ${config.agentName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

You are a specialized AI agent designed to ${capability} code based on specific criteria.

## Purpose
${config.purpose}

## Scope
- **File Patterns**: ${config.filePatterns.join(', ')}
${config.frameworks ? `- **Frameworks/Standards**: ${config.frameworks}` : ''}
- **Capability**: ${config.canModify ? 'Can read and modify files' : 'Read-only analysis'}

## Behavior

### Tool Access
${toolPermissions}

### Communication Style
${toneGuidance[config.tone]}

### Output Format
${formatGuidance[config.outputFormat]}

## Workflow

1. **Analyze**: Review files matching patterns: ${config.filePatterns.join(', ')}
${config.frameworks ? `2. **Check Standards**: Verify compliance with ${config.frameworks}` : ''}
${config.canModify ? '3. **Implement**: Make necessary changes with clear commit-worthy descriptions' : '3. **Report**: Provide findings without making changes'}
4. **Summarize**: ${config.outputFormat === 'json' ? 'Return structured JSON' : config.outputFormat === 'markdown' ? 'Create formatted report' : 'Provide plain text summary'}

## Success Criteria
- All relevant files checked
${config.frameworks ? `- ${config.frameworks} standards verified` : ''}
${config.canModify ? '- Changes implemented correctly' : '- Issues clearly identified'}
- Output in ${config.outputFormat} format

---

*Generated with Carrier Interactive Agent Builder*
`;
}

async function listAgents(carrierPath: string): Promise<void> {
  const agentsDir = path.join(carrierPath, 'agents');

  if (!fs.existsSync(agentsDir)) {
    console.log('No custom agents found');
    console.log('\n💡 Create one with: carrier agent create --interactive');
    return;
  }

  const agents = fs.readdirSync(agentsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''));

  if (agents.length === 0) {
    console.log('No custom agents found');
    console.log('\n💡 Create one with: carrier agent create --interactive');
    return;
  }

  console.log(`\n📋 Custom Agents (${agents.length}):\n`);
  agents.forEach(agent => {
    const agentPath = path.join(agentsDir, `${agent}.md`);
    const content = fs.readFileSync(agentPath, 'utf-8');

    // Extract purpose from markdown
    const purposeMatch = content.match(/## Purpose\n(.+)/);
    const purpose = purposeMatch ? purposeMatch[1].trim() : 'No description';

    console.log(`  ${agent}`);
    console.log(`    ${purpose}`);
    console.log('');
  });
}
