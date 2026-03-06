---
name: memory-feedback
description: "Learning loop for agent skills: log episodes, detect patterns, propose improvements. Use when debugging repeated failures, reviewing skill effectiveness, or building self-improving agent workflows."
metadata: {"clawdbot":{"emoji":"🧠","requires":{"bins":["jq","curl"]}}}
---

# Memory Feedback Loop

A learning system that helps the agent improve over time by logging what works and what doesn't.

## How It Works

1. **Log episodes** — after each skill use, record success/failure with context
2. **Detect patterns** — when enough data accumulates, identify recurring issues
3. **Propose fixes** — generate concrete skill improvements (optionally as PRs)

## Episode Logging

```bash
# Log a successful episode
echo '{"skill":"github","outcome":"success","context":"merged PR #42","ts":"'$(date -u +%FT%TZ)'"}' >> ~/.openclaw/memory/episodes.jsonl

# Log a failure
echo '{"skill":"summarize","outcome":"failure","error":"timeout on large PDF","ts":"'$(date -u +%FT%TZ)'"}' >> ~/.openclaw/memory/episodes.jsonl
```

## Pattern Detection

```bash
# Count failures by skill
cat ~/.openclaw/memory/episodes.jsonl | jq -r 'select(.outcome=="failure") | .skill' | sort | uniq -c | sort -rn
```

## Propose Improvements

When a pattern is detected with sufficient confidence (3+ similar failures):
1. Analyze the failure context
2. Draft a concrete fix to the skill's SKILL.md
3. Optionally create a PR via `gh` CLI for human review

## Notes

- Core memory logging works without GitHub integration
- Only pattern-detected improvements (not single failures) trigger proposals
- Human-in-the-loop: proposals require review before applying
