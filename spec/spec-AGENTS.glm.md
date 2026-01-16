# AGENTS.md Update Specification

## Overview

This specification defines when and how to update the AGENTS.md file in the OpenCode development workspace. AGENTS.md serves as the primary instruction manual for AI coding agents (like OpenCode itself) operating in this repository.

## Purpose

AGENTS.md is automatically loaded by OpenCode when working in this repository and provides:
- Project-specific build/test commands
- Code style and formatting guidelines
- Architecture patterns and conventions
- Testing practices
- Any rules that AI agents should follow when making changes

## When to Update

### Required Updates

Update AGENTS.md when any of the following occur:

1. **New Build/Test Commands Added**
   - New npm/bun scripts in package.json
   - New CI/CD workflows
   - New testing procedures (e.g., single test commands)
   - SDK generation or build steps

2. **Coding Standard Changes**
   - New linting rules
   - Formatting style changes (Prettier, ESLint config updates)
   - New naming conventions
   - Import style changes

3. **Architecture Changes**
   - New frameworks or libraries added
   - Directory structure reorganization
   - New patterns (e.g., namespace-based organization)
   - New dependency injection approaches

4. **Testing Updates**
   - New testing framework or utilities
   - Test file location changes
   - Test organization patterns
   - Assertion patterns

5. **Tool/Plugin Development**
   - New tool development patterns
   - Plugin hook additions or changes
   - SDK generation procedures
   - API endpoint modifications

### Optional Updates

Consider updates for:
- Clarifying existing ambiguous guidelines
- Adding examples for complex patterns
- Documenting common pitfalls agents encounter
- Adding best practices discovered through usage

## What to Include

### Build/Test Commands

Document all commands agents might need:

```markdown
### Root Workspace
- **Install dependencies**: `bun install`
- **Typecheck all packages**: `bun run typecheck`
- **Test all**: `bun test`
- **Single test**: `bun test test/tool/bash.test.ts`
```

### Code Style Guidelines

Cover these areas:
- TypeScript/JavaScript configuration (strict mode, tsconfig)
- Formatting rules (semicolons, print width, line endings)
- Naming conventions (camelCase, PascalCase, single words preferred)
- Import patterns (relative vs workspace, named imports)
- Code patterns to avoid (let statements, else statements, destructuring)

### Architecture Patterns

Document:
- Namespace-based organization patterns
- Dependency injection approaches
- File organization rules
- Tool implementation patterns
- Plugin development guidelines

### Type Safety

Specify:
- Type validation approaches (Zod schemas)
- Interface vs type usage
- Any type usage restrictions
- TypeScript strict mode requirements

### Testing Standards

Include:
- Testing framework (bun:test)
- Test file naming and location
- Assertion patterns
- Test organization (describe blocks)
- Mocking/stubbing patterns

### API/SDK Guidelines

Document:
- API client patterns
- SDK generation procedures
- Endpoint modification workflows
- Communication patterns between components

## File Structure

Use this template (aim for 150-200 lines):

```markdown
# [Project Name]

[Brief 1-2 sentence description of the project]

## Project Structure

- Directory layout overview
- Key components and their purposes

## Build/Test Commands

### [Level 1 Category]
- **Command description**: `actual command`
- **Another command**: `command`

## Code Style Guidelines

### [Category]
- **Setting**: Value or pattern
- **Another setting**: Value or pattern

### [Code Patterns]

#### [Pattern Name]
[Explanation with good/bad examples]

### [Testing]
- Framework information
- Test structure
- Assertions

## [Additional Categories]

[Other relevant guidelines]
```

## Update Process

### 1. Identify Changes

Check these sources for changes:
- `package.json` scripts section
- `tsconfig.json` updates
- Prettier/ESLint config changes
- New directories or file patterns
- Recent git commits affecting architecture

### 2. Update AGENTS.md

Follow these steps:

1. **Read current AGENTS.md** to understand existing content
2. **Identify sections needing updates**
3. **Make targeted edits** using the Edit tool
4. **Preserve existing structure** unless reorganizing for clarity
5. **Add examples** for complex patterns
6. **Keep it concise** - avoid verbose explanations

### 3. Verify Changes

After updating, verify:
- Build/test commands are accurate and complete
- Code examples are correct and follow project conventions
- No contradictions exist
- File is readable and well-organized
- Length is reasonable (150-200 lines)

### 4. Test Effectiveness

Optional: Create a small test scenario to verify:
- Agent can successfully run commands
- Agent follows style guidelines
- No confusion in instructions

## Best Practices

### DO

- Keep instructions concise and actionable
- Use code examples for clarity
- Group related information together
- Use consistent formatting
- Focus on what agents **should** do, not what they shouldn't
- Update promptly after project changes
- Use parallel tool calls in examples when applicable

### DON'T

- Include verbose explanations or tutorials
- Add project history or rationale
- Include changelog or version information
- Make the file excessively long (>250 lines)
- Add irrelevant or personal notes
- Include TODOs or placeholders
- Duplicate information from README.md

## Common Mistakes to Avoid

1. **Including changelog info** - AGENTS.md is not a changelog
2. **Being too verbose** - Agents need clear rules, not tutorials
3. **Forgetting examples** - Code examples clarify complex patterns
4. **Outdated commands** - Always verify commands work after updates
5. **Contradictions** - Ensure all guidelines are consistent
6. **Missing single test commands** - Essential for debugging
7. **Including irrelevant info** - Stick to agent-relevant guidelines

## Review Checklist

Before committing AGENTS.md changes:

- [ ] All build/test commands are accurate
- [ ] Single test command is documented
- [ ] Code style guidelines are current
- [ ] Examples are correct and follow conventions
- [ ] File is well-organized and readable
- [ ] Length is appropriate (150-200 lines)
- [ ] No contradictions exist
- [ ] All changes are relevant to AI agents
- [ ] Formatting is consistent throughout
- [ ] No changelog or version information included

## Examples

### Good Entry

```markdown
### Testing
- **Framework**: bun:test
- **Test files**: `*.test.ts`
- **Directory**: `test/` alongside source files
- **Assertions**: Use `expect()` from bun:test
```

### Bad Entry

```markdown
We use the bun:test framework because it's fast and integrates well with Bun. Tests should be placed in a test directory next to the source files they test. For assertions, use the expect function from bun:test.
```

### Good Pattern Example

```markdown
#### Avoid let statements
Prefer ternary operators over if/else with let:

// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

## Maintenance

**Frequency**: Review quarterly or after major refactors
**Ownership**: Project maintainers
**Format**: Markdown with clear sections
**Length target**: 150-200 lines

## Related Files

- `package.json` - Source of build/test commands
- `tsconfig.json` - TypeScript configuration
- `.prettierrc` - Formatting rules
- `.opencode/` - OpenCode configuration directory
- `vendor/opencode/AGENTS.md` - Parent project guidelines

## Version History

- **v1.0** (2025-01-17) - Initial specification
