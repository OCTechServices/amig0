Create a git commit for the current staged and unstaged changes.

Follow this process:
1. Run `git status` and `git diff` to understand what changed
2. Run `git log --oneline -5` to match the existing commit message style
3. Stage relevant files — prefer specific files over `git add .`
4. Write a commit message that explains *why*, not just *what*
5. Keep the subject line under 72 characters
6. Create the commit

Do not commit:
- .env files or any file containing secrets
- node_modules, build artifacts, or generated files not already tracked
- Files unrelated to the current change

If anything looks risky, flag it before committing.
