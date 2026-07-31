/*
 * P25 Orb — detection, synthesis and alarm engine.
 *
 * This is the actual product. Everything else in the demo is a way of looking at
 * what this file decides.
 *
 * It is a pure state machine: events in, state out. It touches no DOM, does no
 * network I/O, and has no timers of its own — the caller drives the clock. That
 * is what makes it testable (see test/engine-test.js) and what lets us say the
 * alarms in the demo are computed rather than scripted.
 *
 * The design question this file answers is: given a stream of P25 control-channel
 * events and AI labels for the transmissions that got through, when should we
 * interrupt a commander who is already overloaded?
 */

// ---------------------------------------------------------------------------
// Tuning constants. These are demo values chosen so the scripted sequence reads
// clearly at presentation pace. In a real deployment they would be per-agency
// settings on the Control Panel, because what counts as "too long without an
// answer" is a doctrine decision, not an engineering one.
// ---------------------------------------------------------------------------

const ENGINE_CONFIG = {
  statusCheckTimeoutMs: 15000,   // how long a unit has to answer a status check
  congestionWindowMs: 30000,     // rolling window for the grant-rate calculation
  congestionMinSamples: 3,       // below this, "no signal" rather than a bad one
  saturatedBelow: 0.5,           // grant rate under this = SATURATED
  elevatedBelow: 0.85,           // grant rate under this = ELEVATED
  blockedBurstWindowMs: 15000,   // window for the correlated-blocking check
  blockedBurstMinUnits: 4,       // distinct units blocked in that window
};

/*
 * The four signal kinds that can move a unit's alert tier.
 *
 * Deliberately absent: blocked transmission attempts. During trunk saturation
 * every unit on scene is being blocked, so "this officer could not get a
 * channel" carries no information about whether THIS officer is in danger. We
 * count blocked attempts, and we show them on the alert card as context,
 * but they never raise or escalate an alarm on their own. Letting them do so
 * would produce an alert for every unit at exactly the moment the commander
 * can least afford noise.
 */
const SIGNAL_KINDS = {
  TX_EMERGENCY: {
    label: 'Emergency button',
    detail: 'Radio declared an emergency on the control channel — trunk-wide, independent of any voice.',
  },
  AI_DISTRESS: {
    label: 'Distress in speech',
    detail: 'The classifier read this transmission as indicating someone is in danger.',
  },
  PARTIAL_TRANSMISSION: {
    label: 'Transmission cut off',
    detail: 'The carrier dropped mid-word. Treated as higher concern than a complete transmission, not lower.',
  },
  STATUS_CHECK_UNANSWERED: {
    label: 'Status check unanswered',
    detail: 'Dispatch called this unit by name and nothing came back within the answer window.',
  },
};

const BLOCKING_TYPES = ['SYSTEM_BUSY', 'DENIED'];

function createEngine(config) {
  const cfg = Object.assign({}, ENGINE_CONFIG, config || {});

  const state = {
    clock: 0,
    alerts: {},          // unitId -> alert
    digest: [],          // synthesized feed, newest last
    outcomes: [],        // {t, granted:boolean, unit} for the congestion window
    blocks: [],          // {t, unit} blocked attempts, for burst detection
    pendingChecks: [],   // open status checks awaiting an answer
    congestion: { level: 'NO_SIGNAL', grantRate: null, granted: 0, blocked: 0 },
    advisories: [],      // scene-level, non-alarm notices
    unitStats: {},       // unitId -> {blocked, granted, lastHeard}
    counters: { events: 0, transmissions: 0, blocked: 0 },
  };

  let seq = 0;
  const nextId = (prefix) => `${prefix}-${++seq}`;

  // -------------------------------------------------------------------------
  // Unit reference resolution
  //
  // The classifier reports which unit a transmission is ABOUT. It returns
  // whatever form the speaker used, because that is what is in the audio — a
  // dispatcher says "4471", not "8M-4471". We resolve that reference against the
  // units we have actually observed on the trunk rather than trusting the string,
  // and we refuse to act on a reference we cannot resolve.
  // -------------------------------------------------------------------------
  function resolveUnit(reference) {
    if (!reference) return null;
    const cleaned = String(reference).trim().toUpperCase();
    if (!cleaned) return null;
    const known = Object.keys(state.unitStats);
    if (known.includes(cleaned)) return cleaned;
    const digits = cleaned.replace(/[^0-9]/g, '');
    if (!digits) return null;
    const matches = known.filter((u) => u.replace(/[^0-9]/g, '').endsWith(digits));
    // An ambiguous reference is worse than no reference: acting on the wrong
    // officer is a failure mode we would rather not have.
    return matches.length === 1 ? matches[0] : null;
  }

  function unitStat(unitId) {
    if (!state.unitStats[unitId]) {
      state.unitStats[unitId] = { blocked: 0, granted: 0, lastHeard: null, blockedSince: 0 };
    }
    return state.unitStats[unitId];
  }

  // -------------------------------------------------------------------------
  // Alerts and the two-tier rule
  //
  // A unit's tier is decided by how many INDEPENDENT signals point at it.
  // Independence is the whole idea, so it is enforced on two axes: two signals
  // corroborate only if they are of different kinds AND came from different
  // source events. Two readings of the same one-and-a-half seconds of audio are
  // one observation, however many things you notice in it.
  // -------------------------------------------------------------------------
  function tierFor(alert) {
    const kinds = new Set();
    const sources = new Set();
    for (const s of alert.signals) {
      kinds.add(s.kind);
      sources.add(s.sourceEventId);
    }
    // Recorded on the alert so the Command Feed can tell the commander the
    // difference between "we noticed two things" and "two separate things
    // happened" — which is exactly the distinction the tier turns on.
    alert.kindCount = kinds.size;
    alert.sourceCount = sources.size;
    return kinds.size >= 2 && sources.size >= 2 ? 'HIGH_CONFIDENCE' : 'SUSPECTED';
  }

  function addSignal(unitId, kind, sourceEventId, t, note, effects) {
    let alert = state.alerts[unitId];
    const isNew = !alert;

    if (isNew) {
      alert = {
        id: nextId('alert'),
        unit: unitId,
        tier: 'SUSPECTED',
        raisedAt: t,
        updatedAt: t,
        signals: [],
        relatedTraffic: [],
        acknowledged: false,
        subjectHeardFrom: false,
        blockedAttemptsSince: 0,
      };
      state.alerts[unitId] = alert;
    }

    // Repeating a signal kind from the same source event adds nothing.
    const duplicate = alert.signals.some(
      (s) => s.kind === kind && s.sourceEventId === sourceEventId
    );
    if (!duplicate) {
      alert.signals.push({ kind, sourceEventId, t, note });
    }

    const before = alert.tier;
    alert.tier = tierFor(alert);
    alert.updatedAt = t;

    if (isNew) {
      effects.push({ type: 'ALERT_RAISED', unit: unitId, tier: alert.tier });
      pushDigest({
        t, kind: 'ALERT', unit: unitId, priority: alert.tier,
        text: `${alert.tier === 'HIGH_CONFIDENCE' ? 'High-confidence' : 'Suspected'} emergency raised for ${unitId}.`,
      });
    } else if (before !== alert.tier) {
      effects.push({ type: 'ALERT_ESCALATED', unit: unitId, tier: alert.tier });
      pushDigest({
        t, kind: 'ALERT', unit: unitId, priority: alert.tier,
        text: `${unitId} escalated to high confidence — a second independent signal.`,
      });
    }
    return alert;
  }

  function pushDigest(entry) {
    state.digest.push(Object.assign({ id: nextId('d') }, entry));
  }

  // -------------------------------------------------------------------------
  // Congestion, computed rather than declared
  //
  // Grant rate over a rolling window: of the requests that reached a final
  // outcome, how many actually got a channel? A queued call is not counted until
  // it resolves, because it has not failed yet.
  // -------------------------------------------------------------------------
  function recomputeCongestion(now) {
    const cutoff = now - cfg.congestionWindowMs;
    state.outcomes = state.outcomes.filter((o) => o.t >= cutoff);

    const granted = state.outcomes.filter((o) => o.granted).length;
    const blocked = state.outcomes.length - granted;
    const total = state.outcomes.length;

    let level = 'NO_SIGNAL';
    let grantRate = null;
    if (total >= cfg.congestionMinSamples) {
      grantRate = granted / total;
      if (grantRate < cfg.saturatedBelow) level = 'SATURATED';
      else if (grantRate < cfg.elevatedBelow) level = 'ELEVATED';
      else level = 'NOMINAL';
    }

    const changed = level !== state.congestion.level;
    state.congestion = { level, grantRate, granted, blocked };
    return changed;
  }

  function checkBlockedBurst(now, effects) {
    const cutoff = now - cfg.blockedBurstWindowMs;
    state.blocks = state.blocks.filter((b) => b.t >= cutoff);
    const distinct = new Set(state.blocks.map((b) => b.unit));

    if (distinct.size >= cfg.blockedBurstMinUnits) {
      const recent = state.advisories.find(
        (a) => a.kind === 'BLOCKED_BURST' && now - a.t < cfg.blockedBurstWindowMs
      );
      // A burst that keeps growing should keep counting. Reporting the number
      // that happened to trip the threshold understates what the commander is
      // actually looking at.
      if (recent && distinct.size > recent.units.length) {
        recent.units = Array.from(distinct);
        recent.text = `${distinct.size} units blocked from transmitting within ${
          cfg.blockedBurstWindowMs / 1000
        } seconds.`;
      }
      if (!recent) {
        const advisory = {
          id: nextId('adv'), kind: 'BLOCKED_BURST', t: now,
          units: Array.from(distinct),
          text: `${distinct.size} units blocked from transmitting within ${
            cfg.blockedBurstWindowMs / 1000
          } seconds.`,
          recommendation: 'Direct non-emergency traffic to 8TAC95D talkaround.',
        };
        state.advisories.push(advisory);
        effects.push({ type: 'ADVISORY', advisory });
        pushDigest({
          t: now, kind: 'SYSTEM', priority: 'URGENT',
          text: `Correlated blocking: ${distinct.size} units could not get a channel. ${advisory.recommendation}`,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Ingest
  // -------------------------------------------------------------------------
  function ingest(event) {
    const effects = [];
    const t = event.t;
    state.clock = Math.max(state.clock, t);
    state.counters.events += 1;

    const stat = unitStat(event.unit);

    switch (event.type) {
      case 'GRANT':
        stat.granted += 1;
        state.outcomes.push({ t, granted: true, unit: event.unit });
        break;

      case 'SYSTEM_BUSY':
      case 'DENIED':
        stat.blocked += 1;
        state.counters.blocked += 1;
        state.outcomes.push({ t, granted: false, unit: event.unit });
        state.blocks.push({ t, unit: event.unit });
        // Blocked attempts never raise an alarm, but if a unit is already under
        // an open alert the commander should see that it is still trying and
        // still failing.
        if (state.alerts[event.unit]) {
          state.alerts[event.unit].blockedAttemptsSince += 1;
        }
        checkBlockedBurst(t, effects);
        break;

      case 'TX_EMERGENCY':
        pushDigest({
          t, kind: 'SYSTEM', unit: event.unit, priority: 'EMERGENCY',
          text: `${event.unit} declared an emergency on the control channel.`,
        });
        addSignal(
          event.unit, 'TX_EMERGENCY', event.id, t,
          'Emergency declaration seen on the control channel.', effects
        );
        break;

      case 'VOICE':
      case 'FALLBACK_VOICE':
        handleVoice(event, t, effects);
        break;

      // CHANNEL_REQUEST and QUEUED are real and are shown in the raw feed, but
      // neither is a final outcome, so neither moves the congestion figure.
      default:
        break;
    }

    recomputeCongestion(t);
    return effects;
  }

  function handleVoice(event, t, effects) {
    const c = event.classification;
    state.counters.transmissions += 1;
    unitStat(event.unit).lastHeard = t;

    if (!c) {
      pushDigest({
        t, kind: 'TRANSMISSION', unit: event.unit, priority: 'ROUTINE',
        text: event.transcript, transcript: event.transcript,
        fallback: event.type === 'FALLBACK_VOICE', unclassified: true,
      });
      return;
    }

    pushDigest({
      t,
      kind: 'TRANSMISSION',
      unit: event.unit,
      priority: c.priority,
      category: c.category,
      text: c.digest,
      transcript: event.transcript,
      keywords: c.keywords,
      truncated: !!event.truncated,
      fallback: event.type === 'FALLBACK_VOICE',
    });

    const subject = resolveUnit(c.subject_unit);

    // A transmission about a unit under an open alert is attached to that alert
    // as related traffic. It is never grounds to close the alert: a third party
    // saying an officer looks fine is not the same as that officer answering.
    if (subject && state.alerts[subject]) {
      state.alerts[subject].relatedTraffic.push({
        t, from: event.unit, text: c.digest, transcript: event.transcript,
      });
      state.alerts[subject].updatedAt = t;
    }

    // Track whether this transmission is itself evidence of trouble for the unit
    // that sent it. If it is, hearing it must NOT be treated as reassurance — an
    // officer shouting "officer down" has been heard from in the literal sense
    // and is emphatically not fine. Only a transmission that adds no distress
    // signal of its own counts as the unit checking in.
    let raisedOwnSignal = false;
    const noteOwn = (target) => { if (target === event.unit) raisedOwnSignal = true; };

    if (event.truncated) {
      noteOwn(subject || event.unit);
      addSignal(
        subject || event.unit, 'PARTIAL_TRANSMISSION', event.id, t,
        c.cut_off_meaning || 'Transmission cut off mid-word.', effects
      );
      // A cut-off fragment often also reads as distress — "Shots f—" is both.
      // We record that as a second observation, because the commander should see
      // everything we noticed. It does NOT escalate the alert, because it
      // carries the same source event id, and the corroboration rule refuses to
      // treat two readings of one moment of audio as independent evidence.
      // This is the single most important line of behaviour in the engine, and
      // it is why the cut-off transmission raises Suspected and not more.
      if (c.distress) {
        addSignal(
          subject || event.unit, 'AI_DISTRESS', event.id, t,
          c.digest, effects
        );
      }
    } else if (c.distress) {
      noteOwn(subject || event.unit);
      addSignal(
        subject || event.unit, 'AI_DISTRESS', event.id, t,
        c.digest, effects
      );
    }

    // Hearing directly from a unit under an open alert is meaningful in a way
    // that hearing ABOUT it is not — but only when the transmission is not
    // itself the alarming thing.
    const ownAlert = state.alerts[event.unit];
    if (ownAlert && !ownAlert.acknowledged && !raisedOwnSignal) {
      ownAlert.subjectHeardFrom = true;
      ownAlert.updatedAt = t;
      effects.push({ type: 'SUBJECT_RESPONDED', unit: event.unit });
    }

    // A status check only starts a clock if we can work out who is being called.
    // The classifier sometimes labels a routine "we're clear here" report as a
    // status check; with no resolvable subject there is nobody to wait on, so
    // nothing happens. The engine does not act on a single unverified field.
    if (c.is_status_check && subject) {
      state.pendingChecks.push({
        id: nextId('chk'), subject, by: event.unit, t,
        dueAt: t + cfg.statusCheckTimeoutMs, sourceEventId: event.id, fired: false,
      });
      pushDigest({
        t, kind: 'SYSTEM', unit: subject, priority: 'ROUTINE',
        text: `Dispatch called ${subject}. Waiting ${cfg.statusCheckTimeoutMs / 1000}s for an answer.`,
      });
    }

    // Any transmission from a unit answers an open check on that unit.
    for (const check of state.pendingChecks) {
      if (!check.fired && check.subject === event.unit && t > check.t) {
        check.fired = true;
        check.answered = true;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Clock. The caller drives this so that pausing the demo genuinely pauses the
  // engine's sense of time, rather than the two drifting apart.
  // -------------------------------------------------------------------------
  function tick(now) {
    const effects = [];
    state.clock = Math.max(state.clock, now);

    for (const check of state.pendingChecks) {
      if (check.fired || now < check.dueAt) continue;
      check.fired = true;
      check.answered = false;
      addSignal(
        check.subject, 'STATUS_CHECK_UNANSWERED', check.id, now,
        `Called by ${check.by} at ${(check.t / 1000).toFixed(0)}s. No answer in ${
          cfg.statusCheckTimeoutMs / 1000
        }s.`,
        effects
      );
    }

    if (recomputeCongestion(now)) {
      effects.push({ type: 'CONGESTION_CHANGED', level: state.congestion.level });
      pushDigest({
        t: now, kind: 'SYSTEM', priority:
          state.congestion.level === 'SATURATED' ? 'URGENT' : 'ROUTINE',
        text: `Trunk status: ${state.congestion.level.toLowerCase()} (${Math.round(
          (state.congestion.grantRate || 0) * 100
        )}% of calls getting a channel).`,
      });
    }
    return effects;
  }

  function acknowledge(unitId) {
    const alert = state.alerts[unitId];
    if (alert) {
      alert.acknowledged = true;
      alert.updatedAt = state.clock;
    }
  }

  /*
   * The commander's view: what needs attention, in order. High-confidence
   * emergencies outrank suspected ones, and both outrank a congested trunk,
   * which mirrors the priority ordering the Texas interoperability plan already
   * puts on the books — danger to life first, on-scene tactical last. The plan
   * says to prioritise this way; the trunk has no mechanism to do it.
   */
  function commandView() {
    const open = Object.values(state.alerts).filter((a) => !a.acknowledged);
    const rank = { HIGH_CONFIDENCE: 0, SUSPECTED: 1 };
    const items = open
      .slice()
      .sort((a, b) => rank[a.tier] - rank[b.tier] || a.raisedAt - b.raisedAt)
      .map((a) => ({
        kind: 'ALERT',
        tier: a.tier,
        unit: a.unit,
        signalCount: a.signals.length,
        subjectHeardFrom: a.subjectHeardFrom,
        headline:
          a.tier === 'HIGH_CONFIDENCE'
            ? `${a.unit} — high-confidence emergency, ${a.signals.length} independent signals`
            : `${a.unit} — suspected emergency, uncorroborated`,
      }));

    if (state.congestion.level === 'SATURATED' || state.congestion.level === 'ELEVATED') {
      items.push({
        kind: 'CONGESTION',
        tier: state.congestion.level,
        headline: `Trunk ${state.congestion.level.toLowerCase()} — ${
          state.counters.blocked
        } blocked transmission attempts so far`,
      });
    }
    return items;
  }

  function getState() {
    return {
      clock: state.clock,
      congestion: state.congestion,
      alerts: Object.values(state.alerts).sort((a, b) => b.updatedAt - a.updatedAt),
      digest: state.digest,
      advisories: state.advisories,
      counters: state.counters,
      unitStats: state.unitStats,
      pendingChecks: state.pendingChecks.filter((c) => !c.fired),
      commandView: commandView(),
    };
  }

  function reset() {
    state.clock = 0;
    state.alerts = {};
    state.digest = [];
    state.outcomes = [];
    state.blocks = [];
    state.pendingChecks = [];
    state.congestion = { level: 'NO_SIGNAL', grantRate: null, granted: 0, blocked: 0 };
    state.advisories = [];
    state.unitStats = {};
    state.counters = { events: 0, transmissions: 0, blocked: 0 };
    seq = 0;
  }

  return { ingest, tick, acknowledge, getState, reset, config: cfg };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createEngine, ENGINE_CONFIG, SIGNAL_KINDS, BLOCKING_TYPES };
}
