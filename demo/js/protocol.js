/*
 * The contract between the two tabs.
 *
 * Tab 1 (RF Environment) is the source of truth. It owns the clock and pushes
 * events to Tab 2 (Command Feed) over the browser's BroadcastChannel API as
 * they happen. Tab 2 has no timeline of its own — if Tab 1 is paused, Tab 2
 * receives nothing. That is the point: the Command Feed is genuinely reacting
 * to the radio environment rather than replaying a second copy of the script on
 * its own timer.
 *
 * BroadcastChannel is a plain browser feature. Nothing here needs a server, a
 * socket, or a shared backend, which is what keeps the demo to "open two tabs".
 */

const ORB_CHANNEL = 'p25-orb-demo';

const MSG = {
  // RF Environment -> Command Feed
  EVENT: 'EVENT',     // one radio event, exactly as observed
  CLOCK: 'CLOCK',     // current timeline position, play state and speed
  RESET: 'RESET',     // wipe and start over
  SYNC: 'SYNC',       // full history replay, for a tab that joined late
  END: 'END',         // timeline finished

  // Command Feed -> RF Environment
  HELLO: 'HELLO',     // "I just opened, send me what I missed"
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ORB_CHANNEL, MSG };
}
