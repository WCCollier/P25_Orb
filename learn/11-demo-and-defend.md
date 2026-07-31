# Module 11 — Demonstrating and Defending

**Time:** about 60 minutes.
**Prerequisite:** everything before it.
**Goal:** run the demonstration confidently and hold up under questioning from
people who know more than you about parts of this.

---

## 11.1 Setup, in order

Fifteen minutes before, not five.

1. **Start the server** and leave the terminal open where you can see it.
2. **Run the pre-flight** from [Module 10](10-troubleshooting.md) §10.1.
3. **Open the landing page**, then click through to both tabs *from that page* —
   never by typing addresses. This is what prevents the origin mismatch.
4. **Tile the windows** side by side. RF Environment left, Command Feed right.
   Do not use tabs you have to switch between; the comparison *is* the argument.
5. **Press Play, then Reset.** Confirms it works and leaves you at zero.
6. **Open "try it live" in a third tab** and leave it on the landing state, so
   you are not typing a URL mid-pitch.
7. **Close everything else.** Notifications, chat, mail.

**If you have one screen**, put the RF tab in a window occupying the left 45% and
the Command Feed on the right 55%. The Command Feed gets more room because it is
where you want people looking.

---

## 11.2 The shape of the talk

Roughly fourteen minutes. Full text in
[`pitch-script.md`](../pitch-script.md).

| Section | Time | Screens |
|---|---|---|
| The problem | 3 min | None — just talk |
| What we propose | 1.5 min | None |
| Why you cannot already buy it | 2 min | None |
| **The demonstration** | 3 min | Both tabs |
| The AI is real | 1.5 min | Live page |
| What it means for DPS | 1.5 min | None |
| Roadmap | 1 min | None |
| Why me | 45 sec | None |

**Notice how little of it is screens.** The demonstration is three minutes of
fourteen. If the technology fails entirely you still have eleven minutes of
argument, and the argument is what actually sells.

---

## 11.3 Delivering the demo section

Four things that matter more than the words.

**Let the silence at beat 5 sit.** Dispatch calls 4471. Nothing comes back. The
instinct is to narrate over the gap. Do not. The gap is the point, and an
audience that feels fifteen seconds of unanswered radio call understands the
product better than one that hears you describe it.

**Slow down at beat 4.** It is the intellectual centre. Everything before is
setup and everything after is payoff. Point at the specific line on the card that
reads *"2 things noticed, all in the same transmission — not corroborated."*

**Point at the left screen during beat 3, not the right.** The wall of red is the
emotional beat. Let people look at it and feel it before you show them the tidy
version.

**Close by gesturing at both.** "Same events, same moment. On the left everything
you would have had. On the right what one person could act on." Then stop
talking.

### Things to say out loud, unprompted

- Before starting: which parts are real and which are simulated.
- At the digest header: *"classified by claude-haiku-4-5"* — point at it.
- When the uplink tag comes up: that it is narrative, not implemented.
- At beat 6: that the alarm does not close by itself, and why.

**Volunteering limitations is the single highest-return behaviour in the whole
presentation.** It converts every subsequent claim from "marketing" to
"engineering".

---

## 11.4 The hard questions

Grouped by who asks them. Practise saying these aloud — reading them is not the
same.

### From an engineer

**"How much of this is real?"**
The detection engine, the alarms and the digest are real working code with 47
automated tests. The AI labels are genuine model output; the raw API responses
are in the package with timestamps. The radio events are scripted, because there
is no receiver hardware for this demo. ARC Edge's own path selection is
represented narratively because it is your intellectual property, not mine to
reproduce.

**"Your tests all pass. So what?"**
Passing tests are weak evidence on their own, so we checked by breaking things
deliberately. Remove the source-independence rule and five assertions fail. Let
blocked attempts raise alarms and two fail. Lengthen the answer window and three
fail. And it caught something real: that rule was, at one point, unreachable dead
code — the tests all passed with it deleted. Recording both observations is what
made it load-bearing. I can also tell you which guard is *not* covered: the
ambiguous-unit-reference check has no test, because this timeline has no
ambiguous references.

**"Why not run the AI on the device?"**
Anthropic does not distribute Claude weights for on-device deployment, so
claiming that would be false. The primary path is cloud classification over ARC
Edge's own connectivity, which is sound because trunk congestion is a local radio
capacity failure, not a regional connectivity failure — the trunk saturates while
cellular and satellite still work. For genuine connectivity loss the fallback is a
small open-weight model on the Jetson-class compute already in the unit. Lower
quality, still running.

**"What is your false positive rate?"**
I do not have one, and anyone who gives you a number from a demo timeline is
making it up. What I can tell you is the design intent: nothing raises an alarm
without a signal tied to a specific unit, blocked attempts are deliberately
excluded because everyone is blocked during saturation, and the Suspected tier
exists precisely so ambiguous evidence gets surfaced without being dressed up as
certainty. Measuring the real rate needs deployment data, and that is what a pilot
is for.

### From a radio person

**"You cannot decrypt our system."**
Correct, and we do not claim to. Encryption protects the voice payload only — call
setup metadata is never encrypted because the system needs it to route calls. So
unit IDs, talkgroups, grants, queues, denials and emergency declarations remain
visible, which means congestion detection and blocked-attempt reporting work with
no keys at all. You would lose the speech classification. For your own system's
traffic you can restore that by loading keys you already hold.

**"The hot mic goes out on the officer's home channel, not ours."**
Yes — and that is a real limitation I want to be precise about. The emergency
*declaration* is control-channel signalling and is trunk-wide, so we always see
that an emergency was declared. Capturing what was *said* during the hot mic
depends on our scanning function following the signal to wherever it landed,
which for a mutual-aid officer may be a different channel or a different network
entirely. Detection of the event is robust; capture of the audio is not
guaranteed.

**"This is just a scanner."**
The receiver technology is the boring part and I would rather not pretend
otherwise — it is off-the-shelf, and SDRTrunk does it as open source. A scanner
tells you what is being said. This tells you what is *not* getting said, who is
not saying it, and ranks it into one picture for one person. The product is the
engine, not the radio.

**"Won't the front end desense with that many transmitters nearby?"**
That is exactly why there is a bandpass filter ahead of the low-noise amplifier,
and it is the reason the filter is not optional in this design rather than a
formality. I will be straight that this is a conceptual architecture — no RF
simulation has been run, and validating front-end performance in a
high-transmitter-density environment is real work that has not been done.

### From a commander

**"I already have too many screens."**
That is the strongest objection to this product and I take it seriously. It is
why the alarm panel shows two tiers and not five, why blocked attempts never
raise alarms, and why routine traffic produces nothing at all — you saw twenty
seconds of normal radio traffic at the start generate zero alerts. If it earns a
screen it is because it is the only one telling you about people who are not
reaching you.

**"What do I actually do when it fires?"**
Suspected means look — send someone, or call them. It is the same posture as a
missed welfare check, which your people already have doctrine for. High confidence
means two independent things point the same way; treat it as a real emergency. The
card shows the evidence with timestamps so you can make that call in a second
rather than trusting a box.

**"What if it is wrong?"**
It will be sometimes. That is why the Suspected tier exists rather than one alarm
that claims certainty, why every card shows its evidence instead of just a
verdict, and why nothing closes without you. The system is built to be
overridable, because a system you cannot argue with is one you stop trusting.

### From an executive

**"What does it cost?"**
I do not have pricing and would rather not invent it. What I can tell you about
the cost structure: the radio silicon and compute are catalogue parts, the
receive-only tier needs no licence and no cooperation from the system operator,
and the effort concentrates in software rather than hardware — which means the
second unit is much cheaper to build than the first.

**"How long to a real product?"**
The detection engine exists and works. The gap to a field product is the radio
firmware — P25 demodulation and signalling parsing — plus hardware integration,
and both need Orb Aerospace's own specifications that we have flagged as open. I
would not give you a date from where I am standing.

**"Why should we build this rather than buy the relay product?"**
Because they solve different problems and the relay cannot be extended to solve
ours. Their product moves successful transmissions over IP. Ours reports attempts
that produced no transmission at all. That is not a feature gap they could close
with engineering — the signal does not exist for them to relay.

---

## 11.5 When you do not know

You will be asked things you cannot answer. There will be people in the room who
know more about radio than you.

**The formula:**

> I do not know. Here is what I do know that is adjacent, and here is how I would
> find out.

**Worked example.** *"What is the receiver sensitivity in dBm?"*

> I do not have a figure, and I would not want to give you one from a conceptual
> design that has not been through RF simulation. What I can tell you is that
> sensitivity is set by the low-noise amplifier and the front-end filtering, that
> those are catalogue parts chosen for the band, and that validating actual
> sensitivity in a high-transmitter-density environment is exactly the kind of
> work that has not been done yet. If it is a gating question for you, it is the
> first thing I would put in front of an RF engineer.

**Never do these:**

- Invent a number. Someone will check.
- Say "I'll get back to you" and change the subject. Say what you *do* know first.
- Apologise repeatedly. State the gap once and move on.
- Bluff on radio specifics. The person asking usually already knows.

**The three genuinely open items**, which you can name without embarrassment
because the design document names them too: enclosure and mechanical integration,
the interface protocol above Ethernet, and precise power budget numbers. All three
need Orb Aerospace's own engineering input, and saying so is accurate rather than
evasive.

---

## 11.6 Final drill

Do this once end to end before presenting for real. Aloud, standing up, no notes.

1. Pre-flight check.
2. Full pitch, all fourteen minutes, with the demo.
3. **Have someone interrupt you twice** at random points with a question from
   §11.4.
4. **Have them close the Command Feed tab** mid-demo without warning. Recover and
   keep talking.
5. **Turn off the wifi** before the live-classifier section. Deliver the fallback
   line and move on.

If you can do all five, you are ready.

---

## You can now explain

- The full setup sequence and why you click through rather than type addresses.
- The shape of the talk, and that only three of fourteen minutes need screens.
- The four delivery choices that matter most in the demo section.
- What to volunteer unprompted, and why volunteering limitations pays.
- Answers to the hardest questions from four different kinds of audience.
- How to handle a question you cannot answer, with a worked example.
- The three genuinely open items, by name.

---

**You have finished the syllabus.** Go back to the
[self-assessment checklist](README.md#self-assessment) and work through it
honestly. Anything you cannot do without notes, reread that module.
