# Module 2 — The Problem and the Product

**Time:** about 30 minutes.
**Prerequisite:** [Module 1](01-radio-fundamentals.md).
**Goal:** be able to state the problem, the product, the market and the
competitive position without hedging or hand-waving.

---

## 2.1 The scenario

Hold one specific incident in your head. Vagueness here is what makes pitches
sound generic.

A mass police response to a critical incident at a **large high school**.
Multiple agencies converging: state troopers, county deputies, city police,
campus police, EMS. Hundreds of officers and hundreds of vehicles arriving over
about twenty minutes into a confined area. Drone units working the interior and
exterior. News and medevac helicopters overhead.

Officers carry Harris XL-200 handhelds, operating on the **LCRA P25 Phase II
trunked system**.

Two failures happen simultaneously and for unrelated reasons:

**The radio trunk saturates.** Too many radios, too few channels, all demanding
at once. It does not degrade gracefully — radios do not automatically fall back
to talking directly to each other, and the trunk has no way to tell an urgent
call from a routine one.

**Commercial cellular degrades too.** Bystanders livestreaming, every parent in
the county calling, news crews uploading. The cell site serving that area is
oversubscribed at exactly the same moment.

So both the primary and the obvious backup fail together, at the moment the scene
is most complex. This matters for framing: it is not "the radio broke and we used
phones." Everything conventional is failing at once.

---

## 2.2 The problem, stated the way it should be stated

Not "radios get congested." Everyone knows that. The sharp version:

> When the trunk saturates, officers press the button and nothing goes out. The
> trunk controller knows — it processed the request and refused it. That
> information exists, in real time. And it goes nowhere. From the command post,
> an officer who could not transmit looks exactly like an officer with nothing to
> say.

The value is in the last sentence. **The failure is invisible to the one person
whose job is to see the whole scene.**

A commander running that incident is making decisions on a picture they believe
is current. Some unknown fraction of their units have been trying to tell them
something for the last four minutes. They have no way to know that, and no way to
know which units.

---

## 2.3 What we built

**P25 Orb** is an add-on module for the ARC Edge Field Kit: a radio receiver plus
software.

In the configuration demonstrated — **receive only** — it:

1. Follows the trunk's control channel and records every request, grant, queue,
   deny, busy and emergency declaration.
2. Follows grants onto voice channels and captures the transmissions that did get
   through.
3. Simultaneously monitors the analog talkaround channel, `8TAC95D`.
4. Runs an AI classifier over the speech it hears.
5. Feeds all of that into a **detection engine** that decides what matters.
6. Presents the result to the on-scene commander as a running digest, a two-tier
   alarm panel, and a ranked "what needs you now" view.

**It requires zero cooperation from anybody.** No configuration change on the
trunk. No unit ID. No permission from LCRA. No transmit licence. It listens, and
listening to unencrypted public safety radio is legal and ordinary.

That property is worth more than it first appears. It means an agency that
controls none of the radio infrastructure — which is every agency in this
scenario, since LCRA owns the system — can deploy this on their own authority,
in an afternoon.

### What it explicitly does not do

Say these unprompted. Volunteering limitations buys credibility you cannot buy
any other way.

- It does not add channels or fix congestion.
- It does not get the blocked officer's voice through. Nothing can; there is no
  signal.
- It does not enforce priority on the trunk. It cannot — it is not part of the
  system.
- It does not replace dispatch, and in the demonstrated tier it cannot talk back
  to anyone.

What it does is make the failure **visible, attributed and ranked**, in the
moment, to the person who can act on it.

---

## 2.4 The product line

Four products. Know which one you are demonstrating.

| | What it is | Status |
|---|---|---|
| **1. Base ARC Edge** | The existing product, unmodified. | Ships today |
| **2. Existing-Radio Interface** | A cheap data connection to one already-authorised radio. Sees only that radio's own traffic. Value is extending network reach using hardware an agency already owns. | Roadmap |
| **3. P25 Orb** | A full RX/TX transceiver module. Scene-wide visibility from one unit. | **This is what we built** |
| **4. P25 Hotspot** | A dedicated P25 subsystem on a command truck or trailer, creating local trunked coverage where the trunk is down, swamped, or has never existed. | Roadmap |

**The axis that makes the line make sense** — what each one does about the trunk,
and what it costs you in permission:

| Product | Does what about the trunk | Needs whose permission |
|---|---|---|
| Existing-Radio Interface | **Rides** on it | The radio's owner |
| P25 Orb, receive-only | **Watches** it | **Nobody** |
| P25 Orb, licensed | Watches, and can speak on interop channels | A communications leader, at the incident |
| P25 Hotspot | **Replaces or extends** it | Licence, frequency coordination, and a peering agreement |

**Permission required rises monotonically down that list.** That is the useful
way to hold the family: these are not tiers of one product, they are products
with escalating institutional commitment — different buyers, different
procurement cycles.

Product 3 has **two capability states on identical hardware**, gated by
authorisation rather than by silicon:

- **Unlicensed, receive-only** — everything above. **This is the demo.**
- **Licensed, transmit-enabled** — same hardware, once an agency holds a proper
  P25 unit ID. Unlocks bridging, relay, and a last-resort status ping. Not built.

The "same hardware, different authorisation" point is commercially useful:
an agency buys once and unlocks later without replacing anything in the field.

### What to say about the Hotspot if asked, and what not to

**The analogy does the work.** A Wi-Fi hotspot gives you local access and
backhauls to the internet. This gives you local *P25* access and backhauls to the
P25 system, over ARC Edge.

**Say "subsystem," never "site."** A radio site is part of somebody's system and
talks to their core over a proprietary link nobody will license to us. A
*subsystem* is a small system of its own, and P25 has an open IP standard —
**ISSI** — for connecting subsystems together, across vendors and even across
frequency bands. That is the achievable version, and correcting the wording
yourself is much better than being corrected.

**Why it needs a truck rather than the case.** Two reasons, and the second is the
decisive one. A control channel transmits continuously, which costs real power
before anyone speaks. And a transmitter in the lid would **destroy its own
receiver** — 20 watts from one antenna 17.6 cm from another is past what a
receiver front end survives, never mind hears through. A vehicle lets you put
transmit and receive antennas properly apart, which is what every real base
station does.

**The honest framing of why it matters.** Everything else in this line works
*around* congestion. This one adds capacity where the demand actually is. And
because P25 already has a standard behaviour for a site that loses its link —
it keeps serving local users — a Hotspot works whether or not the backhaul
survives. Which matters, because the day you most need one is the day your
backhaul is worst.

**What not to claim.** It is not built, it needs a licence and a frequency
coordinated for the place you park it, and it needs the system operator to agree
to peer with you. Those are bigger obstacles than the engineering.

---

## 2.5 Who buys it

**Primary: Texas DPS.** The scenario is DPS-shaped — dense, urban or suburban,
where the deciding factor is how many people converge how fast. DPS has the
trooper count and the statewide roving mandate.

**Parallel: Texas Parks and Wildlife.** Different incident type entirely —
floods, wildfires, rural search and rescue — with off-road, water and backcountry
assets. **Identical failure mode:** too many radios, one system, nobody at the
command post able to see who is not getting through.

That parallel is what makes this a **state-level acquisition** rather than a
single-agency sale, which is a materially better deal to be pitching.

**Adjacent: well-resourced counties.** Same tier, brief mention, not the focus.

**Secondary market, roadmap only:** smaller agencies buying the cheaper Tier 2
connector for assets that cannot afford to drop offline — drone units are the
sharp example.

### The stakeholder you must not get wrong

**LCRA is not the customer.** They operate the radio system. Our product works
*around* their infrastructure without touching it. Be scrupulously honest about
this: we operate alongside the trunk, we do not modify it, install into it, or
require anything from it. Any suggestion otherwise turns a friendly party into an
obstacle.

**The on-scene commander is the champion.** They are not the buyer, but the
product visibly serves them, and their endorsement is what makes a procurement
real.

---

## 2.6 The competition, honestly

There is real shipping product here. Know it before a customer tells you about it.

**Skymira P25 IP Relay** and **Etherstack RMU25**. Both tap into a P25 radio's
stream and relay audio, subscriber ID, GPS and emergency alerts over IP, with
automatic failover between links. Real products, working for years, from
established vendors.

### Where the line is

Two differentiators. The first is the one that matters.

**1. They relay what got through. We detect what never did.**

Every one of those products sits downstream of a successful transmission. They
need audio to exist. The blocked officer produced none. He is invisible to all of
them, and — this is the important part — **invisible for a structural reason, not
a fixable one.** No amount of engineering on a relay recovers a signal that was
never transmitted.

As far as our research found, nothing on the market surfaces failed transmission
attempts. That is the white space.

**2. Reactive failover versus continuous optimisation.**

Their failover is reactive: a link dies, move to another. ARC Edge's DMPO
continuously measures loss, latency and jitter across every path and steers
traffic *before* anything fails. So the picture we build travels over better
transport. This is a supporting argument, not the headline.

### The honest framing

P25 Orb is something **we are proposing to add** to ARC Edge. It is not a shipping
feature. Orb Aerospace's public materials do not mention P25 at all. Present it as
a proposal, because that is what it is, and because presenting it as shipping is a
claim that falls apart on the first follow-up question.

---

## 2.7 What is real in what you are about to show

The single most important honesty boundary in this project. Memorise the shape.

| | |
|---|---|
| **Real working code** | The detection, synthesis and alarm engine. 47 automated tests. Every alarm is computed. |
| **Real model output** | The AI classifications, genuinely generated by calling Claude Haiku 4.5, cached for reliability, raw API responses kept as evidence. |
| **Real, live, at demo time** | The "try it live" classifier page. |
| **Simulated** | The radio events. A scripted timeline — because no P25 receiver hardware exists for this demo, not because of any ARC Edge access limitation. Terminology and data shapes are accurate. |
| **Narrative only** | ARC Edge's DMPO path selection. It is Orb Aerospace's intellectual property and not ours to reproduce. |
| **Mockup** | The Control Panel. Renders, does nothing. |
| **Not built** | Live audio pass-through, anything requiring transmit, direction finding integration, Tier 2. |

Volunteer this. Every time. "Here is what is real and here is what is staged" is
the sentence that makes everything else you say believable.

---

## Exercises

**2.1** State the problem in three sentences, out loud, without using the words
"congestion" or "situational awareness." Both are true and both are mush.

**2.2** A customer says: "We already have Skymira. Why do we need you?" Answer in
under 45 seconds without disparaging Skymira.

<details>
<summary>Model answer</summary>

Skymira does something genuinely useful and does it well — it takes what your
radios successfully transmit and gets it somewhere else over IP. The gap is
upstream of that. When your trunk saturates and an officer gets a busy signal,
his radio never transmits at all, so there is no audio for any relay to carry. He
is invisible to Skymira, and to every product built that way, because the signal
never existed. We watch the control channel, so we see the attempt itself — the
fact that he tried and was refused. That is the thing nobody currently surfaces,
and at a saturated scene it is the thing a commander most needs.
</details>

**2.3** Write down three things the product does not do. Practise saying them
without apology.

**2.4** Explain why LCRA is not the customer, and why that is a feature rather
than a limitation.

---

## You can now explain

- The scenario, specifically, including the simultaneous cellular failure.
- The problem in one sharp sentence about command-post invisibility.
- What the product does, and the four things it explicitly does not do.
- The four products, the permission axis that orders them, and why licensed
  and unlicensed are the same hardware.
- What the P25 Hotspot is, why it needs a vehicle rather than a case, and why
  "subsystem" and "site" are not interchangeable words.
- Why this is a joint DPS/TPWD state-level case rather than a single-agency sale.
- Who Skymira and Etherstack are, and precisely where the line is.
- The exact boundary between what is real and what is simulated in the demo.

---

**Next:** [Module 3 — Operating the demo](03-operate.md)
