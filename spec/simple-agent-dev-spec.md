# Simple-Agent Development Specification

## 1. Overview

**simple-agent** is a minimal, user-friendly AI agent framework that enables conversational AI with chat history management, tool execution capabilities, and Model Context Protocol (MCP) integration.

### 1.1 Goals

- **Simplicity**: Easy to configure and use for developers
- **Extensibility**: Support for custom tools and MCP servers
- **Conversation Memory**: Maintain chat history for context-aware interactions
- **Tool Integration**: Execute tools with configurable permissions
- **MCP Support**: Connect to MCP servers for extended capabilities

### 1.2 Non-Goals

- Multi-agent orchestration (single agent focus)
- Complex permission systems (simple allow/deny model)
- Advanced session management (basic chat history only)
- Agent hierarchy (flat structure)

## 2. Architecture

### 2.1 Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                      simple-agent                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  ChatEngine  │  │  ToolManager │  │  MCPManager  │       │
│  │              │  │              │  │              │       │
│  │ - History    │  │ - Registry   │  │ - Servers    │       │
│  │ - Context    │  │ - Executor   │  │ - Client     │       │
│  │ - Messages   │  │ - Permission │  │ - Resources  │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │               │
│         └─────────────────┼─────────────────┘               │
│                           │                                 │
│                    ┌──────▼──────┐                          │
│                    │   LLMCore   │                          │
│                    │             │                          │
│                    │ - Stream     │                          │
│                    │ - Prompt     │                          │
│                    │ - Model      │                          │
│                    └─────────────┘                          │
│                                                           │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
User Message
    │
    ▼
┌─────────────────┐
│  ChatEngine     │
│  - Load History │
│  - Build Prompt │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  LLMCore        │
│  - Call Model   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Tool Call?     │──── No ────▶ Response
│                 │
│      Yes        │
│       │         │
│       ▼         │
│  ToolManager    │
│  - Check Perms  │
│  - Execute Tool │
│  - Return Result│
└────────┬────────┘
         │
         ▼
    LLM Core (with tool result)
         │
         ▼
    Response (streaming)
```

## 3. Configuration

### 3.1 Configuration File

Configuration loaded from `simple-agent.config.{json,yaml,yml,js,ts}`:

```typescript
interface SimpleAgentConfig {
  // LLM Configuration
  model: {
    provider: 'openai' | 'anthropic' | 'ollama' | 'openai-compatible';
    modelId: string;
    apiKey?: string;
    baseUrl?: string; // For openai-compatible providers
    temperature?: number;
    maxTokens?: number;
  };

  // Chat History Configuration
  chat: {
    maxHistory: number;          // Max messages to keep
    maxContextTokens: number;    // Approximate token limit for context
    persist: boolean;             // Persist to disk
    persistPath?: string;         // Path for chat history storage
    summaryThreshold?: number;    // When to trigger history summarization
  };

  // Tool Configuration
  tools: {
    enabled: string[];           // List of enabled tool IDs
    permissions: ToolPermissions;
    customTools?: string[];      // Paths to custom tool modules
  };

  // MCP Configuration
  mcp: {
    servers: MCPServerConfig[];
    autoConnect: boolean;
    timeout: number;             // Request timeout in ms
  };

  // System Prompt
  systemPrompt?: string;
}
```

### 3.2 Tool Permissions Configuration

```typescript
interface ToolPermissions {
  // Format: toolId: permission level
  // levels: 'allow', 'deny', 'ask'
  [toolId: string]: 'allow' | 'deny' | 'ask';
  
  // Wildcard patterns
  patterns?: {
    pattern: string;       // Glob pattern for tool IDs
    permission: 'allow' | 'deny' | 'ask';
  }[];
}
```

**Example:**

```json
{
  "tools": {
    "enabled": ["bash", "read", "write", "webfetch"],
    "permissions": {
      "bash": "ask",
      "write": "ask",
      "read": "allow",
      "webfetch": "allow",
      "grep": "deny"
    },
    "patterns": [
      {
        "pattern": "fs:*",
        "permission": "ask"
      }
    ]
  }
}
```

### 3.3 MCP Server Configuration

```typescript
interface MCPServerConfig {
  id: string;                 // Unique server identifier
  name: string;               // Display name
  transport: {
    type: 'stdio' | 'sse' | 'ws';
    // For stdio
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    // For sse/ws
    url?: string;
    headers?: Record<string, string>;
  };
  // Resources to expose
  resources?: {
    include?: string[];       // Glob patterns of resource URIs
    exclude?: string[];       // Resource URIs to exclude
  };
  // Tools to expose from MCP
  tools?: {
    include?: string[];       // Tool name patterns
    exclude?: string[];       // Tool names to exclude
  };
  // Auto-start on agent init
  autoStart?: boolean;
}
```

**Example Configuration:**

```json
{
  "mcp": {
    "autoConnect": true,
    "timeout": 30000,
    "servers": [
      {
        "id": "filesystem",
        "name": "File System Access",
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["@modelcontextprotocol/server-filesystem", "/home/user/projects"]
        },
        "autoStart": true
      },
      {
        "id": "brave-search",
        "name": "Brave Search",
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-brave-search"]
        },
        "tools": {
          "include": ["brave_web_search"]
        }
      },
      {
        "id": "github",
        "name": "GitHub Integration",
        "transport": {
          "type": "sse",
          "url": "https://api.github.com/mcp",
          "headers": {
            "Authorization": "Bearer ${GITHUB_TOKEN}"
          }
        }
      }
    ]
  }
}
```

### 3.4 Custom Tool Definition

Custom tools are defined as TypeScript/JavaScript modules:

```typescript
// tools/custom-tool.ts
export interface CustomTool {
  id: string;
  name: string;
  description: string;
  
  // Tool input schema (JSON Schema)
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: any[];
      default?: any;
    }>;
    required: string[];
  };
  
  // Execution function
  execute: (
    args: Record<string, any>,
    context: ToolContext
  ) => Promise<ToolResult>;
}

export interface ToolContext {
  sessionId: string;
  userId?: string;
  config: SimpleAgentConfig;
  llm: LLMCore;
  mcp: MCPManager;
}

export interface ToolResult {
  success: boolean;
  output?: any;
  error?: string;
  metadata?: Record<string, any>;
}
```

**Example Custom Tool:**

```typescript
// tools/weather.ts
import { CustomTool, ToolContext } from '../types';

export default {
  id: 'weather',
  name: 'Get Weather',
  description: 'Get current weather information for a location',
  
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name or coordinates (lat,lon)'
      },
      unit: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: 'Temperature unit',
        default: 'celsius'
      }
    },
    required: ['location']
  },
  
  execute: async (args, context) => {
    try {
      const response = await fetch(
        `https://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${args.location}`
      );
      const data = await response.json();
      
      return {
        success: true,
        output: {
          location: data.location.name,
          temperature: data.current.temp_c,
          condition: data.current.condition.text,
          humidity: data.current.humidity
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
} as CustomTool;
```

### 3.5 Full Configuration Example

```yaml
# simple-agent.config.yaml
model:
  provider: anthropic
  modelId: claude-sonnet-4-20250514
  apiKey: ${ANTHROPIC_API_KEY}
  temperature: 0.7
  maxTokens: 4096

chat:
  maxHistory: 100
  maxContextTokens: 100000
  persist: true
  persistPath: ./chat-history
  summaryThreshold: 80

systemPrompt: |
  You are a helpful AI assistant. You have access to various tools to help users.
  Always explain your reasoning before using tools. Be concise but thorough.

tools:
  enabled:
    - bash
    - read
    - write
    - edit
    - grep
    - glob
    - webfetch
  permissions:
    bash: ask
    write: ask
    edit: ask
    read: allow
    grep: allow
    glob: allow
    webfetch: allow
  customTools:
    - ./tools/weather.ts
    - ./tools/calculator.ts

mcp:
  autoConnect: true
  timeout: 30000
  servers:
    - id: filesystem
      name: File System
      transport:
        type: stdio
        command: npx
        args: ['-y', '@modelcontextprotocol/server-filesystem', './workspace']
      autoStart: true
    
    - id: brave-search
      name: Brave Search
      transport:
        type: stdio
        command: npx
        args: ['-y', '@modelcontextprotocol/server-brave-search']
      autoStart: true
```

## 4. APIs

### 4.1 SimpleAgent Class

```typescript
class SimpleAgent {
  constructor(config: SimpleAgentConfig);
  
  // Chat Operations
  async chat(message: string): AsyncIterable<ChatEvent>;
  async chatWithHistory(history: ChatMessage[], message: string): AsyncIterable<ChatEvent>;
  
  // History Management
  async getHistory(sessionId?: string): Promise<ChatMessage[]>;
  async clearHistory(sessionId?: string): Promise<void>;
  async exportHistory(sessionId?: string): Promise<string>;
  
  // Tool Operations
  async listTools(): Promise<ToolInfo[]>;
  async executeTool(toolId: string, args: any): Promise<ToolResult>;
  
  // MCP Operations
  async listMCPServers(): Promise<MCPServerInfo[]>;
  async connectMCP(serverId: string): Promise<void>;
  async disconnectMCP(serverId: string): Promise<void>;
  async listMCPResources(serverId?: string): Promise<MCPResource[]>;
  async listMCPTools(serverId?: string): Promise<MCPTool[]>;
  
  // Lifecycle
  async initialize(): Promise<void>;
  async shutdown(): Promise<void>;
}
```

### 4.2 Chat Events

```typescript
type ChatEvent =
  | { type: 'message_delta'; delta: string }
  | { type: 'tool_call'; toolId: string; args: any }
  | { type: 'tool_result'; toolId: string; result: ToolResult }
  | { type: 'error'; error: string }
  | { type: 'done' };

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  timestamp: number;
}
```

### 4.3 MCP Client API

```typescript
class MCPManager {
  // Server Management
  async connectServer(config: MCPServerConfig): Promise<MCPClient>;
  async disconnectServer(serverId: string): Promise<void>;
  async listServers(): Promise<MCPClient[]>;
  
  // Resource Operations
  async listResources(serverId?: string): Promise<MCPResource[]>;
  async readResource(uri: string): Promise<ResourceContent>;
  async subscribeResource(uri: string): Promise<void>;
  async unsubscribeResource(uri: string): Promise<void>;
  
  // Tool Operations
  async listTools(serverId?: string): Promise<MCPTool[]>;
  async callTool(toolId: string, args: any, serverId?: string): Promise<ToolResult>;
  
  // Prompt Operations
  async listPrompts(serverId?: string): Promise<MCPPrompt[]>;
  async getPrompt(name: string, args?: any, serverId?: string): Promise<PromptMessage[]>;
}
```

## 5. Usage Examples

### 5.1 Basic Usage

```typescript
import { SimpleAgent } from 'simple-agent';

const agent = new SimpleAgent({
  model: {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    apiKey: process.env.ANTHROPIC_API_KEY
  },
  chat: {
    maxHistory: 50,
    persist: true
  },
  tools: {
    enabled: ['read', 'write'],
    permissions: {
      read: 'allow',
      write: 'ask'
    }
  }
});

await agent.initialize();

// Chat with streaming
for await (const event of agent.chat('Hello!')) {
  if (event.type === 'message_delta') {
    process.stdout.write(event.delta);
  }
}
```

### 5.2 Using MCP Tools

```typescript
import { SimpleAgent } from 'simple-agent';

const agent = new SimpleAgent({
  model: {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    apiKey: process.env.ANTHROPIC_API_KEY
  },
  mcp: {
    autoConnect: true,
    servers: [
      {
        id: 'filesystem',
        name: 'File System',
        transport: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', './workspace']
        }
      }
    ]
  }
});

await agent.initialize();

// The agent can now use MCP tools
for await (const event of agent.chat('List all TypeScript files in the workspace')) {
  if (event.type === 'message_delta') {
    process.stdout.write(event.delta);
  }
}
```

### 5.3 Custom Tool Integration

```typescript
import { SimpleAgent } from 'simple-agent';

const agent = new SimpleAgent({
  model: {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-20250514'
  },
  tools: {
    enabled: ['*', 'weather'], // Wildcard enables all built-ins
    permissions: {
      'weather': 'allow'
    },
    customTools: [
      './tools/weather.ts'
    ]
  }
});

await agent.initialize();

for await (const event of agent.chat('What\'s the weather in Tokyo?')) {
  if (event.type === 'message_delta') {
    process.stdout.write(event.delta);
  } else if (event.type === 'tool_call') {
    console.log('\nCalling tool:', event.toolId);
  }
}
```

### 5.4 Tool Permission Management

```typescript
// Dynamic permission changes
await agent.updateToolPermissions({
  bash: 'deny',
  write: 'allow'
});

// Check permission before executing
const canExecute = await agent.checkToolPermission('bash', 'rm -rf /');
// Returns: { allowed: false, action: 'deny' }
```

### 5.5 MCP Resource Management

```typescript
// List available MCP resources
const resources = await agent.listMCPResources();
console.log('Available resources:', resources);

// Read a specific resource
const content = await agent.readMCPResource('file://workspace/src/index.ts');

// Subscribe to resource changes
await agent.subscribeMCPResource('file://workspace/src/index.ts');
```

## 6. Implementation Details

### 6.1 Chat History Management

**Storage Format:**

```typescript
interface ChatHistory {
  sessionId: string;
  messages: ChatMessage[];
  metadata: {
    createdAt: number;
    updatedAt: number;
    messageCount: number;
    tokenEstimate: number;
  };
}
```

**Summarization Strategy:**

When `summaryThreshold` is reached:

1. Keep last N messages (configurable)
2. Summarize older messages using a summary model
3. Replace old messages with a single summary message
4. Store original messages in archive

### 6.2 Tool Execution Flow

```
1. Parse tool call from LLM response
2. Check tool permissions:
   - Is tool enabled?
   - Is tool allowed/ask/deny?
   - For 'ask': prompt user for confirmation
3. Execute tool:
   - Built-in tool: call internal implementation
   - Custom tool: load and execute module
   - MCP tool: forward to MCP client
4. Return result to LLM
5. Continue conversation
```

### 6.3 MCP Integration

**Connection Management:**

```typescript
class MCPConnection {
  private process?: ChildProcess;  // For stdio transport
  private client?: SSEClient;     // For SSE transport
  private ws?: WebSocket;        // For WS transport
  
  async connect(config: MCPServerConfig): Promise<void>;
  async disconnect(): Promise<void>;
  async call(method: string, params: any): Promise<any>;
}
```

**Tool Translation:**

MCP tools are translated to simple-agent tool format:

```typescript
function translateMCPTool(mcpTool: MCPTool): ToolInfo {
  return {
    id: `mcp:${mcpTool.serverId}:${mcpTool.name}`,
    name: mcpTool.name,
    description: `[MCP:${mcpTool.serverId}] ${mcpTool.description}`,
    inputSchema: mcpTool.inputSchema,
    execute: async (args) => {
      return await mcpManager.callTool(mcpTool.name, args, mcpTool.serverId);
    }
  };
}
```

### 6.4 Error Handling

**Tool Execution Errors:**

```typescript
try {
  const result = await tool.execute(args, context);
  if (!result.success) {
    await agent.chat(`Tool ${tool.id} failed: ${result.error}`);
    // Continue conversation with error info
  }
} catch (error) {
  await agent.chat(`Unexpected error executing ${tool.id}: ${error.message}`);
}
```

**MCP Connection Errors:**

```typescript
if (error.code === 'ECONNREFUSED') {
  // Retry with backoff
  await this.connectWithRetry(config, maxRetries = 3);
} else if (error.code === 'TIMEOUT') {
  // Fallback: disable server temporarily
  await this.disableServer(config.id);
}
```

## 7. Tool Registry

### 7.1 Built-in Tools

| Tool ID | Description | Default Permission |
|---------|-------------|-------------------|
| `bash` | Execute shell commands | `ask` |
| `read` | Read file contents | `allow` |
| `write` | Write files | `ask` |
| `edit` | Edit files in-place | `ask` |
| `grep` | Search file contents | `allow` |
| `glob` | Find files by pattern | `allow` |
| `webfetch` | Fetch web content | `allow` |
| `question` | Ask user for input | `allow` |

### 7.2 Custom Tool Loading

```typescript
async function loadCustomTools(paths: string[]): Promise<Tool[]> {
  const tools: Tool[] = [];
  
  for (const path of paths) {
    const module = await import(path);
    const tool = module.default || module;
    
    // Validate tool interface
    if (!isValidTool(tool)) {
      console.warn(`Invalid tool at ${path}`);
      continue;
    }
    
    tools.push(tool);
  }
  
  return tools;
}
```

## 8. Security Considerations

### 8.1 Tool Permission Levels

- **allow**: Tool executes without confirmation
- **deny**: Tool cannot be executed
- **ask**: User must approve each execution

### 8.2 MCP Security

- Validate all MCP server configurations
- Sanitize MCP tool inputs
- Restrict MCP server execution environment
- Implement timeout for all MCP operations

### 8.3 Chat History Protection

- Encrypt persisted chat history at rest
- Support session-based access control
- Provide history deletion APIs

## 9. Extension Points

### 9.1 Custom LLM Providers

```typescript
interface LLMProvider {
  name: string;
  initialize(config: any): Promise<void>;
  chat(messages: ChatMessage[], options: any): AsyncIterable<ChatEvent>;
  shutdown(): Promise<void>;
}

// Register custom provider
SimpleAgent.registerProvider('myprovider', new MyProvider());
```

### 9.2 Custom History Storage

```typescript
interface HistoryStorage {
  save(sessionId: string, history: ChatHistory): Promise<void>;
  load(sessionId: string): Promise<ChatHistory>;
  delete(sessionId: string): Promise<void>;
  list(): Promise<string[]>;
}

SimpleAgent.setHistoryStorage(new MyHistoryStorage());
```

### 9.3 Custom Permission Resolver

```typescript
interface PermissionResolver {
  resolve(toolId: string, args: any): Promise<'allow' | 'deny' | 'ask'>;
}

SimpleAgent.setPermissionResolver(new MyPermissionResolver());
```

## 10. Testing

### 10.1 Unit Tests

```typescript
describe('SimpleAgent', () => {
  it('should initialize with config', async () => {
    const agent = new SimpleAgent(config);
    await agent.initialize();
    expect(agent.isInitialized).toBe(true);
  });
  
  it('should load custom tools', async () => {
    const agent = new SimpleAgent(config);
    await agent.initialize();
    const tools = await agent.listTools();
    expect(tools).toContainEqual(
      expect.objectContaining({ id: 'weather' })
    );
  });
});
```

### 10.2 Integration Tests

```typescript
describe('MCP Integration', () => {
  it('should connect to MCP server', async () => {
    const agent = new SimpleAgent(configWithMCP);
    await agent.initialize();
    
    const servers = await agent.listMCPServers();
    expect(servers.length).toBeGreaterThan(0);
  });
  
  it('should call MCP tool', async () => {
    const response = await agent.chat('List files using filesystem MCP');
    // Verify MCP tool was called
  });
});
```

## 11. Performance Considerations

### 11.1 Token Management

- Estimate tokens for each message
- Implement context window management
- Use summarization to reduce history size

### 11.2 MCP Optimization

- Pool MCP connections
- Cache MCP tool schemas
- Batch MCP resource reads

### 11.3 Tool Execution

- Parallel independent tool calls
- Cache tool results when appropriate
- Implement tool execution timeouts

## 12. CLI Interface

```bash
# Initialize new agent
simple-agent init

# Start interactive chat
simple-agent chat

# Execute single command
simple-agent chat "List all files"

# List available tools
simple-agent tools list

# List MCP servers
simple-agent mcp list

# Connect to MCP server
simple-agent mcp connect <server-id>

# Export chat history
simple-agent history export --session <session-id>
```

## 13. Roadmap

### Phase 1: Core
- [x] Basic chat functionality
- [x] Tool execution
- [ ] Chat history management
- [ ] Configuration system

### Phase 2: Extensions
- [ ] MCP integration
- [ ] Custom tool loading
- [ ] Permission system
- [ ] History persistence

### Phase 3: Polish
- [ ] CLI interface
- [ ] Web UI (optional)
- [ ] Documentation
- [ ] Performance optimization
