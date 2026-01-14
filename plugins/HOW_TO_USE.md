# 如何在真实运行的 OpenCode 中配置 LLM 拦截器插件

根据 OpenCode 源码分析，**不需要编译**插件。Bun 运行时可以直接加载 TypeScript 文件。

## 方法 1：自动加载（推荐）

OpenCode 会自动扫描以下目录中的插件：

### 插件自动加载规则

从 `packages/opencode/src/config/config.ts:317` 可以看到：

```typescript
const PLUGIN_GLOB = new Bun.Glob("{plugin,plugins}/*.{ts,js}")
```

**自动加载路径**（按优先级从高到低）：

1. **项目目录** - 当前工作目录
   - `.opencode/plugin/*.ts`
   - `.opencode/plugins/*.ts`
   - `plugin/*.ts`
   - `plugins/*.ts`

2. **全局配置目录**
   - `~/.opencode/plugin/*.ts`
   - `~/.opencode/plugins/*.ts`

### 步骤

假设你的 OpenCode 项目在 `/path/to/your-project`：

#### 1. 复制插件到项目的 plugins 目录

```bash
cd /path/to/your-project
mkdir -p plugins
cp /home/ericpan/opencode_temp/plugins/simple-llm-interceptor.ts ./plugins/
cp /home/ericpan/opencode_temp/plugins/full-llm-interceptor.ts ./plugins/
```

#### 2. （可选）创建 package.json

如果插件需要额外依赖，可以创建 `plugins/package.json`：

```json
{
  "name": "opencode-llm-interceptors",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "@opencode-ai/plugin": "latest"
  }
}
```

#### 3. 安装依赖（如果有 package.json）

```bash
bun install
```

#### 4. 运行 OpenCode

```bash
bun dev .
```

**不需要修改任何配置文件！** OpenCode 会自动发现 `plugins/` 目录中的插件。

## 方法 2：通过 opencode.json 配置

如果你不想使用自动加载，可以在配置文件中显式指定插件。

### 步骤

#### 1. 将插件放在任意位置

```bash
# 在项目根目录创建 plugins 目录
mkdir -p /path/to/your-project/plugins
cp /home/ericpan/opencode_temp/plugins/simple-llm-interceptor.ts ./plugins/
```

#### 2. 创建或编辑 opencode.json

在项目根目录创建 `opencode.json`：

```json
{
  "plugin": [
    "./plugins/simple-llm-interceptor.ts"
  ]
}
```

#### 3. 运行 OpenCode

```bash
bun dev .
```

## 方法 3：全局插件（所有项目共用）

### 步骤

#### 1. 将插件复制到全局目录

```bash
mkdir -p ~/.opencode/plugins
cp /home/ericpan/opencode_temp/plugins/simple-llm-interceptor.ts ~/.opencode/plugins/
```

#### 2. （可选）创建全局 package.json

```bash
cat > ~/.opencode/package.json << 'EOF'
{
  "name": "opencode-global-plugins",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "@opencode-ai/plugin": "latest"
  }
}
EOF
```

#### 3. 安装依赖

```bash
cd ~/.opencode
bun install
```

#### 4. 运行任何 OpenCode 项目

插件会自动在所有项目中生效：

```bash
bun dev /path/to/any/project
```

## 快速测试

### 最简单的方法（无需编译，无需配置）

```bash
# 进入你的项目目录
cd /path/to/your-project

# 创建 plugins 目录
mkdir -p plugins

# 复制简化版插件（会直接在终端输出）
cp /home/ericpan/opencode_temp/plugins/simple-llm-interceptor.ts plugins/

# 运行 opencode
bun dev .
```

然后在 opencode 中发送一条消息，你会在终端看到类似这样的输出：

```
=== SYSTEM PROMPT ===
You are opencode, an interactive CLI tool...
===================

=== FULL PROMPT ===
Messages: 2

[user]
请帮我写一个 Python 函数

[assistant]
好的，我来帮你写...

==================

=== LLM RESPONSE ===
当然！这是一个简单的 Python 函数示例...
===================

[TOOL CALL] bash: {"command":"python -m pytest test_myfunc.py"}

[TOOL RESULT] bash: ...passed...
```

## 查看完整日志（使用 full-llm-interceptor）

### 1. 使用完整版插件

```bash
cp /home/ericpan/opencode_temp/plugins/full-llm-interceptor.ts plugins/
```

### 2. 运行 opencode

```bash
bun dev .
```

### 3. 实时查看日志

打开新的终端窗口：

```bash
# 安装 jq（如果还没有）
sudo apt install jq

# 实时查看日志（带语法高亮）
tail -f /tmp/opencode-llm-logs.jsonl | jq

# 只看 prompt
tail -f /tmp/opencode-llm-logs.jsonl | jq 'select(.data.hook == "experimental.chat.messages.transform")'

# 只看响应
tail -f /tmp/opencode-llm-logs.jsonl | jq 'select(.type == "response")'

# 只看工具调用
tail -f /tmp/opencode-llm-logs.jsonl | jq 'select(.type == "tool")'
```

### 4. 使用可视化查看器

```bash
# 复制查看器到项目根目录
cp /home/ericpan/opencode_temp/plugins/log-viewer.html .

# 启动 HTTP 服务器
python -m http.server 8000

# 打开浏览器访问
# http://localhost:8000/log-viewer.html
```

## 常见问题

### Q1: 插件没有加载？

**检查插件是否在正确的目录：**

```bash
# 应该在以下任一位置：
# 1. ./plugins/*.ts
# 2. ./plugin/*.ts
# 3. ./.opencode/plugins/*.ts
# 4. ./.opencode/plugin/*.ts
# 5. ~/.opencode/plugins/*.ts
# 6. ~/.opencode/plugin/*.ts

ls -la plugins/
```

**查看 OpenCode 启动日志：**

```bash
bun dev . 2>&1 | grep -i plugin
```

应该能看到类似：

```
[plugin] loading internal plugin { name: 'CodexAuthPlugin' }
[plugin] loading plugin { path: 'file:///.../plugins/simple-llm-interceptor.ts' }
```

### Q2: 报错 "Cannot find module '@opencode-ai/plugin'"

**解决方法：** 在插件所在目录创建 `package.json` 并安装依赖：

```bash
cd plugins  # 或 .opencode
cat > package.json << 'EOF'
{
  "name": "local-plugins",
  "private": true,
  "dependencies": {
    "@opencode-ai/plugin": "latest"
  }
}
EOF

bun install
```

OpenCode 也会自动安装 `@opencode-ai/plugin`（见 `config.ts:201`），但如果遇到问题，手动安装可以解决。

### Q3: 如何禁用插件？

**方法 1：删除插件文件**

```bash
rm plugins/simple-llm-interceptor.ts
```

**方法 2：修改 opencode.json**

```json
{
  "plugin": []
}
```

**方法 3：移动到其他目录**

```bash
mv plugins/simple-llm-interceptor.ts ~/backup/
```

### Q4: 插件会影响性能吗？

是的，完整版插件会记录所有数据，可能会产生大量 I/O。

**优化建议：**

1. **开发时使用简化版插件** (`simple-llm-interceptor.ts`)
   - 只在终端输出，不写文件

2. **生产环境按需启用完整版插件**
   - 只在需要调试时启用

3. **自定义插件减少记录**

创建自己的插件，只记录需要的信息：

```typescript
// custom-interceptor.ts
import { Plugin } from "@opencode-ai/plugin"

export const CustomInterceptorPlugin: Plugin = async (ctx) => {
  return {
    "experimental.chat.messages.transform": async (input, output) => {
      // 只记录消息数量，不记录完整内容
      console.log(`[CUSTOM] Messages: ${output.messages.length}`)
    },
  }
}
```

### Q5: TypeScript 类型错误？

Bun 运行时会自动处理 TypeScript，但如果你遇到类型问题，可以：

1. **忽略类型错误**（运行时不受影响）
2. **添加类型导入**：

```typescript
import { Plugin } from "@opencode-ai/plugin"
import type { Hooks } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async (ctx) => {
  const hooks: Hooks = {
    // ...
  }
  return hooks
}
```

## 验证插件是否工作

### 1. 检查终端输出

使用 `simple-llm-interceptor.ts` 时，发送一条消息后应该看到：

```
=== SYSTEM PROMPT ===
...（系统提示词内容）
===================

=== FULL PROMPT ===
Messages: X
...（对话历史）
==================
```

### 2. 检查日志文件

使用 `full-llm-interceptor.ts` 时：

```bash
# 检查文件是否存在
ls -la /tmp/opencode-llm-logs.jsonl

# 查看最新几行
tail -20 /tmp/opencode-llm-logs.jsonl | jq
```

### 3. 使用可视化查看器

访问 `http://localhost:8000/log-viewer.html`，应该能看到实时更新的日志。

## 总结

**推荐配置（最简单）：**

```bash
cd /path/to/your-project
mkdir -p plugins
cp /home/ericpan/opencode_temp/plugins/simple-llm-interceptor.ts plugins/
bun dev .
```

**无需编译！** OpenCode 会自动加载 `plugins/` 目录中的 `.ts` 文件。

如果需要持久化日志和可视化查看器，使用 `full-llm-interceptor.ts` 并参考上面的"查看完整日志"部分。
