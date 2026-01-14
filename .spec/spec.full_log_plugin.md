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
├─ command: "help"
├─ response: "Here's how to use..."
├─ tools: 0
└─ tokens: {input: 150, output: 80}
   ↓
./logs/sessions/session-abc-123.jsonl
├─ {type: "command", command: "help"}
├─ {type: "response", text: "Here's how..."}
└─ {type: "event", tokens: {...}}

Session B (session-xyz-789)
├─ command: "write code"
├─ response: "I'll write the code..."
├─ tools: 5
└─ tokens: {input: 500, output: 300}
   ↓
./logs/sessions/session-xyz-789.jsonl
├─ {type: "command", command: "write code"}
├─ {type: "tool", tool: "bash"}
├─ {type: "tool", tool: "read"}
├─ {type: "tool", tool: "write"}
├─ {type: "response", text: "I'll write..."}
└─ {type: "event", tokens: {...}}
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

**Log Location:** `./logs/sessions/<sessionID>.jsonl`

**Directory Structure:**
```
./logs/
└── sessions/
    ├── session-abc123.jsonl
    ├── session-def456.jsonl
    └── session-ghi789.jsonl
```

**Class: LLMInterceptor**

**Properties:**
- `sessions: Map<string, SessionData>` - Map of sessionID to session data
- `baseLogDir: string` - Base directory for session logs

**Methods:**

#### `constructor(baseLogDir?: string)`
**Purpose:** Initialize interceptor with custom base log directory
**Default:** `"./logs/sessions"`
**Operations:**
- Creates base log directory if it doesn't exist
- Initializes empty sessions map
- No file loading (sessions created on-demand)

#### `private async ensureSessionDir()`
**Purpose:** Ensure base session directory exists
**Operations:**
- Checks if baseLogDir exists
- Creates directory with `createPath: true` if missing

#### `private getLogFile(sessionID: string)`
**Purpose:** Get the log file path for a specific session
**Returns:** `<baseLogDir>/<sessionID>.jsonl`

#### `private async log(type: string, data: any, sessionID: string)`
**Purpose:** Write log entry to session-specific file
**Parameters:**
- `type`: Log type ("command", "response", "tool", "event")
- `data`: Arbitrary data payload
- `sessionID`: Session identifier (required)

**Operations:**
- Creates log entry with timestamp
- Appends to session-specific file (JSONL format)
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
  "text": "complete response...",
  "length": 1234
}
```

**Session Update:**
- Stores complete response in session metadata
- Sets session `endTime`

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

```json
{
  "type": "text-delta",
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

```json
{
  "type": "tool-call",
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

```json
{
  "type": "tool-result",
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

```json
{
  "type": "step-finish",
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
experimental.chat.system.transform (log system prompt)
    ↓
chat.params (log parameters)
    ↓
experimental.chat.messages.transform (log messages)
    ↓
Send to LLM Provider
    ↓
Receive Stream
    ↓
event: text-delta (log incremental text)
event: tool-call (log tool invocation)
event: tool-result (log tool output)
    ↓
experimental.text.complete (log complete response)
    ↓
tool.execute.before (log tool execution start)
    ↓
Execute Tool
    ↓
tool.execute.after (log tool execution result)
event: step-finish (log completion stats)
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
    └─ data: payload
    ↓
Determine Session Log File
    └─ <baseLogDir>/<sessionID>.jsonl
    ↓
Append Entry to Session File (JSONL format)
    └─ Single JSON object per line
    └─ Preserves entire session history
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
│   ├── [timestamp, type: "command", data: { command: "help" }]
│   ├── [timestamp, type: "response", data: { text: "..." }]
│   ├── [timestamp, type: "tool", data: { hook: "tool.execute.before", ... }]
│   └── [timestamp, type: "event", data: { type: "step-finish", ... }]
│
├── session-xyz-789-uvw.jsonl
│   ├── [timestamp, type: "command", data: { command: "write code" }]
│   ├── [timestamp, type: "response", data: { text: "..." }]
│   └── [timestamp, type: "event", data: { type: "step-finish", ... }]
│
└── ...
```

### Session Lifecycle

```
User sends message
    ↓
experimental.chat.messages.transform (hook)
    ├─ Extract user command
    ├─ Create new session if sessionID not in memory
    └─ Log: { type: "command", command: "user input" }
    ↓
LLM processes and responds
    ↓
experimental.text.complete (hook)
    ├─ Store complete response
    └─ Log: { type: "response", text: "..." }
    ↓
event: step-finish (hook)
    ├─ Update session metadata (tokens, cost)
    └─ Log: { type: "event", tokens: {...}, cost: 0.01 }
    ↓
Session complete
    ├─ Set session.endTime
    └─ Session file contains full conversation history
```

## Plugin Comparison

| Feature | SimpleLLMInterceptor | FullLLMInterceptor |
|---------|---------------------|-------------------|
| **Output** | Console + Truncated File | Console + Full File |
| **Persistence** | JSONL (single file) | JSONL (per session) |
| **Log Location** | `/tmp/opencode-logs/intercepted-prompts.jsonl` | `./logs/sessions/<sessionID>.jsonl` |
| **File Organization** | Single file | Session-based (one file per session) |
| **Session Tracking** | ❌ No | ✅ Yes (sessionID + metadata) |
| **Command/Response Pairing** | ❌ No | ✅ Yes (extracted and stored) |
| **Event Stream** | ❌ No | ✅ Yes (text-delta, tool-call, etc.) |
| **Chat Params** | ❌ No | ✅ Yes (temperature, model, etc.) |
| **Data Truncation** | ✅ Yes (500/200 chars) | ❌ No (full data) |
| **In-Memory Buffer** | ❌ No | ✅ Yes (per session) |
| **Log Rotation** | ❌ No | ❌ No (manual cleanup) |
| **Async Write** | ✅ Yes | ✅ Yes |
| **I/O Overhead** | Low | Low (append-only per session) |
| **Session Query** | ❌ No | ✅ Yes (getSession, listSessions) |

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

### FullLLMInterceptor (Session-Based)
- **I/O:** Low (append-only writes to session-specific files)
- **Memory:** Low-Medium (session metadata only, not full logs)
- **Latency:** Negligible (no buffer rewriting)
- **Use Case:** Production monitoring, analysis, conversation history

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

**Comparison with Single-File Approach:**

| Aspect | Single-File | Session-Based |
|--------|-------------|---------------|
| File Growth | Unbounded (all sessions) | Bounded (one session) |
| Memory Usage | High (all logs in RAM) | Low (metadata only) |
| Query Speed | O(n) scan entire file | O(1) direct file access |
| Cleanup | Complex (filter + rewrite) | Simple (delete file) |
| Concurrency | Write lock contention | No contention (different files) |
| Export | Filter + extract | Direct copy |
| Debugging | Search mixed logs | Inspect isolated file |
| Backup | All-or-nothing | Per-session |

**Optimization Opportunities:**
1. Add log rotation for session files (max size/time)
2. Implement session cleanup (auto-delete old sessions)
3. Add compression for archived sessions
4. Implement session indexing for fast queries
5. Add configurable sampling rate per session
6. Selective hook activation
7. Batch writes within session

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
- `experimental.chat.messages.transform`: Extracts user command, creates/updates session
- `experimental.text.complete`: Stores response, updates session metadata
- `event: step-finish`: Updates session tokens and cost
- All hooks write to session-specific file based on `sessionID`

## Event Types Captured

| Event Type | Description | Captured By |
|------------|-------------|-------------|
| `text-delta` | Incremental text chunks | Full |
| `tool-call` | Tool invocation | Full |
| `tool-result` | Tool output | Full |
| `step-finish` | Completion metadata | Full |

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
```

## File Structure

```
plugins/
├── simple-llm-interceptor.ts       # Simple terminal logger
├── full-llm-interceptor.ts         # Full file-based logger
├── log-viewer.html                 # Visualization tool
├── install.sh                      # Installation script
├── package.json                    # Dependencies
├── README.md                       # Full documentation
├── QUICKSTART.md                   # Quick start guide
├── HOW_TO_USE.md                   # Usage guide
└── opencode.json.example           # Configuration example
```

## Version History

**v2.0.0** (Current - Session-Based Architecture)
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
- ✅ Reduced memory footprint (metadata-only in RAM)
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
