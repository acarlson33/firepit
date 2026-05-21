# Firepit Mobile Color Palette

This document captures the visual color system the web app uses so a React Native mobile client can match the same product look and feel.

## Source Of Truth

- The primary theme tokens live in [src/index.css](../src/index.css).
- The profile background presets live in [src/lib/preset-gradients.ts](../src/lib/preset-gradients.ts).
- The preset profile swatches live in [src/lib/preset-frames.ts](../src/lib/preset-frames.ts).
- Do not rely on the PWA manifest colors in [src/app/manifest.ts](../src/app/manifest.ts) for the in-app UI; those are metadata defaults, not the visual theme.

## Color Strategy

Firepit uses warm neutrals, an amber-orange primary accent, a muted teal secondary accent, and soft semantic surfaces. The overall feel should be clean, slightly warm, and calm rather than saturated or neon.

Use semantic tokens instead of inventing new colors. If a React Native theme system cannot consume OKLCH directly, translate these tokens into equivalent hex values in the mobile theme layer while keeping the same relative contrast and warmth.

## Core Semantic Tokens

### Light Theme

| Token                 | Value                   | Usage                              |
| --------------------- | ----------------------- | ---------------------------------- |
| `background`          | `oklch(0.985 0.01 95)`  | App background                     |
| `foreground`          | `oklch(0.225 0.035 62)` | Primary text                       |
| `card`                | `oklch(1 0 0)`          | Elevated surfaces                  |
| `cardForeground`      | `oklch(0.225 0.035 62)` | Text on cards                      |
| `popover`             | `oklch(1 0 0)`          | Menus, sheets, overlays            |
| `popoverForeground`   | `oklch(0.225 0.035 62)` | Text on overlays                   |
| `primary`             | `oklch(0.63 0.17 43)`   | Main brand action                  |
| `primaryForeground`   | `oklch(0.985 0.01 95)`  | Text on primary surfaces           |
| `secondary`           | `oklch(0.95 0.01 88)`   | Secondary surfaces                 |
| `secondaryForeground` | `oklch(0.225 0.035 62)` | Text on secondary surfaces         |
| `muted`               | `oklch(0.96 0.006 88)`  | Subtle backgrounds                 |
| `mutedForeground`     | `oklch(0.52 0.02 62)`   | Low-emphasis text                  |
| `accent`              | `oklch(0.93 0.02 76)`   | Hover, selection, highlight states |
| `accentForeground`    | `oklch(0.225 0.035 62)` | Text on accent surfaces            |
| `destructive`         | `oklch(0.6 0.2 25)`     | Errors, deletes, danger actions    |
| `border`              | `oklch(0.9 0.01 85)`    | Dividers and outlines              |
| `input`               | `oklch(0.9 0.01 85)`    | Input borders                      |
| `ring`                | `oklch(0.63 0.17 43)`   | Focus rings                        |

### Dark Theme

| Token                 | Value                       | Usage                              |
| --------------------- | --------------------------- | ---------------------------------- |
| `background`          | `oklch(0.14 0.02 62)`       | App background                     |
| `foreground`          | `oklch(0.985 0.01 95)`      | Primary text                       |
| `card`                | `oklch(0.19 0.02 62)`       | Elevated surfaces                  |
| `cardForeground`      | `oklch(0.985 0.01 95)`      | Text on cards                      |
| `popover`             | `oklch(0.19 0.02 62)`       | Menus, sheets, overlays            |
| `popoverForeground`   | `oklch(0.985 0.01 95)`      | Text on overlays                   |
| `primary`             | `oklch(0.75 0.14 52)`       | Main brand action                  |
| `primaryForeground`   | `oklch(0.16 0.02 62)`       | Text on primary surfaces           |
| `secondary`           | `oklch(0.25 0.02 62)`       | Secondary surfaces                 |
| `secondaryForeground` | `oklch(0.985 0.01 95)`      | Text on secondary surfaces         |
| `muted`               | `oklch(0.23 0.02 62)`       | Subtle backgrounds                 |
| `mutedForeground`     | `oklch(0.74 0.02 85)`       | Low-emphasis text                  |
| `accent`              | `oklch(0.29 0.03 78)`       | Hover, selection, highlight states |
| `accentForeground`    | `oklch(0.985 0.01 95)`      | Text on accent surfaces            |
| `destructive`         | `oklch(0.704 0.191 22.216)` | Errors, deletes, danger actions    |
| `border`              | `oklch(1 0 0 / 10%)`        | Dividers and outlines              |
| `input`               | `oklch(1 0 0 / 15%)`        | Input borders                      |
| `ring`                | `oklch(0.75 0.14 52)`       | Focus rings                        |

## Gradients And Accent Surfaces

The app uses soft background gradients to keep the UI from feeling flat.

| Token                      | Value                                                                  |
| -------------------------- | ---------------------------------------------------------------------- |
| `bg-gradient-top-left`     | `oklch(0.74 0.16 52 / 0.12)` light, `oklch(0.75 0.16 52 / 0.15)` dark  |
| `bg-gradient-bottom-right` | `oklch(0.72 0.14 180 / 0.08)` light, `oklch(0.72 0.16 180 / 0.1)` dark |

Use these as subtle atmospheric overlays, not as dominant panel fills.

## Sidebar And Navigation Tokens

Sidebar colors mirror the core theme and should not diverge on mobile navigation surfaces.

| Token                      | Light                   | Dark                   |
| -------------------------- | ----------------------- | ---------------------- |
| `sidebar`                  | `oklch(0.99 0.006 92)`  | `oklch(0.18 0.02 62)`  |
| `sidebarForeground`        | `oklch(0.225 0.035 62)` | `oklch(0.985 0.01 95)` |
| `sidebarPrimary`           | `oklch(0.63 0.17 43)`   | `oklch(0.75 0.16 52)`  |
| `sidebarPrimaryForeground` | `oklch(0.985 0.01 95)`  | `oklch(0.16 0.02 62)`  |
| `sidebarAccent`            | `oklch(0.96 0.006 88)`  | `oklch(0.23 0.02 62)`  |
| `sidebarAccentForeground`  | `oklch(0.225 0.035 62)` | `oklch(0.985 0.01 95)` |
| `sidebarBorder`            | `oklch(0.9 0.01 85)`    | `oklch(1 0 0 / 10%)`   |
| `sidebarRing`              | `oklch(0.63 0.17 43)`   | `oklch(0.75 0.14 52)`  |

## Charts And Data Visualization

The chart palette is intentionally varied but still close to the brand range.

| Token     | Light                  | Dark                   |
| --------- | ---------------------- | ---------------------- |
| `chart-1` | `oklch(0.66 0.2 43)`   | `oklch(0.75 0.16 52)`  |
| `chart-2` | `oklch(0.7 0.12 180)`  | `oklch(0.72 0.16 180)` |
| `chart-3` | `oklch(0.45 0.06 240)` | `oklch(0.81 0.17 74)`  |
| `chart-4` | `oklch(0.8 0.17 74)`   | `oklch(0.69 0.17 290)` |
| `chart-5` | `oklch(0.73 0.16 55)`  | `oklch(0.7 0.16 25)`   |

## Profile Preset Colors

Use these hex colors when rendering profile frames, backgrounds, or avatar-style accents that need to match the web app exactly.

### Single Colors

`#1a1a2e`, `#16213e`, `#0f3460`, `#533483`, `#e94560`, `#2d3436`, `#636e72`, `#d63031`, `#e17055`, `#fdcb6e`, `#00b894`, `#0984e3`, `#6c5ce7`, `#a29bfe`, `#fd79a8`, `#81ecec`

### Gradients

| Name          | Colors                            |
| ------------- | --------------------------------- |
| Blessed Calm  | `#667eea` → `#764ba2`             |
| Sunrise       | `#ff6b6b` → `#feca57`             |
| Deep Space    | `#0f0c29` → `#302b63` → `#24243e` |
| Coral Dream   | `#ff9a9e` → `#fecfef`             |
| Forest Mist   | `#66785f` → `#91ac8f`             |
| Midnight City | `#232526` → `#414345`             |
| Royal Passion | `#c31432` → `#240b36`             |
| Ocean Haze    | `#2c3e50` → `#4ca1af`             |
| Firewatch     | `#c94b4b` → `#4b134f`             |
| Cosmic Fusion | `#ff00cc` → `#333399`             |
| Frost         | `#c9d6ff` → `#e2e2e2`             |
| Moss          | `#134e5e` → `#71b280`             |

## Mobile Implementation Rules

- Prefer semantic token names in the mobile theme layer instead of hardcoded color values in components.
- Preserve the warm amber primary accent; do not swap the brand to a default blue or purple system theme.
- Keep surfaces soft and mostly neutral so message content and status indicators stay readable.
- Use the dark theme as a true inverse of the light theme, not as a separate palette.
- Match hover, focus, and selected states using the same accent family as the web app.
- Keep destructive actions visibly red and distinct from the brand accent.

## Practical Mapping Guidance For AI Models

- If a component needs a background, use `background` first, then `card` or `popover` for elevated layers.
- If a component needs emphasis, use `primary` and `ring` together.
- If a component needs a quiet surface, use `muted` or `secondary`.
- If a component needs attention or error signaling, use `destructive`.
- If a component is decorative, prefer the preset gradients or the profile swatches rather than inventing a new hue.

## Message Timeline Note

- Do not claim that channel timelines only show newly created messages.
- The chat surface loads recent channel history on entry and can page older messages with the existing load-more flow.
- There is no separate public channel-message list REST endpoint to document here; the client uses existing message-list helpers and Appwrite queries to backfill history.
