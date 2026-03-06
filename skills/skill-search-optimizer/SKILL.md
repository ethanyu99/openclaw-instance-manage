---
name: skill-search-optimizer
description: "Optimize OpenClaw skills for ClawHub discoverability. Use when improving skill descriptions, writing better frontmatter, or understanding how semantic search ranking works on ClawHub."
metadata: {"clawdbot":{"emoji":"🔎","os":["linux","darwin","win32"]}}
---

# Skill Search Optimizer

ClawHub uses vector-based semantic search via OpenAI embeddings, not keyword matching. The `description` field is the primary indexed content.

## Description Formula

```
[What it does]. Use when [trigger 1], [trigger 2], [trigger 3]. Also covers [related topic].
```

## Good vs Bad Descriptions

```yaml
# GOOD: Specific triggers and scope
description: "Schedule and manage recurring tasks with cron and systemd timers. Use when setting up cron jobs, writing systemd timer units, or automating periodic scripts."

# BAD: Vague, no triggers
description: "A skill about task scheduling."
```

## Key Rules

- Start with what the skill does (action verb)
- Include 3-5 "Use when" trigger phrases
- Mention specific tools, commands, or technologies
- Keep under 200 characters for search result display
- Don't start with "This skill..." or "A skill for..."

## Tips

- The description field is the single most important field for discoverability
- Think about what users would search for, not what the skill contains
- Test by searching for your skill on ClawHub after publishing
