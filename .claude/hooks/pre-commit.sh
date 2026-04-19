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
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|ts|tsx|jsx|py|sh|env|json|yaml|yml)$' | grep -v '\.example$' | grep -v '\.sample$' | grep -v '^\.claude/')

if [ -n "$STAGED_FILES" ]; then
  SECRET_HITS=$(echo "$STAGED_FILES" | xargs grep -lE \
    "(sk_live_|sk_test_|rk_live_|pk_live_|AAAA[0-9A-Za-z_-]{100,}|AIza[0-9A-Za-z_-]{35}|ghp_[0-9A-Za-z]{36}|xox[baprs]-[0-9A-Za-z]{10,}|eyJhbGciOiJIUzI1NiJ9\.|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)" \
    2>/dev/null)

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
