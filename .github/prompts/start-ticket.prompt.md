---
mode: agent
description: Walking-skeleton test. Get and report a Run for a Ticket through the agentflow MCP tools.
tools: ['agentflow/*']
---

Use only the agentflow MCP tools.

1. Call `state_get` with `key` set to `${input:key:FAKE-1}`.
2. Show me the exact result.
3. If it is a `run_persona` directive, call `state_advance` with that same `key`, the `run` object exactly as returned, and `status` set to `ok`.
4. Show me the exact result, then call `state_get` once more and show it.

Do not edit any files and do not invent values.
