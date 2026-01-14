#!/bin/bash

# OpenCode LLM Interceptor 快速安装脚本
# 用法: ./install.sh /path/to/opencode/project

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# 检查参数
if [ $# -eq 0 ]; then
    print_warning "用法: $0 /path/to/opencode/project"
    echo ""
    echo "示例:"
    echo "  $0 /home/user/my-project"
    echo "  $0 .  # 安装到当前目录"
    exit 1
fi

PROJECT_DIR="$1"

# 检查目标目录是否存在
if [ ! -d "$PROJECT_DIR" ]; then
    echo "错误: 目录不存在: $PROJECT_DIR"
    exit 1
fi

# 获取插件目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_info "开始安装 OpenCode LLM Interceptor 插件到: $PROJECT_DIR"

# 创建 plugins 目录
PLUGIN_DIR="$PROJECT_DIR/plugins"
mkdir -p "$PLUGIN_DIR"
print_success "创建插件目录: $PLUGIN_DIR"

# 复制插件文件
print_info "复制插件文件..."

cp "$SCRIPT_DIR/simple-llm-interceptor.ts" "$PLUGIN_DIR/"
print_success "  ✓ simple-llm-interceptor.ts"

cp "$SCRIPT_DIR/full-llm-interceptor.ts" "$PLUGIN_DIR/"
print_success "  ✓ full-llm-interceptor.ts"

# 创建 package.json
print_info "创建 package.json..."
cat > "$PLUGIN_DIR/package.json" << 'EOF'
{
  "name": "opencode-llm-interceptors",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "@opencode-ai/plugin": "latest"
  }
}
EOF
print_success "  ✓ package.json"

# 复制 README
cp "$SCRIPT_DIR/README.md" "$PLUGIN_DIR/"
print_success "  ✓ README.md"

# 复制日志查看器到项目根目录
cp "$SCRIPT_DIR/log-viewer.html" "$PROJECT_DIR/"
print_success "  ✓ log-viewer.html (复制到项目根目录)"

# 安装依赖
print_info "安装依赖..."
cd "$PLUGIN_DIR"
bun install 2>/dev/null || {
    print_warning "bun install 失败，但这通常不影响使用"
}

# 创建示例配置
print_info "创建示例配置文件..."
cat > "$PROJECT_DIR/opencode.json.example" << 'EOF'
{
  "plugin": [
    "./plugins/simple-llm-interceptor.ts"
  ]
}
EOF
print_success "  ✓ opencode.json.example"

# 打印使用说明
echo ""
print_success "安装完成！"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "快速开始:"
echo ""
echo "1. 运行 OpenCode（插件会自动加载）:"
echo "   cd $PROJECT_DIR"
echo "   bun dev ."
echo ""
echo "2. 发送一条消息，插件会在终端显示所有 LLM 通信"
echo ""
echo "3. 如需保存日志到文件，编辑 opencode.json:"
echo "   {"
echo '     "plugin": ["./plugins/full-llm-interceptor.ts"]'
echo "   }"
echo ""
echo "4. 查看日志:"
echo "   tail -f /tmp/opencode-llm-logs.jsonl | jq"
echo ""
echo "5. 使用可视化查看器:"
echo "   cd $PROJECT_DIR"
echo "   python -m http.server 8000"
echo "   # 然后访问 http://localhost:8000/log-viewer.html"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
print_info "详细文档: $PLUGIN_DIR/README.md"
print_info "使用指南: $SCRIPT_DIR/HOW_TO_USE.md"
echo ""
