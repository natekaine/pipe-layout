# Pipe Layout

Pipefitting layout calculator — offsets, miters, saddles & cut lengths for the field.

Live site: https://pipe.f4u5t.com

## What's inside

- Rolling offset solver (solve by fitting angle or by advance), travel & cut length, elbow take-outs
- Equal-spread offsets with gain/stagger per pipe
- Single miter cuts (long/short side from square)
- Wrap-around saddle templates (16 ordinates, unrolled flat)
- Converters (fraction / decimal / mm), slope & pitch
- Reference tables: ASME B36.10M pipe data, ASME B16.9 elbow take-outs, ASME B16.5 Class 150 flange bolt-up

## Files

- `index.html` — the app page
- `style.css` — styling
- `app.js` — UI and calculator wiring
- `pipe3d.js` — 3D views
- `core/pipeMath.js` — layout math
- `core/tables.js` — ASME reference data
- `manifest.webmanifest`, icons — PWA assets

Code pulled from the live site on Oct 28, 2026 so it can be worked on from anywhere.
