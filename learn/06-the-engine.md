# Module 6 — The Detection Engine

**Time:** about 60 minutes.
**Prerequisite:** [Module 5](05-the-ai-layer.md).
**Goal:** complete command of the product's core, including breaking it on
purpose to see what the tests catch.

**This is the most important module in the syllabus.** Everything else is
scaffolding around this file. Open `demo/js/detection-engine.js` and keep it
open.

---

## 6.1 What kind of thing it is

The engine is a **pure state machine**. Events and a clock go in; state comes
out. It has:

- no DOM access
- no network calls
- **no timers of its own** — the caller drives time

That third one is the unusual choice and it is worth understanding. The obvious
implementation would use `setTimeout` for the status-check answer window. Instead
the engine exposes `tick(now)` and the caller decides what "now" means.

**Three things fall out of that, all of them valuable:**

1. **It is testable.** `test/engine-test.js` replays the entire timeline in a
   fraction of a second by advancing a fake clock. With real timers that test
   would take three minutes, so it would not exist.
2. **Pausing the demo genuinely pauses the engine.** The answer window does not
   run on underneath while you are talking. You verified this in Exercise 3.4.
3. **You can say "the alarms are computed, not scripted" without hedging** —
   because a component with no hidden state and no I/O can be exhaustively
   demonstrated.

The public interface is five functions: `ingest(event)`, `tick(now)`,
`acknowledge(unit)`, `getState()`, `reset()`. That is the whole thing.

---

## 6.2 Signals

A **signal** is one piece of evidence that one specific officer may be in
trouble. Exactly four kinds can move an alarm's tier:

| Signal | Where it comes from |
|---|---|
| `TX_EMERGENCY` | Emergency button — system-wide control channel signalling |
| `AI_DISTRESS` | The classifier read a transmission as indicating danger |
| `PARTIAL_TRANSMISSION` | The carrier dropped mid-word |
| `STATUS_CHECK_UNANSWERED` | Dispatch called a unit; nothing came back in the window |

Every signal carries the **id of the event that produced it**. Hold onto that —
it is the whole game.

### What is deliberately absent

**Blocked transmission attempts are not a signal.** This is the design decision
most likely to be challenged, so know the argument cold.

The objection is natural: *"An officer who can't get through is exactly what your
product is about — surely that should raise an alarm?"*

The answer: **during trunk saturation, every unit on scene is being blocked.**
"This officer could not get a channel" is a fact about the trunk, not about the
person. Wiring it into the alarm tiers would raise an alarm for every unit at
exactly the moment a commander can least afford noise — which is the failure mode
that kills alerting products.

Blocked attempts are still:

- **counted**, driving the trunk congestion gauge
- **aggregated**, producing the scene advisory when several units are blocked
  together
- **shown as context on an existing alarm** — *"blocked 3 more times since"* —
  which is genuinely useful, because a unit that is trying and failing to get back
  on the air is a different situation from one that has gone silent

They just never, by themselves, say anyone is in danger.

---

## 6.3 The corroboration rule

Find `tierFor`. It is six lines and it is the product.

```javascript
function tierFor(alert) {
  const kinds = new Set();
  const sources = new Set();
  for (const s of alert.signals) {
    kinds.add(s.kind);
    sources.add(s.sourceEventId);
  }
  alert.kindCount = kinds.size;
  alert.sourceCount = sources.size;
  return kinds.size >= 2 && sources.size >= 2 ? 'HIGH_CONFIDENCE' : 'SUSPECTED';
}
```

**High confidence requires two different signal kinds AND two different source
events.** Otherwise, Suspected.

### Why two axes

Requiring two different *kinds* is obvious — the same evidence twice is not
corroboration.

Requiring two different *source events* is the subtle half, and it is what stops
the system fooling itself.

Return to the fragment `"Shots f—"`. It is simultaneously a transmission that cut
off **and** a distress keyword. The engine records **both** — the commander should
see everything we noticed, and suppressing one to keep the arithmetic tidy would
be its own kind of dishonesty.

So the alert genuinely carries two signals of two different kinds. And it still
reads **Suspected**, because both carry the same `sourceEventId`.

**They are two readings of the same one and a half seconds of audio.** Noticing
two things about one observation is not corroboration. A system that treats it as
corroboration escalates on single ambiguous events *while claiming to have
corroborated them* — which is worse than not corroborating at all, because it is
confidently wrong.

The interface says this out loud rather than leaving it implicit. The card reads:

> **2 things noticed, all in the same transmission — not corroborated**

and the two signals are bracketed together with a labelled amber edge. A
commander glancing at a list of two findings would otherwise reasonably conclude
that two things had happened.

### A piece of development history worth knowing

This rule was, at one point, **not actually doing anything.**

An earlier version of the engine emitted only one signal per transmission — the
`if/else` meant no single event could ever produce two kinds, so the
`sources.size >= 2` check was unreachable. The rule was documented, believed, and
dead.

It was found by deliberately deleting the check and observing that **every test
still passed.** Recording both observations is what made it load-bearing.

You should know this story because it is a good answer to *"how do you know your
tests are meaningful?"* — the honest answer is that we checked by breaking things
on purpose, and found something.

---

## 6.4 The status-check clock

The extension that costs nothing and is worth a lot.

1. A transmission arrives. The classifier says `is_status_check: true` and
   `subject_unit: "4471"`.
2. The engine resolves `"4471"` against units it has **actually observed** →
   `8M-4471`. If it cannot resolve it unambiguously, **nothing happens.**
3. A pending check is recorded with `dueAt = t + 15000`.
4. On each `tick`, any check past its due time with no intervening transmission
   from that unit fires `STATUS_CHECK_UNANSWERED`.
5. Any transmission from the subject unit answers the check.

**The product point:** the Orb is already listening to everything. It hears
dispatch ask the question and hears whether an answer comes. **Silence after a
direct question is information**, and today that information exists only in the
heads of whoever happened to be listening.

**The engineering point:** step 2 is the guard that made the classifier's mislabel
inert. One unverified boolean is never enough to start a clock.

---

## 6.5 Congestion, computed

`recomputeCongestion` maintains a rolling 30-second window of **resolved**
requests and computes the grant rate:

```
grant rate = grants / (grants + blocked)
```

| Grant rate | State |
|---|---|
| ≥ 85% | `NOMINAL` |
| 50–85% | `ELEVATED` |
| < 50% | `SATURATED` |
| fewer than 3 resolved calls | `NO_SIGNAL` |

Queued calls are **not counted until they resolve**, because a queued call has
not failed yet. Counting it as a failure would overstate congestion; counting it
as a success would understate it. Leaving it out until it becomes one or the
other is the only honest option.

**The `NO_SIGNAL` threshold has a story.** It was originally 4 resolved calls,
and at the end of the demo the trailing window contained only 3 — so the gauge
fell back to "no signal" at exactly the moment the recovery story should have
landed. The UI smoke test caught it. Lowering the threshold to 3 fixed it, and
the engine test was tightened from "not saturated" to "reads NOMINAL" so it
cannot regress.

Worth telling, because it shows the tests catch presentation-quality problems and
not just crashes.

---

## 6.6 What never closes an alarm

Three rules, in increasing order of subtlety. All three matter and all three are
tested.

**1. A report *about* a unit does not close its alarm.**
At 2:20 another officer says on talkaround that 4471 is up and talking. That is
attached as **related traffic** and shown prominently. The alarm stays open. A
third party saying an officer looks fine is not the same as that officer
answering.

**2. Hearing *from* the unit does not close it either.**
At 2:27 4471 transmits himself. The alarm is marked *"This unit has since
transmitted"* — and stays open. Closing an officer-safety alarm is a command
decision.

**3. A unit's own distress call does not count as it checking in.**
This one is subtle enough that it was originally wrong. `8M-2210` presses the
emergency button and shouts *"Officer down!"*. He has been "heard from" in the
literal sense — but he is the one who is down. An earlier version marked his
alarm *"this unit has since transmitted"*, which put a reassuring note on the
alarm of the only unit actually incapacitated.

The fix: a transmission only counts as checking in if it does not itself raise a
distress signal for that unit. There is now a test named *"a unit's own distress
call does not count as it checking in"*.

**Only `acknowledge()` closes an alarm.** The software's job is to make that
decision easy and well-informed. It is not to make it.

---

## 6.7 Break it on purpose

The core exercise of this module. Each experiment is verified to produce the
result shown. **Back up the file first:**

```
cp demo/js/detection-engine.js /tmp/engine.bak
```

Restore after each with `cp /tmp/engine.bak demo/js/detection-engine.js`.

### Experiment A — remove the source-independence rule

In `tierFor`, change the return to `return kinds.size >= 2 ? ...`. Run
`node test/engine-test.js`.

**Expect 5 failures**, including *"it is SUSPECTED, not high confidence"* and
*"one transmission yielding two kinds does NOT escalate"*.

**What it shows:** the cut-off fragment now escalates straight to high confidence
on a single ambiguous event. Reload the demo and watch beat 4 — the alarm goes
red immediately. That is the confidently-wrong failure mode, on screen.

### Experiment B — let blocked attempts raise alarms

Find where `blockedAttemptsSince` is incremented and add a signal alongside it:

```javascript
addSignal(event.unit, 'AI_DISTRESS', event.id, t, 'blocked again', effects);
```

**Expect 2 failures**, including *"still SUSPECTED after the unit is blocked
again"*.

**What it shows:** run the demo and watch the alarm panel during beat 3. Alarms
for units that are simply experiencing a busy system. This is the noise problem
that destroys trust in alerting products, and it is much more persuasive seen
than described.

### Experiment C — lengthen the answer window

Change `statusCheckTimeoutMs` from `15000` to `90000`.

**Expect 3 failures**, all in beat 5.

**What it shows:** the escalation never happens inside the demo. Useful because
it demonstrates that this threshold is a **doctrine decision, not an engineering
constant** — which is exactly why it lives on the Control Panel rather than in
the code.

### Experiment D — break the unit resolver

In `resolveUnit`, make the ambiguous case return the first match instead of null:

```javascript
return matches.length >= 1 ? matches[0] : null;
```

**Expect 0 failures.** Every test still passes, because this timeline contains no
ambiguous unit references for the guard to catch.

**That is the lesson, and it is the most useful one in the module.** The
"refuse to resolve an ambiguous reference" rule is real, defensible and currently
*unverified by the test suite* — exactly the condition the source-independence
rule was in before it was found (§6.3). Knowing which of your guards are actually
exercised is part of knowing your system, and "our tests all pass" is a weaker
statement than it sounds.

If you want to see it caught, add a second unit whose id also ends in `4471` to
the timeline and re-run. Honest answer if asked: this one is covered by
inspection and by argument, not by test.

**Restore the file and confirm `47 passed, 0 failed` before moving on.**

---

## 6.8 Reading the state

```
node -e "
const {TIMELINE}=require('./demo/js/timeline.js');
const {CLASSIFICATIONS}=require('./demo/js/classifications.js');
const {createEngine}=require('./demo/js/detection-engine.js');
const e=createEngine(); const ev=TIMELINE.slice().sort((a,b)=>a.t-b.t); let n=0;
for(let t=0;t<=172000;t+=250){
  while(n<ev.length&&ev[n].t<=t){const x=ev[n++];e.ingest(Object.assign({},x,{classification:CLASSIFICATIONS[x.id]}));}
  e.tick(t);
}
const s=e.getState();
console.log('trunk:', s.congestion.level, '| blocked attempts:', s.counters.blocked);
for(const a of s.alerts)
  console.log(a.unit, a.tier, '| signals:', a.signals.map(x=>x.kind).join(', '),
              '| from', a.sourceCount, 'events');
"
```

Change `172000` to any timestamp to inspect the state at that moment.

---

## Exercises

**6.1** Do all four experiments in §6.7. For each, write one sentence on what the
failing test was protecting.

**6.2** Without looking, state the corroboration rule and explain why one axis
would be insufficient.

**6.3** Someone argues blocked attempts obviously *should* escalate an alarm.
Give your answer, then give the strongest version of *their* case and say what
would change your mind.

<details>
<summary>Discussion</summary>

Their strongest case: a unit blocked repeatedly *immediately after* a distress
signal is meaningfully different from background blocking — it suggests someone
urgently trying to reach you. That is a fair point, and it is why blocked
attempts appear as context on an existing alarm.

What would change my mind: evidence that blocked-attempt patterns for a unit
already under suspicion predict genuine emergencies better than chance. That is
an empirical question we could answer with real deployment data, and if the
answer came back positive I would add it as a fifth signal kind — available only
to units already carrying one signal, never as a first signal.
</details>

**6.4** Explain why the engine has no timers of its own, and name three benefits.

**6.5** Explain the three rules about what does not close an alarm, and why the
third one was originally wrong.

---

## You can now explain

- Why the engine is a pure state machine with a caller-driven clock.
- The four signal kinds, and why blocked attempts are deliberately not one.
- The corroboration rule, both axes, and why the second is the subtle one.
- The story of the rule being dead code, and how it was found.
- How the status-check clock works and where the classifier is cross-checked.
- How congestion is computed, and why queued calls are excluded.
- The three rules about closing alarms, including the one that was wrong.
- What breaks, specifically, when you remove each safety property.

---

**Next:** [Module 7 — Code tour](07-code-tour.md)
