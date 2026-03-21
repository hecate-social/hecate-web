# PLAN: Hecate Web Design System

**Status:** Planning
**Created:** 2026-03-21

## Problem

Pages use hardcoded Tailwind classes with inconsistent sizing: `text-[9px]`, `text-[10px]`, `text-[11px]` scattered everywhere. Low contrast (`surface-500` on `surface-900`). No shared typography scale. Each page independently picks sizes, making the app feel inconsistent and hard to read.

## Solution

A CSS variable-based design system that all pages consume. One place to tune the entire app's readability.

## Design Tokens

```css
:root {
  /* Typography scale */
  --hx-text-xs: 0.75rem;     /* 12px — hints, badges, metadata */
  --hx-text-sm: 0.8125rem;   /* 13px — labels, secondary */
  --hx-text-base: 0.875rem;  /* 14px — body, values, primary content */
  --hx-text-lg: 1.125rem;    /* 18px — page titles */
  --hx-text-xl: 1.5rem;      /* 24px — hero text */

  /* Spacing */
  --hx-row-padding-y: 0.5rem;
  --hx-row-padding-x: 0.75rem;
  --hx-section-gap: 1.5rem;
  --hx-page-padding: 1.5rem;

  /* Contrast levels (text on surface-900 background) */
  --hx-text-primary: var(--color-surface-100);     /* high contrast — values, active */
  --hx-text-secondary: var(--color-surface-300);    /* medium — body text */
  --hx-text-muted: var(--color-surface-500);        /* low — labels, hints */
  --hx-text-disabled: var(--color-surface-600);     /* very low — disabled, empty states */

  /* Interactive */
  --hx-cursor-bg: rgba(var(--color-hecate-600), 0.2);
  --hx-cursor-ring: rgba(var(--color-hecate-500), 0.4);
  --hx-hover-bg: rgba(var(--color-surface-800), 0.5);

  /* Command bar */
  --hx-bar-height: 32px;
  --hx-bar-text: var(--hx-text-xs);
}
```

## Component Patterns

### Section Header
```svelte
<div class="hx-section-header">SECTION NAME</div>
```

### Data Row (navigable)
```svelte
<div class="hx-row" class:hx-row-active={isCursor}>
  <span class="hx-row-label">Label</span>
  <span class="hx-row-value">Value</span>
</div>
```

### Command Bar
```svelte
<div class="hx-command-bar">...</div>
```

## Implementation

1. Create `src/lib/styles/design-system.css` with CSS custom properties
2. Create `src/lib/styles/components.css` with shared component classes
3. Import in root layout
4. Migrate pages one at a time (Site first, then Settings, then others)

## Pages to Migrate

| Page | Priority | Current Issues |
|------|----------|---------------|
| Site | Done | Redesigned with proper sizing |
| Settings | High | 10px everywhere, low contrast |
| Home | Medium | Mixed sizing |
| Observer/* | Medium | Tiny text for data-heavy views |
| Appstore | Low | Already uses cards, less affected |
| LLM | Low | Chat UI, different pattern |
| Briefcase | Low | File browser, different pattern |

## Non-Goals

- Not changing the dark theme aesthetic
- Not adding light mode (yet)
- Not redesigning layouts — just consistent sizing/contrast
- Not touching plugin pages (they own their styles)
