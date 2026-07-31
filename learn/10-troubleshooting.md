# Module 10 — Troubleshooting

**Time:** about 30 minutes.
**Goal:** diagnose and fix anything likely to go wrong, fast, including with an
audience watching.

Every behaviour described here has been verified against the actual system.

---

## 10.1 The thirty-second pre-flight

Run this before any presentation. If all four lines are clean, you are fine.

```
cd /home/ancient/orb_app_project
node test/engine-test.js   | tail -2
node test/ui-smoke-test.js | tail -2
python3 df/test_aoa_fix.py | tail -2
curl -s http://localhost:8000/api/status
```

Expect `47 passed, 0 failed`, `13 passed, 0 failed`, `20 passed, 0 failed`, and
a JSON line with `"key_available": true`.

**If the API status line fails, the server is not running.** That is fine for the
tests but you need it for the demo.

---

## 10.2 Startup problems

### `Address already in use`

**Symptom:** a traceback ending in `OSError: [Errno 98] Address already in use`.

**Cause:** something already has port 8000 — usually a server you started
earlier and forgot.

**Fix, in order of preference:**

```
# 1. Find and stop it
ss -lptn 'sport = :8000'
kill <the pid shown>

# 2. Or just use a different port
PORT=8001 python3 serve.py
```

If you change the port, **both tabs must use the new one**. See §10.4.

### `API key: NOT FOUND`

**Symptom:** the startup banner reports the key was not found.

**This does not stop the demo.** The scripted two-tab presentation makes no
network calls and works completely without a key. Only the "try it live" page is
affected, and it will tell you so on load with a red tag.

**Verified behaviour with no key:**

- `/api/status` returns `"key_available": false` with an explanation
- `/api/classify` returns a clear error rather than a crash
- everything else is unaffected

**Fix:** confirm `.env` exists in the project root and contains
`ANTHROPIC_API_KEY=sk-ant-...` on one line. Or set it in the environment:

```
ANTHROPIC_API_KEY=sk-ant-... python3 serve.py
```

### `python3: command not found`

Try `python` instead. The project needs Python 3.8 or newer; it was built on
3.12.

---

## 10.3 The demo does not run

### Pressing Play does nothing

Open the browser console (F12). If you see a JavaScript error, run
`node test/ui-smoke-test.js` — it checks every element the scripts look for
against the ids actually present in the HTML, and will name the problem.

### The page loads but is unstyled

CSS failed to load. Check the network tab for a 404. Confirm the server is
serving from the right directory — `serve.py` serves `demo/`, so
`http://localhost:8000/` should give you the landing page, not a file listing.

### You opened the HTML file directly

**Symptom:** the address bar starts with `file://`. Nothing works properly — the
tabs will not talk to each other and the live page cannot reach the server.

**Fix:** always go through `http://localhost:8000`. The demo is served, not
opened.

---

## 10.4 The two tabs are not talking

**This is the most likely live failure, and it has one overwhelmingly common
cause.**

### Symptom

The RF Environment tab plays normally, but the Command Feed stays empty and its
tag reads `RF source: waiting`.

### Cause 1 — the tabs are on different origins

`BroadcastChannel` only connects pages on the **same origin**. These are
different origins even though they reach the same server:

| | |
|---|---|
| `http://localhost:8000` | ✅ |
| `http://127.0.0.1:8000` | ❌ different origin from the above |
| `http://localhost:8001` | ❌ different port |

**Fix:** open both tabs from the same link, by clicking through from the landing
page rather than typing addresses. This is why the landing page exists.

### Cause 2 — the Command Feed opened first

The Command Feed announces itself on load and the RF tab replays history. If the
RF tab was not open yet, there was nobody to hear it.

**Fix:** reload the Command Feed. It will announce itself again.

### Cause 3 — different browser profiles or a private window

Two different browsers, or one normal and one private window, do not share a
`BroadcastChannel`.

**Fix:** same browser, same profile, two ordinary tabs or windows.

---

## 10.5 The demo runs but looks wrong

### No alarms appear at beat 4

Run `node test/engine-test.js`. If the beat 4 assertions fail, the engine has
been modified — restore it from version control or from your backup.

If tests pass but the demo shows nothing, the Command Feed is not receiving
events. Go to §10.4.

### The trunk gauge reads `NO SIGNAL` in the middle of the demo

`NO_SIGNAL` means fewer than three *resolved* calls in the last 30 seconds — not
an error, just insufficient traffic to judge. It is normal in the first few
seconds. If it appears mid-demo, you have probably jumped to a beat and paused
immediately; let it run.

### The alarm escalated at the wrong moment

The status-check answer window is 15 seconds of *timeline* time. If you paused
during it, it correctly did not advance. That is the designed behaviour, not a
bug — the engine's clock is driven by the RF tab.

### The digest is scrolling away from what you want to show

The digest auto-scrolls only when you are already near the bottom. Scroll up to
read something and it will stay put.

---

## 10.6 "Try it live" fails

**First: this cannot affect the scripted demo.** Nothing in the two-tab
presentation touches this endpoint. Say so and move on — you lose nothing.

| Symptom | Cause | Fix |
|---|---|---|
| `server not reached — is serve.py running?` | Server is down | Restart it |
| `no API key on server` | `.env` missing or unreadable | §10.2 |
| `The API returned 401` | Key invalid or revoked | Replace the key |
| `The API returned 429` | Rate limited | Wait a moment and retry |
| `Live classification failed` + network detail | No internet | Nothing to fix on your side |

**The fallback line to have ready:**

> That is the one part of this that needs the network, which is exactly why it is
> on its own page and not in the demo. The raw API responses from when these were
> generated are in the package, with timestamps and token counts, if you want to
> see the real outputs.

---

## 10.7 If you have changed something

| You changed | You must re-run | Why |
|---|---|---|
| `demo/js/timeline.js` (added/edited a transmission) | `tools/generate_classifications.py`, then `test/engine-test.js` | New speech needs a classification; new labels can change engine behaviour |
| `demo/js/detection-engine.js` | `test/engine-test.js` | The beat assertions encode the demo narrative |
| Either tab's HTML | `test/ui-smoke-test.js` | It checks every element id the scripts use |
| `classifier.py` (the prompt) | `tools/generate_classifications.py`, then `test/engine-test.js` | The cache is now stale |
| `df/aoa_fix.py` | `df/test_aoa_fix.py` | — |

**If a test fails after your change, the change is probably wrong.** The
assertions encode deliberate design decisions, not implementation details.

### Restoring a known-good state

If you have edited the engine while experimenting (Module 6) and lost track:

```
cp /tmp/engine.bak demo/js/detection-engine.js   # if you made a backup
node test/engine-test.js                          # expect 47 passed, 0 failed
```

**Always confirm `47 passed, 0 failed` before presenting.**

---

## 10.8 Live recovery playbook

What to actually do, on your feet, with people watching.

| Situation | Move |
|---|---|
| Lost your place in the timeline | Press the beat number you want. Both tabs rebuild. |
| Command Feed tab closed or broken | Reopen it from the landing page. It repopulates automatically. |
| RF tab closed | Reopen and reload the Command Feed too, so it re-announces. |
| Server died | `python3 serve.py`, reload both tabs. About fifteen seconds. |
| Something looks wrong and you cannot tell why | Press **R** to reset, then Play. Cheapest fix available. |
| Total failure | Talk through the static screenshots in the documentation. The argument does not depend on the animation. |

**The general rule: reset and replay is almost always faster than diagnosing.**
The whole timeline is under three minutes and jumping to a beat is instant.

**Do not debug in front of the audience.** Take the recovery action, keep
talking, and if it does not work in one attempt, move to the next section of the
pitch and come back.

---

## Exercises

**10.1** Break it deliberately and fix it: start a second server on port 8000
while one is running. Read the error. Fix it both ways — killing the process, and
using `PORT=8001`.

**10.2** Rename `.env` to `.env.off`, restart the server, and confirm the
scripted demo still runs completely. Check what the live page says. Restore it.

**10.3** Open the Command Feed at `http://127.0.0.1:8000/command-feed.html` and
the RF tab at `http://localhost:8000/rf-environment.html`. Confirm they do not
connect. This is the failure most likely to catch you out — see it once.

**10.4** Run the live recovery playbook end to end: start the demo, run to beat
5, close the Command Feed, reopen it, and carry on. Time yourself. Under
fifteen seconds is achievable.

**10.5** Rename an element id in `command-feed.html`, run the UI smoke test, read
how it reports the problem, and change it back.

---

## You can now explain

- The four-command pre-flight check and what healthy output looks like.
- Every startup failure and its fix.
- Why the two tabs must be on the same origin, and the exact trap.
- Which symptoms are actually correct behaviour rather than bugs.
- Why a "try it live" failure costs you nothing, and what to say.
- What to re-run after each kind of change.
- The recovery move for every live failure, without debugging in public.

---

**Next:** [Module 11 — Demonstrating and defending](11-demo-and-defend.md)
