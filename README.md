# Kolesa Pattern Rig

Generator of the Kolesa.kz 2026 brand pattern. Web version first, then a Figma plugin.

- `web/` — static web generator (no build step). Published to GitHub Pages by `.github/workflows/pages.yml`.
  Run locally: `cd web && python3 -m http.server`, open http://localhost:8000.
- `web/js/pattern.js` — pure geometry + SVG builder, no DOM. The Figma plugin will reuse it
  (`figma.createNodeFromSvg(buildSVG(state))`).
- `web/js/app.js` — UI: variants, format presets / custom size, sliders, drag, colours, gradients,
  user presets (localStorage), share link (state in URL hash), SVG export, copy for Figma.
- `web/js/i18n.js` — RU (default), EN, KZ.

## Geometry

Brand book: Figma `BuFCFcybmuq8pbLxwmbNbh`, node 20:1716; reference Cavalry rig `Build/pattern_rig/rig.js`.

- Ring n = upper half-arc + lower half-arc around one centre.
- Upper centre-line radius `r0 + (n−1)·step`, lower `+ shift·step/2` (signature shift).
- Defaults: 8 rings, step 72, thickness 40, r0 60, shift 1, centre half-disc on.
- Ring colour `#005EFF` = `#0065DB` hard-light over `#0077FF`, flattened (blend modes are not exported).
- The pattern is never deformed; arcs grow from 9 o'clock.
- Relative scale 100 % = step is 11.6 % of the frame width (brand example 20:3150).
