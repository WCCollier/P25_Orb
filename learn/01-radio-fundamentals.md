# Module 1 — Radio Fundamentals

**Time:** about 50 minutes.
**Assumed:** you know what a network is, what a packet is, what admission control
and multiplexing are. Nothing about radio.
**Goal:** understand P25 trunking well enough that the product's central claim is
obviously true to you, rather than something you memorised.

---

## 1.1 The one thing a radio channel is

A radio channel is a frequency. One transmitter at a time can use it usefully. If
two transmit simultaneously, the stronger one wins and the weaker one is
destroyed — this is called "walking on" someone, and it is the entire reason
radio discipline exists.

So: **a channel is a shared medium with no collision detection worth the name.**
If you are reaching for a networking analogy, it is closer to a 1980s coaxial
Ethernet segment than to anything switched. Everyone hears everything, and
politeness is the protocol.

That constraint — one talker per channel — is the root of everything that
follows.

### Simplex, repeaters, and talkaround

Three arrangements matter to us.

**Simplex / direct.** Radio A transmits, radio B receives, no infrastructure.
Range is whatever the handhelds can manage between themselves — in a building,
maybe a few hundred metres, and much less through concrete.

**Repeater.** A radio on a tower listens on one frequency and simultaneously
rebroadcasts on another, at high power from a good height. Now two handhelds that
cannot hear each other directly can both reach the tower, so they can talk. This
is most public safety radio.

**Talkaround.** Handhelds bypass the repeater and talk directly, on a designated
frequency. Short range, no infrastructure, always available. **Remember this
one** — it is the fallback channel our product monitors, and in Texas on 800 MHz
it is called `8TAC95D`.

---

## 1.2 Trunking is statistical multiplexing

Here is where your systems background does real work.

**Conventional radio:** each user group gets its own permanently assigned
frequency. Patrol has one, fire has one, public works has one. Simple. Wasteful —
public works' channel sits idle all night while patrol's is jammed.

**Trunked radio:** pool all the frequencies. When someone wants to talk, assign
them a free one for the duration of that transmission, then take it back.

That is statistical multiplexing, and the reasoning is identical to why we do not
give every TCP connection a dedicated wire. You are betting that not everyone
talks at once, and that bet buys you far more user groups than you have channels.

**The bet is what fails.** At a mass-casualty incident, everyone talks at once.
That is precisely the correlated-demand scenario statistical multiplexing is bad
at, and it is the scenario public safety radio exists for.

### The control channel

For the pool to work, radios need somewhere to ask for a channel. So one
frequency is reserved permanently as the **control channel**: a continuous stream
of digital signalling that every radio on the system monitors constantly.

If you want an analogy: it is a **signalling plane, separated from the data
plane.** SS7 for a radio system. Every call setup, teardown, affiliation and
emergency declaration crosses it.

Three consequences, and all three are load-bearing for our product:

1. **One receiver watching the control channel sees the whole system.** Not one
   talkgroup — everything. Every unit, every request, every outcome. That is why
   a single well-placed Orb covers an entire incident.
2. **Scanners work by following it.** A P25 scanner reads the control channel to
   learn which frequency a talkgroup just got assigned, then retunes to that
   frequency. No system membership required. This is off-the-shelf technology.
3. **Control channel traffic is never encrypted.** More on this in §1.6.

### Talkgroups and unit IDs

A **talkgroup** is a logical channel — "County Fire Dispatch", "DPS Region 1
Tac 1". Radios affiliate with a talkgroup; the system assigns physical
frequencies to talkgroups on demand. Think virtual circuits over a shared
physical layer.

A **unit ID** is a number uniquely identifying one radio on the system. It is
sent with every request. In our demo, unit IDs look like `8M-4471` — the `8M`
range is what the Texas statewide plan actually allocates to LCRA participants.

---

## 1.3 The sequence that this entire product depends on

Read this section twice. Everything else is commentary.

An officer wants to talk. Here is what happens:

```
  1.  Officer presses the transmit button (PTT)
              │
  2.  Radio sends a CHANNEL REQUEST on the control channel
              │           (the officer's voice is NOT being transmitted)
              │
  3.  Trunk controller decides
              │
      ┌───────┼────────────────┬─────────────────────┐
      ▼       ▼                ▼                     ▼
   GRANT    QUEUED          SYSTEM BUSY           PTT DENIED
      │       │                │                     │
      │       │                │                     │
  Radio     Wait, maybe    No channel free.     Not authorised
  retunes   a channel      Call dropped.        on this talkgroup.
  to the    frees up.
  assigned
  frequency.
      │
  4.  Radio emits the GRANT TONE — a short beep
              │
  5.  NOW the officer may speak
```

The operator's manual for the Harris XL-200 handheld is explicit: **wait for the
grant tone before you speak.** Officers are trained to it.

### The fact everything rests on

Look at the three right-hand branches.

**On Queued, Busy, or Denied, the radio never retunes to a voice channel, so it
never transmits the officer's voice at all.**

Not weakly. Not garbled. Not partially. There is no radio energy carrying that
officer's speech anywhere in the world. The sentence they were about to say
existed only as air in their lungs.

This is not a subtle engineering nuance. It is the difference between our product
and everything else on the market:

- A competitor's IP relay taps a radio's audio stream and forwards it over the
  internet. **For a blocked attempt there is no audio stream to tap.** Their
  product is not badly built; the input does not exist.
- Recording systems, dispatch logging, interoperability gateways — all downstream
  of a successful transmission. All blind to this.
- The **only** artefact of a blocked attempt is the request-and-refusal exchange
  on the control channel. That happened. It is observable. And today nobody
  outside the trunk controller ever looks at it.

That gap is the product.

### What the officer experiences, and what command experiences

The officer knows immediately — they get a distinctive tone and a message on the
display: `Call Queued`, `System Busy`, or `PTT Denied`. These are three separate,
named indications, not a generic error beep.

**Command experiences nothing.** No indicator changes anywhere. From the command
post, an officer who could not transmit is indistinguishable from an officer with
nothing to say.

> **Self-check:** A reporter asks why you cannot just recover the blocked audio
> later, the way you would recover a dropped voicemail. Answer in two sentences.
>
> *There is no audio to recover — the radio never transmitted, so nothing was
> ever sent that could have been stored. A queued call is not a message waiting
> in a buffer; it is a request that was refused.*

---

## 1.4 Phase II, TDMA, and a trap to avoid

P25 has two phases. LCRA — the system in our scenario — runs Phase II.

**Phase I** uses FDMA: one voice call per 12.5 kHz channel.
**Phase II** adds TDMA: two voice calls share one 12.5 kHz channel by alternating
time slots. Double the voice capacity per unit of spectrum.

Here is the trap, and it is one an informed customer may set for you:

**Phase II's TDMA improvement applies to voice only. It does nothing for data.**

The control channel — which is what carries data (status messages, GPS, text) —
stays Phase I FDMA even on a Phase II system, for backward compatibility. P25
packet data tops out around **9.6 kbps** regardless of phase.

So if someone says "why not just use the P25 system as another network path for
ARC Edge?" the answer is: 9.6 kbps, and it is architecturally a closed management
channel that terminates in the trunk operator's own back office, not a route to
the internet. It is fine for a short status ping. It is not a data path. Our
design says exactly this, and confines P25 data to a last-resort heartbeat in the
licensed tier.

---

## 1.5 The emergency button

Every public safety radio has one — usually orange, usually on top. Press and
hold and two things happen at once.

**One: an emergency declaration goes out on the control channel.** System-wide.
Every radio sees it. Every passive monitor sees it. This is the single most
reliable signal on the entire system, and critically, **it is independent of
whether any voice ever gets through.** Our product treats it as a first-class
signal for exactly that reason.

**Two: "hot mic."** The radio automatically transmits for about 15 seconds with
genuinely elevated priority at the trunk controller — a real queue-jump, not
merely an automated button press. After 15 seconds, normal queuing resumes.

### The nuance that makes us honest

The hot mic transmits on a channel **pre-programmed by the officer's own home
agency**, appropriate to where they normally work. For an officer working a
mutual-aid response out of their home area, that may be a different channel — or
even a **different P25 system entirely**. San Antonio runs its own network inside
LCRA's coverage footprint.

So, precisely:

- **That an emergency was declared** — always detectable. Control channel
  signalling is system-wide.
- **What was said during the hot mic** — only if our receiver's scanning function
  successfully follows the signal to wherever it landed, which may be off the
  system we are watching.

State it that way. It is a real limitation, stating it costs you nothing, and
being caught glossing it costs you a great deal.

---

## 1.6 Encryption, and why it matters less than people assume

P25 supports encryption. Two facts you need.

**Fact one: most agencies on this system do not use it.** LCRA participants run
largely unencrypted — "in the red" in the jargon — because key management is
expensive and complicated. This is direct domain knowledge, not a published
statistic, so present it as such.

**Fact two, and this is the important one: encryption protects the voice payload
only.** Call setup metadata is never encrypted, because the system itself needs
to read it to route the call. That means these remain fully visible even on a
fully encrypted system:

- system identifiers (WACN, System ID, NAC)
- unit ID — *who* is transmitting
- talkgroup — *which group* they are talking to
- **grant, queue, deny, busy — whether they got through**
- **emergency declarations**

Read that list again in light of what our product does. **Congestion detection
and blocked-attempt reporting work on a fully encrypted system with no keys
whatsoever.** You lose the speech classification. You do not lose the core
capability.

That is a genuine architectural strength and it is easy to undersell. The
headline feature does not depend on hearing anyone's voice.

### Is listening legal?

Yes, for unencrypted transmissions. There is no reasonable expectation of privacy
in an unencrypted radio transmission under federal law, which is why scanners are
sold in shops and why the open-source SDRTrunk project exists.

Our unit does not transmit, does not register with the system, and holds no keys
it was not deliberately given. The Control Panel's key function exists so an
agency can load keys **it already legitimately holds** for its own system. It
confers no ability to decrypt anything else — the keys have to come from the
system operator.

---

## 1.7 The Texas layer

Three things from the **Texas Statewide Interoperability Channel Plan** (TSICP),
which is a real published document from Texas DPS.

**A designated talkaround channel per band.** On 800 MHz it is `8TAC95D` at
851.5500 MHz, capped at 20 watts, mobile and portable only, no base stations.
Other bands have equivalents (`7GTAC57D`, `UTAC42D`, `TXCALL1D`). The plan itself
says these are "particularly valuable in emergencies when units lose coverage"
and that it is "very important to train on the use situations of your portable
and mobile radio."

Note what that sentence concedes: the channel exists, the doctrine exists, and
training on it is not guaranteed. **We are not inventing a procedure. We are
telling people when to use the one they already have.**

**A six-tier priority scheme.** Danger to life and property at tier 1, routine
on-scene tactical at tier 6. This ordering is on the books. **The trunk hardware
has no mechanism to enforce it** — the controller cannot tell an urgent call from
a routine one. Our command view ranks by this logic. It does not enforce it
either, but it is the first thing that shows a commander where reality is
diverging from doctrine.

**Bridging requires a human.** Cross-band patching is permitted, but only under
the positive control of a trained dispatcher or on-incident Communications Unit
Leader (COML) who can kill the patch on demand. This is why every bridging item
in our roadmap is explicitly COML-supervised and never autonomous.

---

## 1.8 Vocabulary you will be expected to use correctly

| Term | Meaning | Do not confuse with |
|---|---|---|
| Control channel | Always-on signalling frequency every radio monitors | A voice channel |
| Talkgroup | Logical user group | A frequency |
| Unit ID | Unique radio identifier | Badge or callsign |
| Grant | Trunk assigned a voice channel | Permission to exist on the system |
| Queued | Waiting for a free channel; may still succeed | Failed |
| System busy | No channel available, call dropped, **no voice sent** | Queued |
| PTT denied | Not authorised on that talkgroup, **no voice sent** | Busy |
| Talkaround / direct | Radio-to-radio, bypassing infrastructure | Repeater operation |
| Hot mic | Automatic 15s priority transmit after emergency button | The emergency declaration itself |
| TSICP | Texas Statewide Interoperability Channel Plan | A federal standard |
| COML | Communications Unit Leader, incident radio boss | A dispatcher |

---

## Exercises

**1.1** Without looking, write the four possible outcomes of pressing the
transmit button, and mark which ones result in no voice being transmitted.

**1.2** Explain trunking to an imaginary non-technical executive using an analogy
that is *not* about radio. (Restaurant tables and a waiting list works well. So
does a car park.) Then explain what happens when everyone arrives at once.

**1.3** Open the demo's RF Environment tab, press Play, and watch the first
25 seconds without reading anything else. Identify the request-grant-voice
pattern in the raw log. You are watching §1.3 happen.

**1.4** An agency tells you they encrypt everything and therefore your product is
useless to them. Write your three-sentence answer.

<details>
<summary>Answer to 1.4</summary>

Encryption protects the voice payload, but call setup metadata is never
encrypted, because the system needs it to route calls. So we still see every unit
ID, every talkgroup, every grant, queue, deny and busy, and every emergency
declaration — which means congestion detection and blocked-attempt reporting work
exactly as demonstrated with no keys at all. What you would lose is the speech
classification layer, and for your own system's traffic you can restore that by
loading keys you already hold.
</details>

---

## You can now explain

- Why one radio channel supports one talker, and what trunking does about it.
- What the control channel is, and why watching it gives you the whole system.
- The four outcomes of a channel request, and precisely which produce no audio.
- Why a blocked transmission cannot be relayed, recovered, or reconstructed.
- What the emergency button does, and the honest limit on capturing hot-mic audio.
- Why encryption does not defeat the core capability.
- What `8TAC95D` is and why the Texas plan already asks agencies to train on it.

---

**Next:** [Module 2 — The problem and the product](02-the-product.md)
