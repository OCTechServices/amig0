Review the current architecture or proposed change against the project's stated design in CLAUDE.md Section 2.

Assess the following:

**Alignment**
- Does this match the stack and key components documented in CLAUDE.md?
- Does it introduce patterns inconsistent with the existing architecture?
- Is this the simplest solution that meets the requirement, or is it over-engineered?

**Scalability & Maintainability**
- Will this hold up as the project grows, or does it create future rework?
- Are there hidden coupling points that will make future changes harder?
- Is the data model extensible without breaking changes?

**Risk**
- What are the failure modes of this design?
- Is there a simpler alternative with lower risk?
- What is the rollback path if this fails in production?

**OCTech Standards**
- Does this follow the Modify Before Creating principle?
- Is it consistent with patterns used in other OCTech projects?
- Would another consultant understand and extend this without explanation?

Output a structured assessment:
```
## Architecture Review

### Verdict: SOUND / CONCERNS / REWORK REQUIRED

### Strengths
[What is well-designed]

### Concerns
[Risks, coupling issues, scaling problems — with severity]

### Recommended changes
[Specific, actionable improvements]

### Trade-offs acknowledged
[What was sacrificed and why it is acceptable]
```
