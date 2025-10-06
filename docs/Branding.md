# TestRun Brand System

## Identity
- **Product name:** TestRun
- **Tagline:** "Record. Compose. Ship reliable tests."
- **Voice:** Confident, collaborative, pragmatic. Focus on clarity over flair.

## Logo & Iconography
- Primary mark is a forward arrow encapsulated in an indigo orbit. It represents acceleration from recording to execution.
- Use the bundled assets:
  - `resources/icon.png` — 512×512 Electron application icon (also used to derive `.icns` / `.ico`).
  - `public/favicon.png` — 128×128 favicon served by the renderer.
- When badges or monochrome marks are required, crop the arrow glyph and render in `brand-500` on `ink-900`.

## Color Palette
| Token | Hex | Usage |
| ----- | --- | ----- |
| `brand-500` | `#5F5CFF` | Primary accents, call-to-action buttons |
| `brand-400` | `#6F82FF` | Hover / active accents |
| `accent-500` | `#22E1B6` | Success states, positive highlights |
| `ink-900` | `#070B1A` | App chrome background |
| `ink-800` | `#0D1429` | Panels, cards, navigation |
| `surface-200` | `#C9CDFB` | Muted text, dividers |
| `surface-50` | `#F5F6FF` | Primary typography |
| `amberglass` | `#FF9472` | Warnings, failure messaging |

**Contrast guidance**
- Maintain minimum 4.5:1 ratio; `brand-500` on `ink-900` and `surface-50` on `ink-900` exceed WCAG AA.
- For disabled states use `surface-300` text on `ink-800` backgrounds.

## Typography
- Primary typeface: **Manrope** (semibold titles), fallback to **Inter** and system UI stack.
- Font stack defined in Tailwind `fontFamily.sans` and applied globally.
- Heading weights: 600–700. Body text: 400–500.

## UI Application
- Navigation uses `ink-800` with subtle brand glow on active routes.
- Content surfaces rely on rounded 16px radii, `ink-800` backgrounds, and `brand-500` borders for focus states.
- Action buttons:
  - Primary (filled) with `brand-500` background, accent glow.
  - Secondary / tertiary adopt outline or subtle `ink-700` backgrounds.
- Status colors
  - Success: `accent-500`
  - Warning / failure: `amberglass`
  - Neutral: `surface-300`

## Illustrations & Icons
- Continue to use Lucide outline icons, tinted with `surface-200` for inactive and `brand-400` for active states.
- Keep icon strokes at 1.5–2px for clarity against dark backgrounds.

## Usage Do / Don't
- ✅ Use gradient-backed hero sections sparingly (landing modals, reminders).
- ✅ Combine `brand-500` with `accent-500` for dual-tone emphasis (e.g., AI callouts).
- ❌ Avoid pure black backgrounds; stick to `ink-*` tones to keep depth.
- ❌ Avoid mixing saturated reds with `brand-500`; use `amberglass` for warnings.

## Assets
- Brand source icon generator: `scripts/generate-brand-assets.mjs` (uses `pngjs`).
- To regenerate assets run: `node scripts/generate-brand-assets.mjs`.

## Release Collateral
- Electron packaging reads from `resources/icon.png` (configured in `electron-builder.config.ts`).
- README, docs, and GitHub releases should reference the tagline and palette for consistency.
