#!/usr/bin/env bash
# 解析审查基准分支并计算 ae:review 的 merge-base。
# 处理 fork 安全的远程解析、PR 元数据和多级回退检测。
#
# 用法: bash references/resolve-base.sh
# 输出: 成功时输出 BASE:<sha>，失败时输出 ERROR:<message>。
#
# 按以下优先级检测基准分支：
# 1. PR 元数据（base ref + fork 安全的 base repo）
# 2. origin/HEAD 符号引用
# 3. gh repo view defaultBranchRef
# 4. 常见分支名：main, master, develop, trunk

set -euo pipefail

REVIEW_BASE_BRANCH=""
PR_BASE_REPO=""
PR_BASE_REMOTE=""
BASE_REF=""

# 步骤 1：尝试 PR 元数据（处理 fork 工作流）
if command -v gh >/dev/null 2>&1; then
  PR_META=$(gh pr view --json baseRefName,url 2>/dev/null || true)
  if [ -n "$PR_META" ]; then
    REVIEW_BASE_BRANCH=$(echo "$PR_META" | jq -r '.baseRefName // empty' 2>/dev/null || true)
    PR_BASE_REPO=$(echo "$PR_META" | jq -r '.url // empty' 2>/dev/null | sed -n 's#https://github.com/\([^/]*/[^/]*\)/pull/.*#\1#p' || true)
  fi
fi

# 步骤 2：回退到 origin/HEAD
if [ -z "$REVIEW_BASE_BRANCH" ]; then
  REVIEW_BASE_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)
fi

# 步骤 3：回退到 gh repo view
if [ -z "$REVIEW_BASE_BRANCH" ] && command -v gh >/dev/null 2>&1; then
  REVIEW_BASE_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null || true)
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

# 从正确的远程解析基准引用（fork 安全）
if [ -n "$REVIEW_BASE_BRANCH" ]; then
  if [ -n "$PR_BASE_REPO" ]; then
    PR_BASE_REMOTE=$(git remote -v | awk "index(\$2, \"github.com:$PR_BASE_REPO\") || index(\$2, \"github.com/$PR_BASE_REPO\") {print \$1; exit}")
    if [ -n "$PR_BASE_REMOTE" ]; then
      # 始终 fetch —— 本地缓存的引用可能过期，
      # 导致 merge-base 早于 squash-merge 的工作，使 diff 膨胀。
      git fetch --no-tags "$PR_BASE_REMOTE" "$REVIEW_BASE_BRANCH:refs/remotes/$PR_BASE_REMOTE/$REVIEW_BASE_BRANCH" 2>/dev/null || git fetch --no-tags "$PR_BASE_REMOTE" "$REVIEW_BASE_BRANCH" 2>/dev/null || true
      BASE_REF=$(git rev-parse --verify "$PR_BASE_REMOTE/$REVIEW_BASE_BRANCH" 2>/dev/null || true)
    fi
  fi
  if [ -z "$BASE_REF" ]; then
    # 仅当 origin 作为远程存在时才尝试；否则跳过，
    # 避免在 origin 指向用户 fork 的设置中产生混淆错误。
    if git remote get-url origin >/dev/null 2>&1; then
      # 始终 fetch —— 同上述 fork 安全路径的理由。
      git fetch --no-tags origin "$REVIEW_BASE_BRANCH:refs/remotes/origin/$REVIEW_BASE_BRANCH" 2>/dev/null || git fetch --no-tags origin "$REVIEW_BASE_BRANCH" 2>/dev/null || true
      BASE_REF=$(git rev-parse --verify "origin/$REVIEW_BASE_BRANCH" 2>/dev/null || true)
    fi
    # 仅当远程解析失败时才回退到裸本地引用
    if [ -z "$BASE_REF" ]; then
      BASE_REF=$(git rev-parse --verify "$REVIEW_BASE_BRANCH" 2>/dev/null || true)
    fi
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
    if [ -z "$BASE" ] && [ -n "$PR_BASE_REMOTE" ] && [ "$PR_BASE_REMOTE" != "origin" ]; then
      git fetch --no-tags --unshallow "$PR_BASE_REMOTE" 2>/dev/null || true
      BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null) || BASE=""
    fi
  fi
else
  BASE=""
fi

if [ -n "$BASE" ]; then
  echo "BASE:$BASE"
else
  echo "ERROR:无法在本地解析审查基准分支。请 fetch 基准分支后重试，或提供 PR 编号以便从 PR 元数据确定审查范围。"
fi
