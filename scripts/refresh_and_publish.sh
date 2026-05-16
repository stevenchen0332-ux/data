#!/usr/bin/env bash
# 一键：从桌面「日数据」重建 data-bundle.js + traffic_daily.json，并发布到 GitHub Pages
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/dashboard.config.json" ]]; then
  cp "$ROOT/dashboard.config.example.json" "$ROOT/dashboard.config.json"
  echo "已生成 dashboard.config.json，可按需修改数据源路径。"
fi

PY="${TTL_PYTHON:-/opt/anaconda3/bin/python3}"
if [[ ! -x "$PY" ]]; then
  PY="$(command -v python3)"
fi
"$PY" "$ROOT/scripts/refresh_dashboard.py" "$@"
