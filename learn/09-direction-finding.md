# Module 9 — Direction Finding

**Time:** about 30 minutes.
**Prerequisite:** [Module 8](08-hardware.md).
**Goal:** present the roadmap artifact accurately, including being precise about
uncertainty — which is the actual skill this module teaches.

Companion: [`df/README.md`](../df/README.md), `df/aoa_fix.py`.

---

## 9.1 Frame it correctly

**This is not part of the demo.** The two-tab demonstration simulates a single
Orb producing an event stream, with no bearings in it. This is a separate artifact
answering *"could you tell me where that transmission came from?"* with working
code rather than a slide.

The right framing when presenting:

> This is not built into what I showed you. It is the next thing, and rather than
> put it on a roadmap slide I wrote the solver and tested it, so we know what it
> would and would not give you.

---

## 9.2 Why one *antenna* cannot do it

**Bearing versus fix — get this distinction right before anything else.** One
DF-capable unit gives you a **bearing**: a direction, a ray from a known point.
Two units give you a **fix**: a location. "Which way did it come from" needs one
unit; "where is it" needs two. The solver in `df/` computes the second from
several of the first.

What follows is about a single *antenna element*, which cannot do either.

A single antenna tells you a signal arrived. It cannot tell you from where.
Getting a bearing needs one of two things:

**A rotatable directional antenna** — steer it, note where the signal peaks. Why
old direction-finding gear had a hand crank. Impractical here: moving parts, slow,
and useless for a transmission lasting two seconds.

**A fixed multi-element array** — compare the same signal across several
antennas. It reaches one fractionally before another, and that tiny difference
gives the angle. No moving parts, fast enough for a short transmission.

We take the second. It is why the ADRV9026's four coherent receive chains matter
— they share an oscillator, which is exactly the common phase reference an
interferometer needs.

### Two problems the array creates

**Front-back ambiguity.** Two elements give a phase difference, and that
difference is satisfied by two mirrored directions. You know the signal came from
that *line*, not which *end* of it. A third element resolves it — **provided the
three are non-collinear in the horizontal plane.**

That qualifier is the whole thing, and our own hardware design originally missed
it. Here is the argument, because you will be asked:

> Put all three elements in a *vertical* plane — which is what a lid opening to
> vertical gives you. Every baseline between them now has zero component along
> the horizontal axis perpendicular to that plane. So azimuth only ever enters
> the phase measurement as cos φ. And cos(φ) = cos(−φ), so a signal from 30° east
> of north and one from 30° west of north produce **identical phase on every
> baseline**. Adding a fourth or tenth element in that plane changes nothing —
> the ambiguity belongs to the plane, not the element count.

The rule to remember: **azimuth resolution lives in the horizontal projection of
your baselines.** Vertical separation buys elevation discrimination, which we do
not need.

So the enclosure opens its lid to **180°, flat**, and three folding vertical
dipoles stand up from it in a horizontal triangle, spaced about λ/2 — 17.6 cm at
851 MHz, which fits a shallow-lidded storm case comfortably.

**This used to be an open hardware limit, and it is now closed.** A third element
needs a third *coherent* receive **chain** (§8.1a — say chain, not channel, or you
will walk into the error the hardware document already made). The AD9361 we
started with has two, which left the third-element disambiguation unavailable.

**Resolved by changing the part.** The ADRV9026 carries four coherent receivers
on one die with synchronisation built in, so the third chain exists and the
front-back ambiguity is resolvable. The deciding argument was a failure mode:
synchronising two separate chips can half-succeed, and a half-succeeded
synchronisation produces a **wrong bearing rather than a missing one**. Two
AD9361s remain the documented fallback.

The other options considered and not taken are set out in
[`docs/hardware-design.md`](../docs/hardware-design.md) §5.5: stay at two elements
and resolve the ambiguity by moving the unit; or switch three antennas into two
chains and accept time-division sampling.

**Worth knowing about the switching option**, because it is usually dismissed too
fast — and because our own argument for it had to be corrected. The standard
objection is that time-division sampling cannot do instantaneous
angle-of-arrival, which is decisive for pulsed or hopping signals.

We first answered that by saying our transmissions last *seconds*. **That is true
of voice and false of signalling.** A P25 control-channel request from a radio is
only about **20 to 35 milliseconds** — and on a Phase 2 TDMA control channel the
inbound slots are reported at 1.778 ms. Those are exactly the transmissions the
weak-signal capability in §8.3b depends on, so the original argument would have
collapsed the moment someone asked about them.

The option survives on a better argument: RF switches settle in *microseconds*,
so even a 20 ms burst allows many complete three-element rotations. What makes it
work is keeping one chain permanently on a reference element, so every switched
sample is compared against a simultaneous reference and the signal's own phase
drift between samples cancels out.

The real risks are calibration drift and multipath fading changing between
intervals — not transmission length. **But be able to say why, because "our
transmissions are long" is not the reason.**

If you are asked about the third chain, the honest answer is: *"That is an open
hardware question, here are the four options, and nobody has measured which one
wins."* Do not claim a three-element array works on the current part.

**The bearing is relative to the antenna, not the world.** The array measures an
angle in its own frame. Converting that to a bearing relative to true north needs
a **magnetometer** (a compass), plus an **IMU** for tilt compensation when the
unit is not sitting flat. Cheap catalogue part — the nine-axis class in every
drone and phone — but required, and it lives in the band module with the array
(every module carries them, per §8.1b).

**Mounting detail worth knowing:** the IMU goes **in the lid with the array**,
not in the base. It measures the array's real orientation continuously, at
whatever angle the lid actually reached.

**This is the strongest argument for the flat-lid design and it is worth making
unprompted.** The horizontal projection of the triangle compresses by cos(tilt):
0.985 at 10° off flat, 0.94 at 20°. Negligible. A lid that stops at 172° costs
you essentially nothing, and the IMU reports the true plane anyway. The vertical
arrangement had no margin at all — its projection compresses to zero and the
array fails outright. **The corrected design degrades gracefully; the one it
replaced failed catastrophically.**

What still needs tolerance is *per-element* folding, since the IMU sees the lid
plane but not one element that failed to seat. The budget is about λ/20 ≈ 1.8 cm;
a detented hinge gives a millimetre. Not a hard requirement.

---

## 9.2a Two things to say about the enclosure

You will get asked how the antennas are physically arranged. Two points carry
most of the value.

**The hinge does the lifting.** Lid depth is set by the antenna fold-hinge barrel
diameter — nothing else has to fit, because the elements stow lying flat and are
thinner than the hinge. The barrel is then chosen to largely fill that depth, so
its top sits level with the lid rim, which sits level with the top of the gear.
The erected antenna therefore starts at the top plane of the open system, and
**no separate risers are needed.** One part doing two jobs, which is the kind of
thing worth pointing at.

**The case body is part of the antenna, not interference.** This is the sharper
idea. Opening the lid flat puts the body beside the array, which sounds like a
problem — but the body sits in a *fixed, repeatable* relationship to the array on
every single deployment. So it is not noise, it is a known perturbation, and it
is handled the way direction-finding systems have always handled nearby
structure: measure the **array manifold** (each element's response versus angle,
with the body attached) on an antenna range once, and use the measured response
in the solver instead of assuming ideal antennas.

The same logic absorbs the hinges, the carrier plate and the feed routing.
Anything rigidly and repeatably attached becomes part of the antenna and gets
characterised once. **A repeatable error is not an error — it is a calibration
coefficient.** That is also why the three fold-hinges must be identical parts,
identically oriented: a consistent perturbation calibrates out, an inconsistent
one becomes a per-unit bias nobody can explain.

**The deployment rule that follows:** place the unit with the **case body behind
you and the open lid facing the area of operations.** Calibration corrects a
known bias; it does not restore signal the body blocked.

Two precisions worth having ready, because both are natural wrong assumptions:

- The rule is about **signal quality, not heading.** The magnetometer gives
  absolute orientation whichever way the case points.
- The rule is **not** how the front-back ambiguity gets resolved. Three elements
  sampled coherently have no azimuthal ambiguity at all. Doctrine-based
  disambiguation only arises in the degraded two-channel fallback — and there the
  solver should show both candidates and mark the favoured one rather than
  silently picking, since an officer who circled behind you would otherwise be
  mirrored into the wrong hemisphere.

---

## 9.2b "What's your direction-finding hardware?" — the answer is nothing

Somebody will ask which component does the direction finding, expecting to be
told about a specialised chip. There isn't one.

**No part on the bill of materials is a direction-finding part except the
antennas and the orientation sensors.** Extracting the angle is a function
running on the ordinary processor, using roughly **a tenth of a percent of one
CPU core**. Not the GPU either — that is there for the local AI fallback.

What direction finding actually requires is a particular *antenna arrangement*
and a *receiver that samples all elements against one shared clock*. Both of
those are in the design for other reasons as well — the array also buys us
sensitivity, and the shared clock is a property of the transceiver we chose for
its tuning range.

**The phrase to avoid.** The three receive paths are **coherently sampled but
phase-offset**. Never say they are "unsynchronised versions" of the signal. The
synchronisation is the precondition and the phase offset is the measurement — if
they really were unsynchronised, their relative phase would be their own
oscillators drifting, which would swamp the half-nanosecond of arrival difference
completely and there would be no bearing at all.

### And a bearing is not produced in one step

The phase comparison gives an angle *in the array's own frame*. Three more steps,
all software, turn it into something a commander can act on:

| | Step | Needs |
|---|---|---|
| **1** | Phase differences between antennas | The three streams |
| **2** | → angle in the array's own frame | The **calibration chart** measured for that specific array, stored in the module |
| **3** | → corrected to level | The **tilt sensor** — the lid is never exactly flat |
| **4** | → **bearing relative to true north** | The **compass**, plus magnetic declination for where we are |

That is why the sensors in the lid are not accessories. Steps 3 and 4 are where a
geometry measurement becomes a direction, and both depend on the unit knowing how
it is sitting.

---

## 9.3 Why angle-of-arrival rather than time-difference

The alternative is TDOA: compare *when* the transmission arrived at several units.

| | AOA (chosen) | TDOA |
|---|---|---|
| Extra hardware | Array + magnetometer + IMU | None beyond precise time sync |
| Stations for a fix | **2** | Typically 3–4 |
| Sensitive to | Antenna orientation, multipath | Clock synchronisation |

TDOA is genuinely tempting — no array, no compass, and the GPS-disciplined
oscillator that provides the time sync is on the board anyway for timestamping.

**AOA wins on station count, and that is decisive.** Requiring three or four Orbs
on scene before the feature does anything makes it a feature nobody ever
experiences. Two is a realistic ask for an agency that bought a couple.

**This is a product decision driven by deployment reality, not by which
mathematics is nicer.** Say it that way — it is exactly the kind of judgement the
role is being evaluated on.

---

## 9.3a What actually travels between two Orbs

Someone will assume the units send each other recordings. They do not, and why
they do not is a good answer.

**Each unit sends a bearing report — about a hundred bytes.** Direction,
uncertainty, timestamp, channel, and who was transmitting if we decoded it. The
raw radio data never leaves the unit that received it.

**Share the conclusion, not the evidence.** Three reasons, and the third is the
one for this audience:

- **Size.** One window of raw radio data is around 57 KB. Ten channels running
  continuously would be roughly 90 megabits per second, per unit. A bearing
  report per transmission is a few kilobytes per second.
- **Difficulty.** Comparing raw radio data between two units would need their
  clocks locked to each other far more tightly than GPS provides.
- **The point of the product.** This system exists because connectivity at an
  incident is bad. **A design that needed to ship recordings between units would
  break exactly when it was needed.** A hundred bytes gets through a link that a
  megabyte would not.

### The association problem, and why we are unusually well placed

Before two bearings can be crossed, both units must be sure they heard **the same
transmission**. Get it wrong and you cross bearings from two different radios and
confidently mark a spot where nothing happened. This is normally the hard part of
multi-sensor systems.

**We mostly get it for free, because we decode who is talking.** Two units both
reporting *unit 8M-4471, talkgroup 5301* are certainly describing the same
transmission. Generic direction-finding gear has to correlate anonymous signals
and treat this as a statistics problem; we look it up.

**The exception is the case that matters most.** Below the decode threshold there
is no unit ID — and that is exactly the weak-signal scenario direction finding
exists for. There the strategy falls back to GPS timestamps and the channel, with
a time window computed from how far apart the two units actually are (about ±10
microseconds at 3 km), tightened further by matching each transmitter's slight
frequency error, which acts like a fingerprint.

Full strategy in [`df/README.md`](../df/README.md).

### One parallel worth carrying

**A wrong association and a multipath reflection fail in exactly the same way.**
With two units, both produce a perfectly self-consistent fix with zero residual,
and neither can be detected. With three, both show up.

So the case for a third unit is not merely better geometry — it is the point
where **two different kinds of silent failure become visible.** That is a much
stronger way to make the argument.

---

## 9.4 The method, without the algebra

Each observation is a station position plus a bearing — together, a **ray**
pointing from that unit toward the transmitter.

With perfect measurements, the rays meet at a point. They never do. So the
estimate is **the point that comes closest to all the rays at once** — least
squares, weighted so that a unit reporting high uncertainty pulls the answer
around less than one reporting a tight bearing.

That weighting is not decoration. The test suite proves it: the same 20-degree
bearing error does far less damage when the unit reporting it *admits* to 20
degrees of uncertainty.

---

## 9.5 The part that actually matters: honest uncertainty

**A position estimate without a quality assessment is worse than no estimate,
because it will be believed.** The solver returns three checks and refuses to
call a fix usable unless all three pass.

**Geometric dilution of precision (GDOP).** Bearings crossing near a right angle
give a compact error region. Bearings crossing at a shallow angle give a long
thin one — you may know the direction well and the distance barely at all, *even
when every individual bearing is accurate*. Over 10 and the fix is reported as a
direction to search rather than a point on a map.

**Forward consistency.** A bearing is a *ray*, not a line — the transmitter is in
front of the antenna. Least squares works on infinite lines and will happily
place a fix *behind* a station, which is always wrong and almost always means a
bearing is 180 degrees out. That is the front-back ambiguity surfacing, and it is
caught and named rather than averaged in.

**Residual.** With three or more bearings, how far the estimate sits from each
ray measures whether they actually agree. A large residual usually means one
bearing is a reflection off a building rather than the direct signal — a real and
common problem in exactly the dense built environments this product targets.

### The caveat that shows intellectual honesty

**With exactly two bearings the residual is always zero**, because two
non-parallel lines always intersect somewhere. It is a property of the geometry,
not evidence that the bearings are right.

The code states this rather than hiding it. Run `python3 df/aoa_fix.py` and the
output says:

> *From 2 units. With only two bearings there is no cross-check: any two bearings
> meet somewhere.*

This is the single best thing to point at in this artifact. It would have been
easy to print a reassuring "bearings agree to within 0 m" and let the number do
the lying.

---

## 9.6 What the numbers actually are

```
python3 df/test_aoa_fix.py
```

**20 assertions, all passing.** The headline result:

> With 3 degrees of bearing noise across three stations, **median position error
> is about 23 m and the worst of 200 trials is about 67 m.**

Frame that against the use case. It will not tell you which room. It will tell
you **which wing of the building to send officers to**, which is a decision a
commander is actually making. Claiming more would be a lie; claiming less
undersells a useful capability.

The rest of the suite covers exact-bearing recovery to under a metre, the
weighting behaviour, high-GDOP geometry being flagged, exactly parallel bearings
raising an error with an actionable message, reversed bearings being caught by
name, and input validation.

---

## 9.6a Where bearing error actually comes from

This is the question a technical reviewer will ask, and the intuitive answer is
wrong in a way worth understanding.

The intuition is that bearing error is whatever imprecision survives after you
calibrate the hardware. That is true of *some* of the error, and that part is
small — roughly one to two degrees each from the array manifold and from
deployment geometry, both of which we control and characterise.

**But the two largest terms are not hardware errors at all.**

**Multipath.** The signal bounces off a glass or concrete face and arrives from a
direction the transmitter is not in. The critical thing to understand: this does
not look like noise. The reflection arrives **strong and phase-stable**, so the
array measures it correctly and reports it confidently. It is a wrong answer
delivered with conviction, and no amount of bench calibration touches it,
because the perturbation is in the building, not in the radio.

The nasty corollary: any quality metric based on how strong the signal is will
**prefer** the reflection.

**Magnetometer bias.** The array measures angles in its own frame. Turning that
into a bearing relative to true north uses a magnetic compass, and a fire truck
parked nearby bends it. Different site, different error, every time.

### The bit to have ready, because it is the sharpest question in this module

**Two units cannot detect a multipath error.** Two rays always cross somewhere,
so the residual is structurally zero and the fix looks perfect while being
wrong. That is why the code refuses to make a residual claim on a two-station
fix — silence rather than false comfort.

**Three units detect it but cannot name the culprit.** Three rays that miss each
other prove someone is wrong. But drop any one and the other two intersect
exactly, so you get three competing stories that each fit their own evidence
perfectly. Naming the bad bearing takes a fourth unit, or outside knowledge, or
a quality metric that does not depend on signal strength.

**And there is a good candidate for that metric, specific to this product.** A
P25 voice transmission lasts seconds. A true direct-path bearing holds steady
across that window; one corrupted by a reflection wanders, because the receiver
is measuring the sum of two paths and that sum shifts as the scene moves. So
**bearing stability over the transmission** is a usable quality signal, and it is
independent of loudness — which is exactly the weakness identified above. Being
able to offer that is a much stronger position than acknowledging the problem
and stopping.

Full budget, including the cross-range table (5° at 300 m is 26 m; at 1 km it is
87 m), is in [`docs/hardware-design.md`](../docs/hardware-design.md) §5.7.
Candidate fixes for the magnetometer half are in §5.8 — **marked pending, with
nothing chosen.** Present it that way.

---

## 9.7 What this artifact is not

**It assumes the bearings exist.** The signal processing that extracts an angle
from phase differences across an array, and the calibration that makes it
trustworthy, is real work that this artifact takes as *input* rather than solves.

What is demonstrated is the geometry, the error handling, and the honesty about
uncertainty — on the assumption that the array and its calibration have done
their job.

Say that plainly. The alternative is implying you have solved the hard part.

---

## Exercises

**9.1** Run `python3 df/aoa_fix.py` and `python3 df/test_aoa_fix.py`. Read the
output.

**9.2** Open `df/aoa_fix.py` and edit the example at the bottom: change ORB-2's
bearing from 270 to 271, then to 275. Watch the estimated position move. That
sensitivity is what GDOP measures.

**9.3** Change one bearing by 180 degrees and confirm the front-back warning
fires and names the right unit.

**9.4** Explain to a commander what "GDOP is 14" means, without using the words
"dilution", "eigenvalue" or "covariance".

<details>
<summary>Model answer</summary>

Your two units are nearly in line with each other and with the signal, so their
bearings are pointing almost the same way rather than crossing cleanly. That
means we know the *direction* well but the *distance along* it poorly — the
uncertainty is a long thin cigar rather than a circle. Treat it as an arrow to
follow, not a spot on the map. If you can move one unit sideways a few hundred
metres, the bearings will cross properly and we can give you a point.
</details>

**9.5** Explain why two stations produce a zero residual, and why that is not
reassuring.

**9.5a** A radio engineer says: "You've got three antennas in the lid, so you've
resolved the front-back ambiguity." The lid opens to vertical. Explain why they
are wrong, in under a minute, using the cos φ argument.

**9.5b** Someone asks whether the DF configuration works on their VHF system.
Answer honestly, and say what the base unit does support.

<details>
<summary>Answer to 9.5b</summary>

Not usefully. The array needs its elements spaced about half a wavelength apart,
and at VHF that is nearly a metre — no case lid will hold it. Sized for 800 MHz
the array stays unambiguous at 700 MHz and degrades gracefully at UHF, but at VHF
the spacing is under a tenth of a wavelength and the bearings are not worth
having. The direction-finding configuration is a 700/800 MHz capability. The base
receive-only unit is intended to be all-band, so congestion detection and
blocked-attempt reporting are meant to work on a VHF system exactly as
demonstrated. It is only the locating feature that is band-limited by physics.

**One correction to carry with that claim, because it is currently overstated.**
The transceiver we selected tunes down to 650 MHz, not to 70 MHz as the previous
part did — so VHF and UHF need a mixer in the band module to shift them up into
range. That is a proposed fix rather than a built one (`docs/hardware-design.md`
§3.3, open item J). Until it is settled, say the all-band claim as an intent with
a known gap, not as a capability.
</details>

**9.5c** A reviewer says: "Once you've calibrated the array, bearing error should
be down to a degree or two." Agree with the part that is right, then explain what
they have left out.

<details>
<summary>Model answer</summary>

That is right for the errors our hardware causes, and those do calibrate down to
about a degree or two — the array manifold and the deployment geometry. But
those are not the terms that will set field performance. The two biggest come
from the environment. Multipath puts a strong, clean, phase-stable bearing on a
reflection off a building, which the array measures perfectly and reports
confidently — a wrong answer with high confidence, and calibration cannot touch
it because the problem is not in our radio. And the magnetometer that references
our bearings to true north gets bent by whatever steel is parked next to the
unit, which is different at every incident. So calibration handles the part we
control, and the part we do not control is larger. That is why every fix ships
with a quality assessment rather than as a pin on a map.
</details>

**9.6** A customer asks whether this can find a shooter. Answer carefully.

<details>
<summary>Discussion</summary>

It locates a *radio transmission*, which means it locates a radio. That is useful
for finding your own officer who keyed up and cut off — which is the scenario we
built it for. It does not locate someone who is not transmitting, and it cannot
distinguish a suspect from anyone else holding a radio. Anyone selling you
gunshot localisation is selling a different product with different sensors.
</details>

---

## You can now explain

- Why this is a roadmap artifact and not part of the demo.
- **Bearing versus fix**: one unit gives a direction, two give a location. Why
  a single *element* cannot do either, and what an array adds.
- **Share the conclusion, not the evidence** — why units exchange hundred-byte
  bearing reports rather than radio data, and why that is a networking argument
  as much as a geometry one.
- The association problem, why decoding identity mostly solves it, and why the
  exception is exactly the weak-signal case.
- Why a wrong association and a multipath reflection are **the same failure**:
  invisible at two units, visible at three.
- The two problems an array creates and how each is solved.
- **Why the three elements must be non-collinear in the *horizontal* plane**, and
  the cos(φ) = cos(−φ) argument for why a vertical array cannot work at all.
- Why the flat-lid design degrades gracefully where the vertical one failed
  outright.
- Why a third array element needs a third coherent receive chain that the
  current transceiver does not have, the four options, and why the switching
  option deserves more credit than it usually gets.
- **Why calibration only removes the small errors**, and why multipath and
  magnetometer bias — the two largest terms — survive it.
- Why a multipath bearing arrives looking *more* trustworthy than the real one,
  and why signal-strength-based weighting therefore backfires.
- What two stations, three stations, and four stations can each actually
  establish about a corrupted bearing.
- Bearing stability over a seconds-long transmission as a quality metric that is
  independent of signal strength.
- That the DF configuration is band-limited to 700/800 MHz by array size, even
  though the base unit is all-band.
- How the fold-hinge sets lid depth and lifts the antennas clear, so no risers
  are needed.
- Why the case body counts as part of the antenna rather than as interference,
  and what array manifold calibration is.
- The deployment orientation rule, and the two things it is *not* for.
- Why AOA over TDOA, framed as a deployment decision.
- The three quality checks and what each protects against.
- The two-station zero-residual caveat, and why volunteering it matters.
- The actual accuracy numbers, and the right use case framing.
- What the artifact does not solve.

---

**Next:** [Module 10 — Troubleshooting](10-troubleshooting.md)
