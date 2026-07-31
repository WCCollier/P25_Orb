# Module 3 — Operating the Demo

**Time:** about 45 minutes.
**Prerequisite:** [Module 2](02-the-product.md).
**Goal:** total fluency with the controls, and a guided pass through all seven
beats knowing exactly what to look at and when.

Do this module at the keyboard, with the demo open.

---

## 3.1 Starting from cold

```
cd /home/ancient/orb_app_project
python3 serve.py
```

Expected output:

```
  P25 Orb — ARC Edge proof of concept
  --------------------------------------------
  Open:        http://localhost:8000
  Live model:  claude-haiku-4-5
  API key:     loaded from .env
  --------------------------------------------
  Ctrl-C to stop.
```

**If it says `API key: NOT FOUND`** — the scripted demo still works completely.
Only the "try it live" page is affected. This is by design and worth knowing
before you are standing in front of anyone.

Open <http://localhost:8000>. You get a landing page with four cards. For the
presentation you need two of them, in this order:

1. **RF Environment** — open first. It owns the clock.
2. **Command Feed** — open second, in a separate tab.

Put them side by side. On a single laptop screen, two browser windows tiled left
and right is better than two tabs you have to switch between, because the whole
argument is the *comparison*.

---

## 3.2 The RF Environment tab (left)

This is what the receiver hears. It makes no judgements at all.

### Controls

| Control | What it does |
|---|---|
| **Play / Pause** | Starts and stops the timeline. Pausing stops everything, including the Command Feed's sense of time. |
| **Reset** | Back to zero, clears both tabs. |
| **Clock** | `mm:ss / 02:52` — position in the timeline. |
| **1× / 2×** | Playback speed. Use 1× when presenting; 2× for rehearsal. |
| **1–7** | Jump straight to any beat. Both tabs rebuild from scratch. |
| **Space** | Play/pause. |
| **R** | Reset. |

The beat-jump buttons are the single most useful thing here for rehearsal, and
your recovery mechanism if you lose your place live. Jumping rebuilds the Command
Feed completely and correctly — it does not fast-forward, it replays.

### Panels

**Control channel** (the big scrolling one). Every event as raw signalling:
timestamp, unit ID, operation, arguments. Colour carries meaning — green for
grants, amber for queued, **red for busy and denied**, blue-ish for voice, amber
for talkaround. An emergency declaration gets a red bar down the left.

**Receiver.** The system identifiers — WACN, System ID, NAC, site, control
channel, fallback channel. This is what a deploying technician checks to confirm
the unit is tracking the intended trunk. Note `RX ONLY — UNLICENSED`.

**Channel activity.** Which voice frequencies are live and who has them.

**Signalling counters.** Requests, grants, queued, busy, denied, emergency.
Raw counts. Read the note underneath: *"These are counts, not conclusions."*
That distinction is the whole point of the tab.

### The thing to notice about this tab

It is deliberately hard to read. Monospace, dense, undifferentiated, scrolling
faster than you can follow. **That is the design.** This is the information that
technically exists today, presented the way it actually arrives. If it feels
overwhelming during the blocked-attempt burst, the demo is working.

---

## 3.3 The Command Feed tab (right)

Same events, same instant, transformed.

**Alarm panel** (top left). Two tiers. High confidence has a red left edge,
Suspected an amber one. Each card shows the unit, the signals it rests on with
timestamps, context, and an **Acknowledge** button.

**Command view** (bottom left). "What needs you now", ranked — high confidence
first, then suspected, then scene conditions.

**Running digest** (centre). The synthesised feed. Each entry has the
plain-language line, the original transcript underneath in quotes, and badges for
priority, category and keywords. Note the header: `classified by claude-haiku-4-5
· cached <timestamp>`. **Point at that during the demo** — it is your attribution.

**Trunk status** (top right). A computed gauge: `NOMINAL`, `ELEVATED`,
`SATURATED`. Underneath, the percentage of calls getting a channel over the last
30 seconds. This is calculated from the event stream, not scripted.

**Scene advisories** (middle right). Non-alarm notices, e.g. correlated blocking
with a recommendation.

**Units heard** (bottom right). Every unit observed, with through/blocked counts.
Units under alarm turn red.

**Header tags.** `Uplink: Starlink LEO — DMPO-selected` is **narrative** — it
represents ARC Edge's path selection, which we did not implement. Know that. If
asked, say so immediately. `RF source: live / paused` shows the link to Tab 1.

---

## 3.4 Guided walkthrough

Press **Reset**, then **Play**, and follow along. Times are on the RF tab clock.

### Beat 1 — Calm baseline (0:00–0:22)

Watch the request → grant → voice pattern in the left log. This is §1.3 of
Module 1 happening in front of you.

**Look right:** the digest is building plain-language entries. No alarms. The
trunk gauge reads `NOMINAL` with 100% getting through.

**The point:** the system is not trigger-happy. Routine traffic produces no
alarms at all.

### Beat 2 — Congestion builds (0:22–0:48)

Amber `QUEUED` lines appear. At about 0:40 the first red `SYS BUSY`.

**Look right:** the gauge drops off nominal to `ELEVATED`. Still no alarms.

**The point:** congestion is not an emergency. The system distinguishes.

### Beat 3 — The blocked-attempt burst (0:48–1:12)

The important visual moment. From about 0:48, a wall of red on the left — six
different units blocked inside fifteen seconds.

**Look right:** a scene advisory appears — *"6 units blocked from transmitting
within 15 seconds"* with the recommendation to move non-emergency traffic to
8TAC95D. The gauge goes `SATURATED`. **Still no unit alarms.**

At about 1:05, watch for a `PTT DENY` — an out-of-area mutual aid unit, denied
because it is not affiliated with this talkgroup. At 1:07 it appears on
**talkaround** instead. On the trunk alone, that officer had ceased to exist.

**The point to make out loud:** six separate red lines on the left; one
synthesised, actionable advisory on the right.

### Beat 4 — The transmission that cuts off (1:12–1:28)

**Slow down here. This is the centre of the pitch.**

At about 1:14, unit `8M-4471` gets a grant, starts to speak, and cuts off:
`"Shots f—"` with `[CARRIER DROP]`.

**Look right.** An alarm card appears — **Suspected**, amber.

Read the card carefully, because this is the bit you will be questioned on:

- It lists **two** signals: *Transmission cut off* and *Distress heard in speech*.
- They are bracketed together with an amber edge.
- The line above them reads: **"2 things noticed, all in the same transmission —
  not corroborated."**

The system noticed two things and is telling you plainly that they are not two
pieces of evidence. Two readings of one second and a half of audio. Full
reasoning in [Module 6](06-the-engine.md).

Then at 1:18 watch 4471 try again and get `SYS BUSY`. The alarm card picks this
up as context — *"Blocked N more times since"* — **without changing tier.**

### Beat 5 — The status check nobody answers (1:28–2:00)

At about 1:31 dispatch calls: *"4471, dispatch. 4471, radio check, do you copy?"*

The classifier recognised this as a status check, worked out who was being
called, and the engine started a 15-second clock.

**Let the silence sit.** Do not narrate over it.

At about **1:46** the alarm escalates to **High confidence**. A new signal
appears: *Status check unanswered*. The card now reads *"3 signals from 2
separate events."*

**The point:** silence after a direct question is information, and it costs
nothing to collect because the Orb is already listening to everything.

### Beat 6 — Emergency declared (2:00–2:28)

At 2:01, `TX EMERG` on the left with a red bar — unit `8M-2210` pressed the
emergency button. Two seconds later a priority grant and *"Officer down!"*

**Look right:** a second alarm, **High confidence immediately**. Two signals,
two different events: the emergency button and, separately, the speech.

At about 2:20, another officer reports on talkaround that 4471 is up and talking.
Watch 4471's card: the report is attached as **related traffic** and the alarm
**stays open**.

### Beat 7 — Resolution (2:28–2:52)

At about 2:27, 4471 himself transmits: *"I'm okay… 2210 is the one that's down."*

His card now says **"This unit has since transmitted"** — and the alarm is
**still open**. Nothing closes an alarm except a person pressing Acknowledge.

The gauge recovers toward `NOMINAL` as traffic discipline takes hold.

**Closing move:** gesture at both screens. Same events, same moment. On the left,
everything you would have had. On the right, what one person could act on.

---

## 3.5 The "try it live" page

A separate page, deliberately. Open <http://localhost:8000/try-it-live.html>.

The tag top-right tells you before you start whether a live call can succeed.
Preset buttons load example phrases. Type anything, press **Classify**, and it
makes a real API call.

**Why it is a separate page:** so it can fail without touching the presentation.
The scripted demo uses cached classifications and makes no network calls at all.

**Why it is honest:** it uses the identical prompt, model and schema as the cached
labels — both callers import the same `classifier.py`. There is no easier version
for the live demo.

---

## Exercises

**3.1** Run the full timeline at 1× without stopping. Then run it at 2×. Note how
much less legible the left tab is at 2× — useful intuition for how a commander
experiences a fast-moving scene.

**3.2** Use the beat buttons to jump straight to beat 5, then to beat 3, then
back to 7. Confirm the Command Feed rebuilds correctly each time.

**3.3** **The recovery drill.** Start the demo, let it run to beat 4, then *close
the Command Feed tab entirely.* Reopen it. Confirm it repopulates with the full
history. Do this until it is muscle memory — it is your recovery move if
something goes wrong live.

**3.4** Pause at beat 5 during the 15-second answer window. Confirm the alarm
does *not* escalate while paused, then resume and watch it fire. This proves the
engine's clock is driven by the RF tab rather than by wall time.

**3.5** On the live page, try: `"Dispatch, 1187, we're clear here, everything is
code 4."` then `"He's got a gun, he's—"`. Compare the two classifications field
by field.

**3.6** Acknowledge one of the alarms. Watch it drop out of the command view and
grey out in the alarm panel.

---

## You can now explain

- How to start the system from cold and what a healthy startup looks like.
- Every control on the RF tab, including the two keyboard shortcuts.
- What each of the seven Command Feed panels shows.
- What happens at each of the seven beats and what to point at.
- Why the left tab is deliberately hard to read.
- How to recover if the Command Feed tab is lost mid-demo.
- Which single element on screen is narrative rather than implemented.

---

**Next:** [Module 4 — The event stream](04-the-event-stream.md)
