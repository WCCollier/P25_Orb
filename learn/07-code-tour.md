# Module 7 — Code Tour

**Time:** about 45 minutes.
**Prerequisite:** [Module 6](06-the-engine.md).
**Goal:** be able to open any file in this project, say what it does and why it
is shaped that way, and read the tests as documentation.

Written for someone who has a computer science background but has not shipped
code recently. Nothing here needs you to write any.

---

## 7.1 The shape of the whole thing

Twelve source files do the work. That is deliberate — a proof of concept that
needs a dependency graph to explain is a proof of concept nobody can audit.

```
  serve.py              local web server + one API endpoint
  classifier.py         the AI layer (prompt, schema, API call)
       │
       ├── tools/generate_classifications.py   build-time: fills the cache
       └── /api/classify                       demo-time: the live page

  demo/
    js/timeline.js        the scripted events        (data, no logic)
    js/classifications.js cached model output        (data, generated)
    js/protocol.js        the two-tab contract       (31 lines)
    js/detection-engine.js  ★ the product
    js/rf-environment.js  Tab 1 — owns the clock
    js/command-feed.js    Tab 2 — pure view
    js/try-it-live.js     the isolated live page

  test/
    engine-test.js        47 assertions
    ui-smoke-test.js      13 assertions
  df/
    aoa_fix.py            direction-finding solver   (standalone)
```

**Dependency direction is strictly one way.** The engine depends on nothing. The
views depend on the engine. Nothing depends on the views. If you can hold that
sentence, you can navigate the codebase.

---

## 7.2 Why plain files and no framework

There is no React, no bundler, no build step, no `package.json`. Deliberate, for
three reasons worth being able to give:

**It has to run on your laptop in a year.** Build toolchains rot. A directory of
HTML, CSS and JavaScript files opens in any browser indefinitely.

**It has to be auditable.** Someone evaluating this can read every line without
building anything or trusting a lockfile.

**The demo's whole claim is that the engine is real.** A build step adds a
transformation between what you read and what runs. Removing it means the file
you read is exactly the file that executes.

The cost is real and worth naming: no type checking, no component reuse, manual
DOM work. For a proof of concept of this size that is the right trade. For a
shipping product it would not be, and saying so is better than pretending the
choice was free.

---

## 7.3 `detection-engine.js` — read this one properly

Roughly 520 lines. Structure, top to bottom:

**1. `ENGINE_CONFIG`** — the tunable thresholds, with a comment explaining they
are Control Panel settings in the product, not constants.

**2. `SIGNAL_KINDS`** — the four kinds, each with a human-readable label and an
explanation. Note the long comment on what is deliberately *absent* and why.

**3. `createEngine(config)`** — a factory returning an object with five methods.

If you have not seen this pattern in a while: `createEngine` returns an object
whose functions close over a private `state` variable. Nothing outside can reach
`state` except through `getState()`. It is encapsulation without classes, and it
is why the tests can create a dozen independent engines in one file with no
interference.

**Read these functions in this order:**

| Function | What to notice |
|---|---|
| `tierFor` | Six lines. The whole two-tier design. |
| `addSignal` | Creates or updates an alert, dedupes, recomputes tier, emits effects. |
| `resolveUnit` | The cross-check that made the classifier mislabel harmless. Note it returns `null` when ambiguous. |
| `handleVoice` | The busiest function. Digest entry, related traffic, signals, status checks, "heard from". |
| `recomputeCongestion` | Rolling window arithmetic. |
| `tick` | Time-based logic — the only place status checks fire. |
| `commandView` | Ranking. |

**The `effects` array** is worth understanding. `ingest` returns a list of things
that just happened (`ALERT_RAISED`, `ALERT_ESCALATED`, `ADVISORY`). The view uses
these for animation. State is read separately via `getState()`. Separating "what
changed" from "what is true now" means the view can re-render from scratch
whenever it likes without missing transitions.

---

## 7.4 `rf-environment.js` — the clock owner

Read this before `command-feed.js`; it is simpler.

**The player.** A `player` object holding `clock`, `playing`, `speed` and
`cursor` (the index of the next event to fire). The `frame` function runs on
`requestAnimationFrame`, advances the clock by elapsed real time × speed, fires
every event whose time has passed, and broadcasts.

**`seek(target)` is the interesting part.** Jumping to a beat does not fast-forward
the other tab's engine. It sends `RESET`, then replays every event up to the
target as a `SYNC`. The comment says why: replaying is cheap, and it leaves no
chance of the two tabs disagreeing about what has happened — which matters more
in a live presentation than elegance does.

**The `HELLO` handler** at the bottom is what makes reloading the Command Feed
mid-demo safe.

**One detail worth noting**, because it is a bug that was caught rather than a
choice: `renderLine` sets `innerHTML` and then finds the element it needs with
`querySelector('.arg')`. An earlier version used `lastChild`, which works in a
browser but is positional and fragile. The UI smoke test caught it.

---

## 7.5 `command-feed.js` — a view and nothing more

The important property: **this file makes no decisions.** Every judgement on
screen comes from the engine. What it does do is attach the cached classification
to each arriving event before handing it over — which mirrors the real product's
three stages.

**`scheduleRender`** batches renders into one `requestAnimationFrame` so a burst
of six events produces one repaint rather than six.

**The digest renders incrementally** (`seenDigest` tracks how many entries have
been drawn) while everything else re-renders from scratch. Alarm cards are cheap
and change shape; digest entries are numerous and never change once written.

**`whyLine(alert)`** is where the corroboration distinction becomes visible to
the user. Two observations from one event reads *"2 things noticed, all in the
same transmission — not corroborated"*; two events reads *"N signals from M
separate events"*. A small function carrying a large idea.

### One habit worth noticing

Model-generated and script-authored text is always set with `.textContent`, never
interpolated into an `innerHTML` string. Look at how signal details, transcripts
and keywords are handled — the element is created via markup, then filled as
text.

The reason is ordinary web hygiene: text that came from a model or a transcript
should never be able to become markup. In this demo nothing hostile is in play,
but the habit is the difference between code that happens to be safe and code
that is safe by construction — and an engineer reviewing this will notice which
one you wrote.

---

## 7.6 Reading the tests as documentation

`test/engine-test.js` is the fastest route to understanding what the engine
guarantees. It is organised by demo beat, so it reads as a specification:

```
Beat 4 — the transmission that cuts off
  ok    an alert is raised for 8M-4471
  ok    it is SUSPECTED, not high confidence
  ok    the distress reading of the fragment was also recorded
  ok    two different signal KINDS are present
  ok    but they came from a single source event
  ok    so the alert stays SUSPECTED despite two kinds
```

The `replayTo(stopAt)` helper builds a fresh engine and advances a fake clock in
250 ms steps, firing events as their time arrives. That is why the whole
three-minute timeline tests in milliseconds.

The final sections drop the timeline and test the corroboration rule directly
with synthetic events — the rule stated in isolation, not just as it happens to
appear in the script.

**`test/ui-smoke-test.js`** does something less common and worth understanding.
There is no browser in this environment, so it provides a small stand-in for the
DOM and a real working `BroadcastChannel`, then runs **the actual page scripts,
unmodified**, and plays the whole timeline through both.

Two details give it real teeth:

- **`getElementById` returns `null` for ids that are not in the actual HTML**,
  which the test parses. A renamed or mistyped id fails here rather than in front
  of an audience.
- **Messages between tabs are structured-cloned** (`JSON.parse(JSON.stringify)`),
  exactly as a browser does. A bug relying on shared object identity between tabs
  would not otherwise show up.

It has already caught two real problems: the `lastChild` fragility, and the trunk
gauge falling to "no signal" at the end of the demo.

---

## 7.7 `classifier.py` and `serve.py`

**`classifier.py`** holds the prompt, the JSON schema, and the API call. It is
imported by both the build-time job and the server, which is the mechanical
reason "the live demo uses the same pipeline" is true rather than aspirational.

It speaks HTTP with `urllib` rather than using the Anthropic SDK. That is a
constraint turned into a feature: this machine blocks package installation, and
the result is a demo that runs on any laptop with nothing installed. The docstring
says so, including that the SDK would be the right choice in a real product.

**`serve.py`** is `http.server` with two endpoints bolted on: `/api/status` (can
a live call succeed?) and `/api/classify`. It reads the key once at startup so a
missing key is a clear message on the terminal rather than a confusing failure
mid-demo.

Note the comment on the exception handler for `/api/classify`: *"This endpoint is
deliberately allowed to fail without consequence."* That is the isolation
principle written into the code.

---

## Exercises

**7.1** Open `detection-engine.js` and read the seven functions in §7.3 in that
order. For each, write one sentence on what it is responsible for.

**7.2** Find every place in the codebase where a decision about *importance* is
made. There should be very few, and they should all be in one file.

**7.3** In `command-feed.js`, find three places where `.textContent` is used
instead of string interpolation. Explain why.

**7.4** Run `node test/engine-test.js` and read the output as a specification.
Pick three assertions and trace each back to the engine code implementing it.

**7.5** Break something in the HTML on purpose: rename `id="gauge-level"` to
`id="gauge-lvl"` in `demo/command-feed.html`, run `node test/ui-smoke-test.js`,
and watch it caught. **Then change it back.**

**7.6** Explain the no-framework decision, including its costs.

---

## You can now explain

- The full file layout and the one-way dependency direction.
- Why there is no build step, and what that costs.
- The structure of the engine and what each core function does.
- Why the RF tab replays rather than fast-forwards on a seek.
- Why the Command Feed is a view that makes no decisions.
- How the tests work, and the two things the UI smoke test does that give it teeth.
- Why `classifier.py` is shared, and why it speaks raw HTTP.

---

**Next:** [Module 8 — Hardware](08-hardware.md)
