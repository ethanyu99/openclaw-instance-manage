---
name: skill-writer
description: Write high-quality agent skills (SKILL.md files) for ClawHub. Use when creating a new skill from scratch, structuring skill content, writing effective frontmatter and descriptions, choosing section patterns, or following best practices for agent-consumable technical documentation.
metadata: {"clawdbot":{"emoji":"✍️","requires":{"anyBins":["npx"]},"os":["linux","darwin","win32"]}}
---

# Skill Writer

Write well-structured, effective SKILL.md files for the ClawHub registry. Covers the skill format specification, frontmatter schema, content patterns, example quality, and common anti-patterns.

## When to Use

- Creating a new skill from scratch
- Structuring technical content as an agent skill
- Writing frontmatter that the registry indexes correctly
- Choosing section organization for different skill types
- Reviewing your own skill before publishing

## The SKILL.md Format

A skill is a single Markdown file with YAML frontmatter. The agent loads it on demand and follows its instructions.

## Frontmatter Schema

### `name` (required)
Lowercase, hyphenated slug: `csv-pipeline`, `git-workflows`

### `description` (required)
Pattern: `[What it does]. Use when [trigger 1], [trigger 2], [trigger 3].`

### `metadata` (required)
JSON object with `clawdbot` schema: emoji, requires.anyBins, os

## Content Structure

1. **When to Use** — 4-8 bullet points of concrete scenarios
2. **Main Content** — organized by task, not by concept
3. **Code Blocks** — every section needs at least one runnable example
4. **Tips** — 5-10 standalone, non-obvious insights

## Size Guidelines

| Metric | Target | Too Short | Too Long |
|--------|--------|-----------|----------|
| Lines  | 300-550 | < 150    | > 700    |
| Sections | 5-10 | < 3      | > 15     |
| Code blocks | 15-40 | < 8  | > 60     |

## Tips

- The `description` field is your skill's search ranking — spend more time on it than any single content section
- Lead with the most common use case
- Every code example should be copy-pasteable
- Write for the agent, not the human — use unambiguous instructions
- Test by asking an agent to use the skill on a real task
