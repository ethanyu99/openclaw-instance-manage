---
name: cognitive-memory
description: "FSRS-6 spaced repetition for agent memory. Use when memorizing facts, reinforcing important information, managing stale context, or building long-term knowledge retention across sessions."
metadata: {"clawdbot":{"emoji":"🧠"}}
---

# Cognitive Memory (FSRS-6)

Replaces flat memory with scientifically validated spaced repetition. Important facts get reinforced at optimal intervals; stale information fades gracefully.

## How It Works

- **Learning mode** — explicitly memorize vocabulary, API endpoints, names, etc.
- **Reinforcement** — important facts reviewed at increasing intervals (1d → 3d → 7d → 21d)
- **Graceful decay** — old, unreferenced information fades without cluttering active memory

## Usage

```bash
# Store a fact for spaced repetition
cognitive-memory add "Client budget is $50,000" --importance high

# Review due facts
cognitive-memory review

# Query retained knowledge
cognitive-memory search "client budget"

# Check retention stats
cognitive-memory stats
```

## Integration

The skill hooks into OpenClaw's memory system:
1. New facts are scored and scheduled for review
2. Review prompts appear at calculated intervals
3. Successful recall extends the interval; failure shortens it

## Tips

- High-importance facts get more aggressive review schedules
- The system is most effective after 1-2 weeks of use
- Works best for factual knowledge (names, numbers, preferences)
- Built on the open-source FSRS algorithm (Free Spaced Repetition Scheduler v6)
