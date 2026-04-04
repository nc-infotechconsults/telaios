---
name: backend-testing-unit-integration
description: 'Enforce backend quality with mandatory unit and integration tests for all meaningful changes. Use when implementing features, fixing bugs, reviewing PRs, or validating migrations and data access behavior.'
argument-hint: 'Describe the backend change and expected risk areas to test'
user-invocable: true
---

# Backend Testing Unit Integration

Use this skill to enforce a non-negotiable test baseline: both unit tests and integration tests are required.

## When to Use

- Any backend feature implementation or refactor
- Bug fixes that can regress behavior
- Data-access changes and migration rollouts
- API contract changes and error-handling updates

## Required Policy

- Unit tests are mandatory
- Integration tests are mandatory
- A change is not complete until both suites cover the affected behavior

## Workflow

### 1. Define Risk and Test Scope

- List changed behaviors, invariants, and failure modes
- Map each risk to unit and integration coverage explicitly

### 2. Implement Unit Tests

- Test domain/service logic with fast deterministic cases
- Cover edge conditions, branch logic, and error paths
- Mock only true external boundaries

### 3. Implement Integration Tests

- Exercise real persistence and API boundaries
- Validate repository behavior, transactions, and constraints
- Validate request validation, auth checks, and error mapping

### 4. Add Migration and Concurrency Coverage When Relevant

- For schema changes, test migration effects on representative data
- For critical writes, test idempotency and concurrency-sensitive behavior

### 5. Gate Completion

- Fail the change if unit suite is missing or incomplete
- Fail the change if integration suite is missing or incomplete
- Report remaining uncovered risks explicitly

## Completion Checks

- Unit tests exist for business logic and edge cases
- Integration tests exist for persistence and API behavior
- Migration-sensitive changes include migration validation coverage
- High-risk flows include concurrency or idempotency checks
- Test evidence is sufficient for release confidence

## Prompt Starters

- Use backend-testing-unit-integration to create a complete unit and integration test plan for this feature
- Use backend-testing-unit-integration to review this PR for missing test coverage gates
- Use backend-testing-unit-integration to add tests for this migration and transaction flow
