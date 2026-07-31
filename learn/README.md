# P25 Orb — Product Syllabus

A structured path from "I approved this in planning" to "I can install it,
operate it, demonstrate it, troubleshoot it live, and defend every decision in
it under hostile questioning."

This is written for a product lead with a computer science background who has not
written code professionally in some time, and who has **no electrical or radio
engineering background**. Nothing here assumes you know what a duplexer is. Where
radio concepts appear, they are explained against networking and systems concepts
you already have.

---

## How to use this

**Work through it in order.** Later modules assume earlier ones. Module 1 is the
foundation and it is the one most likely to feel like homework — do it anyway,
because every design decision in this product is downstream of one specific fact
about how P25 radios behave, and if that fact is fuzzy for you the whole argument
goes soft.

**Do the exercises at the keyboard.** They are short, they are verified to work,
and several of them involve deliberately breaking the system to see what the
tests catch. Reading about a safety rule is not the same as watching five
assertions fail when you remove it.

**Answer the self-check questions out loud.** Not in your head. The failure mode
this syllabus is guarding against is the one where you understand something well
enough to nod along and not well enough to say it to a sceptical engineer.

Each module ends with **"You can now explain..."** — a list of claims you should
be able to make unprompted. If you cannot, reread rather than moving on.

---

## Before you start

Open a terminal in the project directory and confirm the environment:

```
cd /home/ancient/orb_app_project
python3 --version     # expect 3.12.x
node --version        # expect v18.x
```

Then start the demo server and leave it running in its own terminal window for
the rest of the syllabus:

```
python3 serve.py
```

You should see the banner, `API key: loaded from .env`, and a URL. Open
<http://localhost:8000>. If any of that fails, jump ahead to
**[Module 10 — Troubleshooting](10-troubleshooting.md)** and come back.

---

## The modules

| # | Module | What it gets you | Time |
|---|---|---|---|
| 1 | [Radio fundamentals](01-radio-fundamentals.md) | How P25 trunking actually works, in terms of systems concepts you know. The one fact the whole product rests on. | 50 min |
| 2 | [The problem and the product](02-the-product.md) | The scenario, what we built, the four products, who buys it, and who we compete with. | 30 min |
| 3 | [Operating the demo](03-operate.md) | Every control, every panel, and a guided pass through all seven beats. | 45 min |
| 4 | [The event stream](04-the-event-stream.md) | The data model. What the receiver sees and what it never sees. | 30 min |
| 5 | [The AI layer](05-the-ai-layer.md) | What the classifier does, what it gets wrong, and why that is survivable. | 45 min |
| 6 | [The detection engine](06-the-engine.md) | The core of the product, including breaking it on purpose. | 60 min |
| 7 | [Code tour](07-code-tour.md) | Reading the actual source with a rusty programmer's eye. | 45 min |
| 8 | [Hardware](08-hardware.md) | The radio module, explained without electrical engineering. | 40 min |
| 9 | [Direction finding](09-direction-finding.md) | The roadmap artifact, and how to talk about uncertainty honestly. | 30 min |
| 10 | [Troubleshooting](10-troubleshooting.md) | Symptom-to-fix runbook, including demo-day failures. | 30 min |
| 11 | [Demonstrating and defending](11-demo-and-defend.md) | Performing it live, and the hard questions with answers. | 60 min |

Roughly **eight hours** if you do every exercise. Modules 1, 6 and 11 are the
ones that matter most if you are short on time — they are the foundation, the
product, and the performance.

---

## The three things you must never get wrong

If you retain nothing else from this syllabus, retain these. Each is a claim you
will make in front of customers, and each is one an engineer could embarrass you
on.

**1. A blocked transmission produces no audio at all.**
Not degraded audio. Not a partial signal. When a P25 radio is denied a channel it
never transmits voice, so there is nothing in the air to intercept. This is why
competitors who relay radio traffic cannot see these events — not because their
engineering is worse, but because the signal never existed. Get this wrong and
your entire differentiation collapses.

**2. Two observations of one transmission are not corroboration.**
The cut-off fragment "Shots f—" is both a truncation and a distress keyword. The
system records both and still calls it Suspected, because they are two readings
of the same moment of audio. This is the most defensible idea in the product and
the one most likely to be probed.

**3. The detection engine is real; the radio events are simulated.**
Be precise about the line. The alarms are computed by working code with 46
automated tests. The AI labels are genuine model output with the raw API
responses kept as evidence. The radio events are a script, because there is no
receiver hardware. Never blur this — volunteering it is much stronger than being
caught at it.

---

## Self-assessment

You are ready to present when you can do all of these without notes:

- [ ] Explain to a non-technical person why a busy signal on a police radio is a
      safety problem, in under a minute.
- [ ] Draw the three-layer architecture on a whiteboard from memory.
- [ ] Start the demo from a cold laptop and run all seven beats.
- [ ] Recover from the Command Feed tab being closed mid-demo.
- [ ] Explain why blocked attempts never escalate an alarm, and defend it when
      someone objects that they obviously should.
- [ ] Explain what happens if the agency encrypts their system.
- [ ] Name three things the product does *not* do.
- [ ] Point at the specific place the AI got something wrong, and explain why the
      system absorbed it.
- [ ] Say what you would build next and why it is not what you built first.

---

*Companion documents, referenced throughout:*
[`design-document.md`](../design-document.md) (the specification) ·
[`docs/as-built.md`](../docs/as-built.md) (what exists, where) ·
[`docs/software-prd.md`](../docs/software-prd.md) (requirements and rationale) ·
[`docs/hardware-design.md`](../docs/hardware-design.md) ·
[`pitch-script.md`](../pitch-script.md)
