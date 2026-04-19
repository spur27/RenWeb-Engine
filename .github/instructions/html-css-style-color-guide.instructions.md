---
description: 'Color usage guidelines and styling rules for RenWeb HTML/CSS/JS — dark futuristic rainbow theme.'
applyTo: '**/*.html, **/*.css, **/*.js'
---

## RenWeb HTML CSS Style Color Guide

RenWeb software uses a **dark futuristic rainbow theme**. All web content,
demo pages, and wiki pages must follow this aesthetic. These guidelines
override generic light-theme recommendations.

## Theme Identity

RenWeb UI is **always dark-background** with a **full rainbow spectrum** used
for accents, borders, and headings. The visual language is:

- Deep black or very dark backgrounds
- Near-white body text
- Full rainbow gradient borders on cards and containers
- Section-scoped accent colors (one hue per section drawn from the spectrum)
- Vibrant glow effects on hover and focus states

## Color Definitions

- **Rainbow Spectrum**: The full visible spectrum — red → orange → yellow →
  green → cyan → blue → indigo → violet → magenta → pink → rose
- **Dark Neutrals**: Near-black backgrounds (#000, #1a1a1a, #242424, #2a2a2a)
- **Light Neutrals**: Near-white text (#e0e0e0, #b0b0b0, #888888)
- **Status Colors**: Success green, error red, warning amber, info blue
- **60-30-10 Rule** (adapted for dark theme)
  - **Primary (60%)**: Black/dark-neutral backgrounds
  - **Secondary (30%)**: Dark card/elevated surfaces + near-white text
  - **Accent (10%)**: Rainbow spectrum hues for borders, headings, glows

## CSS Custom Properties (Use These Tokens)

Reference these variables from `wiki/style.css` instead of raw hex values:

```css
/* Dark theme backgrounds */
--bg-dark: #1a1a1a        /* page sections */
--bg-card: #242424        /* cards */
--bg-elevated: #2a2a2a    /* elevated surfaces */
--bg-hover: #333333       /* hover state */

/* Text */
--text-primary: #e0e0e0
--text-secondary: #b0b0b0
--text-muted: #888888

/* Status */
--color-success: #10b981
--color-error: #ef4444
--color-warning: #f59e0b

/* Spectrum accent colors */
--color-red: #ff0000
--color-orange: #ff7700
--color-yellow: #ffdd00
--color-green: #00ff00
--color-cyan: #00ffff
--color-blue: #0088ff
--color-indigo: #0000ff
--color-violet: #8800ff
--color-magenta: #ff00ff
--color-pink: #ff0088
--color-rose: #ff0044
```

## Background Colors

**Always use a dark background.** RenWeb pages render inside a native webview
window — the body background is pure black or very dark.

**Required:**

- `#000000` — body/page background
- `#1a1a1a` — section containers and sidebars
- `#242424` — cards and panels
- `#2a2a2a` — elevated/tertiary surfaces
- Semi-transparent dark overlays (`rgba(0,0,0,0.3–0.8)`) for modals/overlays

**Never Use:**

- White or off-white backgrounds
- Light grays or pastels
- Any background brighter than #444444
- Solid hot-color backgrounds (red, orange, yellow fills)

## Text Colors

All text sits on dark backgrounds, so use near-white and light-neutral values.

**Required:**

- `#e0e0e0` (`--text-primary`) — body text
- `#b0b0b0` (`--text-secondary`) — secondary/descriptive text
- `#888888` (`--text-muted`) — timestamps, labels, hints
- Spectrum accent color (e.g., `--color-cyan`) — section headings and
  highlighted names; always verify contrast ≥ 4.5:1 against the dark background

**Never Use:**

- Pure black text (`#000`) — invisible on dark backgrounds
- Mid-gray text below #666 on #1a1a1a or darker backgrounds (fails WCAG 4.5:1)
- Fully saturated spectrum colors as *body* text (too harsh for reading)
- Yellow (`#ffdd00`) as body text — acceptable only for heading accents with
  sufficient glow context

## Rainbow Gradient Borders

All cards, panels, and major containers use the standard RenWeb rainbow
`border-image` gradient. This is the primary accent device:

```css
border: 2px solid;
border-image: linear-gradient(
    90deg,
    rgba(255,0,0,1)   0%,
    rgba(255,154,0,1)  10%,
    rgba(208,222,33,1) 20%,
    rgba(79,220,74,1)  30%,
    rgba(63,218,216,1) 40%,
    rgba(47,201,226,1) 50%,
    rgba(28,127,238,1) 60%,
    rgba(95,21,242,1)  70%,
    rgba(186,12,248,1) 80%,
    rgba(251,7,217,1)  90%,
    rgba(255,0,0,1)   100%
) 1;
```

Use this gradient on card borders, modal borders, and container highlights.
Do **not** use partial or muted rainbow gradients — the full spectrum is the
RenWeb identity.

## Section Accent Colors

Each distinct section or feature area gets one spectrum color assigned to it.
Use that color for the section heading, left-border accent, and hover/glow.
The assignment order follows the spectrum:

| Section order | Accent color | CSS variable |
|---|---|---|
| 1st | Red | `--color-red` |
| 2nd | Orange | `--color-orange` |
| 3rd | Yellow | `--color-yellow` |
| 4th | Green | `--color-green` |
| 5th | Cyan | `--color-cyan` |
| 6th | Blue | `--color-blue` |
| 7th | Indigo | `--color-indigo` |
| 8th | Violet | `--color-violet` |
| 9th | Magenta | `--color-magenta` |
| 10th | Pink | `--color-pink` |
| 11th | Rose | `--color-rose` |

Apply the accent as `border-left: 4px solid var(--color-X)` on subsections,
and as the heading text color / `text-shadow` glow.

## Status & Semantic Colors

Use these for their specific semantic meaning only — not as decorative accents:

| State | Color | Hex |
|---|---|---|
| Success / pass | Green | `#10b981` |
| Error / fail | Red | `#ef4444` |
| Warning / pending | Amber | `#f59e0b` |
| Info | Blue | `#3b82f6` |

Apply as `background: rgba(color, 0.1)` fill + `border-left: 4px solid color`
on status boxes and result items.

## Gradients

### Rainbow Text Gradients (Headings)

Main headings use an animated or static rainbow text gradient:

```css
h1 {
    background: linear-gradient(90deg, #ff0000 0%, #ff9a00 10%,
        #d0de21 20%, #4fdc4a 30%, #3fdad8 40%, #2fc9e2 50%,
        #1c7fee 60%, #5f15f2 70%, #ba0cf8 80%, #fb07d9 90%,
        #ff0000 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    background-size: 200% 100%;
    animation: rainbow-shift 8s linear infinite;
}
```

### Section-Scoped Gradients (h1/h2 headings)

For pages with a single accent color, use a two-stop gradient within that hue:

```css
/* Example: media page (purple accent) */
h1 {
    background: linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}
```

### Background Gradients

Body backgrounds are **flat black** (`#000`). Do not add gradients to the
page body. Gradients are reserved for:

- Card `border-image` (rainbow)
- Heading text fills (rainbow or section-hue gradient)
- Button hover states (section-hue gradient)
- Glow `box-shadow` effects (section-hue with opacity)

**Never use light-to-light gradients** (e.g., #E6F2FF to #F5F7FA). These have
no place in the RenWeb dark theme.

## Hover & Glow Effects

Interactive elements use translate-up + colored `box-shadow` glow on hover:

```css
.card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(VAR_COLOR, 0.3);
}
```

Buttons use a gradient fill on hover matching the page's section accent:

```css
button:hover {
    background: linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%);
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(168, 85, 247, 0.3);
}
```

## Colors to Avoid

- Any **light background** (white, off-white, light gray, pastels)
- **Mid-gray text** on dark backgrounds when contrast ratio < 4.5:1
- **Solid hot-color fills** as backgrounds (flat red/orange/yellow sections)
- Mixing **rainbow gradients with cool-only or warm-only palettes** — always
  use the full spectrum for RenWeb rainbow elements
- **Generic blue-only** UI (it violates the rainbow identity)
- Desaturated or "professional corporate" color palettes — RenWeb is bold

## Accessibility in the Dark Theme

Even with vivid colors, maintain WCAG 2.2 Level AA:

- Body text (`#e0e0e0` on `#242424`) — contrast ≈ 7.6:1 ✓
- Secondary text (`#b0b0b0` on `#242424`) — contrast ≈ 5.5:1 ✓
- Muted text (`#888888` on `#1a1a1a`) — contrast ≈ 3.7:1 (use only for
  non-essential hints; never for primary content)
- Status success `#10b981` on `#242424` — contrast ≈ 4.6:1 ✓
- Status error `#ef4444` on `#242424` — contrast ≈ 4.7:1 ✓
- Spectrum accent headings (e.g., `#00ffff` cyan on `#1a1a1a`) — contrast
  ≈ 14:1 — always verify accent-on-background passes 4.5:1

Never place vibrant spectrum colors as small body text on black — they can
technically pass contrast but cause eye strain. Use them for headings, borders,
and interactive states only.

## Additional Resources

- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [UI Color Palette Best Practices](https://www.interaction-design.org/literature/article/ui-color-palette)
- [Color Combination Resource](https://www.figma.com/resource-library/color-combinations/)
