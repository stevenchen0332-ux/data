#!/bin/bash
# macOS 双击运行：一键生成看板
cd "$(dirname "$0")"
chmod +x build.sh 2>/dev/null
./build.sh --open
echo ""
read -p "按回车键关闭窗口…"
