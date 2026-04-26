# Telaio Analytics Interface

## Problem Statement

How might we surface meaningful activity and AI usage insight to all project members — so they can see which projects are thriving, which agents are working, and how much AI capacity is being consumed — across both per-project and org-wide views?

## Recommended Direction

A phased analytics system built in three releases:

**Phase 1 (Cluster A — "Visibility Now"):** A new top-level **Analytics page** (`/analytics`) showing org-wide project activity (ranked by task throughput), plus a per-project **Analytics tab** inside ProjectDetail showing task status breakdown over time, agent success rates, and a blocked-task alert panel. Zero schema changes — fully derived from existing `tasks`, `plans`, `projects` data.

**Phase 2 (Cluster B — "Document Signals"):** Extend the per-project analytics tab with document activity — most-viewed/edited docs, which documents were touched during agent runs. Already tracked in `document_activities`, just unsurfaced.

**Phase 3 (Cluster C — "AI Cost Ledger"):** Add token tracking at the LLM call layer (new `llm_usage` table: `project_id, model, prompt_tokens, completion_tokens, agent_profile_id, created_at`). Surface per-project and org-wide AI consumption charts with model breakdown. On-prem users get GPU/request-count equivalents.

## Key Assumptions to Validate

- [ ] **Task timestamps are reliable enough for throughput metrics** — validate that `started_at`/`completed_at` are consistently populated (not null) across agent runs. Check a few projects before building the heatmap.
- [ ] **Users want org-wide view, not just per-project** — confirm with real users that the global command center gets opened regularly, not just the project tab.
- [ ] **LLM providers expose token counts reliably** — test that LangChain/LangGraph usage metadata is accessible for all configured models (OpenAI ✓, Anthropic ✓, Ollama — verify).

## MVP Scope (Phase 1 only)

**In:**
- Global `/analytics` page with project cards ranked by task activity
- Per-project analytics tab in ProjectDetail
- Task status donut chart (done/failed/in_progress/pending breakdown)
- Daily task throughput line chart (7d / 30d / 90d presets)
- Agent success rate table (per `agent_profile_id`)
- Blocked-task alert list (tasks `in_progress` > threshold, agents with high failure rate)

**Out:** Token tracking, document analytics, user-level breakdowns, CSV export, email/Slack alerts, real-time push, custom date range picker.

## Not Doing (and Why)

- **Email/Slack alerts** — adds delivery infrastructure complexity; users can check the dashboard
- **Per-user analytics** — raises privacy questions for shared projects; start at project level
- **CSV export** — useful but not core value; add in Phase 2
- **Real-time push for analytics** — SSE is already used for task execution; analytics can poll every 30s without real-time pressure
- **Custom date range picker (Phase 1)** — presets (7d / 30d / 90d) cover 90% of use cases

## Open Questions

- Should the analytics page be accessible to all project roles (viewer, editor, owner) or only owners? *(current auth pattern suggests viewer-access is appropriate)*
- For on-prem token equivalents in Phase 3: track raw request counts, or integrate with Ollama's native metrics endpoint?
- Does the global analytics page respect project membership? (Users should only see projects they belong to.)

## Data Sources by Phase

| Phase | Data Source | Schema Changes |
|-------|-------------|----------------|
| 1 | `tasks` (status, started_at, completed_at, agent_profile_id), `projects`, `plans` | None |
| 2 | `document_activities` (action, user_id, created_at) | None |
| 3 | New `llm_usage` table | Migration required |
