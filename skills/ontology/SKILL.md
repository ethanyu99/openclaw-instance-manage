---
name: ontology
description: "Typed knowledge graph for structured agent memory and composable skills. Use when creating/querying entities (Person, Project, Task, Event, Document), linking related objects, enforcing constraints, planning multi-step actions as graph transformations, or when skills need to share state."
---

# Ontology

A typed vocabulary + constraint system for representing knowledge as a verifiable graph.

## When to Use

- "Remember that..." — store structured facts
- "What do I know about X?" — query the knowledge graph
- "Link X to Y" — create relationships between entities
- "Show dependencies" — traverse graph relations
- Entity CRUD operations
- Cross-skill data access and state sharing

## Storage

Default location: `memory/ontology/graph.jsonl` (append-only JSONL format)

## Entity Types

Person, Organization, Project, Task, Goal, Event, Location, Document, Message, Note, Account, Device, Credential, Action, Policy

## Operations

```bash
# Create an entity
echo '{"op":"create","type":"Project","id":"proj-1","props":{"name":"OpenClaw Manager","status":"active"}}' >> memory/ontology/graph.jsonl

# Link entities
echo '{"op":"link","from":"person-1","to":"proj-1","rel":"owns"}' >> memory/ontology/graph.jsonl

# Query (use jq)
cat memory/ontology/graph.jsonl | jq 'select(.type=="Project")'
```

## Tips

- Use append-only JSONL for safe concurrent writes
- Validate entity types against the schema before creating
- Prefer explicit relation types over free-text links
