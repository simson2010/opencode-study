# 快速开始 - OpenCode LLM 拦截器

## 一行命令安装到你的项目

```bash
bash /home/ericpan/opencode_temp/plugins/install.sh /path/to/your/opencode/project
```

## 手动安装（3 步）

```bash
# 1. 复制插件到你的项目
cd /path/to/your/opencode/project
mkdir -p plugins
cp /home/ericpan/opencode_temp/plugins/simple-llm-interceptor.ts plugins/

# 2. 运行 OpenCode（插件自动加载）
bun dev .

# 3. 发送消息，在终端查看所有 LLM 通信
```

## 两个版本

### simple-llm-interceptor.ts（推荐开始使用）
- ✅ 直接在终端输出
- ✅ 无需配置
- ✅ 无额外文件
- ⚠️ 不保存日志

### full-llm-interceptor.ts（用于详细分析）
- ✅ 保存所有日志到 `/tmp/opencode-llm-logs.jsonl`
- ✅ 包含完整请求/响应数据
- ✅ 可用于后续分析
- ⚠️ 产生大量 I/O

## 切换到完整版

```bash
# 编辑项目的 opencode.json
cat > opencode.json << 'EOF'
{
  "plugin": ["./plugins/full-llm-interceptor.ts"]
}
EOF

# 重启 OpenCode
bun dev .

# 实时查看日志
tail -f /tmp/opencode-llm-logs.jsonl | jq
```

## 查看可视化界面

```bash
# 复制查看器
cp /home/ericpan/opencode_temp/plugins/log-viewer.html .

# 启动 HTTP 服务器
python -m http.server 8000

# 打开浏览器访问
# http://localhost:8000/log-viewer.html
```

## 关键信息

**无需编译！** Bun 运行时直接支持 TypeScript。

插件会自动从以下目录加载：
- `./plugins/*.ts`（项目目录）
- `~/.opencode/plugins/*.ts`（全局）

## 文档

- `HOW_TO_USE.md` - 详细使用指南和故障排查
- `README.md` - 完整文档
- `install.sh` - 自动安装脚本

## 验证是否工作

运行 OpenCode 后发送一条消息，你应该看到：

```
=== SYSTEM PROMPT ===
You are opencode, an interactive CLI tool...
===================

=== FULL PROMPT ===
Messages: X
...
==================
```

如果看到上述输出，插件已成功运行！
