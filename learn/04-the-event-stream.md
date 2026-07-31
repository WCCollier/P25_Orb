# Module 4 — The Event Stream

**Time:** about 30 minutes.
**Prerequisite:** [Module 3](03-operate.md).
**Goal:** know exactly what data the product consumes, where it comes from, and
what is honestly simulated.

---

## 4.1 Why start with the data

In any system built around judgement, the interesting question is not "what does
it decide" but "what does it have to decide *with*". If you are fluent in the
input, every downstream design decision becomes obvious rather than memorised.

Open `demo/js/timeline.js` and keep it open.

---

## 4.2 The event shape

Every event is a small record:

```javascript
{ id: 'e054', t: 74800, beat: 4, type: 'VOICE', unit: '8M-4471',
  tg: 5301, channel: '851.7375', truncated: true, transcript: "Shots f—" }
```

| Field | Meaning |
|---|---|
| `id` | Stable identifier. **This is what links an event to its AI classification, and what the corroboration rule uses to decide independence.** |
| `t` | Milliseconds from timeline start. |
| `beat` | Which demo beat, for the presenter's benefit only. |
| `type` | The event type — see below. |
| `unit` | P25 unit ID of the radio involved. |
| `tg` | Talkgroup. |
| `channel` | Voice frequency, on grants and voice. |
| `truncated` | The carrier dropped mid-word. |
| `transcript` | What was said, on voice events only. |
| `emergency` | Priority flag on emergency-related traffic. |

Note what is **not** here: no priority, no alert level, no confidence score, no
"this is important." **The timeline contains no interpretation whatsoever.** That
is deliberate and it is the thing that makes the demo honest — all judgement
happens downstream, in code you can read and test.

---

## 4.3 The eight event types

| Type | What the receiver saw | Voice transmitted? |
|---|---|---|
| `CHANNEL_REQUEST` | A radio asked for a channel | No |
| `GRANT` | Trunk assigned a channel | Now possible |
| `QUEUED` | No channel free, request waiting | Not yet |
| `SYSTEM_BUSY` | No channel available, call dropped | **Never** |
| `DENIED` | Radio not authorised on this talkgroup | **Never** |
| `TX_EMERGENCY` | Emergency button, system-wide | Independent of voice |
| `VOICE` | Audio from a granted transmission | Yes |
| `FALLBACK_VOICE` | Audio on the analog talkaround channel | Yes, off-trunk |

The two rows in bold are the product. Everything else is context.

Note that `QUEUED` is genuinely ambiguous — a queued call may still succeed or
may later drop to `SYSTEM_BUSY`. The engine treats it as *not yet resolved* and
refuses to count it as either a success or a failure until it becomes one. That
is a small thing that keeps the congestion figure honest.

---

## 4.4 Grounding: what is real in this file

Fair questions, honest answers.

**Unit IDs (`8M-4471`).** The `8M` range is what the Texas Statewide Coordinated
P25 Radio Unit ID allocation table actually assigns to LCRA participants. Real
range, invented individual numbers.

**System identifiers** (WACN `BEE00`, System ID `4E2`, NAC `2A7`). Plausible
shapes, illustrative values. Not LCRA's published record.

**Frequencies.** Illustrative for the 800 MHz band — **with one exception.**
`8TAC95D` at **851.5500 MHz** is the real designated Texas talkaround channel for
that band, capped at 20 W ERP, mobile and portable only.

**Transcripts.** Written to sound like real radio traffic — terse, 10-codes where
natural, plain language under stress. Not transcripts of real incidents.

**Timings.** Chosen so the sequence reads at presentation pace: 2 minutes
52 seconds for what would be a much longer real incident.

If asked *"is this real data?"*, the answer is: **no, and it could not be — there
is no receiver hardware for this demo.** It is a scripted timeline using accurate
P25 terminology and data shapes, feeding a real detection engine. Say it plainly;
it costs nothing and pre-empts the follow-up.

---

## 4.5 How the two tabs share it

Read `demo/js/protocol.js` — it is 31 lines and it is the entire integration
contract.

The RF Environment tab owns the clock. As each event's time arrives, it renders
it and posts it over a **`BroadcastChannel`** — a plain browser feature that lets
two tabs on the same origin exchange messages with no server involved.

| Message | Direction | Purpose |
|---|---|---|
| `EVENT` | RF → Feed | One radio event |
| `CLOCK` | RF → Feed | Current position, play state, speed |
| `RESET` | RF → Feed | Wipe and start over |
| `SYNC` | RF → Feed | Full history replay for a tab that joined late |
| `END` | RF → Feed | Timeline finished |
| `HELLO` | Feed → RF | "I just opened, send me what I missed" |

Two consequences worth being able to state:

**The Command Feed has no timeline of its own.** It cannot replay anything by
itself. Pause the RF tab and the Feed receives nothing. That is what makes "it is
genuinely reacting live" a true statement rather than a demo trick.

**`HELLO` is why you can reload the Command Feed mid-demo.** On load it announces
itself; the RF tab replays everything so far. You practised this in Exercise 3.3.

**Why `CLOCK` matters:** the engine has no timers of its own. Its sense of time
comes entirely from these messages, which is why pausing the demo genuinely
pauses the status-check answer window rather than letting wall-clock time run on
underneath.

---

## 4.6 Where classifications attach

The timeline has no AI output in it. Classifications live separately in
`demo/js/classifications.js`, keyed by event id:

```javascript
"e054": {
  "priority": "EMERGENCY",
  "category": "SHOTS_FIRED",
  "distress": true,
  "keywords": ["Shots f—"],
  "is_status_check": false,
  "subject_unit": "",
  "cut_off_meaning": "Unit was beginning to report 'Shots fired' but transmission was cut off mid-word.",
  "digest": "Unit 8M-4471 reporting shots fired — transmission cut off"
}
```

The Command Feed looks up the classification for each arriving event and hands
both to the engine together.

**Why the separation matters architecturally:** it mirrors the real product. The
radio hardware produces events; a classification layer labels the ones carrying
speech; the engine reasons over the labelled stream. Three separable stages, and
the middle one is the only part that needs a model.

---

## Exercises

**4.1** In `timeline.js`, find every `SYSTEM_BUSY` and `DENIED` event. Count them.
That count is the number of things a commander is blind to today.

**4.2** Find event `e048` (a `DENIED`) and then `e049`. Explain in one sentence
what happened to that officer and why it matters.

<details>
<summary>Answer</summary>

Unit `8M-8830`, an out-of-area mutual aid unit, was denied a channel because it
is not affiliated with this talkgroup — so it went to the analog talkaround
channel and called for someone there instead. It matters because on the trunk
alone that officer is completely invisible, and only the Orb's second receiver
watching 8TAC95D picks him up.
</details>

**4.3** Find `e065` and `e072`. Both are dispatch calling `8M-4471`. Look up both
in `classifications.js`. What field makes the engine start a clock, and what
would happen if that field were wrong?

**4.4** Run this and read the output — it is the raw evidence that the labels are
model-generated:

```
python3 -c "
import json
log = json.load(open('tools/classification-log.json'))
print('generated:', log['generated_at'], '| model:', log['model'])
r = [x for x in log['runs'] if x['event_id'] == 'e054'][0]
print('input: ', r['input']['transcript'])
print('output:', json.dumps(r['output'], indent=2))
print('usage: ', r['api_response']['usage'])
"
```

**4.5** Open `protocol.js` and explain, in your own words, why the Command Feed
cannot fake the demo on its own.

---

## You can now explain

- Every field on an event and what it is for.
- Why `id` matters more than it looks (independence, and classification linkage).
- The eight event types and which two are the product.
- Precisely which parts of the timeline are real, plausible, or invented.
- How `BroadcastChannel` connects the tabs with no server involved.
- Why the Command Feed genuinely cannot replay independently.
- Why classifications are stored separately from events.

---

**Next:** [Module 5 — The AI layer](05-the-ai-layer.md)
