# Knowledge graph (cached restart context)

This file is auto-loaded by Grok from `.grok/rules/`. It is the durable map of what this project is, what we decided, and where to pick up.

Last updated: 2026-09-04. Asset cache: `?v=23`. HEAD at last write: moon retina render (`35f6d5d`).

```mermaid
flowchart TB
  subgraph product [Baitul Islam 2026]
    times[Prayer times]
    qibla[Qibla 3D]
    luna[Luna sky]
  end

  times --> appJs[app.js + timings.js]
  qibla --> qiblaJs[qibla.js]
  luna --> lunaJs[luna.js + suncalc.js]
  product --> pages[GitHub Pages live site]
  product --> css[styles.css responsive]
  css --> portrait[Portrait column]
  css --> landscape[Landscape / tablet grid]
  lunaJs --> look[lunaLook W3C -Z heading]
  lunaJs --> paths[2h dotted sun/moon paths]
  lunaJs --> moon[Retina moon disk]
  qiblaJs --> maple[60 Bashir St 54.5 deg NE]
end
```

## Entities

### Site
- **Name:** Baitul Islam Mosque prayer timings 2026
- **Audience:** Maple / Vaughan congregation; unofficial convenience view of AMJ Canada *Salat Timings 2026*
- **Live:** https://ahsan-hapbee.github.io/baitul-islam-prayer-times/
- **Source chart:** `Salat-Timings-2026-2.pdf` (Friday periods; DST 1 Nov)
- **Mosque:** 10610 Jane Street, Maple, ON · 905-303-4000 · tarbiyat.ca

### Features (shipped)
1. **Now / today / week / year** — next prayer, countdown, Eastern Time clock, Hijri date.
2. **Qibla** — CSS 3D Kaaba, compass (opt-in), GPS “My location”, drag to look. Default Maple NE ~54.5°.
3. **Luna** — horizon sky map, phase portrait, white moon arrow + yellow sun arrow (hide active, fade other ~0.42), 2-hour dotted trajectories (on by default, **Hide paths** next to **Start sky view**), retina moon.
4. **Responsive** — portrait, landscape (Now | Today; Qibla/Luna wide stage + side panel), iPad two-column.

### Explicitly abandoned
- **Azan / web alarm** — 15 min before iqamah, then 30s/10s tests. Worked in foreground; died when backgrounded or other audio took the session. Removed (`azan.js`, audio assets). Do not re-add as a webpage alarm.

## Key decisions

| Decision | Why |
|----------|-----|
| Static HTML, no bundler | Phone glance site; GitHub Pages |
| Cache `?v=N` on css/js | iOS Safari caches aggressively |
| Azan removed | Browser cannot keep a reliable background alarm |
| Luna look vector, not `compass - screenAngle` | Screen rotation was shifting moon/sun ~90°; Qibla stayed consistent so its heading formula was left alone |
| Moon rendered at DPR with AA | 40×40 sprite was pixelated on retina |
| Landscape uses CSS grid + `orientation`/`min-width` | Was locked to a 440px portrait column |
| Cloudflare MCP + skills installed globally | Ready to deploy/manage on Cloudflare after OAuth |

## Luna orientation (do not regress)

`lunaLook(event)` in `luna.js`:
- iOS: `alpha = 360 - webkitCompassHeading`, then W3C facing heading `atan2(vx, vy)` plus Maple declination.
- Altitude: `asin(-cos(beta)*cos(gamma))` (look through the phone, independent of CSS orientation).
- Portrait and landscape must agree when the phone points the same way.

Qibla still uses `compassHeading` minus `screenAngle()`. Only change it if Qibla starts drifting on rotate.

## File map

```
index.html      v=23 assets, Luna actions (Start sky view | Hide paths), week-card
styles.css      .luna-actions, landscape/tablet grid, safe-area padding
app.js          live clock + prayer UI
timings.js      iqamah table
qibla.js        3D finder + compass
luna.js         sky, paths, moon disk, look vector
suncalc.js      vendored positions
vercel.json     optional Vercel
```

## Cloudflare onboard (2026-09-04)

Skills (13) in `~/.agents/skills/`: `cloudflare`, `wrangler`, `workers-best-practices`, `durable-objects`, `agents-sdk`, sandbox-*, `turnstile-spin`, `cloudflare-email-service`, `cloudflare-one`, `cloudflare-one-migrations`, `web-perf`.

MCP in `~/.grok/config.toml`:
- `cloudflare` https://mcp.cloudflare.com/mcp (OAuth — authenticate after restart)
- `cloudflare-docs` https://docs.mcp.cloudflare.com/mcp (public, healthy)
- `cloudflare-bindings` https://bindings.mcp.cloudflare.com/mcp
- `cloudflare-builds` https://builds.mcp.cloudflare.com/mcp
- `cloudflare-observability` https://observability.mcp.cloudflare.com/mcp

After restart: `/mcps` → select `cloudflare` → press `i` to sign in.

## How to continue after a new session

1. This repo’s `AGENTS.md` and this file load automatically.
2. Resume the long TUI thread with `/resume` if you need the raw chat.
3. Grok **memory** is now enabled (`[memory] enabled = true` in `~/.grok/config.toml`). First turn injects indexed notes from `~/.grok/memory/`. Use `/flush` before compacting; `/memory` to browse.
4. Bump `?v=` on every front-end change and push `main` for Pages.
