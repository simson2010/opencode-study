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
Session (sessionID or auto-generated)
├─ system_prompt: ["You are a helpful assistant..."]
├─ user: ["help", "write code"]
├─ assistant: ["Here's how to use...", "I'll write the code..."]
├─ tools: [{type: "before", tool: "bash", args: [...], callID: "..."}, {type: "after", tool: "bash", result: {...}, callID: "..."}]
├─ events: [...]
├─ tokens: {input: 650, output: 380, total: 1030}
├─ cost: 0.0025
├─ startTime: 1234567890
└─ endTime: 1234568000
   ↓
./logs/sessions/<sessionID>.jsonl
   {sessionID: "...", startTime: 1234567890, endTime: 1234568000, data: {system_prompt: [...], user: [...], assistant: [...], tools: [...], events: [...]}, tokens: {...}, cost: ...}
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
- Session-type event capture
- Structured JSONL format with command/response pairing
- Automatic session directory creation

**Log Location:** 
- Session files: `./logs/sessions/<sessionID>.jsonl`

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
- `currentSession: SessionJSONL | null` - Current active session
- `baseLogDir: string` - Base directory for session logs

**Methods:**

#### `constructor(baseLogDir?: string)`
**Purpose:** Initialize interceptor with custom base log directory
**Default:** `"./logs/sessions"`
**Operations:**
- Creates base log directory if it doesn't exist

#### `private ensureSessionDir()`
**Purpose:** Ensure base session directory exists
**Operations:**
- Uses `Bun.mkdir()` with `recursive: true` to create directory

#### `private getLogFile(sessionID: string)`
**Purpose:** Get the log file path for a specific session
**Returns:** `<baseLogDir>/<sessionID>.jsonl`

#### `public createSession(sessionID?: string)`
**Purpose:** Create a new session object
**Returns:** `SessionJSONL` object with initialized data

#### `public ensureCurrentSession(sessionID?: string)`
**Purpose:** Get or create current session
**Returns:** `SessionJSONL` object
**Operations:**
- Creates new session if currentSession is null
- Updates sessionID if provided

#### `public async writeSessionJSONL()`
**Purpose:** Write current session to file and reset
**Operations:**
- Generates sessionID if not set (format: `ses_<timestamp>`)
- Updates endTime
- Writes single JSON line to session file
- Resets currentSession to a new empty session

#### `public extractUserCommand(messages: Message[])`
**Purpose:** Extract last user message from message array
**Returns:** Text content of last user message or empty string
**Operations:**
- Iterates backwards through messages
- Finds first message with role "user"
- Extracts text from first text part

**Session Log Entry Format:**
```json
{
  "sessionID": "session-abc-123",
  "startTime": 1234567890,
  "endTime": 1234568000,
  "data": {
    "system_prompt": [["You are a helpful assistant..."]],
    "user": ["help", "write code"],
    "assistant": ["Here's how to use...", "I'll write..."],
    "tools": [{...}, {...}],
    "events": [...]
  },
  "tokens": {
    "input": 650,
    "output": 380,
    "total": 1030
  },
  "cost": 0.0025
}
```

**Implemented Hooks:**

#### Hook: `experimental.chat.system.transform`
**Input:** `input: { sessionID?: string }`, `output: { system: string[] }`
**Operations:**
- Ensures current session exists
- Pushes output.system to session.data.system_prompt

**Data Structure:**
```json
{
  "sessionID": "session-abc-123",
  "data": {
    "system_prompt": [["You are a helpful assistant..."]]
  }
}
```

#### Hook: `chat.params`
**Input:** `input: { sessionID?: string, model?: { id: string }, provider?: { info: { id: string } } }`, `output: { temperature?: number, topP?: number, topK?: number, options?: any }`
**Operations:**
- Ensures current session exists
- Pushes params to session.data.events

**Event Structure:**
```json
{
  "type": "chat.params",
  "temperature": 0.7,
  "topP": 0.9,
  "topK": 40,
  "options": {},
  "model": "gpt-4",
  "provider": "openai"
}
```

#### Hook: `experimental.chat.messages.transform`
**Input:** `input: { sessionID?: string }`, `output: { messages: Message[] }`
**Operations:**
- Extracts user command from last user message
- Ensures current session exists
- Pushes command to session.data.user
- Pushes event to session.data.events

**Event Structure:**
```json
{
  "type": "experimental.chat.messages.transform",
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

#### Hook: `experimental.text.complete`
**Input:** `input: { sessionID?: string }`, `output: { text: string }`
**Operations:**
- Ensures current session exists
- Pushes output.text to session.data.assistant

#### Hook: `tool.execute.before`
**Input:** `input: { sessionID?: string, tool: string, callID: string }`, `output: { args: any }`
**Operations:**
- Ensures current session exists
- Pushes tool data to session.data.tools

**Tool Entry Structure:**
```json
{
  "type": "before",
  "tool": "bash",
  "args": ["command", "arg1"],
  "callID": "call-uuid"
}
```

#### Hook: `tool.execute.after`
**Input:** `input: { sessionID?: string, tool: string, callID: string }`, `output: { title?: string, output?: string, metadata?: any }`
**Operations:**
- Ensures current session exists
- Pushes tool result to session.data.tools

**Tool Entry Structure:**
```json
{
  "type": "after",
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
**Input:** `{ event: any }`
**Operations:**
- Ensures current session exists
- Pushes only session-type events (where event.type starts with "session") to session.data.events
- If event.type is "session.idle", calls `writeSessionJSONL()` to persist session

**Event Structure:**
Only session-type events are logged to session.data.events array
- Events where event.type starts with "session"
- `session.idle`: Triggers session write to file

## Data Flow

### Request Flow

```
User Input
    ↓
OpenCode Chat API
    ↓
experimental.chat.system.transform (push to session.data.system_prompt)
    ↓
chat.params (push to session.data.events)
    ↓
experimental.chat.messages.transform (extract user command, push to session.data.user and session.data.events)
    ↓
Send to LLM Provider
    ↓
Receive Stream
     ↓
tool.execute.before (push to session.data.tools)
     ↓
Execute Tool
     ↓
tool.execute.after (push to session.data.tools)
     ↓
experimental.text.complete (push output.text to session.data.assistant)
     ↓
event: session.idle (trigger writeSessionJSONL())
    ↓
Write session to ./logs/sessions/<sessionID>.jsonl
    ↓
Reset currentSession to empty session
```

## Plugin Comparison

| Feature | SimpleLLMInterceptor | FullLLMInterceptor |
|---------|---------------------|-------------------|
| **Output** | Console + Truncated File | File only |
| **Persistence** | JSONL (single file) | JSONL (per session) |
| **Log Location** | `/tmp/opencode-logs/intercepted-prompts.jsonl` | `./logs/sessions/<sessionID>.jsonl` |
| **File Organization** | Single file | Session-based (one file per session) |
| **Session Tracking** | ❌ No | ✅ Yes (sessionID + metadata) |
| **Round Tracking** | ❌ No | ❌ No |
| **Command/Response Pairing** | ❌ No | ✅ Yes (system_prompt, user, assistant arrays) |
| **Event Stream** | ❌ No | ✅ Yes (session-type events only) |
| **Chat Params** | ❌ No | ✅ Yes (temperature, model, etc.) |
| **Data Truncation** | ✅ Yes (500/200 chars) | ❌ No (full data) |
| **In-Memory Buffer** | ❌ No | ✅ Yes (per session) |
| **Log Rotation** | ❌ No | ❌ No (manual cleanup) |
| **Async Write** | ✅ Yes | ✅ Yes |
| **I/O Overhead** | Low | Low (append-only per session) |
| **Auto-Write Trigger** | Immediate on hook | On session.idle event |

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

### TurnData
```typescript
interface TurnData {
  system_prompt: string[][]
  user: string[]
  assistant: string[]
  tools: any[]
  events: any[]
}
```

### SessionJSONL
```typescript
interface SessionJSONL {
  sessionID: string
  startTime: number
  endTime: number
  data: TurnData
  tokens?: {
    input: number
    output: number
    total: number
  }
  cost?: number
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
- **Memory:** Low-Medium (session data in RAM until write)
- **Latency:** Negligible (no buffer rewriting)
- **Use Case:** Production monitoring, analysis, conversation history

**Session-Based Benefits:**
1. **Isolation:** Each conversation is independent file
2. **Query Performance:** Fast lookups by sessionID
3. **Scalability:** Logs don't grow indefinitely per session
4. **Memory Efficiency:** Only current session in RAM, written to disk on idle
5. **Concurrent Access:** Multiple sessions can be logged simultaneously
6. **Easy Cleanup:** Delete or archive individual sessions
7. **Natural Organization:** Files map 1:1 to conversations
8. **Simpler Analysis:** Process individual sessions independently
9. **Better Debugging:** Isolate problematic conversations
10. **Export Ready:** Each session file is self-contained

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
| `experimental.text.complete` | Response capture | ✅ | ✅ |
| `tool.execute.before` | Tool execution start | ✅ | ✅ |
| `tool.execute.after` | Tool execution result | ✅ | ✅ |
| `event` | Stream events | ❌ | ✅ |

**Session-Specific Behavior:**
- `experimental.chat.system.transform`: Pushes system prompt to session.data.system_prompt array
- `experimental.chat.messages.transform`: Extracts user command, pushes to session.data.user array
- `experimental.text.complete`: Pushes assistant response to session.data.assistant array
- `tool.execute.before` and `tool.execute.after`: Push tool execution data to session.data.tools array
- `event`: Pushes session-type events (where event.type starts with "session") to session.data.events array
- `event: session.idle`: Triggers `writeSessionJSONL()` to persist session to disk

## Event Types Captured

| Event Type | Description | Captured By |
|------------|-------------|-------------|
| `session.*` | Session-related events (e.g., session.idle) | Full |

## LLM Data Capture Logic

### System Prompt Capture

**Source:** `experimental.chat.system.transform` hook

**Capture Logic:**
```typescript
function captureSystemPrompt(output: { system: string[] }): string[] {
  return output.system // Complete system prompt array
}
```

**Session Update:**
- Pushes system prompt to session.data.system_prompt array as a new inner array
- Multiple system pushes create nested array structure

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

**Session Update:**
- Pushes user command to session.data.user array
- User command extracted from last user message in the message array

### LLM Response Capture

**Source:** `experimental.text.complete` hook

**Capture Logic:**
```typescript
function captureResponse(output: { text: string }): string {
  return output.text // Complete response text
}
```

**Session Update:**
- Pushes full response to session.data.assistant array

### Session Metadata

**Token Usage:**
- Stored directly on SessionJSONL object
- Structure: `{ input, output, total }`

**Cost Tracking:**
- Stored directly on SessionJSONL object
- Format: Number (dollars)

**Tools:**
- Array of tool execution objects stored in session.data.tools
- Each entry includes: type ("before"/"after"), tool, args/result, callID

**Session Duration:**
- `startTime`: Set when session is created
- `endTime`: Set when session is written (on session.idle event)

### Read Session File

```bash
# View entire session JSON
cat ./logs/sessions/session-abc-123.jsonl | jq

# Extract session metadata
cat ./logs/sessions/session-abc-123.jsonl | jq '{sessionID, startTime, endTime, tokens, cost}'

# Extract all user messages
cat ./logs/sessions/session-abc-123.jsonl | jq '.data.user[]'

# Extract all assistant responses
cat ./logs/sessions/session-abc-123.jsonl | jq '.data.assistant[]'

# View all tool executions
cat ./logs/sessions/session-abc-123.jsonl | jq '.data.tools[]'

# View all events
cat ./logs/sessions/session-abc-123.jsonl | jq '.data.events[]'
```

### Session Analysis

```bash
# List all session files
ls -lh ./logs/sessions/

# Find sessions with specific user command
grep -l "write code" ./logs/sessions/*.jsonl

# Calculate total tokens across all sessions
cat ./logs/sessions/*.jsonl | jq -r '.tokens.total' | awk '{sum+=$1} END {print sum}'

# Find expensive sessions
for file in ./logs/sessions/*.jsonl; do
  cost=$(cat "$file" | jq '.cost')
  echo "$(basename $file .jsonl): $cost"
done

# Count messages per session
for file in ./logs/sessions/*.jsonl; do
  user_count=$(cat "$file" | jq '.data.user | length')
  assistant_count=$(cat "$file" | jq '.data.assistant | length')
  tool_count=$(cat "$file" | jq '.data.tools | length')
  echo "$(basename $file .jsonl): $user_count user, $assistant_count assistant, $tool_count tools"
done

# Extract system prompts from all sessions
cat ./logs/sessions/*.jsonl | jq -r '.data.system_prompt[][]'
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

logs/sessions/                       # Session log files
├── session-abc123.jsonl            # Full session logs
├── session-def456.jsonl            # Full session logs
└── session-ghi789.jsonl            # Full session logs
```

## Version History

**v1.0.0** (Current - Basic Session-Based Logging)
**New Features:**
- ✅ Session-based file organization (one file per sessionID)
- ✅ Command/response pairing and extraction
- ✅ Session metadata tracking (tokens, cost, duration)
- ✅ In-memory session buffering
- ✅ Append-only JSONL logging
- ✅ Event stream capture (session-type events only, e.g., session.idle)
- ✅ Tool execution logging (before/after)
- ✅ Chat parameters logging
- ✅ System prompt capture
- ✅ Auto-write on session.idle event

**Data Structure:**
- SessionJSONL contains:
  - sessionID, startTime, endTime
  - data: { system_prompt[][], user[], assistant[], tools[], events[] }
  - tokens: { input, output, total }
  - cost: number

**Hook Behavior:**
- All hooks accumulate data in session object
- Session written on session.idle event
- Session resets to empty state after write

**Benefits:**
- Complete conversation history in single file per session
- All LLM interactions preserved without truncation
- Structured data format for analysis
- Easy session isolation and sharing

## License

MIT License - Same as OpenCode project
