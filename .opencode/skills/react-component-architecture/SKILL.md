---
name: react-component-architecture
description: 'Design and implement React component structure with maintainable state ownership, composition, and repo-aligned patterns. Use when building or refactoring components, pages, props, state, conditional rendering, or frontend code organization.'
argument-hint: 'Describe the component, page, or React architecture problem to solve'
user-invocable: true
---

# React Component Architecture

Use this skill when the main problem is React implementation quality: component boundaries, state ownership, composition, props, rendering structure, or code maintainability.

## When to Use

- Build a new React page, feature, or component tree
- Refactor a bloated component into clearer parts
- Fix unclear state ownership or prop sprawl
- Simplify nested rendering branches or repeated UI logic
- Align frontend code with repo patterns such as React, HeroUI, Tailwind, and Framer Motion usage

## Workflow

### 1. Define Responsibilities

- Identify what the parent container owns versus what child components should receive
- Separate data orchestration, display logic, and interaction controls where possible
- Keep each component focused on one clear responsibility

### 2. Place State Deliberately

- Keep state close to where it is used
- Lift state only when multiple branches must coordinate
- Avoid derived state unless there is a real source-of-truth need
- Make loading, error, empty, and ready states explicit in the rendering model

### 3. Prefer Composition Over Configuration Sprawl

- Extract repeated UI into small components with clear inputs
- Avoid large components with many boolean props and branching modes
- Prefer semantic prop names that express intent, not implementation details

### 4. Keep Rendering Readable

- Reduce nested ternaries and deep conditional blocks
- Extract named branches for complex states
- Keep event handlers and view logic understandable without extra explanation

### 5. Finish With Maintainability Checks

- Remove dead props, dead branches, and duplicated UI logic
- Confirm nearby contributors can understand the structure quickly
- Call out tradeoffs if a temporary compromise remains

## Completion Checks

- Component boundaries are clear
- State ownership is intentional
- Rendering paths are readable
- The implementation matches repo conventions where appropriate

## Prompt Starters

- Use react-component-architecture to refactor this oversized React component into a clearer structure
- Use react-component-architecture to decide where state should live in this page flow
