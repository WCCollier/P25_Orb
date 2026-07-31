/*
 * Tab 2 — Command Feed.
 *
 * This file is only a view. Every judgement on screen — which alarms exist, what
 * tier they are, whether the trunk is saturated, what the commander should look
 * at first — comes out of detection-engine.js. Nothing here decides anything.
 *
 * What this file does do is attach the cached AI classification to each incoming
 * transmission before handing it to the engine. That mirrors the real product:
 * the radio hardware produces events, the classification layer labels the ones
 * that carry speech, and the detection engine reasons over the labelled stream.
 */

(function () {
  const channel = new BroadcastChannel(ORB_CHANNEL);
  const engine = createEngine();

  const el = (id) => document.getElementById(id);
  let renderQueued = false;
  let seenDigest = 0;

  el('attrib').textContent =
    'classified by ' + CLASSIFICATION_MODEL + ' · cached ' + CLASSIFICATION_GENERATED_AT;

  function clockText(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  function unitName(id) {
    const unit = UNITS[id];
    return unit ? unit.label : id;
  }

  function unitAgency(id) {
    const unit = UNITS[id];
    return unit ? unit.agency : '';
  }

  // ---- ingest ------------------------------------------------------------

  function feed(event) {
    engine.ingest(Object.assign({}, event, { classification: CLASSIFICATIONS[event.id] }));
    scheduleRender();
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }

  // ---- rendering ---------------------------------------------------------

  const SIGNAL_LABEL = {
    TX_EMERGENCY: 'Emergency button pressed',
    AI_DISTRESS: 'Distress heard in speech',
    PARTIAL_TRANSMISSION: 'Transmission cut off',
    STATUS_CHECK_UNANSWERED: 'Status check unanswered',
  };

  /*
   * The header line on an alert card has to carry a distinction the tier logic
   * turns on: how many things we NOTICED versus how many separate events those
   * came from. Two observations of one transmission is the case that must not
   * read like corroboration, because it is not.
   */
  function whyLine(alert) {
    const observations = alert.signals.length;
    const sources = alert.sourceCount;
    if (observations > 1 && sources === 1) {
      return observations + ' things noticed, all in the same transmission — ' +
             'not corroborated';
    }
    if (sources > 1) {
      return observations + ' signals from ' + sources + ' separate events';
    }
    return 'One signal, uncorroborated';
  }

  function renderAlarms(state) {
    const container = el('alarms');
    if (state.alerts.length === 0) {
      container.innerHTML = '<div class="empty">No alarms. Routine traffic only.</div>';
      return;
    }

    const rank = { HIGH_CONFIDENCE: 0, SUSPECTED: 1 };
    const ordered = state.alerts.slice().sort((a, b) => {
      if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
      return rank[a.tier] - rank[b.tier] || b.updatedAt - a.updatedAt;
    });

    container.innerHTML = '';
    for (const alert of ordered) {
      const card = document.createElement('div');
      card.className =
        'alert ' + (alert.tier === 'HIGH_CONFIDENCE' ? 'high' : 'suspected') +
        (alert.acknowledged ? ' acknowledged' : '');

      // Signals sharing a source event are two readings of one moment. Mark them
      // so the card cannot be misread as showing two independent findings.
      const perSource = {};
      for (const signal of alert.signals) {
        perSource[signal.sourceEventId] = (perSource[signal.sourceEventId] || 0) + 1;
      }
      const signals = alert.signals.map((signal) =>
        '<li' + (perSource[signal.sourceEventId] > 1 ? ' class="shared-source"' : '') + '>' +
        '<span class="kind">' + (SIGNAL_LABEL[signal.kind] || signal.kind) + '</span> ' +
        '<span class="when">' + clockText(signal.t) + '</span>' +
        '<span class="detail"></span></li>'
      ).join('');

      card.innerHTML =
        '<div class="alert-head">' +
          '<span class="alert-tier">' +
            (alert.tier === 'HIGH_CONFIDENCE' ? 'High confidence' : 'Suspected') +
          '</span>' +
          '<span class="alert-unit">' + unitName(alert.unit) + '</span>' +
          '<span class="alert-agency">' + alert.unit + ' · ' + unitAgency(alert.unit) + '</span>' +
        '</div>' +
        '<p class="alert-why">' + whyLine(alert) + '</p>' +
        '<ul class="signals">' + signals + '</ul>' +
        '<div class="alert-context"></div>' +
        '<div class="alert-actions"></div>';

      // Signal detail text is set as text content rather than markup, since it
      // carries model-generated wording.
      const details = card.querySelectorAll('.signals .detail');
      alert.signals.forEach((signal, i) => { details[i].textContent = signal.note || ''; });

      const context = card.querySelector('.alert-context');
      const bits = [];
      if (alert.blockedAttemptsSince > 0) {
        bits.push('<span class="flag">Blocked ' + alert.blockedAttemptsSince +
          ' more time' + (alert.blockedAttemptsSince === 1 ? '' : 's') +
          ' since.</span> Still trying, still not getting through.');
      }
      if (alert.subjectHeardFrom) {
        bits.push('<span class="heard">This unit has since transmitted.</span>');
      }
      for (const related of alert.relatedTraffic) {
        const span = document.createElement('span');
        span.className = 'related';
        span.textContent = clockText(related.t) + ' — ' + unitName(related.from) + ': ' + related.text;
        bits.push(span.outerHTML);
      }
      if (bits.length === 0) {
        context.remove();
      } else {
        context.innerHTML = bits.join(' ');
      }

      const actions = card.querySelector('.alert-actions');
      if (alert.acknowledged) {
        actions.innerHTML = '<span class="tag">Acknowledged by commander</span>';
      } else {
        const button = document.createElement('button');
        button.textContent = 'Acknowledge';
        button.addEventListener('click', () => { engine.acknowledge(alert.unit); render(); });
        actions.appendChild(button);
      }

      container.appendChild(card);
    }
  }

  function renderCommandView(state) {
    const container = el('command-view');
    if (state.commandView.length === 0) {
      container.innerHTML = '<div class="empty">Nothing outstanding.</div>';
      return;
    }
    container.innerHTML = state.commandView.map((item, i) => {
      const cls =
        item.kind === 'CONGESTION' ? 'congestion'
        : item.tier === 'HIGH_CONFIDENCE' ? 'high' : 'suspected';
      const div = document.createElement('div');
      div.className = 'cv-item ' + cls;
      div.innerHTML = '<span class="cv-rank">' + (i + 1) + '</span><span class="cv-text"></span>';
      div.querySelector('.cv-text').textContent = item.headline;
      return div.outerHTML;
    }).join('') +
    '<p class="cv-note">Ordered by danger to life first, scene conditions last — the ' +
    'priority scheme the Texas interoperability plan already sets out. The trunk ' +
    'itself has no way to enforce it.</p>';
  }

  function renderDigest(state) {
    const container = el('digest');
    if (state.digest.length === 0) {
      container.innerHTML = '<div class="empty">Waiting for the RF Environment tab. Press Play there.</div>';
      seenDigest = 0;
      return;
    }
    if (seenDigest === 0) container.innerHTML = '';

    for (let i = seenDigest; i < state.digest.length; i++) {
      const entry = state.digest[i];
      const row = document.createElement('div');
      row.className = 'entry' +
        (entry.kind === 'SYSTEM' ? ' system' : '') +
        (entry.kind === 'ALERT' ? ' alert-entry' : '') +
        (entry.fallback ? ' fallback' : '');

      const who = entry.unit
        ? '<b>' + unitName(entry.unit) + '</b>' + entry.unit
        : '<b>SYSTEM</b>P25 Orb';

      row.innerHTML =
        '<div class="when">' + clockText(entry.t) + '</div>' +
        '<div class="who">' + who + '</div>' +
        '<div class="what"><div class="text"></div></div>';

      const what = row.querySelector('.what');
      what.querySelector('.text').textContent = entry.text;

      if (entry.transcript) {
        const said = document.createElement('span');
        said.className = 'said';
        said.textContent = '“' + entry.transcript + '”';
        what.appendChild(said);
      }

      const badges = [];
      if (entry.priority && entry.priority !== 'ROUTINE') {
        badges.push('<span class="badge ' + entry.priority + '">' + entry.priority + '</span>');
      }
      if (entry.category) {
        badges.push('<span class="badge">' + entry.category.replace(/_/g, ' ') + '</span>');
      }
      if (entry.truncated) badges.push('<span class="badge cut">cut off</span>');
      for (const keyword of entry.keywords || []) {
        const span = document.createElement('span');
        span.className = 'badge kw';
        span.textContent = keyword;
        badges.push(span.outerHTML);
      }
      if (badges.length) {
        const wrap = document.createElement('div');
        wrap.className = 'badges';
        wrap.innerHTML = badges.join('');
        what.appendChild(wrap);
      }

      container.appendChild(row);
    }
    seenDigest = state.digest.length;

    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 160;
    if (nearBottom) container.scrollTop = container.scrollHeight;
  }

  function renderScene(state) {
    const congestion = state.congestion;
    const level = el('gauge-level');
    level.textContent = congestion.level.replace('_', ' ');
    level.className = 'gauge-level ' + congestion.level;

    const rate = congestion.grantRate === null ? 0 : congestion.grantRate;
    const fill = el('gauge-fill');
    fill.style.width = Math.round(rate * 100) + '%';
    fill.style.background =
      congestion.level === 'SATURATED' ? 'var(--alarm)'
      : congestion.level === 'ELEVATED' ? 'var(--warn)'
      : 'var(--ok)';

    el('gauge-caption').textContent =
      congestion.grantRate === null
        ? 'Not enough traffic yet to judge.'
        : Math.round(rate * 100) + '% of calls are getting a channel, over the last 30 seconds.';

    el('s-grant').textContent   = congestion.granted + ' calls';
    el('s-blocked').textContent = state.counters.blocked + ' attempts';
    el('s-tx').textContent      = state.counters.transmissions + ' heard';

    const advisories = el('advisories');
    if (state.advisories.length === 0) {
      advisories.innerHTML = '<div class="empty">None.</div>';
    } else {
      advisories.innerHTML = state.advisories.slice().reverse().map((advisory) => {
        const div = document.createElement('div');
        div.className = 'advisory';
        div.innerHTML = '<span class="txt"></span><span class="rec"></span>';
        div.querySelector('.txt').textContent = clockText(advisory.t) + ' — ' + advisory.text;
        div.querySelector('.rec').textContent = advisory.recommendation;
        return div.outerHTML;
      }).join('');
    }

    const units = el('units');
    const ids = Object.keys(state.unitStats).sort();
    if (ids.length === 0) {
      units.innerHTML = '<div class="empty">None yet.</div>';
    } else {
      units.innerHTML = ids.map((id) => {
        const stat = state.unitStats[id];
        const alerted = state.alerts.some((a) => a.unit === id && !a.acknowledged);
        const div = document.createElement('div');
        div.className = 'unit-row' + (stat.blocked > 0 ? ' blocked' : '') + (alerted ? ' alerted' : '');
        div.innerHTML = '<span class="id"></span><span class="stat"></span>';
        div.querySelector('.id').textContent = unitName(id);
        div.querySelector('.stat').textContent = stat.granted + ' through / ' + stat.blocked + ' blocked';
        return div.outerHTML;
      }).join('');
    }
  }

  function render() {
    const state = engine.getState();
    renderAlarms(state);
    renderCommandView(state);
    renderDigest(state);
    renderScene(state);
  }

  // ---- channel wiring ----------------------------------------------------

  channel.addEventListener('message', (message) => {
    const data = message.data;
    if (!data) return;

    switch (data.type) {
      case MSG.EVENT:
        feed(data.event);
        break;

      case MSG.CLOCK:
        // The engine's sense of time comes from the RF tab, so pausing over
        // there genuinely pauses the answer window on a status check here.
        engine.tick(data.t);
        el('link-tag').textContent = 'RF source: ' + (data.playing ? 'live' : 'paused');
        el('link-tag').classList.toggle('ok', !!data.playing);
        scheduleRender();
        break;

      case MSG.RESET:
        engine.reset();
        seenDigest = 0;
        el('digest').innerHTML = '';
        render();
        break;

      case MSG.SYNC:
        engine.reset();
        seenDigest = 0;
        el('digest').innerHTML = '';
        for (const event of data.events) feed(event);
        engine.tick(data.t);
        render();
        break;

      case MSG.END:
        el('link-tag').textContent = 'RF source: timeline complete';
        break;
    }
  });

  // Announce ourselves so the RF tab replays anything that already happened.
  // This is what makes it safe to reload this tab in the middle of a demo.
  channel.postMessage({ type: MSG.HELLO });
  render();
})();
