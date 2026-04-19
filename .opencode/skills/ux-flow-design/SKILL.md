---
name: ux-flow-design
description: 'Design user flows, interaction patterns, feedback states, and friction reduction for React interfaces. Use when defining journeys, forms, multi-step flows, actions, validation timing, empty states, or redesigning confusing UX behavior.'
argument-hint: 'Describe the user flow, interaction, or UX problem to improve'
user-invocable: true
---

# UX Flow Design

Use this skill when the main problem is how the feature behaves for the user: flow design, interaction sequencing, recovery states, validation timing, or reducing friction.

## When to Use

- Design a new user journey or multi-step flow
- Improve confusing action sequences or state transitions
- Add validation, confirmations, retries, or recovery behavior
- Fix weak empty, loading, success, or error experiences

## Workflow

### 1. Define the User Goal

- Write down the user task in plain language
- Identify the entry point, critical actions, likely mistakes, and completion state
- Treat the user goal as more important than preserving every current interaction detail

### 2. Remove Friction

- Reduce unnecessary steps and competing decisions
- Prefer progressive disclosure over showing everything at once
- Keep each step focused on one main decision or action

### 3. Design States Explicitly

- Plan loading, empty, error, success, cancellation, and retry states
- Make status changes visible and easy to understand
- Prevent duplicate submissions and ambiguous pending states

### 4. Improve Recovery and Confidence

- Provide clear validation and actionable error messages
- Let users recover from mistakes without starting over when possible
- Use confirmation or undo for destructive actions when appropriate

### 5. Validate the Journey

- Walk through the happy path and the likely failure paths
- Redesign weak current interactions if they create confusion or hesitation
- Confirm the flow feels direct and predictable

## Completion Checks

- The user goal is explicit
- Each step has a clear purpose
- Error and recovery paths are handled
- Weak interaction patterns were improved instead of preserved

## Prompt Starters

- Use ux-flow-design to improve this multi-step onboarding flow and reduce friction
- Use ux-flow-design to redesign the validation and retry behavior in this form
