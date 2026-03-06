---
name: prompt-optimizer
description: "Automatically optimize prompts before they reach the model. Use when improving response quality, reducing retries, lowering API costs, or applying structured prompting techniques."
metadata: {"clawdbot":{"emoji":"⚡"}}
---

# Prompt Optimizer

Bundles 58 proven prompting techniques and automatically rewrites casual instructions into optimized prompts before they hit the model API.

## Techniques Included

- **Chain-of-thought** — step-by-step reasoning
- **Few-shot examples** — provide input/output pairs
- **Role assignment** — set expert persona
- **Structured output** — enforce JSON/XML/table formats
- **Self-consistency** — multiple reasoning paths
- **Tree-of-thought** — branching exploration
- **Reflection** — self-critique and refinement

## Usage

The optimizer runs transparently:
1. Intercepts the user's casual instruction
2. Selects appropriate techniques based on task type
3. Rewrites into an optimized prompt
4. Sends to the model

## When It Helps Most

- Cheaper models (Gemini Flash, Claude Haiku) where prompt quality has disproportionate impact
- Complex reasoning tasks
- Tasks requiring structured output
- Reducing "hallucination" in factual queries

## Tips

- The optimizer adds ~100-200 tokens overhead per prompt
- Disable for simple, direct queries where optimization adds latency without benefit
- Most effective for multi-step or analytical tasks
- Pairs well with cognitive-memory for context-enriched prompts
