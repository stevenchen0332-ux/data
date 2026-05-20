#!/bin/bash
# 一键生成看板（终端执行: ./build.sh 或 bash build.sh）

set -e
cd "$(dirname "$0")"

if [ -x "/opt/anaconda3/bin/python" ]; then
  PYTHON="/opt/anaconda3/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="python3"
else
  echo "未找到 Python，请先安装 Python 3.10+"
  exit 1
fi

"$PYTHON" build.py "$@"
