#!/usr/bin/env bash
# 解析审查基准分支并计算 ae:review 的 merge-base。
# 平台无关：纯 Git 操作为基础，平台 CLI（gh/glab/bitbucket）作为可选增强。
#
# 用法: bash references/resolve-base.sh
# 输出: 成功时输出 BASE:<sha>，失败时输出 ERROR:<message>。

set -euo pipefail

REVIEW_BASE_BRANCH=""
BASE_REF=""

# 步骤 1：读取项目配置中的 review.defaultBase
if [ -f "opencode.json" ]; then
  REVIEW_BASE_BRANCH=$(grep -o '"review"[[:space:]]*:[[:space:]]*{[^}]*"defaultBase"[[:space:]]*:[[:space:]]*"[^"]*"' opencode.json 2>/dev/null | grep -o '"defaultBase"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || true)
fi

# 步骤 2：尝试平台 CLI 增强检测（可选）
if [ -z "$REVIEW_BASE_BRANCH" ]; then
  for cli in gh glab bitbucket; do
    if command -v "$cli" >/dev/null 2>&1; then
      case "$cli" in
        gh)
          REVIEW_BASE_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null || true)
          ;;
        glab)
          REVIEW_BASE_BRANCH=$(glab repo view --output json 2>/dev/null | grep -o '"default_branch":"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || true)
          ;;
        bitbucket)
          # bitbucket CLI 支持有限，跳过
          ;;
      esac
      [ -n "$REVIEW_BASE_BRANCH" ] && break
    fi
  done
fi

# 步骤 3：回退到 origin/HEAD 符号引用
if [ -z "$REVIEW_BASE_BRANCH" ]; then
  REVIEW_BASE_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)
fi

# 步骤 4：回退到常见分支名
if [ -z "$REVIEW_BASE_BRANCH" ]; then
  for candidate in main master develop trunk; do
    if git rev-parse --verify "origin/$candidate" >/dev/null 2>&1 || git rev-parse --verify "$candidate" >/dev/null 2>&1; then
      REVIEW_BASE_BRANCH="$candidate"
      break
    fi
  done
fi

# 解析基准引用
if [ -n "$REVIEW_BASE_BRANCH" ]; then
  if git remote get-url origin >/dev/null 2>&1; then
    git fetch --no-tags origin "$REVIEW_BASE_BRANCH:refs/remotes/origin/$REVIEW_BASE_BRANCH" 2>/dev/null || git fetch --no-tags origin "$REVIEW_BASE_BRANCH" 2>/dev/null || true
    BASE_REF=$(git rev-parse --verify "origin/$REVIEW_BASE_BRANCH" 2>/dev/null || true)
  fi
  if [ -z "$BASE_REF" ]; then
    BASE_REF=$(git rev-parse --verify "$REVIEW_BASE_BRANCH" 2>/dev/null || true)
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
  echo "ERROR:无法解析审查基准分支。建议：1) 使用 from:<ref> 指定基准 2) 仅审查工作区变更 3) 查看提交历史手动选择。"
fi
