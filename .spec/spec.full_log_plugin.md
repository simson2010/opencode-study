# OpenCode LLM Interceptor Plugins - Full Specification

## Overview

This specification documents the design and implementation of two LLM interceptor plugins for OpenCode that capture and log all communications between the OpenCode system and language model providers.

## Architecture

### Plugin System Model

```
┌─────────────────┐
│   OpenCode      │
│   Core System   │
└────────┬────────┘
          │ Plugin API
          │
     ┌────▼─────┐
     │  Plugin  │ (Hook Registration)
     │ Loader   │
     └────┬─────┘
          │
     ┌────▼──────────────────────┐
     │  LLM Interceptor Plugins   │
     ├───────────────────────────┤
     │ simple-llm-interceptor.ts  │  (Terminal Output)
     │ full-llm-interceptor.ts    │  (Session-Based Logging)
     └───────────────────────────┘
          │
          ├───────────────┬─────────────────────┐
          ▼               ▼                     ▼
     ┌─────────┐    ┌─────────────────┐  ┌──────────┐
     │ Console │    │ Session Files   │  │ Session  │
     │ Output  │    │ ./logs/sessions/│  │ Metadata │
     └─────────┘    │ <sessionID>.jsonl│ │  Manager │
                    │ - session-1.jsonl│ └──────────┘
                    │ - session-2.jsonl│
                    │ - session-3.jsonl│
                    └─────────────────┘
```

### Session-Based Data Flow

```
Session A (session-abc-123)
├─ Round 1 (round-1234567890-abc123)
│  ├─ command: "help"
│  ├─ response: "Here's how to use..."
│  ├─ tools: 0
│  └─ tokens: {input: 150, output: 80}
├─ Round 2 (round-1234567900-def456)
│  ├─ command: "write code"
│  ├─ response: "I'll write the code..."
│  ├─ tools: 3
│  └─ tokens: {input: 500, output: 300}
└─ tokens: {input: 650, output: 380}
   ↓
./logs/sessions/session-abc-123.jsonl
├─ {type: "command", roundID: "round-1234567890-abc123", command: "help"}
├─ {type: "response", roundID: "round-1234567890-abc123", text: "Here's how..."}
├─ {type: "event", roundID: "round-1234567890-abc123", tokens: {...}}
├─ {type: "command", roundID: "round-1234567900-def456", command: "write code"}
├─ {type: "tool", roundID: "round-1234567900-def456", tool: "bash"}
├─ {type: "tool", roundID: "round-1234567900-def456", tool: "read"}
├─ {type: "tool", roundID: "round-1234567900-def456", tool: "write"}
├─ {type: "response", roundID: "round-1234567900-def456", text: "I'll write..."}
└─ {type: "event", roundID: "round-1234567900-def456", tokens: {...}}

./logs/sessions/rounds/
├─ round-1234567890-abc123.jsonl
│  ├─ {type: "command", roundID: "round-1234567890-abc123", command: "help"}
│  ├─ {type: "response", roundID: "round-1234567890-abc123", text: "Here's how..."}
│  └─ {type: "event", roundID: "round-1234567890-abc123", tokens: {...}}
└─ round-1234567900-def456.jsonl
   ├─ {type: "command", roundID: "round-1234567900-def456", command: "write code"}
   ├─ {type: "tool", roundID: "round-1234567900-def456", tool: "bash"}
   ├─ {type: "tool", roundID: "round-1234567900-def456", tool: "read"}
   ├─ {type: "tool", roundID: "round-1234567900-def456", tool: "write"}
   ├─ {type: "response", roundID: "round-1234567900-def456", text: "I'll write..."}
   └─ {type: "event", roundID: "round-1234567900-def456", tokens: {...}}
```

### Plugin Interface

```typescript
import { Plugin } from "@opencode-ai/plugin"

export const PluginName: Plugin = async (ctx) => {
  // Initialization logic
  return {
    "hook.name": async (input, output) => {
      // Hook implementation
    }
  }
}
```

## Implemented Plugins

### 1. SimpleLLMInterceptor Plugin

**File:** `simple-llm-interceptor.ts`

**Purpose:** Lightweight interceptor that outputs LLM communications directly to terminal console.

**Design Characteristics:**
- Zero-persistence logging
- Real-time console output
- No external dependencies
- Minimal I/O overhead
- Truncated text display (500 chars) for readability

**Log Location:** `/tmp/opencode-logs/intercepted-prompts.jsonl`

**Functions Implemented:**

#### Hook: `experimental.chat.system.transform`
**Input:** `input: any`, `output: { system: string[] }`
**Output:** Console display
```typescript
console.log("\n=== SYSTEM PROMPT ===")
console.log(output.system.join("\n"))
console.log("===================\n")
```

#### Hook: `experimental.chat.messages.transform`
**Input:** `input: any`, `output: { messages: Message[] }`
**Output:** Console display + JSONL log
**Captures:**
- Message count
- Message roles (user, assistant, system)
- Text content (truncated to 500 chars)
- Tool calls with input arguments
- Tool results with output (truncated to 200 chars)
- Full message structure in log file

**Log Entry Format:**
```json
{
  "timestamp": 1234567890,
  "type": "prompt",
  "messageCount": 5,
  "messages": [
    {
      "role": "user",
      "parts": [
        { "type": "text", "text": "content..." }
      ]
    }
  ]
}
```

#### Hook: `experimental.text.complete`
**Input:** `input: any`, `output: { text: string }`
**Output:** Console display + JSONL log
**Captures:**
- Complete LLM response text
- Response length

**Log Entry Format:**
```json
{
  "timestamp": 1234567890,
  "type": "response",
  "text": "complete response...",
  "length": 1234
}
```

#### Hook: `tool.execute.before`
**Input:** `input: { tool: string, callID: string }`, `output: { args: any }`
**Output:** Console display
**Captures:**
- Tool name
- Tool execution arguments

#### Hook: `tool.execute.after`
**Input:** `input: { tool: string, callID: string }`, `output: { output: string }`
**Output:** Console display
**Captures:**
- Tool name
- Tool result (truncated to 200 chars)

---

### 2. FullLLMInterceptor Plugin

**File:** `full-llm-interceptor.ts`

**Purpose:** Comprehensive interceptor that logs all LLM communications to persistent JSONL files with full data retention, organized by session.

**Design Characteristics:**
- Session-based file organization (one file per session)
- Session tracking via `sessionID`
- Complete data preservation (no truncation)
- In-memory log buffer per session
- Event stream capture
- Structured JSONL format with command/response pairing
- Automatic session directory creation

**Log Location:** 
- Session files: `./logs/sessions/<sessionID>.jsonl`
- Round files: `./logs/sessions/rounds/<roundID>.jsonl`

**Directory Structure:**
```
./logs/
└── sessions/
    ├── session-abc123.jsonl
    ├── session-def456.jsonl
    ├── session-ghi789.jsonl
    └── rounds/
        ├── round-1234567890-abc123.jsonl
        ├── round-1234567900-def456.jsonl
        └── round-1234567910-ghi789.jsonl
```

**Class: LLMInterceptor**

**Properties:**
- `sessions: Map<string, SessionData>` - Map of sessionID to session data
- `baseLogDir: string` - Base directory for session logs
- `fileHandles: Map<string, number>` - Map of file handles (legacy, no longer used)
- `currentRoundID: string | null` - Current round ID for logging
- `roundLogsDir: string` - Directory for round-specific log files

**Methods:**

#### `constructor(baseLogDir?: string)`
**Purpose:** Initialize interceptor with custom base log directory
**Default:** `"./logs/sessions"`
**Operations:**
- Creates base log directory if it doesn't exist
- Creates rounds subdirectory if it doesn't exist
- Initializes empty sessions map
- Initializes currentRoundID to null
- No file loading (sessions created on-demand)

#### `private async ensureSessionDir()`
**Purpose:** Ensure base session directory exists
**Operations:**
- Checks if baseLogDir exists
- Creates directory with `createPath: true` if missing

#### `private async ensureRoundsDir()`
**Purpose:** Ensure rounds directory exists
**Operations:**
- Checks if roundLogsDir exists
- Creates directory with `createPath: true` if missing

#### `private getLogFile(sessionID: string)`
**Purpose:** Get the log file path for a specific session
**Returns:** `<baseLogDir>/<sessionID>.jsonl`

#### `private getRoundLogFile(roundID: string)`
**Purpose:** Get the log file path for a specific round
**Returns:** `<baseLogDir>/rounds/<roundID>.jsonl`

#### `private generateRoundID(): string`
**Purpose:** Generate a unique round identifier
**Returns:** Unique round ID in format `round-<timestamp>-<random>`
**Example:** `round-1234567890-abc123def`

#### `private startNewRound(): string`
**Purpose:** Start a new conversation round
**Returns:** New round ID
**Operations:**
- Generates new round ID
- Sets currentRoundID to new round ID
- Returns the new round ID

#### `private getCurrentRoundID(): string | null`
**Purpose:** Get the current round ID
**Returns:** Current round ID or null if no active round

#### `private endRound()`
**Purpose:** End the current conversation round
**Operations:**
- Sets currentRoundID to null

#### `private async log(type: string, data: any, sessionID: string)`
**Purpose:** Write log entry to session-specific and round-specific files
**Parameters:**
- `type`: Log type ("command", "response", "tool", "event")
- `data`: Arbitrary data payload
- `sessionID`: Session identifier (required)

**Operations:**
- Creates log entry with timestamp
- Appends to session-specific file (JSONL format)
- Appends to round-specific file (JSONL format) if there's an active round
- Updates session metadata in memory
- Console preview (200 chars)
- Handles missing session by creating new session

**Session Log Entry Format:**
```json
{
  "timestamp": 1234567890,
  "type": "command|response|tool|event",
  "data": { /* hook-specific data */ }
}
```

**Session Metadata Format (tracked in memory):**
```typescript
interface SessionData {
  sessionID: string
  startTime: number
  endTime?: number
  command?: string
  response?: string
  tools: number
  tokens?: {
    input: number
    output: number
    total: number
  }
  cost?: number
}

interface RoundData {
  roundID: string
  sessionID: string
  startTime: number
  endTime?: number
  command?: string
  response?: string
  tools: number
  tokens?: {
    input: number
    output: number
    total: number
  }
  cost?: number
}
```

#### `public getSession(sessionID: string)`
**Purpose:** Retrieve session metadata
**Returns:** `SessionData | undefined`

#### `public listSessions()`
**Purpose:** List all tracked sessions
**Returns:** `SessionData[]`

**Implemented Hooks:**

#### Hook: `experimental.chat.system.transform`
**Captures:**
- System prompt array
- Session ID

**Log Data Structure:**
```json
{
  "hook": "experimental.chat.system.transform",
  "system": ["system message 1", "system message 2"]
}
```

**Note:** This hook runs before a new round starts, so `roundID` is not present.

#### Hook: `chat.params`
**Captures:**
- Temperature
- Top P
- Top K
- Options object
- Model ID
- Provider ID

**Log Data Structure:**
```json
{
  "hook": "chat.params",
  "temperature": 0.7,
  "topP": 0.9,
  "topK": 40,
  "options": {},
  "model": "gpt-4",
  "provider": "openai"
}
```

**Note:** This hook runs before a new round starts, so `roundID` is not present.

#### Hook: `experimental.chat.messages.transform`
**Captures:**
- Message count
- Full message array with roles
- Message parts (text, tool-calls, tool-results)
- **User command** (extracted from last user message)
- Timestamps per part

**Log Data Structure:**
```json
{
  "hook": "experimental.chat.messages.transform",
  "type": "command",
  "roundID": "round-1234567890-abc123",
  "messageCount": 10,
  "command": "User's last message or command",
  "messages": [
    {
      "role": "user",
      "parts": [
        {
          "type": "text",
          "text": "full message content...",
          "timestamp": 1234567890
        }
      ]
    }
  ]
}
```

**Session Update:**
- Extracts last user message as session `command`
- Logic: Find last message with `role === "user"` and extract `parts[0].text`
- Initializes session if new (creates `SessionData` with `sessionID`, `startTime`)
- Sets session `command` field
- Resets session `tools` counter to 0

**Round Management:**
- Starts a new conversation round by calling `startNewRound()`
- Generates unique round ID in format `round-<timestamp>-<random>`
- Sets `currentRoundID` to the new round ID
- All subsequent logs in this round will use this round ID
- Round ends when `experimental.text.complete` hook fires

#### Hook: `experimental.text.complete`
**Captures:**
- Complete response text
- Text length
- Session ID

**Log Data Structure:**
```json
{
  "hook": "experimental.text.complete",
  "type": "response",
  "roundID": "round-1234567890-abc123",
  "text": "complete response...",
  "length": 1234
}
```

**Session Update:**
- Stores complete response in session metadata
- Sets session `endTime`

**Round Management:**
- Ends the current conversation round by calling `endRound()`
- Sets `currentRoundID` to null

#### Hook: `tool.execute.before`
**Captures:**
- Tool name
- Call ID
- Tool arguments

**Log Data Structure:**
```json
{
  "hook": "tool.execute.before",
  "tool": "bash",
  "roundID": "round-1234567890-abc123",
  "args": ["command", "arg1"],
  "callID": "call-uuid"
}
```

#### Hook: `tool.execute.after`
**Captures:**
- Tool name
- Call ID
- Result title
- Result output
- Result metadata

**Log Data Structure:**
```json
{
  "hook": "tool.execute.after",
  "tool": "bash",
  "roundID": "round-1234567890-abc123",
  "result": {
    "title": "Command output",
    "output": "result...",
    "metadata": {}
  },
  "callID": "call-uuid"
}
```

#### Hook: `event`
**Purpose:** Capture real-time streaming events
**Event Types Handled:**

**1. text-delta**
- Incremental text chunks
- Message ID
- Part ID
- Round ID

```json
{
  "type": "text-delta",
  "roundID": "round-1234567890-abc123",
  "text": "partial text",
  "messageID": "msg-uuid",
  "partID": "part-uuid"
}
```

**2. tool-call**
- Tool name
- Tool input
- Message ID
- Part ID
- Round ID

```json
{
  "type": "tool-call",
  "roundID": "round-1234567890-abc123",
  "toolName": "bash",
  "input": {"command": "ls"},
  "messageID": "msg-uuid",
  "partID": "part-uuid"
}
```

**3. tool-result**
- Tool output
- Message ID
- Part ID
- Round ID

```json
{
  "type": "tool-result",
  "roundID": "round-1234567890-abc123",
  "output": "result...",
  "messageID": "msg-uuid",
  "partID": "part-uuid"
}
```

**4. step-finish**
- Token usage (input/output/total)
- Cost information
- Finish reason
- Message ID
- Round ID

```json
{
  "type": "step-finish",
  "roundID": "round-1234567890-abc123",
  "tokens": {
    "input": 100,
    "output": 50,
    "total": 150
  },
  "cost": 0.001,
  "finish": "stop",
  "messageID": "msg-uuid"
}
```

## Data Flow

### Request Flow

```
User Input
    ↓
OpenCode Chat API
    ↓
experimental.chat.system.transform (log system prompt to session file)
    ↓
chat.params (log parameters to session file)
    ↓
experimental.chat.messages.transform (log messages to both session and round files)
    ├─ Start new round (generate round ID)
    └─ Write to both files
    ↓
Send to LLM Provider
    ↓
Receive Stream
    ↓
event: text-delta (log incremental text to both session and round files)
event: tool-call (log tool invocation to both session and round files)
event: tool-result (log tool output to both session and round files)
    ↓
experimental.text.complete (log complete response to both session and round files)
    ├─ End round
    └─ Write to both files
    ↓
tool.execute.before (log tool execution start to both session and round files)
    ↓
Execute Tool
    ↓
tool.execute.after (log tool execution result to both session and round files)
event: step-finish (log completion stats to both session and round files)
```

### Log Persistence Flow

```
Hook Trigger (with sessionID)
    ↓
LLMInterceptor.log(type, data, sessionID)
    ↓
Check if session exists in memory
    ├─ If no: Create new SessionData
    │         ├─ sessionID: provided
    │         ├─ startTime: Date.now()
    │         └─ Initialize empty fields
    └─ If yes: Update existing SessionData
          └─ (command, response, tokens, cost, etc.)
    ↓
Create Log Entry
    ├─ timestamp: Date.now()
    ├─ type: command/response/tool/event
    ├─ roundID: getCurrentRoundID() (if active round)
    └─ data: payload
    ↓
Determine Session Log File
    └─ <baseLogDir>/<sessionID>.jsonl
    ↓
Append Entry to Session File (JSONL format)
    └─ Single JSON object per line
    └─ Preserves entire session history
    ↓
Check if Active Round Exists
    └─ If yes: Determine Round Log File
         └─ <baseLogDir>/rounds/<roundID>.jsonl
         ↓
         Append Entry to Round File (JSONL format)
         └─ Single JSON object per line
         └─ Preserves entire round history
    ↓
Update In-Memory Session Metadata
    ↓
Console Preview (200 chars)
```

### Session File Organization

```
./logs/sessions/
│
├── session-abc-123-def.jsonl
│   ├── [timestamp, type: "command", data: { roundID: "round-1234567890-abc123", command: "help" }]
│   ├── [timestamp, type: "response", data: { roundID: "round-1234567890-abc123", text: "..." }]
│   ├── [timestamp, type: "tool", data: { roundID: "round-1234567890-abc123", hook: "tool.execute.before", ... }]
│   ├── [timestamp, type: "event", data: { roundID: "round-1234567890-abc123", type: "step-finish", ... }]
│   ├── [timestamp, type: "command", data: { roundID: "round-1234567900-def456", command: "write code" }]
│   ├── [timestamp, type: "tool", data: { roundID: "round-1234567900-def456", hook: "tool.execute.before", ... }]
│   ├── [timestamp, type: "response", data: { roundID: "round-1234567900-def456", text: "..." }]
│   └── [timestamp, type: "event", data: { roundID: "round-1234567900-def456", type: "step-finish", ... }]
│
└── rounds/
    ├── round-1234567890-abc123.jsonl
    │   ├── [timestamp, type: "command", data: { roundID: "round-1234567890-abc123", command: "help" }]
    │   ├── [timestamp, type: "response", data: { roundID: "round-1234567890-abc123", text: "..." }]
    │   ├── [timestamp, type: "tool", data: { roundID: "round-1234567890-abc123", hook: "tool.execute.before", ... }]
    │   └── [timestamp, type: "event", data: { roundID: "round-1234567890-abc123", type: "step-finish", ... }]
    │
    └── round-1234567900-def456.jsonl
        ├── [timestamp, type: "command", data: { roundID: "round-1234567900-def456", command: "write code" }]
        ├── [timestamp, type: "tool", data: { roundID: "round-1234567900-def456", hook: "tool.execute.before", ... }]
        ├── [timestamp, type: "response", data: { roundID: "round-1234567900-def456", text: "..." }]
        └── [timestamp, type: "event", data: { roundID: "round-1234567900-def456", type: "step-finish", ... }]
```

### Session Lifecycle

```
User sends message
    ↓
experimental.chat.messages.transform (hook)
    ├─ Extract user command
    ├─ Create new session if sessionID not in memory
    ├─ Start new conversation round
    │  ├─ Generate unique round ID
    │  └─ Set currentRoundID
    └─ Log to both session file and round file:
       ├─ Session file: { type: "command", roundID: "...", command: "user input" }
       └─ Round file: { type: "command", roundID: "...", command: "user input" }
    ↓
LLM processes and responds
    ↓
event: text-delta (hook)
    └─ Log to both files: { type: "event", roundID: "...", type: "text-delta", ... }
    ↓
event: tool-call (hook)
    └─ Log to both files: { type: "event", roundID: "...", type: "tool-call", ... }
    ↓
tool.execute.before (hook)
    └─ Log to both files: { type: "tool", roundID: "...", tool: "...", ... }
    ↓
Execute Tool
    ↓
tool.execute.after (hook)
    └─ Log to both files: { type: "tool", roundID: "...", tool: "...", ... }
    ↓
experimental.text.complete (hook)
    ├─ Store complete response
    ├─ End conversation round
    └─ Log to both files:
       ├─ Session file: { type: "response", roundID: "...", text: "..." }
       └─ Round file: { type: "response", roundID: "...", text: "..." }
    ↓
event: step-finish (hook)
    ├─ Update session metadata (tokens, cost)
    └─ Log to both files:
       ├─ Session file: { type: "event", roundID: "...", tokens: {...}, cost: 0.01 }
       └─ Round file: { type: "event", roundID: "...", tokens: {...}, cost: 0.01 }
    ↓
Round complete
    └─ Round file contains complete conversation for this round
User sends another message
    ↓
Start new round with new round ID
    └─ Repeat cycle
    ↓
Session complete
    ├─ Set session.endTime
    ├─ Session file contains full conversation history (multiple rounds)
    └─ Multiple round files exist, one per conversation turn
```

## Plugin Comparison

| Feature | SimpleLLMInterceptor | FullLLMInterceptor |
|---------|---------------------|-------------------|
| **Output** | Console + Truncated File | Console + Full File |
| **Persistence** | JSONL (single file) | JSONL (per session + per round) |
| **Log Location** | `/tmp/opencode-logs/intercepted-prompts.jsonl` | `./logs/sessions/<sessionID>.jsonl` + `./logs/sessions/rounds/<roundID>.jsonl` |
| **File Organization** | Single file | Session-based + Round-based (one file per session, one file per round) |
| **Session Tracking** | ❌ No | ✅ Yes (sessionID + metadata) |
| **Round Tracking** | ❌ No | ✅ Yes (roundID + per-round files) |
| **Command/Response Pairing** | ❌ No | ✅ Yes (extracted and stored) |
| **Event Stream** | ❌ No | ✅ Yes (text-delta, tool-call, etc.) |
| **Chat Params** | ❌ No | ✅ Yes (temperature, model, etc.) |
| **Data Truncation** | ✅ Yes (500/200 chars) | ❌ No (full data) |
| **In-Memory Buffer** | ❌ No | ✅ Yes (per session) |
| **Log Rotation** | ❌ No | ❌ No (manual cleanup) |
| **Async Write** | ✅ Yes | ✅ Yes |
| **I/O Overhead** | Low | Low (append-only per session and round) |
| **Session Query** | ❌ No | ✅ Yes (getSession, listSessions) |
| **Round Isolation** | ❌ No | ✅ Yes (complete turn in single file) |

## Integration

### Installation

**Via Script:**
```bash
bash /path/to/plugins/install.sh /path/to/opencode/project
```

**Manual:**
```bash
mkdir -p /path/to/project/plugins
cp simple-llm-interceptor.ts /path/to/project/plugins/
cp full-llm-interceptor.ts /path/to/project/plugins/
```

### Configuration

**Simple Plugin:**
```json
{
  "plugin": ["./plugins/simple-llm-interceptor.ts"]
}
```

**Full Plugin:**
```json
{
  "plugin": ["./plugins/full-llm-interceptor.ts"]
}
```

### Auto-Loading

Plugins are automatically loaded from:
- `./plugins/*.ts` (project local)
- `~/.opencode/plugins/*.ts` (global)

### Runtime

```bash
bun dev .
```

No compilation required - Bun runtime supports TypeScript directly.

## Visualization Tool

**File:** `log-viewer.html`

**Features:**
- Real-time refresh (5-second interval)
- Type filtering (request, response, tool, event)
- Search functionality
- Expand/collapse entries
- Statistics panel
- Syntax highlighting
- Tailwind CSS styling

**Usage:**
```bash
python -m http.server 8000
# Open http://localhost:8000/log-viewer.html
```

## Interface Definitions

### SessionData
```typescript
interface SessionData {
  sessionID: string
  startTime: number
  endTime?: number
  command?: string
  response?: string
  tools: number
  tokens?: {
    input: number
    output: number
    total: number
  }
  cost?: number
}
```

### RoundData
```typescript
interface RoundData {
  roundID: string
  sessionID: string
  startTime: number
  endTime?: number
  command?: string
  response?: string
  tools: number
  tokens?: {
    input: number
    output: number
    total: number
  }
  cost?: number
}
```

### SessionLogEntry
```typescript
interface SessionLogEntry {
  timestamp: number
  type: "command" | "response" | "tool" | "event"
  data: any
}
```

### Message
```typescript
interface Message {
  info: { role: string }
  parts: MessagePart[]
}

interface MessagePart {
  type: string
  text?: string
  input?: any
  output?: string
  time?: number
}
```

### Event Payloads
```typescript
interface TextDeltaEvent {
  type: "text-delta"
  text: string
  messageID: string
  partID: string
}

interface ToolCallEvent {
  type: "tool-call"
  toolName: string
  input: any
  messageID: string
  partID: string
}

interface ToolResultEvent {
  type: "tool-result"
  output: string
  messageID: string
  partID: string
}

interface StepFinishEvent {
  type: "step-finish"
  tokens: {
    input: number
    output: number
    total: number
  }
  cost: number
  finish: string
  messageID: string
}
```

## Performance Considerations

### SimpleLLMInterceptor
- **I/O:** Minimal (append-only writes to single file)
- **Memory:** Low (no buffering)
- **Latency:** Negligible
- **Use Case:** Development, debugging

### FullLLMInterceptor (Session-Based with Round Support)
- **I/O:** Low (append-only writes to session-specific and round-specific files)
- **Memory:** Low-Medium (session metadata only, not full logs)
- **Latency:** Negligible (no buffer rewriting)
- **Use Case:** Production monitoring, analysis, conversation history, turn-by-turn debugging

**Session-Based Benefits:**
1. **Isolation:** Each conversation is independent file
2. **Query Performance:** Fast lookups by sessionID
3. **Scalability:** Logs don't grow indefinitely per session
4. **Memory Efficiency:** Only metadata in RAM, full logs on disk
5. **Concurrent Access:** Multiple sessions can be logged simultaneously
6. **Easy Cleanup:** Delete or archive individual sessions
7. **Natural Organization:** Files map 1:1 to conversations
8. **Simpler Analysis:** Process individual sessions independently
9. **Better Debugging:** Isolate problematic conversations
10. **Export Ready:** Each session file is self-contained

**Round-Based Benefits:**
11. **Turn Isolation:** Each conversation turn is independent file
12. **Turn-Level Debugging:** Isolate specific rounds for debugging
13. **Simpler Analysis:** Each round is a self-contained unit
14. **Natural Unit:** Rounds map 1:1 to LLM requests/responses
15. **Easy Sharing:** Share specific turns without sharing entire session
16. **Turn Statistics:** Calculate metrics per turn
17. **Granular Querying:** Analyze individual turns independently
18. **Turn Comparison:** Compare different turns easily
19. **Turn Reordering:** Process turns independently
20. **Turn Archive:** Archive important turns separately

**Comparison with Single-File Approach:**

| Aspect | Single-File | Session-Based | Session + Round |
|--------|-------------|---------------|-----------------|
| File Growth | Unbounded (all sessions) | Bounded (one session) | Bounded (one session + one round) |
| Memory Usage | High (all logs in RAM) | Low (metadata only) | Low (metadata only) |
| Query Speed | O(n) scan entire file | O(1) direct file access | O(1) direct file access |
| Cleanup | Complex (filter + rewrite) | Simple (delete file) | Simple (delete session + rounds) |
| Concurrency | Write lock contention | No contention (different files) | No contention (different files) |
| Export | Filter + extract | Direct copy | Direct copy |
| Debugging | Search mixed logs | Inspect isolated session | Inspect isolated round |
| Backup | All-or-nothing | Per-session | Per-session + per-round |
| Turn Isolation | No | No (mixed in session) | Yes (separate file) |

**Optimization Opportunities:**
1. Add log rotation for session files (max size/time)
2. Implement session cleanup (auto-delete old sessions)
3. Add compression for archived sessions
4. Implement session indexing for fast queries
5. Add configurable sampling rate per session
6. Selective hook activation
7. Batch writes within session
8. Add round log rotation (max size/time per round)
9. Implement round cleanup (auto-delete old rounds)
10. Add compression for archived rounds
11. Implement round indexing for fast queries
12. Add round aggregation (summarize rounds in session)

## Dependencies

**Runtime:**
- `bun >= 1.3.0`
- `@opencode-ai/plugin: workspace:*`

**Development:**
- `@types/bun: latest`
- `typescript: ^5.3.3`

## Hook Reference

| Hook Name | Purpose | Simple | Full |
|-----------|---------|--------|------|
| `experimental.chat.system.transform` | System prompt capture | ✅ | ✅ |
| `chat.params` | Chat parameters | ❌ | ✅ |
| `experimental.chat.messages.transform` | Message history + command extraction | ✅ | ✅ |
| `experimental.text.complete` | Response capture + storage | ✅ | ✅ |
| `tool.execute.before` | Tool execution start | ✅ | ✅ |
| `tool.execute.after` | Tool execution result | ✅ | ✅ |
| `event` | Stream events | ❌ | ✅ |

**Session-Specific Behavior:**
- `experimental.chat.messages.transform`: Extracts user command, creates/updates session, starts new conversation round
- `experimental.text.complete`: Stores response, updates session metadata, ends current conversation round
- `event: step-finish`: Updates session tokens and cost
- All hooks write to both session-specific file and round-specific file
- Round IDs are generated on each new user command
- Round files contain complete logs for a single conversation turn
- Session files contain complete logs for all rounds in a session

## Event Types Captured

| Event Type | Description | Captured By |
|------------|-------------|-------------|
| `text-delta` | Incremental text chunks | Full |
| `tool-call` | Tool invocation | Full |
| `tool-result` | Tool output | Full |
| `step-finish` | Completion metadata | Full |

## Round-Based Logging

**Overview:**
Each conversation turn (round) is logged to its own JSONL file in addition to being logged to the session file. This allows for:
- Isolated analysis of individual conversation turns
- Easier debugging of specific rounds
- Per-round statistics and metrics
- More granular file organization

**Round Lifecycle:**
1. Round starts when `experimental.chat.messages.transform` hook fires
2. Unique round ID is generated: `round-<timestamp>-<random>`
3. Current round ID is set in the interceptor
4. All subsequent logs are written to both session file and round file
5. Round ends when `experimental.text.complete` hook fires
6. Current round ID is reset to null
7. Next conversation turn starts a new round with a new ID

**Round File Structure:**
```
./logs/sessions/rounds/
├── round-1234567890-abc123.jsonl
│   ├── {timestamp, type: "command", data: {roundID: "...", command: "..."}}
│   ├── {timestamp, type: "tool", data: {roundID: "...", tool: "...", ...}}
│   ├── {timestamp, type: "response", data: {roundID: "...", text: "..."}}
│   └── {timestamp, type: "event", data: {roundID: "...", tokens: {...}, ...}}
└── round-1234567900-def456.jsonl
    └── (similar structure for next round)
```

**Round File Benefits:**
1. Complete conversation turn in single file
2. Easy to analyze individual LLM requests/responses
3. Independent of session complexity
4. Can be shared or analyzed in isolation
5. Natural unit for conversation analysis
6. Simplifies per-turn statistics

**Round Management Methods:**
- `generateRoundID()`: Generates unique round ID
- `startNewRound()`: Starts a new round and returns round ID
- `getCurrentRoundID()`: Returns current round ID or null
- `endRound()`: Ends current round (sets to null)

## Command/Response Extraction Logic

### User Command Extraction

**Source:** `experimental.chat.messages.transform` hook

**Extraction Algorithm:**
```typescript
function extractUserCommand(messages: Message[]): string {
  // Find last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info.role === "user") {
      // Extract text from first text part
      const textPart = messages[i].parts.find(p => p.type === "text")
      return textPart?.text || ""
    }
  }
  return ""
}
```

**Examples:**
- Input: "help" → Command: "help"
- Input: "Write a function to sort array" → Command: "Write a function to sort array"
- Input: Multi-part message with tool calls → Extracts only text part

### LLM Response Capture

**Source:** `experimental.text.complete` hook

**Capture Logic:**
```typescript
function captureResponse(output: { text: string }): string {
  return output.text // Complete response text
}
```

**Session Update:**
- Stores full response in session `response` field
- Sets session `endTime` timestamp
- Response remains stored in memory (metadata)
- Full response also written to session file

### Session Metadata Aggregation

**Token Usage:**
- Captured from `event: step-finish`
- Aggregated per session
- Structure: `{ input, output, total }`

**Cost Tracking:**
- Captured from `event: step-finish`
- Summed per session
- Format: Number (dollars)

**Tool Count:**
- Incremented on each `tool.execute.before` hook
- Stored in session `tools` field
- Reset on new command

**Session Duration:**
- `startTime`: Set on first command
- `endTime`: Set on response complete
- `duration = endTime - startTime` (milliseconds)

### List All Sessions

```typescript
const sessions = interceptor.listSessions()
sessions.forEach(session => {
  console.log(`Session: ${session.sessionID}`)
  console.log(`  Command: ${session.command}`)
  console.log(`  Tools: ${session.tools}`)
  console.log(`  Tokens: ${session.tokens?.total}`)
  console.log(`  Cost: $${session.cost?.toFixed(4)}`)
  console.log(`  Duration: ${session.endTime - session.startTime}ms`)
})
```

### Get Specific Session

```typescript
const session = interceptor.getSession("session-abc-123")
if (session) {
  console.log("Full conversation:")
  console.log(`User: ${session.command}`)
  console.log(`Assistant: ${session.response}`)
}
```

### Read Session File

```bash
# View all commands in a session
cat ./logs/sessions/session-abc-123.jsonl | jq 'select(.type == "command")'

# View all responses
cat ./logs/sessions/session-abc-123.jsonl | jq 'select(.type == "response")'

# View full conversation
cat ./logs/sessions/session-abc-123.jsonl | jq

# Count messages per type
cat ./logs/sessions/session-abc-123.jsonl | jq -r '.type' | sort | uniq -c

# List all round files for a session
ls ./logs/sessions/rounds/ | grep $(cat ./logs/sessions/session-abc-123.jsonl | jq -r '.data.roundID' | sort -u | head -1 | cut -d- -f2)

# View a specific round
cat ./logs/sessions/rounds/round-1234567890-abc123.jsonl | jq

# View all rounds for a session
for roundID in $(cat ./logs/sessions/session-abc-123.jsonl | jq -r '.data.roundID' | sort -u); do
  echo "=== Round: $roundID ==="
  cat "./logs/sessions/rounds/${roundID}.jsonl" | jq
done
```

### Session Analysis

```bash
# List all session files
ls -lh ./logs/sessions/

# Find sessions with specific command
grep -l "write code" ./logs/sessions/*.jsonl

# Calculate total tokens across all sessions
cat ./logs/sessions/*.jsonl | jq 'select(.data.tokens) | .data.tokens.total' | awk '{sum+=$1} END {print sum}'

# Find expensive sessions
for file in ./logs/sessions/*.jsonl; do
  cost=$(cat "$file" | jq 'select(.data.cost) | .data.cost' | awk '{sum+=$1} END {print sum}')
  echo "$(basename $file .jsonl): $cost"
done

# List all round files
ls -lh ./logs/sessions/rounds/

# Count rounds per session
for session in ./logs/sessions/*.jsonl; do
  if [[ "$session" != */rounds/* ]]; then
    rounds=$(cat "$session" | jq -r '.data.roundID' | sort -u | wc -l)
    echo "$(basename $session .jsonl): $rounds rounds"
  fi
done

# Analyze round statistics
cat ./logs/sessions/rounds/*.jsonl | jq -r '.type' | sort | uniq -c

# Find rounds with tool usage
for round in ./logs/sessions/rounds/*.jsonl; do
  tools=$(cat "$round" | jq 'select(.type == "tool") | .data.tool' | wc -l)
  if [ "$tools" -gt 0 ]; then
    echo "$(basename $round .jsonl): $tools tools"
  fi
done
```

## File Structure

```
plugins/
├── simple-llm-interceptor.ts       # Simple terminal logger
├── full-llm-interceptor.ts         # Full file-based logger (with round support)
├── log-viewer.html                 # Visualization tool
├── install.sh                      # Installation script
├── package.json                    # Dependencies
├── README.md                       # Full documentation
├── QUICKSTART.md                   # Quick start guide
├── HOW_TO_USE.md                   # Usage guide
└── opencode.json.example           # Configuration example

logs/sessions/                       # Session and round log files
├── session-abc123.jsonl            # Full session logs (all rounds)
├── session-def456.jsonl            # Full session logs (all rounds)
└── rounds/                         # Per-round log files
    ├── round-1234567890-abc123.jsonl
    ├── round-1234567900-def456.jsonl
    └── ...
```

## Version History

**v2.1.0** (Current - Round-Based Logging)
**New Features:**
- ✅ Round-based file organization (one file per conversation turn)
- ✅ Automatic round ID generation on each user command
- ✅ Dual logging: both session file and round file
- ✅ Round lifecycle management (start/end)
- ✅ Round-specific analysis and debugging
- ✅ Per-round statistics and metrics

**Data Changes:**
- Added `roundID` field to all log entries
- New directory structure: `./logs/sessions/rounds/`
- Round files contain complete conversation turn data
- Session files contain all rounds with roundID references

**API Changes:**
- New methods: `generateRoundID()`, `startNewRound()`, `getCurrentRoundID()`, `endRound()`
- Updated `log()` method to write to both session and round files
- New properties: `currentRoundID`, `roundLogsDir`

**Benefits:**
- Complete conversation turn isolation in single file
- Easier debugging of specific rounds
- Independent analysis per conversation turn
- Natural unit for conversation analysis

**v2.0.0** (Session-Based Architecture)
**Breaking Changes:**
- Log file structure changed from single file to per-session files
- `InterceptionLog` interface simplified (sessionID moved to filename)
- New `SessionData` interface for session metadata
- Log entry type changed: "request/response" → "command/response"

**New Features:**
- ✅ Session-based file organization (one file per sessionID)
- ✅ Command/response pairing and extraction
- ✅ Session metadata tracking (tokens, cost, duration)
- ✅ Session query API (getSession, listSessions)
- ✅ Append-only logging (no buffer rewrite)
- ✅ Reduced memory footprint (metadata only in RAM)
- ✅ Isolated conversation logs per session
- ✅ Improved scalability and concurrent access

**Performance Improvements:**
- I/O overhead reduced from O(n) to O(1) per write
- Memory usage reduced by ~90% (metadata only)
- Concurrent session support with no locks
- Faster query performance (direct file access)

**v1.0.0** (Previous)
- Initial release
- Single file logging (all sessions mixed)
- In-memory buffer with full log rewrite on each entry
- Two plugin variants
- Event stream support
- Visualization tool
- Installation automation

## License

MIT License - Same as OpenCode project
