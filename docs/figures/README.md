# Figures

Hand-authored SVG drawing plates for the pitch. These are the presentation
versions of diagrams that exist as ASCII inside the design documents — the ASCII
originals remain authoritative, and these must be re-checked against them
whenever the source section changes.

## What is here

| File | Contains | Source sections |
|---|---|---|
| `plates-5-6.html` | **Plate 5** — two-unit bearing fix: good crossing geometry, shallow crossing geometry, and the three-station residual triangle. **Plate 6** — the deployed configuration as an isometric line illustration: case open, lid flat, array upright. | §5.1, §5.6, §5.9, §7.2 |
| `plates-2-4.html` | **Plate 2** — the 800 MHz duplex band at true scale, with the two captured windows as magnified detail views. **Plate 3** — array geometry: plan, elevation, and the rejected vertical-plane arrangement. **Plate 4** — splitter placement and the Friis noise-figure case. | §3.3, §3.3.1, §5.1 |

**Plate 1 (the §2 receive-architecture block diagram) has no source file here.**
It was drawn in a session scratchpad that was cleared before it could be
committed, and survives only as a published page:
<https://claude.ai/code/artifact/9975a0ab-958d-4675-8214-4e57513db5bb>. That page
also still carries an early Mermaid figure that was rejected for poor glyph
spacing. If Plate 1 is ever needed as an editable file it must be redrawn — the
conventions below are enough to make a redraw consistent with the rest.

Plates 2–4 are published at
<https://claude.ai/code/artifact/5d96a39a-e6ed-4a4a-9a22-836a46507688>.

## Drawing conventions

These are shared across every plate and should be kept if more are added.

- **Colour is semantic, never decorative.** Amber is the uplink group and
  anything a handset transmits; teal is the downlink group; dashed grey is
  calibration; plain grey is digital. `8TAC95D` appears in *amber inside the
  downlink window* precisely because it is a handset transmission sitting in the
  tower's half of the band.
- **Notes are keyed by the specification's own § numbers**, not by arbitrary
  markers, so a reader can go straight to the governing paragraph.
- **A drawing title block** carries plate number, source section and revision date.
- Monospace for all drawing text; the page prose is serif. Both themes are
  supported through CSS custom properties.

## Editing and checking

The file is self-contained — no build step, no external assets. Open it in a
browser directly, or render it headless to check for collisions:

```sh
{ echo '<!doctype html><html><head><meta charset="utf-8"></head><body>'
  cat docs/figures/plates-2-4.html
  echo '</body></html>'; } > /tmp/preview.html

~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome \
  --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size=1160,1400 --screenshot=/tmp/plate.png /tmp/preview.html
```

**Render and look at every edit.** Overlapping text and lines crossing labels are
invisible in the source and obvious in the image; several were only caught this
way. Add `<html data-theme="dark">` to the wrapper to check the dark theme.

## Status

Conceptual and pitch-quality, not procurement-ready. Dimensions are design
intent. The case-fit conclusions in Plate 3 are Inferred from approximate
interior dimensions and have not been measured against a real enclosure.
