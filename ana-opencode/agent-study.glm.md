# OpenCode Agent 系统深度分析

## 1. 概述

OpenCode 的 Agent 系统是一个模块化、可扩展的 AI 助手框架，允许用户创建和管理具有不同能力、权限和用途的专门化 AI 代理。该系统通过精细的权限控制和工具访问管理，实现了灵活的多 Agent 协作模式。

## 2. 设计原理

### 2.1 核心架构

OpenCode 的 Agent 系统基于以下核心设计原则：

1. **专业化分工**：不同 Agent 负责不同类型的工作任务
2. **层次化管理**：通过 Primary/Subagent 模式实现 Agent 调用层次
3. **权限隔离**：每个 Agent 拥有独立的权限配置
4. **可组合性**：Agent 可以调用其他 Agent 完成复杂任务
5. **可配置性**：支持通过配置文件和代码定义 Agent

### 2.2 数据模型

Agent 的核心数据结构定义在 `src/agent/agent.ts:19-44`：

```typescript
export const Info = z.object({
  name: z.string(),                    // Agent 名称
  description: z.string().optional(),   // Agent 描述
  mode: z.enum(["subagent", "primary", "all"]),  // Agent 模式
  native: z.boolean().optional(),        // 是否为内置 Agent
  hidden: z.boolean().optional(),        // 是否隐藏（仅对 subagent 有效）
  topP: z.number().optional(),          // 模型参数
  temperature: z.number().optional(),     // 模型参数
  color: z.string().optional(),          // UI 显示颜色
  permission: PermissionNext.Ruleset,   // 权限规则集
  model: z.object({                     // 模型配置
    modelID: z.string(),
    providerID: z.string(),
  }).optional(),
  prompt: z.string().optional(),         // 系统 Prompt
  options: z.record(z.string(), z.any()), // 附加选项
  steps: z.number().int().positive().optional(), // 最大迭代步数
})
```

### 2.3 核心模块

#### 2.3.1 Agent 状态管理

```typescript
const state = Instance.state(async () => {
  const cfg = await Config.get()
  // 加载默认权限、内置 Agent 和用户配置的 Agent
  const result: Record<string, Info> = { ... }
  return result
})
```

特点：
- 使用 `Instance.state` 实现缓存
- 合并默认配置、用户配置和内置配置
- 权限规则深度合并

#### 2.3.2 内置 Agent

系统提供 7 个内置 Agent（`src/agent/agent.ts:70-195`）：

1. **build** (primary)：默认主 Agent，完全访问权限
2. **plan** (primary)：分析和规划专用，限制编辑操作
3. **general** (subagent)：通用型 Agent，禁用 Todo 工具
4. **explore** (subagent)：代码探索专用，只读访问
5. **compaction** (primary, hidden)：会话压缩专用
6. **title** (primary, hidden)：生成标题专用
7. **summary** (primary, hidden)：生成摘要专用

### 2.4 权限系统

#### 2.4.1 权限模型

权限系统基于 `PermissionNext` 模块（`src/permission/next.ts`）：

```typescript
export const Action = z.enum(["allow", "deny", "ask"])
export type Action = "allow" | "deny" | "ask"

export const Rule = z.object({
  permission: z.string(),    // 权限类型（如 edit, bash, task）
  pattern: z.string(),       // 模式（支持通配符）
  action: Action,            // 操作
})
```

权限类型包括：
- 工具权限：`bash`, `edit`, `read`, `write`, `grep`, `glob`, `webfetch` 等
- 特殊权限：`doom_loop`, `external_directory`, `question`, `plan_enter`, `plan_exit`, `task`
- 路径权限：针对特定文件路径的权限控制

#### 2.4.2 权限评估

```typescript
export function evaluate(
  permission: string,
  pattern: string,
  ruleset: Ruleset
): { rule: Rule; action: Action }
```

评估规则：
1. 遍历规则集，从后向前匹配（后定义的规则优先级更高）
2. 支持通配符模式匹配
3. 返回第一个匹配的规则

#### 2.4.3 默认权限策略

每个 Agent 继承默认权限模板：

```typescript
const defaults = PermissionNext.fromConfig({
  "*": "allow",
  doom_loop: "ask",
  external_directory: {
    "*": "ask",
    [Truncate.DIR]: "allow",      // 截断目录始终允许
    [Truncate.GLOB]: "allow",      // 截断模式始终允许
  },
  question: "deny",
  plan_enter: "deny",
  plan_exit: "deny",
  read: {
    "*": "allow",
    "*.env": "ask",               // .env 文件需确认
    "*.env.*": "ask",
    "*.env.example": "allow",
  },
})
```

## 3. 配置规范

### 3.1 配置文件位置

Agent 配置从以下位置按优先级加载（低到高）：

1. 远程配置：`{auth_server}/.well-known/opencode`
2. 全局用户配置：`~/.config/opencode/opencode.json` 或 `opencode.jsonc`
3. 项目配置：`.opencode/opencode.json` 或 `opencode.jsonc`
4. Markdown Agent：`~/.config/opencode/agent/*.md`
5. 项目 Markdown Agent：`.opencode/agent/*.md`

### 3.2 配置格式

#### 3.2.1 JSON 格式

```json
{
  "agent": {
    "build": {
      "mode": "primary",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "{file:./prompts/build.txt}",
      "permission": {
        "edit": "allow",
        "bash": "allow"
      },
      "temperature": 0.3,
      "top_p": 0.9,
      "steps": 100
    }
  }
}
```

#### 3.2.2 Markdown 格式

```markdown
---
description: Writes and maintains project documentation
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.1
permission:
  edit: deny
  bash: false
color: "#38A3EE"
---

You are a technical documentation writer.

Focus on:
- Clear explanations
- Proper structure
- Code examples
- User-friendly language
```

#### 3.2.3 Markdown 解析流程

`src/config/config.ts:257-286` 中的 `loadAgent` 函数：

1. 使用 `Bun.Glob` 扫描 `{agent,agents}/**/*.md` 文件
2. 使用 `gray-matter` 解析 frontmatter
3. 从文件路径提取 Agent 名称（支持嵌套路径）
4. 将 frontmatter 与内容合并
5. 使用 Zod 验证配置

### 3.3 配置合并策略

配置采用深度合并（`mergeDeep`）：

```typescript
function mergeConfigConcatArrays(target: Info, source: Info): Info {
  const merged = mergeDeep(target, source)
  // 特殊处理数组合并
  if (target.plugin && source.plugin) {
    merged.plugin = Array.from(new Set([...target.plugin, ...source.plugin]))
  }
  if (target.instructions && source.instructions) {
    merged.instructions = Array.from(new Set([...target.instructions, ...source.instructions]))
  }
  return merged
}
```

优先级：用户配置 > 项目配置 > 默认配置

## 4. 工作流程

### 4.1 Agent 初始化流程

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Config.state() 加载配置                                │
│    - 远程配置                                              │
│    - 全局配置                                              │
│    - 项目配置                                              │
│    - Markdown Agents                                       │
└──────────────────┬────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Agent.state() 初始化 Agent 状态                         │
│    - 应用默认权限                                          │
│    - 创建内置 Agent                                        │
│    - 合并用户配置                                          │
│    - 确保 Truncate.DIR 权限                                │
└──────────────────┬────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Agent.list() 返回可用 Agent 列表                        │
│    - 过滤 disabled Agent                                  │
│    - 按 default_agent 排序                                │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Session 创建流程

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SessionPrompt.prompt() 创建会话                          │
│    - 指定 agent: "build"                                  │
│    - 加载 Agent 配置                                       │
└──────────────────┬────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. LLM.stream() 准备 LLM 调用                            │
│    - 构建 System Prompt:                                   │
│      1. SystemPrompt.header(providerID)                     │
│      2. agent.prompt 或 provider prompt                     │
│      3. 自定义 system prompt                                │
│      4. user.system                                       │
│    - 合并 options: model > agent > variant                  │
│    - 解析工具列表                                          │
└──────────────────┬────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. 流式响应处理                                           │
│    - 监听 tool call                                      │
│    - 执行工具（检查权限）                                  │
│    - 返回结果给 LLM                                       │
│    - 迭代直到完成                                          │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Subagent 调用流程

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 主 Agent 决定调用 Subagent                             │
│    - 使用 Task tool                                        │
│    - 指定 subagent_type                                   │
└──────────────────┬────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. TaskTool.execute()                                     │
│    - 检查 permission.task 权限                             │
│    - 过滤可访问的 subagent 列表                            │
│    - 创建子 Session（parentID 指向父会话）                  │
│    - 应用受限权限：                                        │
│      * todowrite/todoread: deny                            │
│      * task: deny（除非 subagent 有 task 权限）            │
└──────────────────┬────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. 子 Session 执行                                         │
│    - 使用指定的 subagent                                   │
│    - 独立的工具调用流                                      │
│    - 实时回传进度到父会话                                 │
└──────────────────┬────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. 返回结果                                               │
│    - 收集所有 tool 调用摘要                               │
│    - 包含子会话 ID                                        │
│    - 返回文本结果和元数据                                  │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 权限检查流程

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 工具执行前检查                                          │
│    ctx.ask({                                              │
│      permission: "edit",                                   │
│      patterns: ["*.py"],                                  │
│      metadata: { filepath: "src/main.py" }                 │
│    })                                                     │
└──────────────────┬────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. PermissionNext.ask()                                    │
│    - 遍历 Agent.permission 规则集                         │
│    - 对每个 pattern 调用 evaluate()                        │
│    - 查询已批准的权限缓存                                  │
└──────────────────┬────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. 评估结果                                               │
│    a. deny → 抛出 DeniedError                            │
│    b. allow → 继续                                        │
│    c. ask → 发布 Permission.Asked 事件，等待用户回复       │
└──────────────────┬────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. 用户回复                                               │
│    - once: 允许一次                                       │
│    - always: 记录到 approved 缓存，永久允许               │
│    - reject: 拒绝                                        │
└─────────────────────────────────────────────────────────────┘
```

### 4.5 ACP（Agent Client Protocol）集成

```
┌─────────────────────────────────────────────────────────────┐
│ ACP.Agent 实现                                            │
│                                                           │
│ initialize() → 声明能力、认证方法                          │
│ newSession() → 创建 OpenCode Session                        │
│ loadSession() → 加载历史 Session                          │
│ prompt() → 发送用户提示                                    │
│ setSessionMode() → 切换 Agent                              │
│ setSessionModel() → 切换模型                              │
│ cancel() → 取消当前请求                                    │
└──────────────────┬────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 事件订阅                                                  │
│    - permission.asked → 转发给 ACP 客户端                  │
│    - message.part.updated → 同步工具状态                     │
│      * tool pending/running/completed/error                 │
│      * text delta                                         │
│      * reasoning delta                                    │
└─────────────────────────────────────────────────────────────┘
```

## 5. 关键技术细节

### 5.1 工具系统

#### 5.1.1 工具注册

`src/tool/registry.ts:30-143`

```typescript
export async function tools(providerID: string, agent?: Agent.Info) {
  const tools = await all()
  return tools
    .filter(t => {
      // 过滤特定工具
      if (t.id === "codesearch" || t.id === "websearch") {
        return providerID === "opencode" || Flag.OPENCODE_ENABLE_EXA
      }
      return true
    })
    .map(async t => ({
      id: t.id,
      ...(await t.init({ agent }))
    }))
}
```

内置工具列表：
- InvalidTool, QuestionTool (app/cli/desktop)
- BashTool, ReadTool, GlobTool, GrepTool
- EditTool, WriteTool
- TaskTool (subagent 调用)
- WebFetchTool, WebSearchTool, CodeSearchTool
- TodoWriteTool, TodoReadTool
- SkillTool
- LspTool (实验性)
- BatchTool (实验性)
- PlanExitTool, PlanEnterTool (实验性)
- 自定义工具 (plugins, .opencode/tools/*.{ts,js})

#### 5.1.2 Task Tool 实现

`src/tool/task.ts:23-188`

关键功能：
1. **权限过滤**：根据调用者的 `permission.task` 规则过滤可访问的 subagent
2. **会话创建**：创建子 Session，应用受限权限
3. **进度跟踪**：订阅子 Session 的事件，实时更新元数据
4. **工具禁用**：默认禁用 todowrite/todoread，防止无限嵌套

```typescript
const session = await Session.create({
  parentID: ctx.sessionID,
  title: params.description + ` (@${agent.name} subagent)`,
  permission: [
    { permission: "todowrite", pattern: "*", action: "deny" },
    { permission: "todoread", pattern: "*", action: "deny" },
    ...(hasTaskPermission ? [] : [
      { permission: "task", pattern: "*", action: "deny" }
    ]),
  ],
})
```

### 5.2 Prompt 系统

#### 5.2.1 System Prompt 构建顺序

`src/session/llm.ts:66-79`

```
1. SystemPrompt.header(providerID)
   - 基础框架提示

2. agent.prompt 或 provider prompt
   - Agent 专用系统提示
   - 如果 Agent 未定义 prompt，使用 provider 默认提示

3. 自定义 system prompt
   - Session 级别的系统提示

4. user.system
   - 用户消息级别的系统提示
```

#### 5.2.2 Agent 生成 Prompt

`src/agent/generate.txt`

使用 LLM 生成 Agent 配置的 prompt 模板：

1. **提取核心意图**：理解用户需求
2. **设计专家人设**：创建专业的 Agent 人设
3. **架构指令**：提供完整的系统提示
4. **优化性能**：包含决策框架和质量控制机制
5. **创建标识符**：生成唯一的 Agent 名称
6. **添加示例**：包含使用场景示例

生成的 JSON 格式：

```json
{
  "identifier": "code-reviewer",
  "whenToUse": "Use this agent when reviewing code...",
  "systemPrompt": "You are a code reviewer..."
}
```

### 5.3 会话压缩

当会话过长时，使用 compaction Agent 压缩历史：

`src/session/compaction.ts:100`

```typescript
const agent = await Agent.get("compaction")
// compaction Agent 权限：
// * deny 所有操作（只读）
// 使用 summary 和 title Agent 生成摘要
```

压缩策略：
1. 保留最近的 N 条消息
2. 将旧消息摘要化
3. 使用 summary Agent 生成摘要
4. 使用 title Agent 生成标题
5. 替换原始消息为摘要

### 5.4 步数限制

Agent 的 `steps` 配置限制最大迭代次数：

```json
{
  "agent": {
    "quick-thinker": {
      "steps": 5
    }
  }
}
```

当达到限制时：
- 发送特殊系统提示要求总结工作
- 建议剩余任务
- 强制以文本形式响应

## 6. 使用模式

### 6.1 Primary Agent 切换

- **Tab 键**：在 TUI 中切换 Primary Agent
- **`@agent-name`**：在消息中手动指定 Agent
- **配置 `default_agent`**：设置默认 Agent

### 6.2 Subagent 调用

#### 6.2.1 自动调用

LLM 根据 Agent 的 `description` 自动选择合适的 subagent：

```typescript
// Task tool 的描述中包含所有 subagent 的描述
const description = DESCRIPTION.replace(
  "{agents}",
  accessibleAgents
    .map(a => `- ${a.name}: ${a.description ?? "..."}`)
    .join("\n")
)
```

#### 6.2.2 手动调用

用户可以通过 `@` 提及来手动调用：

```
@explore find all TypeScript files in src/
```

#### 6.2.3 子会话导航

- **Leader + Right**：切换到子会话
- **Leader + Left**：返回父会话

### 6.3 权限控制示例

#### 6.3.1 全局配置

```json
{
  "permission": {
    "edit": "ask",
    "bash": "ask"
  }
}
```

#### 6.3.2 Agent 特定配置

```json
{
  "agent": {
    "plan": {
      "permission": {
        "edit": "deny",
        "bash": "ask"
      }
    }
  }
}
```

#### 6.3.3 细粒度控制

```json
{
  "agent": {
    "build": {
      "permission": {
        "bash": {
          "*": "ask",
          "git status": "allow",
          "git diff*": "allow"
        }
      }
    }
  }
}
```

## 7. 最佳实践

### 7.1 创建有效的 Agent

1. **清晰的描述**：提供具体的使用场景
2. **合理的权限**：最小化权限原则
3. **合适的模型**：根据任务复杂度选择
4. **适当的温度**：
   - 0.0-0.2：代码分析、规划
   - 0.3-0.5：一般开发任务
   - 0.6-1.0：创意性任务

### 7.2 Agent 组合模式

#### 7.2.1 审查者模式

```
主 Agent (build) → Subagent (code-reviewer)
```

```typescript
{
  "agent": {
    "code-reviewer": {
      "description": "Reviews code after writing",
      "mode": "subagent",
      "permission": {
        "write": false,
        "edit": false
      }
    }
  }
}
```

#### 7.2.2 专家顾问模式

```
主 Agent (orchestrator) → 多个 Subagent
  ├── security-auditor
  ├── performance-expert
  └── docs-writer
```

#### 7.2.3 层级模式

```
Primary → Subagent → Sub-subagent
```

### 7.3 权限设计原则

1. **默认拒绝**：对危险操作（doom_loop）使用 "ask"
2. **路径隔离**：限制可访问的文件路径
3. **工具限制**：禁用不需要的工具
4. **嵌套控制**：防止无限递归（禁用 task tool）

## 8. 扩展和定制

### 8.1 自定义工具

创建 `~/.config/opencode/tools/my-tool.ts`：

```typescript
export default {
  args: {
    input: { type: "string", description: "Input data" }
  },
  description: "My custom tool",
  execute: async (args, ctx) => {
    // ctx.agent 可以访问当前 Agent 配置
    return { output: "Result" }
  }
}
```

### 8.2 插件系统

`src/plugin/` 支持通过 npm 包扩展：

```bash
npm install oh-my-opencode
```

配置使用：

```json
{
  "plugin": ["oh-my-opencode"]
}
```

### 8.3 动态 Agent

通过 `opencode agent create` 交互式创建：

1. 选择位置（全局/项目）
2. 描述 Agent 用途
3. LLM 生成配置
4. 选择可用工具
5. 选择 Agent 模式
6. 写入 Markdown 文件

## 9. 性能优化

### 9.1 缓存策略

- **Agent 状态**：使用 `Instance.state` 缓存
- **权限评估**：缓存已批准的权限
- **工具初始化**：延迟加载和缓存

### 9.2 并发优化

```typescript
// 并行加载多个 Agent
const [agent1, agent2, agent3] = await Promise.all([
  Agent.get("build"),
  Agent.get("plan"),
  Agent.get("explore"),
])
```

### 9.3 资源管理

- **流式响应**：减少内存占用
- **会话压缩**：自动清理历史
- **工具截断**：限制输出长度

## 10. 故障处理

### 10.1 配置错误

- Zod 验证失败 → 显示详细错误信息
- Frontmatter 解析错误 → 抛出 `FrontmatterError`
- 权限冲突 → 后定义的规则优先

### 10.2 运行时错误

- **工具调用失败**：返回错误信息，继续对话
- **权限拒绝**：显示拒绝原因，提供选项
- **Agent 不存在**：提示用户检查配置

## 11. 总结

OpenCode 的 Agent 系统是一个设计精良的多代理协作框架，具有以下特点：

**优势**：
1. 灵活的配置系统（JSON + Markdown）
2. 精细的权限控制
3. 模块化的工具架构
4. 强大的子代理调用机制
5. 良好的扩展性（插件、自定义工具）

**设计亮点**：
- 分层权限管理（默认 + 用户 + Agent 特定）
- 会话层级结构支持子代理嵌套
- 自动化的 Agent 生成
- 多格式配置文件支持
- 实时事件同步（ACP 协议）

**适用场景**：
- 代码审查流程自动化
- 复杂任务分解和执行
- 专业化 AI 助手定制
- 多 Agent 协作工作流

该系统为开发者提供了强大而灵活的 AI 助手管理能力，同时通过权限机制保证了安全性。
