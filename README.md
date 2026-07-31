# P25 Orb — a proposed ARC Edge add-on

Proof of concept, design documentation and pitch package for the ARC Edge
Product Lead take-home.

**When a P25 trunk saturates, officers press the button and nothing goes out.
The trunk knows. Nobody else does.** P25 Orb listens to that trunk and tells the
on-scene commander what never got through.

## Run it

```
python3 serve.py
```

Open <http://localhost:8000> and follow the links. No build step, no bundler,
nothing to install.

## Check it

```
node test/engine-test.js      # 47 assertions — the detection engine
node test/ui-smoke-test.js    # 13 assertions — the two-tab wiring
python3 df/test_aoa_fix.py    # 20 assertions — the direction-finding solver
```

## Learn it

**[`learn/`](learn/README.md) is a twelve-module syllabus** taking you from the
radio fundamentals to running the demo, breaking the engine on purpose, and
defending every decision under questioning. Written for a product lead with a CS
background and no radio engineering. Start there if you have to present this.

## Read it

Start with **[`docs/as-built.md`](docs/as-built.md)** — what was built, what is
real versus simulated, where everything lives, and the order to read it in.

| | |
|---|---|
| [`design-document.md`](design-document.md) | The authoritative specification everything else implements. |
| [`docs/as-built.md`](docs/as-built.md) | Master summary. Start here. |
| [`docs/software-prd.md`](docs/software-prd.md) | Requirements and rationale for the three software surfaces. |
| [`docs/hardware-design.md`](docs/hardware-design.md) | The P25 Orb module. Conceptual, not procurement-ready. |
| [`pitch-script.md`](pitch-script.md) | The spoken pitch, with presenter notes and expected questions. |
| [`df/README.md`](df/README.md) | Direction finding — a standalone artifact, not part of the demo. |
