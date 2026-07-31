# Direction Finding — a standalone artifact

**This is not part of the proof of concept demo.** The two-tab demonstration
simulates a single P25 Orb producing an event stream, with no bearings in it at
all. This folder exists to show that "and then we could tell you where the
transmission came from" is a real, solved piece of engineering with working code
behind it, rather than a roadmap slide.

**Be precise about what one unit gives you, because the words matter.** A
DF-capable Orb — three elements, three coherent chains — produces a **bearing**:
a direction, a ray from a known point. It does **not** produce a location. Two or
more units produce a **fix**, and that is what this solver computes. "We can tell
you which way it came from" needs one unit; "we can tell you where it is" needs
two.

- `aoa_fix.py` — the solver. N position-and-bearing readings in, an estimated
  location out, with an assessment of how much that estimate is worth.
- `test_aoa_fix.py` — 20 assertions covering accuracy, noise, weighting, and
  every way the method fails.

Run them:

```
python3 df/aoa_fix.py         # worked example
python3 df/test_aoa_fix.py    # tests
```

No dependencies.

---

## Why a single antenna element cannot do this

*(This section is about elements, not units. One unit with three elements gives a
bearing; the limitation below is about what a single element can do.)*

A single antenna element has no inherent sense of direction. It tells you a
signal arrived; it cannot tell you where from. Getting a bearing requires one of
two things:

- **A rotatable directional antenna** — mechanically steer it and note where the
  signal peaks. This works, and it is why old direction-finding gear had a
  hand crank. It is impractical here: moving parts, slow, and useless for a
  transmission lasting two seconds.
- **A fixed multi-element array** — compare the phase or amplitude of the same
  signal across several elements. The signal reaches one element fractionally
  before another, and that difference gives the angle. No moving parts, and fast
  enough for a short transmission.

The second is the right choice, and it drives the hardware: **four Analog
Devices ADRV9002 transceivers, arranged as two "coherent groups" of three
receive chains each**, plus a calibration reference chain per group. A
coherent group is three chains phase-aligned against each other by on-chip
synchronisation (MCS) — exactly the common phase reference an interferometer
needs.

**There are two groups because the array listens on two different windows at
once.** An uplink group (~806–808 MHz) hears handset requests and granted
voice — the bearings that actually matter for locating an officer. A downlink
group (~851–853 MHz) hears the tower and `8TAC95D` talkaround, and doubles as a
known-position calibration reference (see below). Each element's signal is
split after its low-noise amplifier and fed to both groups, so the same three
antennas support two independent bearings at once. Full detail in
[`docs/hardware-design.md`](../docs/hardware-design.md) §3.3.

### Two problems the array creates

**Front-back ambiguity.** Two elements give you a phase difference, and a phase
difference alone is satisfied by two mirrored directions. You know the signal
came from that line, not which end of it. A **third element non-collinear in the
horizontal plane** resolves it: two independent horizontal baseline vectors have
only one common solution.

The words "in the horizontal plane" are load-bearing, and an earlier revision of
our own hardware design missed them. If all three elements sit in a *vertical*
plane — which is what a lid opening to vertical gives you — then every baseline
has zero component along the horizontal axis perpendicular to that plane.
Azimuth enters the phase measurement only as cos φ, and cos(φ) = cos(−φ), so
mirrored azimuths are indistinguishable on every baseline. Adding more elements
in that plane does not help; the ambiguity belongs to the plane. Vertical
separation buys elevation discrimination, which this application does not want.

The corrected enclosure opens its lid to **180°, flat**, and three folding
vertical dipoles deploy upright from it to form a horizontal triangle with
roughly λ/2 spacing — 17.6 cm at 851 MHz. Full mechanical treatment in
[`docs/hardware-design.md`](../docs/hardware-design.md) §5.1–5.3.

**One consequence to state whenever this is presented:** element spacing has to
be about half a wavelength, so the array's physical size is set by the band. At
17.6 cm it stays unambiguous across 800 and 700 MHz and degrades gracefully at
UHF, but it is **unusable at VHF**, where half a wavelength is 97 cm.
**Direction finding is a 700/800 MHz capability**, limited by physics rather than
by the design. (The base receive-only unit is intended to be all-band, and the
selected transceiver's 30 MHz–6 GHz tuning range covers VHF and UHF with no
up-converter needed — an earlier part briefly under consideration would have
needed one, but that was resolved before it shipped.)

**A third element needs a third coherent receive chain, and this is now
resolved.** The AD9361 originally selected has only two per chip. The current
architecture — four ADRV9002 chips in two coherent groups of three chains each,
plus a reference — gives every group its own third chain, with synchronisation
handled by MCS rather than by hand. The deciding argument along the way was
that synchronising two separate chips by hand can half-succeed, and a
half-succeeded synchronisation yields a **wrong bearing rather than a missing
one**. Two synchronised AD9361s remain the documented fallback. The options
considered and rejected are in
[`docs/hardware-design.md`](../docs/hardware-design.md) §5.5.

The solver in this folder is unaffected by any of this — it consumes bearings
and does not care how they were obtained. The front-back disambiguation a third
element provides is achievable on the part actually selected; what has not been
measured is MCS's real phase alignment in this specific configuration.

**The bearing is relative to the antenna, not to the world.** The array measures
the angle in its own reference frame. Turning that into a bearing relative to
true north needs an onboard **magnetometer**, and to stay accurate when the unit
is not sitting flat, an **IMU for tilt compensation**. This is a cheap catalogue
part — the same nine-axis class used in every drone and phone — but it is a
required part of a DF-capable unit and not present in the base receive-only one.

Mounting note: the IMU goes **in the lid with the array**, not in the base. It
then measures the array's actual orientation continuously, whatever angle the lid
actually reached, instead of requiring a precise mechanical latch.

This is what makes the flat-lid design tolerant rather than fragile. The
horizontal projection of the triangle compresses by cos(tilt) — 0.985 at 10° off
flat, 0.94 at 20°. A lid that stops at 172° instead of 180° costs essentially
nothing, and the IMU reports the real plane either way. The vertical arrangement
had no such margin: its projection compresses to zero and the array simply stops
working.

---

## Why angle-of-arrival rather than time-difference

The obvious alternative is TDOA: compare when the same transmission arrived at
several units and work back from the differences.

| | AOA | TDOA |
|---|---|---|
| Extra hardware | Antenna array + magnetometer + IMU | None beyond precise time sync |
| Stations needed for a fix | **2** | Typically 3–4 for an unambiguous fix |
| Sensitive to | Antenna orientation, multipath | Clock synchronisation |

TDOA is tempting because it needs no array and no compass — and the GNSS
disciplined oscillator that gives you the required time sync is on the board
anyway for timestamping.

**AOA wins on the number of units required, and that is the deciding factor.**
Requiring three or four Orbs on scene before the feature does anything makes it
a feature nobody experiences. Two units is a realistic ask for an agency that
bought a couple. This is a product decision driven by deployment reality rather
than by which mathematics is prettier.

### The second argument, which is about the network rather than the geometry

**Share the conclusion, not the evidence.**

Each unit runs its own signal processing and emits a **bearing report** — azimuth,
declared uncertainty, timestamp, channel, and unit ID and talkgroup if it decoded
them. Perhaps a hundred bytes. **The waveform never leaves the unit that received
it.**

The alternative — shipping raw samples between units for joint processing — fails
three ways:

| | |
|---|---|
| **Bandwidth** | One coherent processing interval is roughly **57 KB** (2,400 samples × 3 elements × 8 bytes). Ten channels at a CPI every 50 ms is on the order of **90 Mbit/s per unit** of raw waveform. A bearing report per transmission is a few kilobytes per second at most — three orders of magnitude apart |
| **Coherence** | Cross-correlating I/Q between units *phase-coherently* would require them locked to a fraction of a wavelength — sub-nanosecond and frequency-locked, across kilometres. That is a shared-reference problem, not a GPS problem. (Plain TDOA is gentler, needing roughly 100 ns for 30 m accuracy, which GPS-disciplined clocks do reach — but the bandwidth objection stands regardless) |
| **The product's own premise** | This system exists because connectivity at an incident is contested and degraded. **A design that required shipping waveforms between units would fail exactly when the product is needed.** A hundred-byte report survives a link that a megabyte of samples would not |

That third row is the one to lead with in front of anyone who knows what ARC
Edge is for.

---

## Associating reports between units

Before two bearings can be crossed, both units have to be talking about **the same
transmission**. Get that wrong and you cross bearings from two different radios,
producing a confident fix at a place where nothing happened — a *ghost*. This is
the classic failure of multi-sensor fusion and it deserves to be designed for
rather than assumed away.

**None of this is implemented.** `aoa_fix.py` takes already-associated
observations as its input. What follows is a proposed strategy. [Assumption]

### Tier 1 — decoded identity, which is a primary key

If both units decoded the transmission, each report carries a **unit ID and
talkgroup**. Two reports naming *8M-4471 on talkgroup 5301* are the same
transmission, with certainty. Not a probability — a key.

**This is a genuine structural advantage over generic direction-finding
systems**, which must correlate anonymous emitters and treat association as a
hard statistical problem. We decode who is talking, so most of the time we simply
look it up.

### Tier 2 — GNSS timestamp plus channel, for everything else

Below the decode threshold there is no unit ID — **and that is exactly the
weak-signal case where direction finding matters most**, so this tier is not an
edge case. Two keys carry it:

**The RF channel must match.** Strongly discriminating on its own, since a busy
trunk has many channels active at once.

**The timestamp gate is computed, not constant.** Both units know their own GNSS
positions, so they know their separation *d*. The same transmission can reach
them at times differing by anything from −*d*/c to +*d*/c depending on where the
emitter is. For units 3 km apart that is a **±10 µs** window, plus detection
jitter.

That window is tiny against the thing being discriminated: transmissions are at
minimum tens of milliseconds long, so **a few hundred microseconds of tolerance
still separates them by three orders of magnitude.** The instinct that GNSS time
does most of the work here is correct.

**Timestamp the sync-word correlation peak, not the energy threshold.** An energy
detector fires late on weak signals and early on strong ones, which is a
systematic error precisely correlated with the thing we are trying to measure.
P25's frame sync gives a well-defined instant both units can identify to within a
fraction of a symbol. Analog FM has no such marker, so **analog transmissions
associate less precisely than P25 ones** — worth knowing before someone discovers
it in the field.

### Tier 3 — confidence factors, for disambiguating inside the gate

**Carrier frequency offset is the strong one.** Every transmitter's crystal sits
slightly off frequency — typically hundreds of hertz — and that offset is a
*stable per-radio fingerprint* measurable to a few hertz. Both units observe the
same emitter and should measure the same offset. It is a well-established
technique (specific emitter identification) and it costs nothing, because the
offset is already estimated at stage 12 for demodulation.

It is a *confidence factor and not a key*: it drifts with temperature and ageing,
and two radios can coincidentally sit close together. Over the minutes of an
incident it is stable enough to be useful. [Inferred — the achievable
discrimination in this application is unmeasured.]

**Burst duration and envelope shape** — both units saw the same transmission
start and stop. Weak, and free.

**Relative signal strength**, used with care. The nearer unit often hears it
louder, but multipath breaks this often enough that it should never be more than
a tiebreaker.

### Tier 4 — geometric validation, which we already built

The association hypothesis produces a fix, and **the fix's own quality checks
test the hypothesis**. A wrong association frequently places the transmitter
*behind* one of the stations, which `aoa_fix.py` already detects and names. Poor
GDOP and, with three or more stations, a large residual do the same work.

So the loop closes: associate, solve, check, and reject the association if the
geometry rejects it.

### The rule that governs all four tiers

**When in doubt, do not associate.** A missing fix is very much better than a
ghost fix, for the same reason stated throughout this design: an undetected wrong
answer is worse than an admitted absence of one.

### And an elegant parallel worth knowing

**Association errors and multipath errors have the same detectability profile.**
With two stations, a wrong association produces a perfectly self-consistent fix
with zero residual — because two non-parallel rays always cross — exactly as a
multipath-corrupted bearing does. With three, both show up as a large residual.

So the argument for a third unit is stronger than it first appears: it is not
just better geometry, it is the point at which **two different classes of silent
failure become visible.**

---

## The method

Each observation is a station position and a bearing, which together define a
**ray** from that station toward the transmitter. With perfect measurements the
rays meet at a point. With real measurements they do not, so the estimate is the
point that comes closest to all of them at once.

For a line through point **a** with unit direction **d**, the squared
perpendicular distance from a candidate point **p** is

```
(p - a)ᵀ (I - d dᵀ) (p - a)
```

because `I - d dᵀ` projects onto the direction normal to the line. Summing over
all observations, weighting each by `1/σ²`, and setting the derivative to zero
gives a 2×2 linear system

```
( Σ wᵢ Mᵢ ) p  =  Σ wᵢ Mᵢ aᵢ       where  Mᵢ = I - dᵢ dᵢᵀ
```

solved directly. Everything happens in a local east/north plane in metres,
projected around the centroid of the stations — accurate enough for a scene a
few kilometres across, and the wrong choice for anything wider.

**Weighting by declared uncertainty is the part that earns its keep.** A unit
with a poor view, an obstructed antenna, or a marginal signal should say its
bearing is worth less, and the solver should listen. The test suite checks this
directly: the same 20-degree bearing error does far less damage when the unit
reporting it admits to 20 degrees of uncertainty than when it claims one.

---

## Reporting honestly

A position estimate that does not come with its own quality assessment is worse
than no estimate, because it will be believed. The solver returns three checks,
and refuses to call a fix usable unless all three pass.

**Geometric dilution of precision (GDOP).** Bearings crossing near a right angle
give a compact error region. Bearings crossing at a shallow angle give a long
thin one — you may know the direction well and the distance barely at all, even
when every individual bearing is accurate. GDOP is the ratio of the error
ellipse's axes, computed from the eigenvalues of the normal-equation matrix. Over
10 and the fix is reported as a direction to search rather than a point on a map.

**Forward consistency.** A bearing is a ray, not a line. The transmitter is in
*front* of the antenna. The least-squares solution works on infinite lines and
will cheerfully place a fix behind a station — which is always wrong, and almost
always means a bearing is 180 degrees out. That is the front-back ambiguity
showing up in the answer, and it is caught and named rather than averaged in.

**Residual.** With three or more bearings, how far the estimate sits from each
line measures whether they actually agree. A large residual usually means one
bearing is a multipath reflection off a building rather than the direct signal —
a real and common problem in exactly the dense built environments this product
is designed for.

One caveat the code states explicitly rather than hiding: **with exactly two
bearings the residual is always zero**, because two non-parallel lines always
intersect somewhere. It is a property of the geometry, not evidence that the
bearings are right. Two-station fixes are reported without a residual claim.

The honest extension of that caveat: **three bearings detect a bad one but do not
identify it.** Drop any one of three and the remaining pair intersects exactly,
so three incompatible explanations each fit their own evidence perfectly.
Naming the culprit needs a fourth station, a per-bearing quality metric
independent of signal strength, or outside knowledge. The full error budget —
why multipath is the dominant term, why it arrives looking *more* trustworthy
than the direct path, and what can be done about it — is in
[`docs/hardware-design.md`](../docs/hardware-design.md) §5.7.

---

## A hardware check the solver never sees: the tower as a calibration reference

Everything above is the solver reasoning about bearings it is handed, with no
way to know whether the unit that produced one is trustworthy. There is one
additional check, upstream of this code entirely, worth knowing about because
it directly answers "how would you know if a station's own hardware were
lying to it?"

**The downlink coherent group is tuned to the tower — a transmitter at a
surveyed, known position, transmitting more or less continuously.** So a unit
is always able to compute a bearing whose correct answer is already known,
independent of anything a handset ever does. That is a continuous, free,
end-to-end check on the array manifold, feed phase, dock connectors,
splitters, chip synchronisation and magnetometer heading, running in the
background of every deployment.

**It catches exactly the kind of failure this solver cannot see from the
outside:** a chip synchronisation that half-succeeded (the reference bearing
steps at a retune), a magnetometer heading error (the reference bearing sits
at a constant offset), multipath at the unit's own site (the reference bearing
wanders while nothing is moving), and slow manifold or connector drift (the
reference bearing creeps over a deployment). A unit that fails this check is
one whose *handset* bearings should be trusted less, even though the solver
above has no way to compute that from the bearing report alone.

**Two honest limits.** It validates what the uplink group shares with the
downlink group — the antenna, the LNAs, the manifold — not the uplink group's
own PLL or gain stage, which it does not touch. And it cannot fix a bearing to
a *handset*: that path's multipath is its own problem, unrelated to whatever
the tower's signal happened to do. Full treatment in
[`docs/hardware-design.md`](../docs/hardware-design.md) §3.3.

---

## What the tests demonstrate

```
20 passed, 0 failed
```

- Exact bearings recover a known transmitter position to under a metre, from two
  stations and from three.
- **With 3 degrees of bearing noise across three stations, median position error
  is about 23 m and the worst of 200 trials is about 67 m.** For the use case —
  which wing of a building to send officers to — that is useful.
- Declaring higher uncertainty demonstrably reduces a unit's influence.
- Near-parallel bearings produce a high GDOP, are flagged unusable, and say why.
- Exactly parallel bearings raise rather than returning a meaningless number, and
  the message tells the operator to reposition a unit.
- A reversed bearing is detected as placing the fix behind a station, and the
  warning names the unit responsible.

---

## What this is not

It is not integrated into the demo, and it should not be presented as though it
were. It also assumes the bearings themselves exist — the signal processing that
extracts an angle from phase differences across an array, and the calibration
that makes it trustworthy, is real work that this artifact takes as its input
rather than solving. What is demonstrated here is the geometry, the error
handling, and the honesty about uncertainty, on the assumption that the array
and its calibration have done their job.

**That assumption is the interesting part, and it is where the real risk sits.**
Array calibration removes the errors the hardware causes, which are the small
ones. The two largest terms — multipath, and site-induced magnetometer bias —
are supplied by the deployment environment and survive any amount of bench
characterisation. See [`docs/hardware-design.md`](../docs/hardware-design.md)
§5.7 for the budget and §5.8 for candidate approaches to the magnetometer half,
which is marked **pending** and has no chosen solution.
