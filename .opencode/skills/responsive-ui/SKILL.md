---
name: responsive-ui
description: 'Design and implement responsive React interfaces that stay usable across viewport sizes and input methods. Use when adapting layouts for mobile, tablet, desktop, touch interactions, dense data views, overflow issues, or brittle layout behavior.'
argument-hint: 'Describe the layout or responsive behavior problem to improve'
user-invocable: true
---

# Responsive UI

Use this skill when the main problem is making the interface robust across different screen sizes, density constraints, and interaction modes.

## When to Use

- Adapt a page or component for mobile and desktop
- Fix overflow, clipping, wrapping, or collapsed layout issues
- Rework data-dense UI that fails on smaller screens
- Improve touch usability and remove hover-only dependencies

## Workflow

### 1. Check the Core Content

- Identify what must remain visible and actionable at small sizes
- Remove or defer non-essential content before compressing everything
- Preserve the primary task at every breakpoint

### 2. Restructure, Do Not Just Shrink

- Reflow content into stacks, sections, or progressive disclosure when needed
- Convert brittle side-by-side layouts into robust small-screen patterns
- Rethink dense tables and cards rather than forcing them into tiny spaces

### 3. Protect Usability

- Keep tap targets large enough for touch
- Avoid hover-only access to critical actions
- Prevent clipped text, hidden actions, and unstable layout jumps

### 4. Verify Realistic States

- Check long labels, missing data, loading placeholders, and error messages
- Confirm the UI remains stable under slow or partial data
- Confirm secondary actions remain reachable without crowding the primary path

### 5. Finish With Breakpoint Review

- Review narrow, medium, and wide layouts
- Confirm readability, action placement, and interaction comfort
- Call out any remaining responsive tradeoffs explicitly

## Completion Checks

- The primary workflow remains usable on narrow screens
- The layout does not rely on fragile compression
- Touch interaction is supported where relevant
- Edge cases do not break the layout

## Prompt Starters

- Use responsive-ui to adapt this dashboard for small screens without losing the main workflow
- Use responsive-ui to fix overflow and action placement issues in this card layout
