# Module 8 — Hardware

**Time:** about 40 minutes.
**Prerequisite:** [Module 1](01-radio-fundamentals.md).
**Goal:** explain the radio module to an engineer without pretending to be one,
and defend the component choices.

**No electrical engineering assumed.** Where a component appears, it is explained
by what it does and why it is there, not by how it works internally.

Companion document: [`docs/hardware-design.md`](../docs/hardware-design.md).

---

## 8.1 Say this first, every time

> This is a conceptual architecture written for a pitch. It is not a
> procurement-ready design. No RF simulation, no PCB layout, no thermal analysis,
> no EMC pre-compliance, and no part has been price-checked or lifecycle-checked.

The document says this in its own opening. Lead with it. What the design *does*
establish is narrower and more useful: the module is buildable from existing
catalogue parts, the hard work sits where we say it sits, and we know which
decisions are still open.

---

## 8.1a The word "channel" means six things — learn them before §8.3

This is not pedantry. **A collision between two meanings of "channel" produced a
false claim in our own hardware document**, and a reviewer caught it. Knowing the
vocabulary is what stops you repeating it live.

| Term | What it means |
|---|---|
| **RF channel** | A frequency with a bandwidth — 851.5500 MHz, 12.5 kHz wide. The physical thing on the air |
| **Channel designator** | The operational name — *8TAC95D* — bundling frequency, mode, and squelch settings |
| **Control channel / voice channel** | *Jobs* an RF channel does in a trunked system: signalling, or carrying a call |
| **Uplink / downlink** | The two directions, **on different frequencies** — 45 MHz apart at 800 MHz. A "control channel" is really a pair of frequencies |
| **Receive chain** | A hardware path inside the radio chip. Each ADRV9002 has two; four chips give eight, arranged as two **coherent groups** of three plus a calibration reference (§8.3). The AD9361 before that had two chains on one chip. **This is the one that caused the error** |
| **Talkgroup** | The group a call is addressed to. Radio users call this "a channel" because it is a knob position on their radio |

**The rule:** if you say "channel" and mean hardware, say **chain** instead. If
you say "channel" and mean a group of officers, say **talkgroup**. If someone
else says "channel," work out which one they mean before answering.

The uplink/downlink row is the one most likely to catch you out in a technical
conversation — see §8.3b.

---

## 8.1b The product is two pieces, and only one of them changes

This is the thing to get right before anything else, because it is what a
customer actually asks: *"will this work on our system?"*

**A common processing body docks into a band-specific module.**

| | What it is | Varies? |
|---|---|---|
| **Processing body** | Transceiver, FPGA, compute, LNAs, GNSS, secure element, Ethernet, power | **No.** Identical for every band — the transceiver tunes **30 MHz to 6 GHz**, so VHF, UHF and 700/800 are all covered with no mixer. See §8.3 |
| **Band module** | Housing, antenna array, filters, PA and duplexer | **Yes.** One per radio environment |
| **Licence** | Transmit enable, unit ID, keys | Software and authorisation only |

**Why licensing is never a hardware upgrade.** Under the Texas plan,
authorisation to use interoperability channels comes from a communications leader
**at the incident**. A capability that needs a hardware change is useless at the
moment it is granted. So the transmit hardware is present on every module and
switched on by authorisation. That argument beats the cost saving, and it is the
one to lead with.

**Why the module is a whole housing rather than a filter board.** Everything in
the body is band-agnostic. The *antenna* is not — element length and the spacing
direction finding needs both scale with wavelength. See §8.4a for what that does
to the form factor.

**The commercial point worth making:** the expensive, complex, software-heavy
part is common. The band-specific part is passive, cheaper and mostly mechanical.
A DPS unit could dock into a local agency's UHF housing during a mutual-aid
response.

### The whole product line is seven part numbers

One processing body. Three band modules — 700/800, UHF, VHF. Three clip-in
duplexer packs. That is it, and being able to say it in one breath is worth
practising.

**Every module is three-element and direction-finding capable.** We do not sell a
cheaper single-element version. Two reasons to give if asked: it halves the
number of things to build, qualify and calibrate; and the array is not wasted on
a customer who never wants a bearing, because combining the three elements in
software gives about **4.8 dB of extra sensitivity** on ordinary decoding — which
is exactly the weak-signal argument in §8.3b. See §8.5a for the precise version,
because "combining" here does not mean simply adding them up.

**Every module can transmit on interoperability channels. The duplexer is an
add-on.** This depends on a distinction worth having ready, because "can it
transmit" is really two questions:

| | Who authorises it | When | Hardware |
|---|---|---|---|
| **Interop / talkaround** (8TAC95D) | A communications leader | **At the incident** | PA + T/R switch — standard on every module |
| **Licensed trunk participation** | The system operator | Weeks or months ahead | Adds a duplexer — clip-in pack |

The first has to be standard, because nobody can buy hardware in the middle of a
response. The second can be planned for, because nobody is handed a trunk unit ID
mid-incident. **The cheap capability is the one that must be standard and the
expensive one is the one you can plan for** — a convenient alignment, and a clean
thing to say.

*Why a duplexer at all for trunk work, if a normal portable manages with a
switch:* because a normal portable is allowed to stop listening while it talks.
This is a surveillance device, and if it goes deaf to the control channel every
time it transmits, it loses trunk tracking — the thing it exists to do.

---

## 8.2 What the module has to do

In the demonstrated receive-only configuration:

1. Track the trunk's control channel and decode the call setup signalling.
2. Follow grants onto voice channels and demodulate P25 voice.
3. **Simultaneously** monitor the analog talkaround channel, 8TAC95D.
4. Hand the event stream to the ARC Edge base unit over Ethernet.

Point 3 is the one that shapes the hardware — but not in the way it first looks.
"Two things at once" does **not** mean two receivers. See §8.3.

**The most important framing point:** the module is a receiver and a decoder.
**It is not where the product's intelligence lives.** The detection engine is
software running on the event stream. Nothing in the alarm logic needs a faster
radio, which is why the hardware can be modest.

---

## 8.3 The signal chain, in plain terms

Signal flows top to bottom. Think of it as a pipeline where each stage does one
job.

```
   ANTENNA  (×3 elements, every module — §8.1b)
      │        picks up everything in the band
      ▼
   BANDPASS FILTER          "only let through the frequencies we care about"
      │
      ▼
   LOW-NOISE AMPLIFIER      "make the weak signal bigger without adding hiss"
      │
      ▼
   SPLIT (after the LNA)    one 2-way divider per element — costs 0.04 dB of
      │                     noise, not the 3.2 dB a split before the LNA would
      │
      ├─────────────────┬─────────────────────
      ▼                 ▼
   UPLINK GROUP      DOWNLINK GROUP     "turn radio waves into numbers —
   chips A+B         chips C+D           twice, once per direction of the call"
   ~806–808 MHz      ~851–853 MHz
      │                 │
      └────────┬────────┘
               ▼
   FPGA BRIDGE (Zynq-class)   "sort the flood into a few streams"
      │                        a handful of 12.5 kHz streams per group
      ▼
   COMPUTE (Jetson-class)   "turn numbers into meaning"
      │
      ▼
   ETHERNET  ──▶  ARC EDGE BASE UNIT
```

**Port map — who feeds what.** Each of the 3 antenna elements feeds *both*
groups; nothing is switched or time-shared:

```
element 1 ──┬──▶ uplink group   RX1        downlink group RX1 ◀──┬── element 1
element 2 ──┼──▶ uplink group   RX2        downlink group RX2 ◀──┼── element 2
element 3 ──┴──▶ uplink group   RX3        downlink group RX3 ◀──┴── element 3

cal tone source ──▶ uplink group   RX4  (reference tap, tone f_UL)
cal tone source ──▶ downlink group RX4  (reference tap, tone f_DL)
```

RX4 in each group never touches an antenna. It listens to the calibration tone
straight from its source, so comparing it against the same tone arriving
through the antenna chain tells you whether *the chain* has drifted or the
*source* has — see §8.3.

> **The FPGA stage was missing from the first version of this diagram**, and it
> is not optional. See §8.3a. Mentioning that you found and fixed it is worth
> more than having drawn it right the first time.

### The filter — why it is not optional

A filter rejects everything outside the band of interest.

**Why it matters here specifically:** a mass police response puts dozens of
transmitters within a few hundred metres of the unit, several of them high-power
vehicle radios. Without good selectivity, a strong nearby signal overwhelms the
receiver's front end and it goes deaf to the weak handheld you actually care
about. The term is *desensitisation*.

So the filter is what keeps the receiver working **in exactly the crowded
conditions the product exists for.** Being able to say that sentence is the whole
point of understanding this stage.

### The low-noise amplifier

Radio signals arriving from a handheld inside a building are extremely weak. The
LNA makes them bigger while adding as little noise of its own as possible.

It sets the system's **sensitivity** — how weak a signal the unit can still
decode, which in practical terms is how far away an officer can be and still be
heard. Catalogue part; this is not a place that rewards cleverness.

### The transceiver — the one choice that matters, and the one that changed today

**Four Analog Devices ADRV9002 chips, arranged as two "coherent groups" of
three receive chains each**, plus a calibration reference chain per group.
"Coherent group" is the term to use — it means three chains co-tuned to one
window and phase-aligned against each other, sampling the array to produce one
bearing. There are **two** of them.

Confirmed from the manufacturer's documentation:

- **30 MHz to 6.0 GHz** tuning range — covers VHF, UHF and 700/800 with no
  mixer, which matters in a moment
- **two receivers per chip**, each with its **own independent RF synthesiser**,
  so a chip's two receivers can sit at different centre frequencies
- **on-chip multichip synchronisation (MCS)**, re-run automatically on every
  retune — and, worth saying because it surprises people, **MCS is needed even
  within a single chip**: its two receivers are not phase-aligned by
  construction
- **150 dB/Hz dynamic range**, marketed by the manufacturer specifically against
  the "blocking" problem in mission-critical land-mobile radio — exactly our
  problem, see §8.3b
- **LVDS or CMOS SSI** digital interface — **not** the JESD204B/C interface of
  the part we briefly used before this one. That matters for the FPGA stage;
  see §8.3a
- channel bandwidths of **12 kHz to 40 MHz**

**How the eight chains are used:**

| | Uplink group — chips A, B | Downlink group — chips C, D |
|---|---|---|
| Tuned to | ~806–808 MHz | ~851–853 MHz |
| Chains 1–3 | elements 1, 2, 3 | elements 1, 2, 3 |
| Chain 4 | calibration reference tap (`f_UL`) | calibration reference tap (`f_DL`) |
| Hears | **handsets** — channel requests and granted voice. **These are the bearings that matter** | tower signalling, `8TAC95D` talkaround, and doubles as a **known-position calibration reference** — §8.3b, §9 |

**Every element feeds both groups.** After its LNA, each element's signal passes
through a small 2-way splitter, with one leg to each group. Nothing is switched
or time-shared — both groups are listening all the time.

### The biggest finding: the array was pointed at the wrong band

**This is worth being able to say plainly, because it is the single most
important correction in this design's history.** The array used to capture only
the *downlink* — what the tower transmits. Every bearing the system could ever
have computed would therefore have been a bearing **to the tower**, and the
tower's position is never in question; nobody needs a direction-finder to locate
a surveyed radio mast.

Handsets transmit on the **uplink** and on talkaround, not on the downlink. So
the array had to move to where the handsets actually are, which is what the
uplink coherent group now does.

### Why two narrow groups rather than one wide one

The obvious alternative is a single wide capture spanning both directions.
It does not work, for two independent reasons.

**It barely fits, and then it doesn't.** Handset emissions span from
806.2125 MHz (uplink control signalling) to 851.5500 MHz (talkaround) — **45.34
MHz**, set by the 800 MHz system's duplex split. A single window that wide needs
at least 45 MHz of capture. The AD9361 we used earlier could just about reach
that (56 MHz). The ADRV9002 cannot (40 MHz) — and no clever tuning fixes that,
because the three chains of one group have to be co-tuned to stay coherent.

**Even if it fit, one gain control for everything in it is a real problem.** A
single wide capture has a single automatic gain control acting on everything
inside it. A patrol car keying up on the uplink thirty metres away would pull
that gain down for the **downlink control channel too** — and the control
channel is where every alarm this product raises comes from. A wideband
capture that goes deaf to ordinary nearby traffic is a design that fails at
exactly the moment it is needed.

Two narrow groups give **two independent gain controls.** A strong uplink
signal desensitises the uplink group only; the control channel keeps decoding
regardless.

**And narrower is better for a second reason that has nothing to do with gain.**
Each group now sees about 2 MHz of spectrum instead of 47 MHz. Intermodulation —
signals mixing together inside the receiver to create phantom tones — is the one
dynamic-range problem that more processing gain cannot fix (§8.3b), and it gets
dramatically better the fewer strong signals share the window.

### How each group monitors several channels at once

The obvious guess — one receive chain per RF channel — is still wrong, and it
is the exact mistake an earlier version of this document made and a reviewer
caught: the three chains inside one coherent group are co-tuned by design, so
"three chains" never meant "three channels."

What each group actually does is **wideband capture and digital
channelisation.** It digitises its whole ~2 MHz window at once, and the compute
stage separates the individual RF channels out of that one capture in software
afterwards. The downlink group's window comfortably holds the control channel,
the granted voice channels and `8TAC95D` — they sit within about 2.5 MHz of each
other. The uplink group's window holds the corresponding inbound requests and
voice.

The analogy that fits a computing background: this is closer to **capturing a
whole network segment and demultiplexing it in software** than to plugging in a
second network card per channel. It is standard software-defined radio
practice — SDRTrunk follows a whole trunked system with one receiver this way.

> **Where this still does not help:** watching two genuinely separate bands at
> once — a VHF trunk plus this 800 MHz system, say — needs a second processing
> body, not more chains here. It does not arise for us, because the Texas plan
> designates a talkaround channel *per band*, so an agency's trunk and its
> fallback sit in the same band by construction. Say so if asked; it is a real
> limit.

### "One body covers every band" is true again — say how it got there

This claim broke once and is now fixed, and the honest version of that story is
stronger than pretending it never happened. The AD9361 we started with tuned
70 MHz–6 GHz, covering every band in the Texas plan. The part we moved to next,
for phase-coherence reasons, tuned only 650 MHz–6 GHz — putting VHF (136–174
MHz) and UHF (380–520 MHz) below its floor, and nobody re-checked that when the
part changed. A reviewer caught it.

**The ADRV9002 we use now tunes 30 MHz–6 GHz** — lower than even the original
AD9361 — so the gap closes outright, with no mixer needed anywhere. It closed as
a side effect of solving the uplink/downlink problem above, not because anyone
was chasing it directly, which is worth saying plainly rather than claiming
credit for it.

### The split costs almost nothing, and stays out of the band module

Splitting one element's signal in two would normally cost **3.2 dB** of the
signal — 3.01 dB from simply halving the power, plus a little insertion loss.
Doing the split **after the LNA** instead of before it means that 3.2 dB is
divided down by the LNA's own gain, and the real cost is about **0.04 dB** of
system noise figure. [Confirmed — standard passive-component physics; the LNA
gain assumed is stated in `docs/hardware-design.md` §3.3.]

Because the LNAs already live in the processing body, this is **a
processing-body change only. The band modules are untouched** — no new SKU, no
antenna rework.

### Two calibration tones, and a reference tap that tells drift apart

A calibration tone is only useful if it falls inside the window a group is
listening to, and the two groups are 45 MHz apart. So there are **two** tones,
`f_UL` and `f_DL`, generated together and injected at the three element
couplers exactly as before — both windows get calibrated the same way.

**The fourth chain in each group is a direct tap on the tone source itself**,
bypassing the antenna entirely. Comparing the tone as it arrives through the
whole antenna chain against the tone as the source actually emitted it is what
separates *the chain drifting* from *the source drifting* — without that
reference, a wandering oscillator and a wandering cable look identical.

**Transmit is already there.** The licensed tier does not need a different
radio. It needs a power amplifier, a duplexer, and an authorisation.

> **If asked "why not a cheap off-the-shelf scanner?"** — a consumer scanner
> gives you audio out of a speaker. We need the decoded signalling as structured
> data, several channels decoded in parallel, in a ruggedised unit that
> integrates with ARC Edge. The chip choice is about getting data rather than
> sound.

### 8.3a The FPGA bridge — the stage we missed

The radio chips hand out their digitised signal on **LVDS or CMOS SSI** — a
source-synchronous parallel interface. **A Jetson has no input that can accept
that.** Jetson modules take video (CSI), USB and PCIe. None of them is a radio
interface.

*(The ADRV9026 we briefly used before this one needed a faster, more
complicated interface called JESD204B/C, which would have needed gigabit serial
transceivers in the FPGA and a fiddlier bring-up. Moving to the ADRV9002 for the
uplink/downlink reasons above **made this stage cheaper, not more expensive**:
LVDS/CMOS SSI needs no gigabit serial transceivers at all, and an ordinary
mid-range Zynq-class part is enough. Say so if the topic comes up — it is one of
the genuine upsides of today's change, not just a cost to absorb.)*

So there has to be a stage in between: an **FPGA** — a chip whose logic you
configure rather than program — that catches the flood from all four chips and
hands the Jetson something it can take, over PCIe or USB.

Every comparable radio does this. Analog Devices publish the interface logic for
exactly this purpose, so it is integration rather than invention.

**Why this is good news rather than an embarrassment.** The FPGA is not just an
adapter. It is the right place to do the channel separation of §8.3, because that
work is repetitive fixed-point arithmetic, which is what FPGAs are for. Doing it
there means the cable to the Jetson carries a few 12.5 kHz voice streams instead
of 1.5 Gbps of raw spectrum — a reduction of several orders of magnitude.

**The framing to use:** the compute story is two parts, not one. An FPGA doing
fast, regular, unchanging signal work; a Jetson doing irregular, stateful,
decision-making work including the local AI. That is the conventional split and
it is what a radio engineer expects to see.

### The compute module

A **Jetson-class embedded module** (NVIDIA Orin Nano / Orin NX class) does two
jobs: the radio signal processing, and hosting the local AI fallback.

Confirmed power figures: configurable **7 W and 15 W** modes, with 25 W and
higher-performance modes; roughly 4.5 W idle and 8–12 W under typical
single-stream inference.

**Why one module instead of two.** The conventional split would be a dedicated
DSP or FPGA for demodulation plus a separate applications processor. But P25 is a
narrowband, low-bit-rate mode — the open-source SDRTrunk project decodes it on
ordinary desktop CPUs. It is not computationally demanding.

**The GPU is not there for the radio.** It is there so the classification model
has somewhere to run when connectivity is gone. That is the honest reason, and it
is a better answer than "for performance."

### The supporting parts

| Part | Why |
|---|---|
| **GNSS + disciplined oscillator** | Accurate event timestamps; foundation for any future multi-unit work where two Orbs must agree on when something happened |
| **Secure element** | Hardware key storage. The Control Panel's crypto function is only defensible if key material demonstrably cannot be exported |
| **Ethernet PHY** | The settled interface to the ARC Edge base unit |
| **Dedicated power supply** | Separate from ARC Edge's own battery budget — a settled decision |

### The transmit parts — always fitted, switched on by licence

The **power amplifier** and **duplexer/switch** live in the band module, because
both are band-specific, and they are **populated on every module**. Transmit is
enabled by authorisation in software.

An earlier version of this module said they were fitted only to transmit-enabled
builds. That was wrong, and the reason it was wrong is worth carrying: **the
authorisation arrives at the incident**, from a communications leader, and a unit
that would need a hardware change at that moment is no use. 8TAC95D is capped at
20 W ERP, mobile and portable only — a modest target.

Two follow-ons if pressed. The receive-only power argument in §8.4 is untouched,
because it always rested on the amplifier being *unpowered*, not absent. And
whether transmit-capable hardware can ship to an agency not yet licensed for
those frequencies is a compliance question we have flagged and not answered.

---

## 8.3b Hearing what the network missed — *not built, and say so*

**Nothing here is implemented.** The demo's engine consumes an event stream and
knows nothing about signal strength. This is design analysis. It is also the
strongest capability argument the architecture has, so it is worth knowing
properly.

### The asymmetry

A radio call fails when the signal is too weak **at the tower**. The tower may be
10 km away. Our unit is on scene, maybe 100 m from the officer.

Signal strength falls off with distance — as the square of it in open space, and
faster than that among buildings. A hundred-fold advantage in distance works out
to roughly **40 dB in the open and around 60 dB in a built-up area**. In plain
terms: the signal reaching us can be tens of thousands to a hundred thousand
times stronger than the one reaching the tower. **And the worse the environment,
the bigger our advantage gets** — which is the opposite of how people expect
radio problems to behave.

**The sentence to use:** *we are not a better receiver than the network's, we are
a closer one.*

### Three thresholds, and only the last is a cliff

| Tier | What you need | What you learn |
|---|---|---|
| **Detect** | Energy in the right place at the right time | Something transmitted |
| **Recognise** | A known pattern matches — works *below* the decode threshold | Something transmitted, and what kind |
| **Decode** | Error correction and checksum pass | Who, what talkgroup, what they asked for, emergency or not |

**The consequence that matters: direction finding only needs the first two.** A
bearing comes from the carrier, not the message. **We can point at a transmission
we cannot read.** The honest limit is that we would then say "an unidentified
radio transmitted from that direction" rather than naming the officer.

### The two cases, and why one is much harder

**Case A — a P25 call the trunk never answered.** Fully decodable if we can hear
it, which would give us the unit, the talkgroup and the emergency flag on a call
the network has no record of. Two bonuses: a failing radio *retries*, so failure
gives more transmissions than success; and hearing a request with no answer
following it is a new kind of detection in itself — different from the "blocked"
case in the demo, because being blocked means the trunk *heard* you.

**This used to be blocked on something real, and it is fixed now.** Officers
transmit on **uplink** frequencies, 45 MHz away from the downlink the array used
to capture. The old captured slice covered downlinks only, which meant the
whole of Case A was unreachable no matter how good the software got.

**The uplink coherent group closes that gap.** It is tuned to ~806–808 MHz —
exactly where handset requests and granted voice sit — so the RF capture
problem is solved by the same transceiver change that fixed direction finding
(§8.3). What is still missing is the software: the demo's engine is not wired
to decode and report on this group yet. Say it that way — the hardware can hear
it, nothing downstream is listening for it.

**Case B — an analog transmission too weak to understand.** Much easier, and
**needs no hardware change at all.** 8TAC95D is simplex, so officers transmit on
the same frequency we are already listening to. Analog fades gracefully instead
of cutting out, and a carrier is detectable long after the speech is unusable.

The limitation is knowing *who*. Analog carries no unit ID unless the fleet sends
a small data burst at PTT press. Many public safety fleets do; whether this one
does is a question for the agency, not for us.

**Do not claim we can transcribe static.** The claim that holds up is narrower
and still worth having: *"an unintelligible transmission happened on the tactical
channel, at this time, from this direction, by this unit if the fleet identifies
itself."* For a commander whose officer is not answering, that is a direction to
search where there was nothing before.

### The catch, and it is a real one

**Wideband capture trades weak-signal sensitivity for channel count.** A
narrowband receiver can filter a strong nearby signal out before digitising it. A
wideband one cannot — everything arrives together, and **the strongest signal
sets the gain for all of it.** A 50 W vehicle radio 30 m away and a 1 W handheld
inside a building can differ by 60–80 dB, and the converter has about 74 dB to
work with.

So the wider the slice, the more channels you monitor — and the more likely you
are to swallow the one strong signal that blinds you to the weak one you actually
wanted. **That is in direct tension with everything above.** Splitting into two
narrow ~2 MHz groups instead of one 47 MHz one (§8.3) is a real mitigation — a
fixed handful of signals share each window rather than a whole duplex band — but
it is a mitigation, not a budget. No dynamic-range budget has been computed for
this design. Knowing that tension exists, and saying so, is the difference
between understanding the architecture and reciting it.

---

## 8.4a Which bands can do direction finding — the customer's real question

Only the antenna is band-constrained. Everything else tunes. So this table is the
whole answer to "will DF work on our system?"

| Band | Element spacing needed | Element length | Housing |
|---|---|---|---|
| **800 MHz** | 17.6 cm | 16.6 cm | Case lid, easily |
| **700 MHz** | 19.5 cm | 18.3 cm | Same case |
| **UHF** (450) | 33.3 cm | 31 cm | Larger case. Still carried by one person |
| **VHF** (155) | 97 cm | 91 cm | **Mast or vehicle mount. No case holds this** |

**Three things to say correctly.**

**It is not all-or-nothing.** Spacing closer than half a wavelength does not
break the method — it only costs accuracy, and predictably, roughly in proportion.
UHF in a smaller case costs about 1.9× the bearing error, which may still answer
"which wing of the building." That is a decision with a number attached, not a
wall.

**At VHF, the problem is element length, not spacing.** You could get a workable
baseline in a big case. You cannot fold a 91 cm antenna into it. Telescoping
elements exist, but three of them have to match *each other* precisely, and a
sliding joint is exactly the kind of variable we have eliminated everywhere else.

**Only direction finding is band-limited.** The base receive-only unit — the
product actually demonstrated — works at VHF with an ordinary whip and no
difficulty. *"Our product is band-limited"* and *"one optional feature is
band-limited"* land very differently in a room, and only the second is true.

---

## 8.4 Power, and why receive-only is genuinely lean

Two components dominate; everything else is rounding error.

| Configuration | Approximate total |
|---|---|
| **Receive only** | roughly 10–20 W |
| **Licensed transmit, keyed** | substantially higher during transmit |

*(Inferred from the confirmed Jetson power modes plus the general result that RF
power amplifiers dominate transmitter power draw. Not measured.)*

**The conclusion worth carrying:** receive-only is not a stripped-down compromise
that we are shipping because licensing is hard. The power amplifier is
*unpowered*, so it is meaningfully cheaper to run — which matters for a
backpack-portable unit on batteries.

That is a real engineering argument for shipping the receive-only tier first,
independent of the regulatory one. Having two independent reasons for the same
decision is a strong position.

---

## 8.5 Build versus buy — where the effort actually goes

This drives schedule and hiring, so be able to state it.

**Hardware is mostly integration.** The transceiver, compute module, filters,
amplifiers, oscillator and secure element are all catalogue parts. The genuinely
custom hardware work is **the carrier board and the analog chain around the
transceiver** — real, skilled RF engineering of exactly the kind Orb Aerospace's
own Principal RF Engineer posting describes, but well-trodden.

**The effort concentrates in firmware and software:** P25 demodulation and
signalling parsing, control-channel following, analog FM demodulation, key
management, and — for the transmit tier — the P25 modulator. All of it runs on
the off-the-shelf compute stack. **None of it needs new hardware.**

And the part a commander will actually judge — the detection engine, the digest,
the two-tier alarm — is software on top of all of it, and is the piece already
built and running.

---

## 8.5a The whole chain, and the one place it splits

Three identical paths run from three antennas to two different answers. Being
able to walk this end to end is the difference between describing the product and
understanding it.

**Analog, per element, three times over:**

1. **Antenna element** — size set by the band
2. **Coupler** — where the calibration tone goes in, so everything after it gets
   calibrated including the dock connector
3. **Filter** — the band-defining part; keeps strong out-of-band signals from
   deafening us
4. **Dock** — the three RF paths cross here
5. **Amplifier** — all three on one board, so they warm up and drift *together*
6. **Mixer** — all three share one oscillator, which is what keeps them
   comparable

**Then digital:**

7. **Converter** — three streams of numbers. Everything after this is arithmetic
8. **Timestamp** — from GPS
9. **Channel separation** — pull out the frequencies we care about, *for each
   element separately*

**Then the branch — stage 10.** Cross-correlate the three streams against each
other. That tells you, for each antenna, how strong the signal is and what its
phase is. **Everything above is shared. Everything below is two different uses of
that one result.**

### Two things people get wrong here, including us

**Stage 9 does not produce bits.** It produces a *waveform* — still the shape of
the radio signal, just narrowed to one channel and slowed down. Nothing has been
decoded. Bits do not exist until stage 13, well past the branch.

That is not a technicality. **The direction-finding side never touches a bit at
all.** It works entirely on the shape of the wave. That is the real reason we can
point at a transmission we cannot read.

**Stage 10 does not annotate symbols — it collapses them.** It takes thousands of
samples across three antennas and produces *three numbers*: how loud and at what
phase each antenna heard it. A 20-millisecond control-channel burst yields one
set of three. A five-second voice call yields a whole sequence of them — and the
*variation* across that sequence is the multipath quality check from Module 9.

| After stage | What you have |
|---|---|
| 7 | Three wide streams of raw numbers |
| 9 | Three × N narrow streams — still waveforms |
| **10** | **Three numbers per transmission** |
| 11 | One combined waveform |
| 12 | Symbols |
| 13 | **Bits**, then messages |

### Two consequences worth having ready

**Encryption bites much later than people assume.** It protects the voice payload
*inside* decoded messages. It does not touch the radio signal, the framing, or
the control channel. So every stage above runs normally on an encrypted call —
timing, signal strength, who transmitted, which talkgroup, granted or denied, and
a bearing. The only thing that comes out unreadable is the speech. **Encryption
costs one field at the very end, not the capability**, and saying it that
precisely is much stronger than "metadata is still visible."

**Direction finding cannot be added later.** Decoding throws away exactly what a
bearing needs: once you have bits, the amplitude and phase are gone forever. A
bearing has to be taken before stage 13 or it never exists. So DF is not a
software upgrade you could sell to someone who bought a one-antenna unit — it is
foreclosed at the moment of purchase. That is the strongest answer to "why not
offer a cheaper single-antenna version," stronger than the sensitivity argument,
because 4.8 dB is a benefit given up while this is a capability that can never
be had.

### Stage 10 is a read-only pass, and that is the bit to hold onto

The three streams are **not consumed** at stage 10. They flow on untouched.

Stage 10 *reads* them and computes a small summary — three numbers saying how
loud and at what phase each antenna heard it. Then two things travel onward: the
**original streams**, unchanged, and that **summary**, which forks.

- One fork uses the *differences* between the phases → a bearing
- The other fork uses the same three numbers as *weights*, applied back to those
  untouched streams, to line them up and add them → one better stream

If it helps to have a computing picture: stage 10 is like computing an index over
a buffer. The buffer is still there afterwards, and the index is what tells you
what to do with it.

### And the loop that is easy to miss

Which channels get separated out at stage 9 is not fixed. The control channel is
where configuration says it is — but voice channels are handed out on demand, so
we only know where to look **after decoding a grant**, which happens at stage 13.

So stage 13 reaches back and reconfigures stage 9. Decode a grant, spin up a
channeliser on that frequency, tear it down when the call ends. That is what
"control-channel follower" means in the block diagram, and it is why one receiver
can follow a whole trunked system.

```
        three streams, one per antenna
                     │
          ┌──────────▼──────────┐
          │  How strong, and    │   ← the branch
          │  what phase, at     │
          │  each antenna?      │
          └────┬───────────┬────┘
               │           │
        strengths &     the DIFFERENCES
        phases          between phases
               │           │
      ┌────────▼───┐  ┌────▼─────────┐
      │ line them  │  │ compare to   │
      │ up and add │  │ the measured │
      │ → +4.8 dB  │  │ array chart  │
      └────────┬───┘  └────┬─────────┘
               │           │
      ┌────────▼───┐  ┌────▼─────────┐
      │ DEMODULATE │  │ + compass    │
      │ and DECODE │  │ and tilt     │
      └────────┬───┘  └────┬─────────┘
               │           │
      ┌────────▼───┐  ┌────▼─────────┐
      │  EVENTS    │  │  BEARING     │
      └────────┬───┘  └──────────────┘
               │
     DETECTION ENGINE → Command Feed
      (what the demo actually shows)
```

**The one-line version: add them together to hear it, subtract them to locate
it.** Same three numbers, two operations.

### Three things to be able to say about this

**It is a fork, not a switch.** Both sides run at once on the same data. Doing one
costs nothing of the other.

**Locating survives worse conditions than understanding.** Both need stage 10, but
a bearing only needs the phase relationships while decoding has to pass error
checks. That is why we can point at a transmission we cannot read.

**A plain sum would be a mistake, and this is the correction worth knowing.** The
three antennas receive the same signal at slightly different times, so their
phases differ. Add them raw and they partly cancel — in some directions the
result is *worse* than one antenna alone. You have to line them up in phase
first, which is what stage 10 provides. Anyone who has done diversity radio will
recognise this; it is called maximal-ratio combining.

**And the consequence that matters commercially:** that phase estimate is the
same computation direction finding needs. So the three-antenna array is not a
direction-finding luxury that happens to help reception — **the sensitivity
depends on it.** That is the strongest answer to "why don't you sell a cheaper
one-antenna version?"

---

## 8.5b What is physically moving, at the layer below the diagram

Everything above describes the *order* of stages. This describes what is actually
happening on wires and inside chips, which is the layer an engineer will probe if
they want to know whether you understand the design or have memorised it.

**Two acronyms first, because they carry the whole section:**

- **LVDS — Low-Voltage Differential Signaling.** A way of sending very fast
  digital data over *pairs* of wires carrying opposite voltages. The receiver
  reads only the difference between them, so any noise picked up equally by both
  cancels out. That is how it survives more than a gigabit per second on a
  circuit board. **JESD204B/C**, which the ADRV9026 uses instead, applies the
  same differential idea over a smaller number of much faster serial lanes, and
  adds a shared timing reference so the receiving end knows exactly which sample
  belongs to which chain.
- **FPGA — Field-Programmable Gate Array.** A chip whose internal logic **and
  internal wiring** are configured after manufacture. It is not a processor
  executing instructions — it is a fabric of logic blocks, hardware multipliers
  and small memories, plus a routing network, all wired into whatever shape the
  design calls for by a file loaded at power-up.

### The three chains stop being three wires at the converter

Up to the converters there really are three separate metal paths. After them
there is **one data bus, not three.**

The transceiver has a single data port, and **every receive chain's samples are
interleaved onto it** in a fixed repeating pattern. On the AD9361 that port was
roughly six LVDS pairs plus a frame marker and a clock running near 245 MHz; on
the ADRV9026 it is a set of JESD204B/C serial lanes. The format differs; the
point below does not.

So the meaning of "three chains" inverts here. Before: three pieces of metal.
After: **three timeslots on a shared bus.** Which chain a sample came from is now
a matter of counting clock edges from the frame marker. It is the difference
between three cables and three streams multiplexed on one link, and it is worth
being able to say out loud.

### Inside the FPGA there are no wires

When we say the channel separation "runs on the FPGA," here is what that means
physically. There is no dedicated path for a channel. The configuration file
wires together hardware multipliers, adders, registers and blocks of memory into
the shape of a channel separator. What moves is **parallel binary words hopping
between registers, one hop per clock tick**, at 100–250 MHz.

Each channel needs three operations:

1. **Multiply by a locally generated sine wave** to slide the wanted channel down
   to zero frequency. The sine is generated as numbers by a counter and a lookup
   table.
2. **Filter and throw samples away.** First a cheap filter built only from adders
   and delays, then a short precise one using stored coefficients.
3. **Slow down.** Decimation is physically just not clocking the next stage.

### The part that is genuinely surprising

**Thirty channel-streams does not mean thirty channel separators.**

The fabric runs at about 200 MHz. Each output stream needs about 48,000 samples
a second. That is a ratio of roughly **four thousand to one** — so a single
physical multiplier can serve thousands of streams by taking turns.

You build one fast separator and a schedule, not thirty separate ones. The
parallelism is virtual, in exactly the way one processor core runs many threads.
If you have a computing background this should feel familiar, and saying so is a
good way to show you understand it rather than repeating it.

### Why the FPGA/Jetson line falls where it does

| Stage | Samples handled per second | Runs where |
|---|---|---|
| **9** — separate the channels | tens of millions | **FPGA. Has to** |
| **10** — compare the three antennas | tens of thousands | Either. Trivial |
| **11** — combine them | tens of thousands | Either. Trivial |

**Three orders of magnitude.** That gap, and nothing more elegant than that gap,
is the argument for the boundary. Everything before the decimation is expensive;
everything after is nearly free.

And it explains what the FPGA is really *for*:

```
raw from the transceiver   ~1.5 Gbit/s per chain
sent on to the Jetson      ~46 Mbit/s  (3 antennas × ~10 channels)
```

**The FPGA's product is not format conversion. It is throwing away everything
nobody asked for, before it has to travel anywhere.**

---

## 8.6 What is genuinely open — graded, not just listed

**Say "open" and mean it precisely.** Lumping *nobody has looked at this* together
with *we have a recommendation awaiting a cost check* makes you sound less in
control of the design than you are. The hardware document grades them; here is
the version to carry in your head.

### Decided — do not call these open

**The transceiver.** We selected the **ADRV9026**: four coherent receivers on
one chip, so a three-antenna array needs one chip rather than two synchronised
ones. Two AD9361s remain the fallback. The reason to give is a *failure mode*,
not effort — synchronising two chips can half-succeed, and a half-succeeded sync
produces a **wrong bearing rather than a missing one**, which is the exact class
of error this whole design works to eliminate.

**The magnetometers.** Two dedicated ones at the outboard lid corners, tilt
sensor with the inboard antenna at the centre hinge. Storm-case modules only; the
VHF mast version is undesigned and out of scope.

**The enclosure.** Our processing body bolts onto the ARC Edge unit at the
factory; the pair sits in the trunk of the storm case; the whole thing slots into
whichever band module the agency needs. Say the two caveats unprompted: it needs
Orb Aerospace's agreement and their mechanical specs, and their confirmed product
is a soft backpack, so the case is *our* proposal.

**Power.** A few hundred watts from a patrol vehicle or a field power bank.
Comfortable. **And it is what made the transceiver decision affordable** — 5 to 7
watts is a real objection against a backpack battery and not one against a
vehicle. Note the receive-only argument changes character: it is now about
*endurance*, roughly three times the runtime, not about feasibility.

### Closed by analysis

**The FPGA/Jetson split.** Stages 7–9 have to run in the FPGA because they handle
tens of millions of samples a second. Stage 10 onward runs on decimated streams
and belongs on the general processor, where the code that will need tuning can
actually be changed. What remains is sizing the FPGA, which is an estimate rather
than an unknown.

### Decided but not yet validated — be precise about the difference

**The magnetometer arrangement is selected; its validation is not done.** Nobody
has measured the per-unit calibration cost on a production line, and whether the
two sensors can *correct* a disturbed heading rather than merely *flag* it is
unresolved. Say "selected, not validated" — it is more accurate than either
"decided" or "open."

**Likewise the transceiver.** The part is chosen; its power at *our* bandwidth
is not measured, only at the datasheet's, which is eighty times wider than we
need.

### Genuinely open, and ours — the one that matters most

**The dynamic-range budget.** This was missing from an earlier version of the
list and it should not have been.

A wideband receiver cannot filter out a strong nearby signal before digitising,
so **the loudest signal in the slice sets the noise floor for everything else in
it.** A vehicle radio at 30 m and a handheld inside a building can differ by
60–80 dB.

**And the usual escape is closed to us**, which is the part worth understanding.
Normally a receiver deafened by a nearby transmitter is fixed with a better
filter. Ours cannot be: **the interferer is a police radio, on the trunk we are
monitoring, in the band we chose.** It is in-band by definition.

**Why it matters more than the others:** it directly limits weak-signal
sensitivity, which is what the whole "we hear what the network missed" capability
rests on. **Of every open item, this is the only one that constrains something we
would actually sell.** Nobody has computed it.

#### What "more bits" would buy, since someone will ask

A converter divides its range into 2^N steps and rounds everything to the nearest
one. That rounding error is the noise floor.

**The loud signal sets the top of the range. The bit count sets how far below the
top you can still see.** More bits does not raise the ceiling — it lowers the
floor. Each extra bit halves the step and buys **6 dB**: 12 bits gives about
74 dB, 14 gives 86, 16 gives 98.

Three caveats to have ready. The nominal bit count is optimistic — thermal noise
and jitter mean the *effective* number is lower. There are diminishing returns,
because once the converter is quieter than the amplifier in front of it, extra
bits just digitise noise more precisely. And **speed and bits trade against each
other**: we want wide capture, which needs fast sampling, *and* deep dynamic
range, which needs many bits, and converter design pulls those apart.

**So this problem is not an oversight — it is the intrinsic price of the
wideband architecture**, showing up in the one component where width and depth
compete. That is the honest answer, and it is a better one than apologising.

#### What we actually know about the part we picked

Analog Devices does not publish an ADC bit count for the ADRV9026, and that is
reasonable — in an integrated transceiver the converter sits behind an analog
chain that matters as much, so they specify the whole receiver instead:
**81 dBc spurious-free dynamic range, IIP2 of 58–65 dBm, IIP3 of 15–18 dBm.**
Base-station-grade figures, and better than a bare 12-bit converter's 74 dB.

But it is **three mechanisms, not one**, and only the first gets any help from
narrowing down to a single channel afterwards:

| | Helped by channelising? |
|---|---|
| Quantisation noise — spread across the band | **Yes**, about 23 dB |
| Spurs — discrete tones from nonlinearity | **No** |
| Intermodulation — created inside the receiver | **No** |

#### And the requirement that does not wait for any of this

**The unit must announce when it has been deafened.** No component choice removes
the possibility, because a vehicle can always park closer.

Say it this way, because it is the framing that lands: **this is our own product
premise applied to ourselves.** We exist to surface what a commander is not
hearing. A desensitised receiver is that exact failure, happening to us —
transmissions arrive, we do not register them, and nothing in the output looks
any different.

So the indicator is **epistemic, not operational**. It does not say something
happened. It says *"nothing happened" is less trustworthy than usual right now.*

Two things make it more than a nicety. It has a **false-alarm path**: if we were
deaf while dispatch called a unit, that unit may well have answered and we did
not hear it — so a deafened receiver can *manufacture* an unanswered-status-check
signal. And with a bearing available we can say **which direction the
interference is coming from**, which turns "you are degraded" into "move away
from that." Requirements are in `docs/software-prd.md` §1.5, and none of it is
built.

### Descoped for this assignment — say so, do not pretend they are answered

**The interface above Ethernet**, and **equipment authorisation** for shipping
transmit-capable hardware. Both are notionally satisfied and out of scope here.
Both are real questions for a real programme, and saying "we descoped that" is
much stronger than implying it does not exist.

### Genuinely open, and not ours

**Vocoder licensing.** Decoding P25 voice needs a proprietary codec from a single
supplier. Not investigated. Does not affect the demonstrated product.

Note also the **Pelican-style combined enclosure** in the roadmap is proposed as
an *additional SKU*. The confirmed Field Kit is a backpack, not a hard case. Do
not present the combined enclosure as the confirmed product.

### One caveat found during research

Secondary sources describing the Texas plan state that low-power direct channels
like 8TAC95D **may not be used in a repeater configuration nor patched through a
gateway device.** *(Read from a summary, not from the plan text directly.)*

If that holds as written, the roadmap's cross-band bridging cannot use 8TAC95D as
one leg and would need repeater-capable interoperability channels instead.

**It does not affect the receive-only product being demonstrated at all.** It
should be confirmed against the plan text before any bridging feature is
committed to. Flagging this yourself is much stronger than being corrected on it.

---

## Exercises

**8.1** Draw the signal chain from memory. For each stage, say what it does in
one sentence of plain English.

**8.2** An engineer asks why you chose the ADRV9026 rather than a cheaper
single-channel receiver. Answer in 30 seconds.

<details>
<summary>Model answer</summary>

Three reasons, and I want to be careful about one of them because it is easy to
get wrong. It has four phase-coherent receive chains on one die, and a
three-element direction-finding array needs three of them sampled against a
common phase reference. It has transmit chains we do not use today, which means
the licensed tier is the same board plus a power amplifier rather than a
different product. And its 200 megahertz of bandwidth means a downlink and its
uplink 45 megahertz away fit in one capture comfortably rather than marginally.

What I would *not* claim is that the four chains are how we monitor the trunk and
the talkaround channel at once — they share an oscillator, so they cannot be
tuned separately. That is done by capturing a couple of megahertz in one go and
separating the channels digitally, which needs only one chain.
</details>

**8.2a** A reviewer notices the ADRV9026 tunes down to 650 MHz and asks how you
sell a VHF unit. Answer.

<details>
<summary>Model answer</summary>

You have found a real defect and I will not talk around it. We selected that part
for phase coherence, correctly, and nobody re-checked its tuning range against
our own product line — so a claim that one processing body covers every band
survived the change when it had stopped being true. VHF at 136 to 174 megahertz
and UHF at 380 to 520 are both below the part's floor.

The fix is a mixer in those two band modules that shifts the band up into the
transceiver's range. It is standard practice with catalogue parts, and it belongs
in the band module because that is where every other band-specific component
already lives — arguably it makes the architecture cleaner, since the module's
contract becomes "hand the body something between 650 megahertz and 6 gigahertz."

I am calling it proposed rather than solved, because the mixer generates spurious
signals that land on the one genuinely open question we have, which is the
dynamic-range budget. The two have to be worked together. None of this touches
the 800 megahertz system I am demonstrating, which is comfortably in range.
</details>

**8.3** Explain why the front-end filter matters *specifically* at a mass
casualty scene, rather than as generic good practice.

**8.3a** A reviewer says: "You have four receive chains, so you can watch four
frequencies." Explain why that is wrong and what actually happens instead. This
is a real correction a reviewer made to our own document, when the part had two
chains rather than four — the error does not depend on the number.

**8.4** Someone asks what the GPU is for. Give the honest answer.

**8.5** Grade the open hardware items: which are closed by analysis, which are
recommended pending a cost check, which are genuinely open and ours, and which
belong to Orb Aerospace. Name the one that constrains a capability we would sell.

**8.5a** Someone asks why a three-element array drove your choice of radio chip.
Answer without saying "because the datasheet says so."

<details>
<summary>Model answer</summary>

A three-element array needs three receive paths sampled against one phase
reference, and the part we originally chose had two on its die — it was built for
2×2 MIMO, which is what the small-cell market wanted. There is no mode that
creates a third, so the options were to synchronise two chips, to time-share two
with an RF switch, or to move to a part with four.

We moved to the part with four, and the deciding argument was a failure mode
rather than effort. Synchronising two chips is established practice, but it can
half-succeed — and a half-succeeded synchronisation gives you a **wrong bearing
rather than a missing one**. This design spends a lot of effort eliminating
errors that arrive looking confident, so removing a whole mechanism capable of
producing one was worth more than the engineering time it saved.

Three receivers are used by the array. The fourth is spare, and I would record it
as headroom rather than pretend it has a plan: it could measure the calibration
tone source directly, or drive a fourth element. We have not chosen.

What it cost us is a harder digital interface — a serial link instead of parallel
— which pushes the FPGA upmarket. And it narrowed our tuning range, which is
exercise 8.2a.
</details>

**8.6** Someone says "channel" in a technical conversation. List the six things
they might mean, and say which one caused a false claim in our own document.

**8.7** An engineer asks how the radio chip connects to the Jetson. Answer.

<details>
<summary>Model answer</summary>

Through an FPGA, and an earlier version of my block diagram had that stage
missing. The transceiver puts I/Q out over a high-speed serial interface called
JESD204B/C, and no Jetson has an input for that — Jetson ingest is CSI, USB and
PCIe. So there is a Zynq-class FPGA, one with gigabit serial transceivers,
terminating that link and feeding the Jetson over PCIe. Analog Devices publish the interface core, so it is integration work
rather than novel development. It also turned out to be where the channeliser
belongs, which means the link to the Jetson carries a few 12.5 kHz streams
instead of the raw wideband capture.
</details>

**8.8** A commander asks: "if my officer's radio couldn't reach the tower, could
your box still hear him?" Answer honestly, including what is and is not built.

<details>
<summary>Model answer</summary>

The physics is on our side and the current hardware is not, and I will take those
in order. His call failed because it was too weak at the tower, and the tower may
be ten kilometres away while we are a hundred metres from him — worth something
like forty to sixty decibels, so the signal at us could be tens of thousands of
times stronger. If we heard it we would decode it fully: who he is, what
talkgroup he wanted, whether he declared an emergency. And a radio that gets no
answer keeps retrying, so the failure case actually gives us more to work with
than the success case.

What we do not have built today is coverage of the frequency he transmits on. We
listen to what the tower sends; he transmits 45 megahertz away. The chip we have
since selected has 200 megahertz of bandwidth, so covering both is comfortable
rather than marginal — but that is a decision on paper, not a box I can show you,
and one measurement is still outstanding: how well we hear a weak handheld while
a patrol car transmits nearby. So it is on the roadmap with a clear route, and I
am not going to tell you it works now.
</details>

---

## You can now explain

- The disclaimer, and why leading with it is a strength.
- Each stage of the signal chain and what it does in plain English.
- Why the ADRV9026 is the right chip, with three independent reasons — and the
  one claim it broke, which you should raise before anyone else does.
- Why the receive chains do **not** give you one frequency each, and how
  wideband capture with digital channelisation actually meets the requirement.
- The one deployment case where the shared oscillator genuinely blocks you.
- Why one compute module does both jobs, and what the GPU is really for.
- Why receive-only is genuinely lean rather than a compromise.
- Where the engineering effort actually concentrates.
- The open items **graded** rather than listed, and why the dynamic-range budget
  is the one that matters most.
- The 8TAC95D patching caveat.
- **Infrastructure-side versus subscriber-side**, and the two tiers of the
  "detecting what never got through" claim.
- **The six meanings of "channel"**, and which collision produced a false claim
  in our own document.
- Why an FPGA sits between the transceiver and the Jetson, why it was missing
  from the first diagram, and why it improves the architecture rather than
  burdening it.
- Why the Orb can hear transmissions the network missed — the closer-not-better
  argument — and why Case A needs hardware we do not have while Case B needs
  none.
- Why direction finding works below the decode threshold.
- **The dynamic-range tension**: wideband capture trades weak-signal sensitivity
  for channel count, and no budget exists for it yet.
- **The two-piece architecture** — common body, band-specific module — and why
  licensing is an unlock rather than an upgrade.
- The seven-part-number product line, and the two-transmits distinction that
  decides what is standard and what is an add-on.
- Which bands support direction finding, why only the antenna is band-limited,
  and why degraded spacing is a decision rather than a wall.
- Why the three array elements are never combined in RF, and why combining them
  digitally instead gives ~4.8 dB *and* keeps the bearing.
- **The full receive chain end to end**, and the single point where it branches
  into "hear it" and "locate it."
- Why a plain sum of the three elements would be worse than one element, and what
  co-phased combining does instead.
- Why the array is load-bearing for *reception*, not just for bearings — the
  strongest argument for dropping the single-element module.
- **What JESD204B/C, LVDS and FPGA actually mean**, and why the three chains stop
  being three wires at the converter.
- Why thirty channel-streams needs nowhere near thirty channel separators.
- **Why a third antenna needs a second chip** — a property of the part, not a
  defect — what synchronising two costs, and what the quad-channel alternative
  would trade away.

Full acronym list: [`docs/hardware-design.md`](../docs/hardware-design.md)
Appendix A.

---

**Next:** [Module 9 — Direction finding](09-direction-finding.md)
