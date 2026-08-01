#!/usr/bin/env python3
"""Export each plate as a standalone .svg for PowerPoint.

The plates live as inline SVG inside HTML pages, styled by CSS classes in the
page's <style> block that resolve their colours through custom properties.
**PowerPoint ignores <style> entirely.** It reads only presentation attributes,
so a file that relies on a stylesheet imports with every element at the SVG
defaults - fill black above all - which turns each tinted face into a solid slab
and lets PowerPoint's own Graphics Style recolour the text.

So this does not merely inline the stylesheet, it dissolves it: every rule is
resolved per element and written onto that element as attributes, the class
attributes and the <style> element are dropped, and the file no longer depends
on a cascade at all.

Opacity gets the same treatment. Office's support for it is unreliable, and
every translucent fill here is a flat tint over a known background, so each one
is pre-blended to an opaque hex and the opacity is discarded.

Vector still matters: PowerPoint renders SVG natively and scales it to any
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


def parse_rules(style_text):
    """Return [(selector, {property: value})] for top-level rules, in source order.

    Source order is load-bearing: every selector here has equal specificity, so
    a later rule beats an earlier one, which is how `.t-ul` recolours `.t-box`.
    """
    # A selector is read as everything since the previous rule closed, so a
    # comment sitting above a rule becomes part of its selector and the rule is
    # silently dropped. That cost plate 2 its panel borders once already.
    style_text = re.sub(r"/\*.*?\*/", "", style_text, flags=re.S)

    rules, depth, start = [], 0, 0
    for i, ch in enumerate(style_text):
        if ch == "{":
            if depth == 0:
                selector = style_text[start:i].strip()
                open_at = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                body = style_text[open_at + 1:i]
                if re.fullmatch(r"[.\w\s,>-]+", selector) and not selector.startswith("@"):
                    decls = {}
                    for piece in body.split(";"):
                        if ":" in piece:
                            prop, value = piece.split(":", 1)
                            decls[prop.strip()] = value.strip()
                    for name in (part.strip() for part in selector.split(",")):
                        rules.append((name, decls))
                start = i + 1
    return rules


def blend(colour, alpha, background):
    """Flatten a translucent fill onto a known background."""
    fg = [int(colour[i:i + 2], 16) for i in (1, 3, 5)]
    bg = [int(background[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(f * alpha + b * (1 - alpha)):02X}" for f, b in zip(fg, bg))


# Only these reach the drawing. Anything else in the stylesheet is page layout.
PAINT = ("fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linejoin",
         "font-size", "font-weight", "font-family", "letter-spacing")


def attributes_for(names, rules):
    """Collapse every rule matching these selector names into flat attributes."""
    decls = {}
    for selector, properties in rules:
        if selector in names:
            decls.update(properties)

    opacity = decls.pop("opacity", None)
    if opacity is not None:
        alpha = float(opacity)
        for prop in ("fill", "stroke"):
            value = decls.get(prop)
            if value and value.startswith("#"):
                decls[prop] = blend(value, alpha, PALETTE["surface"])

    return {k: v for k, v in decls.items() if k in PAINT}


def flatten(svg, rules):
    """Rewrite every styled element with presentation attributes instead."""
    def one(match):
        tag, attrs = match.group(1), match.group(2)
        classes = re.search(r'class="([^"]*)"', attrs)
        names = [tag] + [f".{c}" for c in (classes.group(1).split() if classes else [])]
        resolved = attributes_for(names, rules)
        if not resolved:
            return match.group(0)

        attrs = re.sub(r'\s*class="[^"]*"', "", attrs)
        # An attribute already written on the element was a deliberate override
        # in the source drawing, so it outranks anything the stylesheet says.
        existing = set(re.findall(r'([\w-]+)=', attrs))
        added = "".join(f' {k}="{v}"' for k, v in resolved.items() if k not in existing)
        return f"<{tag}{attrs}{added}"

    return re.sub(r'<(\w+)((?:\s+[\w:-]+="[^"]*")*)', one, svg)


def main():
    for filename, numbers in SOURCES:
        html = (HERE / filename).read_text()

        # Each page carries its own stylesheet, and they are not interchangeable:
        # .sig-ul is 2.2 wide on plate 1 and 1.8 on plates 5-6, and only the
        # later pages define the fills and wedges at all. Read per file.
        stylesheet = re.search(r"<style>(.*?)</style>", html, re.S).group(1)
        rules = parse_rules(resolve_vars(stylesheet))

        svgs = re.findall(r"<svg\b.*?</svg>", html, re.S)
        if len(svgs) != len(numbers):
            raise SystemExit(f"{filename}: expected {len(numbers)} drawings, found {len(svgs)}")

        for number, svg in zip(numbers, svgs):
            # A standalone .svg is parsed as XML, which forbids "--" inside a
            # comment. The source drawings use rules of dashes as section
            # separators, so stripping comments outright is both the fix and
            # the right call: they document the source, not the export.
            svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
            svg = flatten(svg, rules)
            width, height = re.search(r'viewBox="0 0 (\d+) (\d+)"', svg).groups()
            head, rest = svg.split(">", 1)
            head += (
                f' xmlns="http://www.w3.org/2000/svg"'
                f' width="{width}" height="{height}"'
            )
            background = f'<rect x="0" y="0" width="{width}" height="{height}" fill="{PALETTE["surface"]}"/>'
            out = (
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                f"{head}>\n{background}{rest}"
            )
            target = HERE / f"plate-{number}.svg"
            target.write_text(out)
            print(f"wrote {target.name}  ({width}x{height})")


if __name__ == "__main__":
    main()
