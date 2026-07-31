# P25 Orb — Pitch Script

**Audience:** Texas Department of Public Safety, with the Texas Parks and
Wildlife Department as a parallel stakeholder.
**Format:** spoken. This is written to be read aloud, not projected.

Stage directions are in square brackets. Everything else is said.

## Timing — read this before you rehearse

**Full script is about 25 minutes**, measured at 140 words per minute. An earlier
header claimed 14 and was simply wrong.

| Section | Full | Compressible to | Notes |
|---|---|---|---|
| 1. The problem | **4.1 min** | 2.5 | Two things must survive: *the radio never transmits at all*, and *nothing happens at the command post* |
| 2. What we are proposing | 1.5 | 1.5 | Already tight |
| 3. Why you cannot buy this | 2.6 | 1.5 | The Skymira/Etherstack detail compresses; the "relay needs audio to exist" point does not |
| 4. The demonstration | **8.4 min** | 5.5 | See below |
| 5. The AI is real | 1.9 | 1.9 | Leave alone. It is the credibility beat |
| 6. What this means for DPS | 1.7 | 1.7 | Already tight |
| 7. Where this goes | 3.2 | 1.5 | Cut the optional weak-signal beat and compress the rest |
| 8. Why me | 1.1 | 1.1 | Placeholder — yours to write |
| | **~25 min** | **~17 min** | |

**About section 4.** The demo plays for 2 minutes 52 seconds, but the narration
over it is eight minutes of speech. **You will be pausing.** That is intended —
the stage directions mark where — but rehearse it, because eight minutes of
talking over a three-minute timeline is not something you can improvise your way
through.

**Beats 4, 5 and 6 are the argument.** Beats 1, 2, 3 and 7 can all be narrated
much more lightly if you are running long. Do not compress beat 4.

**If you have a hard 15-minute slot**, cut section 7 to a single sentence and
narrate beats 1–3 in half the words. Do not solve a time problem by rushing the
demonstration.

---

## 1. The problem

*[No screens yet. Just talk.]*

I want to start with a moment that has already happened, in some form, at every
large incident any of you have run.

Picture a mass response to a critical incident at a large high school. Multiple
agencies converging — your troopers, county deputies, city officers, campus
police, EMS. Hundreds of people and hundreds of vehicles arriving in a confined
area over about twenty minutes. Drone units working the interior and the
exterior. News helicopters overhead.

Everybody there is carrying a radio. Almost all of those radios are trying to
talk on the same trunked P25 system at the same time.

Here is what that system does when that happens. A P25 trunk has a fixed number
of voice channels. When an officer presses the transmit button, the radio does
not transmit — it asks the system for a channel and waits. The operator's manual
for the handheld is explicit about this: you wait for the grant tone before you
speak. If there is no channel free, you get one of three things back. Call
queued. System busy. Or PTT denied.

And this is the part I want to sit on for a second, because it is the whole
reason I am standing here.

**When an officer gets one of those, the radio never transmits voice at all.**

Not degraded audio. Not a garbled transmission. Nothing. The radio never moves to
a traffic channel, so no radio energy carrying that officer's voice ever exists.
Whatever they were about to say was never in the air to be received by anybody.

So consider an officer who keys up to say something urgent, and gets a busy
tone. What happens next? On their end, they know. They try again. Maybe they try
four or five times. Maybe they start moving toward somebody who might hear them.

And on your end — at the command post — **nothing happens.** There is no
notification. There is no indicator. Nothing on any screen anywhere changes.
Because from the command post's point of view, an officer who could not
transmit and an officer who has nothing to say look exactly, precisely the same.

The trunk knows. The trunk controller processed that request and denied it. That
information exists, in real time, and it goes nowhere.

Two more things make this worse rather than better. The trunk does not fail
gracefully — the radios do not fall back to talking to each other automatically,
and the system has no way to work out that one of those queued calls is more
important than the others. And the commercial cellular network in that same
parking lot is degrading at the same moment, for completely unrelated reasons:
every bystander is livestreaming and every parent in the county is calling.

So you lose your primary channel and your backup channel simultaneously, at the
exact moment your scene is at its most complicated.

Texas has already thought about this. Your own Statewide Interoperability Channel
Plan designates a talkaround channel for exactly this situation — on 800 MHz it
is 8TAC95D. The plan says, and I am quoting, that these channels are
"particularly valuable in emergencies when units lose coverage," and that it is
"very important to train on the use situations of your portable and mobile
radio."

The channel exists. The doctrine exists. What is missing is anyone at the command
post knowing that the moment to use it has arrived.

---

## 2. What we are proposing

*[Still no screens.]*

P25 Orb is an add-on module for ARC Edge. It is a radio receiver and a piece of
software.

In the configuration I am showing you today, **it only listens.** It does not
transmit. It is not part of your radio system. It requires no cooperation from
LCRA, no configuration change on your trunk, no unit ID, and no permission from
anybody, because listening to an unencrypted public safety system is something
any scanner does and has always been legal.

It sits on the ground with your command post. It follows the control channel —
the one channel every radio on the system talks to — and it watches the traffic
that never becomes traffic. Every request. Every grant. Every queue. Every busy.
Every denial. Plus the emergency button, which is signalled system-wide on that
same control channel, and which is therefore something the Orb sees whether or
not it hears a word of what follows.

And it monitors 8TAC95D at the same time, so when somebody gives up on the trunk
and goes to talkaround, that does not vanish either.

Then it does the part that actually matters: it turns all of that into a picture
of the scene that one person can read.

---

## 3. Why this is not something you can already buy

*[Still talking.]*

I want to be straight with you about the competitive landscape, because there is
real, shipping product in this space and I would rather tell you about it than
have you find it later.

Skymira sells a P25 IP relay. Etherstack sells a comparable radio modem unit.
Both do something genuinely useful: they tap into a P25 radio's stream and relay
the audio, the subscriber ID, the GPS and the emergency alerts over an IP
network, with automatic failover if a link drops.

If what you need is to get a radio's traffic somewhere else over the internet,
those products work and they have worked for years.

Here is the distinction, and it is not a marketing distinction — it falls
directly out of the physics I described earlier.

**Those products relay what got through. Every one of them is downstream of a
successful transmission.** They need audio to exist before they can do anything
with it. And the officer I described — the one who pressed the button and got a
busy tone — produced no audio. There is nothing for a relay to relay. He is
invisible to every one of those products, and he is invisible for a reason that
no amount of engineering on a relay will fix, because the signal was never
transmitted.

**What we detect is the attempt.** The fact that somebody tried and could not.
That is not a lesser version of relaying their voice — it is a different and, at
that moment, more urgent piece of information, and as far as I can determine
nothing on the market surfaces it.

The second difference is about ARC Edge itself. Those relay products do reactive
failover: a link dies, so move to another one. ARC Edge's core technology
continuously measures loss, latency and jitter across every available path and
steers traffic accordingly — before anything fails, not after. So the picture we
build gets back to you over meaningfully better transport than a relay product
would use.

One thing I want to be clear about: P25 Orb is something we are proposing to add
to ARC Edge. I am not telling you it is a feature that ships today.

---

## 4. The demonstration

*[Bring up two browser tabs, side by side. Left is "RF Environment." Right is
"Command Feed." Do not press play yet.]*

What you are looking at is a simulation of a single P25 Orb at that school.

On the left is what the receiver hears. Raw control channel signalling. No
interpretation whatsoever — this tab does not decide anything, it just shows what
came in.

On the right is what the on-scene commander is shown. Same events. Same instant.

Both tabs are driven by the left one, live. The right tab has no script and no
timer of its own — if I pause the left, the right stops receiving. It is
genuinely reacting.

Two honesty notes before I start it. The radio events are scripted, because I do
not have a P25 receiver — that is simulation standing in for hardware, and the
data shapes are the real ones. But **the software making the decisions on the
right is real working code**, and the AI labels on each transmission were
genuinely produced by a language model, which I will demonstrate live in a
moment.

*[Press Play.]*

### Beat 1 — the calm

Routine traffic. Units checking in, dispatch assigning a command post, the air
unit reporting. Every request gets a channel. On the right, the digest is
building a plain-language record and raising no alarms, because nothing is wrong.

Notice the trunk gauge on the right. It is not decorative. It is measuring what
fraction of calls are actually getting a channel over a rolling window. Right
now, all of them.

### Beat 2 — it starts to bind

*[About 25 seconds in.]*

Watch the left tab. Calls are starting to queue — that is the amber. Somebody
just got a busy signal.

On the right, the gauge has come off nominal. Nothing dramatic yet. This is the
part of an incident where, today, nobody notices anything at all.

### Beat 3 — the wall

*[About 50 seconds in. Let it run for a few seconds before speaking.]*

There. Look at the left tab and just watch the red.

Six different units, inside fifteen seconds, all pressing the button and all
getting nothing. Every one of those is a person who had something to say.

Now look at the right. **The system has noticed that those are correlated** — not
six separate problems, one problem — and it is telling the commander what it
means and what to do about it: push non-emergency traffic to talkaround.

And there is one more thing here I want to point out. A mutual aid unit from out
of the area just got denied outright — not busy, denied, because he is not
affiliated with this talkgroup. He went to 8TAC95D and started calling for
somebody. Because the Orb monitors that channel too, he is on the commander's
screen. On the trunk alone, that officer had effectively ceased to exist.

### Beat 4 — the one that matters

*[About 75 seconds in.]*

*[Slow down here. This is the centre of the pitch.]*

A unit just got a channel, started to speak, and cut off mid-word. Two words.
"Shots f—"

Look at what the right-hand side did with that. It raised an alarm, and it
raised it as **Suspected** — not high confidence.

I want to explain that choice, because it is the most important design decision
in this product.

*[Point at the two lines on the alert card.]*

The system noticed two things about that fragment. It noticed the transmission
cut off. And it noticed a distress word in it. Both are on the card, because you
should see everything we noticed.

But read the line above them. It says: **two things noticed, all in the same
transmission — not corroborated.**

That is the distinction the whole product turns on. It would be very easy to
count those as two pieces of evidence and jump straight to a full emergency
alarm. But they are two readings of the same one and a half seconds of audio.
Noticing two things about one observation is not corroboration. A system that
treats it as corroboration will escalate on single ambiguous events while telling
you it has corroborated them — and that is worse than not corroborating at all,
because it is confidently wrong.

So the alarm shows you everything, and it is honest with you about how much it
actually knows. **Suspected** means we have one event and we cannot back it up,
and you should look anyway.

That is not me inventing a policy. That is how your officers already behave. An
ambiguous distress signal gets checked immediately, without waiting for
confirmation — the same as a missed welfare check. We are encoding doctrine that
already exists.

*[Beat.]*

And notice what is happening underneath the alarm. That officer is trying to key
up again. And he is getting blocked. The commander can see that he is trying and
failing, which is a very different situation from an officer who has gone quiet.

Now — those blocked attempts do **not** raise the alarm level. That is
deliberate. When the trunk is saturated, everybody is getting blocked. "This
officer couldn't get a channel" tells you about the trunk, not about the person.
If I let that escalate alarms I would raise one for every unit on scene at exactly
the moment you can least afford noise.

### Beat 5 — the silence

*[About 95 seconds in.]*

Dispatch is calling that unit by name. Radio check, do you copy.

The system heard that, understood that it is a status check, worked out who is
being called, and started a clock.

*[Wait for it. Let the silence sit — it is more effective than narrating it.]*

Nothing came back.

**That is the second, independent signal.** Different kind of evidence, different
event, a genuine cross-check. The alarm has escalated to high confidence.

And this is the extension I am proudest of, because it costs nothing. The Orb is
already listening to everything. It hears dispatch ask the question. It hears
whether an answer comes. **Silence after a direct question is information**, and
right now that information is only in the heads of whoever happened to be
listening at that moment.

### Beat 6 — the unambiguous one

*[About 2 minutes in.]*

Emergency button. A sergeant has declared an emergency, and that is signalled
across the entire trunk on the control channel — the Orb sees it regardless of
what happens next.

And separately, a second later, he gets a channel and says the words.

Two independent signals, from two different events. **High confidence,
immediately.**

Look at the alarm card. It is not asserting a conclusion at you. It shows the
evidence: emergency button at this time, distress in speech at that time. You can
act on that in a second, or you can dismiss it in a second — either way you are
the one deciding, and you have what you need to decide.

### Beat 7 — resolution

*[Final 25 seconds.]*

Now watch two things.

Another officer reports on talkaround that the first unit is up and talking. The
system attaches that to the alarm — and **leaves the alarm open.** A third party
saying an officer looks fine is not the same as that officer answering.

Then the officer himself gets a channel and reports in. The system marks that he
has been heard from — and **still leaves the alarm open.**

Nothing closes an alarm on an officer except a person deciding to close it. The
software's job is to make that decision easy and well-informed. It is not to make
it for you.

*[Let it finish. Then gesture at both tabs.]*

That is the whole argument, right there on the two screens.

Same events. Same moment. On the left, everything you would have had. On the
right, what one person could actually act on.

---

## 5. The AI is real, and you can check that right now

*[Open the third tab — "Try the classifier live." Invite somebody in the room to
suggest a phrase, or type one yourself.]*

Every transmission in that demo was labelled by a language model — Claude Haiku,
a small, fast, inexpensive one, because this has to run on every transmission at
a busy scene all day, not just the ones somebody already flagged.

Those labels were generated ahead of time and cached, so that demonstration needs
no network at all. Given that I am here telling you about communications failing
under load, being taken out mid-sentence by the wifi in this room would be a poor
advertisement.

But I do not want you taking my word that a model produced them. So — give me a
phrase. Anything an officer might say.

*[Type it. Press Classify.]*

That is a live call, right now, using the identical prompt and the identical
model that produced every label in the demo. There is no easier version for the
live demonstration. Same code path.

*[If it is a good example, point at the fields: priority, whether it reads as
distress, the keywords, whether it is a status check.]*

One more thing worth saying, because it goes to how much you should trust this.
The system does not simply believe the model. When I generated those labels, the
model marked one perfectly routine transmission — a campus officer saying "we're
at the gym doors, nothing here" — as a status check. It is not one.

Nothing happened, because the engine only starts a clock when it can match the
call to a unit it has actually heard on the trunk, and that transmission named
nobody. The mistake was inert.

That is the pattern throughout: let the model do the language work it is good at,
and require anything consequential to be cross-checked against something the
software can verify for itself.

---

## 6. What this means for DPS specifically

*[Screens down. Back to talking.]*

I picked this scenario deliberately, because it is shaped like your problem. A
dense, urban or suburban incident where the deciding factor is how many people
converge, how fast. That is a DPS-shaped event.

The same capability serves Parks and Wildlife on a completely different incident
type — a flood, a wildfire, a rural search — where the assets are different but
the failure is identical: too many radios, one system, nobody at the command post
able to see who is not getting through. Which is why I think this is a state-level
acquisition rather than a single-agency one.

And I want to name what this does **not** do, plainly.

It does not fix your radio system. It does not add channels, it does not prevent
congestion, and it does not get that officer's voice through. The physics do not
allow any of that from outside the system.

What it does is make sure you **know**, in the moment, which is the thing you
currently do not have. Your interoperability plan already lays out a six-tier
priority scheme, danger to life at the top, routine on-scene traffic at the
bottom. That ordering is on the books. Your trunk hardware has no mechanism to
enforce it. This does not enforce it either — but it is the first thing that
shows you where you are violating it, while you can still do something about it.

---

## 7. Where this goes

*[Keep this short. The point is that what I showed is complete on its own.
This section is the first place to cut if you are running long — see the timing
table at the top.]*

Everything I have shown you needs no permission from anybody, because it only
listens. That is the product I would ship first, and I would ship it on its own.

A few things follow it, briefly.

The same hardware, once an agency is authorised with a unit ID, can transmit —
which unlocks bridging between the trunk and the talkaround channel, and a
last-resort status ping when every other path is down. Under a trained
communications leader's control, never automatically, because your own plan
requires a human able to kill a patch on demand.

A cheaper connector tier for agencies that want to instrument radios they already
own, rather than buy new hardware.

And direction finding. One unit gives you a direction. Two units, and those
directions cross, and you have a location. The mathematics for that is written
and tested — it is in the package I am leaving with you, with an honest account
of when it works and when it only gives you a direction to search rather than a
point on a map.

*[If the room is engaged and you have time, this next one is the strongest thing
in the roadmap. If you are running long, cut it — but it is worth protecting.]*

There is one more, and it is the one I find most interesting. When an officer
presses the button and the call does not get through, it fails because the signal
was too weak **at the tower** — and the tower may be ten kilometres away. Our unit
is standing on the scene, a hundred metres from that officer. That distance
difference is worth something like forty to sixty decibels, which in plain terms
means the signal arriving at us can be roughly a hundred thousand times stronger
than the one arriving at the tower.

So the transmission that failed is not necessarily a transmission we could not
hear. We would know who tried, what talkgroup they wanted, and whether they had
declared an emergency — on a call your network has no record of, because as far
as your network is concerned it never happened.

I want to be careful here, because this one is analysis and not something I
built. It needs the receiver to cover a frequency range the first version of the
design did not, and we have since selected hardware that does — but that is a
decision on paper, not a box I can show you, and there is one measurement still
outstanding that decides how well it would actually work in a car park full of
police vehicles. I am not selling it to you today. I am telling you it is where
I would take the product, and why I think the architecture is pointed in the
right direction.

But I would rather you judge what I showed you today than what I have described.

---

## 8. Why me

*[Placeholder — fill in with your own specifics before delivery. Keep it to
about 45 seconds. Three suggested beats:]*

- **Where your knowledge of this world comes from.** The parts of this design
  that are strongest are the ones that came from talking to people who actually
  operate these systems — the emergency button behaviour and the dispatch console
  setup in this design came from a department TAC and from direct experience, not
  from a specification document. Say where yours comes from.

- **Something you have shipped or run end to end**, ideally where you had to
  decide what *not* to build. The two-tier alarm design is entirely a series of
  decisions about what not to alert on.

- **Why this role.** Product lead here means holding the radio domain, the
  customer's operational reality, and the engineering constraints at the same
  time. Say why that is the job you want.

*[Then close:]*

I built this to find out whether the idea survived contact with the actual
mechanics of P25, and it mostly did — with the one significant correction that
you cannot relay a blocked transmission, because it does not exist. That
correction is what turned this from a worse version of a product that already
ships into something nobody is doing.

---

## Appendix — presenter notes

*Not part of the spoken script.*

### If something goes wrong

- **The demo will not need the network.** Cached classifications, no live calls.
  The only page that needs connectivity is "Try it live," and it is a separate
  tab by design.
- **If the Command Feed tab looks wrong or out of sync**, just reload it. It
  announces itself to the RF tab and gets the whole history replayed. This is
  tested.
- **If you lose your place**, the numbered buttons on the RF tab jump to any of
  the seven beats. Both tabs rebuild from scratch on a jump.
- **If "Try it live" fails**, say so and move on — it costs you nothing. Fall
  back to: "the raw API responses are in the package, with timestamps."

### Questions to expect

**"Is this legal? You're listening to our radio traffic."**
Receiving unencrypted public safety radio is legal under federal law — there is
no reasonable expectation of privacy in an unencrypted transmission, which is why
scanners are sold in shops. The unit does not transmit, does not register with
the system, and holds no keys it was not given.

**"What if we encrypt?"**
Then the voice is denied to us, and that is correct. But call setup metadata is
never encrypted — system identifiers, unit ID, talkgroup, and crucially the
grant, queue, deny and emergency signalling. **The congestion detection and the
blocked-attempt reporting work with no keys at all.** You lose the speech
classification, not the core capability. And for an agency's own system, the
Control Panel lets them load the keys they already hold.

*[If pressed by someone technical, this is the precise version and it is worth
having:]* Encryption protects the payload inside the message, not the message
itself and not the radio signal carrying it. Every stage of our receiver runs
exactly as normal on an encrypted call — we recover the timing, the signal
strength, who transmitted, which talkgroup, whether they were granted or denied,
and if we had a second unit, a bearing. The only thing that comes out unreadable
is the voice itself. So encryption costs you one field at the very end of the
chain, not the capability.

**"How is this different from a scanner?"**
A scanner tells you what is being said. This tells you what is not getting said,
and who is not saying it, and turns that into one ranked picture. The receiver
technology is the boring part and I would rather not pretend otherwise.

**"You said the AI mislabelled something. Why should we trust it?"**
Because the design assumes it will be wrong sometimes. Nothing consequential
happens on one model output alone — a status check needs a unit the system has
actually heard on the trunk; an alarm needs two independent signals to escalate;
and no alarm closes without a person. I would be more worried about a system that
had not been caught being wrong yet.

**"What happens when you lose connectivity entirely?"**
The classification runs in the cloud on the primary path, which is sound because
a saturated radio trunk is not the same event as a regional loss of
connectivity — that is the exact situation ARC Edge exists to exploit. If
everything is gone, a smaller model runs on the unit's own compute. Lower
quality, still running. I want to be straight that Claude cannot run on the
device; that fallback would be a different, open-weight model.

**"How much of what you showed is real?"**
The detection engine, the alarms and the digest are real working code with 47
automated tests. The AI labels are real model output with the raw responses
included. The radio events are scripted, because there is no receiver. And ARC
Edge's own path selection is represented narratively, because it is your
intellectual property and not mine to reproduce.

**"How accurate is the direction finding? Give me a number."**
I will not, and I want to explain why rather than dodge. The errors our own
hardware causes are the ones we can measure and calibrate out, and those come to
a degree or two. They are also not the ones that will decide how it performs for
you. The larger error is a signal bouncing off a building and arriving from a
direction the radio is not in — and the uncomfortable part is that a reflection
arrives strong and clean, so it does not look like an error. It looks like a
confident answer pointing at a wall. No amount of calibrating our equipment fixes
that, because the problem is the building, not the radio.

So what I can tell you is how the system behaves about it. Every position it
gives you carries its own quality assessment, and it refuses to put a pin on a
map when the geometry is poor — it gives you a direction to search instead. With
two units it will tell you it cannot detect that kind of error. With three it can
tell you something is wrong. Anyone who quotes you a single accuracy figure for
this without asking what the scene looks like is selling you something.

**"Could you hear a radio that never got through to the tower?"**
Not as the first version of the design stood, and I want to be precise about
that. Our unit listens to what the tower transmits; an officer's radio transmits
on a different frequency about forty-five megahertz away.

We have since reworked the receiver so that it listens to both — and in doing so
we found something worse and fixed it. Our direction-finding array had been
pointed at the tower. A bearing to the tower is worth nothing; we know where the
tower is. The array now points at the frequencies the handsets actually transmit
on, which means **the officer whose call never got through is the one we can both
hear and take a bearing on.**

The tower did not go to waste, either. It is a transmitter at a surveyed
position, so we now use it as a permanent reference — it tells us continuously
whether our own direction finding is still calibrated.

But all of that is a decision on paper. It is written up in the hardware document
with the numbers, and it is not built, and I would not stand here and tell you
otherwise.

**"Your block diagram is missing a stage."**
*[If an engineer says this — they are probably right, and here is the one we
already found ourselves.]*
If you mean the interface between the radio chip and the computer, yes — an
earlier version of my diagram had them wired together directly, and they cannot
be. The radio chip puts out a very high rate digital stream that the computer
module has no input for. There is an FPGA between them, it is in the current
document, and it turns out to be a good thing rather than a bad one because it is
also the right place to do the channel separation. I would rather show you a
diagram I have already corrected twice than one nobody has checked.

**"What if something nearby is transmitting hard? Doesn't that swamp your
receiver?"**
*[If somebody asks this, they know radio. Answer it properly — it is a real
limit and we have a real answer.]*

Yes, it does, and it is the honest weak point of listening across a wide slice of
spectrum at once. A patrol vehicle keying up fifty watts from ten metres away
raises our noise floor, and while that is happening we cannot hear as far. Worse,
the interfering radio is one of yours, on the band we are monitoring, so no
filter can help us — it is a signal we are supposed to be listening to.

So we do not pretend it away. **The unit measures how deaf it currently is and
says so.** Not as a diagnostic buried in a menu — on the commander's screen, as a
condition, in plain terms: we can currently hear about an eighth as far as
normal, for the last thirty seconds. Because the dangerous version of this is not
being partly deaf. It is being partly deaf and having nothing on the screen look
any different, so silence reads as calm.

That is the same rule as everything else in this design: an absence you have been
told about is very much better than an absence you have not.

**"Why not just fix the trunk / add channels?"**
Different budget, different timescale, different owner — and LCRA operates that
system, not you. This is designed to work around the constraint rather than
requiring anyone to change it, which is why it can be deployed by an agency that
controls none of the infrastructure.
