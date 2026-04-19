Run a structured client intake session that transforms a raw idea into a fully scaffolded, governance-ready project.

## Phase 1 — Capture the Idea

Ask the client these questions one group at a time. Wait for answers before moving on.

**Group 1 — The Idea**
1. Describe the product in one sentence. What does it do?
2. Who is the primary user? Be specific — not "businesses", but what kind?
3. What problem does it solve that currently has no good solution?

**Group 2 — The MVP**
4. What are the 3 most important things the MVP must do? (Hard cap: 3)
5. What is explicitly OUT of scope for the MVP?
6. What does success look like at launch — how will you know it's working?

**Group 3 — Technical Reality**
7. What stack or technology preferences do you have? (or: none / open to recommendation)
8. Are there any external services this must integrate with? (auth, payments, storage, APIs)
9. Are there any hard deadlines or budget constraints I should know about?

---

## Phase 2 — Produce Live Artifacts

After collecting answers, immediately produce all three artifacts back-to-back with no preamble.

### Artifact 1 — Draft CLAUDE.md

```markdown
# {{PROJECT_NAME}}
# Tier 1 — {{TIER_REASONING}} | OCTech Services

## 1. Project Purpose
{{ONE_SENTENCE_DESCRIPTION}}

**Target User:** {{TARGET_USER}}
**Problem Solved:** {{PROBLEM}}
**Tier:** 1 — Full Governance
**Status:** Scaffold — intake complete, build not started
**Owner:** {{OWNER}}
**Last Updated:** {{DATE}}

## 2. Architecture
**Type:** {{WEB_APP / API / MOBILE / etc.}}
**Stack:** {{DETECTED_OR_STATED_STACK}}
**Key Components:**
- {{COMPONENT_1}}
- {{COMPONENT_2}}
- {{COMPONENT_3}}
**External Integrations:** {{LIST_OR_NONE}}

## 3. Working Rules
- Never expose API keys or credentials in source code or commits
- Test changes manually before committing during early build phase
- Ask before adding new dependencies
- {{PROJECT_SPECIFIC_RULE_1}}
- {{PROJECT_SPECIFIC_RULE_2}}

## 4. Commands
```bash
# Add actual commands as the project is built
```

## 5. Security
- All secrets in .env — never committed
- .gitignore covers .env, node_modules, build artifacts, service account files
- No hardcoded credentials anywhere in source

## 6. Definition of Done
- [ ] MVP features (3 defined above) work end-to-end
- [ ] Auth flows work if auth is in scope
- [ ] No secrets exposed — security scan clean
- [ ] CLAUDE.md and RAID.md are accurate as of today

## 7. Open Items
- [ ] Confirm stack and scaffold project
- [ ] {{NEXT_ACTION_FROM_INTAKE}}
- [ ] Set first milestone target date
```

### Artifact 2 — Draft RAID.md

Use the standard OCTech RAID format. Populate with:
- R (Risks): top 2-3 risks identified from the intake (technical, timeline, scope)
- A (Assumptions): the key assumptions baked into the MVP scope
- I (Issues): any blockers already visible from the intake
- D (Decisions): the decisions made in this session (stack, scope, what's out of MVP)

### Artifact 3 — Milestone Plan

Produce a milestone plan with specific, demonstrable DoD per milestone:

```
M1 — Scaffold (Day 1)
  Done when: Project wired, CLAUDE.md accurate, first API call returns expected response

M2 — Core Feature ({{ESTIMATE}})
  Done when: {{PRIMARY_FEATURE}} works end-to-end, no auth required yet

M3 — Auth + Persistence ({{ESTIMATE}})
  Done when: Users can sign in, data survives a page refresh

M4 — Production-Ready ({{ESTIMATE}})
  Done when: Security review passed, DoD checklist clean, no secrets exposed, deployed to staging
```

Adjust milestone names and criteria to match this specific project.

---

## Phase 3 — Confirm and Wire

After producing all three artifacts:

1. Ask: "Does this match your vision? What would you change?"
2. Incorporate feedback inline — do not start over
3. Say: "Run `cnew-t1 {{project-name}}` and I'll wire this immediately."
4. Once scaffolded: write the approved CLAUDE.md and RAID.md into the project
5. Confirm session opener will load the master-prompt on next launch

The client should leave this session with a working, governed project — not just a plan.
