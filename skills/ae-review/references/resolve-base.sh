#!/usr/bin/env bash
# 解析审查基准分支并计算 ae-review 的 merge-base。
# 平台无关：仅依赖标准 Git 操作。
#
# 基准分支解析顺序（默认分支链）：
#   1. origin/HEAD 符号引用
#   2. 常见默认分支名 main / master / develop / trunk
#
# 用法: bash references/resolve-base.sh
# 输出: 成功时输出 BASE:<sha>，失败时输出 ERROR:<message>。

set -euo pipefail

DEFAULT_BRANCH=""

# 步骤 1：回退到 origin/HEAD 符号引用
DEFAULT_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)

# 步骤 2：回退到常见默认分支名
if [ -z "$DEFAULT_BRANCH" ]; then
  for candidate in main master develop trunk; do
    if git rev-parse --verify "origin/$candidate" >/dev/null 2>&1 || git rev-parse --verify "$candidate" >/dev/null 2>&1; then
      DEFAULT_BRANCH="$candidate"
      break
    fi
  done
fi

# 解析基准引用
BASE_REF=""
if [ -n "$DEFAULT_BRANCH" ]; then
  if git remote get-url origin >/dev/null 2>&1; then
    git fetch --no-tags origin "$DEFAULT_BRANCH:refs/remotes/origin/$DEFAULT_BRANCH" 2>/dev/null || git fetch --no-tags origin "$DEFAULT_BRANCH" 2>/dev/null || true
    BASE_REF=$(git rev-parse --verify "origin/$DEFAULT_BRANCH" 2>/dev/null || true)
  fi
  if [ -z "$BASE_REF" ]; then
    BASE_REF=$(git rev-parse --verify "$DEFAULT_BRANCH" 2>/dev/null || true)
  fi
fi

# 计算 merge-base
if [ -n "$BASE_REF" ]; then
  BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null) || BASE=""
  if [ -z "$BASE" ] && [ "$(git rev-parse --is-shallow-repository 2>/dev/null || echo false)" = "true" ]; then
    if git remote get-url origin >/dev/null 2>&1; then
      git fetch --no-tags --unshallow origin 2>/dev/null || true
      BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null) || BASE=""
    fi
  fi
else
  BASE=""
fi

if [ -n "$BASE" ]; then
  echo "BASE:$BASE"
else
  echo "ERROR:无法解析审查基准分支。建议：1) 使用 from=<ref> 指定基准 2) 仅审查工作区变更 3) 查看提交历史手动选择。"
fi
