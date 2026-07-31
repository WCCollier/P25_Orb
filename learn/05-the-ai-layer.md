# Module 5 — The AI Layer

**Time:** about 45 minutes.
**Prerequisite:** [Module 4](04-the-event-stream.md).
**Goal:** be able to say exactly what the model does, what it got wrong, why that
was survivable, and why the demo caches its output without that being a cheat.

This is the module where a technical audience will probe hardest, because "we
added AI" is the easiest claim in the world to make and the hardest to defend.

---

## 5.1 What the classifier is actually asked to do

One job, on one transmission at a time: **turn a line of speech into structured
data.**

It is given the unit ID, the talkgroup, whether the transmission was cut off, and
the transcript. It returns eight fields:

| Field | Type | What it is for |
|---|---|---|
| `priority` | EMERGENCY / URGENT / ROUTINE | Display, and digest ordering |
| `category` | one of ten slugs | Display |
| `distress` | boolean | **Feeds the engine.** Can raise an alarm |
| `keywords` | list of strings | Shows the commander *why* |
| `is_status_check` | boolean | **Feeds the engine.** Can start an answer clock |
| `subject_unit` | string | **Feeds the engine.** Who this is about |
| `cut_off_meaning` | string | Honest note on an incomplete transmission |
| `digest` | string | The plain-language line in the feed |

Only three of those eight can cause the system to *do* something. The rest are
presentation. That ratio is deliberate.

Open `classifier.py` and read `SYSTEM_PROMPT`. Note what it emphasises:

- *"Classify only what is in this one transmission."* No speculation about the
  wider incident.
- *"Over-flagging routine traffic is a failure, because a commander who learns to
  distrust the alerts will ignore a real one."* The prompt states the product's
  core risk to the model directly.
- *"A transmission that is cut off mid-word is more concerning than a complete
  one, not less."*
- *"Do not invent the rest of the sentence."*

---

## 5.2 Structured outputs, and why it matters

The request specifies a JSON schema, and the API enforces it. The model cannot
return prose, cannot omit a field, and cannot invent a category outside the
allowed list.

**Why this is an engineering decision and not a detail:** without it we would be
writing defensive JSON-repair code around a component whose whole job is to
produce machine-readable output. Schema enforcement moves that from our problem
to the platform's. There is no parsing code in this project, and there does not
need to be.

If someone asks "what if the model returns something malformed?" — it cannot.
That is enforced at the API boundary.

---

## 5.3 Why Haiku and not something bigger

The instinct is that safety-critical work deserves the biggest model. Resist it,
and have the argument ready.

**It is a classification task, not a reasoning task.** Labelling one short
transmission does not require extended reasoning.

**The production argument depends on cost.** This has to run on *every*
transmission at a busy scene, continuously, for the length of the incident.
A model too expensive to run on routine traffic only ever gets run on traffic
somebody already flagged — which defeats the entire purpose, since the whole
point is catching the thing nobody flagged.

**The architecture does not depend on the model being right.** Covered in §5.5.
Because no single model output can cause harm on its own, we can afford the
smaller, faster, cheaper model, and spend the reliability budget on
cross-checking instead.

That last point is the sophisticated version of the answer and the one worth
leading with.

---

## 5.4 Cached for the demo, live on demand

This is the design most likely to be called a cheat. It is not, and here is how
to show that.

**What happens at build time.** `tools/generate_classifications.py` walks the
timeline, calls the model once per transmission, and writes two files:
`demo/js/classifications.js` (the cache the demo replays) and
`tools/classification-log.json` (every raw API response, with the prompt, the
model id, timestamps and token usage).

**What happens at demo time.** The scripted demo reads the cache. **It makes no
network calls at all.** The "try it live" page makes a real call.

**Why cache at all.** The demo needs zero network dependency in its critical
path. You are pitching a product about communications failing under load; being
taken down mid-sentence by conference wifi would be a bad look on top of a lost
demo.

**Why it is honest.** Both the build-time job and the live endpoint import the
same `classifier.py` — the same prompt, the same model, the same schema. There is
no easier prompt for the live demonstration. It is the same code path, and you
can show that by opening one file.

**Why the live page is separate.** So it can fail without touching anything. If
it errors, you say so and move on.

> **The challenge you will get:** *"So you wrote those labels yourself?"*
> **The answer:** "No — and you can check. Give me a phrase." Then type it into
> the live page. That is the whole reason the page exists.

---

## 5.5 The mistake, and why it did not matter

**Do not hide this. Lead with it.** It is the strongest evidence that the system
is engineered rather than demonstrated.

When the classifications were generated, the model was given this transmission
from a campus police officer:

> *"Campus PD to command, we're at the gym doors, nothing here."*

It returned `is_status_check: true`.

That is wrong. It is a routine status *report*, not dispatch performing a check
on someone. If the engine acted on that field alone, it would have started an
answer clock on a unit nobody was waiting for and eventually raised a signal on
an officer who was completely fine.

**Nothing happened.** Because the engine's rule is:

> A status check starts a clock **only if** `subject_unit` resolves to a unit the
> engine has actually observed transmitting on the trunk.

That transmission named nobody, so `subject_unit` was empty, so there was nobody
to wait on, so the mislabel was inert.

Verify it yourself:

```
node -e "
const {CLASSIFICATIONS}=require('./demo/js/classifications.js');
const c = CLASSIFICATIONS.e069;
console.log('is_status_check:', c.is_status_check, '| subject_unit:', JSON.stringify(c.subject_unit));
"
```

There is a test asserting the mislabel stays inert — in `test/engine-test.js`,
the section *"a mislabelled status check is ignored"*.

### The second, smaller case

The model reports which unit a transmission is about **using the words the
speaker actually used.** A dispatcher says *"4471"*, not *"8M-4471"*, so that is
what comes back — even though the prompt requests the canonical form.

Rather than demanding the model produce identifiers it has no way to know, the
engine **resolves the reference against the roster of units it has genuinely
heard on the trunk** — and refuses to resolve an ambiguous one, on the grounds
that acting on the wrong officer is worse than acting on none.

**The general principle, and the sentence to have ready:**

> Let the model do the language task it is good at, and require anything
> consequential to be cross-checked against something the system can verify for
> itself.

---

## 5.6 Where the key lives, and why there is a server

The "try it live" page makes a real API call. An API key must **never** be
embedded in client-side JavaScript — anything in the browser is readable by
anyone who opens developer tools, or by anyone who later reads the repository.

So `serve.py` holds the key server-side, reads it from `.env`, and exposes one
endpoint. The browser posts a phrase to `/api/classify` and never sees the
credential.

**This is the only reason the demo needs a running script at all.** It does not
reintroduce a build step — you still just run one thing and open two tabs.

Check it for yourself: open the browser's developer tools on the live page,
watch the network request, and confirm the key appears nowhere in the page source
or the request from the browser.

---

## 5.7 Production architecture: the hybrid answer

An expected question: *"So this needs the internet to work? At the exact moment
communications are failing?"*

The answer has two parts and the first is the important one.

**The failure being solved is not a connectivity failure.** P25 trunk congestion
is a *local radio capacity* problem — too many radios, too few channels. It is
not the same event as a regional loss of internet. In the scenario the product is
built for, the trunk is saturated while cellular, satellite and mesh paths remain
available. That is precisely the situation ARC Edge exists to exploit.

So the **primary path is cloud classification over ARC Edge's own resilient
connectivity**, and that is a sound default rather than a compromise.

**For genuine connectivity loss, a fallback:** a small open-weight model
(Llama/Phi/Gemma class) running on the Jetson-class compute already in the unit.
Lower quality, still running.

That is the same principle DMPO applies to networking — best available path,
degrade gracefully rather than fail — applied one layer up to inference.

### The honesty requirement

**Anthropic does not distribute Claude model weights for on-device deployment.**
Claiming "Haiku running on the Orb unit" would be false. The local fallback would
be a different, open-weight model. Say this before anyone asks; it is exactly the
kind of detail whose omission destroys trust when discovered.

---

## Exercises

**5.1** Open `classifier.py` and read the system prompt end to end. Identify the
one sentence that states the product's core risk to the model.

**5.2** On the live page, classify these three and compare the `distress` and
`priority` fields:

- `"Dispatch, 3052, we're code 4 here, subject is in custody."`
- `"I need everybody I can get to the east side right now."`
- `"He's got a—"` (tick **Cut off mid-word**)

**5.3** Run the mislabel verification from §5.5. Then find the assertion in
`test/engine-test.js` that pins the behaviour.

**5.4** Explain in two sentences why caching the classifications is not cheating.
Then explain how you would *prove* it to a sceptic in ten seconds.

**5.5** Open developer tools on the live page, submit a classification, and
confirm the API key does not appear anywhere in the browser.

**5.6** A CTO asks why you did not use a larger model for safety-critical alerts.
Answer in 30 seconds.

<details>
<summary>Model answer</summary>

Two reasons. This is a classification task rather than a reasoning task, and it
has to run on every transmission at a busy scene continuously — a model too
expensive for routine traffic only ever gets run on traffic somebody already
flagged, which defeats the point of catching what nobody flagged. But the real
reason is architectural: no single model output can trigger anything consequential
on its own. A distress reading raises a Suspected alert that needs a second
independent signal to escalate, and a status check only starts a clock if the
subject resolves to a unit we have actually heard. So we spend the reliability
budget on cross-checking rather than on model size — which is both cheaper and
more robust, because it also protects us when a larger model is wrong.
</details>

---

## You can now explain

- The eight fields, and which three actually drive behaviour.
- Why structured outputs remove a whole class of parsing code.
- Why a small model is the right call, with the architectural argument.
- Why the demo caches, and how to prove that is not a cheat in ten seconds.
- The specific mislabel, why it was inert, and where the test is.
- Why the API key requires a server, and how to verify it never reaches the browser.
- The hybrid production architecture, including what Claude cannot do.

---

**Next:** [Module 6 — The detection engine](06-the-engine.md)
