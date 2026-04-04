---
name: accessibility-a11y
description: 'Implement and review accessibility for React interfaces. Use when checking semantics, keyboard behavior, focus management, labels, ARIA, contrast, screen reader support, forms, dialogs, or preventing accessibility regressions.'
argument-hint: 'Describe the component or flow that needs accessibility work'
user-invocable: true
---

# Accessibility A11y

Use this skill when accessibility is the main concern or when a UI change risks keyboard, focus, semantic, or screen-reader regressions.

## When to Use

- Review a component or page for accessibility issues
- Implement dialogs, forms, menus, tabs, or custom interactive controls
- Fix keyboard traps, poor focus behavior, or missing labels
- Ensure status changes and validation feedback are accessible

## Workflow

### 1. Start With Semantics

- Prefer native HTML elements before custom replacements
- Use semantic structure for headings, lists, forms, and buttons
- Add ARIA only when native semantics are insufficient

### 2. Verify Operability

- Ensure all interactive controls work with keyboard only
- Keep tab order logical and predictable
- Preserve visible focus states and avoid focus loss during updates

### 3. Verify Meaning

- Ensure every control has an accessible name
- Associate helper text, descriptions, and errors correctly
- Avoid using color alone to signal meaning or status

### 4. Handle Dynamic UI Carefully

- Confirm dialogs manage initial focus, trap focus, and return focus on close
- Confirm live updates and validation announcements are not noisy or missing
- Confirm custom controls expose state and role correctly

### 5. Finish With Regression Checks

- Walk through the feature with keyboard only
- Review major state changes and validation states
- Flag remaining accessibility risks explicitly

## Completion Checks

- The interface is keyboard-operable
- Focus movement is deliberate and visible
- Labels and status messaging are programmatically available
- No major accessibility regression is left unmentioned

## Prompt Starters

- Use accessibility-a11y to audit this modal and fix focus and keyboard behavior
- Use accessibility-a11y to review this form for labeling and validation accessibility issues
