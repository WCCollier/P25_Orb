# P25 Orb Module — Hardware Architecture

A proposed add-on module for the ARC Edge Field Kit.

---

## What this document is, and what it is not

This is a **conceptual architecture written for a product pitch**. It is not a
procurement-ready design. It has not been through RF simulation, PCB layout,
thermal analysis, EMC pre-compliance, or a real supply-chain review, and no part
in the bill of materials has been price-checked or lifecycle-checked.

What it is meant to establish is narrower and, for this conversation, more
useful: that the module is buildable out of existing, catalogue parts; that the
hard work sits where we say it sits; and that we understand which decisions are
still open. A reader should come away able to argue with the choices, because
the choices are stated rather than implied.

Every quantitative claim below is tagged:

- **[Confirmed]** — read from a primary source, cited inline.
- **[Inferred]** — a reasonable engineering inference from confirmed facts.
- **[Assumption]** — a deliberate design decision or an unverifiable estimate,
  stated plainly as such.

---

## 0. Terminology — the several meanings of "channel"

**Read this before §3 and §5.** The word *channel* carries at least six distinct
meanings across radio engineering, trunked-system operation, and this document.
Collapsing any two of them produces confident nonsense, and **it has already
happened once in this project**: an earlier revision claimed the AD9361's "2
receive channels" let the unit monitor two *radio* channels at once. Those are
different senses of the word, the claim was false, and a reviewer caught it. The
correction is §3.3.1. The vocabulary below is what prevents a repeat.

| Term used here | Means | Never say |
|---|---|---|
| **RF channel** | A frequency allocation with a bandwidth — e.g. 851.5500 MHz at 12.5 kHz. The physical thing on the spectrum | — |
| **Channel designator** | The operational *name* in the Texas plan — e.g. 8TAC95D — bundling frequency, bandwidth, mode, and squelch/NAC parameters | Do not use interchangeably with a bare frequency |
| **Control channel** / **voice (traffic) channel** | *Roles* an RF channel plays in a trunked system. The control channel carries signalling; voice channels are assigned on demand | — |
| **Downlink** (outbound) / **uplink** (inbound) | The two directions of a repeated RF channel, on **different frequencies** — 45 MHz apart in the 800 MHz band. A "control channel" is really a *pair* | Never say "the control channel frequency" without saying which direction |
| **Receive chain** | A hardware signal path inside a transceiver. Each ADRV9002 has **two**; the design uses four devices, so eight chains — see §3.3 | ~~receive channel~~ |
| **Window** | A contiguous span of spectrum one coherent group is tuned to capture — e.g. the ~2 MHz uplink window at 806–808 MHz. **Two windows, both inside the 800 MHz band** | Never call a window a *band* — bands are SKUs (§1.1.1) |
| **Channelisation** / **channeliser** | The DSP process that extracts one narrow RF channel from a wide captured slice — see §3.3.1 | — |
| **Talkgroup** | The logical group of users a call is addressed to. Radio *users* often call this "a channel" because it is a knob position on their radio | Never call a talkgroup a channel in engineering text |

One further collision worth knowing, because it appears in the software rather
than the hardware: the proof-of-concept demo uses the browser's
**`BroadcastChannel`** API to pass events between two tabs. That is a
same-origin message bus in a web browser and has nothing whatever to do with
radio. It is named in `docs/software-prd.md`, not here.

**House rule for this document:** unqualified "channel" always means *RF
channel*. Hardware paths are **chains**. Directions are **uplink** and
**downlink**, always stated.

### 0.0a "Array" was becoming the next "channel" — four meanings, disambiguated

**Added 2026-07-31, caught in review before it produced an error rather than
after.** The split-feed architecture of §3.3 made "array" ambiguous in exactly
the way "channel" had been, and one sentence in review — *"each array lives on
its own chip pair"* — was already wrong, because there is only ever one array.

| Term used here | Means | How many |
|---|---|---|
| **Antenna array** | The three radiating elements in the band module | **One.** Shared by everything downstream |
| **LNA bank** | The three low-noise amplifiers on one board in one thermal environment (§3.1a) | **One** |
| **Array manifold** | The *measured calibration table* for the antenna array, held in module EEPROM (§3.1a, §5.3) | A dataset, not hardware |
| **Coherent group** | **Three receive chains, co-tuned to one window and phase-aligned by MCS, that sample the antenna array and produce one bearing** | **Two.** The uplink group and the downlink group (§3.3) |

**The distinction that matters:** the antenna array is *shared*; what is
duplicated is the set of receivers that samples it. Each element's signal is
split after its LNA and fed to both coherent groups, so the same three antennas
support two independent bearings on two windows at once (§3.3).

**Unqualified "array" in this document always means the antenna array.** A set of
co-tuned chains is a **coherent group**, never an array.

### 0.1 Names for what flows through the processing chain

These are the established terms from array signal processing. Use them rather
than inventing project vocabulary — they are what an RF engineer will expect, and
they connect this design to the standard literature.

| Term | Means | Produced at |
|---|---|---|
| **Snapshot** | One simultaneous complex sample across all elements. For us a 3-vector: one I/Q pair per element at one instant | Stage 9 |
| **Coherent processing interval (CPI)** | The window of snapshots stage 10 integrates over, during which phase relationships are assumed to hold still. A 20 ms control burst is one CPI; a voice call is a sequence of them | — |
| **Spatial covariance matrix, R** | The 3×3 Hermitian summary of a CPI. Diagonal entries are per-element power; off-diagonal entries are the pairwise cross-correlations. **Nine real numbers** | Stage 10 |
| **Bearing report** | Azimuth, declared uncertainty, timestamp, channel, and unit ID if decoded | Stage 10d |
| **`Observation`** | A bearing report *plus the reporting station's own position*. **This name is already taken** by `df/aoa_fix.py` — do not reuse it for anything upstream | The solver's input |

**Why R is worth naming.** It is the standard input to every array-processing
method — maximal-ratio combining, MVDR beamforming, MUSIC — and none of them need
anything else from upstream. Recording that the design produces R is recording
that the algorithm can be upgraded later without touching stages 1–9. See §5.7.

**And one boundary this vocabulary marks.** Stages 1–9 are *streaming*: a sample
in, a sample out, no storage beyond a filter's taps. **Stage 10 is the first
stage that must buffer**, because a covariance matrix over a single snapshot is
meaningless. That transition — from streaming to remembering — is a cleaner
statement of where the FPGA/Jetson boundary belongs than the throughput argument.

---

## 1. What the module has to do

In the configuration this proof of concept demonstrates — **receive only, no
licence required** — the module must:

1. Track a P25 Phase II trunked system's **control channel** and decode the call
   setup signalling on it: channel grants, queue notifications, denials, busy
   conditions, and emergency declarations.
2. Follow grants onto the assigned **voice channels** and demodulate P25 CAI
   voice, the way a scanner does.
3. Simultaneously monitor one **analog FM talkaround channel** — `8TAC95D` at
   851.5500 MHz in the 800 MHz case [Confirmed — Texas Statewide Interoperability
   Channel Plan, via RadioReference's TSICP channel listing].
4. Hand the resulting event stream to the ARC Edge base unit over Ethernet.

That last point is worth dwelling on, because it is what keeps the hardware
modest. **The module is a receiver and a decoder. It is not where the product's
intelligence lives.** The detection and synthesis engine is software, running on
the event stream. Nothing in the alarm logic needs a faster radio.

A licensed, transmit-enabled configuration adds a power amplifier and a
duplexer/switch to the same board. It is the same SKU — the difference is
authorisation, not silicon.

---

### 1.1 Platform architecture — what varies, and what does not

**The product is one processing body plus a band-specific module it docks into.**
Capability is gated by *authorisation*, never by hardware. This restores the
tiering stated in `design-document.md` §5; an earlier revision of this document
contradicted it by describing the power amplifier as "populated only on
transmit-enabled builds," which would have made licensing a hardware upgrade.

| Axis | What changes | Why |
|---|---|---|
| **Band module** — housing, antenna assembly, filters, PA and duplexer | Per radio environment: 700/800, UHF, VHF | These are the only genuinely band-dependent parts |
| **Processing body** — transceiver, FPGA, compute, LNAs, GNSS, secure element, Ethernet, PSU | Nothing | Band-agnostic by construction. The transceiver tunes **650 MHz–6 GHz**, so VHF and UHF modules need up-conversion — §3.3, §7.4 item J |
| **Licence unlock** — transmit enable, unit ID provisioning, key loading | Software and authorisation only | See below |

**Why licensing must be an unlock and not an upgrade.** Under the Texas plan,
use of interoperability channels is authorised by a communications leader, and
that authorisation happens **at incident time**. A capability requiring a
hardware change is useless at the moment it is granted. A unit already on scene
that can be unlocked is the only version of this that works operationally. That
argument is stronger than the per-unit cost of populating the transmit chain, and
it is the reason the decision goes this way.

**Consequence for the antenna, which is the real constraint.** Everything else
in the body is band-agnostic; the array is not. Element length scales with
wavelength and so does the λ/2 spacing direction finding needs, so the array's
physical size is set by the band — see §5.1's feasibility table. This is why the
band module is a *housing plus array* rather than just a filter board: at VHF the
array is not a case lid at all.

**A further product in the line sits outside this architecture entirely.** The
**P25 Hotspot** — a dedicated P25 RF subsystem creating local trunked coverage
where the trunk is down, swamped or absent — is vehicle or trailer mounted on
generator power, and is specified in `design-document.md` §5.1 rather than here.
It shares this document's transceiver, FPGA and compute stack, and **a Hotspot is
inherently also an Orb** (it has receivers, so the detection capability comes
free). But its continuous-duty transmit chains, separated mast antennas and
RF-subsystem software are a different design. Two findings from this document
bear on it directly: a transmitting site **cannot** use the lid array, because
20 W at 17.6 cm puts roughly +27 dBm into a receive element — past an LNA's
damage threshold, not merely desensitising (§3.1a, §7.4 item D); and the
transceivers' **transmit chains** (§3.3) are enough for a control channel plus
voice channels.

**What this buys commercially.** The expensive, complex, software-heavy part is
common and band-agnostic. The band-specific part is passive, comparatively cheap
and mostly mechanical. An agency buys one body and the housings its environment
needs, and a DPS unit could dock into a local agency's UHF housing during a
mutual-aid response.

#### 1.1.1 The SKU structure [design decision]

**Seven part numbers. One body, three modules, three duplexer packs.**

| SKU | Contents |
|---|---|
| **Processing body** ×1 | Everything in the body BOM (§4A). Identical for every deployment |
| **Band module** ×3 — 700/800, UHF, VHF | Three-element array, three filters, three couplers, PA, T/R switch, IMU, magnetometers, manifold EEPROM, housing |
| **Duplexer pack** ×3 — one per band | Clip-in. Required only for licensed trunk participation |

**Every band module is three-element and direction-finding capable.** There is no
single-element variant. If a customer wants one, they can ask for it; the SKU
line is not going to carry a cheaper variant speculatively.

**Every band module transmits on interoperability channels.** PA and T/R switch
are standard, because the two transmit capabilities are not the same thing:

| | Authorised how | Hardware | Fitted |
|---|---|---|---|
| **Interop / talkaround** (8TAC95D) | By a communications leader **at the incident** | PA + T/R switch. Simplex, so no duplexer | **Always** |
| **Licensed trunk participation** | Administratively, with the system operator, over weeks or months | Adds a duplexer | **Clip-in pack** |

The incident-time argument applies only to the first row, which is also the
cheap one. Nobody is granted a trunk unit ID mid-response, so an agency becoming
a licensed participant knows months ahead and can buy the pack deliberately.

**Why a duplexer and not just a T/R switch for trunk work.** An ordinary P25
portable is half-duplex and manages with a switch. This product cannot: it is a
surveillance device, and going deaf to the control channel whenever it transmits
would cost it trunk tracking — the thing it exists to do. Transmitting while
still monitoring means isolating a PA output from LNA inputs 45 MHz away, which
is a duplexer. [Inferred — reasoning from the product's own requirement, not
sourced.]

**Why the duplexer clips in rather than defining a module variant.** The transmit
path drives one designated element and is not phase-matched against anything, so
an additional connector there costs almost nothing — unlike the receive paths,
where connector repeatability consumed a third of the phase budget and needed the
calibration tone of §3.1a to rescue it. Making it a variant instead would have
doubled the module count.

##### Three consequences of making the array standard

**Direction finding cannot be added later, and this is the decisive argument.**
Decoding is lossy in the direction that matters: once the signal is bits, the
amplitude and phase are gone, and no amount of downstream software recovers a
bearing from decoded output. **A bearing must be extracted before stage 13 or it
never exists** (§3.5.2). So direction finding is not a feature that can be sold
later to someone who bought a single-element unit — it is foreclosed at purchase.
That is a stronger reason than the sensitivity argument below, because 4.8 dB is
a benefit forgone while this is a capability permanently unavailable.

**The 4.8 dB is not wasted on customers who never direction-find.** Digital
combining across the three elements (§3.1a) improves the decode path's
sensitivity whether or not a bearing is ever computed — and sensitivity is
precisely the weak-signal argument of §3.3.2. The array pays for part of itself
on a surveillance-only unit.

**The third receive chain becomes urgent.** Every module now ships
direction-finding-ready while the *body* still cannot sample three elements
coherently (§5.5, open item B). Shipping DF-capable modules against a body that
cannot use them is not a stable position, and it pushes hard toward the second
transceiver — which now answers **three** open questions rather than two: the
third coherent chain, uplink coverage (§3.3.2), and this.

**Per-unit calibration now applies to every unit shipped.** The magnetometer
cross-calibration of §5.8 B.4 was a cost carried only by direction-finding
variants. With no other variant, it is a line on every unit's manufacturing test.
That is the real recurring cost of this decision and it should be quoted as such.

**One case where this decision bites hardest, recorded and accepted.** At VHF the
array is a mast or vehicle mount (§5.1), so a VHF customer who wants nothing but
monitoring must still take the mast kit. At 700/800 and UHF the array lives in a
case lid and the penalty is small; at VHF it is a different deployment
altogether. Accepted deliberately rather than overlooked.

---

## 2. Block diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  BAND MODULE — housing + array.  BAND-SPECIFIC, passive on RF.      │
│  700/800: case lid.   UHF: larger case.   VHF: mast or vehicle.     │
│                                                                     │
│    EL 1        EL 2        EL 3      ← Three elements on EVERY      │
│      │           │           │         module. No single-element    │
│      │           │           │         variant exists (§1.1.1).     │
│   ┌──▼───┐    ┌──▼───┐    ┌──▼───┐                                  │
│   │COUPLR│    │COUPLR│    │COUPLR│ ◄── CAL TONES f_UL + f_DL, both  │
│   └──┬───┘    └──┬───┘    └──┬───┘     injected on the ARRAY side   │
│   ┌──▼───┐    ┌──▼───┐    ┌──▼───┐     so the dock is inside the    │
│   │ BPF  │    │ BPF  │    │ BPF  │     calibration loop (§3.1a).    │
│   └──┬───┘    └──┬───┘    └──┬───┘     One tone per window (§3.3).  │
│      │           │           │      ┌──────────────────────────┐    │
│      │           │           │      │ PA + DUPLEXER            │    │
│      │           │           │      │ band-specific, ALWAYS    │    │
│      │           │           │      │ populated, licence-gated │    │
│      │           │           │      └────────────▲─────────────┘    │
│   IMU + 2× MAGNETOMETER (§5.8)                   │                  │
│   MODULE ID + ARRAY-MANIFOLD EEPROM (§3.1a)      │                  │
└──────┼───────────┼───────────┼───────────────────┼──────────────────┘
 ══════╪═══════════╪═══════════╪═══════════════════╪══════ DOCK ══════
┌──────┼───────────┼───────────┼───────────────────┼──────────────────┐
│   ┌──▼───┐    ┌──▼───┐    ┌──▼───┐               │                  │
│   │ LNA  │    │ LNA  │    │ LNA  │  all three on one board, one     │
│   └──┬───┘    └──┬───┘    └──┬───┘  thermal environment, so drift   │
│   ┌──▼───┐    ┌──▼───┐    ┌──▼───┐  is correlated and calibrates    │
│   │SPLIT │    │SPLIT │    │SPLIT │  out (§3.1a)                     │
│   └┬────┬┘    └┬────┬┘    └┬────┬┘                                  │
│    L    R      L    R      L    R   2-way Wilkinson AFTER the LNA:  │
│    │    │      │    │      │    │   the 3.2 dB split costs 0.04 dB  │
│    └────┼──────┴────┼──────┴────┼─► of noise figure, not 3.2 (§3.3) │
│         └───────────┴───────────┴─►                                 │
│      all L legs → UPLINK group      all R legs → DOWNLINK group     │
│                                                   │  TX from the    │
│      PROCESSING BODY — BAND-AGNOSTIC.             │  transceivers'  │
│      Identical for every band.                    │  TX chains,     │
│                                                   │  licence-gated  │
│  ┌────────────────────────┐  ┌─────────────────┐  │  in software    │
│  │ UPLINK COHERENT GROUP  │  │ DOWNLINK COHER- │  │                 │
│  │                        │  │ ENT GROUP       │◄─┘                 │
│  │ chips A + B            │  │ chips C + D     │                    │
│  │ tuned ~806–808 MHz     │  │ tuned ~851–853  │                    │
│  │                        │  │                 │                    │
│  │  A.RX1 ◄ EL1           │  │  C.RX1 ◄ EL1    │                    │
│  │  A.RX2 ◄ EL2           │  │  C.RX2 ◄ EL2    │                    │
│  │  B.RX1 ◄ EL3           │  │  D.RX1 ◄ EL3    │                    │
│  │  B.RX2 ◄ f_UL ref tap  │  │  D.RX2 ◄ f_DL   │                    │
│  │                        │  │                 │                    │
│  │ HANDSETS: requests and │  │ TOWER signalling│                    │
│  │ granted voice.         │  │ + 8TAC95D, and  │                    │
│  │ THE BEARINGS THAT      │  │ a KNOWN-POSITION│                    │
│  │ MATTER — a tower's     │  │ REFERENCE that  │                    │
│  │ bearing is of no       │  │ validates the   │                    │
│  │ operational use        │  │ DF chain (§5.7) │                    │
│  └───────────┬────────────┘  └────────┬────────┘                    │
│              └──────────┬─────────────┘                             │
│   4× ADRV9002 · 30 MHz–6 GHz · on-chip MCS · 150 dB/Hz DR (§3.3)    │
│   Fallback: 2× AD9361, one unified 47 MHz window — §5.5             │
│                          │  digital IQ (LVDS or CMOS SSI)           │
│   ┌──────────────────────▼───────────────────────────────────────┐  │
│   │   FPGA / SoC BRIDGE                          ── see §3.5.1   │  │
│   │   Terminates the LVDS/CMOS SSI IQ interface, which no        │  │
│   │   Jetson-class module can accept directly. Hosts the         │  │
│   │   CHANNELISER (§3.3.1) and timing. Zynq-class; **no gigabit  │  │
│   │   serial transceivers required**. ADI supply the HDL.        │  │
│   └──────────────┬───────────────────────────────────────────────┘  │
│                  │  PCIe or USB3 — narrowband streams only          │
│   ┌──────────────▼───────────────────────────────────────────────┐  │
│   │      BASEBAND / APPLICATION COMPUTE — Jetson-class           │  │
│   │   P25 CAI demod · TSBK parsing · Analog FM demod             │  │
│   │   Control-channel follower · Decryption (agency-held keys)   │  │
│   │   Local AI classifier (fallback path)                        │  │
│   └───┬──────────────┬───────────────┬──────────────────────────-┘  │
│       │              │               │                              │
│  ┌────▼─────┐  ┌─────▼──────┐  ┌─────▼───────┐  ┌────────────────┐  │
│  │ SECURE   │  │ GNSS +     │  │ ETHERNET    │  │ DEDICATED      │  │
│  │ ELEMENT  │  │ DISCIPLINED│  │ PHY         │  │ POWER SUPPLY   │  │
│  │ key store│  │ OSCILLATOR │  │             │  │ (separate from │  │
│  └──────────┘  └────────────┘  └─────┬───────┘  │  ARC Edge's)   │  │
│                                      │          └────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────┘
                                ┌──────▼─────────┐
                                │  ARC EDGE      │
                                │  BASE UNIT     │
                                └────────────────┘
```

**What crosses the dock:** three RF paths, DC power, a digital bus for the
sensors and the calibration EEPROM, and TX drive. **Nothing else phase-critical.**
Why that boundary and not another is §3.1a.

---

## 3. The signal chain, stage by stage

### 3.1 Antenna and front-end filtering — *catalogue parts, custom integration*

A bandpass filter ahead of the low-noise amplifier keeps out-of-band energy off
the front end. This is not optional in the environment the product is designed
for: a mass police response puts dozens of transmitters within a few hundred
metres of the unit, several of them high-power mobiles. Without selectivity the
receiver desensitises exactly when it is needed most [Inferred — standard RF
engineering, not measured for this design].

SAW filters cover the 800 MHz public-safety band as catalogue parts. The custom
work is not the filter; it is the matching network and board-level layout around
it, tuned to the target band.

#### 3.1a The array front end and the dock plane

§3.1 describes one antenna's worth of chain. The DF variant has three elements,
and how they connect was not specified anywhere in this document until now.

##### The elements are never combined in RF

**Combining the three elements into one path destroys direction finding
entirely.** The bearing *is* the phase difference between elements; sum them and
you have a single composite with a direction-dependent pattern and no per-element
phase left. It also degrades ordinary reception, because a fixed three-element
sum has nulls in it.

The rule is **combine in software, never in hardware** — and that is strictly
better rather than merely necessary. See the digital-combining note below.

So everything downstream of the elements triplicates: **three couplers, three
filters, three LNAs, three matched runs.** The word doing the work is *identical*.
Any difference between the three paths is indistinguishable from a real phase
difference and presents as a bearing error. This is the same requirement §5.3
states as the ~6 mm electrical-length match, now extended to the active parts.

##### Where the dock goes, and why

**After the filters, before the LNAs.**

| Part | Side | Reason |
|---|---|---|
| Antenna elements, couplers | Module | Band-defining |
| Bandpass filters | **Module** | The band-defining electrical part. A filter bank in the body would put a lossy switch ahead of the LNA and make every body carry filters it will not use |
| LNAs | **Body** | Three on one board share a thermal environment and drift *together*. Correlated drift calibrates out; differential drift does not. This matters more here than the fraction of a dB gained by siting them at the antenna |
| PA + duplexer | **Module** | Both are band-specific. This is also what keeps the licence a software unlock — see §1.1 and §3.4 |
| IMU, magnetometers, EEPROM | Module | They characterise the array, so they travel with it |

##### The objection, and what answers it

Three phase-critical paths now cross a separable connector, and connectors are
not perfectly phase-repeatable across mating cycles.

The budget is tight. **±6 mm of differential electrical length is about ±9° of RF
phase at 851 MHz** in coax, and that is the entire allowance for a 3° bearing
error. A few degrees of variation per mate, differing between the three paths,
consumes a real fraction of it — and it degrades with wear and contamination,
which is the wrong direction for field equipment.

**The calibration tone answers it, and this decides the injection point §5.3 left
open.** Inject on the **array side** of the dock, at the antenna ports through
small couplers, and measure through the entire chain including the connectors.
Every mating cycle self-nulls at power-up. Connector repeatability stops being a
specification anyone has to hold and becomes a routine measurement.

The cost is the couplers' insertion loss sitting ahead of the LNAs, which lands
directly on noise figure. That cost is small in relative terms **because the
filter is already there and already dominates** — a point that reads as ironic
but is real.

##### The module carries its own calibration

Each band module has its own array manifold (§5.3.1) — its own geometry, its own
body scattering, its own feed routing — measured once on a range. **Store it in
an EEPROM in the module, with a serial number.**

Dock a VHF mast array into the body and it reads the module's identity, loads
that module's manifold, and reconfigures the channeliser for VHF. This is how
professional RF accessories already work, so it is conventional rather than
clever — and it makes the multi-band claim demonstrable on a table rather than
aspirational.

##### The bonus from combining digitally — *with a correction*

Because the three streams stay separate through to the converters, they can be
combined **afterwards**, giving roughly **4.8 dB of array gain** (10·log₁₀3) on
the decode path while leaving per-element phase intact for direction finding. An
RF combiner would have forced a choice between the two; a digital one does not.
That is meaningful against the weak-signal problem of §3.3.2 and it comes free
with hardware every module now carries (§1.1.1).

**The correction: it must be a *co-phased* combination, not a plain sum.** An
earlier statement of this said "summing them digitally," which is wrong and
would have failed under questioning. Three elements receiving from one direction
arrive with phase offsets between them; add them raw and you get an arbitrary
direction-dependent pattern with **nulls in it** — the same defect as RF
combining, merely relocated after the ADC. In some directions a raw sum is worse
than a single element.

What delivers the gain is **maximal-ratio combining**: estimate each element's
complex channel response, then weight and co-phase before summing. Crucially
this needs **no geometric bearing and no array manifold** — the per-element
phases are estimated from the signal itself, by cross-correlating the three
streams against each other. It is standard diversity-receiver practice.

**And that has a structural consequence worth carrying:** the per-element complex
channel estimate is *the same quantity* direction finding needs. Sensitivity and
bearing are two uses of one computation, which is why they branch where they do —
see §3.5.2. It also strengthens §1.1.1: the array is not merely a DF feature that
happens to help reception, it is **load-bearing for reception**, and the
estimation step that makes the receiver more sensitive is the same step that
produces a bearing.

One precision, so this is not overclaimed: the same streams also allow
**beamforming** — steering a null onto an interferer to improve
signal-to-interference. But that happens *after* the ADC, so **it does not rescue
the dynamic-range problem of §3.3.1.** If an interferer has already saturated the
converter, nulling it in software recovers nothing. Digital beamforming improves
SINR; only analog filtering fixes saturation.

##### Design rule: do not give the three chains additional hardware duties

**Any tap into a receive chain must be symmetric across all three, or fixed and
repeatable enough to be absorbed by the manifold, or downstream of the ADC — and
downstream is strongly preferred.**

This is written as a rule because it is the kind of constraint that gets violated
later by someone who was not part of the decision. What breaks direction finding
is **differential** error, not the existence of a tap. So:

| Tap | Verdict |
|---|---|
| Identical on all three chains | **Fine.** Symmetric error is common-mode and subtracts out in the phase difference. The calibration couplers are exactly this |
| Asymmetric but fixed and repeatable | **Acceptable.** It becomes a manifold coefficient, like the case body and the hinges |
| Downstream of digitisation | **Free.** No RF cost, no asymmetry |
| **Asymmetric *and* variable** — loss or phase moving with temperature, time or switch state on one chain only | **Forbidden.** Indistinguishable from a bearing change |

**And noise figure objects before phase does.** Any insertion loss ahead of the
LNA adds to system noise figure dB for dB, with no way to recover it. The filter
already costs 2–3 dB and the coupler a few tenths, and that sits directly against
the weak-signal capability of §3.3.2. Even a *symmetric* tap ahead of the LNA is
expensive.

**The principle to apply instead: fan out the data, do not fork the pipe.** Past
stage 9 (§3.5.2) the signal is numbers, and numbers can be copied without limit
at no RF cost. Spectrum display, signal-strength logging, recording, interference
detection, carrier detect, channel-occupancy statistics — all of these are
additional *consumers of the stage-9 output*, not additional hardware paths. When
a future requirement asks the receiver to also do X, the default answer is a new
subscriber to that stream. Reserve RF changes for what genuinely cannot exist in
software, such as a different band — which needs its own antenna and its own
chain, not a tap off the array.

**The one asymmetry already designed in.** The transmit path drives a single
designated element through a T/R switch, which the other two elements do not
have — perhaps 0.5–1 dB of loss and a phase offset on that chain alone. It is
acceptable under rule 2, and the obvious symmetrisation is worse: fitting
switches to all three would spend the loss three times and gain nothing, since
symmetric loss was already common-mode. **Asymmetric-and-calibrated beats
symmetric-and-lossy here.**

What it does earn is monitoring. A switch's loss and phase can drift with
temperature differently from the two plain paths, and switches degrade with
cycling — which is the second half of the forbidden case above. This is the one
place in the receive chain where asymmetry is deliberate, and it belongs on the
list of things the calibration tone is checked against rather than assumed
stable.

##### What was rejected

**Putting the transceiver in the band module.** Technically the cleanest — the
three RF paths would never cross a connector, and a shared clock reference
crossing the dock would be harmless because its phase error is *common-mode*
across all three chains and cancels in the bearing. It was rejected because it
duplicates the transceiver and probably the FPGA per band, which destroys the
economics of a common processing body. The calibration tone delivers most of the
benefit for the price of three couplers and some firmware.

### 3.2 Low-noise amplifier — *catalogue part*

Sets the system noise figure and therefore the range at which the unit can hear
a handheld. A catalogue MMIC LNA is appropriate; this is not a place that
rewards cleverness.

### 3.3 RF transceiver — *off-the-shelf silicon, no custom silicon required*

**Selected: four Analog Devices ADRV9002**, with each element's signal split
after its LNA and fed to two independent coherent groups (§0.0a). [Design
decision, 2026-07-31. This is the third selection in one day; the reasoning trail
and both reversals are kept below, because the *sequence* is more instructive
than the answer.]

- **30 MHz to 6 GHz** tuning range [Confirmed — Analog Devices]
- **Two receivers per device**, four devices, **eight chains**
- Channel bandwidths from **12 kHz to 40 MHz** — 12.5 kHz is a P25 channel
- **Two independent RF synthesisers per device**, so its two receivers can sit at
  different centre frequencies [Confirmed]
- **On-chip multichip synchronisation (MCS)** with phase synchronisation
  re-performed on every PLL retune [Confirmed]
- **150 dB/Hz dynamic range**, marketed explicitly against the blocking problem
  in mission-critical land mobile radio [Confirmed]
- **LVDS or CMOS SSI** digital interface — *not* JESD204B/C [Confirmed]

#### How the eight chains are used

| | Uplink group — chips A, B | Downlink group — chips C, D |
|---|---|---|
| Tuned to | ~806–808 MHz | ~851–853 MHz |
| RX 1–3 | elements 1, 2, 3 | elements 1, 2, 3 |
| RX 4 | `f_UL` calibration reference | `f_DL` calibration reference |
| Hears | **handsets** — requests, granted voice | tower signalling, **`8TAC95D` talkaround**, and a **known-position reference** |
| Locates | trunk handsets | **talkaround handsets** (8TAC95D is simplex), plus the tower for calibration |

**Both groups produce useful bearings, and that was not obvious until the windows
were drawn.** An earlier framing of this decision assumed direction finding on
talkaround would have to be given up, or bought back by retuning the array
between modes. It does not: **`8TAC95D` at 851.5500 MHz falls inside the downlink
window**, 337.5 kHz from the control channel, so the downlink group locates
talkaround handsets *with the same three chains it uses to decode the tower.*

So the architecture covers every way a handset can transmit — trunk request,
granted trunk voice, and simplex talkaround — **with bearings on all three,
simultaneously, with no mode switching.** That is the single strongest argument
for two groups over one wide window, and it arrives as a consequence of the Texas
plan's channel siting rather than of anything we designed.

**Every element feeds both groups**, through a 2-way Wilkinson splitter placed
after its LNA. Nothing is time-shared and nothing is switched.

#### Why this arrangement, and the two reversals that produced it

**Reversal 1 — away from the AD9361, on a failure mode.** A three-element array
needs three coherent chains; the AD9361 has two per die, so it takes two devices
plus a synchronisation procedure. A multi-chip synchronisation that half-succeeds
produces a **wrong bearing rather than a missing one** — the silent-confident
error this design works throughout to eliminate. That argument was correct.

**It led to the ADRV9026, and that was wrong**, for a reason nobody checked at
the time: its tuning range starts at 650 MHz, which puts the VHF and UHF band
modules below its floor (§7.4 item J). A decision that improves one property
silently broke another two documents away.

**Reversal 2 — the array was pointed at the wrong band entirely.** Found in
review, and it is the most consequential finding in this document's history. The
captured slice was the *downlink*, so **every bearing the system could compute
would have been a bearing to the tower** — the one transmitter whose position is
never in question. Handsets transmit on the uplink and on talkaround. The array
had to move.

**Those two facts together force this architecture**, and the forcing is
arithmetic rather than preference:

- Handset emissions span **806.2125 MHz (uplink control) to 851.5500 MHz
  (talkaround) — 45.34 MHz**, set by the 800 MHz duplex split.
- Covering all of them in **one** coherent group therefore needs ≳45 MHz of
  capture. The AD9361's 56 MHz reaches it; the ADRV9002's 40 MHz **cannot**, and
  no allocation trick changes that, because the three elements of a group must be
  co-tuned to be coherent.
- So either one wide group on an AD9361 pair, or **two narrow groups** — which
  needs more than two receivers' worth of devices.

**Two narrow groups win, and the deciding argument is again a failure mode.** A
single 47 MHz group has **one gain control for everything in it**. A patrol car
keying up on the uplink thirty metres away would pull the gain down for the
**downlink control channel too** — and the control channel is the entire event
stream: congestion, blocked attempts, emergency declarations, every alarm the
product demonstrably raises. **The unified capture puts the product's core
function at the mercy of ordinary nearby traffic.**

Two groups have two independent gain controls. A strong uplink signal
desensitises the uplink group only. The control channel keeps decoding.

Three supporting reasons:

**Intermodulation improves dramatically.** Each group sees ~2 MHz containing a
handful of signals rather than 47 MHz containing an entire duplex band. Third-order
products are the one dynamic-range mechanism processing gain cannot remove
(§3.3.1), and narrowing the window is the direct remedy. This is what demotes
item D from the sharpest open question to an ordinary budget.

**The band problem disappears.** 30 MHz–6 GHz covers VHF, UHF and 700/800 with no
up-conversion, no mixers, no image filtering and no added spurs. Item J closes
outright.

**The digital interface gets easier, not harder.** The ADRV9026 required
JESD204B/C and an FPGA with gigabit serial transceivers. The ADRV9002 uses
LVDS/CMOS SSI, so the bridge returns to an ordinary Zynq-class part (§3.5.1). At
our ~2 MHz per group the sample rates sit near the boundary between SSI's
single-lane and four-lane modes, so pin count stays modest. [Inferred]

#### What splitting costs, and why it is nearly free

A 2-way Wilkinson divider is **3.2 dB** down per output — 3.01 dB is the physics
of halving power, ~0.2 dB is insertion loss — with ~20 dB port isolation and
outputs in phase by construction. [Confirmed — standard passive component.]

**Placement decides whether that matters:**

| Splitter position | System noise figure | Penalty |
|---|---|---|
| **After the LNA** — as designed | **1.04 dB** | **+0.04 dB** |
| Before the LNA | 4.20 dB | +3.20 dB |

With ~20 dB of gain ahead of it, the loss is divided by the LNA's gain in the
Friis cascade and effectively vanishes. [Inferred — Friis, assuming a 1.0 dB /
20 dB LNA.] Because the LNAs already live in the body and the dock sits *before*
them (§3.1a), **this is a processing-body change only. The band modules are
untouched** — no new SKU, no antenna rework.

One structural benefit: splitting after the LNA means both groups see the same
amplifier for a given element, so that element's amplifier phase is common to
both paths rather than being two independent error sources.

#### Two calibration tones, because one cannot serve both groups

A tone is only measurable if it lands inside the window a group is tuned to, and
the two windows are 45 MHz apart. So the calibration source generates **two**
tones — `f_UL` inside the uplink window and `f_DL` inside the downlink window —
combines them, and injects both at all three element couplers, exactly as §3.1a
specifies for one.

Each tone needs a parking spot inside its window that is not on top of a live P25
channel. A small siting constraint, and a real one.

**The fourth receiver in each group is a reference tap on the tone source
itself**, bypassing the antenna path. That is what makes it a *reference* rather
than a fourth copy: comparing the tone as it arrives through the chain against
the tone as the source emitted it **separates source drift from chain drift.**
Without it, a wandering oscillator and a wandering cable look identical.

This was previously recorded as unassigned headroom. It is now assigned.

#### What this does not remove

**Phase calibration is still required, and still per-element.** The array
manifold, filters, cables, dock connectors and now the splitters are all
per-element. The calibration tone is not optional and never was. The accurate
claim is that MCS removes the largest and most fragile single source of
inter-chain phase error — not the discipline.

**MCS is required even within one device.** The ADRV9002's two receivers have
independent PLLs and are **not** phase-aligned by construction; MCS is needed to
match RX1 and RX2 on a single chip. [Confirmed]

**That fact is what makes four devices acceptable**, and it deserves stating
plainly because it reverses the reasoning that chose the ADRV9026. If MCS must
run regardless of device count, then **adding devices does not add a new class of
risk** — it adds participants to a procedure already being run, using a
vendor-supported mechanism with a dedicated hardware sync signal, re-executed
automatically on every retune. Device count returns to being a question of cost,
power and board area, which is where it belonged.

#### The tuning range narrowed when we changed parts, and it breaks a claim we were making

**Found 2026-07-31, during a QA pass on the training material. This is a real
defect introduced by the ADRV9026 selection and it was not noticed at the time.**

| Part | Tuning range | VHF 136–174 | UHF 380–520 | 700/800 |
|---|---|---|---|---|
| AD9361 | 70 MHz – 6 GHz | ✅ | ✅ | ✅ |
| ADRV9026 *(briefly selected, rejected)* | **650 MHz – 6 GHz** | ❌ | ❌ | ✅ |
| **ADRV9002** *(selected)* | **30 MHz – 6 GHz** | ✅ | ✅ | ✅ |

[Confirmed — Analog Devices product documentation.]

**The ADRV9026 put two of the three band modules below its floor**, and the claim
this section used to carry — *"one body covers every band"* — was true of the
AD9361 and false of the part that briefly replaced it. **The ADRV9002 restores it
outright**, with no mixer and no up-conversion, which is why §7.4 item J is closed
rather than mitigated.

The episode is kept here rather than deleted because the lesson generalises:
**after any part substitution, re-check every specification the old part's numbers
were quietly supporting**, not only the one that motivated the change.

#### The tower is a permanent calibration beacon — and that is the downlink group's second job

**This falls out of the two-group architecture and it is worth more than it
cost.** The downlink group is tuned to the tower. A tower is a transmitter at a
**surveyed, fixed, known position**, radiating more or less continuously.

So the downlink group is not merely decoding signalling. **It is continuously
measuring a bearing whose correct answer is already known.**

That gives an end-to-end check on the entire direction-finding chain — array
manifold, feed phase, dock connectors, splitters, MCS alignment, magnetometer
heading — against ground truth, for free, whenever the tower is transmitting.
Nothing else in this design validates all of those at once.

**Four things it catches:**

| Failure | How it shows up |
|---|---|
| **MCS half-succeeded** | Reference bearing jumps at the moment of a retune |
| **Heading error** (§5.8) | Reference bearing offset by a constant — exactly a magnetometer bias |
| **Multipath** (§5.7) | Reference bearing wanders while the unit and tower are both stationary |
| **Manifold or connector drift** | Slow reference bearing creep across a deployment |

**This defuses the objection that drove two reversals.** We rejected multi-device
synchronisation because a half-succeeded sync yields a *wrong bearing rather than
a missing one* — a silent, confident error. With a known-position emitter
permanently in view, **that failure is no longer silent.** It becomes a detected
fault the moment the reference bearing moves, and §1.5 of `docs/software-prd.md`
already specifies how the unit is to report its own degradation.

The design's recurring principle, applied once more: an undetected error is worse
than an admitted one — so build the instrument that admits it.

**Two honest limits.** The tower bearing validates everything *common* to both
coherent groups, but the uplink group has its own PLLs, its own gain control and
its own splitter legs, so it is validated only inasmuch as it shares the antenna
array, the LNAs and the manifold. And a tower on a bearing that happens to lie
near the array's front-back ambiguity axis is a weaker reference than one abeam.
Neither is a reason not to do it. [Inferred]

#### Still true, and still the reason a software-defined radio is right

**One body covers every band**, restored by the ADRV9002's 30 MHz floor. The
band-specific content lives in the module (§1.1).

**Bandwidth, not chain count, is what lets one group watch many channels at
once.** See §3.3.1. This was the point an earlier revision got wrong — it claimed
multiple receive *chains* were how the unit watched several *radio channels*,
which is a §0 terminology collision and was false. Chains co-tuned within a group
observe the same centre frequency; multiple channels come from capturing a window
and separating it digitally.

**A common phase reference across a group's chains is exactly what direction
finding wants** — coherent sampling against one reference is the definition of
what an interferometer needs. On this part that reference is established by MCS
rather than by a physically shared oscillator, which is why MCS is load-bearing
and not a convenience.

**The transmit chains are already there.** The licensed configuration needs a
power amplifier, a duplexer and an authorisation, not a different radio.

> **Assumption to confirm from the datasheet before any commitment:** whether the
> four receivers share a single RX synthesiser, as the AD9361's two do. It is
> assumed here that they do. It does not affect the uplink case, which is solved
> by bandwidth rather than by independent tuning, but it would matter for any
> future two-band configuration. [Assumption]

#### 3.3.1 How simultaneous multi-channel monitoring actually works

The module must observe the control channel, whichever voice channels are
currently granted, and the analog talkaround channel — all at once. It does this
with **wideband capture and digital channelisation**, not with one receiver per
channel.

A receive chain is tuned to a centre frequency with enough bandwidth to span
every channel of interest in its **window** (§0), digitising the whole thing at
once. The compute module then separates the individual channels in software and
decodes them in parallel. This is standard software-defined radio practice and is
exactly how the open-source SDRTrunk project follows a trunked system with one
receiver.

**Since 2026-07-31 there are two windows, not one** (§3.3), and which channel
lands in which matters:

| Window | Span | Contains | Group |
|---|---|---|---|
| **Uplink** | ~806.2–808.2 MHz, about **2 MHz** | Channel requests and granted voice — **everything a handset transmits on the trunk** | Uplink coherent group |
| **Downlink** | ~851.2–853.7 MHz, about **2.5 MHz** | Control channel, granted voice as repeated by the tower, **and `8TAC95D` at 851.5500** | Downlink coherent group |

Both sit far inside a single ADRV9002's 40 MHz, which is why neither group needs
anything clever.

**`8TAC95D` is in the downlink window, and that is a geographic accident rather
than a design choice** — the Texas plan happens to put the 800 MHz talkaround
channel at 851.5500, 337.5 kHz from our control channel. It is *simplex*, so
despite living among the tower's frequencies it carries handset transmissions
(§7.4 item D). In the demo's beat 3 this is what lets the Orb hear the out-of-area
unit who was denied on the trunk and went to talkaround: that traffic is inside
the downlink window, decoded alongside the control channel by the same group, not
on a second receiver.

**One consequence to state, because it is a real limitation:** talkaround is
decoded by the *downlink* group, which is also the group that produces the tower
reference — so **talkaround transmissions can be located as well as heard**, using
the same three elements. Trunk handsets are located by the uplink group. Both
capabilities exist simultaneously, which is exactly what the two-group
architecture was chosen to buy.

##### The four stages, concretely

1. **Capture.** One receive chain tunes to a centre frequency and digitises the
   whole slice as complex I/Q. Everything in the slice is now numbers.
2. **Down-convert.** For each wanted RF channel, multiply the stream by a complex
   exponential at the frequency offset. This slides that channel to zero.
3. **Filter and decimate.** Low-pass to the channel's own bandwidth and throw
   away the surplus sample rate, yielding a ~12.5 kHz stream that contains one
   channel and nothing else.
4. **Demodulate.** C4FM for P25, FM discrimination for analog talkaround.

Steps 2–4 are instantiated once per channel and run in parallel. Where channels
are uniformly spaced, a **polyphase filter bank** does all of them at
substantially less cost than N independent down-converters. For a reader coming
from computing, the right mental model is **demultiplexing a mirrored link**
rather than adding a network card per host.

##### Limitation 1: dynamic range is the binding constraint, not channel count

This is the limitation that matters, and it is the one most likely to be missed.

A narrowband receiver filters an unwanted strong signal out *before* the
converter. A wideband capture cannot — every signal in the slice reaches the ADC
together, and **the strongest one sets the gain**. Automatic gain control backs
off to avoid clipping it, and everything weaker descends toward the quantiser's
noise floor.

At an incident this is not hypothetical. A vehicle radio transmitting at 50 W
from 30 m away and a handheld at 1 W from inside a building can differ by 60–80
dB at the antenna. A 12-bit converter offers roughly 74 dB of theoretical
signal-to-noise, and rather less in practice.

Decimation does return processing gain — narrowing 2.5 MHz to 12.5 kHz is a
200:1 reduction, worth about 23 dB — but it does not rescue this case, because
the quantisation noise the strong signal forced upon the slice is spread across
that slice and lands in every channel extracted from it.

**The consequence is a direct trade between capture width and weak-signal
sensitivity.** A wider slice monitors more channels *and* is more likely to
contain a strong local transmitter that raises the floor for all of them. This
matters specifically for §3.3.2, where the entire point is hearing signals the
network could not.

**And our interferer is the same kind of radio as our target**, which removes the
conventional escape. A 50 W vehicle radio is a police radio, on the trunk we are
monitoring, in the band we deliberately selected. A filter cannot reject it,
because it is in-band by definition. This is unlike the usual desensitisation
case — a receiver deafened by an out-of-band emitter — where selectivity solves
the problem.

##### It is three mechanisms, not one, and only one of them benefits from processing gain

An earlier version of this section treated dynamic range as a single number. It
is at least three, and they behave differently:

| Mechanism | What it is | Helped by processing gain? |
|---|---|---|
| **Quantisation noise** | Rounding error from digitisation, spread roughly evenly across the captured band | **Yes.** Channelising to 12.5 kHz keeps ~1/200th of it — about 23 dB |
| **Spurs** | Discrete tones generated by converter nonlinearity, at specific frequencies | **No.** A spur either lands in the channel being decoded or it does not; narrowing the view does not attenuate it |
| **Intermodulation** | Two strong signals producing a product that lands on top of a weak one | **No.** It was created inside the receiver, so filtering afterwards cannot remove it |

The master equation covers only the first:

> **In-channel noise floor = (strongest signal in slice) − (converter dynamic
> range) − (processing gain)**

##### What the selected part actually specifies

**Analog Devices does not publish an ADC bit count for these parts**, and that
is reasonable rather than evasive: in an integrated transceiver the converter
sits behind an analog chain whose nonlinearity and noise matter as much, so the
meaningful specification is end-to-end. [Confirmed — searched; a support-forum
thread asks exactly this and the figure is not in the published material.]

**Corrected 2026-07-31.** An earlier revision of this table carried **ADRV9026**
figures — 81 dBc SFDR, IIP2 58–65 dBm, IIP3 15–18 dBm — and left them in place
after the part changed. They are the wrong part's numbers and have been removed
rather than re-tagged, because a specification attributed to the component you
did not select is worse than no specification at all.

| Specification | Value | Note |
|---|---|---|
| **Dynamic range** | **150 dBc/Hz** | And **maintained across the receiver's gain-control range**, which matters more than the headline — AGC backoff does not spend it |
| **Max receiver gain** | ~20 dB | |
| **Gain control range** | 34 dB | |
| **Gain / linearity trade** | **1 dB of gain reduction buys 1 dB of IIP3 *and* 1 dB of IIP2** | A directly usable design lever, not a fixed property |
| **Image rejection, narrowband IF mode** | ~90 dBc | Against DMR's 70 dBc spurious-response requirement, so there is stated margin |

[Confirmed — Analog Devices technical material.]

**One configurable choice is worth taking deliberately.** The receiver carries
both a high-power and a low-power ADC, and **the HPADC gives roughly 5 dB better
IIP3 at the cost of more power.** [Confirmed] Item G resolved our supply envelope
to a few hundred watts, so **we should be specifying the HPADC** — 5 dB of
third-order intercept is bought with power we demonstrably have, and
intermodulation is the mechanism processing gain cannot fix. This is the one
place in the design where the generous power budget converts directly into
sensitivity.

**The pedigree is right this time.** The previous part's figures were
base-station-grade, which was defensible by analogy. These are from a part
designed for **handheld land mobile radio operating next to strong blockers** —
the same problem, at the same scale, in the same market.

**What has still not happened is a budget.** No numbers exist for our windows,
our filters, or our environment, and the third-order behaviour with several
strong uplink emitters inside one ~2 MHz window is exactly what needs computing.
[Assumption]

##### The requirement that follows regardless of how the measurements come out

**The unit must detect and announce when it has been desensitised.** No amount
of component selection removes the possibility — a vehicle can always park closer
— so the design must treat partial deafness as a condition to be reported rather
than an edge case to be engineered away.

The trigger condition is computable from quantities already known, since the AGC
state and the converter's specification are both available:

```
degraded  ⟺  (strongest signal) − (converter DR) − (processing gain)  >  (thermal floor + NF)
```

In words: **whenever the converter rather than physics is setting our noise
floor, we have lost sensitivity we would otherwise have had**, and the amount
lost is exactly the difference. Requirements are in `docs/software-prd.md` §1.5.

##### Limitation 2: one band at a time

If a deployment needed two widely separated bands at once — a VHF trunk together
with an 800 MHz channel — one transceiver cannot do it, because the receive
chains share an LO.
That needs a second transceiver. It does not arise in the demonstrated
configuration, because the Texas plan designates a talkaround channel **per
band**, so an agency's trunk and its fallback are in the same band by
construction.

##### Limitation 3 — RESOLVED: the capture used to cover downlinks only

**This was the most serious gap in the specification, and it is now closed.**

An earlier revision captured a single ~2.5 MHz *downlink* slice — what the tower
transmits. Subscriber radios transmit on **uplink** frequencies 45 MHz below, so
nothing in the design heard them directly. Two consequences followed, and the
second went unnoticed for longer than the first:

- **The Orb could not hear a subscriber transmission the infrastructure never
  repeated** — the exact failure case §3.3.2 exists to address.
- **Every bearing the direction-finding array could compute was a bearing to the
  tower**, because the tower was the only thing in the captured slice apart from
  simplex talkaround. A bearing to a transmitter at a known, surveyed position is
  operationally worthless.

**Closed by the two-group architecture of §3.3.** The uplink window is not an
add-on: it is what the direction-finding array is pointed at. Handset requests
and granted handset voice are now both captured and located, and the downlink
window is served by its own coherent group.

**What remains true** is that a *single* group still sees one window. The 45 MHz
duplex split is wider than any one ADRV9002 group can span, which is precisely
why there are two.

##### Expandability — what is a software change and what is not

| Change | Cost |
|---|---|
| Monitor more channels inside the existing slice | **Software only.** More channeliser instances. Bounded by compute and by the dynamic-range trade above |
| Follow every active voice channel of a trunk, not just granted ones of interest | **Software only.** This is precisely what SDRTrunk does with one receiver |
| Widen the slice within the same band | Software, plus front-end filter selection, plus a worse dynamic-range position |
| Add uplink coverage 45 MHz away | Either a much wider slice with a serious dynamic-range and filtering penalty, **or a second transceiver** — see §3.3.2 |
| Monitor a second band simultaneously | **Second transceiver.** No software path exists |

The headline for a customer conversation is the first two rows: **within a band,
monitoring more is a software update rather than new hardware.** That claim is
true and worth making. It should not be stretched to cover the last two rows.

The lower-cost **AD9363** is pin-compatible with a reduced tuning range and is a
legitimate cost-down option for a build committed to one band [Inferred].

#### 3.3.2 Hearing what the network missed — *design analysis, not built*

**Nothing in this subsection is implemented in the proof of concept.** The demo's
detection engine consumes an event stream and knows nothing of signal strength.
This is a design argument about what the hardware could support, and it is
recorded because it is the strongest capability argument the architecture has.

##### The organising idea: infrastructure-side and subscriber-side

There are two fundamentally different things a receiver can listen to here, and
keeping them apart clarifies both the capability and the open items.

| | **Infrastructure-side** | **Subscriber-side** |
|---|---|---|
| What it is | What the tower transmits: control channel downlink, repeated voice | What handsets transmit directly: analog talkaround today, P25 uplink requests pending |
| Power | Tower, high | Handheld, 1–5 W |
| Reach | Set by the tower — audible from far away | Set by proximity to the officer |
| Shows you | What the system **knows about** | What the system **missed** |

**`8TAC95D` is already subscriber-side**, because we chose a *direct* channel —
mobile and portable only, no repeater. An agency using one of the repeated
interop channels instead would put that traffic back on the infrastructure side,
where it behaves like the trunk.

**So analog talkaround and a failed P25 request are the same category of
problem**, and the differences between them are instructive:

- **Where they sit.** Talkaround is inside the slice we already capture; P25
  uplinks are 45 MHz away and are the open item.
- **Content, inverted from expectation.** A P25 request is a *decodable packet* —
  unit ID, talkgroup, service, emergency flag, error-protected. Analog is audio
  with no inherent identity. **The harder-to-receive case carries far more
  meaning.**
- **Duration, also inverted.** The request is 20–35 ms, a single snapshot with no
  bearing-stability metric available. Analog runs for seconds. The easier case to
  receive is also the easier case to direction-find.
- **Operational meaning, which is the real difference.** Talkaround traffic means
  officers have *deliberately* fallen back: they know the trunk is failing and
  have adapted. A failed request means an officer **believes they are on the
  system and is not.** One is a coping behaviour; the other is an unaware
  failure, and the second is far more alarming from a commander's chair.

**And the two sides together produce a diagnosis neither produces alone.** Hearing
a request on the uplink *and* observing that no grant, queue or deny followed on
the downlink is how you establish that the trunk never heard it. That requires
both sides at once.

##### What this means for the headline claim

The design document's differentiator is "detecting what never got through in the
first place." That claim has **two tiers**, and they should not be blurred:

| | Claim | Status |
|---|---|---|
| **Tier 1** | *The trunk heard you and refused* — denials, queues, system-busy. Invisible today to everyone outside the trunk controller | **Designed and demonstrated** |
| **Tier 2** | *The trunk never heard you at all* — and you have no way to know | **Needs uplink coverage** |

Both are honest versions of the promise. Tier 1 is real and valuable on its own.
Tier 2 is the claim without qualification, and it lives entirely on the
subscriber side. A customer will ask which one is meant, and the answer should be
ready rather than assembled on the spot.

##### The asymmetry that makes it work

A subscriber's transmission fails when it is too weak **at the tower**. The tower
may be 10 km away. The Orb is on scene, perhaps 100 m from the officer.

Path loss grows as roughly *r*ⁿ, with n ≈ 2 in free space and 3–4 in built-up
areas. A 100× range advantage is therefore worth **40 dB at n = 2 and about 60 dB
at n = 3** — and the harsher the environment, the *larger* the Orb's advantage
becomes.

**That is the whole argument for on-scene monitoring, and it should be stated in
exactly those terms:** the Orb is not a better receiver than the network's, it is
a closer one.

##### Three thresholds, and only the third is a cliff

| Tier | What it takes | What you get |
|---|---|---|
| **Detect** | Energy above the noise floor in the right RF channel at the right time | Something transmitted |
| **Recognise** | Frame-sync correlation for P25; carrier and deviation for FM. A 48-bit sync word carries substantial correlation gain, so this works below the decode threshold | Something transmitted *and what kind of thing it was* |
| **Decode** | FEC and CRC pass | Unit ID, talkgroup, service requested, emergency flag |

The operationally important consequence: **direction finding needs only the first
two tiers.** A bearing is extracted from carrier phase across the array and does
not require the payload to decode. **The Orb can put a bearing on a transmission
it cannot read.** The honest limit is that below the decode threshold the report
is "an unidentified P25 subscriber transmitted from bearing 037°" rather than
naming the unit — weaker, and still more than anyone has now.

##### Case A — a P25 request the trunk never answered

An officer presses PTT; the radio sends an inbound service request on the control
channel uplink; intervening structure means the tower never receives it. The
radio's user hears no grant, and the network has no record that anything
happened.

Two facts make this detectable in principle:

- **The request is decodable if we can hear it.** An inbound signalling packet is
  a fully specified P25 packet with FEC and CRC. Decoded, it yields the source
  unit ID, the target talkgroup, the service requested, and whether the emergency
  bit was set. **We would know exactly who tried and what they wanted**, on a
  transmission the network never registered.
- **Failure produces more transmissions than success.** The control channel
  uplink is a slotted random-access channel; an unanswered radio retries under a
  backoff, and the user, hearing the reject tone, usually keys again. So the
  failing case yields a *burst train* rather than a single burst. [Inferred —
  retry behaviour is standard; exact counts are system-parameter dependent.]

**And a further inference available for free:** the Orb also monitors the
downlink. Hearing a request and then observing that **no grant, queue, or deny
followed it** is a detection in its own right — one that neither the radio user
nor the dispatcher currently gets. That is a new class of signal, distinct from
the Deny/Queue "blocked attempt" the engine already models, because a blocked
attempt means the trunk *heard* you.

**What it costs: uplink coverage, which the design does not currently have
(§3.3.1, limitation 3).** Two routes, and the second is better than it looks:

**Resolved 2026-07-31 by the transceiver selection.** A downlink at 851.5 MHz and
its uplink at 806.5 MHz are 45 MHz apart. That barely fitted inside the AD9361's
56 MHz; it sits comfortably inside a single ADRV9002 group's **40 MHz** (§3.3). Widening
the slice is therefore a configuration choice rather than a stretch.

**What is not resolved is the cost of doing it**, and it is the dynamic-range
problem above in its sharpest form. A slice spanning both directions needs a
front-end filter passing roughly 806–869 MHz, which admits **every strong emitter
in between** — and the strongest of them sets the noise floor for every channel
extracted from the slice. That is §7 item D, and it bears directly on whether
this capability works in the environment it is for.

The fallback path, if the wide slice proves untenable, is a second transceiver
covering the uplink band separately.

##### Case B — an analog transmission too weak to understand

An officer keys up on 8TAC95D and arrives at the receiving end as static.

This case is **easier than Case A in every respect**:

- **No uplink problem.** 8TAC95D is a simplex direct channel — subscriber
  transmissions appear on 851.5500 MHz itself, already inside the captured slice.
  But note the coverage asymmetry this creates, because it is easy to miss: trunk
  downlinks come from a **tower at high power**, so we hear them from far away,
  while talkaround comes from a **handheld at 1–5 W**, so we only hear it from
  nearby. Our reach on the trunk is set by the tower; our reach on talkaround is
  set by how close the Orb is to the officer. Placement matters more for the
  fallback channel than for the trunk. [Inferred — link budgets not computed.]
  The current architecture covers it with no change.
- **No decode cliff.** FM degrades gracefully rather than failing at a threshold,
  and carrier detection works far below intelligibility. Squelch opens on signals
  that produce no usable audio at all.
- **A bearing needs a carrier, not intelligibility.** The same point as above,
  and it applies with more margin here.

The limitation is **identity**. Analog carries no inherent unit ID. Many public
safety analog fleets send an **MDC-1200-class ANI burst** at PTT press, which is
FEC-protected and may well decode when the speech does not — giving a unit ID
from an unintelligible transmission. Whether that is present is an agency
configuration question, not a design one. [Assumption — must be confirmed per
deployment; on supervised TSICP interoperability channels it may be absent
entirely.]

Do not claim speech transcription works on static. The defensible claim is
narrower and still valuable: **"an unintelligible transmission occurred on the
tactical channel, at this time, from this bearing, and here is the unit ID if the
fleet sends one."** For a commander whose officer is not answering, that is a
search direction where there was previously nothing.

### 3.4 Power amplifier and duplexer — *band module; PA standard, duplexer clip-in*

**Corrected.** An earlier revision of this section said "populated only on
transmit-enabled builds," which contradicted `design-document.md` §5 and would
have made licensing a hardware upgrade. It is not.

Both parts are band-specific and live with the band module (§1.1, §3.1a), but
they are fitted differently, because the two transmit capabilities are authorised
on completely different timescales — see §1.1.1 for the full argument:

- **Power amplifier and T/R switch: on every module.** Enough for
  interoperability and talkaround channels, which are simplex and are authorised
  by a communications leader *at the incident*. Transmit is enabled in software.
- **Duplexer: a clip-in pack**, needed only for licensed trunk participation,
  which is arranged administratively months in advance and never granted
  mid-response.

`8TAC95D` is capped at **20 W ERP, mobile and portable only, no base stations**
[Confirmed — TSICP], which is a modest and comfortable target.

**Why this costs less than it sounds.** The expensive common processing body
carries no transmit chain at all; the PA rides with the comparatively cheap,
mostly mechanical band module. The receive-only power argument of §6 is
completely unaffected, because it always rested on the PA being *unpowered*
rather than *unpopulated*.

**One alternative worth costing rather than deciding here:** a broadband driver
in the body with band-specific final filtering in the module. At 20 W ERP this
may well be feasible and would move cost back out of the module. [Assumption]

**And one question this raises that is not ours to answer.** Shipping
transmit-capable Part 90 hardware to agencies not yet licensed to operate on
those frequencies is an equipment-authorisation and compliance question. It is
routine in adjacent markets and is not expected to be a blocker, but it belongs
to whoever owns regulatory affairs and is listed in §7.

> **A caveat worth carrying into the roadmap.** Secondary sources describing the
> TSICP state that these low-power mobile/portable direct channels **may not be
> used in a repeater configuration nor patched through a gateway device**
> [Inferred — read from RadioReference's TSICP summary, not from the plan text
> directly]. If that restriction applies as written, the cross-band bridging
> described in our roadmap cannot use `8TAC95D` as one of its legs, and would
> have to be built around repeater-capable interoperability channels instead.
> This does not affect anything in the receive-only product being demonstrated,
> and it should be confirmed against the plan itself before any bridging feature
> is committed to.

### 3.5 Baseband and application compute — *off-the-shelf module, doing double duty*

A **Jetson-class embedded module** (Orin Nano / Orin NX class) runs both the
signal processing and the local AI fallback.

Configurable power modes of 7 W and 15 W, with 25 W and higher-performance modes
available; roughly 4.5 W idle and 8–12 W under typical single-stream inference
[Confirmed — NVIDIA Jetson Linux developer documentation and vendor
characterisation].

One module rather than two is a deliberate call. A separate DSP or FPGA for
demodulation and a separate applications processor would be the conventional
split, but P25 is a narrowband, low-bit-rate mode — the open-source SDRTrunk
project decodes it on ordinary desktop CPUs. The GPU on this module is not there
for the radio. It is there so that the classification model has somewhere to run
when the network is gone.

#### 3.5.1 The FPGA bridge — *a stage the first revision of this diagram omitted*

The transceiver presents its digitised I/Q on a configurable **LVDS or CMOS
serial synchronous interface (SSI)**. [Confirmed — Analog Devices.] **No
Jetson-class module has an input that can accept it.** Jetson ingest is CSI, USB and PCIe; none is a radio converter
interface. [Confirmed — Analog Devices publish interface cores specifically for
FPGA integration, and every comparable design — ADALM-Pluto, USRP — places an
FPGA between the transceiver and the host.]

So the block diagram needs a stage that the earlier revision did not show: an
**FPGA or FPGA-SoC bridge** that terminates the converter interface and presents
narrowband streams to the Jetson over PCIe or USB3.

**The ADRV9002 selection lowers what this part has to be.** LVDS/CMOS SSI is a
source-synchronous bus rather than a gigabit serial link, so **no serial
transceivers are needed in the fabric** and there is no SYSREF or
deterministic-latency bring-up. An ordinary mid-range Zynq-class device is the
right family. What sizes it instead is **pin count across four devices**: at our
~2 MHz per group the sample rates sit near the boundary between SSI's single-lane
and four-lane modes, so the lane count per chain — and therefore the total LVDS
pair count — is the number to establish. [Inferred]

*An earlier revision of this section, written when the ADRV9026 was selected,
required gigabit transceivers and SYSREF distribution. That requirement is gone
with that part.*

This is not merely a format converter, and that is what makes it good news
rather than bad. It is the natural home for:

- **The channeliser of §3.3.1.** Down-conversion and decimation are exactly what
  fixed-point FPGA fabric does efficiently, and doing it here means the link to
  the Jetson carries a handful of 12.5 kHz streams instead of gigabits of
  wideband I/Q — a reduction of several orders of magnitude.
- **Sample-precise timestamping**, disciplined by the GNSS reference of §3.6.
- **Coherent multi-chain capture** for the direction-finding variant, where
  phase alignment between chains must be preserved sample-by-sample.

Analog Devices supply the HDL, so this is integration rather than novel
development — but it is a real component with real cost, board area, power and
engineering time, and omitting it understated the design. The division of labour
between FPGA and Jetson is settled in §7.1: stages 7–9 here, stage 10 onward on
the Jetson. What remains is sizing.

**When presenting the architecture, the compute story is now two parts, not
one:** an FPGA doing fixed, high-rate, regular signal processing, and a Jetson
doing irregular, stateful work — protocol decode, control-channel following, and
the local AI fallback. That is the conventional and correct split, and §8's
"effort concentrates in software" conclusion is unchanged by it.

#### 3.5.2 The receive chain end to end, and where it branches

Three identical chains run from three antenna elements to two different answers.
This traces the whole path and marks the one place it divides.

##### Stages 1–6: analog, per element, ×3, identical

| # | Stage | Where | Note |
|---|---|---|---|
| 1 | **Antenna element** | Band module | Half-wave sleeve dipole. Size set by band (§5.1) |
| 2 | **Directional coupler** | Band module | Calibration tone injects here, so everything downstream — including the dock — sits inside the calibration loop (§3.1a) |
| 3 | **Bandpass filter** | Band module | The band-defining part. Rejects out-of-band energy *before* it can desensitise anything (§3.1) |
| 4 | **Dock connector** | — | Three RF paths cross here. Phase repeatability handled by stage 2's tone, not by connector specification |
| 5 | **LNA** | Processing body | All three on one board, one thermal environment, so drift is correlated and calibrates out (§3.1a) |
| 6 | **Mixer / downconversion** | AD9361 | **All chains share one local oscillator.** This is what makes them phase-coherent, and it is the whole reason interferometry is possible on this part (§3.3) |

At the end of stage 6 there are three baseband analog signals whose *relative*
phase still carries the direction information.

##### Stages 7–9: digitisation and separation

| # | Stage | Where | Note |
|---|---|---|---|
| 7 | **ADC** | AD9361 | Three complex I/Q streams. The dynamic-range constraint of §3.3.1 binds here and nowhere else — everything after this is arithmetic |
| 8 | **Timestamping** | FPGA | GNSS-disciplined (§3.6). Needed for any future multi-unit work |
| 9 | **Channelisation** | FPGA | Down-convert, filter, decimate — **per element, per RF channel of interest.** Channeliser instances therefore run at 3 × the number of channels being watched, which is a real FPGA sizing input |

**Two kinds of channeliser, with different lifecycles.** Worth stating explicitly
because the recent tracing of this pipeline described the dynamic case and left
the static one implicit:

| Channel | Lifecycle |
|---|---|
| **Control channel** | Instantiated at start-up from configuration, never torn down |
| **Analog talkaround (`8TAC95D`)** | Instantiated at start-up, never torn down. **It is one of the N, monitored continuously and in parallel with everything else** |
| **Trunk voice channels** | Instantiated on decoding a grant, torn down when the call ends |

**Which of the dynamic ones get channelised creates a loop back through the whole
pipeline.** The control channel's position is known from configuration, but voice
channels are assigned on demand — so that set of channelisers is **driven by the
decoded control channel**, which lives on the far side of the branch at stage 13. Decode a grant, learn which frequency it landed
on, instantiate channelisers there, tear them down when the call ends. The
pipeline is therefore not purely feed-forward: stage 13 reconfigures stage 9.
This is exactly how SDRTrunk follows a trunked system, and it is the mechanism
behind "control-channel follower" in the block diagram.

##### What the data actually looks like at each stage

Worth stating explicitly, because the stage names invite two natural
misreadings — that stage 9 emits bits, and that stage 10 annotates symbols.
Neither is the case.

| After stage | Shape | Rate |
|---|---|---|
| 7 (ADC) | 3 wideband complex I/Q streams | tens of MSa/s each |
| **9 (channelisation)** | **3 × N narrowband complex I/Q streams** — still a *waveform*, just narrower and slower | ~24–48 kSa/s each |
| **10 (correlation)** | **Per channel, per time window: three complex numbers** — one magnitude and phase per element | one triple per burst |
| 11 (combining) | 1 complex I/Q stream per channel | ~24–48 kSa/s |
| 12 (demodulation) | **symbols** — first appearance of anything discrete | 4800 sym/s |
| 13 (decode) | **bits**, then parsed frames | 9600 b/s raw |

Two consequences follow.

**No bits exist until stage 13, which is after the branch.** Everything through
stage 10 is waveform arithmetic on complex samples. **The direction-finding side
never touches a bit at all** — which is precisely why a bearing survives
conditions that decoding does not (§3.3.2).

**Where encryption actually bites, which is later than people assume.** P25
encryption protects the voice payload *inside* decoded frames. It does not touch
the waveform, the framing, the NID, or the control channel. So **stages 1 through
13 all run normally on an encrypted call** — timing, signal strength, unit ID,
talkgroup, grant/queue/deny signalling and a bearing are all recovered exactly as
usual. What emerges is ciphertext where the vocoder bits would be.

Encryption therefore bites at the *interpretation of one field of stage 13's
output*, not at any stage before it. That is a more precise and more defensible
version of "metadata stays visible," and it is worth stating that way because it
tells a customer exactly what they keep.

**Stage 10 is a reduction, not an annotation.** It consumes a window of thousands
of samples across three elements and emits *three numbers*. Nothing is attached
to individual samples or symbols. Running it repeatedly across a long
transmission is what produces the bearing-stability metric of §5.7 — a burst of
20 ms yields one triple, while a five-second voice call yields a sequence of them
whose variance is the multipath quality signal.

##### Stage 10: the shared computation, and the branch

**Cross-correlate the three streams against each other** to recover each
element's complex channel response — a magnitude and a phase per element, per
channel. It needs no known reference pattern, so it works identically on P25 and
on analog FM.

**This is the branch point.** Everything above is common; everything below is two
uses of this one result.

```
                 three co-channel streams, one per element
                                  │
                    ┌─────────────▼─────────────┐
                    │  PER-ELEMENT COMPLEX      │
                    │  CHANNEL ESTIMATE         │   ← the branch
                    │  (cross-correlation)      │
                    └──────┬─────────────┬──────┘
                           │             │
              magnitudes + │             │ phase DIFFERENCES
              phases       │             │ between elements
                           │             │
              ┌────────────▼───┐   ┌─────▼──────────────────┐
              │ MRC WEIGHTS    │   │ ARRAY MANIFOLD lookup  │
              │ co-phase, sum  │   │ (module EEPROM, §3.1a) │
              └────────┬───────┘   └─────┬──────────────────┘
                       │                 │
              ┌────────▼───────┐   ┌─────▼──────────────────┐
              │ ONE stream,    │   │ angle in the ARRAY's   │
              │ +4.8 dB        │   │ own frame              │
              └────────┬───────┘   └─────┬──────────────────┘
                       │                 │
              ┌────────▼───────┐   ┌─────▼──────────────────┐
              │ DEMODULATE     │   │ IMU + magnetometer     │
              │ C4FM / FM      │   │ (§5.8) → true north    │
              └────────┬───────┘   └─────┬──────────────────┘
                       │                 │
              ┌────────▼───────┐   ┌─────▼──────────────────┐
              │ DECODE         │   │ BEARING + declared     │
              │ FEC, CRC       │   │ uncertainty            │
              └────────┬───────┘   └─────┬──────────────────┘
                       │                 │
              ┌────────▼───────┐         │
              │ PARSE TSBK →   │         └──→ to df/aoa_fix.py,
              │ EVENTS         │              given a second unit
              └────────┬───────┘
                       │
                       └──→ DETECTION ENGINE → Command Feed
                            (the demonstrated product)
```

**Sum for content, difference for direction.** The same three numbers, used two
ways.

##### The arithmetic, stage by stage

**Stage 10 — correlation.** For each pair of elements, multiply one stream by the
**complex conjugate** of the other and accumulate over a window:

```
C_AB = Σ  a[n] · conj(b[n])
```

The conjugate is the mechanism. Multiplying by a conjugate *subtracts phases*:
`a · conj(b)` has magnitude `|a||b|` and phase `(∠a − ∠b)`. Every term therefore
points along the instantaneous phase difference, so accumulating adds the signal
coherently while the noise wanders and partly cancels. **The phase of C_AB is the
averaged phase difference between those two elements.** Each element's own power,
`Σ|a[n]|²`, gives how strongly it heard the transmission.

Two constraints follow. The correlation must be **gated** — correlating noise
against noise returns a random phase with a confident-looking magnitude, so an
energy detector has to establish that a burst is present and place the window on
it. And it assumes the phase difference is **constant across the window**; when
it is not, the terms partly cancel and the magnitude falls. That is not a defect,
it is the bearing-stability metric of §5.7 — subdivide a long transmission and
compare.

**One error cancels for free.** No transmitter sits exactly on frequency, and the
offset makes each stream's phase rotate slowly. But all three rotate
*identically*, seeing one emitter through one LO, so the rotation subtracts out
in the pairwise product. **Carrier frequency offset is common-mode at stage 10**
and nobody has to correct for it — though it returns as work at stage 12.

**Stage 11 — combining.** Each element received `stream_k = h_k·s + noise_k`,
where `h_k` is the channel estimate stage 10 just measured. Weight each by the
conjugate of its own estimate and sum:

```
out[n] = Σ conj(h_k) · stream_k[n]
```

That rotates all three copies into phase and scales each by `|h_k|`, so elements
that heard it well count for more. The result is worth stating as a rule:

> **The combined signal-to-noise ratio is the sum of the individual elements'
> signal-to-noise ratios.**

Three comparable elements give 3×, or 4.77 dB — the same figure as §3.1a, reached
independently. It also describes the edges honestly: one strong element and two
weak ones yields little more than the strong one alone, which is correct
behaviour and is why the weighting matters.

**Stage 12 — demodulation.** P25 Phase 1 carries information in frequency
deviation at four levels. Frequency is the rate of change of phase, so
`z[n]·conj(z[n−1])` has a phase equal to the advance over one sample interval —
one complex multiply per sample gives a discriminator. The same conjugate trick
as stage 10, applied across *time* rather than across *elements*.

Two things still have to be recovered: **symbol timing**, since their symbol clock
and our sample clock are unrelated, needing a timing-error detector and an
interpolator; and the **residual carrier offset**, which appears as a constant
bias on the frequency estimate. That is the one place the transmitter's crystal
error costs work, having been free at stage 10.

**The two modes diverge here and only here.** For analog talkaround the
discriminator is identical — its output simply *is* the audio, needing filtering
and de-emphasis rather than slicing. One operation serves P25 and analog FM,
which is why a single receiver handles the trunk and 8TAC95D with largely shared
code.

**Stage 13 — decode.** Correlate against the 48-bit frame sync to find
boundaries; read the BCH-protected NID for the NAC and the frame type; then
branch. **TSBK** frames (control channel) are 196 bits, trellis-coded at rate ½,
decoding to a 96-bit payload plus CRC, whose opcode gives grant, deny, queue,
emergency or registration. **LDU1/LDU2** frames (voice) carry vocoder data, link
control, and encryption sync if present. Error correction runs at several layers —
BCH, Golay, Hamming, trellis, Reed-Solomon — with a CRC gating acceptance.

**This is where the cliff is.** Forward error correction either corrects or it
does not; below threshold the output is *nothing*, not degraded content. That
discontinuity is exactly why detect, recognise and decode are three different
thresholds (§3.3.2), and why a bearing survives conditions a decode does not.

##### The content branch, from stage 13 to the screen

Stage 13's frame-type branch matters more than it appears, because the two frame
types lead to completely different downstream costs.

**13-A: control frames → structured events, and this path is cheap.** A TSBK
decodes to an opcode and its fields — Group Voice Channel Grant, Grant Update,
Deny, Queue, Unit Registration, Emergency — each carrying unit ID, talkgroup and
channel. That *is* the event stream. No audio, no AI, no further processing.

**13-B: voice frames → vocoder.** LDU frames do not carry audio. They carry
**vocoder frames** — IMBE on Phase 1, AMBE+2 on Phase 2 — and a vocoder is not a
compressor in the sense an audio codec is. It transmits *parameters of a speech
model*: pitch, voicing decisions, spectral envelope. Roughly 4.4 kbps of voice
parameters on Phase 1 and about 2.4 kbps on Phase 2, the remainder being error
correction. [Inferred — standard figures, not verified against the standard text
this session.] See §3.5.3 for two consequences that are not obvious.

**13-C: audio → text.** Vocoder output is 8 kHz PCM, which goes to speech
recognition — the hybrid arrangement already in the design, a cloud API on the
primary path and a Whisper-class model on the Jetson's GPU when connectivity is
gone.

**Stage 14 is the seam.** `demo/js/timeline.js` carries both the
control-channel fields and a transcript per event, so **it stands in for
everything through 13-C**. Everything after that line is built, running, tested
code: `classifier.py` at stage 15, `detection-engine.js` at 16, the two views at
17.

##### Latency, end to end

| Path | Air to screen |
|---|---|
| **Control-channel events** — congestion, blocked attempts, emergency declaration | **Well under a second** |
| **Voice content** — transcript, classification, AI-derived signals | **Roughly 2–5 seconds**, dominated by speech recognition and the model call |

**The safety-critical fast path does not depend on the slow AI path.** An
emergency declaration reaches the screen in under a second because it is
control-channel signalling, not speech. That is a good property and worth stating
unprompted.

The honest consequence is in `docs/software-prd.md`: escalation from SUSPECTED to
HIGH_CONFIDENCE can lag the first signal by seconds when one of the two required
signals is AI-derived.

#### 3.5.3 The vocoder — a licensing dependency and a quality ceiling

Two consequences of 13-B that are easy to miss and both matter commercially.

**The vocoder is proprietary.** IMBE and AMBE+2 are Digital Voice Systems Inc.
intellectual property. The open-source implementations that projects such as
SDRTrunk depend on exist in a legally contested space and are **not a basis for a
commercial product sold to a government customer.** A licence from DVSI, or a
licensed hardware vocoder, is a real cost and a real single-source supply
dependency sitting in the middle of the signal chain. [Confirmed that the codecs
are DVSI proprietary; the licensing terms and cost have **not** been
investigated — see §7.]

**Transcription quality is capped by the vocoder, not by the transcriber.** A
model-based codec at these rates discards a great deal of acoustic detail — it is
why P25 audio sounds synthetic. Speech recognition on vocoded audio is measurably
worse than on clean audio, and **no improvement in the recogniser recovers what
the vocoder already discarded.** That is a ceiling on every transcription-
dependent part of the product, and it should be stated rather than discovered.

**Both are confined to the voice path.** The control-channel detections —
congestion, blocked attempts, emergency declarations, the entire core capability
demonstrated in the proof of concept — need no vocoder at all. This is the same
shape as the encryption argument in §3.5.2: the thing that is denied is the
speech, not the capability.

##### From phase difference to azimuth — the DF branch in detail

Stage 10 does not produce an azimuth. It produces a measurement in the array's
own reference frame, and three further steps turn that into a bearing anyone can
act on. All are software.

| | Step | Depends on |
|---|---|---|
| **10** | Phase differences between elements | The three streams |
| **10a** | → angle in the array's own frame | **Array manifold**, read from the band module's EEPROM at dock time (§3.1a) |
| **10b** | → corrected into the horizontal plane | **IMU** — the lid is never exactly flat |
| **10c** | → **azimuth relative to true north** | **Magnetometer**, plus declination from the World Magnetic Model |
| **10d** | → quality assessment attached | Correlation magnitude, stability across sub-windows, the WMM gate of §5.8 A |

**This is why the sensors in the lid are load-bearing rather than accessories.**
Steps 10b and 10c are where a geometric measurement becomes a usable bearing, and
both depend on the module knowing its own orientation. It is also why the
manifold travels with the module: step 10a is meaningless without the calibration
belonging to *that* array.

##### There is no direction-finding component

**Nothing in the bill of materials is a direction-finding part except the
antennas and the orientation sensors.** Stage 10 and its successors are a
function running on the Jetson's CPU, not a chip.

Worth stating plainly, because the assumption runs the other way: direction
finding needs a particular *antenna arrangement* and a *coherent receiver*, both
of which are present for other reasons as well. Extracting the angle is
arithmetic, and very little of it:

```
48,000 samples/s × 3 pairs × 10 channels ≈ 1.4M complex multiply-accumulates/s
                                         ≈ 0.1% of one ARM core
```

Not the GPU either — that is there for the local AI fallback (§3.5). This is
ordinary CPU work.

**This is what closes open item A (§7.1).** Stages 10 and 11
should run on the Jetson rather than in FPGA fabric. The apparent argument for
the FPGA is link traffic, and it does not survive the numbers: three streams per
channel is roughly 46 Mbit/s against a PCIe link with three orders of magnitude
of headroom. Meanwhile stage 10 is the code most likely to need repeated tuning
against real measurements — burst gating, window selection, quality thresholds —
and fabric is the worst place to put what you expect to iterate on. Note also
that stage 11 consumes stage 10's weights, so the two cannot sensibly be split
across the link; they move together.

##### A word that must not be used loosely

The three chains are **coherently sampled but phase-offset**. They are *not*
"unsynchronised versions" of the signal, and the distinction is the design.

Synchronisation is the precondition; the phase offset is the measurement. Three
genuinely unsynchronised receivers would produce relative phase dominated by
their own oscillators' drift, swamping the 0.59 ns of arrival difference
entirely, and there would be no bearing to extract. Everything in §5.5.1 about
shared references and multi-chip synchronisation exists to guarantee the
coherence that makes the offset meaningful.

##### Four things this trace makes clear

**It is a fork, not a switch.** Both sides run on the same samples at the same
time. Nothing is given up by doing one, which is why the digital combining of
§3.1a costs the bearing nothing.

**Direction finding degrades earlier than decoding, and that is the right way
round.** Both need stage 10. But a bearing needs only the phase relationships,
while decoding must survive FEC and CRC. **The Orb can therefore bear on a
transmission it cannot read** — the tiering set out in §3.3.2, now located
precisely at stages 10 and 13.

**The array is load-bearing for reception, not just for bearings.** Stage 10 is
what makes maximal-ratio combining possible, and MRC is where the 4.8 dB comes
from. A customer who never asks for a bearing still needs stages 1–10 in
triplicate to get the sensitivity. This is the strongest technical support for
§1.1.1's decision to drop the single-element module.

**It settles where the FPGA/Jetson line should fall** (§7.1 item A). Stages 7–9 are high-rate, regular and fixed — FPGA work. Stage 10 onward
runs on decimated ~12.5 kHz streams and is irregular and stateful — Jetson work.
That is a natural boundary and it puts the branch itself on the Jetson side.

### 3.6 GNSS and a disciplined oscillator — *catalogue part*

Needed for accurate event timestamps, and the foundation for any future
multi-unit work, where two Orbs must agree on when something happened.

### 3.7 Secure element — *catalogue part*

Encryption keys, where an agency loads keys it legitimately holds, belong in
hardware key storage rather than in a file on the compute module. This matters
for the product's credibility as much as its security: the Control Panel's
crypto function is only defensible if key material demonstrably cannot be
exported.

### 3.8 Ethernet and power

**Ethernet to the ARC Edge base unit**, and a **dedicated power supply separate
from ARC Edge's own battery budget**. Both are settled design decisions. The
exact interface protocol above the physical layer is an open item (§7).

---

## 4. Illustrative bill of materials

**Illustrative.** Part families are real and appropriate; specific part numbers
are examples of the class, not selections. Nothing here has been price-checked,
availability-checked, or second-source-checked.

| # | Function | Example part / family | Class | Notes |
|---|---|---|---|---|
**Split by assembly, per §1.1.** The body BOM is identical for every band; the
module BOM is what varies by band. **All ×3 quantities are unconditional** —
every band module is three-element and direction-finding capable, with no
single-element variant (§1.1.1). That triplication is the largest single cost
line in the module and it was missing from the earlier single-column BOM.

**A. Processing body — band-agnostic, identical for every deployment**

| # | Function | Example part / family | Class | Notes |
|---|---|---|---|---|
| B1 | RF transceiver | **4× Analog Devices ADRV9002** | Off-the-shelf | **Selected.** Two receivers each, eight chains total, forming two coherent groups (§0.0a, §3.3). 30 MHz–6 GHz, on-chip MCS, 150 dB/Hz, LVDS/CMOS SSI. Fallback is two **AD9361**s on one unified window — §5.5. |
| B1a | **Element splitters** | 3× 2-way Wilkinson divider, 806–869 MHz | Off-the-shelf | **New, §3.3.** Splits each element after its LNA so both coherent groups see all three elements. 3.2 dB, ~20 dB isolation, in-phase outputs. Placement after the LNA is what makes the loss cost 0.04 dB of noise figure. |
| B1b | **Calibration tone source** | Dual-tone synthesiser + combiner | Off-the-shelf | **Two tones — one per window (§3.3).** Combined and injected at the three element couplers in the module; a direct reference tap feeds the fourth receiver of each group. |
| B2 | LNA **×3** | Catalogue MMIC LNA, sub-1 dB NF | Catalogue | Sets sensitivity. All three on one board for correlated thermal drift — §3.1a. |
| B3 | **FPGA / SoC bridge** | Xilinx **Zynq**-class | Off-the-shelf silicon, integration work | **Required, not optional — §3.5.1.** Terminates the LVDS/CMOS SSI interfaces of all four transceivers, which no Jetson can accept, and hosts the channeliser. ADI supply the HDL. **No gigabit serial transceivers needed** — the ADRV9002's SSI is an ordinary source-synchronous interface, so this part stays mid-range. Pin count across four devices is the sizing driver. |
| B4 | Compute module | NVIDIA **Jetson Orin Nano / Orin NX** | Off-the-shelf | Demod + TSBK parsing + local AI fallback. |
| B5 | GNSS + disciplined oscillator | u-blox-class receiver + TCXO/OCXO | Catalogue | Timestamping; groundwork for multi-unit. |
| B6 | Secure element | Microchip ATECC608-class / NXP SE-class | Catalogue | Key storage. Also the natural home for the licence/authorisation state. |
| B7 | Ethernet PHY | Catalogue gigabit PHY | Catalogue | Link to ARC Edge. |
| B8 | Power supply | Custom regulation board | Custom, routine | Dedicated supply, per §6. Also feeds the module across the dock. |
| B9 | Calibration tone source | Catalogue synthesiser | Catalogue | Split three ways, injected module-side — §3.1a. |
| B10 | Dock connector (body half) | Blind-mate multi-coax + power + data | Catalogue | 3× RF, DC, digital bus, TX drive. |
| B11 | Carrier PCB | Custom | **Custom** | Integrates B1–B10. Where the RF engineering lives. **The three splitter legs feeding each coherent group must be length-matched within a group**; between groups they need not be, since the two groups never share a bearing computation (§0.0a). The SSI runs from four devices to B3 are source-synchronous and length-matched per bus. |

**B. Band module — housing and array. One per radio environment.**

| # | Function | Example part / family | Class | Notes |
|---|---|---|---|---|
| M1 | Antenna element **×3** | Half-wave sleeve dipole, folding | Custom, routine | Length and spacing scale with band — §5.1 feasibility table. |
| M2 | Band-pass filter **×3** | SAW or cavity, per band | Catalogue, per band | **The band-defining electrical part.** Matched set; phase response folds into the manifold — §3.1a. |
| M3 | Directional coupler **×3** | Catalogue | Catalogue | Calibration tone injection at the antenna port, so the dock sits inside the calibration loop — §3.1a. |
| M4 | Power amplifier | Catalogue LDMOS/GaN PA, ≤20 W ERP | Catalogue, per band | **Standard on every module.** Licence-gated in software — §3.4, §1.1.1. |
| M5 | T/R switch | Catalogue, per band | Catalogue | Standard, as M4. Sufficient for simplex interop channels. |
| M6 | IMU (orientation) | Bosch BNO-class / TDK ICM-class 9-axis | Catalogue | **Selected.** One, colocated with the inboard element at the centre-hinge junction — §5.8. |
| M7 | Magnetometer ×2 (gradiometer) | PNI RM3100-class dedicated 3-axis, matched pair | Catalogue | **Selected — §5.8.** One at each outboard lid corner. Storm-case modules only. Carries a per-unit cross-calibration step on every unit shipped — §1.1.1. |
| M8 | Module ID + manifold EEPROM | Catalogue I²C EEPROM | Catalogue | Serial number plus this module's measured array manifold — §3.1a. |
| M9 | Dock connector (module half) | Mating half of B10 | Catalogue | — |
| M10 | Carrier plate | G10/FR4, non-conductive | Custom, routine | Sets element geometry — §5.2.1. |
| M11 | Housing | Storm case with engineered hinge, or mast/vehicle mount at VHF | Custom, mechanical | The form factor that scales with band — §1.1, §5.1. |

**C. Duplexer pack — clip-in accessory, one per band.** Required only for
licensed trunk participation (§1.1.1).

| # | Function | Example part / family | Class | Notes |
|---|---|---|---|---|
| D1 | Duplexer | Catalogue cavity or ceramic, per band | Catalogue, per band | Isolates PA output from LNA inputs 45 MHz away, so the unit keeps tracking the control channel while transmitting. |
| D2 | Pack connector | Mating half into M4/M5 | Catalogue | Transmit path only — one element, no phase matching, so an extra connector here is cheap (§1.1.1). |
| D3 | Enclosure | Custom, routine | Custom, mechanical | Clips into the band module. |

---

## 5. Direction finding

**Note on how this section is framed.** It was written when direction finding was
an optional variant. §1.1.1 changed that: **every band module is three-element,
so the array is standard hardware**, and what remains outstanding is on the body
side — the third coherent receive chain (§5.5). Read "the DF variant" below as
"a unit whose body can sample all three elements." None of it is part of the
demonstrated product, which remains true.

**And one thing to say before any of the detail.** There is no direction-finding
*component*. The bill of materials contains no DF part beyond the antennas and
the orientation sensors — the angle extraction is a function on the general
CPU, using about a tenth of a percent of one core (§3.5.2). What direction
finding requires is a particular antenna arrangement and a coherent receiver,
and both are in the design for other reasons too.

The array brings two things with it:

- **A multi-element antenna array.** A single element has no inherent bearing
  sensitivity. Two elements give a bearing with a front-to-back ambiguity; a
  third element resolves it — subject to a geometric constraint set out in §5.1
  that an earlier revision of this document got wrong.
- **An IMU with magnetometer, mounted with the array.** The phase measurement is
  relative to the array's own frame. Converting it to a bearing relative to true
  north requires knowing where the array is pointing, with tilt compensation.
  Mounting the IMU **in the antenna assembly rather than in the base** means the
  system measures the array's actual orientation continuously, so lid-angle
  precision stops being a requirement.

### 5.1 Array geometry — the constraint that decides the enclosure

**The three elements must be non-collinear in the *horizontal* plane.** Not
merely non-collinear in space. This distinction is the difference between a
working array and one that cannot do the job it was added for, and an earlier
revision of this document specified the broken arrangement — a lid opening to
vertical, carrying a triangular array in a vertical plane.

Why that fails: if all three elements lie in a vertical plane, every baseline
vector between them has zero component along the horizontal axis perpendicular
to that plane. Azimuth then enters the phase measurement only through cos φ, and
cos(φ) equals cos(−φ). Two signals arriving from mirrored azimuths produce
**identical phase on every baseline.** Adding a fourth or tenth element in that
plane changes nothing — the ambiguity belongs to the plane, not to the element
count. Vertical separation buys elevation discrimination, which this application
has no use for.

**The corrected arrangement:** the lid opens to **180°, flat**, and three folding
**vertical dipoles** on its inner face deploy upright, forming a horizontal
triangle. Vertical elements also match P25's vertical polarisation.

| Parameter | Value | Why |
|---|---|---|
| Element spacing | **≈ λ/2 — 17.6 cm at 851 MHz** | Above λ/2 the phase measurement becomes ambiguous; well below it, phase differences shrink into the noise and accuracy collapses |
| Element type | **Half-wave sleeve dipole, ≈ 17 cm** | Balanced, so no ground plane is needed in the lid. Its lower arm carries the phase centre ≈ 8.5 cm above the element base |
| Array footprint | ≈ 18 × 15 cm | Fits a shallow-lidded storm case with room to spare |
| Usable bands | **700 / 800 MHz**; degraded at UHF | See below |

**Why dipoles rather than quarter-wave monopoles.** A monopole needs its ground
plane at the element base. Raising the elements to clear the body would mean
carrying a counterpoise up with each one — three small, pattern-degrading ground
planes on stalks. A dipole has no such dependency, and in the sleeve
configuration its lower arm *is* the standoff. This reversed an earlier
recommendation in favour of monopoles, which was correct only for a flat
conductive lid with elements sitting directly on it.

**Band limitation, which must not be blurred.** Sized for λ/2 at 800 MHz, the
array remains unambiguous at 700 MHz and works with reduced accuracy at UHF
(≈ 0.27λ). It is **unusable at VHF**, where λ/2 is 97 cm — no case lid will ever
hold that. The base receive-only unit is genuinely all-band (§3.3). **The DF
configuration is a 700/800 MHz capability.**

##### Per-band feasibility — the table to have ready

The array is the only part of the product whose size is set by the band, and it
is therefore the only reason the form factor changes. At λ/2 spacing with
half-wave elements:

| Band | λ/2 spacing | Element | Triangle footprint | Housing |
|---|---|---|---|---|
| **800 MHz** (851) | 17.6 cm | 16.6 cm | 18 × 15 cm | Fits a 1500-class case lid with corner room to spare |
| **700 MHz** (770) | 19.5 cm | 18.3 cm | 20 × 17 cm | Same case |
| **UHF** (450) | 33.3 cm | 31 cm | 33 × 29 cm | **Needs a 1600-class case. Larger, still genuinely portable** |
| **VHF** (155) | 96.7 cm | 91 cm | 97 × 84 cm | **No case. Mast, tripod, or vehicle mount** |

[Case interior dimensions are approximate and unverified; the fit conclusions are
Inferred, not measured.]

**Three things to say correctly about this table.**

**It is not a binary between full DF and no DF.** Spacing *below* λ/2 creates no
ambiguity — ambiguity comes from spacing *above* it — it only costs accuracy, and
predictably: bearing error scales roughly as λ/d. UHF in a smaller case at 0.26λ
gives about 1.9× the bearing error, which may still answer "which wing of the
building." That is a product decision with a number attached rather than a wall.

**At VHF the binding constraint is element length, not spacing.** A 1650-class
case could hold a 65 cm baseline, which is 0.34λ at 155 MHz — degraded but
workable. The 91 cm element is what will not fit. Shortened or telescoping
elements exist, but they attack precisely the property this array depends on:
three of them must match *each other*, and a telescoping joint is a variable
where repeatability has been demanded everywhere else. Worth measuring rather
than arguing. [Assumption]

**Only direction finding is band-constrained.** The base receive-only
monitoring — which is the demonstrated product — works at VHF with a single
ordinary whip and no difficulty whatever. In a customer conversation, "our
product is band-limited" and "one optional feature is band-limited" land very
differently, and only the second is true.

**Triangle orientation in the lid [design decision].** The triangle is placed
with **two elements outboard, at the far edge of the lid, and one inboard near
the centre hinge** — apex toward the body rather than away from it. Two
consequences, both favourable, and neither accidental:

- Combined with the deployment orientation rule of §5.6, **only one element sits
  in the case body's shadowed sector.** The opposite orientation puts two there.
- The two outboard feed runs converge under the inboard element and exit
  together through the centre hinge, so they are **mirror images and naturally
  matched in electrical length** — which is exactly what the ≈ 6 mm phase-match
  constraint of §5.3 requires. Only the inboard feed differs, and it is the
  short one, so matching is done by meandering it longer. This is the same
  equal-length routing exercise as any matched digital bus.

This orientation is also what makes the sensor placement of §5.8 B.2 work, since
it puts the two outboard lid corners at the quiet end of the wiring.

### 5.2 Enclosure mechanics

Four decisions, each with a consequence worth understanding.

**A shallow lid, and the fold-hinge sets how shallow.** Opened flat, the lid's
*rim* lands exactly on the body's top plane — rotating 180° about a hinge axis
lying in the mating plane maps that plane onto itself. The lid's *interior floor*
is recessed from that rim by the lid depth, so it lands one lid-depth **below**
the body rim. Open, the lid is an upward-facing shallow tray: floor low, rim
level with the top of the gear.

The design turns that into an advantage rather than a problem:

1. **Lid depth is set by the antenna fold-hinge barrel diameter**, plus minimal
   clearance — nothing else needs to fit, since the elements stow lying flat and
   are thinner than the hinge.
2. **The hinge barrel is chosen to largely fill that depth.** Its top therefore
   sits close to the lid rim.
3. **The erected sleeve starts at the top of the barrel** — so each element's
   base lands at approximately the rim plane, which is the top plane of the whole
   open system.

The result is that **no risers are required.** A separate standoff would have
been another dielectric object in the near field, another tolerance, and more
cantilever load; the hinge does the lifting for free because it had to be there
anyway.

Illustratively, with a hinge barrel and hence a lid depth on the order of 25 mm
over an 11 cm body: element bases at ≈ 11 cm, and a 17 cm sleeve dipole puts its
electrical centre at ≈ 19.5 cm — roughly **8.5 cm clear of the body**, with only
the lower sleeve arm alongside it. [Assumption — depends on the final hinge and
case selected; check against real parts]

**A self-bearing lid, no kickstand.** The hinge carries the cantilevered lid.
Static strength is not the issue — the lid holds only antennas, an IMU, a carrier
plate and light circuitry. **Stiffness is, and specifically torsional
stiffness**, for a reason that is easy to miss: uniform bending tilts the array
plane, which the IMU observes and the solver corrects for, whereas **twist
deforms the triangle itself in a way the IMU cannot see.** Mitigation: mount the
three elements on a **rigid carrier plate**, so the array's internal geometry is
set by the plate rather than by the lid moulding, and lid flex only tilts an
assembly whose shape is already fixed.

**An engineered hinge.** Stock storm cases open to roughly 100–110°. This one
needs a hard stop at 180°, structural capacity for the cantilever, and it carries
the RF and data feeds — hinged connectors to the body are being engineered
regardless.

**Lid-angle precision is not a requirement**, which is the strongest argument for
this arrangement. The horizontal projection of the triangle compresses by
cos(tilt): 0.985 at 10° off flat, 0.94 at 20°. The IMU reports the actual plane
and the solver corrects. Compare the vertical arrangement, where the projection
compresses to zero and the array fails outright. **This design degrades
gracefully; the one it replaces failed catastrophically.**

**How much twist actually matters — the number, so nobody over-engineers to an
unbounded threat.** A sleeve dipole's phase centre sits ≈ 8.5 cm above its
mounting point, so an element tilt θ displaces that phase centre laterally by
≈ 8.5 cm × sin θ. The budget is about 1 cm of *relative* displacement between
elements before bearing error reaches 3°, which corresponds to roughly **6.7° of
differential tilt across the ~18 cm array footprint.**

That is a lot of twist for a stiff tray spanning a fraction of the lid. The
carrier plate is therefore **cheap insurance rather than a critical fix**, and it
earns its place mostly on the other grounds below. Per-element folding needs the
same order of tolerance — roughly 1 cm of position error — and a detented hinge
delivers a millimetre.

**Why the carrier plate is still obviously right**, given that the threat it
removes is modest:

- It sets element spacing as a **manufacturing datum** — needed to ~1 cm, an
  etched or machined plate gives tenths of a millimetre.
- It makes the array a **bench-characterisable sub-assembly** (§5.3), which is
  what allows the body's scattering to be calibrated out at all.
- Bonded into a shallow lid it **raises the lid's own bending stiffness**, which
  serves the self-bearing, no-kickstand decision rather than merely loading it.

**Hinge repeatability is a specification, not a hope.** A repeatable error is not
an error — it is a calibration coefficient. The requirement is therefore that the
three fold-hinges be **identical parts, identically oriented, to tight
tolerance**. A consistent perturbation is absorbed by the array characterisation
in §5.3; an inconsistent one becomes an unexplained per-unit bearing bias that
cannot be calibrated out.

#### 5.2.1 Material selection for the lid assembly

Because the elements are sleeve dipoles, **nothing in the lid is part of the
antenna** — no ground plane is wanted or needed. Every structural item in the
lid must therefore be as electrically neutral as practical.

**Carrier plate: G10 / FR4-class glass-reinforced epoxy.** Dielectric,
dimensionally stable, stiff, cheap, available as sheet. **Not carbon fibre** —
it is the obvious choice for a light stiff plate and it is electrically
conductive, so it would sit directly beneath three dipoles and wreck their
patterns. Feed with small-diameter coax rather than ground-referenced microstrip,
so the plate stays RF-neutral instead of becoming an accidental ground plane
under balanced antennas.

**The specification that matters most for any dielectric in the near field is
moisture uptake, not loss tangent.** A material that absorbs water changes
permittivity with humidity, which changes each element's near-field environment,
which drifts phase — and it drifts *differently per element* depending on
exposure. That is a slow, weather-dependent bearing error that would be very
unpleasant to diagnose in the field.

| Material | Water absorption | Verdict |
|---|---|---|
| PTFE | ~0.01% | Best electrically; too soft and creeps — not structural |
| **G10 / FR4** | ~0.1–0.25% | **Recommended.** Good balance, stiff, cheap |
| PEEK | ~0.1–0.5% | Upgrade path — better mechanically and thermally, pricier |
| Polycarbonate | ~0.15% | Acceptable; UV-yellows and embrittles |
| Nylon / acetal | 1–3% | **Disqualifying** — the obvious cheap machinable choice, and the wrong one |
| Carbon fibre | — | **Conductive. Never.** |

**UV:** this is field equipment in Texas sun. Bare G10 chalks as the resin
degrades. Specify a UV-stable coating on exposed dielectric — trivial at design
time, tedious to retrofit.

**On conductors near the elements.** The fold-hinges will be metal; a polymer
living hinge will not hold tolerance or survive the cycle count. That is
acceptable precisely because they are fixed, identical and symmetric, and
therefore calibratable (§5.3). Had risers been required, they would have had to
be dielectric: a sleeve dipole's choke is only well-behaved near its design
frequency, and across the 700–870 MHz range the array must cover, real current
would flow onto a metal standoff, turning it into a parasitic radiator. Three
parasitics that differ slightly is a bearing error, not merely a gain loss.

### 5.3 Calibration — feed phase and the array manifold

Three coaxial runs cross the hinge, and interferometry measures phase
differences between them. **Differential drift between those cables is
indistinguishable from a change in bearing.**

The budget: at a λ/2 baseline near broadside, roughly 3° of phase error produces
1° of bearing error. For a 3° bearing target that is about 9° of phase, which at
851 MHz in coax of 0.7 velocity factor is **about 6 mm of electrical length.**

Two mitigations, both standard practice:

- **Route the cables along the hinge axis**, so articulation twists them rather
  than bending them. Bending is what changes electrical length.
- **Inject a calibration tone** into all three chains and measure the
  differential phase through the full path, nulling residual differences in
  software. This is ordinary in commercial DF equipment and it also addresses the
  calibration problem in the switched-array option of §5.5.

**The injection point is now decided, and the dock decided it.** Inject on the
**array side**, at the antenna ports through small couplers (§3.1a). This was
briefly an open trade against noise figure — a coupler ahead of the LNA costs
sensitivity — and the modular architecture settles it: only array-side injection
puts the **dock connectors inside the calibration loop**, which is what turns
connector phase repeatability from a specification nobody can hold in the field
into a measurement taken at every power-up. The noise-figure cost is small in
relative terms because the filter already sits ahead of the LNA and already
dominates.

[Inferred — standard DF engineering practice, not verified against a specific
cable or hinge design.]

#### 5.3.1 The case body becomes part of the array

Opening the lid flat places the case body beside the array rather than beneath
it. Earlier revisions of this document treated that purely as a problem to be
mitigated with clearance. **That framing was wrong, and the correct one is more
useful.**

The body's position relative to the array is **fixed by the enclosure** — same
case, same hinge, same geometry on every deployment. Its scattering is therefore
not interference but a **repeatable perturbation in the array's own reference
frame.**

That is handled the way direction-finding systems have always handled nearby
structure: measure the **array manifold** — each element's complex response
versus angle, with the body attached and the lid deployed — on an antenna range,
and use the measured manifold in the solver rather than assuming ideal elements.
The scattering is absorbed into the calibration instead of being fought.

The same logic covers the fold-hinges, the carrier plate and the feed routing.
Anything rigidly and repeatably attached is part of the antenna, and gets
characterised once.

**What this costs, stated honestly:** range time, per band, as a one-time
per-design expense rather than per-unit. It is only valid while manufacturing
consistency holds, which is what promotes the hinge-symmetry tolerance in §5.2
from good practice to a hard requirement. [Inferred — standard DF practice; no
measurement has been performed for this design, and no residual bearing-error
figure should be quoted until one has.]

### 5.4 The receive-chain budget

This is the constraint that decides the DF configuration, and it is worth setting
out plainly because it is the first thing a radio engineer will ask about.

**A distinction worth stating plainly, because it is easy to conflate:** the
array is **three elements** — that is settled, and it is what makes the geometry
in §5.1 unambiguous. The open question is not how many antennas to fit in the
lid, but **how to sample all three coherently**, which is a receiver question.

The AD9361 offers **two coherent receive chains, locked to a common oscillator**.
For direction finding that shared oscillator is an asset rather than a limitation:
phase interferometry requires the elements to be sampled against a common phase
reference, which is precisely what a shared LO provides.

It also means the array and the monitoring function are **not competing for
receive chains in the way they first appear to.** Monitoring the trunk and the
talkaround channel is a bandwidth problem solved by wideband capture on one chain
(§3.3.1), not a channel-count problem. But an array element needs its own chain,
so on a single AD9361 a DF-capable unit has **two elements' worth of coherent
receive, and those two chains are then committed to the array.**

**A two-element array gives a bearing with a front-to-back ambiguity.** A third,
non-collinear element resolves it — and a third element needs a third coherent
chain, which one AD9361 does not have.

### 5.5 The third chain — selected, with a fallback

**Resolved 2026-07-31, and then re-resolved twice the same day.** The question as
originally posed — *how do we get a third coherent chain* — turned out to be the
wrong question. The right one was **which band the chains should be pointed at**,
and the answer changed the architecture (§3.3).

**Selected:** **four ADRV9002s** forming two coherent groups of three chains
each — one on the uplink where handsets transmit, one on the downlink. Element
signals are split after the LNA so both groups see all three elements.

**Fallback:** two AD9361s covering handset uplink and talkaround in **one**
unified 47 MHz window. Genuinely viable, and the route to take if four devices
prove unaffordable in power, cost or board area. Its cost is that a single window
means a single gain control, so a nearby uplink transmission also desensitises
the downlink control channel (§3.3).

**Not pursued:** staying at two elements; the RF switch matrix; the ADRV9026,
which cannot reach VHF or UHF (§7.4 item J).

| Option | What it costs |
|---|---|
| **Stay at two elements** | Simplest, works today, no new parts. Keeps the front-back ambiguity, which must then be resolved some other way — by moving the unit and taking a second bearing, or by discarding the candidate that falls behind a known obstruction. |
| **Add a second AD9361** | Gives four coherent chains, more than enough. Requires multi-chip synchronisation: a shared reference clock and a shared LO distributed between devices, plus per-path calibration. Analog Devices documents this, so it is established rather than novel, but it is real engineering and it adds cost, board area and power. **Now answers three open questions with one part:** the third coherent chain; *uplink* coverage (§3.3.2), since a separate device tunes independently; and the fact that §1.1.1 ships three-element modules to every customer, so the body needs to use them. **This is the selected fallback**, retained because it is genuinely viable and because a single-source dependency on one transceiver family is worth having an answer to. |
| **RF switch matrix ahead of two chains** | Cheapest in parts. Time-division sampling across three elements rather than true instantaneous capture, which complicates calibration and is weak on short or fading signals. **More viable here than for most DF applications**, because a P25 voice transmission lasts seconds — enormous compared with switching times. The standard arrangement keeps one chain permanently on a reference element and switches the second among the others, so relative phase always has a common reference. |
| **A different RFIC with 3+ coherent receive chains** | **Considered and rejected — the ADRV9026.** Four coherent receivers on one die, but it tunes only to 650 MHz, which puts VHF and UHF below its floor (§7.4 item J), and its four receivers share a synthesiser so its spare chain cannot reach the uplink. |
| **Four ADRV9002s, split element feeds** | **SELECTED — §3.3.** Two coherent groups of three chains, independently tuned and independently gain-controlled, plus a calibration reference channel each. Costs four devices, three splitters and a second cal tone; buys VHF/UHF coverage, DF on handsets *and* talkaround, and the tower as a permanent reference. |

#### 5.5.1 Why a third chain needs another chip at all

**It is a property of the part, not a defect in it.** The AD9361 carries exactly
two receive signal paths on its die — mixer, filters and converter, twice. It was
built for 2×2 MIMO, which is the dominant configuration in the small-cell and
software-radio markets it was designed for. There is no configuration, register
setting or mode that produces a third. [Confirmed — Analog Devices datasheet.]

So the choices are to synchronise two of them, to time-share the two you have, or
to use a part with more.

##### What "synchronise two chips" actually requires

Two AD9361s do not become coherent by being on the same board. Three things are
needed:

1. **A shared reference clock.** Both devices' synthesisers must run from one
   oscillator, or their sample clocks drift apart and the phase relationship we
   are measuring dissolves.
2. **A shared or synchronised local oscillator.** The part supports an external
   LO input, so one source can drive both — the cleaner arrangement. Using each
   chip's internal synthesiser locked to a common reference also works, but two
   PLLs locking independently settle at an **arbitrary and unknown phase offset**
   from each other.
3. **A multi-chip synchronisation procedure** to align the digital clock dividers
   and baseband filter states. Analog Devices document this, so it is established
   practice rather than novel work.

**The residual problem is item 2's arbitrary offset, and we already own the
solution.** A fixed but unknown phase difference between chip 1 and chip 2 is
exactly the same shape of problem as a dock connector's phase variation, and the
injected calibration tone of §3.1a measures and nulls it identically — it is
injected at the antennas and observed through all three chains, so anything
common to a chain gets absorbed whether it lives in a connector or in a
synthesiser.

**And the architecture helps in a way that was not designed for it.** The offset
must be re-established whenever the PLLs re-lock, which happens on retune. But
because we use wideband capture with digital channelisation (§3.3.1), the analog
LO **rarely moves** — following a voice grant is a digital down-conversion inside
the existing slice, not a retune. Retunes happen when changing band or slice,
which is rare. The choice made for multi-channel monitoring turns out to make
multi-chip coherence substantially easier.

##### The option that was chosen

§5.5's "a different RFIC with 3+ coherent receive chains" was written without a
candidate. Two were found. The **ADRV9026** has four receivers on one die but
tunes only to 650 MHz and shares one synthesiser across them — rejected (§7.4
item J). The **ADRV9002** has two receivers, **two independent synthesisers**, a
30 MHz floor, and a documented **multichip synchronisation mechanism that aligns
LO and baseband clock phase both within and across devices** — which is precisely
the property a phase interferometer needs, provided as a feature rather than
assembled by hand. Four of them is the selected answer (§3.3).
[Confirmed — Analog Devices product documentation.]

The costs are real and should not be glossed. It uses a **JESD204B/C** serial
interface rather than the AD9361's parallel LVDS, which is a different and more
demanding FPGA integration. It is aimed at cellular infrastructure, so power,
cost and board complexity are all likely higher than a part chosen for portable
software radio. And it abandons a part that is otherwise ideal on tuning range
and availability.

**The comparison was decided on reliability rather than on a completed costing.**
The deciding argument is that a multi-chip synchronisation which half-succeeds
yields a *wrong bearing rather than a missing one* — the silent-confident-error
class this design works throughout to eliminate. Removing a mechanism that can
produce one is worth more than the engineering time saved.

**What was not established, and should be before committing silicon:** power for
both candidates at our actual few-megahertz capture bandwidth rather than at the
datasheet's 200 MHz, and the delta in FPGA cost and power from needing gigabit
serial transceivers. Neither is expected to reverse the decision now that §7 item
G has resolved the power envelope, but neither has been measured. [Assumption]

**A note on the switching option, since it is the one most likely to be
dismissed too quickly — with a correction to how this document previously argued
it.** The usual objection is that time-division sampling cannot do instantaneous
angle-of-arrival, which is decisive for pulsed or frequency-hopping signals.

An earlier revision answered that objection by saying the transmissions we care
about last seconds. **That is true of voice and false of signalling.** A P25
inbound control-channel request is on the order of **20–35 ms** (§3.3.2), and a
Phase 2 TDMA control channel uses inbound slots reported at 1.778 ms — three
orders of magnitude shorter than the voice case, and precisely the signal
§3.3.2's Case A depends on.

The switching option survives that correction, but on a better argument: RF
switches settle in **microseconds**, so even a 20 ms burst permits many complete
three-element round-robins. The design detail that makes it work is the one
already specified — keeping one chain permanently on a reference element, so
each switched sample is differenced against a simultaneous reference and the
signal's own phase evolution between samples cancels.

The real risks are calibration drift and multipath fading changing between
switch intervals. **Transmission length is not the objection, but the previous
statement of why was wrong, and would not have survived a question about
signalling bursts.**

Resolving this properly needs measurement, not argument, and it is out of scope
for a conceptual design. [Assumption]

### 5.6 Deployment orientation — an operational rule

**Place the unit with the case body behind you and the open lid facing the area
of operations.**

The body sits on one side of the array. Signals arriving across it are shadowed
and scattered; signals arriving over the open lid have a clear path. Even with
the manifold calibration of §5.3.1 absorbing the fixed geometry, a calibrated
degraded sector is still a degraded sector — calibration corrects a known bias,
it does not restore signal that was blocked.

Two things to be precise about when this is presented:

**It is about signal quality, not about knowing where the unit is pointed.** The
magnetometer gives absolute orientation whichever way the case faces. Nobody
needs to aim this for the bearings to be referenced to true north, and someone
will assume otherwise.

**It does not exist to resolve an ambiguity.** With three elements sampled
coherently there is no azimuthal ambiguity to resolve (§5.1). The rule would take
on that second job only in the degraded two-channel fallback of §5.5, where a
single baseline reintroduces a mirror ambiguity and doctrine could be used to
choose between candidates — and in that case the solver should **report both
candidates and mark which one doctrine favours**, never silently pick, because an
officer who circles behind the command post would otherwise be mirrored into the
wrong hemisphere and confidently mis-located.

The mathematics, working code, and a test are in `df/` as a separate artifact.

### 5.7 The bearing error budget

A bearing error is not one quantity. It has five contributors, and **how they
behave matters more than how large they are**, because the two that dominate in
realistic conditions are the two that calibration cannot touch.

| Source | Behaviour | Removed by calibration? | Plausible residual |
|---|---|---|---|
| Thermal / SNR phase noise | Random, zero-mean | No, but it averages down over a transmission lasting seconds | Under 1° at good SNR; grows as the signal weakens |
| Array manifold — element positions, feed-line phase, mutual coupling, case-body scattering | Fixed and repeatable | **Yes. This is precisely what §5.3.1 exists to do** | ~1–2° |
| Deployment geometry — hinge repeatability, lid angle, twist | Varies per setup, but is measurable *in situ* | Partly — the IMU measures it rather than calibration removing it | ~1–2° |
| Magnetic heading reference | Systematic bias on every bearing from that unit | **No.** The disturbance is supplied by the deployment site, not the hardware | 2° in a clean field; 10° or worse beside a vehicle | 
| Multipath | Scene-dependent, not zero-mean, not stationary | **No** | A few degrees in the open; tens of degrees in dense urban or indoor scenes |

All residual figures are [Assumption] pending measurement. They are stated to
show the *shape* of the budget, not to be quoted as performance.

**What a degree is worth.** Cross-range position error is approximately
range × tan(bearing error):

| | 1° | 5° | 15° |
|---|---|---|---|
| **at 300 m** | 5 m | 26 m | 80 m |
| **at 1 km** | 17 m | 87 m | 268 m |

The operational question this feature answers is *which wing of the building* —
call that 30–50 m. At a few hundred metres of standoff, the **total** must stay
under roughly 5–8°. The first three rows of the budget fit inside that
comfortably. The last two can each consume it entirely on a bad day.

**The consequence for how this is presented.** Rows one to three are the part
the engineering controls, and they are therefore *not* what a field trial will
complain about. Anyone who defends this design by describing array calibration
is answering about the small terms.

#### Why multipath is the dangerous one

Multipath does not present as noise. A specular reflection off a glass or
concrete face arrives with **excellent signal-to-noise ratio and stable phase**.
The array measures it correctly, reports it confidently, and points at the wall
instead of at the officer. It is not uncertainty — it is a wrong answer
delivered with conviction, and no amount of hardware characterisation touches
it, because the perturbation is not in the hardware.

This has a direct and unwelcome implication for weighting. The solver in `df/`
weights each bearing by `1/σ²`, and that weighting earns its keep only if the
declared σ reflects something other than signal strength. **A quality metric
derived from SNR will actively favour the reflected path.**

#### What two stations can and cannot do

**Two stations cannot detect this failure at all.** Two non-parallel rays always
intersect, so the residual is structurally zero — a property of the geometry,
not evidence of agreement. A corrupted bearing produces a perfectly
self-consistent fix at the wrong place. The solver reports two-station fixes
without a residual claim for exactly this reason, so that silence is not read as
corroboration.

**Three stations detect it but do not reliably identify the culprit.** Three
rays that do not meet form a small triangle, and a large triangle proves that
someone is wrong. But removing any one of the three leaves a pair that
intersects exactly, so three mutually incompatible explanations each fit their
own evidence perfectly. Residual alone cannot rank them. Identifying *which*
bearing is bad needs a fourth station, or a per-bearing quality metric that is
genuinely independent of signal strength, or outside knowledge — the candidate
fix landing behind a station, or inside a structure known to be clear.

#### The strongest mitigation available to us: a transmitter whose bearing we already know

**Added 2026-07-31 with the two-group architecture of §3.3.** The downlink
coherent group is tuned to the tower. A tower is at a **surveyed, fixed, known
position** and transmits more or less continuously, so the downlink group is
permanently measuring a bearing whose correct answer is known in advance.

**That converts most of this error budget from a specification into a
measurement.** Every term in the table above except the target's own multipath is
common to the reference path, so a discrepancy between measured and expected
tower bearing is a *live readout of the accumulated error* — manifold, feed
phase, connectors, splitters, MCS alignment and magnetometer heading together.

| Error term | Visible in the tower bearing? |
|---|---|
| Array manifold and feed phase | **Yes** — as a stable offset |
| Magnetometer bias (§5.8) | **Yes** — as a stable offset |
| MCS misalignment | **Yes** — as a step at a retune |
| Multipath *on the tower path* | **Yes** — as wander while stationary |
| Multipath *on the target path* | **No.** Independent geometry |
| Thermal/SNR noise on the target | **No** |

**What it does not do**, and this is the limit to state: it cannot correct a
bearing to a *handset*, because the handset's multipath and SNR are its own. It
bounds and monitors the systematic terms, which is a different and lesser claim
than fixing the random ones. It is also measured by the *downlink* group, so it
validates the uplink group only through what the two share — the antenna array,
the LNAs, the splitters and the manifold, but not the uplink group's own PLLs or
gain control.

**And one geometric caveat:** a tower lying near the array's front-back ambiguity
axis is a weaker reference than one abeam. [Inferred]

#### One mitigation this product is unusually well placed to use

**Bearing stability across the transmission.** When a direct path and a
reflection arrive together, the interferometer measures their phase-coherent
sum, and that sum shifts as anything in the scene moves. A direct-path bearing
holds steady; a corrupted one wanders.

P25 voice transmissions run for seconds — thousands of symbol periods, and an
enormous observation window by direction-finding standards. That makes bearing
variance over the transmission a usable quality metric, and critically **it is
uncorrelated with signal strength**, which is the specific weakness identified
above. This is a genuine advantage of a product built around monitoring voice
traffic rather than short data bursts. [Inferred — the mechanism is standard, the
achievable discrimination is unmeasured.]

#### The multipath upgrade path is open, and that is worth knowing

The discussion above ends without a way forward, which understates the position.
**Resolving a reflection from the direct path is what spectral methods exist
for** — MUSIC and its relatives compute power as a function of angle and return a
*spectrum with several peaks*, one per significant arrival, rather than a single
answer. That is exactly the menu of candidates that would let a reflection be
identified rather than averaged in.

We do not implement it, and it is not free: with only three elements the number
of arrivals that can be resolved is very small, and it needs far more careful
calibration than a simple phase comparison. But the architectural point stands:
**every one of those methods consumes the spatial covariance matrix R and nothing
else from upstream** (§0.1), and stage 10 already produces R. Adding a spectral
method later changes stage 10's *consumers* only. Stages 1 through 9 would not
move.

So the honest framing when this is challenged is not "multipath is a limitation
we accept," but "multipath is the dominant error term, our current method reports
it rather than resolving it, and the signal chain already produces the input a
resolving method would need." [Inferred — the applicability of MUSIC to a
three-element array in this environment is unmeasured.]

**Nothing in this section should be quoted as a performance figure.** The
budget's structure is defensible; its numbers require a measurement campaign
with a reference emitter at known positions across representative environments.

### 5.8 Magnetic heading integrity — *hardware selected, validation open*

> **Status: the hardware is now DECIDED; the methods are not all validated.**
> [Design decision, 2026-07-31.] Option **B below is selected** — two dedicated
> magnetometers at the outboard lid corners, with the IMU colocated with the
> inboard element at the centre-hinge junction — for the storm-case band modules
> (700/800 and UHF). Options **A and C remain recommended software layers**;
> neither is implemented. Option **D is not pursued**.
>
> **What remains genuinely open is validation, not selection:** nothing has been
> costed or tested, and whether the gradient supports *correcting* heading rather
> than merely flagging it is unresolved (B.5).
>
> **The VHF module is explicitly out of scope.** Its array is a mast or vehicle
> mount rather than a lid (§5.1), so none of the corner-placement geometry below
> applies to it. It is an as-yet-undesigned configuration, not a designed one.

> **A second, independent check on heading arrived with §3.3, and it partly
> changes this problem.** The downlink coherent group continuously measures a
> bearing to the tower, whose true bearing is known. **A magnetometer bias shows
> up directly as a constant offset in that measurement** (§5.7), which means
> heading error becomes observable in the field rather than only on a calibration
> bench. Two caveats keep it from closing B.5: the check is only available while
> a tower is in view, which is precisely *not* the case in the trunk-down
> scenarios the product exists for; and it measures the *sum* of heading error
> and array error, so separating the two still needs the gradiometer below.
> Complementary, not a replacement.

Two distinct problems hide behind "the magnetometer is disturbed," and only one
of them is hard.

**Distortion from the unit's own materials** — the hinges, the battery, the
power amplifier heatsink, the case latches — is the classic hard-iron and
soft-iron problem. It is fixed relative to the sensor, and it is removed by a
standard rotation calibration performed once on the bench. This is
well-trodden, solved engineering and is not the concern. [Confirmed as standard
practice.]

**Distortion from the deployment site** — a parked fire truck, a steel roll-up
door, rebar in the pad the unit is standing on — is not fixed relative to the
sensor, is different at every incident, and cannot be calibrated in advance
because the disturbing mass cannot be rotated away. This is the open problem.

#### Candidate approaches

**A. Field-magnitude and dip-angle gating — *detection, no new hardware*.**
The World Magnetic Model gives the expected field magnitude and inclination for
any position and date, and the unit already knows both: GNSS supplies position
and time, and the IMU supplies the local horizontal against which inclination is
measured. If the measured magnitude or dip departs from the prediction beyond a
threshold, the field is disturbed and the heading is untrustworthy.

This is established practice in MEMS attitude-and-heading systems and costs
nothing but software. Its limitation must be stated honestly: **it detects that
the field is wrong, not by how many degrees the heading is wrong.** A
disturbance roughly parallel to the Earth's field changes magnitude
substantially while barely moving the heading; one perpendicular to it does the
reverse. It is a good screen for suppressing a bad fix. It is not an error
estimate.

**B. Magnetic gradiometry — SELECTED. *Detection, and possibly correction*.** The Earth's
field is uniform across the span of a case. A local disturbing mass produces a
dipole-like field falling off as roughly 1/r³. So **any difference between two
magnetometers a known distance apart is entirely local disturbance** — the
Earth's contribution subtracts out.

The sensitivity scales the right way. For a disturbing mass at range *r* and a
sensor baseline *d*, the fractional difference between the two readings is
approximately 3*d*/*r*. A vehicle 3 m away, sensed across a 35 cm baseline,
shows about a third of its disturbance as a gradient. A steel structure 30 m
away produces a far weaker gradient, but it also produces a far weaker heading
error, so the method goes quiet exactly when it should.

**This is now the selected configuration** for the storm-case band modules
(700/800 and UHF). Nothing below has been costed or tested, and B.5 remains
unresolved, but the arrangement itself is settled rather than proposed.

##### B.1 Three parts, not two

The recommended configuration is **one IMU plus two matched dedicated
magnetometers**, not a second 9-axis part reused as one leg of the gradiometer.
Two reasons, and neither is price.

**Mismatch is the error budget.** A gradiometer measures a difference, so its
noise floor is set by how well the two sensors agree with each other, not by
either one's absolute accuracy. Against the Earth's ~48 µT in Texas:

| Mismatch between the two sensors | Phantom gradient produced |
|---|---|
| 1% scale-factor difference | ~0.5 µT |
| 1° axis misalignment | ~0.84 µT |

Against a real signal of order 1.75 µT in the worked example above, **a single
degree of relative mounting misalignment produces roughly half the signal being
hunted for, as pure artifact.** Two identical parts from the same reel share
scale factors and temperature coefficients and drift together, and correlated
drift subtracts out in the differential. An IMU's internal magnetometer paired
against a different part guarantees the opposite.

**Sensor class matters.** The magnetometer inside a consumer 9-axis fusion part
is built to point an arrow at north to a couple of degrees. Dedicated
magnetometer parts — PNI RM3100-class magneto-inductive, for example — offer
noise floors in the tens of nanotesla with better temperature stability. When
the method depends on resolving ~1.75 µT confidently, that gap decides whether
it works at all. [Inferred from datasheet-class figures; no part is selected.]

The IMU's own magnetometer is retained as a coarse cross-check. Net cost of the
recommendation over the original two-part sketch is one additional few-dollar
component.

**This depends on the rigid carrier plate.** A bare magnetometer reports in its
own body frame and does not know its orientation. That is acceptable *only*
because §5.2.1's rigid dielectric plate makes the transform between sensors
fixed and calibratable. If the plate were not trusted, the second sensor would
have to be a full IMU — which is also the part that would address lid twist. The
two options are coupled to the rigidity assumption, and the plate decision, taken
for the antenna triangle, is what makes the cheaper sensor viable here.

##### B.2 Placement — selected

**Both magnetometers at the two outboard lid corners**, each on a short stub
joining the routing of the nearer outboard antenna element. **The IMU colocated
with the inboard element at the centre-hinge junction**, where the wiring already
converges. [Design decision, 2026-07-31.]

**The baseline is set by the lid, not by the array.** The antenna triangle is
roughly 18 × 15 cm and the lid is materially larger, so the sensors sit outside
the triangle at the lid's own corners. Plausible baseline is 30–40 cm rather
than the array's 17.6 cm — better than the array geometry alone would give, and
free. [Assumption — depends on final case selection.]

**Symmetry is worth more than maximum baseline.** A diagonal placement (one
outboard, one inboard) would be longer still, and should nonetheless be
rejected. Mirror-symmetric outboard placement makes cable lengths, self-field
contributions, thermal environment, and RF manifold perturbation **matched
between the two sensors** — and in a differential measurement, matched error is
common-mode and subtracts out. Roughly 20% more baseline does not buy back what
breaking the symmetry costs. It also preserves the hinge-and-feed symmetry §5.3.1
already requires as a hard condition of manifold calibration.

**Each magnetometer sits at the end of a stub, so no through-traffic passes it.**
All aggregate bus and supply current runs between the centre junction and the
trunk, at the opposite end of the lid. Each sensor is exposed only to its own
supply current, not the system's.

**The electrically busiest location gets the sensor that does not care.** All
routing converges at the centre-hinge junction, which is the worst magnetic
environment in the lid — and that is where the IMU goes. Its job is orientation,
determined by accelerometer and gyroscope, which are indifferent to magnetic
fields. Its magnetometer is only a coarse cross-check and can afford to sit
there. The layout sorts itself.

**Single service hinge.** Of the three lid hinges, only the centre one carries
signal; the outer two are purely structural. Every hinge carrying signal needs
flex-life engineering, strain relief and IP67 sealing, so concentrating that in
one place is worth more than any routing convenience a second one would buy.

##### B.3 What actually interferes, and what does not

Current in a wire produces a magnetic field, and a magnetometer measures
magnetic fields. From Ampère's law:

| Current | Distance | Field at sensor |
|---|---|---|
| 1 mA | 1 cm | 0.02 µT |
| 10 mA | 5 mm | 0.4 µT |

**The in-band aggressor is DC and low-frequency supply current, not the digital
signalling and emphatically not the RF.** A magnetometer's analog bandwidth is
of order hertz to kilohertz. A 400 kHz I²C bus is well above it and an 851 MHz
antenna feed is astronomically above it, so both are largely rejected by the
sensor's own response. This sharpens the mitigation priority: **supply routing
matters, data routing matters much less, and the antenna feeds running alongside
are a non-issue.**

Mitigations, in order:

- Run each sensor's supply and return as a **tight twisted or differential pair**
  so the two fields cancel. This is the whole ballgame.
- Prefer **SPI with separate chip-selects, or separate I²C ports**, over a shared
  I²C bus. On a shared bus both stubs carry the signalling for either device's
  transaction; separate selects mean a stub is quiet unless its own sensor is
  being read.
- Sample during **bus-quiet intervals**, which is available for free because we
  control the schedule.

And the theme that recurs throughout this design applies here too: the unit's own
field contribution is **fixed, repeatable, and correlated with our own bus
traffic**, which makes it a calibration coefficient rather than a noise source —
the same argument as the array manifold in §5.3.1.

##### B.4 Where the cost actually is

**Not the BOM.** Three sensors of this class are a few dollars each against a
unit containing a Jetson and an AD9361.

**The cost is a per-unit factory cross-calibration step**, because B.1's
mismatch budget cannot be met by part selection alone — the two magnetometers
must be characterised against each other in the assembled lid. That is a
recurring manufacturing-test cost on every unit shipped, which is a different
line item from one-time engineering, and it is the number to quote if someone in
the room owns COGS.

**And it now lands on every unit.** When this was written the gradiometer was a
direction-finding option. §1.1.1 removed the single-element module, so there is
no variant that escapes this step. If the cross-calibration turns out expensive
in line time, that is an argument against option B specifically — not against
the three-element array — and it should be weighed against options A and C,
which are software-only.

A second, smaller term: **differential thermal drift.** The two corners can sit
at different temperatures — one in sun, one shaded — and magnetometer offset
moves with temperature. Both parts report their own die temperature, so this is
correctable, but it is another calibration term rather than a free lunch.

##### B.5 What remains genuinely unresolved

Whether the gradient supports *correcting* the heading rather than merely
flagging it — by estimating the disturbing dipole and subtracting its
contribution — is unresolved and would need to be established by measurement
before being claimed. Detection is the defensible claim today. [Assumption.]

**C. Bearing residuals against known-position emitters — *direct measurement of
the actual quantity*.** If the unit hears a transmission from an emitter whose
position is known — a subscriber unit reporting GPS location, or a second Orb at
a surveyed point — the true bearing is computable and the difference from the
measured bearing is the heading bias.

This is the only candidate that measures the thing we actually care about, in
degrees, rather than a proxy for it. It also separates cleanly from multipath by
signature: **a heading bias is a constant offset on every bearing from that unit,
while multipath is random per event.** Several observations from different
directions distinguish the two. It is software-only and needs no new hardware.
Its dependency is real, though: it requires known-position emitters to be
audible, which is plausible in a P25 environment but not guaranteed.

**D. Dual-antenna GNSS heading — *noted and probably not viable here*.** Two
GNSS antennas on a fixed baseline give true heading with no magnetometer at all,
immune to every magnetic disturbance. It is the approach survey and marine
equipment uses. The obstacle is baseline length: heading accuracy degrades as
the baseline shortens, and the ~35 cm available across the lid is short for the
technique. Listed for completeness and as the answer if magnetic integrity later
proves intractable. [Inferred.]

#### What is not a substitute

An operational rule — *do not set up within some distance of a vehicle or a
steel structure* — is cheap, sensible, and belongs in the field documentation
alongside the orientation rule of §5.6. It is not a substitute for automated
detection, because it fails **silently**. An operator who misjudges the distance
gets no indication that anything is wrong, and §5.7's central argument is that
an undetected wrong answer is worse than an admitted absence of one.

**B is selected and the layout deadline is therefore met.** The arrangement is
fixed and can go into the lid assembly and carrier-board layout. Its placement
depends on the triangle orientation of §5.1 and the rigid carrier plate of
§5.2.1, both of which are also settled.

**A and C remain the recommended software layers, and neither is implemented.**
They address different halves — A suppresses a bad fix in real time, C measures
the actual bias when the opportunity arises — and both are software-only, so
neither blocks hardware.

**D is not pursued.** The lid baseline is too short for dual-antenna GNSS heading
to be competitive, and B now occupies that role.

**What is still genuinely open is validation:** the per-unit cross-calibration
cost in manufacturing line time (B.4), and whether the gradient supports
correcting heading rather than only flagging it (B.5).

---

## 6. Power budget

Two components dominate, and everything else is noise against them.

| Configuration | Radio | Compute | Approximate total |
|---|---|---|---|
| **Receive only** | 4× ADRV9002 + 3× LNA + 3 splitters, no PA | Jetson at 7–15 W, plus FPGA | **Roughly 20–35 W — re-estimate required** |
| **Licensed transmit, keyed** | Adds PA driving ≤20 W ERP | Same | **Substantially higher during transmit** |

[Inferred — from the confirmed Jetson power modes, an unmeasured FPGA figure, and
the general result that RF power amplifiers dominate transmitter draw. **Not
measured, and now the least well-founded number in this document.**]

**The transceiver line needs redoing and has not been.** Four ADRV9002s is four
devices where the estimate assumed one, pulling upward; but the ADRV9002 is a
handheld-and-tactical part with power-saving modes rather than a cellular
base-station part, and the FPGA no longer needs gigabit serial transceivers, both
pulling downward. **Which dominates is not established.** The only continuous-RX
figure found in research was a 210 mW DMR duty-cycled average at 5% receive and
90% idle — which is not our case at all, since we receive continuously, and it
must not be used. Establishing continuous-receive power for four devices is a
named action, not an assumption. [Assumption]

Ethernet PHY, GNSS, and the secure element are real but negligible against these.

**Item G resolved the supply envelope to a few hundred watts** from a patrol
vehicle or field power bank, which is what makes a four-device transceiver
arrangement affordable at all. The receive-only argument has changed character
accordingly: it is now about **endurance** rather than feasibility.

**That resolution is what made the transceiver decision comfortable.** A 5–7 W
transceiver was a serious objection against a backpack battery and is not one
against a vehicle supply. The two decisions interact, and the order matters: the
power envelope had to settle before the reliability argument could win.

**The receive-only argument survives but changes character.** With hundreds of
watts available, an unpowered PA is no longer the difference between feasible and
not — it is the difference between long endurance and short. On a field power
bank, 25 W against 70 W is roughly three times the runtime, which still matters
to a commander who needs the unit up all shift. State it as an **endurance**
argument now, not a feasibility one.

---

## 7. What is genuinely open

**Reclassified and largely closed, 2026-07-31.** An earlier version listed nine
items as equally open, which overstated the position. They are now graded — and
after a round of decisions, **one genuinely open engineering question remains
(D), plus one commercial dependency that is not ours (I).**

Grading matters because "open" covering both *nobody has thought about this* and
*we have a recommendation awaiting a cost check* is useless to anyone planning
work.

### 7.1 Closed by analysis, pending only sizing

**A. The division of labour between the FPGA bridge and the Jetson.** Previously
listed as unspecified. §3.5.2 answers it: stages 7–9 must run in FPGA fabric
because they operate at tens of millions of samples per second; stage 10 onward
runs on decimated ~48 kSa/s streams and belongs on the Jetson, where the code
that will need repeated tuning against real measurements can actually be
iterated. Stages 10 and 11 cannot be split across the link, because stage 11
consumes stage 10's weights. The boundary is where the system stops streaming and
starts buffering.

**What remains is FPGA sizing** — how many channeliser instances, at what word
widths — which is an engineering estimate, not an architecture question.

### 7.2 Decided

**B. The third coherent receive chain, and uplink coverage with it.** **Closed
2026-07-31 by selecting four ADRV9002s** (§3.3, §5.5), forming two coherent
groups of three chains — one on the uplink where handsets transmit, one on the
downlink. Uplink coverage is no longer a roadmap item bolted on later; **it is
what the array points at.** Two AD9361s on one unified 47 MHz window remain the
documented fallback.

The reasoning went through two reversals in a day and both are recorded in §3.3,
because the sequence is more instructive than the answer. The original
argument — that a multi-chip synchronisation which half-succeeds produces a wrong
bearing rather than a missing one, and that removing a silent-confident-error
mechanism is worth more than the engineering time saved — **still holds.** What
changed is that MCS turned out to be required *within* a single ADRV9002 as well
as between devices, so device count stopped being a reliability variable at all.

**Not measured, and it should be before silicon is committed:** continuous-receive
power for four devices (§6), the SSI lane count that sizes the FPGA, and whether
MCS phase alignment on a group's chains survives the other receiver on the same
device being independently tuned to a different window. That last one is the
assumption the whole allocation rests on.

**Not measured, and it should be before silicon is committed:** power for both
candidates at our actual few-megahertz slice rather than at the datasheet's
200 MHz, and the FPGA cost and power delta from needing gigabit serial
transceivers. Neither is expected to reverse the decision now that G has resolved
the power envelope.

**C. Magnetic heading integrity — hardware selected.** §5.8 option B is chosen:
two dedicated magnetometers at the outboard lid corners, IMU colocated with the
inboard element at the centre-hinge junction, for the storm-case modules.
Options A and C remain recommended software layers, neither implemented; option D
is not pursued. **The VHF module is explicitly out of scope** — its array is a
mast or vehicle mount, so the corner-placement geometry does not apply, and it
remains an as-yet-undesigned configuration.

What is still open is **validation, not selection**: the per-unit
cross-calibration cost in line time, and whether the gradient supports correcting
heading rather than only flagging it (§5.8 B.5).

**E. Mechanical and enclosure integration — resolved by design intent.**
[2026-07-31.] The processing body and the ARC Edge unit live together as a
**single conjoined module inside the trunk of the storm case**. The processing
body is built as a **factory-assembled bolt-on to the ARC Edge body**, and the
pair slots into the chosen band module to make a complete P25 Orb assembly.

That resolves what was previously an unknown into a stated architecture. Two
things it does not resolve, and both should be said plainly: it requires **Orb
Aerospace's agreement** to a factory bolt-on arrangement and their mechanical
interface specification for the ARC Edge body; and it means the product form
factor is the **storm case, not the confirmed soft-sided backpack Field Kit**.
The case is the design intent, not a claim about the existing product.

**F. The interface above Ethernet — notionally satisfied, descoped.**
[2026-07-31.] A reasonable protocol over Ethernet is assumed to exist or to be
definable jointly. **Out of scope for this assignment.** It remains a real
question for a real programme and should not be presented as answered.

**G. Power budget — resolved.** [2026-07-31.] The deployment assumption is **a
few hundred watts** from a patrol vehicle or a field power bank. Against a
receive-only draw in the tens of watts (§6) that is comfortable, and it is what
made B's transceiver selection acceptable. It also changes the character of the
receive-only argument from feasibility to endurance.

**H. Equipment authorisation for always-populated transmit hardware —
notionally satisfied, descoped.** [2026-07-31.] Assumed handleable through
normal equipment-authorisation routes. **Out of scope for this assignment**, and
a genuine question for a real programme.

### 7.3 Genuinely open, and not ours

**I. Vocoder licensing.** Decoding P25 *voice* requires IMBE or AMBE+2, both
Digital Voice Systems Inc. intellectual property (§3.5.3). Terms, cost, and
whether a software licence or a hardware vocoder is the right route are all
unknown. **It is a single-source dependency**, a category of risk this design
otherwise avoids by using catalogue parts, and it should be resolved before any
commitment involving voice content. It does not affect the demonstrated
receive-only product.

### 7.4 Genuinely open, ours, and the one that matters

**D. The dynamic-range budget.** Wideband capture cannot filter a strong in-band
signal before the converter, so **the strongest signal in a window sets the noise
floor for every channel extracted from it** (§3.3.1). Our interferer is the same
kind of radio as our target — a police radio on the system we monitor — so
selectivity offers no escape.

**Substantially improved by the §3.3 architecture, and it is worth being precise
about which part improved.** Three mechanisms are in play:

| Mechanism | Helped by processing gain? | Effect of two narrow groups |
|---|---|---|
| **Quantisation noise** | Yes — 23 dB from a 2 MHz window to a 12.5 kHz channel | Slightly *worse* than a wide window, which would give ~36 dB |
| **AGC backoff from a strong in-window signal** | No | **Much better** — each window admits far fewer emitters |
| **Spurs and intermodulation** | **No** | **Much better** — third-order products scale hard with the number and strength of in-window signals |

**The net is a large improvement**, because the two mechanisms that processing
gain cannot touch are exactly the two that narrowing the window fixes. Losing
~13 dB of oversampling gain to win on both is the right trade.

**And the architecture removed the worst consequence entirely.** Under the
rejected single 47 MHz capture, one gain control served everything — so a nearby
uplink transmission would have desensitised **the downlink control channel**, the
source of every alarm the product raises. Two groups have two gain controls, and
that coupling is gone.

**What is now known about the part.** The ADRV9002 is specified at **150 dB/Hz
dynamic range** and is marketed explicitly against blocking in mission-critical
land mobile radio — the first part considered here that was engineered against
this exact problem rather than adapted to it. [Confirmed]

**What is still not known, and this is why the item stays open.** No budget has
been computed for our windows, our filters, or our environment. Specifically
unquantified: third-order intermodulation with several strong uplink emitters in
one ~2 MHz window; whether the AGC can be configured to protect the weak-signal
case rather than simply track the loudest; and LNA compression, which sits ahead
of the splitters and is therefore **common to both groups in every architecture
considered** — the one blocking path this design does not improve.

**Why it still outranks what is left.** It bounds the weak-signal sensitivity that
§3.3.2's subscriber-side capability rests on — now the *primary* capability rather
than a roadmap one, since the uplink group is what the array points at. **It
remains the only open item that constrains something the product is sold on** —
but it is now a budget to be computed rather than an architecture to be found.

##### It is present in the current design, not waiting on uplink coverage

**Noted 2026-07-31. Previously implied that this problem arrives with the
subscriber-side work; it does not.**

`8TAC95D` is **simplex** — no repeater, no uplink/downlink pair. It sits at
851.5500 MHz, **337.5 kHz above the control channel**, inside the same captured
slice and therefore **under the same shared gain setting** (§3.3.1).

The consequence: a handheld or vehicle radio keying up on talkaround **thirty
metres from the unit** is, at our antenna, far stronger than a tower ten
kilometres away. That transmission pulls the gain down for the *entire* slice —
including the control channel that congestion detection and blocked-attempt
reporting depend on. **The blocking scenario is reachable today, at 800 MHz, with
the module exactly as specified.**

This is also the sharpest instance of a pattern worth naming: **talkaround is the
one thing in our slice transmitted by something that might be standing next to
us.** Everything else we receive comes from a tower at a known distance and a
steady level. So the fallback channel is simultaneously the place we hear
subscribers directly (§3.3.2) and the place our worst in-slice interferer
arrives — the same duality that makes the uplink band both the prize and the
poison.

**Design consequence:** a transceiver's blocking and dynamic-range performance is
a *current* selection criterion, not a future one, and the instrument-health
requirements of `docs/software-prd.md` §1.5 are exercised by the demonstrated
configuration rather than only by a roadmap one.

**And it is the one open item with a requirement attached that does not wait for
it.** However the measurements come out, a vehicle can always park closer, so the
unit must detect and announce its own desensitisation (§3.3.1, and
`docs/software-prd.md` §1.5). That requirement is independent of the budget and
should not be deferred behind it.

**J. Band coverage below 650 MHz — CLOSED 2026-07-31, same day it opened.**
Opened when a QA pass found that the ADRV9026 tunes only 650 MHz–6 GHz, putting
the VHF and UHF band modules below its floor. **Closed by selecting the ADRV9002**
(§3.3), which tunes from 30 MHz and covers every band in the Texas plan directly.
The block up-conversion that was proposed as a mitigation is **not needed and not
being built** — no mixers, no second LO, no image filtering, no added spurs.

**Kept in this list rather than deleted, because the episode is the lesson.** Item
B was decided on a coherence argument that was correct on its own terms, and it
silently broke a commercial claim two documents away that nobody re-checked.
**After any part substitution, re-verify every specification the old part's
numbers were supporting** — not only the one that motivated the change.

### What affects the demonstrated product

**Only D.** A is closed by analysis. B, C, E, F, G and H were decided or descoped
on 2026-07-31. I concerns voice, which the proof of concept does not use. **J
affects the multi-band SKU argument but not the 800 MHz system demonstrated.**

**The dynamic-range budget is now the only genuinely open engineering question
in this document, and it constrains a capability the product is actually sold
on.** It is the one to resolve first, and §3.3.1 is where it is analysed.

---

## 8. Where the effort actually goes

Worth stating plainly, because it drives the schedule and the hiring.

**Hardware is mostly integration.** The transceiver is a catalogue part. The
compute module is a catalogue part. The filters, amplifiers, oscillator, and
secure element are catalogue parts. The genuinely custom hardware work is the
carrier board and the analog chain around the transceiver — real, skilled RF
engineering of exactly the kind Orb Aerospace's own Principal RF Engineer
posting describes, but well-trodden.

**The effort concentrates in firmware and software:** P25 CAI demodulation, TSBK
parsing, control-channel following, analog FM demodulation, key management, and
— for the transmit tier — the P25 modulator. All of it runs on the off-the-shelf
compute stack. None of it needs new hardware.

And the part of this product that a commander will actually judge — the
detection engine, the digest, the two-tier alarm — is software sitting on top of
all of it, and is the piece already built and running in the proof of concept.

---

## Appendix A. Acronyms

Every abbreviation used in this document. §0 covers the separate problem of words
that have several meanings.

### Signal path and silicon

| | | |
|---|---|---|
| **ADC** | Analog-to-Digital Converter | Turns a voltage into numbers. Stage 7 |
| **BPF** | Band-Pass Filter | Passes one band, rejects everything else |
| **CIC** | Cascaded Integrator-Comb | A filter built from adders and delays only, no multipliers — cheap for large decimation |
| **CORDIC** | COordinate Rotation DIgital Computer | Computes sines and rotations with shifts and adds instead of multiplies |
| **DDC** | Digital Down-Converter | Slides one channel to zero frequency. The heart of stage 9 |
| **DSP** | Digital Signal Processing | Also "DSP slice" — a hardware multiply-accumulate unit inside an FPGA |
| **FFT** | Fast Fourier Transform | Converts a waveform into its frequency components efficiently |
| **FIR** | Finite Impulse Response | A filter that multiplies recent samples by fixed coefficients and sums them |
| **FPGA** | **Field-Programmable Gate Array** | A chip whose internal logic *and wiring* are configured after manufacture, by a bitstream loaded at power-up. Not a processor running instructions — a fabric of logic blocks, multipliers and memory wired into whatever shape the design needs. §3.5.1 |
| **I/Q** | In-phase and Quadrature | Two numbers per sample that together express a signal as magnitude *and* phase |
| **JESD204B/C** | (JEDEC standard, no expansion in common use) | A high-speed serial interface used by newer converters and transceivers, in place of parallel LVDS |
| **LNA** | Low-Noise Amplifier | The first amplifier. Its own noise sets the whole system's sensitivity |
| **LO** | Local Oscillator | The reference tone a mixer multiplies against to shift frequency. **Shared across chains, which is what makes interferometry possible** |
| **LVDS** | **Low-Voltage Differential Signaling** | A way of sending fast digital data over *pairs* of wires carrying opposite voltages. The receiver reads the difference, so noise picked up equally by both wires cancels — which is how it survives gigabit rates. Used between the AD9361 and the FPGA, ~1.5 Gbit/s per chain |
| **SSI** | Serial Synchronous Interface | The ADRV9002's digital I/Q port, configurable as LVDS or CMOS. Source-synchronous, so the FPGA needs **no gigabit serial transceivers** — unlike JESD204B/C |
| **MIMO** | Multiple Input, Multiple Output | Several antennas at both ends. The AD9361 is a 2×2 MIMO part, which is *why* it has exactly two receive chains |
| **MMIC** | Monolithic Microwave Integrated Circuit | An RF function on a single chip |
| **MRC** | Maximal-Ratio Combining | Co-phasing several copies of a signal and weighting by quality before summing. Source of the 4.8 dB |
| **NCO** | Numerically Controlled Oscillator | Generates a sine wave as numbers, for the DDC to multiply against |
| **NF** | Noise Figure | How much a stage degrades signal-to-noise. Losses ahead of the LNA add dB for dB |
| **PA** | Power Amplifier | Transmit only |
| **PCIe** | Peripheral Component Interconnect Express | The standard high-speed link between the FPGA and the compute module |
| **PLL** | Phase-Locked Loop | Generates a stable frequency locked to a reference. Two PLLs locking independently settle at an unknown relative phase — see §5.5.1 |
| **SAW** | Surface Acoustic Wave | A filter that converts the signal into a mechanical vibration on a crystal, filters it there, and converts it back |
| **SNR / SINR** | Signal-to-Noise / Signal-to-Interference-plus-Noise Ratio | — |
| **T/R** | Transmit/Receive (switch) | Alternates one antenna between transmitting and receiving |

### Radio system and regulatory

| | | |
|---|---|---|
| **ANI** | Automatic Number Identification | A short data burst identifying the transmitting radio on an analog channel |
| **CAI** | Common Air Interface | The P25 over-the-air protocol |
| **COML** | Communications Unit Leader | The incident role that authorises interoperability channel use |
| **ERP** | Effective Radiated Power | Transmit power as actually radiated. 8TAC95D is capped at 20 W |
| **FDMA / TDMA** | Frequency- / Time-Division Multiple Access | P25 Phase 1 and Phase 2 respectively |
| **GNSS** | Global Navigation Satellite System | GPS and its equivalents |
| **ISP / OSP** | Inbound / Outbound Signalling Packet | Control-channel messages from and to a subscriber radio |
| **NAC** | Network Access Code | Identifies which P25 system a transmission belongs to |
| **P25** | Project 25 | The public-safety digital radio standard |
| **TSBK** | Trunking Signaling Block | The 196-bit unit of control-channel signalling |
| **TSICP** | Texas Statewide Interoperability Channel Plan | The document defining 8TAC95D and its rules |

### Direction finding and sensing

| | | |
|---|---|---|
| **AOA** | Angle of Arrival | Bearing from phase differences across an array. Our approach |
| **Coherent group** | *(this document's term, §0.0a)* | Three receive chains co-tuned to one window and phase-aligned by MCS, sampling the antenna array to produce one bearing. **Two of them**; only one antenna array |
| **GDOP** | Geometric Dilution of Precision | How much poor crossing geometry inflates position error |
| **IMU** | Inertial Measurement Unit | Accelerometers and gyroscopes; reports orientation |
| **MCS** | Multichip Synchronisation | Analog Devices' mechanism for phase- and latency-aligning receive chains **within and across** transceiver devices. Load-bearing here: it is what makes the chains of a coherent group comparable, and it is required even inside one device |
| **MUSIC** | MUltiple SIgnal Classification | A spectral direction-finding method that can resolve several arrivals at once. Not implemented |
| **TDOA** | Time Difference of Arrival | The alternative to AOA. Needs more stations; rejected in §5 |
| **WMM** | World Magnetic Model | Predicts the Earth's field at a given place and date. Basis of §5.8 option A |

### Commercial

| | | |
|---|---|---|
| **BOM** | Bill of Materials | §4 |
| **COGS** | Cost of Goods Sold | Per-unit manufacturing cost, as opposed to one-time engineering |
| **NRE** | Non-Recurring Engineering | One-time development cost |
| **SKU** | Stock Keeping Unit | One orderable part number. §1.1.1 |
