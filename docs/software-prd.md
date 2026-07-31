# P25 Orb — Software Product Requirements

Covering the three software surfaces: the **Control Panel**, the
**detection and synthesis engine**, and the **Command Feed**.

This document states what each piece must do *and why it is designed that way*.
The reasoning matters more than the feature list, because most of the decisions
here are ones a reasonable person could have made differently, and the product
has to be defensible under that questioning.

---

## Implementation status — read this before quoting any requirement

**This document specifies the product. The proof of concept implements part of
it.** Requirements are marked inline where they diverge:

| Marker | Meaning |
|---|---|
| *(unmarked)* | **Built and tested** in the proof of concept |
| **[PARTIAL]** | Built, but not to the full extent the requirement states |
| **[NOT IMPLEMENTED]** | Specified here; no code exists |

| Section | Requirements | Status |
|---|---|---|
| §1.2 Detection engine | R1–R11 | **Built.** 47 automated assertions |
| **§1.5 Instrument health** | **R11a–R11f** | **Not implemented.** No receiver exists, so there is no sensitivity to report |
| §2.2 AI classification | R12–R14 | **Built.** Real model calls, cached for presentation |
| §3.1 Command Feed | R15–R19 | **Built** |
| §3.1 Attribution | R20 | **Partial** |
| §4.1 Control Panel | R21–R26, R23a | **Not implemented.** Static mockup; renders, does nothing |
| §4.1 Diagnostics view | R27, R27a | **Built.** R27a covered by the UI smoke test |

**Prose sections carry their own status notes**, and three are worth knowing
without hunting for them:

- **§1.1a** is an *audit* of receiver capabilities the engine does not consume.
  None of it is implemented and none of it is proposed for the proof of concept.
- **§1.4** describes real-world processing latency. **The demo does not model
  it** — classifications are pre-cached and the timeline is scripted, so
  everything appears instantly.
- **§2.2a** describes a quality ceiling imposed by the P25 vocoder. Descriptive,
  not a requirement.

**Nothing multi-unit exists.** The demo is a single simulated Orb. The two
browser tabs communicate over `BroadcastChannel`, which is same-origin and
same-machine — it is not a network protocol and must not be described as one.

### Unbuilt requirements are shown on screen, marked as unbuilt

**Added 2026-07-31.** Requirements marked `[NOT IMPLEMENTED]` above are no longer
merely absent from the demo. Where a requirement has a natural home on one of the
three surfaces, **that surface carries a dashed panel chipped "not built"**,
naming the requirement it stands for:

| Requirement | Where it appears |
|---|---|
| R11a–R11f — instrument health | RF Environment, in the Receiver panel (R11f puts it in the diagnostics view deliberately); summarised on the Command Feed |
| R21–R26 — Control Panel | The Control Panel itself, which remains a static mockup throughout |
| §6 — multi-Orb collective | Control Panel *Orb collective*; Command Feed peer visibility |
| §6.8 — bearings and the COP layer | Command Feed |
| `hardware-design.md` §5.3, §5.8 — array manifold and heading integrity | Control Panel *Array and heading integrity* |

**Why show them at all**, rather than describing them from the stage:

- **It is this system's own principle applied to its own demonstration.** The
  product exists to stop an absence being read as calm. A demo that silently
  omitted its gaps would commit the error it was built to prevent.
- **It makes the boundary checkable rather than asserted.** A viewer can see
  which parts are real without asking, and anything not marked that way is
  working code.

**None of it animates or is fed by the engine.** A plausible-looking live number
next to real engine output is precisely the confusion the convention exists to
prevent, so these panels are static and say so.

---

## 0. The shape of the system

```
   Control Panel  ──configures──▶  Detection & synthesis engine  ──feeds──▶  Command Feed
   (setup, admin)                  (the product's judgement)                (the commander)
        │                                    ▲
        │                                    │
        └── diagnostics view ────────────────┘
            (what the receiver hears, raw)
```

Three layers, one direction of travel. The Control Panel decides what the engine
listens to and how sensitive it is. The engine decides what matters. The Command
Feed shows the result. The diagnostics view is a window onto the engine's raw
input, used at setup time.

**Who each surface is for** is the thing that keeps them from collapsing into one
screen. The Control Panel is for a technician deploying a unit, once. The Command
Feed is for an on-scene commander, continuously, under stress, while other people
are talking to them. Those are different people with different tolerances, and
the interfaces should not resemble each other.

---

## 1. Detection and synthesis engine

The engine is the product. Everything else is a way of looking at what it
decides.

### 1.1 Input

An ordered stream of P25-shaped events from the receiver:

| Event | Meaning |
|---|---|
| `CHANNEL_REQUEST` | A radio keyed up and asked the trunk for a voice channel. |
| `GRANT` | The trunk assigned a traffic channel. The officer may now speak. |
| `QUEUED` | No channel free. The request is waiting. |
| `SYSTEM_BUSY` | No channel available. **The call is dropped and no voice is ever transmitted.** |
| `DENIED` | The radio is not authorised on this talkgroup. Again, no voice. |
| `TX_EMERGENCY` | An emergency declaration, carried trunk-wide on the control channel. |
| `VOICE` | Audio from a transmission that received a grant, with a transcript. |
| `FALLBACK_VOICE` | Audio heard on the analog talkaround channel, off-trunk. |

**Trunk and talkaround are monitored simultaneously by one receiver, and fused
here.** `8TAC95D` sits inside the same captured slice as the trunk's channels and
has its own permanently-instantiated channeliser (`hardware-design.md` §3.3.1),
so no second receiver and no switching is involved. In the engine, `VOICE` and
`FALLBACK_VOICE` fall through to the **same handler** — talkaround traffic is
classified and raises signals by exactly the same path as trunk voice, with a
`fallback` flag carried through only so the views can label its origin.

**That fusion is a differentiator, not an implementation detail.** Someone
monitoring the trunk cannot hear talkaround; someone monitoring talkaround cannot
hear the trunk. Only a receiver watching both can tell the story that neither
tells alone — *this unit was denied a channel at 14:22:09 and reappeared on the
tactical channel eight seconds later.* Demo beat 3 is precisely that sequence.

`SYSTEM_BUSY` and `DENIED` are the reason this product exists. When a P25 radio
is denied a channel, **it never transmits voice at all**. There is no audio
anywhere for that attempt — nothing to relay, nothing to bridge, nothing for a
competitor's IP relay product to forward, because the signal never existed. The
only artefact is the request on the control channel, and today nobody outside the
trunk controller ever sees it.

#### Unit identity is under-specified, and it is not only a multi-Orb problem

**`state.alerts` is keyed by a bare unit-ID string.** That is a correctness
defect, and §6.4 files it as a prerequisite for collective operation — which
understates it, because **a single Orb already sees more than one identity
space.**

Three distinct namespaces can appear in one Orb's event stream:

| Source | Identity space |
|---|---|
| The monitored trunk | P25 unit IDs, unique **only within that system** (WACN + System ID) |
| A mutual-aid unit on the same interop channel | P25 unit IDs from a *different* system — 8M-4471 on LCRA is not 8M-4471 on San Antonio's network |
| Analog talkaround | **No inherent identity at all**, unless the fleet sends an MDC-1200-class ANI burst — which is a different numbering scheme again |

The second row is the one that makes this a single-unit problem. **An
interoperability channel is cross-agency by definition** — that is what it is
for — so the moment we monitor one, we are monitoring more than one system's
numbering.

**The fix is small and should not wait for the multi-Orb work:** key units by
`(WACN, SystemID, unitId)` rather than by `unitId`. The Control Panel already
collects the first two (R22); the engine simply does not use them.

**And one simplification in the proof of concept follows from the third row.**
The demo's `FALLBACK_VOICE` events carry unit IDs in the same format as trunk
traffic. In reality analog talkaround gives us audio and nothing else unless ANI
is present. The demo's narrative justification is that beat 3's unit was heard on
the trunk moments earlier — but associating the two is an assumption, not a
measurement. It is noted in `demo/js/timeline.js` and, since it is a claim the
audience can see being made, **stated on the RF Environment tab itself** beneath
the channel-activity panel.

### 1.1a What the receiver could supply that the engine does not consume

**Audit added 2026-07-31, after the hardware architecture was substantially
revised.** None of the following is implemented, and §5's build scope
deliberately excludes all of it. It is recorded so that the input contract's
limits are a stated choice rather than an oversight.

The important pattern: **almost everything newly available is *physical* rather
than *semantic*.**

| Available | From | Gated on |
|---|---|---|
| **Per-element and combined signal strength** | Stage 10's covariance diagonal | **Nothing — free today** |
| **Link margin / SNR per transmission** | Same, plus a noise-floor estimate | **Nothing — free today** |
| **Carrier frequency offset** — a stable per-radio fingerprint | Already estimated at stage 12 for demodulation | **Nothing — free today** |
| **Analog carrier present, audio unintelligible** | `hardware-design.md` §3.3.2 Case B | **Nothing — free today** |
| **Bearing + declared uncertainty per transmission** | Stage 10d | **Nothing in the architecture — resolved 2026-07-31.** `hardware-design.md` §3.3 |
| **P25 transmission detected but not decodable** | §3.3.2 detect/recognise tiers | **Nothing — resolved.** Both windows are now covered |
| **A request the trunk never answered** | §3.3.2 Case A | **Nothing — resolved.** The uplink is what the array points at |

**Three of these were re-graded on 2026-07-31 and the change is large enough to
restate.** The hardware architecture was reworked into **two coherent groups** —
three phase-coherent receive chains on the uplink where handsets transmit, three
on the downlink (`hardware-design.md` §3.3, §0.0a). Two consequences for this
document:

- **Bearings are no longer gated on a missing receive chain.** They are gated on
  engine work that has not been done, which is a different and smaller kind of
  open.
- **The bearings are now useful.** The previous architecture pointed the array at
  the downlink, so every bearing it could have produced was a bearing *to the
  tower*. Handsets transmit on the uplink and on talkaround. **The signal this
  product exists to find — the officer whose channel request the trunk never
  answered — is now both audible and locatable by the same hardware.**

#### Why this matters more than a feature list

**It relieves the corroboration rule's dependence on the model.** Of the four
signal kinds in R3, two — `AI_DISTRESS` and `STATUS_CHECK_UNANSWERED` — require
the classifier to have read something correctly. Every candidate above is a
physical measurement that does not.

The strongest of them is **signal-strength trajectory**, and it costs nothing to
obtain. An officer whose transmissions have faded steadily over several minutes
is moving into a structure or toward the edge of coverage. Combined with a
cut-off transmission that is a genuine HIGH_CONFIDENCE escalation **that never
touched a transcript** — two kinds, two source events, no AI in either.

**It substantially improves the answer on encryption.** Today an encrypted system
costs both AI-dependent signal kinds, leaving two. With physical signals the
product keeps signal strength, carrier drop, emergency declaration, bearing and
undecodable-transmission detection. The claim moves from *"you keep congestion
detection but lose most alarm capability"* to **"you lose the words, not the
alarms"** — which matters, because the intended customer encrypts.

**And one candidate is the product's own premise in its strongest form.** *"Unit
X asked for a channel and the trunk never answered"* is categorically different
from `SYSTEM_BUSY` or `DENIED`: those mean the trunk heard you and said no; this
means **nobody heard you at all**, and the officer has no way to know that. The
design document names "detecting what never got through" as the headline
differentiator, and this is that claim without qualification.

#### Two candidates deliberately not proposed

**Attributing an undecodable transmission to a known radio** via its frequency
fingerprint is genuinely useful for the weak-signal case, but it is a
second-order feature on top of a capability that does not exist yet.

**Keyup patterns as covert distress signalling** is speculation, and it is
recorded here only so that nobody proposes it later believing it was overlooked.

### 1.1b What would have to change — engine

Stated because the answer is reassuring and worth knowing: **the part that was
hard to get right does not move.**

| Component | Change needed |
|---|---|
| **`tierFor` — the corroboration rule** | **None.** It counts `kinds.size` and `sources.size` against a Set. It is kind-agnostic and a fifth or sixth kind changes nothing |
| `SIGNAL_KINDS` | One entry per new kind — a label and a detail string |
| Event contract (§1.1) | New event types, plus new fields on existing events: `rssi`, `snr`, `bearing`, `bearingSigma` |
| Emission branches | One per new signal, in the existing `switch` on event type |
| `command-feed.js` labels | One plain-language line per new kind |
| **Per-unit history** | **Genuinely new.** A trend signal such as signal-strength trajectory needs bounded rolling state per unit, which the engine does not keep today. The pattern exists — the congestion gauge is a rolling window — but it is currently scene-level, not per-unit |

Only the last row is more than mechanical, and it is the one to scope carefully:
per-unit history has memory characteristics that scene-level windows do not.

### 1.1c What would have to change — the AI classifier: nothing, and deliberately

**The classifier must not receive physical measurements.** This is a design
prohibition rather than an absence of need, and there are four reasons, in order
of severity:

**1. It would break the independence the whole two-tier design rests on.** If the
classifier sees signal strength and factors it into `distress`, then
`AI_DISTRESS` and any strength-derived signal share an input and are no longer
independent. The engine would count one piece of evidence twice while believing
it had two. That is exactly the failure this project has already been bitten by
once — the corroboration rule was briefly dead code because no event could
produce two kinds, and it took a deliberate test to expose it.

**2. It would make the output unauditable.** `keywords` exists so a reading is
traceable to the words that drove it. Physical context leaking in makes "why did
it say distress" unanswerable.

**3. It is the wrong tool.** Signal-strength trajectory is a threshold and
regression problem. Deterministic code does it better, faster, more cheaply, and —
decisively for this project — *testably*.

**4. It would re-couple the fast path to the cloud.** §1.4 records that
control-channel and physical detections reach the commander in under a second
whether or not the classifier is reachable. Routing physical measurements through
the model destroys that property, which is one of the design's better ones.

**The one case that might look like an exception is already handled.** The
classifier does need to know when a transmission was cut off — and it already
does, via the truncation flag and the `cut_off_meaning` field. That is a
*structural* fact about the transcript, not a physical measurement, and the
distinction is the line to hold.

### 1.2 Requirements

**R1.** The engine shall be a pure function of its input stream and its clock: no
DOM access, no network calls, no internal timers. The caller drives time.

*Why:* it must be testable, and it must be possible to say without hedging that
the alarms are computed rather than scripted. `test/engine-test.js` replays the
demo timeline and asserts each outcome; that test is only possible because the
engine has no hidden state.

**R2.** The engine shall maintain, per unit, a set of **signals** — independent
pieces of evidence that this specific officer may be in trouble.

**R3.** Exactly four signal kinds may raise or escalate an alarm:

| Signal | Source |
|---|---|
| `TX_EMERGENCY` | Emergency declaration on the control channel. |
| `AI_DISTRESS` | Classifier read a complete transmission as indicating danger. |
| `PARTIAL_TRANSMISSION` | The carrier dropped mid-word. |
| `STATUS_CHECK_UNANSWERED` | Dispatch called a unit by name; nothing came back inside the answer window. |

**R4.** A unit's alarm tier shall be **High confidence** only when its signals
span **at least two different kinds** *and* **at least two different source
events**. Otherwise the tier shall be **Suspected**.

**R4a.** Where one event yields more than one signal, all of them shall be
recorded and shown. The commander shall see everything the system noticed. The
tier shall not rise on that basis, and the interface shall state plainly that
those observations came from a single event.

**R5.** Blocked transmission attempts shall **never** raise or escalate an alarm.
They shall be counted, surfaced as scene-level congestion, and displayed as
context on any alarm that already exists.

**R6.** The engine shall compute trunk congestion as a grant rate over a rolling
window, and shall classify it as nominal, elevated or saturated against
configurable thresholds. Queued calls shall not count until they resolve.

**R7.** A transmission *about* a unit under alarm shall be attached to that alarm
as related traffic. It shall never close the alarm.

**R8.** A transmission *from* a unit under alarm shall mark that unit as heard
from. It shall not close the alarm either.

**R9.** Only explicit acknowledgement by the commander shall close an alarm.

**R10.** The engine shall act on a classifier field only when that field is
corroborated by something the engine can verify itself. Specifically: a status
check shall start an answer timer only if the subject unit resolves to a unit
actually observed on the trunk.

**R11.** The engine shall produce a **command view**: open alarms ranked high
confidence first, then suspected, then scene conditions.

### 1.3 Why two tiers, and why this rule for crossing between them

The two tiers exist because the alternative failure modes are asymmetric and both
are fatal.

An alarm that fires on every ambiguous signal trains a commander to ignore it.
That is not a hypothetical: it is the normal fate of alerting systems in busy
operational environments, and once trust is gone the product is worse than
nothing, because it consumed attention and returned noise. An alarm that fires
only on certainty misses the case the product exists for — the officer who got
half a sentence out and then stopped.

So the design refuses to choose. **Suspected** says: one thing happened, we
cannot corroborate it, look anyway. **High confidence** says: two independent
things point the same way.

This is not invented. It matches how officers already behave. An ambiguous
distress signal gets investigated immediately without waiting for confirmation —
the same posture as a missed welfare check. The system is encoding doctrine that
already exists, which is also why it is easy to train on.

**A cut-off transmission is treated as more concerning, not less.** The intuition
runs the other way — less information, less certainty, lower priority — and it is
wrong. An officer who stops mid-word did not choose to stop.

**Independence is enforced on two axes, and the second one is the subtle part.**
Requiring two different *kinds* of signal is obvious. Requiring two different
*source events* is what stops the system fooling itself.

In the demo, the cut-off fragment is `"Shots f—"`. It is simultaneously a
truncation and a distress keyword, and the engine **records both** — the
commander should see everything we noticed, and hiding one of them to keep the
arithmetic tidy would be its own kind of dishonesty. So the alert genuinely
carries two signals of two different kinds.

It still reads **Suspected**, because both carry the same source event id. Those
are two readings of the same one and a half seconds of audio. Noticing two things
about one observation is not corroboration, and a system that treats it as
corroboration will escalate on single ambiguous events while claiming to have
corroborated them — the worst of both designs, because it is confidently wrong.

The interface says this out loud rather than leaving it implicit: the card reads
*"2 things noticed, all in the same transmission — not corroborated"*, and the
two signals are bracketed together and labelled. A commander glancing at a list
of two findings would otherwise reasonably conclude that two things had happened.

This is the rule the whole two-tier design rests on, so it is worth knowing how
to check that it is real rather than decorative. Delete `sources.size >= 2` from
`tierFor` in the engine and five assertions fail, including the beat-4 narrative
itself. That check was, at one point during development, genuinely unreachable —
an earlier implementation emitted only one signal per transmission, so the rule
was documented but never exercised. Recording both observations is what made it
load-bearing.

**Blocked attempts are deliberately excluded from the tier logic**, and this is
the decision most likely to be challenged, so it is worth being precise. During
trunk saturation *every* unit on scene is being blocked. "This officer could not
get a channel" therefore carries no information about whether *this* officer is
in danger — it is a fact about the trunk, not about the person. Wiring it into
the alarm tiers would raise an alarm for every unit at exactly the moment the
commander can least afford noise. Blocked attempts are still counted, still drive
the congestion picture, and still appear on an existing alarm card as context
("blocked three more times since") — which is genuinely useful, because a unit
that is trying and failing to get back on the air is a different situation from
one that has gone quiet. It just is not, by itself, evidence of danger.

**Nothing closes an alarm except a human.** In the demo, another officer reports
on the talkaround channel that the unit in question is up and talking. That is
attached to the alarm and shown prominently — and the alarm stays open, because a
third party saying an officer looks fine is not the same as that officer
answering. Later the unit transmits itself, and the alarm is marked "this unit
has since transmitted" — and stays open, because closing an officer-safety alarm
is a command decision. The system's job is to make that decision easy and
well-informed, not to make it automatically.

### 1.4 Two speeds, and the escalation lag that follows

The engine is fed by two paths that arrive at very different times.

| Path | Air to screen | Why |
|---|---|---|
| **Control-channel events** — grants, denies, queues, emergency declaration, congestion | **Well under a second** | Structured signalling. No audio, no transcription, no model call |
| **Speech-derived signals** — `AI_DISTRESS`, `PARTIAL_TRANSMISSION`, `STATUS_CHECK_UNANSWERED` | **Roughly 2–5 seconds** | Vocoder, then speech recognition, then a model call |

**The good half: the safety-critical fast path does not depend on the AI path.**
An emergency declaration is control-channel signalling, so it reaches the
commander in well under a second whether or not the classifier is working, is
slow, or has been cut off from the network entirely. Congestion detection and
blocked-attempt reporting are likewise immune. This is a deliberate property and
worth stating unprompted.

**The honest half: escalation can lag.** Crossing from SUSPECTED to
HIGH_CONFIDENCE requires two signals of different kinds from different source
events (§1.3). When one of the two is speech-derived, **the escalation arrives
seconds after the signal that should have triggered it** — the alert appears
promptly at the lower tier and is promoted once the transcript and its
classification catch up.

That is the correct behaviour rather than a defect: the alternative is either
delaying the first alert until the slow path agrees, or escalating on one signal,
and both are worse. But it means **a commander may see an alert change tier
while looking at it**, and the interface should make that legible rather than
startling.

**The demo does not model this.** Its classifications are pre-cached and its
timeline is scripted, so every signal appears at its scripted instant with no
processing delay. That is a fair simplification for a demonstration and it should
be stated before someone asks, rather than after.

### 1.4a Thresholds are settings, not constants

The answer window on a status check, the congestion window, the saturation
threshold, and the correlated-blocking trigger are exposed on the Control Panel
rather than compiled in. What counts as "too long without an answer" is a
doctrine decision that varies by agency and by incident type. It is not an
engineering constant and should not be presented as one.

---

## 1.5 Instrument health — the unit must report when it has gone partially deaf

**Design requirement added 2026-07-31. Not implemented; the proof of concept has
no receiver and therefore no sensitivity to report.**

### The problem in one line

A strong nearby transmitter raises our noise floor, and every channel in the
captured slice loses sensitivity together (`hardware-design.md` §3.3.1). No
component selection removes this — **a vehicle can always park closer** — so
partial deafness is a condition to be reported, not an edge case to be engineered
away.

### Why this is not merely a diagnostic

**It is the product's own premise turned on itself.** This system exists to
surface what a commander is *not* hearing. A desensitised receiver is exactly
that failure applied to the instrument: transmissions arrive and we do not
register them, and nothing in the output looks different.

So the honest framing of what this indicator says is **epistemic, not
operational**. It does not tell a commander that something happened. It tells
them that *"nothing happened" is less trustworthy than usual right now.* That is
a different kind of statement from anything else on the Command Feed and should
be presented as one.

### And there is a false-alarm path that makes it load-bearing

`STATUS_CHECK_UNANSWERED` fires when dispatch calls a unit and nothing comes back
inside the answer window. **If we were deaf during that window, the unit may well
have answered and we simply did not hear it.**

A desensitised receiver can therefore *manufacture* a signal — and under R4 that
signal can combine with another to escalate an alarm to High confidence. This
makes instrument-health reporting a correctness requirement rather than a
nicety.

### Requirements

**R11a.** **[NOT IMPLEMENTED]** The engine shall accept a per-slice **sensitivity estimate** from the
receiver, expressed as the current in-channel noise floor, and shall compare it
against the unit's best achievable floor.

**R11b.** **[NOT IMPLEMENTED]** When the current floor exceeds the best achievable floor by more than a
configurable margin, the engine shall raise a **scene condition** — the same
class of output as trunk congestion, not a per-unit alarm — reporting the loss in
dB and the resulting reduction in effective range.

*Why range and not just decibels:* 27 dB means nothing to a commander. "We can
currently hear about an eighth as far as usual" is actionable.

**R11c.** **[NOT IMPLEMENTED]** The condition shall be reported as a **duty cycle over a rolling
window**, not as an instantaneous state. At a mass response the unit will be
intermittently desensitised as vehicles transmit; a flapping indicator is worse
than none, and *"degraded for 30% of the last minute"* is both more honest and
more useful than a light that blinks.

**R11d.** **[NOT IMPLEMENTED]** Where a bearing is available, the condition shall include **the
direction of the interfering transmitter.** The array is already computing
bearings (`hardware-design.md` §3.5.2); applying it to the signal that is
deafening us converts *"you are degraded"* into *"you are degraded by something
at 040° — move."* This costs nothing that is not already built.

**R11e.** **[NOT IMPLEMENTED]** Any signal whose evidence depends on **absence** — `STATUS_CHECK_
UNANSWERED` today — shall be suppressed or explicitly qualified if the receiver
was degraded for a material fraction of the window in which the absence was
observed.

*Why:* see the false-alarm path above. Silence is only evidence if we were
listening.

**R11f.** **[NOT IMPLEMENTED]** Sensitivity and its degradation shall be visible in the **diagnostics
view**, continuously and numerically, because that is the surface a technician
uses at setup time and placement is the primary mitigation.

### The design principle underneath all of it

This is the same rule the rest of the system already follows, applied one level
further in: **an undetected absence is worse than an admitted one.** The solver
refuses to place a pin when the geometry is poor. The engine refuses to escalate
on a single signal. The receiver should refuse to let silence be read as calm
when it cannot currently hear.

---

## 2. The AI classification layer

### 2.1 What it does

For each transmission that carries speech, the classifier returns structured
data: priority, category, whether it indicates distress, the keywords that drove
that reading, whether it is a status check, which other unit it is about, what a
cut-off transmission appeared to be starting to say, and a one-line plain-language
digest for the commander's feed.

Structured output is enforced by schema at the API level rather than parsed out
of prose. The engine consumes these as fields, not as text.

### 2.2 Requirements

**R12.** The classifier shall return schema-valid structured data or fail
loudly. It shall not return prose for downstream parsing.

**R13.** The same prompt, model and schema shall be used at build time and at run
time. There shall be no separate, easier prompt for live demonstration.

**R14.** The engine shall treat classifier output as evidence, not as instruction.
No single classifier field shall be sufficient to trigger an action that a wrong
value would make harmful.

### 2.2a The quality ceiling is upstream of the classifier

Worth recording where the limit on transcription accuracy actually sits, because
the instinct is to look at the recogniser or the model.

P25 does not transmit audio. It transmits **vocoder** parameters — a speech
*model's* pitch, voicing and spectral envelope, at roughly 2.4–4.4 kbps
depending on phase. That is a model-based codec, not a compressor, and it
discards acoustic detail permanently. It is why P25 audio sounds synthetic.

**Speech recognition on vocoded audio is measurably worse than on clean audio,
and no improvement in the recogniser recovers what the vocoder already
discarded.** Neither a larger transcription model nor a larger classification
model moves this ceiling.

Two consequences for how the product is designed and described:

- **Do not promise transcription accuracy figures derived from clean-speech
  benchmarks.** They will not hold on this input.
- **It reinforces §2.3.** The engine already refuses to act on a single model
  output, and this is another reason why — the input to that model is lossy
  before it ever reaches us, in a way we cannot fix.

The classifier's own design partly accommodates this already: the
`cut_off_meaning` field exists because fragments are expected, and the engine
treats a fragment as evidence rather than requiring a clean sentence.

#### The ceiling does not apply to the analog fallback channel, which is a happy accident

`8TAC95D` is analog FM. Its audio never passes through a vocoder — the
discriminator's output *is* the waveform, band-limited and companded but not
reduced to model parameters. **At comparable signal-to-noise ratio, transcription
of talkaround audio should be meaningfully better than transcription of P25 trunk
voice**, because none of the vocoder's loss has happened.

The honest counterweight is the link, not the codec: talkaround is transmitted
by a handheld at a few watts rather than by a tower, so those transmissions
arrive weaker and their quality falls off with distance in a way P25's does not
(`hardware-design.md` §3.3.2). Better codec, worse link. Which dominates is a
per-deployment question and has not been measured. [Inferred]

**The product consequence is worth stating, because it runs the pleasant way.**
The talkaround channel is where officers go *when the trunk has failed* — which
is precisely the situation this product exists for. So in the degraded scenario
that matters most, the transcription path is working from its **best** input
rather than its worst.

`docs/hardware-design.md` §3.5.3 covers the same vocoder from the hardware side,
including the licensing dependency it brings with it.

### 2.3 Why the engine does not simply trust the classifier

R14 earns its place from observed behaviour, not from caution in principle.

In the generated classifications, the model labelled a routine transmission —
Campus PD reporting "we're at the gym doors, nothing here" — as a status check.
It is not one. Had the engine acted on that field alone it would have opened an
answer timer on a unit nobody was waiting on, and eventually raised a signal on
an officer who was fine.

It did not, because a status check only starts a timer when the *subject unit*
resolves to a unit actually observed on the trunk, and that transmission named
nobody. The mislabelling was inert. This is the general pattern the design
follows: let the model do the language task it is good at, and require anything
consequential to be cross-checked against something the engine can verify itself.

A second, smaller case makes the same point. The model reports which unit a
transmission is about using the words the speaker actually used — a dispatcher
says "4471", not "8M-4471", so that is what comes back. Rather than demand the
model produce canonical identifiers it cannot know, the engine resolves the
reference against the roster of units it has genuinely heard on the trunk, and
**refuses to resolve an ambiguous reference at all**, on the grounds that acting
on the wrong officer is worse than acting on none.

### 2.4 Why Haiku, and not something larger

Labelling one short radio transmission is a classification task, not a reasoning
task. More importantly, the production argument depends on cost: this has to run
on *every* transmission at a busy scene, continuously, for as long as the
incident lasts. A model that is too expensive to run on routine traffic is a
model that only runs on traffic somebody already flagged — which defeats the
purpose.

### 2.5 The demo reliability pattern, and why it is not a cheat

The scripted demonstration replays **cached classifications, generated ahead of
time by genuinely calling the model**, with the raw API responses kept alongside
them as evidence. A separate page makes a **real, live call** on a phrase typed
on the spot.

This split is deliberate and it is the honest arrangement, not a compromise:

- The **live presentation has no network dependency in its critical path.** A
  conference wifi failure cannot break the pitch. Given that the product being
  pitched is about communications failing under load, being taken down by a
  network failure mid-sentence would be a bad look on top of a lost demo.
- The **claim that the AI is real remains checkable on the spot.** The obvious
  challenge — "did you write those labels yourself?" — is answered by typing a
  new phrase and watching the model classify it live, in front of the room.
- The **live page is isolated on its own tab**, so when it fails it fails alone.

The property that makes this honest rather than a sleight of hand is R13: one
prompt definition, one model, one schema, shared by the build-time job and the
live endpoint. The live demonstration is not an easier version of the task. It is
the same code path.

### 2.6 Production architecture: hybrid, for the same reason DMPO is

Anthropic does not distribute model weights for on-device deployment. Claiming
"Haiku running on the Orb unit" in a production story would be false, so we do
not claim it.

What the production architecture should be instead mirrors ARC Edge's own
philosophy one layer up:

- **Primary path — cloud classification over ARC Edge's own resilient
  connectivity.** This is sound precisely because of what the product is solving.
  P25 trunk congestion is a *local radio capacity* failure. It is not the same
  event as a regional loss of connectivity. In the scenario this product is built
  for, the trunk is saturated while cellular, satellite and mesh paths remain
  available — which is exactly the situation ARC Edge exists to exploit.
- **Fallback path — a small open-weight model on the Jetson-class compute already
  in the unit**, for genuine connectivity loss. Lower quality, still running.

That is the same principle DMPO applies to networking — use the best available
path, degrade gracefully rather than failing — applied to inference. It is not a
borrowed slogan; it is the same engineering judgement about the same class of
problem.

---

## 3. Command Feed

The on-scene commander's interface. Reachable from any host on the ARC Edge
network.

### 3.1 Requirements

**R15.** The Command Feed shall present four things: a **two-tier alarm panel**, a
**running digest**, a **command view** of what needs attention now, and **scene
status** (trunk condition, advisories, units heard).

**R16.** Every alarm shall show the signals it rests on, each with its source and
timestamp, in plain language.

**R17.** The digest shall carry the synthesised line, and shall make the original
transcript available beneath it.

**R18.** Blocked attempts shall be summarised, not enumerated one line at a time.

**R19.** The interface shall be legible at arm's length under stress: plain
language over jargon, one hierarchy, colour used only where it carries meaning.

**R20.** **[PARTIAL]** The interface shall attribute its classifications visibly — model and
generation time — so that a reader can tell what was machine-generated.

### 3.2 Why alarms must show their working

R16 is the difference between a tool a commander uses and one they override.

"High confidence emergency, 8M-2210" is an assertion, and an assertion from a
box is something a commander has no way to weigh. "Emergency button pressed at
2:01, and separately, distress heard in speech at 2:03" is evidence, and evidence
can be acted on immediately or discounted immediately. Either way the commander
stays in charge of the decision, which is both operationally correct and the only
version an agency will accept.

It also matters for the product's own credibility over time. A system that shows
its reasoning can be caught being wrong, corrected, and tuned. A system that only
emits verdicts accumulates distrust with no route to fixing it.

### 3.3 Why the two demo tabs look nothing like each other

The RF Environment view is dense, monospace, undifferentiated, and hard to read.
The Command Feed is calm, plain-language, and ordered.

That contrast is the argument, built into the design rather than asserted in the
script. Both tabs receive exactly the same events at exactly the same moment. The
difference in how much work the reader has to do is the entire product.

---

## 4. Control Panel

Field setup and administration, for a technician, on a locally-connected tablet
or any host on the ARC Edge network.

### 4.1 Requirements

**R21.** **[NOT IMPLEMENTED]** Operating mode: passive receive-only, or full participant (licensed
transmit). Receive-only is the default.

**R22.** **[NOT IMPLEMENTED]** Target system: band, WACN, System ID, NAC, site, control channel. The
three system identifiers shall be shown together, because together they are what
confirms the unit is tracking the intended trunk rather than a neighbouring
system on the same band.

**R23.** **[NOT IMPLEMENTED]** Fallback channel selection, generic across bands rather than hardcoded
to 800 MHz. The Texas plan designates a direct/talkaround channel per band and an
agency on VHF has a different one.

*Refined 2026-07-31, during a QA pass against the built mockup.* Generic across
bands does **not** mean every band's channels are offered on every unit. **The
list shall be confined to the fitted band module**, because the front-end filters
and the array are cut for one band and both live in the module
(`hardware-design.md` §1.1.1) — a UHF talkaround channel is not merely
unconfigured on an 800 MHz unit, it is unreachable. The mockup originally offered
all four bands' channels in one dropdown, which contradicted the SKU decision.

**R23a.** **[NOT IMPLEMENTED]** The Control Panel shall display the fitted band
module as **detected, read-only**, rather than as a setting. The band is a
physical SKU: array, filters, power amplifier and the array calibration table all
live in the module, which reports its own identity to the processing body over
the dock. Presenting it as a dropdown implied a software-selectable band that
does not exist.

**R24.** **[NOT IMPLEMENTED]** P25 identity for licensed mode (unit ID, home WACN, home System ID),
visibly inactive in receive-only mode.

**R25.** **[NOT IMPLEMENTED]** Encryption key management, allowing an agency to load keys **it already
legitimately holds**. Key material shall be held in the hardware secure element
and shall not be exportable.

**R26.** **[NOT IMPLEMENTED]** Detection thresholds, per §1.4a.

**R27.** A diagnostics view showing what the receiver is hearing, raw.

**R27a.** The diagnostics view shall show the **permanently-instantiated
channelisers — the control channel and the analog talkaround channel — from
start-up**, distinguished from the voice channels that are created on a decoded
grant and torn down when the call ends (`hardware-design.md` §3.3.1).

*Why this is a requirement and not a rendering detail:* the view originally
listed only channels that had carried traffic, so talkaround appeared in the
panel at the moment talkaround traffic did. That reads as though the unit
*switched* to the fallback channel — the behaviour of a scanner, and the opposite
of the design's actual claim. Simultaneous monitoring is a differentiator (§1.1),
and a panel that only shows it for the five seconds someone is talking is not
demonstrating it. Covered by three assertions in `test/ui-smoke-test.js`, which
check the panel *before* any event has fired.

### 4.2 Two notes on the crypto function

**What it is for.** An agency running encrypted talkgroups on its own system, or
operating under a mutual-aid arrangement it is party to, already holds those
keys. Without somewhere to load them, the Orb is deaf to that agency's own
traffic — the product fails for exactly the customers who invested most in their
radio system. This is a capability an authorised operator uses on traffic they
are already entitled to hear.

**What it is not.** It confers no ability to decrypt a system the operator is not
authorised on. It cannot: the keys have to come from somewhere, and that
somewhere is the system operator. Two facts are worth stating plainly whenever
this comes up. LCRA participants run largely unencrypted, so the demonstrated
capability does not depend on this feature at all. And where a system *is*
encrypted, only the voice payload is protected — call setup metadata (WACN,
System ID, NAC, unit ID, talkgroup, signal quality) remains extractable, so
congestion detection and blocked-attempt reporting work on an encrypted system
even with no keys loaded whatsoever.

That second point is a genuine architectural strength and is easy to undersell:
**the core detection capability does not depend on hearing anyone's voice.**

### 4.3 Why the diagnostics view exists

A technician who deploys a unit and walks away needs to know it is hearing the
right trunk. Every parameter in §4.2 can be entered correctly and still point at
a neighbouring system. The diagnostics view answers one question — *is this
thing decoding what I think it is decoding* — and answering it on site is much
cheaper than discovering the answer during an incident.

Tab 1 of the proof of concept is this view. In the product it is not a separate
application; it lives inside the Control Panel.

---

## 5. Build scope for this proof of concept

| Piece | Status |
|---|---|
| Detection and synthesis engine | **Built**, real working code, 47 automated assertions |
| AI classification layer | **Built**, real model calls, cached for the presentation |
| Command Feed | **Built**, driven live by the RF Environment tab |
| RF Environment / diagnostics view | **Built** |
| Live classifier demonstration | **Built**, isolated, real API call |
| Control Panel | **Static mockup only**, not interactive |
| Live audio pass-through | Not built — real capability, out of scope for this demo |
| Licensed transmit capabilities | Not built — roadmap |
| Direction finding | Standalone artifact only, not integrated |
| Existing-Radio Interface tier | Not built — roadmap |

The radio events themselves are a scripted timeline, because no P25 receiver
hardware exists for this demo. ARC Edge's own path-selection algorithm is
represented narratively rather than implemented, because it is Orb Aerospace's
intellectual property and not ours to reproduce.

---

## 6. Multi-Orb operation — *roadmap. None of this is built.*

**Status: design proposal, 2026-07-31.** The proof of concept is a single
simulated Orb. Its two browser tabs communicate over `BroadcastChannel`, which is
same-origin and same-machine and **is not a network protocol**. Nothing in this
section exists in code.

It is written because the architecture turns out to be unusually ready for it —
mostly through decisions taken for other reasons — and because the parts that are
genuinely hard are not the parts the idea makes obvious.

### 6.1 The requirement

*n* Orbs on one ARC Edge network discover each other and operate as a **flat
collective** with no master, jointly producing:

- **one shared commander's feed**, published over the ARC Edge intranet;
- **one shared geospatial layer** for ARC Edge's COP service;
- **collective detection** — observations from different Orbs combining to reach
  decision thresholds that no single Orb could reach alone.

Orbs on different bands contribute to the same output.

### 6.2 The architecture in one line

> **Replicate the observations, not the conclusions. Every node runs the same
> pure reducer over the same merged set and therefore computes the same view.**

This is state-machine replication, and it works here for one specific reason:
**R1 already requires the engine to be a pure function of its input stream and
its clock** — no DOM, no network, no internal timers. That was specified for
testability. It happens to be exactly the property that makes a masterless
collective possible.

Give every node the same set of observations and each independently derives an
identical feed. No coordinator, no election, no shared mutable state.

**Why masterless is the right call rather than merely an elegant one.** A master
is a single point of failure in a product whose entire premise is degraded
connectivity. With a pure reducer, **any surviving Orb can serve the interface**,
and the answer it gives is the same one any other would have given.

### 6.3 Two record types

**Observation — what one Orb perceived.**

```
Observation {
  observer   { orbId, position, clockOffset, peersVisible }
  perception { rssi, snr, bearing?, bearingSigma?, sensitivityDegradedDb }
  subject    { system(WACN+SysID), unit, talkgroup, channel, direction }
  event      { type, tStart, tEnd, truncated }
  content    { transcript?, classification? }        // often absent
}
```

The observer's identity and its own quality are carried **separately from the
fact observed**. That separation is what makes the rest work.

**Sighting — one real transmission, after merge.**

```
Sighting {
  id           // deterministic, derived from the correlated group
  event        // the deduplicated fact
  perceptions[]  // one per observing Orb — rssi, bearing, degradation
  content      // best available across all observers
}
```

**Content merges by union, not intersection.** If any Orb transcribed and
classified a transmission that others missed or could not read, the sighting
carries it. That is the explicit requirement and it falls out naturally.

**Where observers disagree on interpretation** — both transcribed, classifier
read them differently — the rule must be stated rather than left to chance.
**Proposed: prefer the perception with the higher SNR; on a tie, prefer the more
alarming reading and fail safe.** Not settled. [Assumption]

### 6.4 Determinism is the whole design, and correlation is where it can break

Two Orbs hearing one transmission must produce **one** sighting. That is the same
association problem as multi-unit direction finding, and `df/README.md` already
specifies a four-tier strategy for it: decoded identity as a primary key, GNSS
timestamp plus channel, carrier-frequency-offset fingerprinting, and geometric
validation. **Solve it once and it serves both.**

**But tolerance-based matching is order-dependent, and that would break
convergence.** Greedy matching over observations arriving in different orders can
group them differently on different nodes — and then the "flat collective" stops
agreeing.

**Fix: impose a total order before correlating.** Sort observations by
`(tStart, orbId, subject)` and correlate in that fixed order on every node.
Grouping then depends only on the *set* of observations, never on arrival order,
and the reducer's output is identical everywhere. This is the non-obvious step
that makes the whole thing converge, and it should not be left as an
implementation detail.

**Unit identity must be namespaced by system**, and this is a prerequisite
rather than a consequence — see §1.1, which establishes that it is **already a
defect for a single Orb**, because an interoperability channel is cross-agency by
definition. Collective operation makes it unavoidable rather than introducing it.
Key by `(WACN, SystemID, unitId)`.

### 6.5 Collective corroboration — and why R4 does not change

The phrase "combine observations to reach thresholds collectively" hides two
cases that must be handled oppositely.

| Case | Should it escalate? |
|---|---|
| Two Orbs hear **the same transmission** | **No.** One event observed twice is not corroboration |
| Orb A hears a distress call; Orb B hears an unanswered status check for the same unit | **Yes.** Two kinds, two events, genuinely independent — and unavailable to either Orb alone |

**R4 already gets both right, provided sightings are properly deduplicated.** It
counts distinct signal *kinds* and distinct *source events* against a Set. Merge
duplicates into one sighting with one id and the first case cannot escalate; the
second case produces two ids and two kinds and does.

So the rule that took a real bug to get right needs no change. **Deduplication is
what makes it correct across a collective**, and getting dedup wrong reintroduces
exactly the failure R4 exists to prevent: two readings of one reality counted as
two pieces of evidence.

**A third case is genuinely new and worth having.** When two Orbs both produce
bearings for the same unit and those bearings cross at a plausible location, that
is mutual confirmation of the *association itself*. When they cross somewhere
impossible, it is a warning. That is the geometric-validation tier of
`df/README.md` doing double duty.

### 6.6 Transport, ordering and partitions

**Gossip over the ARC Edge mesh.** Peers periodically exchange observation sets.
No central broker. Discovery via mDNS/DNS-SD or an ARC Edge service registry —
low-risk, but dependent on their network layer.

**Order by GNSS timestamp, never by arrival.** The engine is pure, so a corrected
order can simply be replayed.

**Two publication speeds, mirroring §1.4.** A short settling window (order of
seconds) before the merged picture is treated as stable, so late observations
arrive before an alert is published — **but emergency and other control-channel
fast-path signals bypass it entirely.** Trading a few seconds of latency for
stability is right for the merged picture and wrong for an emergency
declaration.

**Retroactive change is the cost, and it must be designed for.** Late-arriving
observations can promote, demote or merge an alert that a commander is already
looking at. This is the escalation-lag problem of §1.4 one level worse, and the
interface has to make it legible rather than startling.

**Partitions are handled by honesty, not by consensus.** If the mesh splits, each
partition converges on its own subset. Both views are internally consistent and
neither is wrong — but neither is complete.

> **Every node shall publish how many peers it can currently see.** A commander
> looking at a feed derived from two Orbs out of five needs to know that.

That is the network-layer counterpart of the sensitivity indicator in §1.5, and
the same principle: **an undetected absence is worse than an admitted one.**

### 6.7 Who publishes, without an election

Every node can compute the feed, so serving it is a routing question, not a
consensus one. The commander's browser connects to whichever Orb the ARC Edge
intranet resolves.

For the **COP feed**, where duplicate submissions are undesirable, a rule that
needs no protocol: **the node with the lowest identifier among currently-visible
peers publishes.** That is a pure function of the visible peer set, so every node
computes the same answer and no election traffic exists. If that node drops, the
next takes over automatically.

During a partition both sides will publish. That is arguably correct — both are
honest views — but submissions should carry the publishing node and the peer set
it could see, so the COP can reconcile rather than double-count. [Assumption]

### 6.8 What the COP layer carries, and how it degrades

| Layer | Needs |
|---|---|
| **Orb positions** | GNSS. Always available |
| **Bearing rays / wedges** | One DF-capable Orb. Useful on a map on its own |
| **Fixes with uncertainty ellipses** | Two DF-capable Orbs plus association |
| **Validated fixes** | Three, where residual checking exposes bad bearings and bad associations |
| **Coverage-confidence overlay** | Every Orb's §1.5 sensitivity report, combined |

**The last one is the interesting one and it is not in the original proposition.**
With every Orb reporting its own degradation, the collective can render *where it
can currently hear well and where it cannot.* That is a genuinely novel COP
layer — a map of the system's own blind spots — and it falls directly out of the
instrument-health requirements rather than needing anything new.

### 6.9 What is not replicated

**Push conclusions; pull evidence.**

Raw I/Q never leaves the Orb that captured it (`df/README.md`). Audio is not
gossiped either — it is large, and the transcript is what the collective needs.
But a commander may want to *listen*, so audio should be **fetchable on demand**
from the Orb that holds it, rather than pushed to everyone in advance.

### 6.10 Scale

An observation is a few hundred bytes. A mass incident might run a few
transmissions per second; with ten Orbs and gossip overhead that is on the order
of tens of kilobytes per second, against a network built to carry video. An
eight-hour incident produces tens of megabytes of sightings.

**Scale is not the constraint.** Correctness of correlation is.

### 6.11 What has to be built, in order

1. **System-namespaced unit identity.** A correctness defect today; small change.
2. **The observation record and deterministic correlation**, including the total
   order of §6.4. This is the load-bearing piece and everything else assumes it.
3. **Gossip transport and peer visibility reporting.**
4. **Settling window and fast-path bypass.**
5. **COP feed publication**, including the lowest-identifier rule.
6. Everything geospatial, which is additionally gated on direction-finding
   hardware (`hardware-design.md` §7).

**Items 1 and 2 are the ones that must be right.** The rest is transport and
plumbing, and none of it can rescue a correlation layer that groups observations
differently on different nodes.
