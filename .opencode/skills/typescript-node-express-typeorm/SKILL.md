---
name: typescript-node-express-typeorm
description: 'Entry skill for TypeScript backend work with Node.js, Express, TypeORM, and relational DBMS concerns. Use to route work to focused skills for architecture, migration safety, and mandatory testing.'
argument-hint: 'Describe the backend task so the right focused skill can be selected'
user-invocable: true
---

# TypeScript Node Express TypeORM

Use this as an entrypoint skill for TypeScript backend development. It routes to focused skills instead of using one monolithic workflow.

## When to Use

- You need a starting point for backend tasks and want to select the right focused workflow
- The work touches one or more of: architecture, DBMS migration safety, or testing gates

## Focused Skills

### 1. Architecture and Pattern Selection

- Use [repository-service-cqrs-event-driven](../repository-service-cqrs-event-driven/SKILL.md) for repository/service structure and for deciding when CQRS or event-driven patterns are justified.

### 2. Generic Relational DBMS Migration Safety

- Use [dbms-migration-safety](../dbms-migration-safety/SKILL.md) for production-safe schema evolution that preserves consistency and avoids production breakage.

### 3. Mandatory Testing Gates

- Use [backend-testing-unit-integration](../backend-testing-unit-integration/SKILL.md) to enforce mandatory unit and integration testing for all meaningful backend changes.

## Policy Baseline

- Keep relational DBMS guidance generic and portable across engines where possible
- Migrations must preserve consistency and must not break production systems
- Prefer repository/service architecture, and introduce CQRS or event-driven patterns when complexity justifies it
- Unit and integration tests are mandatory quality gates

## Completion Checks

- The backend task is routed to one or more focused skills
- Migration work follows non-breaking consistency-first practices
- Architecture decisions document why CQRS or events are used (or not used)
- Unit and integration test gates are both satisfied

## Prompt Starters

- Use typescript-node-express-typeorm to route this backend task to the right focused skill
- Use typescript-node-express-typeorm for a migration that must stay production-safe and DBMS-generic
- Use typescript-node-express-typeorm to apply service/repository with CQRS or events only when justified
