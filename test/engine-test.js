/*
 * Detection engine test.
 *
 *   node test/engine-test.js
 *
 * No test framework and no dependencies, so this runs anywhere Node runs.
 *
 * The point of this file is to make one claim checkable: that the alarms in the
 * demo are computed by the engine from the event stream, and are not stage
 * directions in the timeline. It replays the real scripted timeline with the
 * real cached classifications and asserts that each beat of the design
 * document's demo script comes out of the engine on its own.
 *
 * The last group of tests exercises the corroboration rule directly with
 * synthetic events, because that rule is the heart of the two-tier design and
 * deserves to be tested apart from the scripted sequence.
 */

const path = require('path');
const { TIMELINE, TIMELINE_DURATION } = require(path.join(__dirname, '..', 'demo', 'js', 'timeline.js'));
const { CLASSIFICATIONS } = require(path.join(__dirname, '..', 'demo', 'js', 'classifications.js'));
const { createEngine } = require(path.join(__dirname, '..', 'demo', 'js', 'detection-engine.js'));

let passed = 0;
let failed = 0;

function check(description, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ok    ${description}`);
  } else {
    failed++;
    console.log(`  FAIL  ${description}`);
    if (detail !== undefined) console.log(`        ${detail}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/*
 * Replay the timeline up to a given moment, advancing the clock in small steps
 * so that time-based logic (the status-check answer window) fires when it would
 * fire in the live demo rather than all at once at the end.
 */
function replayTo(stopAt) {
  const engine = createEngine();
  const events = TIMELINE.slice().sort((a, b) => a.t - b.t);
  let next = 0;

  for (let t = 0; t <= stopAt; t += 250) {
    while (next < events.length && events[next].t <= t) {
      const event = events[next++];
      engine.ingest(Object.assign({}, event, { classification: CLASSIFICATIONS[event.id] }));
    }
    engine.tick(t);
  }
  return engine;
}

const alertFor = (state, unit) => state.alerts.find((a) => a.unit === unit);
const kindsOf = (alert) => alert.signals.map((s) => s.kind).sort();

// ---------------------------------------------------------------------------

section('Beat 1 — calm baseline');
{
  const s = replayTo(22000).getState();
  check('every request is getting a channel', s.congestion.level === 'NOMINAL', `level=${s.congestion.level}`);
  check('no alerts raised on routine traffic', s.alerts.length === 0, `${s.alerts.length} alerts`);
  check('routine transmissions still reach the digest', s.digest.length > 0);
}

section('Beat 2 — congestion builds');
{
  const s = replayTo(47000).getState();
  check('trunk is no longer nominal', s.congestion.level === 'ELEVATED', `level=${s.congestion.level}`);
  check('still no alerts — congestion alone is not an emergency', s.alerts.length === 0);
}

section('Beat 3 — blocked-attempt burst');
{
  const s = replayTo(72000).getState();
  check('trunk reads as saturated', s.congestion.level === 'SATURATED', `level=${s.congestion.level}`);
  check('correlated blocking raised a scene advisory',
    s.advisories.some((a) => a.kind === 'BLOCKED_BURST'));
  check('blocked attempts were counted', s.counters.blocked >= 8, `blocked=${s.counters.blocked}`);
  check('a burst of blocked units still raises no unit alarm', s.alerts.length === 0,
    `alerts=${s.alerts.map((a) => a.unit).join(',')}`);
}

section('Beat 4 — the transmission that cuts off');
{
  const s = replayTo(76000).getState();
  const a = alertFor(s, '8M-4471');
  check('an alert is raised for 8M-4471', !!a);
  check('it is SUSPECTED, not high confidence', a && a.tier === 'SUSPECTED', a && a.tier);
  check('the cut-off itself was noticed',
    a && a.signals.some((s) => s.kind === 'PARTIAL_TRANSMISSION'));

  /*
   * The fragment "Shots f—" is BOTH a truncation and a distress keyword, and the
   * engine records both, because the commander should see everything we noticed.
   * The tier must still be SUSPECTED: they are two readings of the same one and
   * a half seconds of audio, and noticing two things about one observation is
   * not corroboration.
   *
   * This is the case that makes the source-event half of the corroboration rule
   * load-bearing. Delete `sources.size >= 2` from tierFor and this test fails.
   */
  check('the distress reading of the fragment was also recorded',
    a && a.signals.some((s) => s.kind === 'AI_DISTRESS'));
  check('two different signal KINDS are present', a && a.kindCount === 2, a && a.kindCount);
  check('but they came from a single source event', a && a.sourceCount === 1, a && a.sourceCount);
  check('so the alert stays SUSPECTED despite two kinds', a && a.tier === 'SUSPECTED');
}

section('Beat 4 (continued) — blocked attempts must not escalate');
{
  // 8M-4471 tries to key up again at t=78.6s and is blocked. That is visible to
  // the commander but must not be treated as corroboration.
  const s = replayTo(87000).getState();
  const a = alertFor(s, '8M-4471');
  check('still SUSPECTED after the unit is blocked again', a && a.tier === 'SUSPECTED', a && a.tier);
  check('the blocked retry is shown as context on the alert',
    a && a.blockedAttemptsSince >= 1, a && `blockedAttemptsSince=${a.blockedAttemptsSince}`);
}

section('Beat 5 — the status check nobody answers');
{
  const before = replayTo(100000).getState();
  check('the alert has not escalated while the answer window is open',
    alertFor(before, '8M-4471').tier === 'SUSPECTED');

  const s = replayTo(110000).getState();
  const a = alertFor(s, '8M-4471');
  check('silence after the status check escalates the alert',
    a.tier === 'HIGH_CONFIDENCE', a.tier);
  check('the escalation is attributed to the unanswered check',
    a.signals.some((x) => x.kind === 'STATUS_CHECK_UNANSWERED'));
  check('the two signals come from different source events',
    new Set(a.signals.map((x) => x.sourceEventId)).size >= 2);
}

section('Beat 5 (continued) — a mislabelled status check is ignored');
{
  // Campus PD's "we're at the gym doors, nothing here" (e069) came back from the
  // classifier flagged as a status check with no subject unit. With nobody to
  // wait on, the engine must do nothing rather than invent a subject.
  const s = replayTo(110000).getState();
  check('no alert exists for the campus unit', !alertFor(s, '8M-6001'));
  check('exactly one unit is under alert at this point', s.alerts.length === 1,
    s.alerts.map((a) => a.unit).join(','));
}

section('Beat 6 — emergency button plus voice');
{
  const s = replayTo(125000).getState();
  const a = alertFor(s, '8M-2210');
  check('an alert is raised for 8M-2210', !!a);
  check('it is high confidence immediately', a && a.tier === 'HIGH_CONFIDENCE', a && a.tier);
  check('corroborated by the emergency button and the speech, separately',
    a && kindsOf(a).join(',') === 'AI_DISTRESS,TX_EMERGENCY', a && kindsOf(a).join(','));
  check('two units are now under alert', s.alerts.length === 2);

  // 8M-2210 shouted "officer down" and was heard — but he is the one who is
  // down. Treating his own distress call as him checking in would put a
  // reassuring note on the alert of the only unit actually incapacitated.
  check('a unit\'s own distress call does not count as it checking in',
    a && a.subjectHeardFrom === false);
}

section('Beat 6 (continued) — a report about a unit does not clear it');
{
  // At t=140s another officer reports on the talkaround channel that 4471 is up
  // and talking. That is attached to the alert, and the alert stays open.
  const s = replayTo(143000).getState();
  const a = alertFor(s, '8M-4471');
  check('the third-party report is attached as related traffic',
    a.relatedTraffic.length >= 1, `relatedTraffic=${a.relatedTraffic.length}`);
  check('hearing ABOUT the unit does not count as hearing FROM it',
    a.subjectHeardFrom === false);
  check('the alert is still open', a.acknowledged === false);
}

section('Beat 7 — resolution');
{
  const s = replayTo(TIMELINE_DURATION).getState();
  const a = alertFor(s, '8M-4471');
  check('the unit transmitting itself is recorded as heard from',
    a.subjectHeardFrom === true);
  check('the alert still does not close on its own', a.acknowledged === false);
  // Not just "no longer saturated" — the commander should see the trunk back to
  // normal, not a gauge that has quietly given up for lack of samples.
  check('the trunk reads as recovered, not as no-signal',
    s.congestion.level === 'NOMINAL', s.congestion.level);
  check('the command view ranks high confidence above suspected',
    s.commandView[0].tier === 'HIGH_CONFIDENCE', JSON.stringify(s.commandView.map((i) => i.tier)));
  check('the whole timeline was consumed', s.counters.events === TIMELINE.length,
    `${s.counters.events}/${TIMELINE.length}`);
}

section('Acknowledgement is the only thing that closes an alert');
{
  const engine = replayTo(TIMELINE_DURATION);
  check('alert is open before acknowledgement',
    engine.getState().commandView.some((i) => i.unit === '8M-4471'));
  engine.acknowledge('8M-4471');
  check('acknowledging removes it from the command view',
    !engine.getState().commandView.some((i) => i.unit === '8M-4471'));
}

// ---------------------------------------------------------------------------
// The corroboration rule, tested directly.
// ---------------------------------------------------------------------------

section('Corroboration rule — independence is enforced on both axes');
{
  const withDistress = (id, unit, t, distress) => ({
    id, t, unit, type: 'VOICE', tg: 5301, transcript: 'test',
    classification: {
      priority: distress ? 'EMERGENCY' : 'ROUTINE',
      category: 'OTHER', distress, keywords: [], is_status_check: false,
      subject_unit: '', cut_off_meaning: '', digest: 'test',
    },
  });

  // Two signals, same kind, different events: not corroboration.
  const sameKind = createEngine();
  sameKind.ingest(withDistress('x1', '8M-9001', 1000, true));
  sameKind.ingest(withDistress('x2', '8M-9001', 2000, true));
  const a1 = alertFor(sameKind.getState(), '8M-9001');
  check('two distress calls from the same unit stay SUSPECTED',
    a1.tier === 'SUSPECTED', a1.tier);

  // Two different kinds from different events: corroboration.
  const twoKinds = createEngine();
  twoKinds.ingest({ id: 'y1', t: 1000, unit: '8M-9002', type: 'TX_EMERGENCY', tg: 5301 });
  twoKinds.ingest(withDistress('y2', '8M-9002', 2000, true));
  const a2 = alertFor(twoKinds.getState(), '8M-9002');
  check('emergency button plus a separate distress call escalates',
    a2.tier === 'HIGH_CONFIDENCE', a2.tier);

  const sameSource = createEngine();
  sameSource.ingest({ id: 'z1', t: 1000, unit: '8M-9003', type: 'TX_EMERGENCY', tg: 5301 });
  const a3 = alertFor(sameSource.getState(), '8M-9003');
  check('a single emergency declaration alone is SUSPECTED', a3.tier === 'SUSPECTED', a3.tier);

  // Two different kinds from the SAME source event: not corroboration. This is
  // the rule stated in isolation, apart from the scripted timeline.
  const oneMoment = createEngine();
  oneMoment.ingest({
    id: 'w1', t: 1000, unit: '8M-9004', type: 'VOICE', tg: 5301,
    truncated: true, transcript: 'Shots f—',
    classification: {
      priority: 'EMERGENCY', category: 'SHOTS_FIRED', distress: true,
      keywords: ['Shots f—'], is_status_check: false, subject_unit: '',
      cut_off_meaning: 'cut off mid-word', digest: 'possible shots fired',
    },
  });
  const a4 = alertFor(oneMoment.getState(), '8M-9004');
  check('one transmission yielding two kinds does NOT escalate',
    a4.tier === 'SUSPECTED', `${a4.tier} kinds=${a4.kindCount} sources=${a4.sourceCount}`);
  check('and both observations are still shown to the commander',
    a4.signals.length === 2, `${a4.signals.length} signals`);

  // The same two kinds, arriving as two separate events, DOES escalate.
  const twoMoments = createEngine();
  twoMoments.ingest({
    id: 'v1', t: 1000, unit: '8M-9005', type: 'VOICE', tg: 5301,
    truncated: true, transcript: 'Shots f—',
    classification: {
      priority: 'EMERGENCY', category: 'SHOTS_FIRED', distress: false,
      keywords: [], is_status_check: false, subject_unit: '',
      cut_off_meaning: 'cut off mid-word', digest: 'cut off',
    },
  });
  twoMoments.ingest(withDistress('v2', '8M-9005', 5000, true));
  const a5 = alertFor(twoMoments.getState(), '8M-9005');
  check('the same two kinds from two separate events DOES escalate',
    a5.tier === 'HIGH_CONFIDENCE', `${a5.tier} sources=${a5.sourceCount}`);
}

section('Unit reference resolution');
{
  // The classifier returns whatever the speaker said. "4471" must resolve to the
  // observed unit 8M-4471; an unknown or ambiguous reference must resolve to
  // nothing rather than to the wrong officer.
  const s = replayTo(110000).getState();
  check('a bare "4471" in speech resolved to the observed unit 8M-4471',
    !!alertFor(s, '8M-4471'));
  check('no alert was created against a bogus unit id',
    s.alerts.every((a) => Object.prototype.hasOwnProperty.call(s.unitStats, a.unit)));
}

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
