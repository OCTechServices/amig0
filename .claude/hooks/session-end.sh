#!/bin/bash

# ═══════════════════════════════════════════════════════════════
# Session End Hook — OCTech Tier 1
# Fires on every Claude Code session stop (including premature).
# Outputs a JSON systemMessage surfaced directly in Claude Code.
#
# vNext changes (Foundation vNext):
#   F13 — Activity heuristic gate: doc freshness checks only fire
#          when recent project activity is detected (commits in
#          lookback window or dirty working tree). Avoids false
#          positives on read-only/diagnostic sessions.
#   F03 — master-prompt staleness: warns when master-prompt
#          Source-Date is more than 7 days behind CLAUDE.md mtime.
#   F04 — CLAUDE.md line count: warns if file exceeds 200 lines.
#   F06 — Completed item accumulation: warns if more than 5 [x]
#          items remain in CLAUDE.md (should move to changelog).
#   B5  — Pre-commit hook integrity: warns if .git/hooks/pre-commit
#          is missing or non-executable (catches re-inits / clones).
# ═══════════════════════════════════════════════════════════════

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CLAUDE_MD="$PROJECT_ROOT/CLAUDE.md"
RAID_MD="$PROJECT_ROOT/RAID.md"
MASTER_PROMPT="$PROJECT_ROOT/.claude/prompts/master-prompt.md"

now=$(date +%s)
issues=()

# ── Activity heuristic (F13) ─────────────────────────────────
# RECENT_PROJECT_ACTIVITY approximates whether meaningful work
# occurred this session. It is a heuristic — not true session
# identity — derived from: (a) commits within the lookback window,
# (b) dirty working-tree state. Doc freshness checks only apply
# when activity is detected to suppress false positives on
# read-only or diagnostic sessions.
LOOKBACK_HOURS=4
RECENT_COMMITS=$(git -C "$PROJECT_ROOT" log --since="${LOOKBACK_HOURS} hours ago" --oneline 2>/dev/null | wc -l | tr -d ' ')
DIRTY=$(git -C "$PROJECT_ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
RECENT_PROJECT_ACTIVITY=0
[ "$RECENT_COMMITS" -gt 0 ] && RECENT_PROJECT_ACTIVITY=1
[ "$DIRTY" -gt 0 ] && RECENT_PROJECT_ACTIVITY=1

# ── Doc freshness and quality checks (activity-gated) ────────
if [ "$RECENT_PROJECT_ACTIVITY" -eq 1 ]; then

  # CLAUDE.md — stale if not modified in last 4 hours
  if [ -f "$CLAUDE_MD" ]; then
    age=$(( now - $(stat -f %m "$CLAUDE_MD" 2>/dev/null || stat -c %Y "$CLAUDE_MD" 2>/dev/null) ))
    [ "$age" -gt 14400 ] && issues+=("CLAUDE.md not updated this session")
  else
    issues+=("CLAUDE.md missing")
  fi

  # RAID.md — stale if not modified in last 4 hours
  if [ -f "$RAID_MD" ]; then
    age=$(( now - $(stat -f %m "$RAID_MD" 2>/dev/null || stat -c %Y "$RAID_MD" 2>/dev/null) ))
    [ "$age" -gt 14400 ] && issues+=("RAID.md not updated this session")
  else
    issues+=("RAID.md missing")
  fi

  # master-prompt.md staleness (F03) — warn if Source-Date is
  # more than 7 days behind CLAUDE.md modification date.
  # Only fires if master-prompt contains a # Source-Date: line
  # (added by generate-master-prompt.sh vNext).
  if [ -f "$MASTER_PROMPT" ] && [ -f "$CLAUDE_MD" ]; then
    SOURCE_DATE=$(grep "^# Source-Date:" "$MASTER_PROMPT" 2>/dev/null | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
    if [ -n "$SOURCE_DATE" ]; then
      SOURCE_TS=$(date -j -f "%Y-%m-%d" "$SOURCE_DATE" "+%s" 2>/dev/null || date -d "$SOURCE_DATE" "+%s" 2>/dev/null)
      CLAUDE_MTIME=$(stat -f %m "$CLAUDE_MD" 2>/dev/null || stat -c %Y "$CLAUDE_MD" 2>/dev/null)
      if [ -n "$SOURCE_TS" ] && [ -n "$CLAUDE_MTIME" ]; then
        DIFF_DAYS=$(( (CLAUDE_MTIME - SOURCE_TS) / 86400 ))
        if [ "$DIFF_DAYS" -gt 7 ]; then
          issues+=("master-prompt.md is ${DIFF_DAYS} days behind CLAUDE.md — regenerate: cprompt $(basename "$PROJECT_ROOT")")
        fi
      fi
    fi
  fi

  # CLAUDE.md line count (F04) — warn if over 200-line limit (PP01)
  if [ -f "$CLAUDE_MD" ]; then
    LINE_COUNT=$(wc -l < "$CLAUDE_MD" | tr -d ' ')
    if [ "$LINE_COUNT" -gt 200 ]; then
      issues+=("CLAUDE.md is ${LINE_COUNT} lines (limit: 200) — move completed items to docs/changelog.md")
    fi
  fi

  # Completed item accumulation (F06) — warn if more than 5 [x]
  # items remain in CLAUDE.md (should be moved to docs/changelog.md)
  if [ -f "$CLAUDE_MD" ]; then
    DONE_COUNT=$(grep -c '^\- \[x\]' "$CLAUDE_MD" 2>/dev/null; true)
    if [ "$DONE_COUNT" -gt 5 ]; then
      issues+=("${DONE_COUNT} completed [x] items in CLAUDE.md — move to docs/changelog.md")
    fi
  fi

fi

# ── Pre-commit hook integrity (always checked) ───────────────
# Catches re-inits, clones, or accidental deletions of the
# governance hook before the next commit silently skips it.
if [ -d "$PROJECT_ROOT/.git" ]; then
  HOOK_FILE="$PROJECT_ROOT/.git/hooks/pre-commit"
  if [ ! -f "$HOOK_FILE" ]; then
    issues+=("pre-commit hook missing — restore: cp .claude/hooks/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit")
  elif [ ! -x "$HOOK_FILE" ]; then
    issues+=("pre-commit hook not executable — fix: chmod +x .git/hooks/pre-commit")
  fi
fi

# ── Uncommitted changes (always checked, not activity-gated) ─
uncommitted=0
if [ -d "$PROJECT_ROOT/.git" ]; then
  uncommitted=$(git -C "$PROJECT_ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
fi

# ── Build system message ─────────────────────────────────────
if [ ${#issues[@]} -eq 0 ] && [ "$uncommitted" -eq 0 ]; then
  msg="Session closed cleanly. CLAUDE.md and RAID.md are current."
elif [ ${#issues[@]} -eq 0 ]; then
  msg="Session closed. Docs are current. ${uncommitted} uncommitted change(s) — commit before next session."
else
  joined=$(IFS=", "; echo "${issues[*]}")
  if [ "$uncommitted" -gt 0 ]; then
    msg="Before closing: ${joined}. Also ${uncommitted} uncommitted change(s). Sign-off: Read CLAUDE.md, RAID.md, and .claude/prompts/master-prompt.md and confirm all three are accurate before we sign off."
  else
    msg="Before closing: ${joined}. Sign-off: Read CLAUDE.md, RAID.md, and .claude/prompts/master-prompt.md and confirm all three are accurate before we sign off."
  fi
fi

printf '{"systemMessage": "%s"}' "$msg"
exit 0
