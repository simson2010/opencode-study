# OpenCode Development Workspace

This workspace contains OpenCode plugin development and vendor/opencode submodule.

## Project Structure

- `plugins/` - OpenCode LLM interceptor plugins (TypeScript)
- `vendor/opencode/` - Main OpenCode repository (submodule)
- `spec/` - Development specifications and documentation
- `.opencode/` - OpenCode configuration directory

## Build/Test Commands

### Root Workspace
- **Install dependencies**: `bun install`
- **Typecheck all packages**: `bun run typecheck`
- **Dev**: `bun dev` (runs packages/opencode with browser condition)

### Plugin Development
- **Test plugin**: Configure in opencode.json, run `bun dev`
- **Plugin files**: Located in `plugins/` directory
- **Configuration**: Edit `opencode.json` to enable plugins

### Vendor/OpenCode Submodule
- **Run opencode**: `cd vendor/opencode && bun dev`
- **Typecheck**: `bun run typecheck`
- **Test**: `bun test` (run all tests)
- **Single test**: `bun test test/tool/bash.test.ts` (specific test file)
- **Build**: `bun run build`

### SDK Generation
- **Regenerate JavaScript SDK**: `./packages/sdk/js/script/build.ts`

## Code Style Guidelines

### TypeScript
- **Runtime**: Bun with TypeScript ESM modules
- **Config**: Strict mode, extends @tsconfig/bun
- **No semicolons** (configured in prettier)
- **Print width**: 120 characters

### Naming Conventions
- **Variables/Functions**: camelCase
- **Classes/Namespaces**: PascalCase
- **Single word names preferred**: Use single word names when possible, only use multiple words if necessary

### Import Style
- Use relative imports for local modules
- Named imports preferred: `import { Tool } from "./tool"`
- Workspace dependencies: `import { Plugin } from "@opencode-ai/plugin"`

### Code Patterns

#### Avoid let statements
Prefer ternary operators over if/else with let:
```typescript
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

#### Avoid else statements
Use early returns or IIFE:
```typescript
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

#### Avoid unnecessary destructuring
Preserve context by accessing properties directly:
```typescript
// Good
const result = foo.bar + foo.baz

// Bad
const { bar, baz } = foo
const result = bar + baz
```

#### Function organization
Keep things in one function unless composable or reusable

#### Error handling
- Use Result patterns
- Avoid throwing exceptions in tools
- Avoid try/catch where possible

### Type Safety
- Avoid using `any` type
- Use Zod schemas for validation
- TypeScript interfaces for structure
- Type variables with `any` only when unavoidable

### Bun APIs
Prefer Bun APIs when possible:
- `Bun.file()` for file operations
- `Bun.write()` for writing files
- `Bun.mkdir()` for directory creation

### Testing
- **Framework**: bun:test
- **Test files**: `*.test.ts`
- **Directory**: `test/` alongside source files
- **Assertions**: Use `expect()` from bun:test
- **Test structure**: Use `describe()` for grouping related tests

```typescript
import { test, expect } from "bun:test"

test("should do something", () => {
  expect(result).toBe(expected)
})
```

### File Organization
- Namespace-based organization (e.g., `Tool.define()`, `Session.create()`)
- Each feature in its own directory under `src/`
- Test files mirror source structure in `test/` directory

### Tool Implementation
- Implement `Tool.Info` interface with `execute()` method
- Validate all inputs with Zod schemas
- Use `sessionID` in tool context
- Use `App.provide()` for dependency injection

### Logging
- Use `Log.create({ service: "name" })` pattern
- Service names: kebab-case, lowercase

### Plugin Development
- Import from `@opencode-ai/plugin`
- Export plugin as `export const PluginName: Plugin`
- Use hooks like `"experimental.chat.messages.transform"`, `"tool.execute.before"`, etc.
- Async functions for all hooks

## Parallel Tool Usage
ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE. Run multiple independent tool calls in a single message for optimal performance.

## Branch Information
- Default branch: `dev`

## Storage
- Use `Storage` namespace for persistence operations

## API Client
The TypeScript TUI (SolidJS + OpenTUI) communicates with OpenCode server using `@opencode-ai/sdk`. When modifying server endpoints in `packages/opencode/src/server/server.ts`, regenerate the SDK by running `./script/generate.ts`.
