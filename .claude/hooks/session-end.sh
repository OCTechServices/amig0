#!/bin/bash

# ═══════════════════════════════════════════════════════════════
# Session End Hook — OCTech Tier 1
# Fires on every Claude Code session stop (including premature).
# Outputs a JSON systemMessage surfaced directly in Claude Code.
# ═══════════════════════════════════════════════════════════════

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CLAUDE_MD="$PROJECT_ROOT/CLAUDE.md"
RAID_MD="$PROJECT_ROOT/RAID.md"

now=$(date +%s)
issues=()

# Check CLAUDE.md — stale if not modified in last 4 hours
if [ -f "$CLAUDE_MD" ]; then
  age=$(( now - $(stat -f %m "$CLAUDE_MD" 2>/dev/null || stat -c %Y "$CLAUDE_MD" 2>/dev/null) ))
  [ "$age" -gt 14400 ] && issues+=("CLAUDE.md not updated this session")
else
  issues+=("CLAUDE.md missing")
fi

# Check RAID.md — stale if not modified in last 4 hours
if [ -f "$RAID_MD" ]; then
  age=$(( now - $(stat -f %m "$RAID_MD" 2>/dev/null || stat -c %Y "$RAID_MD" 2>/dev/null) ))
  [ "$age" -gt 14400 ] && issues+=("RAID.md not updated this session")
else
  issues+=("RAID.md missing")
fi

# Count uncommitted changes
uncommitted=0
if [ -d "$PROJECT_ROOT/.git" ]; then
  uncommitted=$(git -C "$PROJECT_ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
fi

# Build system message
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
