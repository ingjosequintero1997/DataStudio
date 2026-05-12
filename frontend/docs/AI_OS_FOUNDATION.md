# DataStudio AI OS Foundation

This document defines the implemented foundation and next execution phases.

## Implemented in this iteration

- Centralized design tokens and motion presets.
- Global enterprise state using Zustand.
- Unified AI client layer with orchestrator-first routing and Groq fallback.
- Environment contracts for production AI runtime.

## Core architecture target

Client (React + DuckDB-Wasm)
-> AI Orchestrator API
-> Task Router
-> Specialized Agents
-> Ollama Runtime
-> Local Models

## AI task map

- sql.generate -> SQL Agent
- sql.repair -> SQL Repair Agent
- insight.generate -> Insight Agent
- dashboard.generate -> Dashboard Agent
- profile.semantic -> Profiling Agent
- relationship.detect -> Relationship Agent

## Runtime modes

- local-private: frontend -> orchestrator (localhost) -> Ollama
- cloud-hybrid: frontend -> orchestrator (server) -> Groq/Ollama routing
- fallback: frontend -> Groq direct (temporary compatibility)

## Next phases

1. Backend Orchestrator API
- Endpoint: POST /v1/ai/run
- Auth middleware
- Task router
- Retry policy + tracing

2. Semantic profiling engine
- Primary/foreign key detection
- Nulls, duplicates, outliers
- Correlations and cardinality

3. Memory engine
- Per-user analytical memory
- Session + persistent memory timeline
- Query and insight retrieval

4. Dashboard intelligence
- AI dashboard generation plans
- KPI auto-detection and narrative blocks

5. Performance
- Worker-based background indexing
- Virtualized rendering for large result sets
- Query cache and incremental updates
