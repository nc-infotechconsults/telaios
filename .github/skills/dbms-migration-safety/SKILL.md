---
name: dbms-migration-safety
description: 'Design and execute production-safe relational DBMS migrations that stay consistent and do not break running systems. Use when planning schema changes, backfills, constraints, index changes, or deployment rollout steps.'
argument-hint: 'Describe the schema change, data volume, and production constraints'
user-invocable: true
---

# DBMS Migration Safety

Use this skill for relational database evolution with a strict goal: preserve data consistency and avoid production breakage.

## When to Use

- Add, rename, or remove columns and tables
- Introduce or tighten constraints
- Run data backfills or data shape transformations
- Add, modify, or remove indexes
- Plan zero-downtime deployment sequences

## Workflow

### 1. Assess Change Risk

- Classify the change: additive, destructive, data-transforming, or locking-risk
- Estimate table size, write rate, and acceptable lock duration
- Define rollback or forward-fix strategy before execution

### 2. Choose a Non-Breaking Rollout Pattern

- Prefer additive-first strategy: add new structures first, keep old paths compatible
- For contract changes, use expand/contract rollout across multiple deployments
- Backfill in chunks with progress checkpoints for large datasets

Decision points:
- If writes continue during rollout, dual-write or bridge both schemas during transition
- If lock risk is high, avoid single-shot rewrites and choose phased migrations

### 3. Preserve Consistency Guarantees

- Wrap critical data transitions in safe transactional boundaries when feasible
- Enforce invariants with constraints only after data conforms
- Guard idempotency for rerun safety in migration scripts

Decision points:
- If full transaction is too large, split into deterministic, resumable batches
- If uniqueness is introduced, pre-clean conflicts before adding unique constraints

### 4. Verify Before and After Deployment

- Validate migration on production-like data volume
- Measure runtime and lock behavior before production execution
- Run post-migration consistency checks and alert on mismatches

### 5. Release Safely

- Sequence app and DB deploys to avoid incompatible versions
- Keep fallback path available until validation is complete
- Remove deprecated schema only after traffic proves stable

## Completion Checks

- Migration strategy avoids breaking running production traffic
- Data consistency checks pass before and after rollout
- Rollout is resumable or safely reversible per team policy
- Lock and performance impact are validated on representative data
- Old schema paths are removed only after successful stabilization

## Prompt Starters

- Use dbms-migration-safety to plan a zero-downtime column rename with high write traffic
- Use dbms-migration-safety to review this migration for lock risk and consistency gaps
- Use dbms-migration-safety to design a phased backfill and constraint enforcement plan
