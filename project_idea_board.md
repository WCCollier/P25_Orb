# ARC Edge Feature — Idea Board (Collaborative)

## Scenario — [You]

**Situation:** A police mass-response to a critical incident in a confined area. Multiple agencies and hundreds of officers and police vehicles all responding to one large high school or similar.

**Problem — Congestion:**

I carry a Harris XL-200 police hand-held radio. I have a typical police Harris radio in my patrol car as well. Every arriving officer is trying to communicate on one or the other of these, as well as by cell phone. The radios use, in the case of our scenario, the Lower Colorado River Authority (LCRA) P25 Phase II Trunked Radio System.

This has extended fallout as more departments try to use drones for interior search and exterior surveillance (security, containment, SA), and needs to coordinate those with manned ISR and other public safety and civil aviation (news helos, medevac helos landing in the AO).

**Limitations on the existing system:**

When large numbers of P25 radios converge on a single location and all try to transmit simultaneously, even on multiple "channels," the TDMA of the trunk is overwhelmed. It doesn't fail gracefully, either. Everyone loses comms entirely. The radios do not fall back on peer-to-peer. The trunk does not have any way to prioritize. It's slammed with buffered transmits, and it just breaks down.

Likewise, the commercial cell service quickly fails or becomes unusably slow or unreliable. Not only has every officer brought his personal and work cell phones to the same location, but all the children inside the school are trying to call out or live stream, and all the parents are trying to call in. Congestion failure.

**For exploration:**

How can bringing in ARC Edge, perhaps a few ARC Edge nodes, start to alleviate this problem, if at all? Can we get ARC Edge to pick up transmit requests from XL-200 and similar P25 radios? Intercept them before they hit the trunk and get mismanaged? Capture them and handle them more efficiently, identify priority transmitters? Reroute comms through a dedicated 5G slice if they need to go outside the AO?

**Initial steps:**

Build a better understanding of P25 radios and 5G cellular handling, generally and under this specific hardship, to see the technical shape of the problem. Then determine if ARC Edge can help and if so how. Would we need a dedicated hardware layer, or could we do this with the ARC Edge tech as it exists, tied into a P25 radio node of its own or otherwise into the LCRA (in this case) backbone?

## Stakeholder Map — [You]

We have several "Customer" stakeholders for an application like this:

- **OSC (On-Scene Commander)** — head of the end-user customer contingent: the officers on scene who depend on that radio to survive. Primary customer *in terms of use* — data and control should flow back to them.
- **LCRA** — customer of contract *if* ARC Edge has to be implemented at the trunk/infrastructure level.
- **TX DPS / TPWD / a county or local agency** — customer of contract *if* ARC Edge is something that can be brought in and deployed dynamically to sort out an incident's comms in real time, i.e. the agency that owns and brings the ARC Edge hardware and know-how to take over the comms situation quickly.

## Technical Notes — [Claude]

### Deployment model recommendation

We confirmed (see `arc-edge-research-notes.md`) that the real ARC Edge product ships as a Field Kit — IP67 ruggedized backpack, <5 min deployment. That's hardware built for "bring it and stand it up now," not "bolted permanently into LCRA's trunk infrastructure." Combined with ARC Edge's own stated "deployable lifeline for crisis response" mission framing (vs. their separate "persistent infrastructure hardening" framing), this points toward:

- **Customer of contract: TX DPS, TPWD, or a county/regional agency** — the entity that owns and deploys the kit.
- **End-user champion: the OSC** — the person the system needs to visibly serve on-scene, and who should receive the arbitrated comms picture back.
- **LCRA: an interop constraint, not the buyer.** The pitch needs to be honest that ARC Edge is working *around* the existing trunk, not replacing or being installed into it.

This also keeps the PoC scope realistic — a fixed trunk-level integration would require cooperation/access we can't assume for a take-home project; a dynamically-deployed kit is self-contained and demoable.

### On "arbitration" — a precision worth keeping in the pitch

True channel-access arbitration (who gets a trunk slot, in what order) is controlled by the P25 system's own site/zone controller per the TIA-102 standard. An outside device can't override that without being integrated as an authorized infrastructure participant (e.g. via ISSI or a console patch) — which conflicts with the "dynamically brought in" model above. Claiming literal trunk control in the pitch would be an easy thing for a technical panel to poke a hole in.

**Correction (superseding the original "overflow bridging" framing below):** confirmed directly from the XL-200 manual, a Denied or Queued Channel Request produces no voice RF at all — the radio never switches to a traffic channel. There is no audio anywhere to "bridge" for a blocked attempt, because it never existed as a signal. The mechanism actually available:

1. **Detection and reporting of blocked/queued attempts** (Tier 1, unchanged) — the fact that an attempt was blocked is real, valuable SA in its own right. Not a lesser version of relaying content — there's no content to relay.
2. **Control-channel monitoring** — P25 control channels broadcast call setup/talkgroup activity. A properly configured radio interface on the ARC Edge kit could observe this for situational awareness (who's trying to transmit, what's congested) without needing to control the trunk itself.
3. **Native emergency-signal awareness, precisely stated** — an emergency declaration is still a channel request, subject to the same Grant/Queue/Deny reality; it can still be blocked under severe enough congestion. What's guaranteed is detection and reporting of the emergency status, not that its audio necessarily gets through. If it does get any channel time (even partial/Hot-Mic), that audio is real and relayable like any successful transmission (see below) — but "guaranteed a path" overstated it.

### Live audio pass-through — a real capability we'd underused [You/Claude]

Any transmission that *does* get a Grant — on the P25 net or the analog fallback channel — produces real audio, not just a metadata event. Beyond synthesizing that into the AI digest (already built), the P25 Orb can **flatten both receives into a single live digital audio stream, available over its own IP interface to the rest of the ARC Edge network.** Pure RX, no licensing dependency — fits the unlicensed tier cleanly, and is a genuine capability, not a rebrand of detection.

### Cross-band bridging repeater — licensed/TX-mode-only capability [You/Claude]

Ties directly back to research already on file: the TSICP's own "Interoperability Cross-Band Systems" section (Simple Cross-band Repeater, Mobile Tactical Interconnect, Dispatch Console Patching) describes exactly this pattern — repeating audio between two bands. The P25 Orb, in licensed mode, could automate this between its configured P25 channel and its configured failover analog channel. Requires transmitting on at least one band, so licensed/TX-enabled tier only — and per the TSICP's own rule (already documented above), any such cross-band patching must run under positive control of a trained dispatcher or COML, not autonomously.

### IP-audio-to-P25 patch and TTS broadcast — extending the same licensed-mode capability [You/Claude]

- **Not a new invented capability — the TSICP's own Section 9.3, "Dispatch Console Patching," already describes this pattern**: a console's audio patched onto a radio channel so dispatch can speak directly into the net. This is that same pattern implemented as a soft/IP-based console instead of a physical one — the Orb accepts an audio stream over its existing Ethernet interface, encodes it, and transmits as P25 voice. Same pipeline as the cross-band repeater above, just with one side being IP audio instead of a second RF band.
- **Closes a previously-flagged limitation, explicitly.** The base RX-only tier was scoped as uplink-only ("there's no path back to the officer's radio... a response from HQ has to travel some other way"). This is that other way — but only in licensed/TX-enabled mode, same gate as the cross-band repeater. The RX-only core PoC stays uplink-only, unchanged.
- **Text-to-voice** is a sound, small extension of the same pipeline — TTS-generated audio substituting for live human voice as the input, no new architecture required. Most valuable framing: not a replacement for a dispatcher speaking live (they'd use the IP-audio patch directly, faster than typing), but for standardized, automated, system-triggered announcements. The elegant version: the detection engine itself triggers the broadcast — congestion detected → automated "switch to talkaround" announcement onto the fallback channel — closing the loop between detection and actionable guidance through the same device that did the detecting, with no human in the loop for that specific message.
- **Access control flag, stated plainly, not assumed:** anything that can inject synthesized voice onto a public-safety net needs real authorization control — only an authorized dispatcher/OSC should be able to trigger it.
- **Scope:** both capabilities are licensed/TX-mode-only, same as the cross-band repeater — roadmap material, not part of the RX-only core PoC.

### Resolved from earlier open questions — [You]

- LCRA participants run almost entirely unencrypted ("in the red") — crypto is too expensive for most agencies on the system.
- Local officers are **not** currently trained to a fallback/talkaround channel, but per the state plan (below) they technically are supposed to be.

### TSICP research — official designated fallback channels [Claude]

Pulled the actual Texas Statewide Interoperability Channel Plan (TSICP v24.2, Sept 2024) and its compliance checklist directly from Texas DPS. This confirms the Tier 2 mechanism from before isn't a hypothetical — it's a channel that already exists and is officially designated for exactly this failure mode.

**The direct/talkaround channel for our 800 MHz scenario is `8TAC95D`.** Per-band equivalents: VHF = `TXCALL1D`, UHF = `UTAC42D`, 700 MHz = `7GTAC57D`. From the plan itself (Section 2.3):

> "Agencies are encouraged to place the appropriate mobile-to-mobile direct channel in the highest channel position (typically '16') in each radio zone... **This can be particularly valuable in emergencies when units lose coverage from their local system due to distance or building penetration factors. It is very important to train on the use situations of your portable and mobile radio.**"

That's the state itself, in writing, describing the exact gap you identified — the channel and doctrine exist, but training on it isn't guaranteed. That's the opening for our feature, not a hole in the pitch.

**A few more load-bearing details from the plan:**

- **The priority scheme already exists — we're not inventing it, we're enforcing it.** Section 2.1 codifies six priority tiers for interoperability channel use (imminent danger to life/property is #1, on-scene tactical is #6). Current trunk hardware has no mechanism to actually enforce this ordering under load. That's precisely the gap ARC Edge would fill.
- **Cross-band bridging is legal but requires a human in the loop.** Section 9.2/9.3 explicitly permits gateway/patch behavior between bands, but only "under positive control of a trained dispatcher or on-incident Communications Unit Leader (COML)," who must be able to kill the patch on demand. **Design implication: our feature should be COML-supervised, not fully autonomous.** This is a strength for the pitch, not a limitation — it respects the existing governance structure instead of claiming to override it.
- `8TAC95D` is capped at 20W ERP, mobile/portable only, no base stations permitted — matches the ARC Edge Field Kit's backpack form factor exactly.
- LCRA appears by name in the actual P25 Unit ID allocation table (8M range) — the scenario is grounded in the real plan, not just plausible-sounding.
- 13M range is reserved for "system level temporary usage (ISSI)" — confirms ISSI is the real infrastructure-level interop mechanism in Texas, for reference if a future/fixed-deployment version of this feature is ever discussed.

Sources: Texas Statewide Interoperability Channel Plan v24.2 (dps.texas.gov), TSICP Compliance Checklist (Jan 2018, dps.texas.gov).

### How P25 scanning actually works, and what that means for detection [Claude]

**Can a non-participant actually hear the traffic?** Yes, on an unencrypted ("in the red") system — which you've confirmed is nearly all of LCRA. A P25-capable scanner works by tracking the control channel to learn which frequency a given talkgroup is currently active on, then following it — it never needs to be an authorized system participant, register as a subscriber, or hold any keys. This is off-the-shelf technology (Uniden, Whistler, and the open-source SDRTrunk project all do this today). Legally, receiving unencrypted public safety radio is protected under federal law (no reasonable expectation of privacy on an unencrypted transmission) — some states restrict *using* a scanner while committing a crime, but reception itself is legal.

**If a system does encrypt, what survives?** Only the voice payload is denied. A P25 monitor can always extract call-setup metadata regardless of encryption: WACN, System ID, NAC, RFSS ID, Site ID, unit ID, talkgroup, and per-transmission signal quality (RSSI, bit-error-rate). This is good for the design: Tier 1 detection (who's trying to transmit, how urgently, whether it's succeeding) doesn't depend on hearing voice content at all, so it would keep working even if an agency later adopted encryption.

### Confirmed at the radio: no store-and-forward for voice, and exactly how "denied" works [Claude]

Pulled the official L3Harris XL-200P operator's manual directly (via the hosted copy on ManualsLib, sourced from L3Harris's own PDF). This confirms — from the manufacturer's own documentation, not inference — the mechanism the whole detection design rests on.

**The documented transmit procedure requires waiting for a Grant Tone before speaking:** "Turn the Group Select Knob to the desired group, then PTT. Wait for the 'Grant Tone.' Once the tone is received, speak into the microphone..." The officer is instructed not to talk until a channel is actually granted — confirming there is no voice audio generated during a blocked attempt for a scanner (or ARC Edge) to intercept, because none is ever produced.

**The three failure states are distinct, named status indicators — not a generic beep:**
- `PTT Denied` — not authorized for that system/talkgroup
- `Call Queued` — request sitting in a wait queue
- `System Busy` — no channels available

These map directly onto the P25 control-channel Grant/Queue/Deny signaling described earlier — the radio is just displaying what the trunk controller told it.

**No voice store-and-forward or buffer-and-burst feature exists on this radio.** Checked the status-message, group-call-transmission, and emergency sections directly — none found. What *does* exist is **TextLink**, a genuine asynchronous store-and-forward feature — but for short text/data messages only (mailbox model, "message waiting" icon), a fully separate subsystem from voice. Not a rescue path for a blocked voice call, but worth knowing it exists on the platform.

**New detail worth designing around: emergency declaration can trigger a "Hot Mic."** Press-and-hold the emergency button → radio displays `TX EMERGENCY` → depending on configuration, the radio can enter an automatic transmit period without the officer touching PTT again. So a declared emergency does generate real outbound audio automatically. **Caveat:** whether that Hot Mic audio receives elevated queue-priority at the trunk-controller level (vs. just automating the PTT press) isn't stated in this manual — that's a reasonable assumption based on general P25 practice, not a confirmed fact from this source. Worth stating as an assumption in the pitch, not a guarantee.

Source: L3Harris XL-200P / XL Series Operator's Manual (l3harris.com, via manualslib.com).

### Down-the-road: DF / triangulation on a struggling or emergency transmitter [Claude]

Two established, non-exotic techniques:

- **AOA (angle of arrival)** — each station uses a directional antenna to compute a bearing to the transmitter; two or more bearings from different locations intersect at a position estimate. Works with as few as two stations; more stations shrink the error ellipse.
- **TDOA (time difference of arrival)** — precise timing sync across receivers; typically wants 3–4+ stations for a robust fix.

"Two or more ARC Edge units" maps directly onto AOA. This is standard, well-precedented technology — the same category used in SIGINT/EW geolocation and search-and-rescue direction-finding, not something novel we'd be inventing from scratch.

**Why it's worth pitching as a future feature:** ARC Edge is already decoding unit ID off the control channel for Tier 1 detection. Pairing that with AOA turns "who's declaring an emergency" into "who, and exactly where" — without depending on the radio's own GPS, which may be absent, dead, or jammed. That's a compelling officer-down locating story that falls out of infrastructure we're already proposing, rather than requiring new hardware investment.

## Product Architecture — Three Hardware Tiers [Claude/collaborative]

### Competitive landscape check

Existing commercial precedent for "relay a P25 radio's audio/GPS/emergency data over IP with network failover" already exists — **Skymira's P25 IP Relay** (taps into the raw P25 stream from any major manufacturer's radio, including Harris, relays audio/subscriber-ID/GPS/emergency-alerts over any IP network with auto-failover) and **Etherstack's RMU25 "P25 Radio Modem Unit"** are both real, shipping products in this space. Confirmed from Skymira's own documentation: it does **not** do congestion detection, priority handling, or dynamic/intelligent path selection — it's reactive failover, not proactive optimization.

This sharpens our differentiation rather than undermining it:
1. **DMPO-grade continuous path optimization** (real-time measured link quality, sub-50ms convergence, no packet duplication) instead of basic reactive failover — applying ARC Edge's actual, more sophisticated tech to a problem space competitors solve more crudely.
2. **Detecting what never got through in the first place** — nothing in what these competitors document suggests they surface *failed* or *blocked* transmission attempts, only successful ones. This is the genuinely white-space angle, and it's the headline "important and unique feature" for the pitch.

### Three hardware tiers

**1. Base ARC Edge** — the existing, unmodified product (cellular/satellite/CBRS/Wi-Fi/mesh, DMPO path optimization). No changes.

**2. Existing-Radio Interface** — a lightweight accessory-port/Bluetooth data connection to *one specific, already-authorized* radio (e.g. a vehicle-mounted unit). Confirmed technically real and established — P25 radios generically support being used as a transparent data modem for an external device, and Skymira/Etherstack prove the pattern commercially, explicitly including Harris radios. This module only sees *that one radio's own* status — it does not do scene-wide detection. Its value is **network reach**: an agency instruments its existing fleet cheaply, extending the ARC Edge mesh's geographic footprint using infrastructure it already owns and is already authorized to use — especially valuable where the trunk's own wide-area coverage exceeds ARC Edge's native commercial bearers.

**3. P25 Orb Add-on** — an RX/TX P25 transceiver module. One hardware SKU, two capability states gated by *authorization*, not by hardware differences:
- **Unlicensed / RX-only:** listens to the *shared* control channel (every radio on the trunk uses it, so one well-positioned unit covers a whole incident) plus the analog fallback channel (`8TAC95D`). This is the scene-wide congestion/emergency detection capability — deployable with zero cooperation from the trunk operator, and it's what makes this genuinely different from the existing P25-IP-relay competitor category.
- **Licensed / TX-enabled:** the *same physical hardware*, once the customer or a trunk operator grants proper P25 authorization and a unit ID — unlocks P25 as an additional DMPO data path and voice relay as needed. Nothing new to ship; a software/licensing unlock on hardware already in the field.

> **[Claude, amendment, 2026-07-24] "P25 as an additional DMPO data path" turned out to be overclaimed — corrected in design-document.md, kept here for the record.** Asked to research whether a P25 trunk (using LCRA as the test case) offers any gateway to the open internet for a device using a connected radio as a modem. Answer: no. Primary vendor/standards sources (Tait's "Specifying Your P25 System" guide; an EFJohnson Phase II white paper authored by the TIA committee chair) confirm P25 packet data tops out around 9.6 kbps regardless of Phase 1 or Phase 2 — Phase 2's TDMA improvement is a voice-capacity feature only, the control channel that actually carries packet data is unchanged from Phase 1 — and is architecturally a closed, mostly dispatch-to-unit management channel (AVL, status messages, text) gatewayed into the trunk operator's own backend, not general internet/bulk-data access. LCRA runs P25 Phase II, so this applies directly. P25 can't function as "another DMPO path" alongside cellular/satellite/Wi-Fi; the honest capability is a last-resort status/heartbeat ping (e.g. "unit OK"/"need backup") when every real DMPO path is down. `design-document.md` Sections 4, 5, and 12 have been corrected to reflect this.

Doesn't need to be co-located with any existing radio — it's listening to a broadcast channel, not tapping a point-to-point link, so a small number of units (potentially just one) cover an entire incident.

### PoC scope — what we're actually building

**Building and demoing: the P25 Orb Add-on, unlicensed/RX-only mode, managing a single-site congestion failure at the LCRA scenario described above.** This is the core, most-differentiated capability and the cleanest to demo in 3–5 hours. The Existing-Radio Interface tier (fleet reach) and the Orb Add-on's licensed/TX-enabled DMPO-integration mode are **not implemented** — described in the pitch as roadmap/future vision, not built or demoed.

## AI Digest & Alert Layer — [You/Claude, collaborative]

Sits entirely in software on top of the P25 Orb Add-on's RX-only capability (control channel + fallback channel + successful-transmission audio content, since LCRA is unencrypted). No new hardware.

### What it synthesizes

- Attempted transmissions and their outcome (Grant / Queued / Denied / System Busy)
- Successful transmissions, including content
- Fallback-channel (`8TAC95D`) traffic
- With 2+ Orb units deployed: approximate sender location via AOA

This is the same "flatten disparate feeds into a unified COP" function ARC Edge already claims to do in its own marketing — extended to a new feed type (P25 voice and control-channel events) rather than an unrelated bolt-on capability.

### Alarm design — two tiers, matching real police doctrine rather than an invented confidence score

- **High-confidence emergency** — corroborated by two or more independent signals: e.g. native P25 emergency-button activation (`TX EMERGENCY`) plus AI keyword detection on audio, or a burst of correlated key-up attempts from multiple different units reacting to the same event.
- **Suspected emergency** — a single, uncorroborated signal: e.g. a low-confidence keyword hit ("shots fired," "officer down") with no confirming signal, or a garbled/inarticulate partial transmission that cuts off abruptly. An abrupt cutoff mid-phrase is treated as a *higher*, not lower, concern.

Deliberately modeled on how police already operate, not inventing new doctrine: officers investigate ambiguous distress signals immediately without waiting for confirmation — the same posture as a missed welfare/status check. The system doesn't need to be certain to be useful; it needs to prompt the same "go check" reflex officers already have for a comrade who goes quiet or sounds off.

### Extension: tracking status-check silence as a corroborating signal

Since ARC Edge is passively listening to all trunk/fallback traffic anyway, it can observe when dispatch or another unit issues a follow-up status check to whichever unit triggered a "suspected" event, and whether that unit responds. Silence after a status check is itself corroborating — it can sustain or escalate a "suspected" alert rather than letting an ambiguous partial transmission quietly fade from the digest after a few minutes. Requires no new hardware and no transmission from ARC Edge itself — it's continued passive observation of an interaction officers/dispatch are already having on their own.

### Scope

Pure software/AI synthesis layer on top of the already-scoped P25 Orb Add-on RX-only hardware (see Product Architecture, above). For the PoC, the AI layer's outputs are simulated — a few canned injected events (a blocked-attempt burst, a partial "shots f—" cutoff, a full "officer down," a status-check-silence escalation) — rather than run against live ASR on real radio audio. The dashboard reacting to a high-confidence vs. suspected alert in real time is the demo's centerpiece.

## Customer of Contract — Finalized [You]

**Primary pitch customer: Texas DPS and TPWD, jointly.** Both agencies hold a roving, statewide mandate to respond to incidents like this, with complementary strengths rather than overlapping redundancy:

- **TPWD** — stronger for large-area disaster response: off-road/backcountry/water-capable assets (game wardens' vehicles, boats, ATVs), suited to wide-geography incidents like floods, wildfires, and rural search-and-rescue.
- **DPS** — stronger for urban/suburban critical incidents: greater Trooper count and denser manpower distribution, suited to concentrated, high-population-density events.

**Our specific PoC scenario (a mass-casualty incident at a single school site) is a DPS-shaped incident** — dense, urban/suburban, manpower-concentration-driven — so DPS is the primary voice for the demo itself. TPWD is the parallel stakeholder whose own incident type (large-area disaster) benefits from the identical underlying capability, which is what makes this a joint state-level acquisition case rather than a single-agency sale: two agencies with complementary geographic/incident-type coverage, both procuring the same P25 Orb Add-on capability for their respective roving-response roles. This broadens the total-addressable-market story in the pitch without diluting the specific demo, which stays focused on the DPS-relevant scenario. Well-resourced counties fit the same product tier and get a brief mention as adjacent market.

**Secondary market — not the PoC's customer, but the roadmap story:** smaller counties/cities, buying the cheaper Existing-Radio Interface tier (base ARC Edge + P25-radio-connector) for patrol assets that can't afford to drop offline — drone units are the sharp example — using base ARC Edge DMPO functionality with P25 folded in as one more path, not the detection/AI-digest capability.

## PoC Demo Spec — [You/Claude, collaborative]

### Two-tab structure

- **Tab 1 — RF environment / ground truth.** Plays a scripted timeline of simulated P25 events (Channel Request, Grant, Queue, Deny, garbled/cut-off transmissions) as they'd appear on the trunk — raw chaos, no interpretation.
- **Tab 2 — OSC's ARC Edge control panel.** The same events, delivered as ARC Edge actually presents them: live digest feed, two-tier alarm panel, command view.

Both tabs are driven by the same underlying scripted event timeline. Tab 1 is the source of truth, broadcasting each event to Tab 2 in real time via the browser's `BroadcastChannel` API — Tab 2 genuinely reacts live rather than replaying an independently-timed copy of the same script.

### Demo script beats

1. Calm baseline — routine traffic, normal Grants.
2. Congestion builds — Queued/Busy indicators climb as more units arrive.
3. Blocked-attempt burst — multiple units Denied/Queued simultaneously.
4. A partial, garbled transmission cuts off mid-word ("shots f—") → **Suspected** alert fires.
5. A simulated status check to that unit goes unanswered → alert sustains/escalates.
6. A separate unit's "officer down" gets through, corroborated by a `TX EMERGENCY` beacon → **High-Confidence** alert.
7. Resolution — the Command view shows the synthesized picture reaching the OSC, despite the chaos visible in Tab 1.

## Build Scope — What's Real vs. Simulated [Claude]

### Real, working code — independent of ARC Edge's undisclosed internals

The detection/synthesis/alarm engine is our own novel logic, not ARC Edge's IP. Built for real: a state machine ingesting classified P25-shaped events, applying the two-tier corroboration logic (see AI Digest & Alert Layer, above), tracking status-check timeouts, and producing the digest feed. This is the actual pitch — running code, not a scripted UI illusion.

### Simulated — but not because of ARC Edge access; no radio hardware exists for this demo regardless

Tab 1's event feed is a scripted timeline, feeding the real detection engine using accurate P25 terminology and data shapes (real message types like Channel Request/Grant, realistic unit-ID formatting) rather than generic placeholders — costs nothing extra, and reads as technically grounded rather than hand-wavy.

### Simulated — because it's genuinely ARC Edge's undisclosed IP

The actual DMPO path-scoring algorithm and multi-path relay implementation are opaque to us and shouldn't be pretended at. Represented narratively in the Command view ("relayed via Starlink, DMPO-selected") rather than as implemented logic — honest, and consistent with proposing a feature that sits on ARC Edge's existing platform rather than reverse-engineering it.

### Net position for the pitch

The part that's actually the feature — detection, corroboration, alerting, digest synthesis — is real, running code, live in front of the audience. The part that's simulated is exactly the part that was always going to be simulated (no RF hardware exists for this demo) or that we have no business claiming to know (ARC Edge's proprietary DMPO internals).

## Software Architecture — Two Front Ends [You/Claude, collaborative]

### Control Panel (field setup/admin interface)

Accessible via a locally-connected tablet or a web interface from anywhere on ARC Edge's network. Config surface:

- **Full participant mode on/off** — the literal toggle for the one-hardware-SKU, two-authorization-tiers architecture (RX-only vs. licensed TX-enabled).
- **Band/target selection** — generic across bands, not hardcoded to 800 MHz/LCRA: which target trunk to track (WACN/System ID/NAC, so the unit confirms it's following the intended system, not a neighboring one), plus which fallback/interop channel(s) to also monitor (`8TAC95D`, `TXCALL1D`, `UTAC42D`, `7GTAC57D` depending on deployment).
- **P25 identity configs (elevated mode)** — assigned Unit ID, WACN/System ID, provisioning info needed to register as an authorized subscriber, per the Statewide Coordinated P25 Radio Unit ID plan.
- **Crypto panel, even in passive mode** — lets an already-authorized user supply keys they already legitimately hold (their own agency's system, or a legitimate mutual-aid key-sharing arrangement), so the Orb can decode encrypted voice content, not just metadata, when legitimate access exists. Not an interception feature — same posture as any properly-provisioned P25 radio decoding traffic with its own loaded key.

### Command Feed (OSC-facing consumption interface)

Web interface accessible to anyone on the ARC Edge network — the running digest, two-tier alarm panel, command view. This is what Tab 2 in the demo represents.

### Three-layer architecture

Control Panel (configures engine input) → detection/synthesis engine (the real logic — see AI Digest & Alert Layer, above) → Command Feed (consumes engine output).

### Tab 1's real-product mapping

The demo's "RF environment / ground truth" tab isn't purely a demo artifact — it maps to a **diagnostics sub-view within the Control Panel**, useful for the deploying technician to confirm the unit is actually hearing the target trunk before walking away from it during setup.

### PoC build scope for the Control Panel

Static HTML/CSS mockup only — not interactive/functional. The demo's actual working software is the detection engine + Command Feed + diagnostics view.

## AI Engine — Power Source [You/Claude, collaborative]

### Demo: Claude Haiku 4.5 via the Anthropic API

Right-sized for a simple classification task (is this text/event a possible emergency indicator, and how confidently) — doesn't need Opus/Fable-tier reasoning. Chosen over standing up a local Ollama model, which would add real engineering overhead (install, model pull, load-time management, on-machine verification) for a task that doesn't justify it.

### Live-pitch reliability design

- **Main scripted demo sequence runs on pre-computed classifications** — generated by genuinely calling the Haiku API during development (real-AI-produced, not hand-authored fake labels), but cached/baked into the script so the live run has zero network dependency in its critical path. Same honesty principle as the RF sensor layer: simulated for reliability, not because we can't build the real thing.
- **Isolated "try it live" bonus input** — separate from the main narrative, where the presenter can type an arbitrary phrase and watch the real Haiku classification run live via an actual API call. Proves it's real AI without risking the core scripted pitch if that one call hiccups.

### Honest limitation: Claude cannot run on-device, under any GPU configuration

Anthropic doesn't distribute Claude model weights for local/on-device deployment — API-only, always, regardless of hardware. This is true for the demo (irrelevant there, since it runs on a normal internet-connected presentation machine) but matters for how the pitch describes the **production/field vision** — claiming "Haiku running on the Orb unit" would be a false claim, not an optimistic one.

### Recommended production architecture: hybrid, mirroring DMPO's own philosophy

- **Primary path:** cloud-based classification (could genuinely still be Haiku), reached over ARC Edge's own resilient DMPO-optimized connectivity. Thematically sound, not a weak point — the failure mode we're solving (P25 trunk congestion) is distinct from total regional connectivity collapse, so ARC Edge's own cellular/satellite/mesh paths would plausibly still reach the cloud even when the P25 trunk is overwhelmed.
- **Fallback path:** for total connectivity loss, a small, genuinely locally-deployable open-weight model (Llama/Phi/Gemma class, sized for realistic edge-inference hardware like a Jetson-class GPU) handles classification on-device, at reduced accuracy relative to the cloud path.

Same "always use the best available path, degrade gracefully rather than fail completely" principle DMPO already applies to networking, applied one layer up to inference. Stronger pitch point than claiming Claude runs on a box, and it's actually true.

## Hardware Architecture — P25 Orb Module [You/Claude, collaborative]

### Off-the-shelf: the RF transceiver silicon

No custom silicon needed. **AD9361/AD9363-class RF Agile Transceiver** (Analog Devices) — a real, existing, wideband SDR transceiver chip (~70 MHz–6 GHz, full RX/TX), used in a large number of existing SDR products. Natively covers 800 MHz and gives the band flexibility the Control Panel's band-selection config already assumes.

### Custom, but standard RF engineering, not invention: the analog chain around that chip

Antenna matching, band-pass filtering (isolating target LMR bands), low-noise amplifier for RX sensitivity, and — licensed/TX mode only — a power amplifier stage and duplexer/antenna switch. Components are largely catalog parts; what's custom is PCB-level integration tuned to the specific bands and power levels. This is exactly the kind of work Orb Aerospace's own "Principal RF Engineer" job posting covers — a validating detail, not an invented one.

### Off-the-shelf, with a consolidation opportunity: baseband compute

A **Jetson-class embedded compute module** handles both P25 signal processing (demodulation, TSBK parsing) *and* hosts the local AI classification fallback discussed in the AI Engine section above. One module doing double duty, rather than two separate boards for two unrelated functions.

### Custom, and this is where the real engineering effort concentrates: firmware/software

P25 CAI demodulation and TSBK message parsing, analog FM demod, encryption/decryption for the crypto panel (P25's AES-256 or legacy DES-OFB), key management, and — TX mode only — the P25 modulator/encoder. All software running on the off-the-shelf compute stack above, not new hardware.

### Finalized: internal interface and power

- **Ethernet** for the connection between the P25 Orb module and the base ARC Edge unit.
- **Dedicated power supply** for the Orb module, separate from ARC Edge's own battery budget.
- **Power draw kept minimal — two real components dominate:** the radio (transceiver chip + RF analog chain) and the Jetson-class compute. The Ethernet PHY and any secure key-storage element (for the crypto panel) are real but negligible additions, not a third major category.
- **Important asymmetry worth keeping in the spec:** RX-only mode is genuinely lean — no power amplifier stage active. Licensed/TX mode draws meaningfully more power, since RF power amplifiers are typically the single largest power draw in any transmitter design. This isn't just a regulatory distinction between the two authorization tiers — it's a real power-budget one too, and it reinforces RX-only as the lean, always-deployable default rather than a stripped-down compromise.

### Genuinely open — flagged, not invented

Physical enclosure integration into ARC Edge's existing Field Kit chassis needs their actual mechanical specs, which we don't have. Exact internal interface, beyond "Ethernet," and precise power budget numbers would need their engineering input to finalize.

### What Fable can usefully produce here

A written architecture spec — block diagram, component selection with rationale, an illustrative bill-of-materials with real part families — good, credible pitch material showing engineering maturity. Not real RF simulation or PCB layout. Frame as conceptual architecture for the pitch, not a procurement-ready design.

## DF/Triangulation — Scoped as a Non-Demoed Bonus Artifact [You/Claude, collaborative]

### Scope and priority

Fable should generate real, working logic for multi-Orb direction-finding — **not** integrated into the live two-tab demo, which simulates a single P25 Orb doing basic transcription/classification only. This is a separate, standalone artifact: a written explanation of the approach, real runnable code, and a small standalone test of its own (example inputs → computed output), demonstrating the concept without being wired into the pitch flow.

**Priority: explicitly lower than the core demo.** If Fable's effort/budget gets tight, this is the first thing to trim — not the detection/digest/alarm system that's the actual pitch.

### How AOA bearing extraction actually works — and why orientation matters, not just position

A single antenna element has no inherent bearing sensitivity — it tells you a signal arrived and how strong, not which direction it came from. Getting a real bearing requires either a rotatable directional antenna (classic RDF, impractical for a no-moving-parts field unit) or a **fixed multi-element antenna array**, computing angle from phase/amplitude differences across elements.

Either way, the raw measurement is an angle *relative to that unit's own antenna reference frame* — not directly usable for triangulation until converted to an *absolute* bearing (relative to true/magnetic north). That conversion requires an onboard orientation reference on **each** unit: a magnetometer/digital compass, ideally with IMU tilt compensation (a magnetometer alone is thrown off if the unit isn't level).

**Precise framing:** each unit needs its orientation relative to a *common absolute reference* (north), not literally relative to the other units directly — the practical effect is the same, since independently-calibrated units become mutually comparable.

**Hardware spec gap this surfaced:** a magnetometer/IMU is a required component for the DF-capable configuration specifically, not the base RX-only classification unit. Standard, cheap, off-the-shelf part (9-axis IMU+magnetometer chips, the same class used in any drone or phone) — a real addition, not exotic, but one we hadn't priced in before this question.

### AOA vs. TDOA — the honest tradeoff, now that AOA's real cost is visible

- **AOA (recommended):** needs the antenna array + magnetometer/IMU per unit (the new cost above), but produces a fix from as few as **two** stations — matching our stated design goal of "two or more P25 Orbs."
- **TDOA (alternative):** no antenna array, no compass at all — just precise time synchronization (achievable via GPS-disciplined clocks, likely needed anyway for position reporting) plus known station positions. Trade-off: typically wants 3–4+ stations for a good, unambiguous fix, and benefits from wide geometric spread between stations — a materially different deployment assumption than "two Orbs."

Given the two-station design goal stated throughout, AOA remains the right choice, with the hardware addition stated plainly rather than glossed over.

### Third element and combined enclosure — [You/Claude, collaborative]

**Third-element geometry:** a triangular arrangement — three elements at the vertices of a triangle, non-collinear — gives two independent baseline vectors instead of one, resolving the two-element front-back ambiguity. Standard AOA-array geometry, not novel.

**Flip-up lid concept:** works, with one requirement that makes it cleaner rather than harder — **the IMU/magnetometer must be mounted in the lid itself, not the base.** If the IMU were in the base instead, the lid would need a precise mechanical latch holding it to one exact repeatable open angle for the geometry to mean anything. With the IMU traveling with the array in the lid, it directly measures the array's actual real-time orientation regardless of the angle the lid is sitting at — instrument the mechanism rather than constrain it.

**RF routing across the hinge:** a real detail, but mature, well-precedented engineering, not a risk — the same problem every laptop solves routing Wi-Fi antenna cables (mounted around the screen bezel for reception) through the hinge via flex cable, rated for the machine's full cyclic open/close life.

**Genuine RF benefit, not just packaging convenience:** antennas elevated in an open lid, away from the base's digital electronics (the Jetson-class compute especially), likely see less self-interference/noise coupling, plus a real height/look-angle advantage for line-of-sight reception above ground clutter.

**Honest flag on the combined enclosure:** the confirmed real ARC Edge Field Kit is a soft-sided IP67 backpack, not a hard case — a Pelican-style combined unit is a different form factor, not an extension of the confirmed one. Framed as a legitimate **additional product configuration** — a case-based "P25-capable command centerpiece" SKU housing both ARC Edge and the P25 Orb, sitting alongside the backpack-portable base unit — rather than assumed identical to it. Pelican-style hard cases are extremely common in this exact tactical/public-safety equipment space, so this isn't a stretch, just a decision worth naming explicitly.

### Open questions

- Do you know how your agency's dispatch console/command vehicle actually interconnects to the LCRA trunk (patch panel, ISSI, mutual-aid gateway, something else)? Relevant mainly if we ever want to describe a fixed/infrastructure-level version of this feature as a future roadmap item — the core PoC now rests on `8TAC95D`, which doesn't require this.
