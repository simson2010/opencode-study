# OpenCode LSP Event Study

## Overview

OpenCode integrates with Language Server Protocol (LSP) to provide code intelligence features. The LSP system is built around an event-driven architecture using a custom bus implementation for real-time communication between LSP servers and other system components.

## Event Architecture

### Bus System

OpenCode uses a publish-subscribe event bus system (`vendor/opencode/packages/opencode/src/bus/bus-event.ts`) to handle real-time communication. The system uses Zod schemas to define typed events with strict typing:

```typescript
export function define<Type extends string, Properties extends ZodType>(
  type: Type, 
  properties: Properties
)
```

Events are registered in a global registry and can be published and subscribed to across the application.

### LSP Event Types

OpenCode defines two main LSP-related events:

#### 1. LSP.Updated Event

**Location:** `vendor/opencode/packages/opencode/src/lsp/index.ts:17-19`

```typescript
export const Event = {
  Updated: BusEvent.define("lsp.updated", z.object({})),
}
```

**Purpose:** Published when LSP client connections are updated or new LSP servers are spawned.

**Trigger Points:**
- After successfully spawning a new LSP server (`client.ts:258`)
- Indicates changes in LSP server availability/connections

**Payload:** Empty object (`z.object({})`)

**Usage:** Signals that the LSP server status has changed, prompting UI updates and system state refreshes.

---

#### 2. LSPClient.Event.Diagnostics Event

**Location:** `vendor/opencode/packages/opencode/src/lsp/client.ts:32-40`

```typescript
export const Event = {
  Diagnostics: BusEvent.define(
    "lsp.client.diagnostics",
    z.object({
      serverID: z.string(),
      path: z.string(),
    }),
  ),
}
```

**Purpose:** Published when LSP servers send diagnostic information about code issues (errors, warnings, hints, etc.)

**Trigger Points:**
- When LSP server publishes diagnostics via `textDocument/publishDiagnostics` notification (`client.ts:52-62`)

**Payload:**
```typescript
{
  serverID: string,  // Identifier of the LSP server (e.g., "typescript", "python")
  path: string,      // Absolute file path that diagnostics are for
}
```

**Usage:**
- Notifies system components of new diagnostics for a file
- Used by `waitForDiagnostics()` to resolve promises when diagnostics arrive
- Special handling: TypeScript server diagnostics are suppressed on first occurrence (`client.ts:60`)

---

## Core LSP Functions

### 1. Client Lifecycle Management

#### `LSP.init()`
**Location:** `index.ts:146-148`

Initialize the LSP system. Returns the LSP state management singleton.

#### `LSP.status()`
**Location:** `index.ts:162-175`

Get current status of all connected LSP servers.

**Returns:**
```typescript
{
  id: string,
  name: string,
  root: string,
  status: "connected" | "error"
}[]
```

---

### 2. File Operations

#### `LSP.touchFile(file: string, waitForDiagnostics?: boolean)`
**Location:** `index.ts:277-289`

Notify LSP servers that a file has been opened or modified.

**Parameters:**
- `file`: File path (absolute or relative)
- `waitForDiagnostics`: If true, waits for LSP to publish diagnostics (timeout: 3000ms)

**Behavior:**
- Sends `textDocument/didOpen` notification for new files
- Sends `textDocument/didChange` notification for existing files
- Sends `workspace/didChangeWatchedFiles` notification
- Optionally waits for diagnostics with 150ms debounce

---

### 3. Diagnostics

#### `LSP.diagnostics()`
**Location:** `index.ts:291-301`

Get all diagnostics from all connected LSP servers.

**Returns:** `Record<string, LSPClient.Diagnostic[]>`

Keys are file paths, values are arrays of diagnostic objects.

#### `LSPClient.Diagnostic.pretty(diagnostic)`
**Location:** `index.ts:469-484`

Format a diagnostic for display.

**Output format:** `"SEVERITY [LINE:COL] message"`

Example: `"ERROR [15:3] Variable not found"`

---

### 4. Code Navigation

#### `LSP.hover({ file, line, character })`
**Location:** `index.ts:303-317`

Get hover information (documentation, type info) for a symbol at a position.

**Parameters:**
- `file`: File path
- `line`: 0-based line number
- `character`: 0-based character offset

**Returns:** Hover result from LSP server or null

---

#### `LSP.definition({ file, line, character })`
**Location:** `index.ts:386-395`

Find where a symbol is defined.

**Parameters:** Same as hover

**Returns:** Array of location objects (flattened from all relevant LSP servers)

---

#### `LSP.implementation({ file, line, character })`
**Location:** `index.ts:409-418`

Find implementations of an interface or abstract method.

**Parameters:** Same as hover

**Returns:** Array of location objects

---

#### `LSP.references({ file, line, character })`
**Location:** `index.ts:397-407`

Find all references to a symbol (includes declarations).

**Parameters:** Same as hover

**Returns:** Array of location objects

---

### 5. Symbol Information

#### `LSP.workspaceSymbol(query: string)`
**Location:** `index.ts:359-369`

Search for symbols across the entire workspace.

**Parameters:**
- `query`: Search string

**Returns:** Array of symbols limited to first 10 results

**Symbol kinds included:** Class, Function, Method, Interface, Variable, Constant, Struct, Enum

**Result format:**
```typescript
{
  name: string,
  kind: number,  // SymbolKind enum value
  location: {
    uri: string,
    range: Range
  }
}
```

---

#### `LSP.documentSymbol(uri: string)`
**Location:** `index.ts:371-384`

Get all symbols (functions, classes, variables) in a document.

**Parameters:**
- `uri`: File URI

**Returns:** Array of document symbols

**Result format:**
```typescript
{
  name: string,
  detail?: string,
  kind: number,
  range: Range,
  selectionRange: Range
}
```

---

### 6. Call Hierarchy

#### `LSP.prepareCallHierarchy({ file, line, character })`
**Location:** `index.ts:420-429`

Get call hierarchy item at a position (for functions/methods).

**Parameters:** Same as hover

**Returns:** Array of call hierarchy items

---

#### `LSP.incomingCalls({ file, line, character })`
**Location:** `index.ts:431-442`

Find all functions/methods that call the function at a position.

**Parameters:** Same as hover

**Returns:** Array of incoming call items

**Implementation:** Calls `prepareCallHierarchy` first, then `callHierarchy/incomingCalls`

---

#### `LSP.outgoingCalls({ file, line, character })`
**Location:** `index.ts:444-455`

Find all functions/methods called by the function at a position.

**Parameters:** Same as hover

**Returns:** Array of outgoing call items

**Implementation:** Calls `prepareCallHierarchy` first, then `callHierarchy/outgoingCalls`

---

### 7. Utility Functions

#### `LSP.hasClients(file: string)`
**Location:** `index.ts:264-275`

Check if any LSP server is available for a given file.

**Returns:** `boolean`

Used to determine if LSP operations can be performed on a file.

---

## LSP Server Types

OpenCode supports 30+ built-in LSP servers:

### Scripting Languages
- **TypeScript** - `.ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, .cts`
- **JavaScript (Deno)** - `.ts, .tsx, .js, .jsx, .mjs`
- **Python (Pyright)** - `.py, .pyi`
- **Python (Ty)** - `.py, .pyi` (experimental)
- **Ruby (Rubocop)** - `.rb, .rake, .gemspec, .ru`
- **Bash** - `.sh, .bash, .zsh, .ksh`
- **Lua (LuaLS)** - `.lua`

### Compiled Languages
- **Go (gopls)** - `.go`
- **Rust (rust-analyzer)** - `.rs`
- **C/C++ (clangd)** - `.c, .cpp, .cc, .cxx, .c++, .h, .hpp, .hh, .hxx, .h++`
- **Java (JDTLS)** - `.java` (requires Java 21+)
- **C# (csharp-ls)** - `.cs` (requires .NET SDK)
- **F# (fsautocomplete)** - `.fs, .fsi, .fsx, .fsscript` (requires .NET SDK)
- **Kotlin (kotlin-ls)** - `.kt, .kts`
- **Zig (zls)** - `.zig, .zon`
- **Elixir (elixir-ls)** - `.ex, .exs`
- **OCaml (ocamllsp)** - `.ml, .mli`
- **Dart** - `.dart`
- **Swift (sourcekit-lsp)** - `.swift, .objc, .objcpp`
- **Clojure (clojure-lsp)** - `.clj, .cljs, .cljc, .edn`
- **Gleam** - `.gleam`

### Web Development
- **Vue** - `.vue`
- **Svelte** - `.svelte`
- **Astro** - `.astro`
- **TypeScript** - `.ts, .tsx, .js, .jsx`

### Linters/Formatters
- **ESLint** - `.ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, .cts, .vue`
- **Oxlint** - `.ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, .cts, .vue, .astro, .svelte`
- **Biome** - `.ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, .cts, .json, .jsonc, .vue, .astro, .svelte, .css, .graphql, .gql, .html`

### Configuration/Markup
- **YAML** - `.yaml, .yml`
- **PHP (Intelephense)** - `.php`
- **Prisma** - `.prisma`
- **Terraform** - `.tf, .tfvars`
- **Nix (nixd)** - `.nix`
- **Typst (tinymist)** - `.typ, .typc`

---

## LSP Client Architecture

### Client Creation

**Function:** `LSPClient.create({ serverID, server, root })`
**Location:** `client.ts:42-251`

**Process:**
1. Create JSON-RPC message connection using `vscode-jsonrpc`
2. Set up diagnostics notification handler
3. Configure request handlers (workspace, capabilities)
4. Send `initialize` request with capabilities (45s timeout)
5. Send `initialized` notification
6. Send `workspace/didChangeConfiguration` if initialization options provided
7. Return client object with methods for file operations

### Client Methods

#### `client.notify.open({ path })`
Notify LSP that a file is being opened/changed.

**Behavior:**
- First call: Sends `textDocument/didOpen` with file contents and language ID
- Subsequent calls: Sends `textDocument/didChange` with updated contents
- Always sends `workspace/didChangeWatchedFiles` notification
- Tracks file versions

#### `client.waitForDiagnostics({ path })`
Wait for diagnostics to be published for a specific file.

**Parameters:**
- `path`: File path

**Behavior:**
- Subscribes to `Event.Diagnostics`
- Waits for matching diagnostics (150ms debounce)
- Times out after 3 seconds
- Returns when diagnostics arrive or timeout expires

#### `client.shutdown()`
Gracefully shutdown LSP client connection.

**Process:**
1. End connection
2. Dispose connection
3. Kill LSP server process

---

## LSP Tool Integration

### Tool Definition

**File:** `vendor/opencode/packages/opencode/src/tool/lsp.ts`

OpenCode exposes LSP capabilities through a tool interface usable by AI agents.

**Tool Name:** `lsp`

**Operations:**
1. `goToDefinition` - Find where a symbol is defined
2. `findReferences` - Find all references to a symbol
3. `hover` - Get hover information (documentation, type info)
4. `documentSymbol` - Get all symbols in a document
5. `workspaceSymbol` - Search symbols across workspace
6. `goToImplementation` - Find implementations of interface/abstract method
7. `prepareCallHierarchy` - Get call hierarchy item at position
8. `incomingCalls` - Find functions that call this function
9. `outgoingCalls` - Find functions called by this function

**Parameters:**
- `operation` - The LSP operation to perform
- `filePath` - Absolute or relative file path
- `line` - Line number (1-based, as shown in editors)
- `character` - Character offset (1-based, as shown in editors)

**Process:**
1. Validate file exists
2. Check LSP server availability for file type
3. Touch file (notify LSP) and wait for diagnostics
4. Execute requested operation
5. Return results as JSON

---

## Configuration

### LSP Configuration Schema

**File:** `opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "lsp": {
    "disabled": false,
    "server-id": {
      "disabled": false,
      "command": ["command", "args"],
      "extensions": [".ext"],
      "env": {},
      "initialization": {}
    }
  }
}
```

### Configuration Options

| Property | Type | Description |
|----------|------|-------------|
| `disabled` | boolean | Disable all LSP servers if set to false at top level |
| `server-id.disabled` | boolean | Disable specific LSP server |
| `server-id.command` | string[] | Custom command to start LSP server |
| `server-id.extensions` | string[] | File extensions this server should handle |
| `server-id.env` | object | Environment variables for server process |
| `server-id.initialization` | object | Initialization options sent to LSP server |

### Disabling LSP

**All servers:**
```json
{ "lsp": false }
```

**Specific server:**
```json
{
  "lsp": {
    "typescript": { "disabled": true }
  }
}
```

### Custom LSP Servers

```json
{
  "lsp": {
    "custom-lsp": {
      "command": ["custom-lsp-server", "--stdio"],
      "extensions": [".custom"]
    }
  }
}
```

---

## Server Root Detection

OpenCode uses intelligent root detection to determine the workspace root for each language server.

### Root Detection Function

**Function:** `NearestRoot(includePatterns, excludePatterns)`
**Location:** `server.ts:29-51`

**Behavior:**
- Searches upward from file directory to project root
- Stops when finds any file in `includePatterns`
- Returns `undefined` if finds any file in `excludePatterns`
- Falls back to `Instance.directory` if no patterns match

### Common Root Patterns

| LSP Server | Include Patterns | Exclude Patterns |
|------------|------------------|------------------|
| TypeScript | package-lock.json, bun.lockb, bun.lock, pnpm-lock.yaml, yarn.lock | deno.json, deno.jsonc |
| Deno | deno.json, deno.jsonc | - |
| Python | pyproject.toml, setup.py, setup.cfg, requirements.txt, Pipfile, pyrightconfig.json | - |
| Rust | Cargo.toml, Cargo.lock | - |
| Go | go.mod, go.sum, go.work | - |
| Java | pom.xml, build.gradle, build.gradle.kts, .project, .classpath | - |
| Kotlin | settings.gradle.kts, settings.gradle, gradlew, build.gradle.kts, build.gradle, pom.xml | - |

---

## Type Definitions

### Range

```typescript
{
  start: { line: number, character: number },
  end: { line: number, character: number }
}
```

### Symbol

```typescript
{
  name: string,
  kind: number,  // SymbolKind enum
  location: {
    uri: string,
    range: Range
  }
}
```

### DocumentSymbol

```typescript
{
  name: string,
  detail?: string,
  kind: number,
  range: Range,
  selectionRange: Range
}
```

### Diagnostic

```typescript
{
  range: Range,
  severity: 1 | 2 | 3 | 4,  // Error, Warning, Info, Hint
  message: string,
  source?: string,
  code?: string | number,
  relatedInformation?: Array<...>
}
```

### Status

```typescript
{
  id: string,
  name: string,
  root: string,
  status: "connected" | "error"
}
```

---

## SymbolKind Enum

OpenCode defines standard LSP symbol kinds:

```typescript
enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26
}
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENCODE_DISABLE_LSP_DOWNLOAD` | Set to `true` to disable automatic LSP server downloads |
| `OPENCODE_EXPERIMENTAL_LSP_TY` | Enable experimental Ty Python LSP server |
| `BUN_BE_BUN` | Set to `1` when spawning Bun for LSP servers |

---

## Event Flow Diagrams

### Diagnostic Event Flow

```
LSP Server
  ↓ (textDocument/publishDiagnostics)
LSP Client Connection
  ↓ (onNotification handler)
Update diagnostics Map
  ↓ (Bus.publish)
Bus.publish(Event.Diagnostics, { serverID, path })
  ↓ (Bus.subscribers)
Subscribers (e.g., waitForDiagnostics)
  ↓ (resolve promise)
Agent receives diagnostics
```

### LSP Initialization Flow

```
File Operation (touchFile/readFile/writeFile)
  ↓
LSP.getClients(file)
  ↓
Check file extension against servers
  ↓
For each matching server:
  - Check if already running (s.clients)
  - If not, spawn new server process
  - Create LSPClient with connection
  - Initialize LSP (send initialize request)
  - Add to s.clients
  ↓
Bus.publish(LSP.Event.Updated, {})
  ↓
UI updates (SessionLspIndicator)
```

---

## Error Handling

### InitializeError

**Definition:** `client.ts:25-30`

```typescript
InitializeError = NamedError.create(
  "LSPInitializeError",
  z.object({
    serverID: z.string(),
  }),
)
```

Thrown when LSP client initialization fails (e.g., timeout, server error).

### Server Spawn Errors

When an LSP server fails to spawn or initialize:

1. Server ID is added to `broken` set
2. Error is logged
3. Server won't be retried for the same root directory
4. `undefined` is returned to caller

### Connection Errors

- Request errors are caught and return `null` or `[]`
- Initialization timeout is 45 seconds
- Diagnostics wait timeout is 3 seconds

---

## UI Components

### SessionLspIndicator

**File:** `vendor/opencode/packages/app/src/components/session-lsp-indicator.tsx`

Displays LSP connection status in the UI.

**Shows:**
- Number of connected LSP servers
- Color-coded status (red for errors, green for connected)
- Tooltip with list of server names

---

## Integration with Other Systems

### File Watching

LSP integrates with the file watcher system:

```typescript
Bus.subscribe(FileWatcher.Event.Updated, async (evt) => {
  // Handle file changes
})
```

### Session Management

LSP events are synchronized with session state via the sync context, enabling real-time UI updates.

### Permission System

LSP operations require permission checks:

```typescript
await ctx.ask({
  permission: "lsp",
  patterns: ["*"],
  always: ["*"],
  metadata: {},
})
```

---

## Performance Considerations

1. **Debouncing:** Diagnostics use 150ms debounce to allow multiple diagnostic batches to arrive
2. **Lazy Loading:** LSP servers are only spawned when needed (on file access)
3. **Connection Pooling:** Clients are reused for files in the same root directory
4. **Timeout Protection:** Initialization and diagnostic operations have strict timeouts
5. **Error Recovery:** Failed servers are tracked and not retried

---

## Summary

OpenCode's LSP system provides a comprehensive, event-driven architecture for code intelligence. Key features include:

- **Two main events:** `LSP.Event.Updated` for status changes and `LSPClient.Event.Diagnostics` for code issues
- **9 LSP operations:** navigation, symbol search, and call hierarchy
- **30+ language servers:** with auto-detection and installation
- **Type-safe events:** using Zod schemas
- **Flexible configuration:** enable/disable servers, add custom servers
- **Robust error handling:** timeouts, retries, and broken server tracking
- **Integration:** with file watching, session management, and permission systems

The system enables AI agents to understand code structure, find definitions/references, and receive real-time feedback through diagnostics, making it a powerful tool for code-aware interactions.
