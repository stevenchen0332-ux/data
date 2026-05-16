#!/usr/bin/env bash
# 仅推送已提交的更新到 GitHub（数据重建成功后、网络恢复时使用）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-TTL Dashboard}"
export GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-dashboard@local}"
export GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-$GIT_AUTHOR_NAME}"
export GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-$GIT_AUTHOR_EMAIL}"

BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "main" ]]; then
  git checkout main
fi

echo ">>> 推送 main …"
git push origin main

echo ">>> 同步 gh-pages …"
git checkout gh-pages
git reset --hard main
git push origin gh-pages --force
git checkout main

echo "完成。线上约 1～3 分钟更新。"
