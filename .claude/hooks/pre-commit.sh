#!/bin/bash

# ═══════════════════════════════════════════════════════════════
# Pre-Commit Hook — OCTech Tier 1
# Blocks commits containing secrets, .env files, or lint errors.
# Installed at: .git/hooks/pre-commit
# ═══════════════════════════════════════════════════════════════

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

FAILED=0

echo ""
echo -e "${BOLD}► Pre-commit security check...${NC}"

# ── 1. Block .env files from being committed ────────────────
STAGED_ENV=$(git diff --cached --name-only | grep -E '^\.env($|\.|/)' | grep -v '\.example$' | grep -v '\.sample$')
if [ -n "$STAGED_ENV" ]; then
  echo -e "${RED}✗ BLOCKED: .env file staged for commit:${NC}"
  while IFS= read -r f; do
    echo -e "    $f"
  done <<< "$STAGED_ENV"
  echo -e "${YELLOW}  Remove with: git reset HEAD <file>${NC}"
  FAILED=1
fi

# ── 2. Scan staged files for hardcoded secret patterns ──────
# Reads content from the git index (not working tree) so secrets
# are caught even when the file has been deleted from disk after
# staging. This closes the working-tree-absent bypass (F01 vNext).
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|ts|tsx|jsx|py|sh|env|json|yaml|yml)$' | grep -v '\.example$' | grep -v '\.sample$' | grep -v '^\.claude/')

if [ -n "$STAGED_FILES" ]; then
  SECRET_HITS=""
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if git show ":$f" 2>/dev/null | grep -qE \
      "(sk_live_|sk_test_|rk_live_|pk_live_|AAAA[0-9A-Za-z_-]{100,}|AIza[0-9A-Za-z_-]{35}|ghp_[0-9A-Za-z]{36}|xox[baprs]-[0-9A-Za-z]{10,}|eyJhbGciOiJIUzI1NiJ9\.|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)"; then
      SECRET_HITS="${SECRET_HITS}"$'\n'"${f}"
    fi
  done <<< "$STAGED_FILES"
  SECRET_HITS=$(printf '%s' "$SECRET_HITS" | sed '/^[[:space:]]*$/d')

  if [ -n "$SECRET_HITS" ]; then
    echo -e "${RED}✗ BLOCKED: Potential secrets detected in staged files:${NC}"
    while IFS= read -r f; do
      echo -e "    $f"
    done <<< "$SECRET_HITS"
    echo -e "${YELLOW}  Move secrets to .env and reference via environment variables.${NC}"
    FAILED=1
  fi
fi

# ── 3. Lint check (if configured) ───────────────────────────
if [ -f "package.json" ] && grep -q '"lint"' package.json 2>/dev/null; then
  LINT_OUTPUT=$(npm run lint --silent 2>&1)
  LINT_EXIT=$?
  if [ $LINT_EXIT -ne 0 ]; then
    echo -e "${RED}✗ BLOCKED: Lint errors found:${NC}"
    echo "$LINT_OUTPUT" | tail -20
    echo -e "${YELLOW}  Fix with: npm run lint:fix${NC}"
    FAILED=1
  fi
fi

# ── 4. Governance freshness check (warn only — never blocks) ─
STALE_DAYS=14

for DOC in "CLAUDE.md" "RAID.md"; do
  if [ -f "$DOC" ]; then
    LAST_UPDATED=$(grep -m1 "Last Updated" "$DOC" 2>/dev/null | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
    if [ -n "$LAST_UPDATED" ]; then
      DOC_TS=$(date -j -f "%Y-%m-%d" "$LAST_UPDATED" "+%s" 2>/dev/null)
      NOW_TS=$(date "+%s")
      if [ -n "$DOC_TS" ]; then
        AGE=$(( (NOW_TS - DOC_TS) / 86400 ))
        if [ "$AGE" -gt "$STALE_DAYS" ]; then
          echo -e "${YELLOW}⚠ Governance drift: $DOC last updated $LAST_UPDATED (${AGE}d ago)${NC}"
          echo -e "  Update 'Last Updated' date if this session changed project context."
        fi
      fi
    fi
  fi
done

# ── Result ──────────────────────────────────────────────────
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ Pre-commit checks passed${NC}"
  echo ""
  exit 0
else
  echo ""
  echo -e "${RED}${BOLD}Commit blocked. Fix the issues above before committing.${NC}"
  echo ""
  exit 1
fi
