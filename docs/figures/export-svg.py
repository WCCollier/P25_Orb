#!/usr/bin/env python3
"""Export each plate as a standalone .svg for PowerPoint.

The plates live as inline SVG inside HTML pages, styled by CSS classes that sit
in the page's <style> block and resolve their colours through custom properties.
PowerPoint gets none of that: it needs a self-contained file. So this lifts each
<svg> out, resolves the light-theme palette to literal hex, folds the stylesheet
in as a child <style>, and lays a paper-coloured background rect underneath so
the drawing stays legible on a dark slide master.

Vector matters here. PowerPoint renders SVG natively and will scale it to any
projector without softening the 9px annotation text, which is where a PNG of the
same drawing falls apart.

    python3 docs/figures/export-svg.py
"""

import re
from pathlib import Path

HERE = Path(__file__).parent

# The light half of the plates' token set. Dark-theme values are deliberately
# discarded: a slide deck has one background, and it is the author's, not ours.
PALETTE = {
    "paper": "#F2F4F1",
    "surface": "#FBFCFA",
    "ink": "#14201C",
    "rule": "#C3CCC5",
    "muted": "#6B7A73",
    "uplink": "#B4571A",
    "downlink": "#16746B",
    # Font stacks travel to machines that may not have the originals. These are
    # the widest-available monospace faces; PowerPoint substitutes silently and
    # a metric-different substitute would reflow every centred label.
    "mono": "Consolas, 'DejaVu Sans Mono', 'Courier New', monospace",
}

# Which svg in which file becomes which plate number.
SOURCES = [("plate-1.html", [1]), ("plates-2-4.html", [2, 3, 4]), ("plates-5-6.html", [5, 6])]


def resolve_vars(css):
    """Replace var(--name) with the literal value, honouring any fallback."""
    def one(match):
        name, fallback = match.group(1), match.group(2)
        return PALETTE.get(name, fallback.strip() if fallback else "#000")
    # Two passes: --mono itself expands to a stack containing no vars, but a
    # rule may nest a var() inside another's fallback.
    for _ in range(2):
        css = re.sub(r"var\(--([\w-]+)(?:,([^()]*))?\)", one, css)
    return css


def drawing_rules(style_text):
    """Keep the top-level rules that can apply inside an SVG.

    Everything themed lives in :root and @media blocks we do not want, and
    everything else is either a page-layout rule (harmless but useless) or a
    class the drawings actually use. Filtering to plain class and element
    selectors drops the theming without needing to understand it.
    """
    kept, depth, start = [], 0, 0
    for i, ch in enumerate(style_text):
        if ch == "{":
            if depth == 0:
                selector = style_text[start:i].strip()
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                body = style_text[style_text.index("{", start) + 1:i]
                if re.fullmatch(r"[.\w\s,>-]+", selector) and not selector.startswith("@"):
                    kept.append(f"{selector} {{{body}}}")
                start = i + 1
    return "\n".join(kept)


def main():
    style_source = (HERE / "plate-1.html").read_text()
    css = resolve_vars(drawing_rules(re.search(r"<style>(.*?)</style>", style_source, re.S).group(1)))

    for filename, numbers in SOURCES:
        html = (HERE / filename).read_text()
        svgs = re.findall(r"<svg\b.*?</svg>", html, re.S)
        if len(svgs) != len(numbers):
            raise SystemExit(f"{filename}: expected {len(numbers)} drawings, found {len(svgs)}")

        for number, svg in zip(numbers, svgs):
            # A standalone .svg is parsed as XML, which forbids "--" inside a
            # comment. The source drawings use rules of dashes as section
            # separators, so stripping comments outright is both the fix and
            # the right call: they document the source, not the export.
            svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
            width, height = re.search(r'viewBox="0 0 (\d+) (\d+)"', svg).groups()
            head, rest = svg.split(">", 1)
            head += (
                f' xmlns="http://www.w3.org/2000/svg"'
                f' width="{width}" height="{height}"'
            )
            background = f'<rect x="0" y="0" width="{width}" height="{height}" fill="{PALETTE["surface"]}"/>'
            out = (
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                f"{head}>\n<style>\n{css}\n</style>\n{background}{rest}"
            )
            target = HERE / f"plate-{number}.svg"
            target.write_text(out)
            print(f"wrote {target.name}  ({width}x{height})")


if __name__ == "__main__":
    main()
