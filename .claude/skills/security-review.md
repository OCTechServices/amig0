Run a security review on the current session's changes against the project's Section 6 security standards.

Check each of the following:

**Credentials & Secrets**
- No API keys, tokens, or passwords hardcoded in source files
- All credentials sourced from environment variables
- .env files present in .gitignore

**Trust Boundaries**
- All external inputs validated before use
- No user-supplied data passed directly to queries, shell commands, or file paths
- External API responses treated as untrusted

**Database & Access Controls**
- RLS policies (if Supabase) cover all new tables or columns introduced
- No direct table access bypassing access control layer
- Sensitive queries use parameterized inputs

**API & Middleware**
- All new endpoints require authentication unless explicitly public
- Authorization checked at the route level, not just the UI
- No sensitive data returned in error messages

**Architecture**
- No new secrets introduced to source control
- No new third-party dependencies added without review
- Audit log entries written for any consequential actions introduced

Report findings clearly. Flag Critical and High severity items first. Suggest specific fixes — do not just describe the problem.
