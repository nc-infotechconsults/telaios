---
name: react-ui-ux
description: 'Coordinate React UI and UX work across specialized frontend skills. Use when a task spans visual design, UX flow, React component architecture, accessibility, responsive behavior, and final QA review.'
argument-hint: 'Describe the frontend task and which areas it spans'
user-invocable: true
---

# React UI and UX

Use this as the umbrella entry point when a frontend task spans multiple concerns and you want a coordinated approach across the specialized skills in this folder.

## Specialized Skills

- Use [../react-component-architecture/SKILL.md](../react-component-architecture/SKILL.md) for component boundaries, state ownership, props, and rendering structure
- Use [../ui-visual-design/SKILL.md](../ui-visual-design/SKILL.md) for hierarchy, layout, spacing, and visual clarity
- Use [../ux-flow-design/SKILL.md](../ux-flow-design/SKILL.md) for user journeys, interaction patterns, validation timing, and recovery paths
- Use [../accessibility-a11y/SKILL.md](../accessibility-a11y/SKILL.md) for semantics, keyboard behavior, focus management, labels, and screen-reader support
- Use [../responsive-ui/SKILL.md](../responsive-ui/SKILL.md) for mobile behavior, overflow handling, layout restructuring, and touch usability
- Use [../frontend-qa-review/SKILL.md](../frontend-qa-review/SKILL.md) for final functional, visual, responsive, accessibility, and code QA

## How to Use This Skill

- Start here when the task affects more than one frontend area
- Break the work into the smallest relevant specialized concerns
- Preserve existing patterns when they are strong, and redesign only weak points that create friction or confusion
- End with a QA pass when the work changes user-facing behavior

## Common Multi-Area Flows

### New Feature

- Start with [../ux-flow-design/SKILL.md](../ux-flow-design/SKILL.md)
- Shape the layout with [../ui-visual-design/SKILL.md](../ui-visual-design/SKILL.md)
- Implement cleanly with [../react-component-architecture/SKILL.md](../react-component-architecture/SKILL.md)
- Verify accessibility with [../accessibility-a11y/SKILL.md](../accessibility-a11y/SKILL.md)
- Verify breakpoints with [../responsive-ui/SKILL.md](../responsive-ui/SKILL.md)
- Finish with [../frontend-qa-review/SKILL.md](../frontend-qa-review/SKILL.md)

### Existing UI Improvement

- Start with [../frontend-qa-review/SKILL.md](../frontend-qa-review/SKILL.md) or [../ux-flow-design/SKILL.md](../ux-flow-design/SKILL.md) to identify weak points
- Redesign structure or hierarchy with [../ui-visual-design/SKILL.md](../ui-visual-design/SKILL.md)
- Refactor implementation with [../react-component-architecture/SKILL.md](../react-component-architecture/SKILL.md) as needed
- Re-check accessibility and responsive behavior before finishing

### Focused Audit

- Use one specialized skill directly when the problem is clearly isolated
- Use this umbrella skill only when multiple areas need coordination

## Completion Checks

- The right specialized skill was chosen for each subproblem
- Strong existing patterns were preserved where possible
- Weak points were redesigned intentionally
- Final QA was not skipped for user-facing changes

## Prompt Starters

- Use react-ui-ux to plan a new React feature that needs UI design, UX flow, accessibility, responsive behavior, and QA
- Use react-ui-ux to coordinate a redesign of a weak frontend flow without losing strong existing patterns
