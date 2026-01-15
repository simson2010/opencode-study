# OpenCode LLM 交互拦截分析

## 目录
1. [LLM 请求/响应流程](#llm-请求响应流程)
2. [数据结构](#数据结构)
3. [插件系统](#插件系统)
4. [拦截方案](#拦截方案)
5. [完整示例](#完整示例)

---

## LLM 请求/响应流程

### 核心文件

**主要 LLM 流式处理函数：**
- `packages/opencode/src/session/llm.ts`
  - `LLM.stream()` (46-227 行) - LLM 请求的入口点
  - 使用 `ai` SDK 的 `streamText` 函数

**请求流程：**
```
用户/API 请求 → Server → SessionPrompt.prompt() → SessionProcessor.process() → LLM.stream() → AI SDK Provider
```

**服务器端点：**
- `packages/opencode/src/server/server.ts`
  - 1411-1450 行：`POST /session/:sessionID/message` 端点
  - 调用 `SessionPrompt.prompt()` 处理用户消息

**会话处理：**
- `packages/opencode/src/session/prompt.ts`
  - `SessionPrompt.prompt()` (150-179 行) - 创建用户消息并启动循环
  - `SessionPrompt.loop()` (257-633 行) - 主处理循环
  - 592 行：调用 `processor.process()` 处理消息和工具
- `packages/opencode/src/session/processor.ts`
  - `SessionProcessor.process()` (45-402 行) - 处理 LLM 流
  - 53 行：调用 `LLM.stream(streamInput)` 发起请求

---

## 数据结构

### StreamInput 结构 (`session/llm.ts` 31-42 行)

```typescript
type StreamInput = {
  user: MessageV2.User        // 用户消息及元数据
  sessionID: string           // 会话标识符
  model: Provider.Model        // 模型配置
  agent: Agent.Info          // Agent 配置
  system: string[]           // 系统提示词
  abort: AbortSignal         // 取消信号
  messages: ModelMessage[]    // 对话历史（来自 AI SDK）
  small?: boolean           // 使用小模型变体
  tools: Record<string, Tool> // 可用工具
  retries?: number         // 重试次数
}
```

### 用户消息 (`session/message-v2.ts` 298-321 行)

```typescript
type User = {
  id: string
  sessionID: string
  role: "user"
  time: { created: number }
  summary?: { title?, body?, diffs? }
  agent: string              // Agent 名称
  model: { providerID, modelID }
  system?: string           // 自定义系统提示词
  tools?: Record<string, boolean> // 工具可用性
  variant?: string         // 模型变体
}
```

### 助手消息 (`session/message-v2.ts` 343-385 行)

```typescript
type Assistant = {
  id: string
  sessionID: string
  role: "assistant"
  time: { created: number, completed?: number }
  error?: APIError | AuthError | ...  // 失败时的错误信息
  parentID: string          // 父用户消息 ID
  modelID: string
  providerID: string
  mode: string
  agent: string
  path: { cwd: string, root: string }
  summary?: boolean
  cost: number
  tokens: {
    input: number
    output: number
    reasoning: number
    cache: { read: number, write: number }
  }
  finish?: string          // 完成原因
}
```

### 模型消息 (来自 AI SDK)

通过 `MessageV2.toModelMessage()` 转换 (429-552 行)：

```typescript
type ModelMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content: string | Array<{
    type: "text" | "file" | "tool-result" | "tool-call" | "reasoning" | ...
    text?: string
    image?: { url: string }
    toolCallId?: string
    input?: Record<string, any>
    output?: string
    ...
  }>
  providerOptions?: Record<string, any>
}
```

### 工具定义 (`tool/tool.ts` 26-42 行)

```typescript
type Tool = {
  id: string
  description: string
  parameters: z.ZodType  // JSON Schema
  execute(args, context): Promise<{
    title: string
    metadata: Record<string, any>
    output: string
    attachments?: FilePart[]
  }>
}
```

---

## 插件系统

### 插件系统位置

**文件：** `packages/opencode/src/plugin/index.ts`

### 插件接口 (`packages/plugin/src/index.ts`)

```typescript
type Plugin = (input: PluginInput) => Promise<Hooks>

type PluginInput = {
  client: OpencodeClient      // 用于 API 调用的 SDK 客户端
  project: Project
  directory: string
  worktree: string
  serverUrl: URL
  $: BunShell               // Shell 执行
}

interface Hooks {
  // 事件订阅
  event?: (input: { event: Event }) => Promise<void>
  
  // 配置修改
  config?: (input: Config) => Promise<void>
  
  // 工具注册
  tool?: { [key: string]: ToolDefinition }
  
  // 提供商认证
  auth?: AuthHook
  
  // ===== LLM 相关 Hooks =====
  
  // 接收到新消息时调用
  "chat.message"?: (
    input: { sessionID, agent?, model?, messageID?, variant? },
    output: { message: UserMessage; parts: Part[] }
  ) => Promise<void>
  
  // 修改发送给 LLM 的参数
  "chat.params"?: (
    input: { sessionID, agent, model, provider, message },
    output: { temperature, topP, topK, options }
  ) => Promise<void>
  
  // 转换系统提示词
  "experimental.chat.system.transform"?: (
    input: { sessionID },
    output: { system: string[] }
  ) => Promise<void>
  
  // 在发送给 LLM 之前转换消息
  "experimental.chat.messages.transform"?: (
    input: {},
    output: { messages: { info: Message, parts: Part[] }[] }
  ) => Promise<void>
  
  // 修改完成的文本输出
  "experimental.text.complete"?: (
    input: { sessionID, messageID, partID },
    output: { text: string }
  ) => Promise<void>
  
  // 会话压缩 hooks
  "experimental.session.compacting"?: (
    input: { sessionID },
    output: { context: string[], prompt?: string }
  ) => Promise<void>
  
  // 工具执行 hooks
  "tool.execute.before"?: (input: { tool, sessionID, callID }, output: { args }) => Promise<void>
  "tool.execute.after"?: (input: { tool, sessionID, callID }, output: { title, output, metadata }) => Promise<void>
  
  // 权限 hooks
  "permission.ask"?: (input: Permission, output: { status: "ask" | "deny" | "allow" }) => Promise<void>
}
```

### 插件触发点

**1. 系统提示词转换** (`session/llm.ts` 83 行)
```typescript
await Plugin.trigger("experimental.chat.system.transform", { sessionID }, { system })
```

**2. 聊天参数** (`session/llm.ts` 110-127 行)
```typescript
const params = await Plugin.trigger(
  "chat.params",
  { sessionID, agent, model, provider, message },
  { temperature, topP, topK, options }
)
```

**3. 消息转换** (`session/prompt.ts` 590 行)
```typescript
await Plugin.trigger("experimental.chat.messages.transform", {}, { messages: sessionMessages })
```

**4. 文本完成** (`session/processor.ts` 308-316 行)
```typescript
const textOutput = await Plugin.trigger(
  "experimental.text.complete",
  { sessionID, messageID, partID },
  { text: currentText.text }
)
```

**5. 工具执行** (`session/prompt.ts` 695-715 行)
```typescript
await Plugin.trigger("tool.execute.before", { tool, sessionID, callID }, { args })
// ... 执行工具 ...
await Plugin.trigger("tool.execute.after", { tool, sessionID, callID }, result)
```

### 插件加载 (`src/plugin/index.ts` 26-98 行)

- 加载内置插件（CodexAuthPlugin）
- 从配置加载（`config.plugin` 数组）
- 通过 `BunProc.install()` 从 npm 包加载
- 从本地 `tool/` 或 `tools/` 目录加载

---

## 拦截方案

### 方案 1：插件系统（推荐，非侵入式）

使用现有的 hook 创建自定义插件：

```typescript
// llm-interceptor-plugin.ts
import { Plugin } from "@opencode-ai/plugin"

export const LLMInterceptorPlugin: Plugin = async (ctx) => {
  return {
    // 拦截发送前的系统提示词
    "experimental.chat.system.transform": async (input, output) => {
      console.log("[LLM-HOOK] 系统提示词:", output.system)
      // 可以记录或修改
      // output.system.push("\n\n额外指令：...")
    },
    
    // 拦截聊天参数
    "chat.params": async (input, output) => {
      console.log("[LLM-HOOK] 聊天参数:", {
        temperature: output.temperature,
        topP: output.topP,
        model: input.model.id,
        provider: input.provider.info.id,
      })
    },
    
    // 拦截发送给 LLM 之前的消息
    "experimental.chat.messages.transform": async (input, output) => {
      console.log("[LLM-HOOK] 消息数量:", output.messages.length)
      for (const msg of output.messages) {
        console.log("[LLM-HOOK] 消息:", {
          role: msg.info.role,
          parts: msg.parts.length,
          content: msg.parts.map(p => p.type).join(", ")
        })
      }
      
      // 可以在这里记录完整的 prompt
      const fullPrompt = output.messages.map(m => ({
        role: m.info.role,
        content: m.parts.map(p => ({
          type: p.type,
          text: p.text || "",
          input: p.input || {},
          output: p.output || ""
        }))
      }))
      
      console.log("[LLM-HOOK] 完整 Prompt:", JSON.stringify(fullPrompt, null, 2))
    },
    
    // 拦截文本响应
    "experimental.text.complete": async (input, output) => {
      console.log("[LLM-HOOK] 文本完成:", output.text.length, "字符")
      console.log("[LLM-HOOK] 文本内容:", output.text)
      // 可以记录或修改文本
    },
    
    // 拦截工具执行
    "tool.execute.before": async (input, output) => {
      console.log("[LLM-HOOK] 工具调用:", input.tool, JSON.stringify(output.args, null, 2))
    },
    "tool.execute.after": async (input, output) => {
      console.log("[LLM-HOOK] 工具结果:", input.tool, output.output)
    },
    
    // 订阅所有事件（用于实时追踪）
    event: async ({ event }) => {
      // 可以通过 event.type 过滤感兴趣的事件
      if (event.type === "session.idle") {
        console.log("[LLM-HOOK] 会话空闲:", event.properties.sessionID)
      }
    },
  }
}
```

通过配置加载（`opencode.json`）：
```json
{
  "plugin": ["./llm-interceptor-plugin.ts"]
}
```

**优点：**
- 无需修改源代码
- 可通过配置热加载
- 可以动态启用/禁用
- 访问完整的请求/响应生命周期
- 与未来的 opencode 更新兼容

**可拦截的内容：**
- 系统提示词
- 聊天参数（temperature, topP, topK）
- 所有消息（用户、助手、工具）
- 工具调用和结果
- 流式文本增量（通过 Monkey Patch AI SDK）
- 最终文本输出
- 使用情况/成本信息
- 系统事件（如 session.idle, message.updated 等）

### 方案 2：自定义 Provider（用于请求级拦截）

创建一个包装 fetch 的自定义 provider：

```typescript
// 在 opencode.json 中配置
{
  "provider": {
    "my-interceptor-provider": {
      "source": "custom",
      "env": [],
      "options": {
        "apiKey": "your-api-key",
        "fetch": async (input, init) => {
          console.log("[LLM-HOOK] LLM 请求:", {
            url: input,
            method: init?.method,
            headers: init?.headers,
          })
          
          const response = await fetch(input, init)
          
          // 克隆响应以读取 body（因为流只能读取一次）
          const clonedResponse = response.clone()
          
          try {
            const body = await clonedResponse.text()
            console.log("[LLM-HOOK] LLM 响应状态:", response.status)
            console.log("[LLM-HOOK] LLM 响应 body (前 1000 字符):", body.substring(0, 1000))
          } catch (e) {
            console.log("[LLM-HOOK] 无法读取响应 body:", e.message)
          }
          
          return response
        }
      },
      "models": {
        "claude-3.5-sonnet": {
          "id": "claude-3.5-sonnet",
          "providerID": "my-interceptor-provider",
          "api": {
            "id": "anthropic",
            "url": "https://api.anthropic.com/v1/messages",
            "npm": "@ai-sdk/anthropic"
          },
          "name": "Claude 3.5 Sonnet",
          "cost": { "input": 0.000003, "output": 0.000015 }
        }
      }
    }
  },
  "model": "claude-3.5-sonnet"
}
```

**优点：**
- 拦截实际的 HTTP 请求
- 可以访问原始请求/响应
- 不依赖插件系统

**缺点：**
- 需要配置完整的 provider
- 无法访问高级抽象层的数据
- 需要正确实现 provider 协议

### 方案 3：Monkey Patch `streamText`（高级）

包装 AI SDK 导入（在 `src/session/llm.ts` 6 行）：

```typescript
// 在自定义插件或 preload 中
import { streamText as originalStreamText } from "ai"

export function streamText(...args: any[]) {
  const [config, ...rest] = args
  
  console.log("[LLM-HOOK] streamText 调用:", {
    messages: config.messages?.length,
    model: config.model,
    tools: Object.keys(config.tools || {}),
    temperature: config.temperature,
    topP: config.topP,
  })
  
  // 记录完整的消息
  if (config.messages) {
    console.log("[LLM-HOOK] 完整消息列表:", JSON.stringify(config.messages, null, 2))
  }
  
  const result = originalStreamText(config, ...rest)
  
  // 拦截流（这是 AI SDK 的流类型，不是 OpenCode 事件）
  const fullStream = result.fullStream
  result.fullStream = (async function* () {
    for await (const chunk of fullStream) {
      console.log("[LLM-HOOK] 流块:", chunk.type)

      if (chunk.type === "text-delta") {
        console.log("[LLM-HOOK] 文本增量:", chunk.textDelta)
      } else if (chunk.type === "tool-call") {
        console.log("[LLM-HOOK] 工具调用:", chunk.toolName, chunk.args)
      } else if (chunk.type === "tool-result") {
        console.log("[LLM-HOOK] 工具结果:", chunk.toolCallId, chunk.result)
      } else if (chunk.type === "finish") {
        console.log("[LLM-HOOK] 完成:", chunk.usage, chunk.finishReason)
      }

      yield chunk
    }
  })()
  
  return result
}

// 替换全局导出
globalThis.streamText = streamText
```

**优点：**
- 最底层的拦截
- 访问所有数据

**缺点：**
- 侵入性强（需要加载顺序控制）
- 可能与其他插件冲突
- 不推荐用于生产环境

### OpenCode 事件类型说明

通过插件系统的 `event` hook 可以订阅以下系统事件：

| 事件类型 | 说明 | 属性 |
|---------|------|-----|
| `session.created` | 会话创建 | `info` |
| `session.updated` | 会话更新 | `info` |
| `session.deleted` | 会话删除 | `info` |
| `session.status` | 会话状态变化 | `sessionID`, `status` |
| `session.idle` | 会话空闲（已弃用） | `sessionID` |
| `session.error` | 会话错误 | `sessionID`, `error` |
| `session.compacted` | 会话压缩 | `sessionID` |
| `message.updated` | 消息更新 | `info` |
| `message.removed` | 消息删除 | `sessionID`, `messageID` |
| `message.part.updated` | 消息部分更新 | `part`, `delta` |
| `message.part.removed` | 消息部分删除 | `sessionID`, `messageID`, `partID` |
| `permission.asked` | 权限请求 | 请求详情 |
| `permission.replied` | 权限回复 | 回复详情 |
| `file.edited` | 文件编辑 | 文件详情 |
| `tool.execute.before` | 工具执行前 | 在独立的 hook 中处理 |
| `tool.execute.after` | 工具执行后 | 在独立的 hook 中处理 |

**注意：**
- `text-delta`、`tool-call`、`tool-result`、`step-finish` 等 **不是 OpenCode 事件**，这些是 AI SDK (`ai` 包) 的流类型，只能通过 Monkey Patch `streamText` 来捕获
- OpenCode 事件结构为 `{ type: string, properties: any }`
- 订阅事件的 hook 签名为：`event?: (input: { event: Event }) => Promise<void>`

---

## 完整示例

### 拦截所有 LLM 交互的完整插件

```typescript
// full-llm-interceptor.ts
import { Plugin } from "@opencode-ai/plugin"

interface InterceptionLog {
  timestamp: number
  type: "request" | "response" | "tool" | "event"
  sessionID?: string
  data: any
}

class LLMInterceptor {
  private logs: InterceptionLog[] = []
  private logFile: string
  
  constructor(logFile: string = "/tmp/opencode-llm-logs.jsonl") {
    this.logFile = logFile
    this.initLogFile()
  }
  
  private async initLogFile() {
    // 清空日志文件
    await Bun.write(this.logFile, "")
  }
  
  private async log(type: InterceptionLog["type"], data: any, sessionID?: string) {
    const entry: InterceptionLog = {
      timestamp: Date.now(),
      type,
      sessionID,
      data,
    }
    
    this.logs.push(entry)
    
    // 追加到文件
    await Bun.write(this.logFile, JSON.stringify(entry) + "\n", { createPath: true })
    
    console.log(`[LLM-INTERCEPTOR] ${type.toUpperCase()}:`, JSON.stringify(data).substring(0, 200))
  }
  
  public getLogs() {
    return this.logs
  }
}

export const FullLLMInterceptorPlugin: Plugin = async (ctx) => {
  const interceptor = new LLMInterceptor()
  
  return {
    // 系统提示词转换
    "experimental.chat.system.transform": async (input, output) => {
      await interceptor.log("request", {
        hook: "experimental.chat.system.transform",
        system: output.system,
      }, input.sessionID)
    },
    
    // 聊天参数
    "chat.params": async (input, output) => {
      await interceptor.log("request", {
        hook: "chat.params",
        temperature: output.temperature,
        topP: output.topP,
        topK: output.topK,
        options: output.options,
        model: input.model.id,
        provider: input.provider.info.id,
      }, input.sessionID)
    },
    
    // 消息转换（完整 prompt）
    "experimental.chat.messages.transform": async (input, output) => {
      const messages = output.messages.map(m => ({
        role: m.info.role,
        parts: m.parts.map(p => ({
          type: p.type,
          text: p.text || p.output || p.input || undefined,
          timestamp: p.time,
        })),
      }))
      
      await interceptor.log("request", {
        hook: "experimental.chat.messages.transform",
        messageCount: messages.length,
        messages: messages,
      })
    },
    
    // 文本完成
    "experimental.text.complete": async (input, output) => {
      await interceptor.log("response", {
        hook: "experimental.text.complete",
        text: output.text,
        length: output.text.length,
      }, input.sessionID)
    },
    
    // 工具执行前
    "tool.execute.before": async (input, output) => {
      await interceptor.log("tool", {
        hook: "tool.execute.before",
        tool: input.tool,
        args: output.args,
        callID: input.callID,
      }, input.sessionID)
    },
    
    // 工具执行后
    "tool.execute.after": async (input, output) => {
      await interceptor.log("tool", {
        hook: "tool.execute.after",
        tool: input.tool,
        result: {
          title: output.title,
          output: output.output,
          metadata: output.metadata,
        },
        callID: input.callID,
      }, input.sessionID)
    },
    
    // 事件订阅（实时追踪）
    event: async ({ event }) => {
      const payload = event.properties

      // 可以通过 event.type 过滤感兴趣的事件
      if (event.type === "message.updated") {
        await interceptor.log("event", {
          type: "message.updated",
          info: payload.info,
        })
      } else if (event.type === "session.idle") {
        await interceptor.log("event", {
          type: "session.idle",
          sessionID: payload.sessionID,
        })
      }
    },
  }
}
```

### 使用方法

1. **创建插件文件：**
   ```bash
   # 在 opencode 项目根目录
   mkdir -p plugins
   touch plugins/full-llm-interceptor.ts
   ```

2. **将上面的代码复制到 `plugins/full-llm-interceptor.ts`**

3. **更新配置文件 `opencode.json`：**
   ```json
   {
     "plugin": ["./plugins/full-llm-interceptor.ts"]
   }
   ```

4. **运行 opencode：**
   ```bash
   bun dev
   ```

5. **查看日志：**
   ```bash
   # 实时查看日志
   tail -f /tmp/opencode-llm-logs.jsonl | jq
   
   # 查看特定类型的日志
   cat /tmp/opencode-llm-logs.jsonl | jq 'select(.type == "request")'
   
   # 查看完整的 prompt
   cat /tmp/opencode-llm-logs.jsonl | jq 'select(.data.hook == "experimental.chat.messages.transform") | .data.messages'
   
   # 统计工具调用
   cat /tmp/opencode-llm-logs.jsonl | jq 'select(.type == "tool")' | jq -r '.data.hook' | sort | uniq -c
   ```

6. **可视化日志（可选）：**
   
   创建一个简单的 HTML 查看器：
   ```html
   <!-- log-viewer.html -->
   <!DOCTYPE html>
   <html>
   <head>
     <title>OpenCode LLM Logs</title>
     <script src="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.js"></script>
     <style>
       body { font-family: monospace; padding: 20px; }
       .log-entry { margin: 10px 0; padding: 10px; border: 1px solid #ccc; }
       .request { background: #e8f5e9; }
       .response { background: #e3f2fd; }
       .tool { background: #fff3e0; }
       .event { background: #f3e5f5; }
       pre { white-space: pre-wrap; word-wrap: break-word; }
     </style>
   </head>
   <body>
     <div id="app">
       <h1>OpenCode LLM Logs</h1>
       <button @click="loadLogs">Reload</button>
       <button @click="filterType = ''">All</button>
       <button @click="filterType = 'request'">Requests</button>
       <button @click="filterType = 'response'">Responses</button>
       <button @click="filterType = 'tool'">Tools</button>
       <button @click="filterType = 'event'">Events</button>
       
       <div v-for="(log, index) in filteredLogs" :key="index" 
            class="log-entry" :class="log.type">
         <strong>{{ new Date(log.timestamp).toLocaleString() }}</strong> - 
         {{ log.type.toUpperCase() }}
         <span v-if="log.sessionID">[{{ log.sessionID }}]</span>
         <pre>{{ JSON.stringify(log.data, null, 2) }}</pre>
       </div>
     </div>
     
     <script>
       const { createApp, ref, computed } = Vue
       
       createApp({
         setup() {
           const logs = ref([])
           const filterType = ref('')
           
           const loadLogs = async () => {
             const response = await fetch('/tmp/opencode-llm-logs.jsonl')
             const text = await response.text()
             logs.value = text.split('\n')
               .filter(line => line.trim())
               .map(line => JSON.parse(line))
           }
           
           const filteredLogs = computed(() => {
             if (!filterType.value) return logs.value
             return logs.value.filter(log => log.type === filterType.value)
           })
           
           loadLogs()
           setInterval(loadLogs, 5000) // 自动刷新
           
           return { logs, filteredLogs, filterType, loadLogs }
         }
       }).mount('#app')
     </script>
   </body>
   </html>
   ```

   使用简单的 HTTP 服务器打开：
   ```bash
   python -m http.server 8000
   # 访问 http://localhost:8000/log-viewer.html
   ```

---

## 关键文件总结

| 文件 | 用途 | 拦截点 |
|------|------|--------|
| `src/session/llm.ts` | 主要 LLM 流式处理函数 | `LLM.stream()` 入口点 |
| `src/session/prompt.ts` | 会话处理循环 | `loop()`, 消息转换 |
| `src/session/processor.ts` | 流事件处理 | 所有 `case value.type` 处理器 |
| `src/provider/provider.ts` | Provider 初始化和 SDK 加载 | `getSDK()` 自定义 fetch 包装器 |
| `src/plugin/index.ts` | 插件系统 | 所有插件触发点 |
| `src/session/message-v2.ts` | 消息模式 | `toModelMessage()` 转换 |

---

## 推荐架构：多层插件系统

```typescript
class LLMInterceptorPlugin {
  // 第 1 层：请求组装前
  "chat.params": interceptParams
  
  // 第 2 层：系统提示词前
  "experimental.chat.system.transform": interceptSystem
  
  // 第 3 层：消息转换前
  "experimental.chat.messages.transform": interceptMessages
  
  // 第 4 层：流式传输期间（通过事件总线）
  event: interceptEvents
  
  // 第 5 层：响应后
  "experimental.text.complete": interceptText
}
```

**优势：**
- 无源代码修改
- 通过配置热加载
- 可动态启用/禁用
- 访问完整的请求/响应生命周期
- 与未来的 opencode 更新兼容

**可拦截的内容：**
- ✅ 系统提示词
- ✅ 聊天参数（temperature, topP, topK）
- ✅ 所有消息（用户、助手、工具）
- ✅ 工具调用和结果
- ✅ 流式文本增量（通过 Monkey Patch AI SDK）
- ✅ 最终文本输出
- ✅ 使用情况/成本信息
- ✅ 系统事件（如 session.idle, message.updated 等）

---

## 总结

OpenCode 提供了一个设计良好的插件系统，提供了多个非侵入式的 hook 用于拦截 LLM 通信。最推荐的方案是使用插件系统的以下 hook：

1. **`experimental.chat.messages.transform`** - 拦截发送给 LLM 的完整 prompt
2. **`experimental.text.complete`** - 拦截 LLM 的最终文本响应
3. **`tool.execute.before` / `tool.execute.after`** - 拦截工具调用
4. **`event`** - 通过事件总线拦截系统事件

这种方法无需修改源代码，可配置，可热加载，并与未来的更新兼容。

**快速开始：**
1. 创建 `plugins/llm-interceptor.ts` 文件
2. 实现上述 hook
3. 在 `opencode.json` 中配置 `"plugin": ["./plugins/llm-interceptor.ts"]`
4. 运行 `bun dev`

日志将保存到 `/tmp/opencode-llm-logs.jsonl`，可以用 `jq` 或自定义查看器分析。
