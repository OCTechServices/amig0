Scan the project's dependencies for security vulnerabilities, outdated packages, and licensing risks.

**Step 1 — Run available scanners**
If package.json exists:
```bash
npm audit --audit-level=moderate
```
If requirements.txt or pyproject.toml exists:
```bash
pip-audit
```
Report the raw output, then interpret it.

**Step 2 — Check for outdated packages**
```bash
npm outdated        # Node
pip list --outdated # Python
```
Flag any package that is more than 2 major versions behind.

**Step 3 — License check**
Identify any dependency with a restrictive license (GPL, AGPL, SSPL) that could conflict with the project's commercial intent as stated in CLAUDE.md Section 1.

**Step 4 — Unused dependencies**
Identify packages in package.json / requirements.txt that are imported nowhere in the source code.

**Output format:**
```
## Dependency Scan

### Critical / High vulnerabilities
[List with CVE if available, affected version, fix version]

### Outdated packages requiring attention
[Name, current version, latest version, risk level]

### License concerns
[Package, license, conflict with commercial intent]

### Unused dependencies
[Package, confirm before removing]

### Recommended actions
[Prioritized list]
```
