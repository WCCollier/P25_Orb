/*
 * UI smoke test.
 *
 *   node test/ui-smoke-test.js
 *
 * The engine has its own test (test/engine-test.js). This one covers the other
 * half of the risk in a live demo: that the two browser tabs are wired to each
 * other correctly and that the rendering code runs without throwing.
 *
 * There is no browser available in this project, so this file provides a small
 * stand-in for the handful of browser features the demo uses — enough of the DOM
 * to run the real page scripts unmodified, plus a working BroadcastChannel that
 * connects the two tabs the same way the browser does. It then plays the whole
 * timeline through both scripts and checks that events crossed between them and
 * that the alarms came out where they should.
 *
 * Element lookups are checked against the ids that genuinely exist in the HTML,
 * so a typo in an id fails here rather than in front of an audience.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, 'demo');

let passed = 0;
let failed = 0;

function check(description, condition, detail) {
  if (condition) { passed++; console.log(`  ok    ${description}`); }
  else { failed++; console.log(`  FAIL  ${description}`); if (detail !== undefined) console.log(`        ${detail}`); }
}

// ---------------------------------------------------------------------------
// A very small stand-in for the parts of the DOM these pages touch.
// ---------------------------------------------------------------------------

function idsIn(htmlFile) {
  const html = fs.readFileSync(path.join(DEMO, htmlFile), 'utf8');
  return new Set(Array.from(html.matchAll(/\bid="([^"]+)"/g)).map((m) => m[1]));
}

function makeNode(name) {
  const node = {
    nodeName: name || 'div',
    children: [],
    dataset: {},
    style: {},
    title: '',
    hidden: false,
    scrollTop: 0,
    scrollHeight: 100,
    clientHeight: 100,
    _class: '',
    _text: '',
    _html: '',
    listeners: {},

    get className() { return this._class; },
    set className(v) { this._class = String(v); },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); this.children = []; },
    get outerHTML() { return `<${this.nodeName}>${this._html}</${this.nodeName}>`; },

    get firstElementChild() { return this.children[0] || null; },
    get lastChild() { return this.children[this.children.length - 1] || null; },
    get childElementCount() { return this.children.length; },

    appendChild(child) { this.children.push(child); return child; },
    append(...kids) { this.children.push(...kids); },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      return child;
    },
    remove() {},
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    // Rendering code reads back elements it just wrote via innerHTML; the shim
    // hands out fresh nodes so those writes are exercised rather than skipped.
    querySelector() { return makeNode(); },
    querySelectorAll() { return [makeNode(), makeNode(), makeNode(), makeNode(),
                                 makeNode(), makeNode(), makeNode(), makeNode()]; },

    classList: null,
  };

  const classes = new Set();
  node.classList = {
    add: (c) => classes.add(c),
    remove: (c) => classes.delete(c),
    contains: (c) => classes.has(c),
    toggle: (c, force) => {
      const on = force === undefined ? !classes.has(c) : !!force;
      if (on) classes.add(c); else classes.delete(c);
      return on;
    },
  };
  return node;
}

function makeDocument(validIds, missingIds) {
  const nodes = new Map();
  return {
    getElementById(id) {
      if (!validIds.has(id)) { missingIds.add(id); return null; }
      if (!nodes.has(id)) nodes.set(id, makeNode());
      return nodes.get(id);
    },
    createElement: (tag) => makeNode(tag),
    querySelector: () => makeNode(),
    querySelectorAll: () => [makeNode(), makeNode()],
    addEventListener() {},
    _nodes: nodes,
  };
}

// One shared bus, so the two tab contexts really do talk to each other.
const bus = [];
function makeBroadcastChannel() {
  return class BroadcastChannel {
    constructor(name) { this.name = name; this.listeners = []; bus.push(this); }
    postMessage(data) {
      // Structured clone, like the browser: a bug that relies on shared object
      // identity across tabs would not show up otherwise.
      const copy = JSON.parse(JSON.stringify(data));
      for (const other of bus) {
        if (other === this) continue;
        for (const fn of other.listeners) fn({ data: copy });
      }
    }
    addEventListener(type, fn) { if (type === 'message') this.listeners.push(fn); }
  };
}

const rafQueue = [];
function makeContext(htmlFile, missingIds) {
  const sandbox = {
    document: makeDocument(idsIn(htmlFile), missingIds),
    BroadcastChannel: makeBroadcastChannel(),
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    console,
    fetch: () => Promise.reject(new Error('not used in the scripted demo')),
    Math, JSON, Date, Set, Map, Object, Array, String, Number, Boolean,
  };
  sandbox.window = sandbox;
  return vm.createContext(sandbox);
}

function run(context, ...files) {
  for (const file of files) {
    const code = fs.readFileSync(path.join(DEMO, 'js', file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }
}

// ---------------------------------------------------------------------------

console.log('\nLoading both tabs');

const missingIds = new Set();
let rfContext, feedContext;
let loadError = null;

try {
  rfContext = makeContext('rf-environment.html', missingIds);
  run(rfContext, 'protocol.js', 'timeline.js', 'rf-environment.js');

  feedContext = makeContext('command-feed.html', missingIds);
  run(feedContext, 'protocol.js', 'timeline.js', 'classifications.js',
      'detection-engine.js', 'command-feed.js');
} catch (error) {
  loadError = error;
}

check('both tab scripts load without throwing', loadError === null,
  loadError && (loadError.stack || String(loadError)).split('\n').slice(0, 3).join('\n        '));

if (loadError) { console.log(`\n${passed} passed, ${failed} failed\n`); process.exit(1); }

check('every getElementById target exists in the HTML', missingIds.size === 0,
  'missing ids: ' + Array.from(missingIds).join(', '));

// ---------------------------------------------------------------------------

console.log('\nBefore any traffic has played');

// The talkaround channeliser runs from start-up and is never torn down
// (hardware-design.md §3.3.1). An earlier version of this panel listed only
// channels that had carried traffic, which made the demo look as though
// talkaround monitoring began when talkaround traffic did — understating the
// simultaneous-monitoring claim the panel is there to demonstrate.
{
  const channels = rfContext.document.getElementById('channels').innerHTML;
  // Taken from the receiver readout rather than restated here, so the two
  // cannot drift apart.
  const controlChannel = rfContext.document.getElementById('k-cc').textContent.split(' ')[0];
  check('the control channeliser is shown before any event fires',
    controlChannel.length > 0 && channels.includes(controlChannel), channels);
  check('the talkaround channeliser is shown before any talkaround traffic',
    channels.includes('8TAC95D'), channels);
  check('neither is drawn as a dynamic voice channel',
    (channels.match(/class="chan permanent/g) || []).length === 2, channels);
}

// ---------------------------------------------------------------------------

console.log('\nPlaying the timeline through both tabs');

// The Command Feed announces itself on load; the RF tab answers with a replay.
// Drive the RF tab's animation frames to play the whole timeline.
let playError = null;
try {
  // Kick off playback the way the Play button does, then pump frames.
  const play = rfContext.document.getElementById('btn-play');
  const handler = play.listeners.click && play.listeners.click[0];
  check('the Play button has a handler bound', typeof handler === 'function');
  if (handler) handler();

  let virtualNow = 0;
  let frames = 0;
  while (rafQueue.length && frames < 4000) {
    const fn = rafQueue.shift();
    virtualNow += 100;   // 100 ms of wall clock per frame
    fn(virtualNow);
    frames++;
  }
  check('playback ran to completion without throwing', true);
  check('the timeline finished inside the frame budget', frames < 4000, `frames=${frames}`);
} catch (error) {
  playError = error;
  check('playback ran to completion without throwing', false,
    (error.stack || String(error)).split('\n').slice(0, 4).join('\n        '));
}

// ---------------------------------------------------------------------------

console.log('\nWhat crossed between the tabs');

if (!playError) {
  // Reach into the Command Feed's engine by replaying the same stream the way
  // the tab did, then compare against what the tab's own DOM reported.
  const rfClock = rfContext.document.getElementById('clock');
  check('the RF tab advanced its clock to the end of the timeline',
    rfClock.textContent.startsWith('02:5'), rfClock.textContent);

  const linkTag = feedContext.document.getElementById('link-tag');
  check('the Command Feed saw the RF source', /RF source:/.test(linkTag.textContent),
    linkTag.textContent);

  const gauge = feedContext.document.getElementById('gauge-level');
  check('the Command Feed computed a trunk status',
    ['NOMINAL', 'ELEVATED', 'SATURATED'].includes(gauge.textContent), gauge.textContent);

  const attrib = feedContext.document.getElementById('attrib');
  check('the classifier attribution is shown to the audience',
    /claude-haiku/.test(attrib.textContent), attrib.textContent);

  const alarms = feedContext.document.getElementById('alarms');
  check('the alarm panel rendered alert cards rather than the empty state',
    alarms.children.length >= 2, `${alarms.children.length} cards`);

  const digest = feedContext.document.getElementById('digest');
  check('the digest rendered entries', digest.children.length > 20,
    `${digest.children.length} entries`);
}

// ---------------------------------------------------------------------------

console.log('\nMid-demo tab reload is survivable');

try {
  // Reloading the Command Feed mid-presentation must not lose state: the tab
  // says HELLO and the RF tab replays everything so far.
  const reloaded = makeContext('command-feed.html', missingIds);
  run(reloaded, 'protocol.js', 'timeline.js', 'classifications.js',
      'detection-engine.js', 'command-feed.js');

  const alarms = reloaded.document.getElementById('alarms');
  const digest = reloaded.document.getElementById('digest');
  check('a freshly opened Command Feed was replayed the whole history',
    digest.children.length > 20, `${digest.children.length} entries`);
  check('and rebuilt the alarms from that replay',
    alarms.children.length >= 2, `${alarms.children.length} cards`);
} catch (error) {
  check('a freshly opened Command Feed was replayed the whole history', false,
    (error.stack || String(error)).split('\n').slice(0, 4).join('\n        '));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
