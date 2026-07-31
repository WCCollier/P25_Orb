/*
 * The one page in this demo that touches the network at presentation time.
 *
 * It exists to answer the obvious question — "is the AI actually doing anything,
 * or did you write those labels yourself?" — without putting the scripted demo
 * at the mercy of a conference wifi network. Everything here is allowed to fail
 * visibly and harmlessly.
 */

(function () {
  const el = (id) => document.getElementById(id);

  const PRESETS = [
    { label: 'Routine',        text: "Dispatch, 1104, I'm 10-97 at the north lot, staging with the second unit." },
    { label: 'Ambiguous',      text: "Uh, dispatch, can somebody swing by the east door, something's not right over here." },
    { label: 'Officer down',   text: "Officer down! Officer down, two hundred hallway, I need medics now!" },
    { label: 'Status check',   text: "4471, dispatch. 4471, radio check, do you copy?" },
    { label: 'Cut off',        text: "Shots f—", truncated: true },
  ];

  const presetRow = el('presets');
  for (const preset of PRESETS) {
    const button = document.createElement('button');
    button.textContent = preset.label;
    button.addEventListener('click', () => {
      el('transcript').value = preset.text;
      el('truncated').checked = !!preset.truncated;
      el('transcript').focus();
    });
    presetRow.appendChild(button);
  }

  fetch('/api/status')
    .then((r) => r.json())
    .then((s) => {
      const tag = el('status-tag');
      if (s.key_available) {
        tag.textContent = s.model + ' · ready';
        tag.className = 'tag ok';
      } else {
        tag.textContent = 'no API key on server';
        tag.className = 'tag alarm';
      }
    })
    .catch(() => {
      const tag = el('status-tag');
      tag.textContent = 'server not reached — is serve.py running?';
      tag.className = 'tag alarm';
    });

  function field(label, value, className) {
    const div = document.createElement('div');
    div.className = 'field-out ' + (className || '');
    const key = document.createElement('span');
    key.className = 'k';
    key.textContent = label;
    const val = document.createElement('span');
    val.className = 'v';
    val.textContent = value;
    div.append(key, val);
    return div;
  }

  function renderResult(payload) {
    const box = el('result');
    box.hidden = false;
    box.innerHTML = '';

    if (payload.error) {
      box.className = 'result error';
      const h = document.createElement('h2');
      h.textContent = 'That call did not go through.';
      const p = document.createElement('p');
      p.textContent = payload.error + (payload.detail ? ' — ' + payload.detail : '');
      const note = document.createElement('p');
      note.className = 'note';
      note.textContent =
        'Nothing in the two-tab demo depends on this page, so the presentation is unaffected.';
      box.append(h, p, note);
      return;
    }

    const c = payload.classification;
    box.className = 'result ok';

    const head = document.createElement('div');
    head.className = 'result-head';
    const tier = document.createElement('span');
    tier.className = 'prio ' + c.priority;
    tier.textContent = c.priority;
    const cat = document.createElement('span');
    cat.className = 'cat';
    cat.textContent = c.category.replace(/_/g, ' ');
    const model = document.createElement('span');
    model.className = 'model';
    model.textContent = 'live from ' + payload.model;
    head.append(tier, cat, model);

    const digest = document.createElement('p');
    digest.className = 'digest-line';
    digest.textContent = c.digest;

    box.append(head, digest);

    box.appendChild(field('Indicates distress', c.distress ? 'yes' : 'no',
      c.distress ? 'hot' : ''));
    box.appendChild(field('Keywords', c.keywords.length ? c.keywords.join(', ') : '—'));
    box.appendChild(field('Is a status check', c.is_status_check ? 'yes' : 'no'));
    box.appendChild(field('About another unit', c.subject_unit || '—'));
    if (c.cut_off_meaning) box.appendChild(field('Cut off', c.cut_off_meaning, 'hot'));

    const engineNote = document.createElement('p');
    engineNote.className = 'note';
    engineNote.textContent = c.distress
      ? 'In the demo this would raise a Suspected alert on its own, and escalate only if a second, independent signal appeared.'
      : 'In the demo this would go into the running digest and raise no alarm.';
    box.appendChild(engineNote);

    const raw = document.createElement('details');
    raw.className = 'raw';
    const summary = document.createElement('summary');
    summary.textContent = 'Raw JSON returned by the model';
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(c, null, 2);
    raw.append(summary, pre);
    box.appendChild(raw);
  }

  async function classify() {
    const transcript = el('transcript').value.trim();
    if (!transcript) { el('transcript').focus(); return; }

    const button = el('go');
    button.disabled = true;
    button.textContent = 'Calling the model…';

    try {
      const response = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          transcript,
          unit: el('unit').value.trim(),
          talkgroup: el('talkgroup').value.trim(),
          truncated: el('truncated').checked,
        }),
      });
      renderResult(await response.json());
    } catch (error) {
      renderResult({ error: 'Could not reach the local server.', detail: String(error) });
    } finally {
      button.disabled = false;
      button.textContent = 'Classify';
    }
  }

  el('go').addEventListener('click', classify);
  el('transcript').addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') classify();
  });
})();
