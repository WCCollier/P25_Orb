# P25 Orb — ARC Edge Feature Design Document

Prepared for: ARC Edge Product Lead take-home assignment, Orb Aerospace / Node One. Due Aug 3, 2026 (or earlier).

## Confidence key

Facts in this document are tagged so nothing gets overclaimed in the pitch:

- **[Confirmed]** — read directly from a primary source (Orb Aerospace's own site, official Texas DPS documents, the L3Harris operator's manual).
- **[Inferred]** — a reasonable technical inference from confirmed facts and general domain knowledge, not stated by any source directly.
- **[Assumption]** — stated plainly as an assumption in the pitch, not a guarantee — either unconfirmable publicly, or a design decision we made deliberately.

---

## 1. Executive Summary

ARC Edge's confirmed value proposition is dynamic, intelligent multi-path network fusion (DMPO) — never a naive "flood every path" approach. **P25 Orb** is a proposed hardware/software add-on that extends that same philosophy to a bearer ARC Edge doesn't currently name in its public materials: P25 land-mobile radio. In its baseline, zero-cooperation-required configuration, P25 Orb passively detects when officer radio traffic is being blocked by trunk congestion — including emergencies that never make it through — and synthesizes that into a real-time common operating picture for the on-scene commander (OSC), delivered over ARC Edge's own resilient connectivity. In a licensed, authorized-participant configuration, it extends further into active bridging and relay. The core PoC demonstrates the baseline detection/synthesis capability against a realistic mass-casualty congestion scenario grounded in real Texas interoperability doctrine.

## 2. Problem Statement

**Scenario:** a mass police response to a critical incident in a confined area (a large high school) — multiple agencies, hundreds of officers and vehicles converging. Officers carry Harris XL-200 handhelds (personal + patrol vehicle), operating on the Lower Colorado River Authority (LCRA) P25 Phase II trunked radio system. Drone units for interior search/exterior surveillance and manned ISR (news/medevac helicopters) add to the coordination burden.

**Failure mode:** when large numbers of P25 radios converge and attempt to transmit simultaneously, the trunk's TDMA capacity is overwhelmed. It does not fail gracefully — comms are lost broadly, radios do not fall back to peer-to-peer automatically, and the trunk has no built-in way to prioritize urgent traffic over routine traffic. Commercial cellular service degrades simultaneously and for unrelated reasons (personal devices, bystanders livestreaming, parents calling in) — congestion failure on every available channel at once.

## 3. Market & Customers

### Customer of contract: Texas DPS and TPWD, jointly [design decision]

Both agencies hold a roving, statewide mandate to respond to incidents like this, with complementary rather than overlapping strengths:

- **TPWD** — stronger for large-area disaster response: off-road/backcountry/water-capable assets (game wardens' vehicles, boats, ATVs), suited to floods, wildfires, rural search-and-rescue.
- **DPS** — stronger for urban/suburban critical incidents: greater Trooper count and denser manpower distribution, suited to concentrated, high-population-density events.

The PoC scenario (mass-casualty at a single school site) is DPS-shaped — dense, urban/suburban, manpower-concentration-driven — so **DPS is the primary voice for the pitch itself.** TPWD is the parallel stakeholder whose own incident type benefits from the identical capability, making this a joint state-level acquisition case rather than a single-agency sale. Well-resourced counties fit the same tier and get a brief mention as adjacent market.

### Stakeholder map

- **OSC (On-Scene Commander)** — the end-user champion. Data and control flow back to them; the system needs to visibly serve them, not just the procuring agency.
- **LCRA** — an interop constraint the design works *around*, not the customer. The pitch must be honest that P25 Orb operates alongside the existing trunk, not replacing or being installed into it.

### Secondary market (not the PoC's customer — the roadmap story)

Smaller counties/cities, buying the cheaper **Existing-Radio Interface** tier (base ARC Edge + a P25-radio-connector) for patrol assets that can't afford to drop offline — drone units are the sharp example — using base ARC Edge DMPO functionality with P25 folded in as one more path, not the detection/digest capability.

### Competitive landscape

Real, shipping precedent exists for "relay a P25 radio's audio/GPS/emergency data over IP with network failover": **Skymira's P25 IP Relay** [Confirmed — read Skymira's own product page] taps into the raw P25 stream from any major manufacturer's radio (including Harris), relaying audio/subscriber-ID/GPS/emergency-alerts over any IP network with auto-failover. **Etherstack's RMU25 "P25 Radio Modem Unit"** is a comparable product. Confirmed from Skymira's own documentation: it does **not** do congestion detection, priority handling, or dynamic/intelligent path selection — reactive failover, not proactive optimization.

This sharpens differentiation rather than undermining it:
1. **DMPO-grade continuous path optimization** instead of basic reactive failover — applying ARC Edge's actual, more sophisticated tech to a problem space competitors solve more crudely.
2. **Detecting what never got through in the first place.** Nothing in what these competitors document suggests they surface *failed* or *blocked* transmission attempts, only successful ones. This is the genuine white-space angle and the headline "important and unique feature" for the pitch.

## 4. Technical Foundation

### Orb Aerospace / ARC Edge — confirmed company and product facts [Confirmed, from orb.aero]

- Orb Aerospace, Lowell, Michigan. "Node One" is their internal R&D facility/team, not a separate company — matches the assignment brief's phrasing exactly.
- Products: **LASSIE MK1** (Group 1 sUAS, "Coming Soon" — the "Orb autonomous aircraft" from the job spec), **ARC Edge** (this assignment's subject), and **AMMO** (unexplored, not essential here).
- **DMPO (Dynamic Multi-Path Optimization)** — the patented core tech. Continuously measures loss, latency, jitter, bandwidth per link; steers traffic dynamically; explicitly not a duplicate-on-every-path bonding scheme.
- Aggregated paths: cellular (5G/LTE/FirstNet), LEO satellite, CBRS private LTE, Wi-Fi 6E/MANET mesh, unspecified "military LOS/BLOS," wired. Max 5 simultaneous paths.
- Architecture: strict control-plane/data-plane separation, modular/vendor-agnostic, no single point of failure.
- Hardware: "ARC Edge Field Kit" — IP67 ruggedized **backpack-portable** unit, <5 min deployment.
- Mission contexts (their own framing): persistent infrastructure hardening; crisis-response lifeline for public safety/emergency management; command-and-control assurance for autonomous ops.
- COP: stated to fuse "telemetry, sensor feeds, infrastructure visibility, and field operations" into one real-time picture — mechanism not detailed publicly.

**Gaps, honestly stated [Unconfirmed]:** no mention of P25, Link 16, or TAK by name anywhere in Orb's public material — the assignment's framing of these is plausible and consistent with their defense-market positioning, but not independently verified. No named leadership, case studies, or customer names found. No Shield AI/V-BAT joint exercise found in Shield AI's own press materials. No patent filing publicly discoverable under "Orb Aerospace" after thorough, multi-database retry — most likely explanation is provisional-only status or a publication lag, not that the claim is false. **Do not cite a patent number or filing date in the pitch — there isn't one to cite.**

**Plausible technical model [Inferred]:** ARC Edge is architecturally an SD-WAN, tactically hardened — DMPO's naming and behavior closely track VMware/VeloCloud's own SD-WAN feature of the same name, suggesting convergent or descended design (active per-path probing, per-flow steering, quality-threshold failover). The control/data-plane split implies an SDN-style design. The COP is likely a data-fusion layer riding on top of the DMPO transport, not part of DMPO itself. Hardware is likely a ruggedized embedded Linux box with multiple radio/modem interfaces feeding a steering + protocol-translation + COP-fusion software stack.

### P25 trunking mechanics [Confirmed, from the L3Harris XL-200P operator's manual]

The documented transmit procedure requires waiting for a **Grant Tone** before speaking — the officer is instructed not to talk until a channel is confirmed. On Queue or Deny, **the radio never switches to a traffic channel and never transmits voice RF at all.** There is no audio anywhere for a blocked attempt — it never existed as a signal, so there is nothing to intercept, relay, or bridge for that specific attempt.

Three distinct, named status indicators (not a generic beep): `PTT Denied` (not authorized), `Call Queued` (waiting), `System Busy` (no channels available) — these map directly onto the P25 control-channel Grant/Queue/Deny signaling.

No voice store-and-forward or buffer-and-burst feature exists on this radio. **TextLink** is a genuine asynchronous store-and-forward feature, but text/data only — a fully separate subsystem from voice, not a rescue path for a blocked call.

Emergency declaration (press-and-hold, the "e-tone") triggers two things at once: an audible tone plus `TX EMERGENCY` signaling on the control channel — trunk-wide, visible to every unit and to passive monitoring regardless of which channel the response ends up on — and a **Hot Mic**: an automatic transmit period with real, elevated queue-priority at the trunk-controller level, not merely an automated PTT press **[Confirmed — direct account, department TAC, Seguin PD]**, lasting 15 seconds, after which normal traffic queuing resumes.

**Important nuance, confirmed from the same source:** the Hot Mic fires on a channel *pre-programmed by the officer's own local TAC*, appropriate to their normal operating environment — not necessarily the channel the current incident/operation is actually using. For an out-of-town or mutual-aid officer this is very likely a different channel, and can even be a different P25 network/trunk entirely (e.g., San Antonio runs its own P25 system, not LCRA, despite sitting inside LCRA's coverage area). **Design implication:** a P25 Orb actively following one specific trunk will always detect the emergency declaration itself (control-channel signaling is trunk-wide), but can miss the actual Hot Mic audio content if it lands on a different channel or network than the one currently monitored. This is precisely the scenario the scanner-style control-channel-tracking approach below is built to chase down, not a gap it papers over.

### P25 scanning — legality and mechanics [Confirmed]

A P25-capable scanner works by tracking the control channel to learn which frequency a talkgroup is active on, then following it — no need to register as an authorized system participant or hold keys. Off-the-shelf technology (Uniden, Whistler, the open-source SDRTrunk project). Receiving unencrypted public safety radio is legal under federal law (no reasonable expectation of privacy on an unencrypted transmission). **LCRA participants run almost entirely unencrypted** ("in the red") — confirmed by direct domain knowledge, crypto is too expensive for most agencies on the system. If a system does encrypt, only the voice payload is denied — call-setup metadata (WACN, System ID, NAC, RFSS ID, Site ID, unit ID, talkgroup, signal quality) is always extractable, so detection doesn't depend on hearing voice content at all.

### P25 packet data — capability and limits, using LCRA as the test case [Confirmed, primary vendor/standards sources]

**Question researched: does a P25 trunk offer any gateway to the open internet for a device using a connected radio as a modem?** No. Confirmed from Tait's "Specifying Your P25 System" guide (the source p25bestpractice.com's data page summarizes) and a Project 25 Phase II white paper authored by the chair of the TIA committee that wrote the standard (EFJohnson, Dec. 2011):

- **Throughput ceiling: ~9.6 kbps, unaffected by Phase 1 vs. Phase 2.** Phase 2's TDMA improvement is a voice-capacity feature only — a more efficient vocoder plus two-slot TDMA lets two voice calls share one 12.5 kHz channel. It does not touch data. The control channel, which is what actually carries packet data (status messages, AVL/GPS, text, OTAR/OTAP), stays Phase 1-style FDMA in Phase 2 systems — required for Phase 1/Phase 2 backward compatibility. **LCRA runs P25 Phase II**, so this ceiling applies directly to our scenario.
- **Architecturally a closed management channel, not general IP access.** P25 data is described in the source material as "more of a management tool, with messages usually sent from dispatch rather than incoming" — real-world usage is AVL, status messages, and workforce/text messaging, not bidirectional bulk data. The real hardware that would sit at LCRA's core for this (e.g. Motorola's ASTRO 25 Packet Data Gateway) bridges P25 packet data into the *trunk operator's own backend network* (CAD, AVL servers) — not out to the public internet.
- **Industry's own assessment:** "the data capabilities inherent in the P25 standard have been largely surpassed by commercial broadband developments and FirstNet expectations" — P25 data was never meant to compete with real IP connectivity, and no vendor or standards source describes it being used that way.
- No LCRA-specific public documentation on their packet data configuration was found (nothing on RadioReference's LCRA page) — unsurprising, since this is a minor, often underused P25 feature agencies rarely publicize.

**Design implication, carried into Sections 5 and 12:** P25 cannot function as "another DMPO path" alongside cellular/satellite/Wi-Fi — it can't carry meaningful application traffic. What it can realistically carry is a short status/heartbeat ping when every real DMPO path is down, the same way agencies already use P25 data for AVL and status messages today.

### Texas Statewide Interoperability Channel Plan (TSICP v24.2, Sept 2024) [Confirmed, read directly from Texas DPS]

**The designated direct/talkaround fallback channel for our 800 MHz scenario is `8TAC95D`.** Per-band equivalents: VHF = `TXCALL1D`, UHF = `UTAC42D`, 700 MHz = `7GTAC57D`. The plan itself (Section 2.3) states these channels are "particularly valuable in emergencies when units lose coverage... It is very important to train on the use situations of your portable and mobile radio" — the state's own documentation of the exact gap this feature addresses: the channel and doctrine exist, but training on it isn't guaranteed.

Further confirmed details:
- **A six-tier priority scheme for interoperability channel use already exists** (Section 2.1) — imminent danger to life/property is tier 1, on-scene tactical is tier 6. Current trunk hardware has no mechanism to enforce this ordering under load. P25 Orb enforces an existing doctrine, not an invented one.
- **Cross-band bridging is legal but requires a human in the loop.** Section 9.1–9.3 ("Interoperability Cross-Band Systems": Simple Cross-band Repeater, Mobile Tactical Interconnect, Dispatch Console Patching) permits gateway/patch behavior between bands, but only "under positive control of a trained dispatcher or on-incident Communications Unit Leader (COML)," who must be able to kill the patch on demand. **Design implication carried throughout: any bridging/repeating capability must be COML-supervised, not autonomous.**
- `8TAC95D` is capped at 20W ERP, mobile/portable only, no base stations permitted — matches the ARC Edge Field Kit's backpack form factor.
- LCRA appears by name in the actual Statewide Coordinated P25 Radio Unit ID allocation table (8M range) — the scenario is grounded in the real plan.
- 13M range is reserved for system-level temporary usage (ISSI) — the real infrastructure-level interop mechanism in Texas, relevant only to a future fixed-deployment configuration, not the core PoC.

## 5. Product Architecture — Four Products in the P25 Line

**1. Base ARC Edge** — the existing, unmodified product. No changes.

**2. Existing-Radio Interface** — a lightweight accessory-port/Bluetooth data connection to one specific, already-authorized radio (e.g. a vehicle-mounted unit). Technically real and established — P25 radios generically support acting as a transparent data modem for an external device, and Skymira/Etherstack prove the pattern commercially. Only sees that one radio's own status, not scene-wide activity. Value is **network reach**: an agency instruments its existing fleet cheaply, extending the ARC Edge mesh's geographic footprint using infrastructure it already owns.

**3. P25 Orb Add-on** — an RX/TX P25 transceiver module. One hardware SKU, two capability states gated by *authorization*, not by hardware differences:
- **Unlicensed/RX-only** — listens to the shared control channel (covers a whole incident from one well-positioned unit, since every radio on the trunk uses it) plus the analog fallback channel (`8TAC95D`). Scene-wide congestion/emergency detection, deployable with zero cooperation from the trunk operator. **This is the PoC's subject.**
- **Licensed/TX-enabled** — the same physical hardware, once properly authorized with a P25 unit ID — unlocks active bridging/relay (Section 6) plus a P25-based last-resort status/heartbeat channel: a short "unit OK"/"need backup" ping when every real DMPO path (cellular, satellite, Wi-Fi) is down. **Not** a general-purpose DMPO data path — P25 packet data tops out around 9.6 kbps and is a closed management channel, not internet/bulk-data access (see Section 4). Nothing new to ship; a licensing unlock on hardware already in the field.

**Two independent axes, not one ladder [clarified 2026-07-30].** Tier 3's "one hardware SKU, two capability states gated by authorization" is correct and is reaffirmed here — but it describes the *capability* axis only. There is a second, orthogonal axis: **the radio environment the unit is built for.** The physical product is a **band-specific module (housing + antenna array + filters + PA/duplexer) into which a common, band-agnostic processing body docks.**

- **Processing body** — transceivers, FPGA bridge, compute, LNAs, element splitters, GNSS, secure element, Ethernet, PSU. Identical for every band; the transceivers tune **30 MHz–6 GHz**, covering every band in the Texas plan. [Settled 2026-07-31 after two reversals in one day: an ADRV9026 selection was reverted because its 650 MHz floor put VHF and UHF out of reach, and the final architecture is **four ADRV9002s** — see below.]
- **Two coherent groups, not one** [2026-07-31, and this is the most consequential correction in the design's history]. The three-element array feeds **two** independent sets of three phase-coherent receive chains, one tuned to the **uplink** where handsets transmit, one to the **downlink**. Each element is split after its low-noise amplifier and fed to both. **The previous architecture pointed the array at the downlink — meaning every bearing it could compute would have been a bearing to the tower, whose position is never in question.** Handsets transmit on the uplink and on the analog talkaround channel; that is where direction finding has to look. `docs/hardware-design.md` §3.3.
- **The tower becomes a calibration beacon.** Because the downlink group watches a transmitter at a surveyed, known position, it is continuously measuring a bearing whose right answer is known — a live end-to-end check on array calibration, connectors, chip synchronisation and magnetometer heading. The failure this design most feared, a synchronisation that half-succeeds and yields a *confidently wrong* bearing, stops being silent. `docs/hardware-design.md` §5.7.
- **Band module** — the only genuinely band-dependent parts. At 700/800 it is a storm case with the array in the lid; at UHF a larger case; at VHF a mast or vehicle mount, because a 97 cm element spacing fits in no case.
- **Licence unlock** — transmit enable, unit ID, key loading. Software and authorization only, exactly as tier 3 already states.

**Why licensing must never be a hardware upgrade:** under the Texas plan, interoperability channel use is authorized by a communications leader **at incident time**. A capability requiring a hardware change is useless at the moment it is granted. This is a stronger argument than the per-unit cost of populating the transmit chain, and it is why the PA and duplexer are **always populated** — in the band module, where they belong, since both are band-specific. `docs/hardware-design.md` §1.1, §3.4. An earlier revision of the hardware document contradicted this by describing the PA as "populated only on transmit-enabled builds"; that has been corrected.

**Commercial consequence:** the expensive, complex, software-heavy part is common and band-agnostic; the band-specific part is passive, cheaper and mostly mechanical. An agency buys one body and the housings its environment needs, and a DPS unit could dock into a local agency's UHF housing during a mutual-aid response.

**SKU structure — seven part numbers [design decision, 2026-07-30]:** one processing body, three band modules (700/800, UHF, VHF), three clip-in duplexer packs. Two deliberate simplifications:

- **Every band module is three-element and DF-capable.** No single-element variant is offered. If a customer wants one they can request it; the line will not carry a cheaper speculative variant. This is not pure cost — co-phased combining across the three elements gives ~4.8 dB of extra sensitivity on the decode path whether or not a bearing is ever computed, so the array partly pays for itself on a surveillance-only unit. Stronger than that: the per-element channel estimate that makes that combining possible is the *same* computation direction finding needs, so the array is load-bearing for reception rather than merely a DF feature that happens to help it.
- **Every band module transmits on interoperability channels; the duplexer is a clip-in pack.** This rests on distinguishing two transmit capabilities that a single word hides. **Interop/talkaround** (8TAC95D) is simplex, needs only a PA and T/R switch, and is authorized by a communications leader **at the incident** — so it must be standard, per the argument above. **Licensed trunk participation** needs a duplexer, because a surveillance device that goes deaf to the control channel while transmitting loses trunk tracking [Inferred], and it is arranged administratively over weeks or months — nobody is granted a unit ID mid-response, so a planned purchase is appropriate. The duplexer clips in rather than defining a module variant because the transmit path drives one element and is not phase-matched, so an extra connector there is cheap; making it a variant would have doubled the module count.

**Three consequences recorded rather than discovered later:** the third coherent receive chain becomes the most urgent open item, since every module now ships DF-ready against a body that cannot yet sample three elements (see Section 10) — and a second AD9361 now answers *three* open questions at once, making it the presumptive answer rather than one of four options. The §5.8 magnetometer cross-calibration now lands on every unit shipped rather than on a DF option. And at VHF, where the array is a mast or vehicle mount, a monitoring-only customer must still take the mast kit — the sharpest instance of this decision, accepted deliberately.

**4. P25 Hotspot** — *a distinct product, not a tier of the Orb* [added 2026-07-31, roadmap]. A dedicated P25 **RF subsystem** paired with an ARC Edge unit, creating local trunked radio coverage where the existing trunk **has gone down, is swamped, or never existed** — and using DMPO and ARC Edge's backhaul to reach back to the parent system, or to other Hotspots stood up across a large disaster zone. Vehicle- or trailer-mounted, on generator power. See Section 5.1.

**PoC scope:** building and demoing the P25 Orb Add-on, unlicensed/RX-only mode, managing a single-site congestion failure. The Existing-Radio Interface, the licensed/TX-enabled mode, and the P25 Hotspot are **not implemented** — roadmap/future vision only.

### 5.1 P25 Hotspot [roadmap, not built]

**The one-line description, and the analogy is deliberate:** a Wi-Fi hotspot gives you local access and backhauls to the internet. This gives you local **P25** access and backhauls to the P25 system.

#### Why it is a separate product rather than a tier

**It inverts the Orb's defining virtue.** The Orb's central claim is that it needs nobody's permission — deploy it, it works, the trunk operator never has to agree to anything. A Hotspot needs a licence, frequency coordination at every deployment location, and the system operator's agreement to peer. **That is maximum cooperation**, and it is a different sales motion with a different buyer and a different procurement cycle.

The line as a whole runs monotonically along that axis, which is the useful way to hold it:

| Product | What it does about the trunk | Cooperation required |
|---|---|---|
| **Existing-Radio Interface** | **Rides** on it | The radio's owner only |
| **P25 Orb** (receive-only) | **Watches** it | **Nobody** |
| **P25 Orb** (licensed TX) | Watches it, and can speak on interop channels | A communications leader, at the incident |
| **P25 Hotspot** | **Replaces or extends** it | Licence, frequency coordination, and a peering agreement |

#### The architecture: an ISSI-peered subsystem, not a trunk site

**This distinction decides the whole design and must not be blurred.** A *site* is part of someone's system and talks to their zone controller over a **vendor-proprietary** link — there is no open standard for bolting a third-party site onto an L3Harris or Motorola core, and that obstacle is commercial rather than technical.

An **RF subsystem** is a small system in its own right, and P25 has an open, IP-based standard for connecting those: **ISSI** (TIA-102.BACA). It connects P25 systems **across vendors, across frequency bands, and across Phase 1/Phase 2**, and it allows radios from one system to authenticate and make calls in the other's coverage. [Confirmed — CISA ISSI/CSSI primer and fact sheet; TIA-102.BACA.]

**ISSI also assigns temporary unit and group IDs to roaming users to prevent ID overlaps** — which is precisely the identity-namespacing problem identified in `docs/software-prd.md` §1.1, already solved in the standard.

**Anyone who describes this as "adding a site to their system" will be corrected by the first radio engineer in the room.** Make the correction yourself.

#### Three scenarios, with different requirements

| Scenario | What it needs |
|---|---|
| **Trunk is down** — infrastructure destroyed | Standalone operation. Backhaul may be satellite-only or absent |
| **Trunk is swamped** — the congestion case | **ISSI peering matters most here**, because units must stay reachable on their home talkgroups while using local capacity |
| **Trunk does not exist** — coverage gap, rural, wilderness | Standalone is sufficient; ISSI optional |

**And the failure case is already a standard P25 behaviour.** When a site loses its link to the core it enters **site trunking** and keeps serving units locally. A Hotspot should do the same: full trunked service on scene whether or not backhaul survives, rejoining when it returns. That answers the obvious objection — *the scenario where you most want this is the scenario where backhaul is worst* — by making backhaul an enhancement rather than a dependency.

#### Why the vehicle form factor removes most of the engineering objections

The objections raised against doing this in the Orb's storm case were consequences of **that chassis**, not of the concept:

- **Continuous-duty transmit.** A control channel transmits 100% of the time. At ~40% PA efficiency, 20 W ERP costs ~50 W drawn before a single voice channel keys up. **Generator power makes this a non-issue.**
- **Self-desensitisation, which was decisive.** Transmitting 20 W from one lid-array element with receive elements 17.6 cm away puts roughly **+27 dBm** into a receive element — past any LNA's damage threshold, not merely desensitising. A vehicle or trailer mount allows **properly separated transmit and receive antennas on masts**, which is what real base stations do.
- **Thermal and volume.** Rack space and forced air rather than a sealed case.

#### What carries over, and what is new

**Shared with the Orb:** the transceiver family (ADRV9026 — its **four transmit chains** are enough for a control channel plus voice channels), the FPGA and compute stack, the P25 protocol software, and pairing with ARC Edge.

**A Hotspot is inherently also an Orb.** It has receivers and hears everything on its own channels, so the detection, digest and alarm capability comes along at no additional cost — and it participates in the multi-Orb collective of `docs/software-prd.md` §6 as an ordinary node. **The Hotspot is a superset of the Orb, not a sibling**, which is worth knowing before anyone proposes building the two stacks separately.

**Genuinely new hardware:** multiple continuous-duty PAs and duplexers, separated mast-mounted antennas, a vehicle or trailer chassis.

**Genuinely new software, and it is substantial:** being an RF subsystem means *generating* P25 call processing — registration, affiliation, channel grant logic, talkgroup management — which is the **inverse** of what the Orb does. The Orb parses TSBKs; a Hotspot must originate them. The protocol expertise transfers even though the code does not.

#### Hotspot-to-Hotspot, and an architectural echo

Multiple Hotspots across a disaster zone, each an RFSS, ISSI-peered over ARC Edge's mesh, can provide radio coverage where **no surviving infrastructure exists at all**. ISSI is designed for exactly this.

Note the parallel with `docs/software-prd.md` §6: a flat mesh of peers with no master, at a different layer. The philosophy is consistent, which is a good sign rather than a coincidence.

**Full mesh is the right topology, and an earlier draft of this section wrongly flagged it as a scaling concern.** The correction is worth recording because the instinct it corrects is a common one.

*n²* counts **associations, not traffic.** An idle ISSI association is a signalling relationship carrying keepalives; voice flows only when a call actually crosses, and only to the subsystems with affiliated listeners. Traffic therefore scales as **O(n × concurrent calls)** on a small stream: roughly 30 kbps per voice leg with RTP/UDP/IP overhead, so five concurrent calls across twenty Hotspots is about **3 Mbps** — precisely the profile ARC Edge and DMPO exist to carry. Keepalives on 190 associations run around 10 kbps.

**And a hub, which the earlier draft offered as the fix, is worse on both counts that matter.** Full mesh puts every call **one hop** from its destination where a hub makes it two, which matters for push-to-talk responsiveness. And a hub is a single point of failure in exactly the environment that cannot tolerate one — the same argument that makes the multi-Orb collective masterless (`docs/software-prd.md` §6.2). The *n²* association count is the price of avoiding both, and associations are nearly free.

**The genuine cost is provisioning, not bandwidth.** Ten Hotspots means 45 peering relationships to configure — addresses, credentials, talkgroup mapping — during a disaster. The trust boundary shows where to solve it: **within our own fleet**, Hotspots share an owner and a trust anchor, so they can discover each other over the ARC Edge mesh and **auto-peer**, reusing the discovery mechanism §6 already requires. **The link to a foreign agency's parent system stays manually provisioned**, because that is a real trust negotiation and should be a deliberate act. That collapses 45 configurations to one.

**Where hierarchy would eventually be needed** is a statewide standing deployment of hundreds of Hotspots — a different product posture, and one where real infrastructure would exist anyway. For incident response, where *n* is the number of command trucks with generators at one event, full mesh is simply correct. [Inferred — traffic figures are calculated, not measured.]

#### Risks to state rather than discover

- **ISSI peering requires the incumbent to have an ISSI gateway and to agree to use it.** Not all systems do, and it is a commercial negotiation.
- **Interoperability needs testing, not just standards compliance.** The P25 Compliance Assessment Program covers ISSI conformance; that is the route, and no testing has been done. [Inferred]
- **Frequency coordination per deployment location is a genuine operational burden.** You cannot simply arrive and transmit. Emergency provisions such as Special Temporary Authority are the likely path in a declared disaster, but this has **not been verified**. [Assumption]
- **Base station licensing is fundamentally different from mobile/portable**, and the interop channels cannot serve — `8TAC95D` is explicitly mobile and portable only, no base stations.

**Infrastructure-side and subscriber-side — the organising split [added 2026-07-31].** There are two fundamentally different things a receiver can listen to here, and separating them clarifies both the capability and the open items.

| | **Infrastructure-side** | **Subscriber-side** |
|---|---|---|
| What it is | What the tower transmits: control channel downlink, repeated voice | What handsets transmit directly: analog talkaround today, P25 uplink requests pending |
| Power / reach | Tower, high — audible from far away | Handheld 1–5 W — reach set by proximity to the officer |
| Shows you | What the system **knows about** | What the system **missed** |

`8TAC95D` is already subscriber-side, because we chose a *direct* channel (mobile/portable, no repeater); an agency using a repeated interop channel would put that traffic back on the infrastructure side. **Analog talkaround and a failed P25 request are therefore the same category of problem** — both are "work with only what the handset gives us" — though they differ instructively: the P25 request is a *decodable packet* (unit ID, talkgroup, service, emergency flag) while analog is audio with no inherent identity, so **the harder-to-receive case carries far more meaning**; and the request is 20–35 ms against analog's seconds, so the easier case to receive is also the easier case to direction-find.

**The operational difference is the one that matters.** Talkaround traffic means officers have *deliberately* fallen back — they know the trunk is failing and have adapted. A failed request means an officer **believes they are on the system and is not.** One is a coping behaviour; the other is an unaware failure, and the second is far more alarming from a commander's chair. Note also that the two sides *together* produce a diagnosis neither produces alone: hearing a request on the uplink and observing that no grant, queue or deny followed on the downlink is how you establish the trunk never heard it.

**This splits the headline claim into two tiers that must not be blurred:**

| | Claim | Status |
|---|---|---|
| **Tier 1** | *The trunk heard you and refused* — denials, queues, system-busy, invisible today to anyone outside the trunk controller | **Designed and demonstrated** |
| **Tier 2** | *The trunk never heard you at all* — and you have no way to know | **Needs uplink coverage** (Section 13, item B) |

Both are honest versions of "detecting what never got through." Tier 1 is real and valuable alone. Tier 2 is the claim without qualification, and it lives entirely on the subscriber side. **A customer will ask which one is meant.**

## 6. Detection & Relay Mechanism

**Correcting an earlier internal framing:** a blocked/queued/denied attempt produces no voice RF at all — there is no content to "bridge" for it. What's actually available:

1. **Detection and reporting of blocked/queued attempts** — the fact that an attempt was blocked is real, valuable situational awareness on its own, not a lesser version of relaying content that doesn't exist.
2. **Control-channel monitoring** — observing call setup/talkgroup activity for situational awareness, without controlling the trunk.
3. **Native emergency-signal awareness, precisely stated [updated — confirmed from a department TAC source, not assumption]** — an emergency declaration ("e-tone") produces trunk-wide `TX EMERGENCY` control-channel signaling, detectable by a passively-monitoring Orb regardless of what happens next, plus a 15-second Hot Mic with genuine elevated queue-priority — not merely an automated PTT press subject to ordinary Grant/Queue/Deny. **The real limitation is different from what we'd assumed:** the Hot Mic transmits on the officer's own pre-programmed local channel, which may be an entirely different P25 network than the one the incident — and our Orb — is actively following (see Section 4). So detection of *that an emergency was declared* is robust and trunk-wide; capturing *what was said* during the Hot Mic depends on the Orb's scanning/control-channel-tracking function successfully following the signal to wherever it actually lands.

**Live audio pass-through** [real capability, not part of this specific demo build] — any transmission that *does* get a Grant, on the P25 net or the analog fallback, produces real audio. Beyond synthesis into the digest, the P25 Orb can flatten both receives into a single live digital audio stream, available over its own IP interface to the rest of the ARC Edge network. Pure RX, no licensing dependency, fits the unlicensed tier — but not built into the specific two-tab PoC demo, which focuses on the text/event digest and alarm system.

### Licensed/TX-mode-only extensions (roadmap, not demoed)

- **Cross-band bridging repeater** — automating the TSICP's own Section 9.1–9.3 pattern between the P25 channel and the analog fallback channel. Requires transmitting on at least one band; must be COML-supervised, not autonomous.
- **IP-audio-to-P25 patch** — the TSICP's Section 9.3 "Dispatch Console Patching" pattern implemented as a soft/IP-based console: an audio stream over the Orb's Ethernet interface, encoded and transmitted as P25 voice. Closes the "no path back to the officer" limitation of the RX-only tier — licensed mode only. **Grounded in confirmed real-world practice, not a novel proposal:** a real dispatch console setup (base P25 radio, roof antenna, controlled via Windows console software) already works this way — the Orb's IP-audio patch is an incremental extension of infrastructure that already exists, not new territory.
- **Text-to-voice broadcast** — a small extension of the same pipeline, most valuable for standardized, automated, system-triggered announcements (e.g. the detection engine itself triggering "switch to talkaround" upon detecting congestion) rather than as a stand-in for a dispatcher speaking live. **Requires real authorization control** — only an authorized dispatcher/OSC should be able to trigger it.

**Input-contract audit [2026-07-31].** The revised hardware architecture makes information available that the detection engine does not consume: signal strength and SNR per transmission, per-radio carrier frequency offset, and analog-carrier-without-intelligible-audio are all **free today**; bearing per transmission and "the trunk never answered this request" are gated on open hardware items. **None is implemented and the PoC deliberately excludes all of it.** The reason it matters is not feature count: these are *physical* signals, and two of the engine's four existing signal kinds depend on the AI classifier having read something correctly. Physical signals relieve that dependence, materially improve the answer for an encrypting customer (from "you keep congestion detection" to "you lose the words, not the alarms"), and include the purest form of this product's own premise — *a request nobody heard*, which is categorically different from a request the trunk heard and denied. Full audit, the engine changes required, and why the **classifier must not change**, in `docs/software-prd.md` §1.1a–c.

## 7. AI Digest & Alert Layer

Software layer on top of the P25 Orb Add-on's RX-only capability. No new hardware.

**What it synthesizes (in the demoed PoC):** attempted transmissions and their outcome (Grant/Queued/Denied/System Busy); successful transmissions, including content; fallback-channel traffic. This is the same "flatten disparate feeds into a unified COP" function ARC Edge already claims to do — extended to a new feed type, not an unrelated bolt-on.

**Not part of the demoed PoC:** approximate sender location via AOA (requires 2+ Orb units — see Section 9, scoped as a separate, non-demoed bonus artifact, not integrated into the live single-Orb demo).

### Alarm design — two tiers, matching real police doctrine

- **High-confidence emergency** — corroborated by two or more independent signals: e.g. native `TX EMERGENCY` activation plus AI keyword detection, or a burst of correlated key-up attempts from multiple units.
- **Suspected emergency** — a single, uncorroborated signal: a low-confidence keyword hit ("shots fired," "officer down") with no confirming signal, or a garbled/inarticulate cutoff. An abrupt cutoff mid-phrase is treated as *higher*, not lower, concern.

Deliberately modeled on real police doctrine, not invented: officers investigate ambiguous distress signals immediately without waiting for confirmation — the same posture as a missed welfare/status check.

**Extension: status-check silence as a corroborating signal.** Since the Orb passively observes all trunk/fallback traffic, it can observe when dispatch issues a follow-up status check to a unit involved in a "suspected" event, and whether that unit responds. Silence after a status check sustains or escalates the alert. No new hardware, no transmission required.

## 8. Software Architecture

### Two front ends

- **Control Panel** (field setup/admin) — locally-connected tablet or web interface anywhere on the ARC Edge network. Config surface: full-participant mode on/off; band/target-system selection (WACN/System ID/NAC to confirm tracking the intended trunk, plus which fallback channel — generic across bands, not hardcoded to 800 MHz); P25 identity configs for licensed mode (Unit ID, WACN/System ID); a crypto panel, even in passive mode, letting an already-authorized user supply keys they legitimately hold (their own agency's system, or a legitimate mutual-aid arrangement) — not an interception feature.
- **Command Feed** (OSC-facing) — web interface accessible to anyone on the ARC Edge network: the running digest, two-tier alarm panel, command view.

**Three-layer architecture:** Control Panel (configures engine input) → detection/synthesis engine (Section 7) → Command Feed (consumes engine output).

**Tab 1 of the demo maps to a real product surface** — a diagnostics sub-view within the Control Panel, useful for the deploying technician to confirm the unit is hearing the target trunk before walking away during setup.

**PoC build scope for the Control Panel:** static HTML/CSS mockup only, not interactive. The demo's actual working software is the detection engine, Command Feed, and diagnostics view.

### AI engine power source

**Demo:** Claude Haiku 4.5 via the Anthropic API — right-sized for simple classification, chosen over standing up a local Ollama model (unjustified engineering overhead for this task). **Live-pitch reliability design:** the main scripted demo sequence runs on pre-computed classifications, genuinely generated by calling the Haiku API during development (not hand-authored fake labels) but cached so the live run has zero network dependency in its critical path. A separate, isolated "try it live" input lets the presenter type an arbitrary phrase and watch a real API call classify it, proving the AI is real without risking the scripted pitch if that one call hiccups.

**Key handling:** the "try it live" call means an Anthropic API key has to be reachable at demo time. It must never be embedded in client-side JS — that ships the secret in the clear to anyone who opens dev tools or later reads the repo. The demo runs behind a minimal local proxy (a single small Python/Node script, no framework, no bundler) that serves the static files and exposes one `/api/classify` endpoint reading the key from environment/`.env` server-side. This doesn't reintroduce a build step — the presenter still just runs one script and opens two tabs — it just keeps the key off the client.

**Honest limitation:** Anthropic does not distribute Claude model weights for local/on-device deployment — API-only, regardless of hardware. Claiming "Haiku running on the Orb unit" in the production/field vision would be a false claim.

**Recommended production architecture — hybrid, mirroring DMPO's own philosophy:** primary path is cloud-based classification reached over ARC Edge's own resilient connectivity (the failure mode being solved, P25 trunk congestion, is distinct from total regional connectivity collapse, so ARC Edge's own paths would plausibly still reach the cloud); fallback path for total connectivity loss is a small, genuinely locally-deployable open-weight model (Llama/Phi/Gemma class) on realistic edge-inference hardware (Jetson-class GPU). Same "best available path, graceful degradation" principle DMPO already applies to networking, applied one layer up to inference.

## 9. Hardware Architecture — P25 Orb Module

**Terminology note [added 2026-07-30].** "Channel" carries at least six meanings across this document — RF channel, channel designator (8TAC95D), control/voice *role*, uplink vs downlink direction, hardware **receive chain**, and the operator's loose use of "channel" to mean talkgroup. A collision between the last-but-one and the first already produced one false claim in this project (see below). `docs/hardware-design.md` §0 is the authoritative glossary. House rule: unqualified "channel" means *RF channel*; hardware paths are **chains**.

**Off-the-shelf: RF transceiver silicon [selected 2026-07-31].** **Analog Devices ADRV9026** — **four independently controlled coherent receivers on one die**, with a documented multichip synchronisation mechanism, up to 200 MHz bandwidth, JESD204B/C interface. No custom silicon needed. Three receivers serve the DF array; the fourth is available and unassigned. **Fallback: two synchronised AD9361s**, which also works and is documented in `docs/hardware-design.md` §5.5.

**Why this reversed the earlier AD9361 selection.** A three-element array needs three coherent chains; the AD9361 has two per die, so it takes two chips synchronised by a shared reference clock, LO distribution, and a multi-chip sync procedure at every start-up. **The deciding argument is a failure mode, not effort: a multi-chip sync that half-succeeds produces a *wrong bearing rather than a missing one*** — the silent-confident-error class this design works throughout to eliminate. Three supporting reasons: four channels on one die share a thermal environment so their drift is correlated and calibrates out; 200 MHz makes covering a downlink and its uplink 45 MHz away comfortable rather than marginal, which resolves the uplink question; and the power objection dissolved when Section 13 item G settled the supply envelope. Costs: a harder JESD204B/C interface pushing the FPGA to a part with gigabit serial transceivers, and power/cost figures at *our* bandwidth that have not been measured.

Still true and still the reason a software-defined radio is right: the chains share an LO, so they **cannot be tuned to different frequencies** — multi-channel monitoring comes from **wideband capture plus digital channelisation** (§3.3.1), not from chain count. That confusion is a §0 terminology collision and produced a false claim in an earlier revision.

**Required, and missing from the first block diagram: an FPGA/SoC bridge [corrected 2026-07-30].** The AD9361 presents digitised I/Q on a parallel **LVDS** interface at up to ~1.5 Gbps. **No Jetson-class module can accept that** — Jetson ingest is CSI/USB/PCIe. A Xilinx Zynq-class FPGA sits between them, terminating LVDS and presenting narrowband streams over PCIe or USB3. Analog Devices publish the interface HDL, so this is integration rather than novel work, but it is a real part with real cost, area and power that the earlier diagram omitted. It is also the natural home for the channeliser, for sample-precise GNSS-disciplined timestamping, and for coherent multi-chain capture in the DF variant — which means the link to the Jetson carries a few 12.5 kHz streams instead of 1.5 Gbps. **The compute story is therefore two parts, not one:** an FPGA doing fixed high-rate regular DSP, a Jetson doing irregular stateful work. What runs where is not yet specified.

**The dock plane — where the band module ends and the body begins [added 2026-07-30].** **After the filters, before the LNAs.** The filters are the band-defining electrical part and belong module-side; the LNAs go body-side because three of them on one board share a thermal environment and drift *together*, and correlated drift calibrates out while differential drift does not. The elements are **never combined in RF** — combining destroys the phase differences that *are* the bearing. Everything downstream of the elements therefore triplicates: three couplers, three filters, three LNAs, three matched runs, all identical, because any difference between paths presents as a bearing error.

The objection to an RF dock is connector phase repeatability: the budget is ±6 mm of differential electrical length, about **±9° of RF phase at 851 MHz**, for a 3° bearing target. **The calibration tone answers it** — inject on the *array side* through small couplers, and the dock connectors sit inside the calibration loop, self-nulling at every power-up. That also settles the previously open question of where to inject. Each module carries its own **array manifold in an EEPROM** with a serial number, so docking a VHF array makes the body load that module's calibration and retune the channeliser — which makes the multi-band claim demonstrable rather than aspirational.

**Bonus, with one correction:** because the three streams stay separate to the converters, they can be combined *digitally* for ~**4.8 dB of array gain** on the decode path while leaving per-element phase intact for DF. It must be a **co-phased** combination, not a plain sum — an earlier statement here said "summing," which is wrong: three elements arrive with phase offsets, so a raw sum has direction-dependent nulls and can be worse than one element. The gain comes from **maximal-ratio combining**, which estimates each element's complex channel response by cross-correlating the streams and needs no geometric bearing or manifold. An RF combiner would have forced a choice; a digital one does not. The same streams permit beamforming to null an interferer — but that is post-ADC and **does not rescue the dynamic-range problem**, since an interferer that already saturated the converter cannot be recovered in software. Rejected: putting the transceiver in the band module. Technically cleanest (no RF crosses the dock, and a shared clock reference would be common-mode and cancel), but it duplicates the AD9361 and FPGA per band and destroys the common-body economics. Full treatment in `docs/hardware-design.md` §3.1a.

**Custom, standard RF engineering: the analog chain.** Antenna matching, band-pass filtering, LNA for RX, and (licensed/TX mode only) a power amplifier stage and duplexer/switch. Components are largely catalog parts; the custom work is PCB-level integration tuned to the target bands/power levels — the kind of work Orb Aerospace's own "Principal RF Engineer" job posting covers.

**Off-the-shelf, consolidated: baseband compute.** A Jetson-class embedded compute module handles both P25 signal processing (demodulation, TSBK parsing) and hosts the local AI classification fallback (Section 8) — one module doing double duty.

**Custom, where the real effort concentrates: firmware/software.** P25 CAI demodulation and TSBK parsing, analog FM demod, encryption/decryption for the crypto panel, key management, and (TX mode only) the P25 modulator/encoder. All software on the off-the-shelf compute stack — not new hardware.

**Finalized decisions:**
- **Ethernet** for the connection between the P25 Orb module and the base ARC Edge unit.
- **Dedicated power supply** for the Orb module, separate from ARC Edge's own battery budget.
- **Power draw:** dominated by two components — the radio (transceiver + RF analog chain) and the Jetson-class compute. Ethernet PHY and any secure key-storage element are real but negligible additions. **RX-only mode is genuinely lean** (no power amplifier active); licensed/TX mode draws meaningfully more, since RF power amplifiers are typically the single largest draw in any transmitter — a real power-budget distinction, not just a regulatory one, reinforcing RX-only as the lean default rather than a stripped-down compromise.

**Hearing what the network missed — design analysis, not built [added 2026-07-30].** The strongest capability argument the architecture has, and **none of it is implemented in the PoC** — the demo engine consumes an event stream and knows nothing of signal strength. The asymmetry: a subscriber transmission fails when it is too weak *at the tower*, which may be 10 km away, while the Orb is on scene perhaps 100 m from the officer. Path loss goes as r^n with n≈2 free-space and 3–4 in built-up areas, so a 100× range advantage is worth **~40 dB at n=2 and ~60 dB at n=3** — the harsher the environment, the larger the Orb's advantage. **The Orb is not a better receiver than the network's, it is a closer one.** Three thresholds apply, and only the last is a cliff: *detect* (energy), *recognise* (sync correlation — works below decode), *decode* (FEC+CRC, all-or-nothing, yields unit ID and talkgroup). **DF needs only the first two: the Orb can bear on a transmission it cannot read.**
- **Case A — a P25 request the trunk never answered.** Decodable if heard, yielding source unit ID, talkgroup, service and emergency bit on a transmission the network never registered. Failure also produces *more* transmissions than success, because the uplink is slotted random-access and an unanswered radio retries under backoff [Inferred]. And hearing a request with **no grant, queue or deny following it** is itself a new detection class, distinct from the Deny/Queue "blocked attempt" the engine already models — a blocked attempt means the trunk *heard* you. **Unblocked as of 2026-07-31** — an earlier revision noted this was gated on uplink coverage the design lacked, since the captured slice spanned downlinks only. The receiver architecture now devotes an entire coherent group of three phase-coherent chains to the uplink (`docs/hardware-design.md` §3.3), so a request the trunk never answered is both **audible and locatable**. Still not built in software: no engine work consumes it (`docs/software-prd.md` §1.1a).
- **Case B — an analog transmission too weak to understand.** Easier in every respect and **needs no architectural change**: 8TAC95D is simplex direct, so subscriber transmissions are already in the captured slice; FM degrades gracefully with no threshold cliff; carrier detection works far below intelligibility; a bearing needs a carrier, not intelligibility. The limitation is **identity** — analog carries no inherent unit ID unless the fleet sends an MDC-1200-class ANI burst at PTT, which is FEC-protected and may decode when speech does not [Assumption — agency configuration, and possibly absent on supervised TSICP channels]. Do not claim transcription works on static. The defensible claim: *"an unintelligible transmission occurred on the tactical channel, at this time, from this bearing, with this unit ID if the fleet sends one."*

**Timing figures that constrain the above [researched 2026-07-30]:** a P25 Phase 1 FDMA control channel runs 9600 bps with a 196-bit TSBK, so a signalling block is **~20 ms** and a full inbound burst with sync and NID is **~30–35 ms** [Confirmed for the rate and block size; the full-burst total is arithmetic on the standard frame structure — Inferred]. A Phase 2 TDMA control channel uses inbound slots reported at **1.778 ms** [secondary source, Inferred]. **These are tens of milliseconds, not fractions of a second** — roughly an order of magnitude shorter than voice. Consequences: decode and detection are unaffected; DF on a signalling burst is a single snapshot with no temporal-stability quality metric available (Section 10); and the RF-switch-matrix option's justification had to be corrected, since it had been argued on "transmissions last seconds," which is true of voice and false of signalling.

**Genuinely open — flagged, not invented:** physical enclosure integration into ARC Edge's existing Field Kit chassis needs Orb Aerospace's actual mechanical specs. Exact internal interface beyond "Ethernet" and precise power budget numbers need their engineering input.

**Open, and ours: capture width versus weak-signal sensitivity.** Wideband capture cannot filter a strong in-band signal out before the ADC, so **the strongest signal in the slice sets the gain** and everything weaker descends toward the quantiser floor. A 50 W vehicle radio at 30 m and a 1 W handheld inside a building can differ by 60–80 dB; a 12-bit converter offers ~74 dB theoretical. Decimation returns processing gain (~23 dB narrowing 2.5 MHz to 12.5 kHz) but does not rescue this, because the quantisation noise the strong signal forced on the slice lands in every channel extracted from it. **A wider slice monitors more channels and is more likely to contain the aggressor that blinds it to weak ones** — which is in direct tension with the weak-signal capability above. No dynamic-range budget has been computed. [Assumption]

**What Fable can usefully produce:** a written architecture spec — block diagram, component selection with rationale, an illustrative bill-of-materials with real part families. Not real RF simulation or PCB layout. Frame as conceptual architecture for the pitch, not a procurement-ready design.

## 10. DF/Triangulation — Scoped as a Non-Demoed Bonus Artifact

**Scope:** real, working logic for multi-Orb direction-finding, generated as a standalone artifact — written explanation, real runnable code, a small standalone test of its own. **Not integrated into the live two-tab demo**, which simulates a single P25 Orb doing basic transcription/classification only. **Priority: explicitly lower than the core demo** — first thing to trim if effort/budget gets tight.

**AOA mechanism:** a single antenna element has no inherent bearing sensitivity. A bearing requires either a rotatable directional antenna (impractical, moving parts) or a fixed multi-element array, computing angle from phase/amplitude differences. Either way, the raw measurement is relative to that unit's own antenna reference frame — converting it to an absolute bearing (relative to true/magnetic north) requires an onboard magnetometer/digital compass on **each** unit, ideally with IMU tilt compensation. This is a required hardware component for the DF-capable configuration specifically, not the base RX-only unit — a standard, cheap, off-the-shelf part (9-axis IMU+magnetometer, the same class used in any drone or phone).

**AOA vs. TDOA:** AOA needs the antenna array + magnetometer/IMU, but produces a fix from as few as two stations, matching the stated design goal. TDOA needs no antenna array or compass at all — just precise time synchronization (GPS-disciplined clocks, likely needed anyway) — but typically wants 3–4+ stations for a good, unambiguous fix. AOA remains the right choice given the two-station design goal.

**Third element and enclosure — corrected 2026-07-30.** A two-element array has a front-back ambiguity (phase difference alone gives two mirrored candidate directions). A third, non-collinear element resolves it — **but only if the three elements are non-collinear in the HORIZONTAL plane.** An earlier revision of this section specified a lid opening to vertical, carrying a triangular array in a vertical plane. That does not work, and the reason is worth stating because it is not obvious:

> If all three elements lie in a vertical plane, every baseline vector between them has zero component along the horizontal axis perpendicular to that plane. Azimuth φ therefore enters the phase measurement only as cos φ, and cos(φ) = cos(−φ). Signals arriving from mirrored azimuths produce identical phase on every baseline. Adding further elements within that plane changes nothing — the ambiguity is a property of the plane, not of the element count. Vertical separation buys elevation discrimination, which this application does not need.

**Corrected arrangement [design decision]:** the lid opens to **180°, horizontal**, and three **folding vertical dipoles** on its inner face deploy upright, forming a horizontal triangle. Vertical elements match P25's vertical polarisation. Key parameters:

- **Element spacing ≈ λ/2** — 17.6 cm at 851 MHz. Spacing above λ/2 produces phase ambiguity; well below it loses accuracy into the noise. An equilateral triangle of 17.6 cm sides occupies roughly 18 × 15 cm and fits a shallow-lidded storm case comfortably.
- **Elements ≈ half-wave sleeve dipoles, ~17 cm.** Balanced, so nothing in the lid needs to act as a ground plane. The element base is lifted to the system's top plane by the fold-hinge (below), and the sleeve's lower arm then carries the phase centre a further ~8.5 cm above that. A quarter-wave monopole was considered and rejected: it requires its ground plane at the element base, which would put a conductive sheet under all three elements.
- **Band-limited by physics.** Sized for λ/2 at 800 MHz, the array stays unambiguous at 700 MHz and works with degraded accuracy at UHF (~0.27λ). It is **unusable at VHF**, where λ/2 is 97 cm. The base RX-only unit remains all-band; **the DF configuration is a 700/800 MHz capability** and must not be described otherwise.
- **Triangle orientation: apex inboard [design decision].** Two elements outboard at the far edge of the lid, one inboard near the centre hinge. Two consequences, both favourable: combined with the deployment orientation rule below, **only one element sits in the case body's shadowed sector** (the opposite orientation puts two there); and the two outboard feed runs converge under the inboard element and exit together through the centre hinge, making them **mirror images and naturally matched in electrical length**, which is what the ~6 mm phase-match constraint needs. Only the short inboard feed needs deliberate length-matching, done by meandering it — the same equal-length routing exercise as any matched digital bus.
- **Only the centre hinge carries signal [design decision].** Of three lid hinges, the outer two are purely structural. Each signal-carrying hinge needs flex-life engineering, strain relief and IP67 sealing, so concentrating that in one place beats any routing convenience a second would buy.
- **Shallow lid, with the fold-hinge setting the depth [design decision].** Opened flat, the lid's *rim* lands exactly on the body's top plane; the lid's *interior floor* is one lid-depth below it. The design exploits this: lid depth is set by the **antenna fold-hinge barrel diameter** (nothing else needs to fit — elements stow lying flat and are thinner), and the barrel is chosen to largely fill that depth, so its top sits near the rim. The erected sleeve therefore starts at approximately **the top plane of the whole open system**. Consequence: **no risers are required** — the hinge does the lifting, having had to be there anyway. Illustratively, a ~25 mm hinge/lid depth on an 11 cm body puts element bases at ≈ 11 cm and sleeve electrical centres at ≈ 19.5 cm, roughly 8.5 cm clear of the body. [Assumption — depends on final hinge and case selected]
- **No metal in the lid beyond the hinges [design decision].** Sleeve dipoles are balanced and need no ground plane, so the carrier plate is a purely structural dielectric — **G10/FR4 class, explicitly not carbon fibre**, which is conductive. The governing spec for any dielectric in the near field is **moisture uptake** rather than loss tangent: a material that absorbs water shifts permittivity with humidity, drifting each element's phase differently and producing a weather-dependent bearing error. Nylon and acetal are disqualified on that basis. Exposed dielectric needs UV-stable coating.
- **Array manifold calibration [design decision].** Because the case body sits in a *fixed, repeatable* relationship to the array, it is not interference but part of the antenna. It is handled by measuring the array manifold — each element's complex response versus angle, with the body attached — on a range, and using that in the solver. Same treatment absorbs the hinges, plate and feed routing. Cost is one-time-per-design range time, per band, and it is what makes hinge symmetry a hard requirement rather than good practice.
- **Deployment orientation rule [design decision]:** place the unit with the **case body behind and the open lid facing the area of operations.** Calibration corrects a known bias; it does not restore signal the body blocked. Note this is about signal quality only — the magnetometer gives absolute orientation whichever way the case faces — and it is *not* an ambiguity-resolution mechanism, since three coherently sampled elements have no azimuthal ambiguity.
- **Self-bearing lid, no kickstand** [design decision]. The hinge carries the cantilevered lid. This is a stiffness requirement rather than a strength one, and specifically a **torsional** one: uniform bending tilts the array plane, which the IMU sees and the solver corrects, whereas twist deforms the triangle in a way the IMU cannot observe. Mitigation: mount the three elements on a **rigid carrier plate** so the triangle's internal geometry is set by the plate rather than by the lid moulding.
- **IMU/magnetometer in the lid**, with the array, so it measures the array's actual orientation continuously. This is what makes lid-angle precision a non-issue: the horizontal projection of the triangle compresses by cos(tilt), which is 0.94 at 20° off flat. The design degrades gracefully, unlike the vertical arrangement, which fails completely.

**Hinge** [design decision]: engineered rather than stock, since hinged connectors to the device body are being built regardless. Stock storm cases open to roughly 100–110°, not 180°. The hinge carries the structural load, a hard stop at 180°, and the RF and data feeds. **Feed phase stability across the hinge is a real interferometry constraint** — three coaxial runs must hold matched electrical length to roughly 6 mm to stay inside a 3° bearing budget at 851 MHz. Route cables along the hinge axis so articulation is torsional rather than bending, and include an **injected calibration tone** measured through all channels to null residual differential phase. [Inferred — standard DF practice, not verified against a specific design]

**Combined enclosure — now the design intent, and still a distinct configuration from the confirmed one [decided 2026-07-31].** The full P25 Orb assembly is: a **conjoined body** — the processing body built as a factory-assembled bolt-on to the ARC Edge unit — living in the **trunk of the storm case**, which **slots into the chosen band module** whose lid carries the antenna array. This resolves what was previously an open integration question (Section 13, item E). Two caveats to state plainly rather than gloss: it requires **Orb Aerospace's agreement** to a factory bolt-on and their mechanical interface specification for the ARC Edge body; and the confirmed ARC Edge Field Kit is a **soft-sided IP67 backpack, not a hard case**, so the storm case is our proposed configuration and must not be presented as their existing product.

**Residual issue, honestly flagged — and substantially de-risked.** Opening the lid flat places the case body *beside* the array rather than beneath it, where the vertical arrangement had been azimuthally symmetric. Three things reduce this to an acceptable trade rather than a defect: the hinge-lifted sleeve geometry puts element electrical centres roughly 8.5 cm above the body; the fixed body/array relationship makes the scattering a calibratable manifold rather than interference; and the deployment orientation rule keeps the degraded sector away from the area of interest. What remains genuinely unresolved is the **magnitude** of the residual bearing error by sector, which is a simulation-and-measurement question. **No figure should be quoted for it until measured.** [Assumption]

**Bearing error budget — the calibratable terms are not the dominant ones [added 2026-07-30].** Everything above concerns errors the hardware causes, and those are the small ones: roughly 1–2° each from the array manifold and from deployment geometry, plus sub-degree thermal/SNR phase noise that averages down over a transmission lasting seconds. The two largest contributors are supplied by the environment and survive any amount of bench characterisation:

- **Multipath.** A specular reflection off a glass or concrete face arrives with high SNR and stable phase. The array measures it correctly and reports it confidently, pointing at the wall rather than the officer. It is a wrong answer delivered with conviction, and it is not zero-mean, so it does not average out. Corollary that must be stated whenever the solver's `1/σ²` weighting is described: **a quality metric derived from signal strength will actively favour the reflected path.**
- **Magnetometer bias from the deployment site.** A systematic offset on every bearing that unit produces, different at every incident. See below.

Two consequences for how the multi-station story is told. **Two stations cannot detect a corrupted bearing at all** — two non-parallel rays always intersect, so the residual is structurally zero and a wrong fix looks perfect; this is why `df/aoa_fix.py` reports two-station fixes without a residual claim. **Three stations detect it but cannot identify the culprit** — dropping any one of three leaves a pair that intersects exactly, so three incompatible explanations each fit their own evidence perfectly. Naming the bad bearing needs a fourth station, outside knowledge, or a quality metric independent of signal strength. One good candidate for that metric is specific to this product: **bearing stability across the transmission.** P25 voice runs for seconds, a direct path holds steady, and a two-path sum wanders as the scene moves. [Inferred — mechanism is standard, discrimination unmeasured.] Full budget with cross-range figures in `docs/hardware-design.md` §5.7.

**Magnetic heading integrity — PENDING, nothing selected [open].** Hard-iron and soft-iron distortion from the unit's *own* materials is a solved bench-calibration problem. Distortion from the *site* — a parked fire truck, a steel door, rebar underfoot — cannot be calibrated in advance because the disturbing mass cannot be rotated away. Four candidate approaches are documented in `docs/hardware-design.md` §5.8: World Magnetic Model magnitude/dip gating (software only, detects but does not quantify); **magnetic gradiometry** (option B, now specified in detail); bearing residuals against known-position emitters (measures the actual bias in degrees, needs such emitters to be audible); and dual-antenna GNSS heading (immune to magnetics, but the lid baseline is short for the technique). **None is chosen.** An operational stand-off rule is worth writing into field documentation but is not a substitute, because it fails silently.

The gradiometry option has been worked out far enough to cost and prototype, and its shape is worth carrying: **one IMU plus two *matched dedicated* magnetometers**, not a second 9-axis part. A gradiometer's noise floor is set by mismatch between the two sensors rather than by either one's absolute accuracy — against Earth's ~48 µT, a single degree of relative axis misalignment fabricates ~0.84 µT of phantom gradient, roughly half the real signal being hunted. Matched parts from one reel drift together and that drift subtracts out. Placement is **both magnetometers at the outboard lid corners** (baseline set by the lid, ~30–40 cm, not by the 17.6 cm array) with the IMU at the centre-hinge junction; mirror symmetry is worth more than the longer diagonal baseline, because symmetric error is common-mode in a differential measurement. The busiest electrical location gets the IMU, whose orientation job is indifferent to magnetic fields. **The real cost is not the BOM but a per-unit factory cross-calibration step** — a recurring manufacturing-test cost rather than one-time engineering. This decision has a deadline: it must be settled before lid and carrier-board layout, and it depends on the triangle orientation and rigid carrier plate already fixed above.

## 11. PoC Demo Specification

### Two-tab structure

- **Tab 1 — RF environment / ground truth.** Plays a scripted timeline of simulated P25 events (Channel Request, Grant, Queue, Deny, garbled/cut-off transmissions) — raw chaos, no interpretation.
- **Tab 2 — OSC's ARC Edge control panel.** The same events, delivered as ARC Edge actually presents them: live digest feed, two-tier alarm panel, command view.

Both driven by the same underlying scripted event timeline. Tab 1 is the source of truth, broadcasting each event to Tab 2 in real time via the browser's `BroadcastChannel` API — Tab 2 genuinely reacts live, not a separately-timed replay.

### Demo script beats

1. Calm baseline — routine traffic, normal Grants.
2. Congestion builds — Queued/Busy indicators climb.
3. Blocked-attempt burst — multiple units Denied/Queued simultaneously.
4. A partial, garbled transmission cuts off mid-word ("shots f—") → **Suspected** alert fires.
5. A simulated status check to that unit goes unanswered → alert sustains/escalates.
6. A separate unit's "officer down" gets through, corroborated by `TX EMERGENCY` → **High-Confidence** alert.
7. Resolution — the Command view shows the synthesized picture reaching the OSC, despite the chaos in Tab 1.

### Build scope — what's real vs. simulated

**Real, working code:** the detection/synthesis/alarm engine — a state machine ingesting classified P25-shaped events, applying the two-tier corroboration logic, tracking status-check timeouts, producing the digest. This is the actual pitch, running live, not a scripted UI illusion.

**Simulated, but not because of any ARC Edge access limitation — no radio hardware exists for this demo regardless:** Tab 1's event feed is a scripted timeline, using accurate P25 terminology and data shapes, feeding the real detection engine.

**Simulated because it's genuinely ARC Edge's undisclosed IP:** the actual DMPO path-scoring algorithm and multi-path relay implementation — represented narratively in the Command view ("relayed via Starlink, DMPO-selected"), not as implemented logic.

**Not built for this demo at all (see Sections 6, 9, 10 for why):** live audio pass-through, any licensed/TX-mode capability, DF/triangulation, the Existing-Radio Interface tier, an interactive Control Panel.

## 12. Roadmap / Future Capabilities (consolidated)

- Existing-Radio Interface tier — fleet-wide network-reach expansion, smaller-agency market.
- Licensed/TX-enabled P25 Orb mode — active bridging/relay plus a P25-based last-resort status/heartbeat channel (not a general DMPO data path — see Section 4).
- Cross-band bridging repeater, IP-audio-to-P25 patch, TTS broadcast — all licensed-mode, COML-supervised.
- DF/triangulation — multi-Orb direction-finding, standalone artifact.
- Combined Pelican-style enclosure — a distinct product SKU pairing ARC Edge and P25 Orb with a lid-mounted antenna array.

## 13. Open Items / RFIs

### Resolved since first drafted

- **Dispatch console interconnect [Resolved — direct domain knowledge]:** the agency's dispatch console is a base P25 radio with a roof antenna, controlled via Windows console software — the standard, foundational software-controlled-base-station pattern, not the TSICP's cross-band patching scenarios specifically (those bridge two different bands together; this is one radio, one band, software-operated instead of hardware-control-head-operated). **Implication:** this directly validates the IP-audio-to-P25 patch concept in Section 6 — "software driving a P25 transmission" isn't a novel proposal, it's how real dispatch centers, including this one, already operate today. The Orb's IP-audio patch is an incremental extension of existing, familiar infrastructure, not new territory.
- **Shield AI/V-BAT joint exercise [Resolved — status clarified, not a research gap]:** told directly by Orb Aerospace's own company leadership, not found in public research because it's genuinely confidential, not because it's doubtful. Appropriate to reference in the pitch specifically because the audience *is* the source — but attribute it accurately as direct knowledge from conversations with the company, not as something independently verified or publicly documented, if used.
- **Hot Mic emergency-priority behavior [Resolved — direct account, department TAC, Seguin PD]:** the e-tone triggers a real, elevated-priority Hot Mic transmission (not just an automated PTT press), lasting 15 seconds, on a channel pre-programmed by the officer's own local TAC — which may differ from the channel or even the P25 network the current incident is using, especially for mutual-aid/out-of-town officers (e.g., San Antonio runs its own P25 network, not LCRA, despite sitting inside LCRA's coverage footprint). Sections 4 and 6 have been updated to reflect this precisely: emergency *declaration* is trunk-wide control-channel signaling and always detectable; emergency *audio content* is only captured if the Orb's scanning/control-channel-tracking function successfully follows the signal to wherever it actually lands, which may be outside the currently-monitored trunk entirely.

### Still open — only Orb Aerospace could answer these

Acknowledged gaps, not failures of research — consistent with receiving no technical documentation by design. Awaiting response before finalizing:
- Physical enclosure/mechanical integration specs for the confirmed Field Kit chassis.
- The exact internal interface protocol/data format beyond "Ethernet," and precise power budget numbers.

### Graded and largely closed [reclassified and decided 2026-07-31]

An earlier version listed everything as equally open. After grading and a round of executive decisions, **one genuinely open engineering question remains.** `docs/hardware-design.md` §7 carries the detail.

| | Item | Status |
|---|---|---|
| **A** | FPGA/Jetson division of labour | **Closed by analysis.** Stages 7–9 FPGA, stage 10 onward Jetson; 10 and 11 cannot be split. Only sizing remains |
| **B** | Third coherent receive chain + uplink coverage | **DECIDED — ADRV9026.** Four coherent receivers on one die with on-chip multichip sync, 200 MHz bandwidth. Two synchronised AD9361s are the fallback. Decided on reliability, not a completed costing |
| **C** | Magnetic heading integrity | **Hardware DECIDED** — §5.8 option B: two dedicated magnetometers at the outboard lid corners, IMU colocated with the inboard element at the centre hinge. Storm-case modules only; VHF explicitly out of scope. Validation still open |
| **D** | **Dynamic-range budget** | **The only genuinely open engineering question.** See below |
| **E** | Enclosure integration | **RESOLVED by design intent** — see below |
| **F** | Interface above Ethernet | **Notionally satisfied, descoped** for this assignment. A real question for a real programme |
| **G** | Power budget | **RESOLVED** — a few hundred watts from a patrol vehicle or field power bank |
| **H** | Equipment authorisation | **Notionally satisfied, descoped** for this assignment |
| **I** | Vocoder licensing | Genuinely open. Commercial, single-source, not ours |

**E — the enclosure, resolved by design intent [2026-07-31].** The processing body and the ARC Edge unit live together as a **single conjoined module inside the trunk of the storm case**. The processing body is built as a **factory-assembled bolt-on to the ARC Edge body**, and the pair slots into the chosen band module to form a complete P25 Orb assembly. Two things this does *not* resolve, and both should be stated plainly: it requires **Orb Aerospace's agreement** to a factory bolt-on and their mechanical interface specification; and it means the product form factor is the **storm case, not the confirmed soft-sided backpack Field Kit**. The case is design intent, not a claim about their existing product.

**G — power, resolved, and it unlocked B.** The deployment assumption is a few hundred watts from a patrol vehicle or field power bank. Against a receive-only draw in the tens of watts that is comfortable. **The order matters: the power envelope had to settle before the ADRV9026's reliability argument could win**, because 5–7 W was a serious objection against a backpack battery and is not one against a vehicle supply. It also changes the receive-only argument from a feasibility claim to an endurance one.

**D deserves promoting, because it was missing from earlier lists and it now stands alone.** Wideband capture cannot filter a strong in-band signal before the converter, so the strongest signal in the slice sets the noise floor for every channel extracted from it. A 50 W vehicle radio at 30 m and a 1 W handheld inside a building can differ by 60–80 dB against a converter offering about 74 dB. **This directly bounds the weak-signal sensitivity that the subscriber-side capability depends on** — the second tier of this document's own headline claim. No budget has been computed. **It is the only open item that constrains a capability the product is actually sold on.**

### Still open — commercial, not technical [added 2026-07-31]

- **Vocoder licensing.** Decoding P25 *voice* requires IMBE (Phase 1) or AMBE+2 (Phase 2), both proprietary to Digital Voice Systems Inc. The open-source implementations that hobbyist projects rely on are not a defensible basis for a commercial product sold to a government customer. Terms, cost, and whether to license software or use a hardware vocoder are all uninvestigated. **This is a single-source supply dependency** — a category of risk the rest of this design avoids by using catalogue parts. It must be resolved before committing to anything that depends on voice content. **It does not affect the demonstrated product**, which reasons entirely on control-channel signalling. `docs/hardware-design.md` §3.5.3.
- **Transcription quality is capped by the vocoder, not the transcriber.** A model-based codec at ~2.4–4.4 kbps discards acoustic detail permanently; speech recognition on vocoded audio is measurably worse than on clean audio, and a better recogniser cannot recover it. An honest ceiling on every transcription-dependent feature, and it should be stated rather than discovered in a trial.

### Still open — ours to answer, and not yet answered

Both affect only the DF configuration. Neither touches the demonstrated receive-only product.
- **The third coherent receive chain.** One AD9361 provides two; a three-element array needs three. Four options with their costs in `docs/hardware-design.md` §5.5. Resolving it needs measurement, not argument.
- **Magnetic heading integrity at a real incident scene [PENDING].** Candidate approaches proposed in `docs/hardware-design.md` §5.8 and summarised in Section 10 above; none selected, costed, or tested.

### Background claim, still not load-bearing in the design

ARC Edge's own claimed P25/Link 16/TAK integration — plausible and consistent with their defense-market framing, but not publicly confirmed; the pitch should present P25 Orb as an extension *we're proposing*, not as something already in ARC Edge's confirmed feature set.
