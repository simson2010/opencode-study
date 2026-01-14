# OpenCode LLM Interceptor Plugins

这个目录包含用于拦截和记录 OpenCode 与 LLM 之间所有通信的插件。

## 文件说明

- **simple-llm-interceptor.ts** - 简化版拦截器，直接在终端输出
- **full-llm-interceptor.ts** - 完整版拦截器，将日志保存到文件
- **log-viewer.html** - 可视化日志查看器（需要本地 HTTP 服务器）
- **opencode.json.example** - 配置示例
- **README.md** - 本文件

## 快速开始

### 1. 将插件复制到 opencode 项目

假设你的 opencode 项目在 `/path/to/opencode`：

```bash
cp -r /home/ericpan/opencode_temp/plugins/* /path/to/opencode/
```

### 2. 更新 opencode.json 配置

编辑你的 opencode 配置文件（通常在项目根目录），添加插件：

```json
{
  "plugin": [
    "./plugins/simple-llm-interceptor.ts"
  ]
}
```

或者使用完整版插件（保存到文件）：

```json
{
  "plugin": [
    "./plugins/full-llm-interceptor.ts"
  ]
}
```

### 3. 运行 opencode

```bash
cd /path/to/opencode
bun dev
```

### 4. 查看日志

**简化版插件**：
日志会直接输出到终端

**完整版插件**：
日志保存到 `/tmp/opencode-llm-logs.jsonl`

实时查看：
```bash
tail -f /tmp/opencode-llm-logs.jsonl | jq
```

查看完整 prompt：
```bash
cat /tmp/opencode-llm-logs.jsonl | jq 'select(.data.hook == "experimental.chat.messages.transform")' | jq -r '.data.messages'
```

统计工具调用：
```bash
cat /tmp/opencode-llm-logs.jsonl | jq 'select(.type == "tool")' | jq -r '.data.hook' | sort | uniq -c
```

## 使用可视化查看器

### 1. 启动 HTTP 服务器

```bash
# 使用 Python
python -m http.server 8000

# 或使用 Node.js
npx http-server -p 8000

# 或使用 Bun
bunx http-server -p 8000
```

### 2. 打开浏览器

访问 `http://localhost:8000/log-viewer.html`

### 3. 功能特性

- 实时刷新（每 5 秒）
- 按类型过滤（请求、响应、工具、事件）
- 搜索功能
- 展开/折叠日志条目
- 统计信息面板
- 语法高亮

## 插件功能对比

### SimpleLLMInterceptor

**优点：**
- 直接在终端输出，无需额外工具
- 实时看到所有通信
- 配置简单

**缺点：**
- 日志不持久化
- 无法回溯查看历史
- 输出可能较多

**适用场景：**
- 开发调试
- 快速验证拦截功能

### FullLLMInterceptor

**优点：**
- 日志持久化到文件
- 完整的请求/响应数据
- 支持后续分析
- 包含所有事件流

**缺点：**
- 需要额外的查看工具
- 可能产生大量日志文件

**适用场景：**
- 生产环境监控
- 详细分析 LLM 行为
- 调试复杂问题

## 可拦截的内容

### 1. 请求拦截

**系统提示词** (`experimental.chat.system.transform`)
- 完整的系统提示词内容
- 可以修改或记录

**聊天参数** (`chat.params`)
- temperature, topP, topK
- 模型 ID 和提供商信息
- 其他配置选项

**完整消息** (`experimental.chat.messages.transform`)
- 所有对话历史
- 用户消息
- 助手回复
- 工具调用和结果
- 附件和文件

### 2. 响应拦截

**文本完成** (`experimental.text.complete`)
- LLM 的最终文本响应
- 完整内容
- 长度信息

### 3. 工具拦截

**工具执行前** (`tool.execute.before`)
- 工具名称
- 调用参数
- 可以修改或阻止执行

**工具执行后** (`tool.execute.after`)
- 工具名称
- 执行结果
- 元数据信息

### 4. 事件流

通过 `event` hook 可以拦截实时流事件：

- `text-delta` - 文本增量
- `tool-call` - 工具调用
- `tool-result` - 工具结果
- `step-finish` - 完成信息（tokens, cost, finish reason）

## 日志文件格式

日志以 JSONL 格式存储（每行一个 JSON 对象）：

```json
{"timestamp":1700000000000,"type":"request","sessionID":"...","data":{"hook":"...","...":"..."}}
{"timestamp":1700000000001,"type":"response","sessionID":"...","data":{"text":"...","length":...}}
```

## 分析示例

### 1. 提取所有 prompt

```bash
cat /tmp/opencode-llm-logs.jsonl | \
  jq 'select(.data.hook == "experimental.chat.messages.transform") | .data.messages' > prompts.json
```

### 2. 提取所有响应

```bash
cat /tmp/opencode-llm-logs.jsonl | \
  jq 'select(.type == "response" and .data.hook == "experimental.text.complete") | .data.text' > responses.txt
```

### 3. 统计 token 使用

```bash
cat /tmp/opencode-llm-logs.jsonl | \
  jq 'select(.data.type == "step-finish") | .data.tokens' | \
  jq -s 'map(.input) | add' > total_input_tokens.txt
```

### 4. 查找特定工具调用

```bash
cat /tmp/opencode-llm-logs.jsonl | \
  jq 'select(.data.tool == "bash")'
```

## 自定义插件

创建自定义拦截器：

```typescript
// my-interceptor.ts
import { Plugin } from "@opencode-ai/plugin"

export const MyInterceptorPlugin: Plugin = async (ctx) => {
  return {
    "experimental.chat.messages.transform": async (input, output) => {
      // 自定义逻辑
      console.log("Custom interceptor working!")
    },
  }
}
```

在 `opencode.json` 中添加：

```json
{
  "plugin": [
    "./my-interceptor.ts"
  ]
}
```

## 故障排查

### 1. 插件未加载

检查 opencode.json 配置路径是否正确：

```bash
cat opencode.json | jq .plugin
```

### 2. 日志文件不存在

确保插件已加载，查看 opencode 启动日志：

```bash
bun dev 2>&1 | grep -i plugin
```

### 3. 查看器无法加载日志

检查日志文件权限：

```bash
ls -la /tmp/opencode-llm-logs.jsonl
```

如果不存在，检查插件是否正常工作。

### 4. 日志文件过大

可以定期清理或轮转日志：

```bash
# 只保留最近 1000 条
tail -n 1000 /tmp/opencode-llm-logs.jsonl > /tmp/opencode-llm-logs.jsonl.tmp
mv /tmp/opencode-llm-logs.jsonl.tmp /tmp/opencode-llm-logs.jsonl
```

或修改插件添加日志轮转功能。

## 性能考虑

- 完整拦截器会记录所有数据，可能产生大量 I/O
- 在生产环境中，考虑：
  - 只记录必要的信息
  - 实现日志轮转
  - 使用异步写入
  - 添加采样率控制

## 许可证

这些插件示例遵循与 OpenCode 相同的许可证。

## 支持

如有问题，请参考：
- OpenCode 文档
- [prompt-hook_by_GLM.md](../ana-opencode/prompt-hook_by_GLM.md) - 详细的技术分析
