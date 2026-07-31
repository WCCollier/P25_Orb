/*
 * P25 Orb — scripted RF event timeline (ground truth for the demo).
 *
 * This file is the SIMULATED part of the proof of concept, and it is simulated
 * only because no P25 receiver hardware exists for this demo — not because of
 * any limitation in what a real P25 Orb could observe. Every field here is
 * something a scanner-style control-channel receiver genuinely sees on an
 * unencrypted P25 trunk: the call-setup signalling (request / grant / queue /
 * deny / busy), the emergency declaration, and the audio of transmissions that
 * actually got a channel.
 *
 * Nothing in this file contains interpretation. There are no alert levels, no
 * priorities, no confidence scores. Those are produced downstream by the AI
 * classifier and the detection engine. Tab 1 replays this file verbatim; Tab 2
 * has to work out what it means.
 *
 * Timings are milliseconds from timeline start, at 1x speed.
 */

// Illustrative frequencies for an 800 MHz P25 Phase II trunked system. The
// control channel and voice channel values are representative of the band, not
// read from LCRA's published system record. 8TAC95D is the one real, specific
// value: 851.5500 MHz is the Texas Statewide Interoperability Channel Plan's
// designated 800 MHz direct/talkaround channel.
const RF_CONFIG = {
  systemName: 'LCRA REGIONAL (P25 Phase II)',
  wacn: 'BEE00',
  systemId: '4E2',
  nac: '2A7',
  siteId: 'RFSS 1 / SITE 4',
  controlChannel: '851.2125',
  fallbackChannel: { name: '8TAC95D', freq: '851.5500', mode: 'Analog FM, direct/talkaround' },
};

// Unit IDs use the 8M range that the Texas Statewide Coordinated P25 Radio Unit
// ID allocation table assigns to LCRA participants. Agency labels are what a
// commander thinks in; the trunk only ever sends the number.
const UNITS = {
  '8M-0100': { label: 'DISPATCH',    agency: 'LCRA Regional Dispatch' },
  '8M-1104': { label: 'DPS 1104',    agency: 'Texas DPS' },
  '8M-1187': { label: 'DPS 1187',    agency: 'Texas DPS' },
  '8M-2210': { label: 'DPS 2210',    agency: 'Texas DPS (Sergeant)' },
  '8M-4471': { label: 'DPS 4471',    agency: 'Texas DPS' },
  '8M-3052': { label: 'SO 3052',     agency: 'County Sheriff' },
  '8M-3077': { label: 'SO 3077',     agency: 'County Sheriff' },
  '8M-5010': { label: 'MEDIC 5010',  agency: 'County EMS' },
  '8M-6001': { label: 'CAMPUS 6001', agency: 'School District PD' },
  '8M-7702': { label: 'AIR 7702',    agency: 'Texas DPS (UAS)' },
  '8M-8830': { label: 'MA 8830',     agency: 'Out-of-area mutual aid' },
};

const TALKGROUPS = {
  5301: 'REG1 TAC1',
  5302: 'REG1 TAC2',
  5310: 'REG1 DISPATCH',
};

// The seven demo beats from the design document. Tab 1 uses these both to label
// what is on screen and to let the presenter jump between sections in rehearsal.
const BEATS = [
  { n: 1, t: 0,      title: 'Calm baseline',        note: 'Routine traffic, every request granted.' },
  { n: 2, t: 22000,  title: 'Congestion builds',    note: 'Calls start queuing. First busy signal.' },
  { n: 3, t: 48000,  title: 'Blocked-attempt burst',note: 'Multiple units blocked at once.' },
  { n: 4, t: 72000,  title: 'Transmission cuts off',note: 'A partial transmission from DPS 4471.' },
  { n: 5, t: 88000,  title: 'Status check unanswered', note: 'Dispatch calls 4471. Nothing comes back.' },
  { n: 6, t: 120000, title: 'Emergency declared',   note: 'DPS 2210 hits the emergency button.' },
  { n: 7, t: 148000, title: 'Resolution',           note: 'The picture resolves on the Command Feed.' },
];

/*
 * Event types, all of which map to something real on a P25 control channel:
 *
 *   CHANNEL_REQUEST  a radio keyed up and asked the trunk for a voice channel
 *   GRANT            the trunk assigned a traffic channel (the "grant tone")
 *   QUEUED           "Call Queued" — no channel free, request is waiting
 *   SYSTEM_BUSY      "System Busy" — no channel available, the call is dropped
 *   DENIED           "PTT Denied" — the radio is not authorized on this talkgroup
 *   TX_EMERGENCY     emergency declaration; trunk-wide on the control channel
 *   VOICE            audio from a transmission that received a grant
 *   FALLBACK_VOICE   audio heard on the analog talkaround channel, 8TAC95D
 *
 * QUEUED, SYSTEM_BUSY and DENIED are the events that matter most to this whole
 * product: the officer got no channel, so no voice RF was ever transmitted.
 * There is no audio to relay for these. The fact of the attempt is the only
 * thing that exists, and today nobody sees it.
 *
 * One simplification to be honest about: FALLBACK_VOICE events carry a unit ID
 * in the same 8M- format as trunk traffic. Analog talkaround carries no unit ID
 * of its own — attributing one requires the fleet to send an ANI burst at PTT,
 * which is an agency configuration question, and ANI numbering is a different
 * ID space from P25 unit IDs anyway. See docs/software-prd.md §1.1 on identity.
 */
const TIMELINE = [
  // ---- Beat 1: calm baseline -------------------------------------------
  { id: 'e001', t: 1000,  beat: 1, type: 'CHANNEL_REQUEST', unit: '8M-1104', tg: 5301 },
  { id: 'e002', t: 1600,  beat: 1, type: 'GRANT', unit: '8M-1104', tg: 5301, channel: '851.7375' },
  { id: 'e003', t: 2200,  beat: 1, type: 'VOICE', unit: '8M-1104', tg: 5301, channel: '851.7375',
    transcript: "Dispatch, 1104, I'm 10-97 at the north lot, staging with the second unit." },

  { id: 'e004', t: 8000,  beat: 1, type: 'CHANNEL_REQUEST', unit: '8M-0100', tg: 5301 },
  { id: 'e005', t: 8500,  beat: 1, type: 'GRANT', unit: '8M-0100', tg: 5301, channel: '851.7375' },
  { id: 'e006', t: 9100,  beat: 1, type: 'VOICE', unit: '8M-0100', tg: 5301, channel: '851.7375',
    transcript: "1104, dispatch, copy 10-97 north lot. Command post is the athletic entrance, east side." },

  { id: 'e007', t: 14000, beat: 1, type: 'CHANNEL_REQUEST', unit: '8M-3052', tg: 5301 },
  { id: 'e008', t: 14600, beat: 1, type: 'GRANT', unit: '8M-3052', tg: 5301, channel: '851.7375' },
  { id: 'e009', t: 15200, beat: 1, type: 'VOICE', unit: '8M-3052', tg: 5301, channel: '851.7375',
    transcript: "Dispatch, 3052, two more county units inbound from the west, ETA four minutes." },

  { id: 'e010', t: 19500, beat: 1, type: 'CHANNEL_REQUEST', unit: '8M-7702', tg: 5302 },
  { id: 'e011', t: 20100, beat: 1, type: 'GRANT', unit: '8M-7702', tg: 5302, channel: '852.4125' },
  { id: 'e012', t: 20700, beat: 1, type: 'VOICE', unit: '8M-7702', tg: 5302, channel: '852.4125',
    transcript: "Air unit is up, we have the exterior on camera, no movement on the south side." },

  // ---- Beat 2: congestion builds ---------------------------------------
  { id: 'e013', t: 23000, beat: 2, type: 'CHANNEL_REQUEST', unit: '8M-1187', tg: 5301 },
  { id: 'e014', t: 23600, beat: 2, type: 'QUEUED', unit: '8M-1187', tg: 5301, queuePosition: 1 },
  { id: 'e015', t: 25400, beat: 2, type: 'GRANT', unit: '8M-1187', tg: 5301, channel: '853.1625' },
  { id: 'e016', t: 26000, beat: 2, type: 'VOICE', unit: '8M-1187', tg: 5301, channel: '853.1625',
    transcript: "1187 to dispatch, we need crowd control on the parent side, they're coming over the fence." },

  { id: 'e017', t: 29000, beat: 2, type: 'CHANNEL_REQUEST', unit: '8M-5010', tg: 5301 },
  { id: 'e018', t: 29600, beat: 2, type: 'QUEUED', unit: '8M-5010', tg: 5301, queuePosition: 2 },
  { id: 'e019', t: 32000, beat: 2, type: 'GRANT', unit: '8M-5010', tg: 5301, channel: '851.7375' },
  { id: 'e020', t: 32600, beat: 2, type: 'VOICE', unit: '8M-5010', tg: 5301, channel: '851.7375',
    transcript: "Medic 5010, we have three walking wounded at the triage point, requesting a second bus." },

  { id: 'e021', t: 36000, beat: 2, type: 'CHANNEL_REQUEST', unit: '8M-3077', tg: 5301 },
  { id: 'e022', t: 36600, beat: 2, type: 'QUEUED', unit: '8M-3077', tg: 5301, queuePosition: 3 },
  { id: 'e023', t: 39800, beat: 2, type: 'SYSTEM_BUSY', unit: '8M-3077', tg: 5301 },

  { id: 'e024', t: 41000, beat: 2, type: 'CHANNEL_REQUEST', unit: '8M-6001', tg: 5301 },
  { id: 'e025', t: 41600, beat: 2, type: 'QUEUED', unit: '8M-6001', tg: 5301, queuePosition: 2 },
  { id: 'e026', t: 43500, beat: 2, type: 'GRANT', unit: '8M-6001', tg: 5301, channel: '853.1625' },
  { id: 'e027', t: 44100, beat: 2, type: 'VOICE', unit: '8M-6001', tg: 5301, channel: '853.1625',
    transcript: "Campus PD, we've got the west corridor cleared, moving to the gym." },

  { id: 'e028', t: 46000, beat: 2, type: 'CHANNEL_REQUEST', unit: '8M-1104', tg: 5301 },
  { id: 'e029', t: 46600, beat: 2, type: 'QUEUED', unit: '8M-1104', tg: 5301, queuePosition: 3 },

  // ---- Beat 3: blocked-attempt burst -----------------------------------
  { id: 'e030', t: 48500, beat: 3, type: 'SYSTEM_BUSY', unit: '8M-1104', tg: 5301 },
  { id: 'e031', t: 49500, beat: 3, type: 'CHANNEL_REQUEST', unit: '8M-3052', tg: 5301 },
  { id: 'e032', t: 50000, beat: 3, type: 'SYSTEM_BUSY', unit: '8M-3052', tg: 5301 },
  { id: 'e033', t: 50800, beat: 3, type: 'CHANNEL_REQUEST', unit: '8M-1187', tg: 5301 },
  { id: 'e034', t: 51300, beat: 3, type: 'SYSTEM_BUSY', unit: '8M-1187', tg: 5301 },
  { id: 'e035', t: 52200, beat: 3, type: 'CHANNEL_REQUEST', unit: '8M-4471', tg: 5301 },
  { id: 'e036', t: 52700, beat: 3, type: 'SYSTEM_BUSY', unit: '8M-4471', tg: 5301 },
  { id: 'e037', t: 53600, beat: 3, type: 'CHANNEL_REQUEST', unit: '8M-5010', tg: 5301 },
  { id: 'e038', t: 54100, beat: 3, type: 'QUEUED', unit: '8M-5010', tg: 5301, queuePosition: 5 },
  { id: 'e039', t: 55000, beat: 3, type: 'CHANNEL_REQUEST', unit: '8M-3077', tg: 5301 },
  { id: 'e040', t: 55500, beat: 3, type: 'SYSTEM_BUSY', unit: '8M-3077', tg: 5301 },
  { id: 'e041', t: 56500, beat: 3, type: 'CHANNEL_REQUEST', unit: '8M-4471', tg: 5301 },
  { id: 'e042', t: 57000, beat: 3, type: 'SYSTEM_BUSY', unit: '8M-4471', tg: 5301 },
  { id: 'e043', t: 58500, beat: 3, type: 'SYSTEM_BUSY', unit: '8M-5010', tg: 5301 },

  { id: 'e044', t: 60000, beat: 3, type: 'CHANNEL_REQUEST', unit: '8M-0100', tg: 5301 },
  { id: 'e045', t: 60600, beat: 3, type: 'GRANT', unit: '8M-0100', tg: 5301, channel: '851.7375' },
  { id: 'e046', t: 61200, beat: 3, type: 'VOICE', unit: '8M-0100', tg: 5301, channel: '851.7375',
    transcript: "All units, all units, hold your traffic unless it's emergency. The system is saturated." },

  // An out-of-area mutual aid unit is not affiliated with this talkgroup, so the
  // trunk denies it outright rather than queueing it. It reaches the scene the
  // only way left: the analog talkaround channel, which the Orb also monitors.
  { id: 'e047', t: 65000, beat: 3, type: 'CHANNEL_REQUEST', unit: '8M-8830', tg: 5301 },
  { id: 'e048', t: 65500, beat: 3, type: 'DENIED', unit: '8M-8830', tg: 5301 },
  { id: 'e049', t: 67500, beat: 3, type: 'FALLBACK_VOICE', unit: '8M-8830', channel: '851.5500',
    transcript: "Any unit on tac, this is 8830, mutual aid from out of the area. I can't get on your system. Where do you need me?" },

  { id: 'e050', t: 71000, beat: 3, type: 'CHANNEL_REQUEST', unit: '8M-3052', tg: 5301 },
  { id: 'e051', t: 71500, beat: 3, type: 'SYSTEM_BUSY', unit: '8M-3052', tg: 5301 },

  // ---- Beat 4: the transmission that cuts off --------------------------
  { id: 'e052', t: 73500, beat: 4, type: 'CHANNEL_REQUEST', unit: '8M-4471', tg: 5301 },
  { id: 'e053', t: 74200, beat: 4, type: 'GRANT', unit: '8M-4471', tg: 5301, channel: '851.7375' },
  // truncated:true means the carrier dropped mid-word. Per the design document
  // this is treated as HIGHER concern, not lower.
  { id: 'e054', t: 74800, beat: 4, type: 'VOICE', unit: '8M-4471', tg: 5301, channel: '851.7375',
    truncated: true, transcript: "Shots f—" },

  { id: 'e055', t: 78000, beat: 4, type: 'CHANNEL_REQUEST', unit: '8M-4471', tg: 5301 },
  { id: 'e056', t: 78600, beat: 4, type: 'SYSTEM_BUSY', unit: '8M-4471', tg: 5301 },
  { id: 'e057', t: 81000, beat: 4, type: 'CHANNEL_REQUEST', unit: '8M-1104', tg: 5301 },
  { id: 'e058', t: 81600, beat: 4, type: 'QUEUED', unit: '8M-1104', tg: 5301, queuePosition: 4 },
  { id: 'e059', t: 83000, beat: 4, type: 'SYSTEM_BUSY', unit: '8M-1104', tg: 5301 },

  { id: 'e060', t: 85000, beat: 4, type: 'CHANNEL_REQUEST', unit: '8M-3077', tg: 5301 },
  { id: 'e061', t: 85600, beat: 4, type: 'GRANT', unit: '8M-3077', tg: 5301, channel: '853.1625' },
  { id: 'e062', t: 86200, beat: 4, type: 'VOICE', unit: '8M-3077', tg: 5301, channel: '853.1625',
    transcript: "3077, did somebody just key up? I caught the front of it and it dropped." },

  // ---- Beat 5: the status check nobody answers -------------------------
  { id: 'e063', t: 90000, beat: 5, type: 'CHANNEL_REQUEST', unit: '8M-0100', tg: 5301 },
  { id: 'e064', t: 90600, beat: 5, type: 'GRANT', unit: '8M-0100', tg: 5301, channel: '851.7375' },
  { id: 'e065', t: 91200, beat: 5, type: 'VOICE', unit: '8M-0100', tg: 5301, channel: '851.7375',
    transcript: "4471, dispatch. 4471, radio check, do you copy?" },

  { id: 'e066', t: 96000, beat: 5, type: 'CHANNEL_REQUEST', unit: '8M-6001', tg: 5301 },
  { id: 'e067', t: 96600, beat: 5, type: 'QUEUED', unit: '8M-6001', tg: 5301, queuePosition: 2 },
  { id: 'e068', t: 98500, beat: 5, type: 'GRANT', unit: '8M-6001', tg: 5301, channel: '853.1625' },
  { id: 'e069', t: 99100, beat: 5, type: 'VOICE', unit: '8M-6001', tg: 5301, channel: '853.1625',
    transcript: "Campus PD to command, we're at the gym doors, nothing here." },

  { id: 'e070', t: 103000, beat: 5, type: 'CHANNEL_REQUEST', unit: '8M-0100', tg: 5301 },
  { id: 'e071', t: 103600, beat: 5, type: 'GRANT', unit: '8M-0100', tg: 5301, channel: '851.7375' },
  { id: 'e072', t: 104200, beat: 5, type: 'VOICE', unit: '8M-0100', tg: 5301, channel: '851.7375',
    transcript: "4471, dispatch, second call. Any unit with eyes on 4471?" },

  { id: 'e073', t: 109000, beat: 5, type: 'CHANNEL_REQUEST', unit: '8M-3052', tg: 5301 },
  { id: 'e074', t: 109600, beat: 5, type: 'SYSTEM_BUSY', unit: '8M-3052', tg: 5301 },
  { id: 'e075', t: 112000, beat: 5, type: 'FALLBACK_VOICE', unit: '8M-3052', channel: '851.5500',
    transcript: "Command, 3052 on talkaround. We're moving toward 4471's last known, the two hundred hallway." },

  { id: 'e076', t: 116000, beat: 5, type: 'CHANNEL_REQUEST', unit: '8M-5010', tg: 5301 },
  { id: 'e077', t: 116600, beat: 5, type: 'QUEUED', unit: '8M-5010', tg: 5301, queuePosition: 3 },
  { id: 'e078', t: 118000, beat: 5, type: 'SYSTEM_BUSY', unit: '8M-5010', tg: 5301 },

  // ---- Beat 6: emergency declared --------------------------------------
  // TX_EMERGENCY is control-channel signalling. It is trunk-wide and visible to
  // every radio and to any passive monitor, regardless of which channel the
  // response ends up on. This is the most reliable single signal on the system.
  { id: 'e079', t: 121000, beat: 6, type: 'TX_EMERGENCY', unit: '8M-2210', tg: 5301 },
  { id: 'e080', t: 122000, beat: 6, type: 'CHANNEL_REQUEST', unit: '8M-2210', tg: 5301, emergency: true },
  { id: 'e081', t: 122400, beat: 6, type: 'GRANT', unit: '8M-2210', tg: 5301, channel: '851.7375', emergency: true },
  { id: 'e082', t: 123000, beat: 6, type: 'VOICE', unit: '8M-2210', tg: 5301, channel: '851.7375', emergency: true,
    transcript: "Officer down! Officer down, two hundred hallway, I need medics now!" },

  { id: 'e083', t: 128000, beat: 6, type: 'CHANNEL_REQUEST', unit: '8M-5010', tg: 5301 },
  { id: 'e084', t: 128600, beat: 6, type: 'GRANT', unit: '8M-5010', tg: 5301, channel: '853.1625' },
  { id: 'e085', t: 129200, beat: 6, type: 'VOICE', unit: '8M-5010', tg: 5301, channel: '853.1625',
    transcript: "Medic 5010 copies, we're coming to you. Which entrance?" },

  { id: 'e086', t: 133000, beat: 6, type: 'CHANNEL_REQUEST', unit: '8M-0100', tg: 5301 },
  { id: 'e087', t: 133600, beat: 6, type: 'GRANT', unit: '8M-0100', tg: 5301, channel: '851.7375' },
  { id: 'e088', t: 134200, beat: 6, type: 'VOICE', unit: '8M-0100', tg: 5301, channel: '851.7375',
    transcript: "All units, emergency traffic only. Medics to the two hundred hallway, east stairwell." },

  { id: 'e089', t: 138000, beat: 6, type: 'CHANNEL_REQUEST', unit: '8M-1104', tg: 5301 },
  { id: 'e090', t: 138600, beat: 6, type: 'SYSTEM_BUSY', unit: '8M-1104', tg: 5301 },
  // A third party reports on 4471's condition. The engine attaches this to the
  // open alert as related traffic but does NOT clear it: a report about a unit
  // is not the same as hearing from that unit.
  { id: 'e091', t: 140000, beat: 6, type: 'FALLBACK_VOICE', unit: '8M-1104', channel: '851.5500',
    transcript: "1104 on talkaround. I'm with 4471, he's up, he's hit in the vest, he's talking." },

  // ---- Beat 7: resolution ----------------------------------------------
  { id: 'e092', t: 144000, beat: 7, type: 'CHANNEL_REQUEST', unit: '8M-4471', tg: 5301 },
  { id: 'e093', t: 144600, beat: 7, type: 'QUEUED', unit: '8M-4471', tg: 5301, queuePosition: 1 },
  { id: 'e094', t: 146500, beat: 7, type: 'GRANT', unit: '8M-4471', tg: 5301, channel: '851.7375' },
  { id: 'e095', t: 147100, beat: 7, type: 'VOICE', unit: '8M-4471', tg: 5301, channel: '851.7375',
    transcript: "4471, I'm okay, I'm okay. I took one in the plate. 2210 is the one that's down, he's behind me in the two hundred hallway." },

  { id: 'e096', t: 152000, beat: 7, type: 'CHANNEL_REQUEST', unit: '8M-0100', tg: 5301 },
  { id: 'e097', t: 152600, beat: 7, type: 'GRANT', unit: '8M-0100', tg: 5301, channel: '851.7375' },
  { id: 'e098', t: 153200, beat: 7, type: 'VOICE', unit: '8M-0100', tg: 5301, channel: '851.7375',
    transcript: "Copy 4471. Medics are en route to 2210, two hundred hallway." },

  { id: 'e099', t: 158000, beat: 7, type: 'FALLBACK_VOICE', unit: '8M-6001', channel: '851.5500',
    transcript: "Campus PD on talkaround, we have the two hundred hallway secured, medics coming through now." },

  { id: 'e100', t: 163000, beat: 7, type: 'CHANNEL_REQUEST', unit: '8M-5010', tg: 5301 },
  { id: 'e101', t: 163600, beat: 7, type: 'GRANT', unit: '8M-5010', tg: 5301, channel: '853.1625' },
  { id: 'e102', t: 164200, beat: 7, type: 'VOICE', unit: '8M-5010', tg: 5301, channel: '853.1625',
    transcript: "5010, we have contact with 2210, we're working him now." },
];

const TIMELINE_DURATION = 172000;

// Loaded as plain scripts in the browser; also require()-able by the Node test.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RF_CONFIG, UNITS, TALKGROUPS, BEATS, TIMELINE, TIMELINE_DURATION };
}
