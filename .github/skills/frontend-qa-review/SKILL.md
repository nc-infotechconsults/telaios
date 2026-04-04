---
name: frontend-qa-review
description: 'Review React frontend work for functional, visual, responsive, accessibility, and maintainability regressions. Use when validating UI changes, running a QA pass, checking state coverage, or reviewing weak points before finalizing frontend work.'
argument-hint: 'Describe the frontend change, surface, or component set to review'
user-invocable: true
---

# Frontend QA Review

Use this skill when the goal is to verify a frontend change before completion and surface regressions or weak spots clearly.

## When to Use

- Review a completed or near-complete frontend change
- Run a QA pass before merging or handing off work
- Check a feature for missing states or regressions
- Validate whether a redesign actually improved weak points

## Review Areas

### Functional QA

- Verify the main user path from entry to completion
- Verify cancellation, retry, and error recovery behavior
- Check loading, empty, error, and success states
- Check that state transitions do not leave stale or misleading UI behind

### Visual QA

- Review hierarchy, alignment, spacing, emphasis, and consistency
- Confirm strong existing product patterns were preserved where appropriate
- Confirm weak patterns were improved instead of copied forward

### Responsive QA

- Check narrow, medium, and wide viewport behavior
- Look for overflow, clipped content, crowded actions, and unstable layout shifts
- Confirm touch usability where relevant

### Accessibility QA

- Check keyboard navigation, visible focus, semantic structure, and control labeling
- Check validation and status feedback behavior
- Flag major accessibility risks explicitly

### Code QA

- Check component clarity, prop sprawl, dead branches, and duplicated UI logic
- Confirm the implementation aligns with repo frontend patterns
- Note follow-up cleanup if the implementation intentionally stops short

## Output Format

- Lead with concrete findings and risks
- Separate confirmed issues from open questions
- Keep summaries short after the findings

## Completion Checks

- The main regressions and risks are explicit
- Missing states or weak points are identified
- Review output is prioritized and actionable

## Prompt Starters

- Use frontend-qa-review to review this React page for UI, UX, responsive, and accessibility regressions
- Use frontend-qa-review to validate whether this redesign fixed the weak points without introducing new issues
