---
name: pr-reviewer
description: "Automated code review for GitHub PRs with diff analysis, security scanning, and lint integration. Use when reviewing pull requests, checking for security issues, or generating review reports."
metadata: {"clawdbot":{"emoji":"🔍","requires":{"bins":["gh","git"]}}}
---

# PR Reviewer

Automated code review for GitHub pull requests with structured analysis.

## What It Checks

1. **Security** — hardcoded credentials, AWS keys, SQL injection, XSS
2. **Error Handling** — missing catch blocks, unvalidated input, silent failures
3. **Style** — naming conventions, unused imports, dead code
4. **Test Coverage** — new code paths without corresponding tests
5. **Performance** — N+1 queries, unnecessary re-renders, memory leaks

## Usage

```bash
# Review a specific PR
gh pr diff 42 --repo owner/repo | pr-reviewer analyze

# Review with lint integration
pr-reviewer review --repo owner/repo --pr 42 --lint
```

## Output Format

Reports are generated as markdown with severity verdicts:
- **🔴 Security** — must fix before merge
- **🟡 Attention** — should address, not blocking
- **🟢 Minor** — style/preference, optional
- **✅ Good** — no issues found

## Tracking

Reviewed PRs are tracked by HEAD SHA to avoid redundant re-reviews.

## Supported Languages

Go, Python, JavaScript, TypeScript

## Tips

- Run on every PR to catch issues early
- Combine with CI for automated review comments
- Focus on security findings first — they're the highest impact
