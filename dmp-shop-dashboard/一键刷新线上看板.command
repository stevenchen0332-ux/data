#!/bin/bash
set -e
cd "$(dirname "$0")"
bash ./push_to_github.sh
echo ""
echo "按任意键关闭窗口..."
read -n 1 -s
