# ARC Edge / Orb Aerospace — Research Notes

Compiled 2026-07-22 via public web research. No technical documentation, APIs, or specs were provided by the company — this is a reconstruction from public marketing material, job postings, and general domain knowledge about how systems like this are typically built. Organized by confidence tier so we don't accidentally overclaim in the pitch.

## Confidence key
- **[Confirmed]** — read directly from a primary source (orb.aero itself).
- **[Plausible-inferred]** — not stated by the company, but a reasonable technical inference from confirmed facts + general domain knowledge (SD-WAN, tactical comms, SDN).
- **[Unconfirmed]** — mentioned in the assignment brief or by you, but I could not find independent public corroboration. Treat as true (you likely got it from a real conversation with the company) but don't imply we found it publicly.

---

## Company identity [Confirmed]

- **Company:** Orb Aerospace, based in Lowell, Michigan (730 Lincoln Lake Ave, SE Bldg 3).
- **"Node One"** is Orb's internal R&D facility/team name — "a small team of engineers and operators," described as their "live-work-fly R&D HQ" — not a separate company. This matches the job spec's phrasing exactly ("Node one always hires with unified consensus").
- **Mission framing:** explicitly *not* a weapons company — positions itself around resilience/infrastructure/humanitarian framing ("accelerate human flourishing in peacetime, re-establish critical infrastructure and protect the most vulnerable in times of crisis"), while still clearly selling into defense/public-safety markets.
- Self-described as "Michigan's first airframe prime since WWII," building aircraft via large-format 3D printing.

## Products [Confirmed]

1. **LASSIE MK1** — a Group 1 sUAS (small autonomous aircraft), status "Coming Soon." This is almost certainly the "Orb autonomous aircraft" referenced in your job spec's one-line description.
2. **ARC Edge** — the field communications system (the subject of your assignment).
3. **AMMO** — a third product, referenced via a link on the site but not described in the fetched content. Unexplored — worth a follow-up if we want full context, but not essential for the ARC Edge feature pitch.

## ARC Edge — confirmed technical facts

**Core tech:** patented **DMPO (Dynamic Multi-Path Optimization)**. Continuously measures loss, latency, jitter, and available bandwidth on every link, then steers traffic dynamically — re-evaluating continuously rather than picking a path once. Explicitly **not** a "send on every path and hope" bonding scheme — no packet duplication, which matches your own description of the "blind all-paths send" approach they're differentiating against.

**Networks/protocols aggregated:**
- Cellular: 5G Sub-6/mmWave, LTE/4G, FirstNet Priority
- Satellite: LEO (almost certainly Starlink, though not named)
- Private: CBRS Private LTE (Band 48)
- Wireless: Wi-Fi 6E, MANET mesh
- Military: "line-of-sight/beyond-line-of-sight links" (unspecified — see gap below)
- Wired: multi-WAN, fiber
- Max simultaneous paths: 5

**Architecture:**
- Strict control-plane / data-plane separation
- Modular, vendor-agnostic ("no lock-in")
- No single point of failure

**Performance claims (marketing figures, likely best-case/demo numbers):**
- Session uptime: 99.97%
- Path failover / convergence: <50ms
- Packet loss: 0.0% (simulation)
- Latency measurement resolution: <8ms (demo)

**Hardware:** "ARC Edge Field Kit" — IP67 ruggedized backpack-portable unit with integrated electronics, <5 min deployment.

**Mission contexts (their own framing):** (1) hardening persistent infrastructure for utilities/telecom, (2) crisis-response lifeline for public safety/emergency management/National Guard, (3) command-and-control assurance for autonomous ops — UAVs, distributed sensors, AI-assisted platforms.

**COP:** stated to integrate "telemetry, sensor feeds, infrastructure visibility, and field operations into one shared, real-time operational picture" — but the actual data model, ingestion protocols, and distribution mechanism are not detailed anywhere public.

## Gaps — could not confirm publicly

- **No mention of P25, Link 16, or TAK by name** anywhere in Orb's public material. The public protocol list leans commercial/civil (cellular, CBRS, Wi-Fi, LEO satellite) with only a vague "military LOS/BLOS" catch-all. Your description of specific P25 ↔ Starlink ↔ P25 protocol bridging and TAK/Link-16 track ingestion is plausible and consistent with their stated defense-market ambitions, but it's either non-public roadmap material, something you learned directly in conversation with the company, or an inference — I have no public source for it.
- **No Shield AI V-BAT joint exercise found.** I checked Shield AI's own press materials (HEIMDALL 26, Project Convergence Capstone 5, UNITAS 2025) — no mention of Orb Aerospace or ARC Edge in any of them. Treat this as unverified-but-plausible unless you have a direct source.
- **No patents found under "Orb Aerospace" — retried thoroughly, still nothing.** Tried Google Patents' assignee search (JS-rendered, won't return content to a static fetch), Justia Patents' assignee search and site-restricted queries (403 on direct fetch; the site-restricted search surfaced only unrelated "Orb ___" companies), and the PatentsView structured API (the endpoint has been deprecated/migrated to a USPTO platform I couldn't get working query documentation from). One false positive caught and rejected along the way: a set of airship/aerostat/lighter-than-air patents that a search summary tried to attribute to "Orb Aerospace" actually belong to an unrelated company (Galaxy Unmanned Systems), whose product is separately named "the Orb" — coincidental keyword collision, not a real hit. A generic "DMPO" search surfaced VMware/VeloCloud's own (unrelated, pre-existing) SD-WAN feature of the same name — worth noting as likely naming inspiration, not evidence of Orb's actual patent. **Most likely honest explanations, none confirmable:** the patent may be provisional-only (provisional applications are never published — fully consistent with marketing language calling something "patented"); it may be filed but not yet published (~18-month lag from priority date to publication); or "patented" may be loose marketing language for what's actually patent-pending. Don't claim a patent number or filing date in the pitch — there isn't one to cite.
- **No named leadership, case studies, or customer names** anywhere in the fetched material.
- One RF-engineer job posting that might have leaked hardware/RF stack details returned a 403 (likely bot-blocked) — didn't get content.

## Plausible-inferred technical model — the skeleton to build around

This is my best-effort reconstruction of *how ARC Edge probably works*, grounded in the confirmed facts above plus how this category of system is generally built in the real world:

1. **It's architecturally an SD-WAN, tactically hardened.** "Dynamic Multi-Path Optimization" is also literally VMware/VeloCloud's own SD-WAN feature name — Orb's DMPO is very likely conceptually descended from (or convergently similar to) mainstream SD-WAN dynamic-path-steering: active per-path probing (synthetic traffic measuring latency/jitter/loss/bandwidth in near-real-time), per-flow or per-packet steering decisions based on live path scores, and failover triggered by crossing a quality threshold — not by a link going fully dark.
2. **Control plane / data plane split (their own words) implies an SDN-style design.** Likely a lightweight local controller per Field Kit unit (or a small distributed control mesh among units) computing routing/path decisions, separate from the actual packet-forwarding data plane that does the encapsulation/steering. This is what lets them claim vendor-agnostic modularity.
3. **Protocol bridging is the likely mechanism behind your P25-over-Starlink example.** To move a P25 transmission onto Starlink and back down to a different P25 radio, a Field Kit unit would need to act as a **protocol gateway**: receive native P25 traffic (audio/data) on one radio interface, encapsulate it (likely IP-based, e.g. something resembling ASTRO/P25-over-IP or generic radio-over-IP tunneling — a well-established product category, e.g. Motorola's own gateways, Silvus StreamCaster, Persistent Systems Wave Relay), tunnel it over whichever path DMPO currently scores highest, then de-encapsulate and re-transmit natively at the far end. This would sit as an application-layer service *above* the DMPO transport layer, not as part of DMPO itself.
4. **The COP is likely a separate data-fusion layer riding on top of the DMPO transport**, not part of DMPO itself: ingest heterogeneous SA feeds (TAK CoT messages, Link 16 J-series tracks, GPS beacons), normalize into a common track/entity model, then push updates to subscribers using the same resilient transport — meaning COP delivery inherits DMPO's path-awareness "for free" rather than needing its own routing logic.
5. **Hardware is likely a ruggedized embedded Linux box** with multiple radio/modem interfaces (cellular modem(s), satellite modem, Wi-Fi radio, and some tactical-radio interface — SDR or dedicated radio bridge board) feeding a software stack that does steering + protocol translation + COP fusion. The IP67 backpack form factor and <5 min deployment strongly suggest a single ruggedized chassis rather than a rack of separate boxes.

---

## Recommendation

I'd treat this as a solid skeleton — better public footprint than a lot of small defense-tech companies have, and the SD-WAN lineage gives us a legitimate, well-understood technical foundation to reason from rather than pure speculation. The main gap is the tactical-radio-specific detail (P25/Link16/TAK), which is exactly where a novel feature idea has room to live without contradicting anything public.

I don't think a dedicated Fable research pass would find meaningfully more than this right now — the constraint isn't "not enough digging," it's that the company genuinely hasn't published deeper technical material (small team, no case studies, blocked/JS-walled patent search). Fable's long-horizon/parallel-subagent strengths matter most when there's a lot of scattered material to reconcile; here the scatter is thin. Worth revisiting if you want me to chase the two Node One YouTube videos for transcript content, or if you get any documents from the company directly (per the assignment's "feel free to contact Brian Davis for clarification" line) — that's the kind of denser, messier source material where a Fable pass would actually pay off.
