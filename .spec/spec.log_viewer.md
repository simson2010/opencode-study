# OpenCode Log Viewer Specification

## Overview

This specification documents the design and implementation of an interactive log viewer tool for visualizing OpenCode LLM interceptor session logs stored in JSONL format within the `logs/sessions` directory.

## Architecture

### Component Architecture

```
┌─────────────────────────────────────┐
│         Log Viewer UI                │
│  (HTML/JavaScript/Vue.js)           │
└──────────┬──────────────────────────┘
           │
           ├──────────────────────────────┐
           │                              │
      ┌────▼─────┐                  ┌─────▼──────┐
      │ Session  │                  │  Tree View │
      │ Selector │                  │  Browser   │
      └────┬─────┘                  └─────┬──────┘
           │                              │
           └──────────┬───────────────────┘
                      │
               ┌──────▼──────┐
               │  Log File   │
               │  Parser     │
               └──────┬──────┘
                      │
               ┌──────▼──────┐
               │ JSONL Files │
               │  (Disk)     │
               └─────────────┘
```

### Data Flow

```
User Action: Select Log File
         ↓
List files from ./logs/sessions/
         ↓
Display session files in dropdown/list
         ↓
User Action: Click session file
         ↓
Load JSONL file content
         ↓
Parse each line as JSON object
         ↓
Extract top-level keys from log entries
         ↓
Build tree structure: keys → log entries → values
         ↓
Render tree view with expandable nodes
         ↓
User Action: Click tree node (key)
         ↓
Display associated data/values in detail panel
```

## User Interface

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Header: OpenCode Log Viewer                            │
├─────────────────────────────────────────────────────────┤
│  Controls:                                               │
│  [Session Selector ▼]  [Reload]  [Search: ______]      │
├─────────────────┬───────────────────────────────────────┤
│                 │                                       │
│  Tree View      │  Detail Panel                         │
│  (Key Browser)  │  (Data Display)                       │
│                 │                                       │
│  ▼ timestamp    │  timestamp: 1768417100749             │
│    ├─ command   │  type: "command"                      │
│    └─ response  │                                       │
│                 │  data: {                              │
│  ▼ type         │    "hook": "experimental.chat...",   │
│    ├─ command   │    "type": "command",                 │
│    ├─ response  │    "command": "add a new spec...",    │
│    ├─ tool      │    "messageCount": 8                  │
│    └─ event     │  }                                    │
│                 │                                       │
│  ▼ data         │  [Formatted JSON display]            │
│    ├─ hook      │                                       │
│    ├─ type      │                                       │
│    ├─ command   │                                       │
│    └─ messages  │                                       │
│                 │                                       │
└─────────────────┴───────────────────────────────────────┘
```

### Components

#### 1. Session Selector

**Purpose:** Allow user to select which session log file to view

**UI Elements:**
- Dropdown menu or list of available session files
- File metadata (size, last modified timestamp)
- Current selection indicator

**Data Structure:**
```typescript
interface SessionFile {
  name: string        // Filename (e.g., "default.jsonl")
  sessionID: string   // Session identifier (filename without .jsonl)
  size: number        // File size in bytes
  lastModified: Date  // Last modification timestamp
  path: string        // Full path to file
}
```

**Behavior:**
- Scan `./logs/sessions/` directory on load
- List all `.jsonl` files sorted by modification time (newest first)
- Display human-readable session IDs (truncate long IDs to 8-12 chars)
- Reload button to refresh file list
- Auto-select most recent file on initial load

#### 2. Tree View Browser

**Purpose:** Hierarchical display of all keys present in the selected JSONL log file

**UI Elements:**
- Collapsible tree nodes with expand/collapse icons
- Icons for different data types (object, array, string, number)
- Visual indicators for nested structures
- Search/filter input for tree nodes

**Tree Structure:**
```
Root (Log File)
├─ timestamp
│  ├─ Entry 1: 1768417100749
│  └─ Entry 2: 1768417150231
├─ type
│  ├─ command
│  ├─ response
│  ├─ tool
│  └─ event
├─ data
│  ├─ hook
│  │  ├─ experimental.chat.system.transform
│  │  └─ experimental.chat.messages.transform
│  ├─ type
│  ├─ command
│  ├─ messageCount
│  └─ messages
│     └─ (array data)
└─ sessionID
   └─ default
```

**Data Structure:**
```typescript
interface TreeNode {
  key: string              // Key name (e.g., "timestamp")
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'
  children?: TreeNode[]    // Nested nodes
  entries?: LogEntry[]     // Associated log entries
  expanded?: boolean       // UI state
  path: string[]           // Full path from root
}

interface LogEntry {
  timestamp: number
  type: string
  data: any
  sessionID?: string
  lineNumber: number       // Line number in JSONL file
}
```

**Behavior:**
- Extract all unique top-level keys from JSONL entries
- Group entries by key values
- Build hierarchical tree from nested data structures
- Clicking a key node selects it and shows associated data
- Clicking expand/collapse toggles visibility of children
- Search highlights matching nodes and filters tree

#### 3. Detail Panel

**Purpose:** Display the full data content for selected tree node

**UI Elements:**
- Display mode selector (Raw JSON, Formatted View, Table)
- Syntax highlighting for JSON
- Collapsible sections for large data
- Copy to clipboard button
- Download as JSON button

**Display Modes:**

**Mode 1: Raw JSON**
```json
{
  "timestamp": 1768417100749,
  "type": "command",
  "data": {
    "hook": "experimental.chat.messages.transform",
    "command": "add a new spec..."
  }
}
```

**Mode 2: Formatted View**
```
timestamp: 1768417100749
type: command

data:
  hook: experimental.chat.messages.transform
  type: command
  command: add a new spec about log viewer...
  messageCount: 8
```

**Mode 3: Table View** (for array data)
| field | value |
|-------|-------|
| timestamp | 1768417100749 |
| type | command |
| hook | experimental.chat.messages.transform |
| command | add a new spec... |

**Behavior:**
- Show all log entries associated with selected key
- Format data according to selected mode
- Highlight search matches
- Provide expand/collapse for large objects/arrays
- Update display when tree selection changes

## Implementation

### Technology Stack

**Frontend:**
- Vue.js 3 (via CDN) - Reactive UI framework
- HTML5/CSS3 - Structure and styling
- Vanilla JavaScript - File operations and parsing

**Libraries:**
- Vue 3 - Component framework
- (Optional) jq-web - JSON query/filter

### Core Functions

#### 1. Session File Scanner

```typescript
async function scanSessions(): Promise<SessionFile[]> {
  const basePath = './logs/sessions/'
  const response = await fetch(`${basePath}?list`)
  const files: SessionFile[] = []
  
  for (const file of response.files) {
    if (file.name.endsWith('.jsonl')) {
      files.push({
        name: file.name,
        sessionID: file.name.replace('.jsonl', ''),
        size: file.size,
        lastModified: new Date(file.lastModified),
        path: `${basePath}${file.name}`
      })
    }
  }
  
  return files.sort((a, b) => b.lastModified - a.lastModified)
}
```

#### 2. JSONL Parser

```typescript
function parseJSONL(content: string): LogEntry[] {
  const lines = content.split('\n').filter(line => line.trim())
  const entries: LogEntry[] = []
  
  lines.forEach((line, index) => {
    try {
      const entry = JSON.parse(line)
      entries.push({
        timestamp: entry.timestamp,
        type: entry.type,
        data: entry.data,
        sessionID: entry.sessionID,
        lineNumber: index + 1
      })
    } catch (e) {
      console.error(`Failed to parse line ${index + 1}:`, e)
    }
  })
  
  return entries
}
```

#### 3. Tree Builder

```typescript
function buildTree(entries: LogEntry[]): TreeNode {
  const root: TreeNode = {
    key: 'Root',
    type: 'object',
    children: [],
    entries,
    path: []
  }
  
  // Collect all keys from all entries
  const allKeys = new Set<string>()
  entries.forEach(entry => {
    Object.keys(entry).forEach(key => allKeys.add(key))
  })
  
  // Create nodes for each top-level key
  Array.from(allKeys).sort().forEach(key => {
    const node: TreeNode = {
      key,
      type: getKeyDataType(entries, key),
      entries: entries.filter(e => key in e),
      path: [key]
    }
    
    // Build children for nested data
    if (key === 'data') {
      node.children = buildDataTree(entries)
    }
    
    root.children!.push(node)
  })
  
  return root
}

function getKeyDataType(entries: LogEntry[], key: string): TreeNode['type'] {
  for (const entry of entries) {
    if (key in entry) {
      const value = entry[key]
      if (value === null) return 'null'
      if (Array.isArray(value)) return 'array'
      return typeof value as TreeNode['type']
    }
  }
  return 'string'
}

function buildDataTree(entries: LogEntry[]): TreeNode[] {
  const dataKeys = new Set<string>()
  
  entries.forEach(entry => {
    if (entry.data && typeof entry.data === 'object') {
      Object.keys(entry.data).forEach(key => dataKeys.add(key))
    }
  })
  
  return Array.from(dataKeys).map(key => ({
    key,
    type: getDataKeyType(entries, key),
    path: ['data', key]
  }))
}
```

#### 4. Data Display Formatter

```typescript
function formatData(data: any, mode: 'json' | 'formatted' | 'table'): string {
  switch (mode) {
    case 'json':
      return JSON.stringify(data, null, 2)
    case 'formatted':
      return formatKeyValue(data)
    case 'table':
      return formatTable(data)
  }
}

function formatKeyValue(data: any, indent = 0): string {
  const prefix = '  '.repeat(indent)
  let output = ''
  
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object') {
      output += `${prefix}${key}:\n${formatKeyValue(value, indent + 1)}`
    } else {
      output += `${prefix}${key}: ${value}\n`
    }
  }
  
  return output
}

function formatTable(data: any): string {
  const rows = Object.entries(data).map(([key, value]) => ({
    field: key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value)
  }))
  
  // Generate HTML table
  return `
    <table class="data-table">
      <thead>
        <tr><th>field</th><th>value</th></tr>
      </thead>
      <tbody>
        ${rows.map(r => `<tr><td>${r.field}</td><td>${r.value}</td></tr>`).join('')}
      </tbody>
    </table>
  `
}
```

### File Loading

#### Static File Server

Since the viewer is a static HTML file, a simple HTTP server is required to serve the session files:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve

# Using Bun
bun run --watch log-viewer.html
```

**CORS Considerations:**
- Serve from same origin as HTML file
- Or configure CORS headers if serving from different origin

### Session Management

```typescript
class SessionManager {
  private currentSession: SessionFile | null = null
  private sessions: SessionFile[] = []
  private entries: LogEntry[] = []
  private tree: TreeNode | null = null
  
  async loadSessions() {
    this.sessions = await scanSessions()
  }
  
  async selectSession(sessionID: string) {
    this.currentSession = this.sessions.find(s => s.sessionID === sessionID)
    if (!this.currentSession) throw new Error('Session not found')
    
    const content = await fetch(this.currentSession.path).then(r => r.text())
    this.entries = parseJSONL(content)
    this.tree = buildTree(this.entries)
  }
  
  getTree(): TreeNode | null {
    return this.tree
  }
  
  getEntriesForKey(keyPath: string[]): LogEntry[] {
    return this.entries.filter(entry => {
      let value = entry
      for (const k of keyPath) {
        if (!value || !(k in value)) return false
        value = value[k]
      }
      return true
    })
  }
}
```

## Data Structures

### JSONL Log Entry Format

```typescript
interface JSONLLogEntry {
  timestamp: number        // Unix timestamp in milliseconds
  type: string            // "command", "response", "tool", "event"
  data: any               // Hook-specific data payload
  sessionID?: string      // Session identifier (optional in logs)
}
```

### Session File Naming Convention

```
./logs/sessions/
├── default.jsonl              // Default session
├── ses_abc123def456.jsonl     // Generated session IDs
├── ses_4422e7ecdffeo.jsonl    // Short session IDs
└── session-custom-name.jsonl  // Custom session names
```

### Tree Node Data Types

```typescript
type DataType = 
  | 'string'      // Primitive string values
  | 'number'      // Numeric values
  | 'boolean'     // True/false values
  | 'null'        // Null values
  | 'object'      // Nested objects (has children)
  | 'array'       // Array values (has children)
```

## Features

### Core Features

1. **Session File Browser**
   - List all available session log files
   - Display file metadata (size, date)
   - Sort by modification time
   - Auto-select most recent session

2. **Hierarchical Tree View**
   - Display all unique keys in selected session
   - Collapsible tree nodes
   - Visual indicators for data types
   - Expand/collapse all functionality
   - Search and filter nodes

3. **Interactive Data Display**
   - Click key to view associated data
   - Multiple display modes (JSON, formatted, table)
   - Syntax highlighting
   - Copy to clipboard
   - Download data

4. **Real-time Updates**
   - Reload button to refresh file list
   - Manual file reload for monitoring active sessions
   - Optional auto-refresh (configurable interval)

### Advanced Features

1. **Search and Filter**
   - Search tree nodes by key name
   - Filter log entries by value
   - Highlight matches in tree and data views
   - Search across multiple sessions

2. **Cross-Session Analysis**
   - Compare data across sessions
   - Track key changes over time
   - Identify patterns in log entries

3. **Export Capabilities**
   - Export selected data as JSON
   - Export entire session
   - Export filtered results
   - Generate summary reports

4. **Statistics Panel**
   - Entry count by type
   - Key frequency analysis
   - Time range display
   - Data size metrics

## Styling

### Theme

Dark theme matching VS Code style (consistent with existing log-viewer.html)

### Color Palette

```css
--bg-primary: #1e1e1e
--bg-secondary: #252526
--bg-tertiary: #2d2d2d
--text-primary: #d4d4d4
--text-secondary: #858585
--accent-blue: #007acc
--accent-green: #4ec9b0
--accent-purple: #c586c0
--accent-yellow: #dcdcaa
--border-color: #3c3c3c
```

### Typography

```css
font-family: 'Menlo', 'Monaco', 'Courier New', monospace
font-size: 14px
line-height: 1.5
```

### Layout Classes

```css
.container { display: flex; height: 100vh; }
.sidebar { width: 350px; border-right: 1px solid var(--border-color); }
.main-panel { flex: 1; overflow-y: auto; }
.tree-node { padding: 4px 8px; cursor: pointer; }
.tree-node:hover { background: rgba(255,255,255,0.05); }
.detail-panel { padding: 20px; }
```

## Performance Considerations

### File Loading

- **Lazy Loading:** Only load selected session file
- **Streaming:** For large files, parse incrementally
- **Caching:** Cache parsed entries in memory
- **Pagination:** For sessions with thousands of entries

### Tree Rendering

- **Virtual Scrolling:** Render only visible tree nodes
- **Debounced Search:** Delay search input processing
- **Optimized DOM Updates:** Use Vue's virtual DOM efficiently

### Data Display

- **Lazy Expansion:** Expand large objects/arrays on demand
- **Truncation:** Limit display for long strings/arrays
- **Formatting Cache:** Cache formatted output

### Memory Management

- **Entry Limits:** Cap loaded entries (e.g., 10,000)
- **Tree Pruning:** Remove unused tree nodes
- **Cleanup:** Clear data when switching sessions

## Usage

### Launching the Viewer

```bash
# From project root
cd /path/to/opencode_temp

# Start HTTP server
python -m http.server 8000

# Open in browser
open http://localhost:8000/plugins/log-viewer.html
```

### Basic Workflow

1. Open log viewer in browser
2. Select session from dropdown (most recent auto-selected)
3. Browse tree view to find keys of interest
4. Click key to view associated data
5. Switch display mode if needed (JSON/formatted/table)
6. Use search to find specific keys or values
7. Export data if needed

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + F` | Focus search box |
| `Ctrl/Cmd + R` | Reload session files |
| `Ctrl/Cmd + E` | Expand all tree nodes |
| `Ctrl/Cmd + W` | Collapse all tree nodes |
| `Ctrl/Cmd + C` | Copy selected data |
| `Arrow Keys` | Navigate tree |

## Error Handling

### File Loading Errors

```typescript
async function loadSession(path: string): Promise<LogEntry[]> {
  try {
    const response = await fetch(path)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const content = await response.text()
    return parseJSONL(content)
  } catch (error) {
    console.error('Failed to load session:', error)
    showError('Unable to load session file. Make sure the file exists and is readable.')
    return []
  }
}
```

### Parse Errors

- Skip malformed JSON lines with warning
- Display line numbers for parse errors
- Log errors to console
- Continue parsing remaining lines

### UI Errors

- Display user-friendly error messages
- Provide recovery options (retry, reload)
- Graceful degradation for missing features

## Browser Compatibility

### Target Browsers

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

### Required Features

- ES6+ JavaScript support
- CSS Grid and Flexbox
- Fetch API
- Local Storage (for preferences)

### Polyfills (if needed)

- `fetch` polyfill for older browsers
- `Promise` polyfill for IE11

## Testing

### Test Data

Sample JSONL files with various data types:
- Nested objects
- Arrays
- Different log entry types
- Large data payloads
- Edge cases (null, undefined, empty values)

### Test Cases

1. **File Loading**
   - Load session with 0 entries
   - Load session with 10,000+ entries
   - Handle malformed JSON lines
   - Handle empty files

2. **Tree Building**
   - Tree with simple flat keys
   - Tree with deeply nested objects
   - Tree with array data
   - Tree with mixed data types

3. **UI Interactions**
   - Select session
   - Expand/collapse nodes
   - Search tree
   - Switch display modes

4. **Performance**
   - Load time for large files (>1MB)
   - Tree render time with 1000+ nodes
   - Search response time
   - Memory usage

## Security Considerations

### File Access

- Viewer reads from `./logs/sessions/` directory only
- No file writing capabilities
- No path traversal vulnerabilities

### XSS Prevention

- Sanitize rendered HTML content
- Use textContent instead of innerHTML where possible
- Escape user-generated content

### CORS

- Serve from same origin as session files
- Validate file paths to prevent directory traversal

## Future Enhancements

### Potential Features

1. **Real-time Monitoring**
   - Watch session files for changes
   - Auto-update when new entries are added
   - Live tail functionality for active sessions

2. **Advanced Analytics**
   - Timeline visualization of log events
   - Token usage charts
   - Tool execution statistics
   - Response time graphs

3. **Comparison Tool**
   - Side-by-side session comparison
   - Diff view between sessions
   - Highlight changes in data

4. **Custom Filters**
   - Build complex query filters
   - Save filter presets
   - Share filter configurations

5. **Integration**
   - Direct link from OpenCode UI
   - Embed in OpenCode dashboard
   - API access for external tools

## Dependencies

**Runtime:**
- Web browser with ES6+ support
- HTTP server for static file serving

**Optional Development:**
- Node.js for build process
- TypeScript for type safety
- Vue DevTools for debugging

## Migration from Existing Viewer

### Changes from Original log-viewer.html

| Aspect | Original | New Spec |
|--------|----------|----------|
| **File Loading** | Single file (`/tmp/opencode-llm-logs.jsonl`) | Multiple session files (`./logs/sessions/*.jsonl`) |
| **Data Organization** | Mixed sessions | Session-based files |
| **Navigation** | Flat list with filters | Hierarchical tree view |
| **Data Exploration** | Expand/collapse entries | Browse by key |
| **User Workflow** | View all logs | Select session → Browse keys → View data |
| **Session Context** | Limited | Full session isolation |

### Backward Compatibility

- Existing log files remain valid
- JSONL format unchanged
- Session directory structure supported
- Original viewer can still read session files individually

## Version History

**v1.0.0** (Initial Spec)
- Session file browser
- Hierarchical tree view
- Interactive data display
- Multiple display modes
- Search and filter capabilities

## License

MIT License - Same as OpenCode project
