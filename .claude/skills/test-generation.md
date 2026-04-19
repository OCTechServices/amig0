Generate tests for the code changed or specified in this session.

Follow this process:

**Step 1 — Identify what needs tests**
- What functions, components, or endpoints were added or modified?
- What is the critical path that, if broken, would cause the most harm?
- What edge cases are most likely to fail silently?

**Step 2 — Check existing test patterns**
- Read the existing test files to understand the testing framework and conventions in use
- Match the style, structure, and naming conventions already present
- Do not introduce a new testing library without approval

**Step 3 — Write the tests**
Generate tests covering:
- Happy path — expected inputs produce expected outputs
- Edge cases — empty inputs, boundary values, nulls
- Error paths — invalid inputs, failed dependencies, network errors
- Security cases — if the code handles auth, permissions, or external input

**Step 4 — Verify**
Run the tests after writing them:
```bash
npm run test        # or the test command from CLAUDE.md Section 4
```

All generated tests must pass before this skill is considered complete.

**Do not:**
- Write tests that mock so heavily they test nothing real
- Generate tests just to increase coverage numbers
- Skip error path tests because they are harder to write
