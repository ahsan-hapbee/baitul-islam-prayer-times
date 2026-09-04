# Baitul Islam Prayer Timings — agent context

Static, mobile-first 2026 iqamah viewer for **Baitul Islam Mosque** (Maple / Vaughan, ON).
Live: https://ahsan-hapbee.github.io/baitul-islam-prayer-times/
Repo: `ahsan-hapbee/baitul-islam-prayer-times` (GitHub Pages from `main`).
Timezone: `America/Toronto`. Chart changes each Friday (and 1 Nov when DST ends).

When restarting work here, read this file plus `.grok/rules/knowledge-graph.md`.

## Stack

No build step. Static HTML/CSS/JS.

| File | Role |
|------|------|
| `index.html` | Markup; cache-bust assets with `?v=` |
| `styles.css` | Theme + portrait/landscape layout |
| `app.js` | Clock, next prayer, today, week, year |
| `timings.js` | 2026 iqamah data |
| `qibla.js` | 3D Qibla finder |
| `luna.js` | Moon/sun sky map |
| `suncalc.js` | Sun/moon positions (vendored) |

Current cache token: **`?v=23`**. Bump it whenever CSS/JS changes so phones pick up the new files.

## Product rules

- Glanceable on a phone first; landscape and tablets must reflow (not a 440px portrait column).
- Default location for Qibla/Luna: **60 Bashir St, Maple** (`43.8649, -79.5418`), magnetic declination **−10.9°**. Qibla ≈ **54.5° NE**.
- **Do not bring back azan/alarms.** Web audio cannot be trusted after backgrounding. Leftover file `audio/azan_my_choice.mp3` is untracked — ignore it.
- Luna sky view is a “look through the phone” camera. Heading/altitude come from `lunaLook()` (W3C look vector). Do **not** subtract `screen.orientation.angle` from the compass — that caused a ~90° portrait/landscape mismatch. Qibla yaw still uses `heading - screenAngle()` and was left as-is because it stayed consistent.
- Moon disks must render at device pixel ratio with an antialiased limb (`drawMoonDisk`). Do not go back to the 40×40 sprite.
- After UI changes, hard-refresh the live Pages site; bump `?v=`.

## Layout

- Portrait phones: single column, wrap `min(440px, 100%)`.
- Landscape / width ≥ 720px: two-column grid. Short landscape: Qibla and Luna span full width with stage on the left and controls on the right.
- Safe-area insets on all four sides.

## Deploy

GitHub Pages from `main`. Optional: Vercel / Cloudflare Pages (`npx wrangler pages deploy .`). Cloudflare account + MCP were onboarded in Grok (see knowledge graph); OAuth for account MCP servers still needs `/mcps` → `i` after restart.

## Local

```bash
npx --yes serve .
```
