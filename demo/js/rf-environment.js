/*
 * Tab 1 — RF Environment.
 *
 * Owns the clock and plays the scripted timeline. Renders every event as a raw
 * line of control-channel signalling and broadcasts it to the Command Feed. It
 * deliberately does no interpretation: no priorities, no alerts, no summaries.
 * Everything on this page is either something the receiver saw or a count of
 * things the receiver saw.
 *
 * In the shipping product this page is not a separate application — it is the
 * diagnostics view inside the Control Panel that a deploying technician uses to
 * confirm the unit is hearing the intended trunk before walking away.
 */

(function () {
  const channel = new BroadcastChannel(ORB_CHANNEL);

  const events = TIMELINE.slice().sort((a, b) => a.t - b.t);

  const player = {
    clock: 0,
    playing: false,
    speed: 1,
    cursor: 0,       // index of the next event to fire
    lastFrame: null,
  };

  const el = (id) => document.getElementById(id);
  const logEl = el('log');
  const channelsEl = el('channels');

  const counters = { req: 0, grant: 0, queue: 0, busy: 0, deny: 0, emerg: 0 };
  const activeChannels = new Map();  // frequency -> {unit, until}

  // ---- setup -------------------------------------------------------------

  el('k-system').textContent   = RF_CONFIG.systemName;
  el('k-wacn').textContent     = RF_CONFIG.wacn;
  el('k-sysid').textContent    = RF_CONFIG.systemId;
  el('k-nac').textContent      = RF_CONFIG.nac;
  el('k-site').textContent     = RF_CONFIG.siteId;
  el('k-cc').textContent       = RF_CONFIG.controlChannel + ' MHz';
  el('k-fallback').textContent = RF_CONFIG.fallbackChannel.name + ' / ' + RF_CONFIG.fallbackChannel.freq;
  el('cc-freq').textContent    = RF_CONFIG.controlChannel;
  el('sys-tag').textContent    = RF_CONFIG.systemName.split(' (')[0];

  renderChannels();  // the two permanent channelisers are up before any traffic

  const beatJump = el('beat-jump');
  BEATS.forEach((beat) => {
    const button = document.createElement('button');
    button.textContent = beat.n;
    button.title = `Beat ${beat.n}: ${beat.title}`;
    button.dataset.beat = beat.n;
    button.addEventListener('click', () => seekToBeat(beat.n));
    beatJump.appendChild(button);
  });

  // ---- rendering ---------------------------------------------------------

  const OP_TEXT = {
    CHANNEL_REQUEST: 'CHAN REQ',
    GRANT:           'GRANT',
    QUEUED:          'QUEUED',
    SYSTEM_BUSY:     'SYS BUSY',
    DENIED:          'PTT DENY',
    TX_EMERGENCY:    'TX EMERG',
    VOICE:           'VOICE',
    FALLBACK_VOICE:  'TALKAROUND',
  };

  const OP_CLASS = {
    CHANNEL_REQUEST: 'request',
    GRANT:           'grant',
    QUEUED:          'queued',
    SYSTEM_BUSY:     'busy',
    DENIED:          'denied',
    TX_EMERGENCY:    'emergency',
    VOICE:           'voice',
    FALLBACK_VOICE:  'fallback',
  };

  function clockText(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  function argText(event) {
    switch (event.type) {
      case 'CHANNEL_REQUEST':
        return 'TG ' + event.tg + (event.emergency ? '  PRIORITY' : '');
      case 'GRANT':
        return 'TG ' + event.tg + '  → ' + event.channel + ' MHz' + (event.emergency ? '  PRIORITY' : '');
      case 'QUEUED':
        return 'TG ' + event.tg + '  position ' + event.queuePosition;
      case 'SYSTEM_BUSY':
        return 'TG ' + event.tg + '  no channel available — call dropped, no voice transmitted';
      case 'DENIED':
        return 'TG ' + event.tg + '  not authorised on this talkgroup — no voice transmitted';
      case 'TX_EMERGENCY':
        return 'TG ' + event.tg + '  EMERGENCY DECLARED — trunk-wide';
      case 'VOICE':
        return '"' + event.transcript + '"';
      case 'FALLBACK_VOICE':
        return '8TAC95D  "' + event.transcript + '"';
      default:
        return '';
    }
  }

  function renderLine(event) {
    if (logEl.firstElementChild && logEl.firstElementChild.className === 'empty') {
      logEl.innerHTML = '';
    }
    const line = document.createElement('div');
    line.className = 'line ' + (OP_CLASS[event.type] || '');
    if (event.emergency && event.type !== 'TX_EMERGENCY') line.classList.add('emergency');
    if (event.truncated) line.classList.add('truncated');

    const unit = UNITS[event.unit];
    line.innerHTML =
      '<span class="t">' + clockText(event.t) + '</span>' +
      '<span class="unit">' + event.unit + '</span>' +
      '<span class="op">' + (OP_TEXT[event.type] || event.type) + '</span>' +
      '<span class="arg"></span>';
    // Transcripts are model- and script-authored text, so they go in as text
    // content rather than as markup.
    line.querySelector('.arg').textContent = argText(event);
    line.title = unit ? unit.label + ' — ' + unit.agency : event.unit;

    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;

    // Keep the DOM bounded during long rehearsal sessions.
    while (logEl.childElementCount > 400) logEl.removeChild(logEl.firstElementChild);
  }

  function bumpCounters(event) {
    if (event.type === 'CHANNEL_REQUEST') counters.req++;
    else if (event.type === 'GRANT') counters.grant++;
    else if (event.type === 'QUEUED') counters.queue++;
    else if (event.type === 'SYSTEM_BUSY') counters.busy++;
    else if (event.type === 'DENIED') counters.deny++;
    else if (event.type === 'TX_EMERGENCY') counters.emerg++;

    el('c-req').textContent   = counters.req;
    el('c-grant').textContent = counters.grant;
    el('c-queue').textContent = counters.queue;
    el('c-busy').textContent  = counters.busy;
    el('c-deny').textContent  = counters.deny;
    el('c-emerg').textContent = counters.emerg;
  }

  function trackChannel(event) {
    if (event.type === 'GRANT') {
      activeChannels.set(event.channel, { unit: event.unit, until: event.t + 5000 });
    } else if (event.type === 'FALLBACK_VOICE') {
      activeChannels.set(RF_CONFIG.fallbackChannel.freq, { unit: event.unit, until: event.t + 5000 });
    }
  }

  // Every value reaching this row is a configured frequency or a unit id from
  // the timeline, so it goes in as markup like the rest of this panel always
  // has. Transcripts are the only text on this page that needs escaping.
  function chanRow(freq, role, who, extraClass) {
    return '<div class="chan' + (extraClass ? ' ' + extraClass : '') + '">' +
      '<span class="freq">' + freq + '</span>' +
      '<span class="role">' + role + '</span>' +
      '<span class="who">' + who + '</span></div>';
  }

  /*
   * The control channel and the analog talkaround channel each have a
   * channeliser instantiated at start-up and never torn down; trunk voice
   * channels are created on a decoded grant and destroyed when the call ends
   * (hardware-design.md §3.3.1). Listing only the dynamic ones made the panel
   * read as though talkaround monitoring began when talkaround traffic did,
   * which understates the one thing this panel exists to show.
   */
  function renderChannels() {
    const fallbackFreq = RF_CONFIG.fallbackChannel.freq;
    const fallback = activeChannels.get(fallbackFreq);
    const fallbackLive = !!fallback && fallback.until > player.clock;

    const rows = [
      chanRow(RF_CONFIG.controlChannel, 'control', 'decoding', 'permanent'),
      chanRow(fallbackFreq, RF_CONFIG.fallbackChannel.name,
              fallbackLive ? fallback.unit : 'monitoring',
              'permanent' + (fallbackLive ? '' : ' quiet')),
    ];

    for (const [freq, info] of activeChannels) {
      if (freq === fallbackFreq) continue;
      const live = info.until > player.clock;
      rows.push(chanRow(freq, 'voice', live ? info.unit : 'idle', live ? '' : 'idle'));
    }

    channelsEl.innerHTML = rows.join('');
  }

  function setBeatBanner(n) {
    const beat = BEATS.find((b) => b.n === n);
    if (!beat) return;
    el('beat-banner').innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = 'Beat ' + beat.n + ' — ' + beat.title;
    const span = document.createElement('span');
    span.textContent = beat.note;
    el('beat-banner').append(strong, span);

    for (const button of beatJump.children) {
      button.classList.toggle('active', Number(button.dataset.beat) === n);
    }
  }

  // ---- playback ----------------------------------------------------------

  function emit(event) {
    renderLine(event);
    bumpCounters(event);
    trackChannel(event);
    channel.postMessage({ type: MSG.EVENT, event });
  }

  function broadcastClock() {
    channel.postMessage({
      type: MSG.CLOCK, t: player.clock, playing: player.playing, speed: player.speed,
    });
  }

  function frame(now) {
    if (!player.playing) { player.lastFrame = null; return; }

    if (player.lastFrame !== null) {
      player.clock += (now - player.lastFrame) * player.speed;
    }
    player.lastFrame = now;

    while (player.cursor < events.length && events[player.cursor].t <= player.clock) {
      emit(events[player.cursor++]);
    }

    const beat = BEATS.filter((b) => b.t <= player.clock).pop();
    if (beat && beat.n !== currentBeat) { currentBeat = beat.n; setBeatBanner(beat.n); }

    el('clock').textContent = clockText(player.clock) + ' / ' + clockText(TIMELINE_DURATION);
    renderChannels();
    broadcastClock();

    if (player.clock >= TIMELINE_DURATION) {
      pause();
      channel.postMessage({ type: MSG.END });
      el('beat-banner').innerHTML = '';
      const strong = document.createElement('strong');
      strong.textContent = 'Timeline complete.';
      const span = document.createElement('span');
      span.textContent =
        'Everything on this page is what the radio system did. The Command Feed tab is what the commander was actually shown.';
      el('beat-banner').append(strong, span);
      return;
    }

    requestAnimationFrame(frame);
  }

  let currentBeat = 0;

  function play() {
    if (player.clock >= TIMELINE_DURATION) reset();
    player.playing = true;
    player.lastFrame = null;
    el('btn-play').textContent = 'Pause';
    requestAnimationFrame(frame);
  }

  function pause() {
    player.playing = false;
    el('btn-play').textContent = 'Play';
    broadcastClock();
  }

  /*
   * Any jump in the timeline rebuilds the Command Feed from scratch rather than
   * trying to fast-forward its engine in place. Replaying the events up to the
   * new position is cheap and leaves no chance of the two tabs disagreeing about
   * what has happened — which matters more in a live presentation than elegance.
   */
  function seek(target, { announce = true } = {}) {
    const wasPlaying = player.playing;
    pause();

    player.clock = target;
    player.cursor = 0;
    counters.req = counters.grant = counters.queue = counters.busy = counters.deny = counters.emerg = 0;
    activeChannels.clear();
    logEl.innerHTML = '<div class="empty">Receiver idle. No traffic decoded.</div>';

    const history = [];
    while (player.cursor < events.length && events[player.cursor].t <= target) {
      const event = events[player.cursor++];
      history.push(event);
      renderLine(event);
      bumpCounters(event);
      trackChannel(event);
    }

    if (announce) {
      channel.postMessage({ type: MSG.RESET });
      channel.postMessage({ type: MSG.SYNC, events: history, t: target });
    }

    el('clock').textContent = clockText(player.clock) + ' / ' + clockText(TIMELINE_DURATION);
    renderChannels();
    broadcastClock();

    const beat = BEATS.filter((b) => b.t <= target).pop();
    currentBeat = beat ? beat.n : 0;
    if (beat) setBeatBanner(beat.n);

    if (wasPlaying) play();
  }

  function seekToBeat(n) {
    const beat = BEATS.find((b) => b.n === n);
    if (beat) seek(beat.t);
  }

  function reset() {
    seek(0);
    el('beat-banner').innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = 'Ready.';
    const span = document.createElement('span');
    span.textContent = 'Press Play. Open the Command Feed in a second tab to see what the Orb makes of this.';
    el('beat-banner').append(strong, span);
    for (const button of beatJump.children) button.classList.remove('active');
  }

  // ---- wiring ------------------------------------------------------------

  el('btn-play').addEventListener('click', () => (player.playing ? pause() : play()));
  el('btn-reset').addEventListener('click', reset);

  for (const button of document.querySelectorAll('.speed-btn')) {
    button.addEventListener('click', () => {
      player.speed = Number(button.dataset.speed);
      for (const other of document.querySelectorAll('.speed-btn')) {
        other.classList.toggle('active', other === button);
      }
    });
  }
  document.querySelector('.speed-btn[data-speed="1"]').classList.add('active');

  document.addEventListener('keydown', (event) => {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
    if (event.code === 'Space') { event.preventDefault(); player.playing ? pause() : play(); }
    else if (event.key === 'r' || event.key === 'R') reset();
  });

  // A Command Feed opened after this tab, or reloaded mid-run, asks for
  // everything it missed. Without this the presenter could not safely refresh
  // the second tab during a demo.
  channel.addEventListener('message', (message) => {
    if (message.data && message.data.type === MSG.HELLO) {
      const history = events.slice(0, player.cursor);
      channel.postMessage({ type: MSG.RESET });
      channel.postMessage({ type: MSG.SYNC, events: history, t: player.clock });
      broadcastClock();
      el('link-tag').textContent = 'Command Feed: connected';
      el('link-tag').classList.add('ok');
    }
  });

  broadcastClock();
})();
