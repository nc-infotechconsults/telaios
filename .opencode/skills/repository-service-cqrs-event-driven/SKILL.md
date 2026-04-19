---
name: repository-service-cqrs-event-driven
description: 'Design backend application structure using repository and service layers, with CQRS and event-driven patterns when complexity justifies them. Use when implementing domain logic, coordinating writes, separating read models, or integrating domain events.'
argument-hint: 'Describe the use case, read/write complexity, and integration needs'
user-invocable: true
---

# Repository Service CQRS Event Driven

Use this skill to structure backend logic so it stays maintainable as complexity grows.

## When to Use

- Build or refactor service and repository layers
- Clarify business logic ownership and transaction boundaries
- Introduce CQRS for heavy or specialized read models
- Introduce event-driven flows for decoupled side effects or integrations

## Workflow

### 1. Start With Service and Repository Baseline

- Keep route handlers thin and orchestration inside services
- Keep repositories focused on persistence concerns and query composition
- Keep domain invariants and business rules in services

### 2. Decide Whether to Introduce CQRS

- Use simple service/repository when read and write models are similar
- Introduce CQRS when read requirements diverge strongly from write workflows
- Separate commands (state changes) from queries (read projections)

Decision points:
- If projections need denormalized views, create dedicated query models
- If operational complexity outweighs benefits, keep a unified model

### 3. Decide Whether to Introduce Events

- Emit domain events for meaningful business state transitions
- Keep event payloads stable, explicit, and versionable
- Make handlers idempotent for at-least-once delivery scenarios

Decision points:
- If side effects are synchronous and critical, keep them in service transaction flow
- If side effects are cross-boundary or slow, move to asynchronous event handlers

### 4. Protect Consistency and Reliability

- Define transaction boundary per command use case
- Use outbox or equivalent reliability pattern for event publication where needed
- Prevent duplicate processing with idempotency keys or uniqueness constraints

### 5. Keep Observability and Ownership Clear

- Add traceable logs and correlation identifiers across command and event paths
- Document ownership for each service, repository, command, query, and event handler

## Completion Checks

- Service/repository boundaries are clear and intentional
- CQRS is used only where read/write divergence justifies it
- Event-driven flows are reliable and idempotent
- Transaction boundaries preserve domain invariants
- Operational ownership and observability are explicit

## Prompt Starters

- Use repository-service-cqrs-event-driven to refactor this feature to clear service and repository boundaries
- Use repository-service-cqrs-event-driven to decide if CQRS is justified for this reporting workload
- Use repository-service-cqrs-event-driven to add domain events with idempotent handlers
