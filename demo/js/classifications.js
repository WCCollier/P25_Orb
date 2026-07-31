/*
 * P25 Orb — cached AI classifications for the scripted demo timeline.
 *
 * GENERATED FILE. Do not edit by hand.
 * Produced by tools/generate_classifications.py on 2026-07-26T03:37:49Z
 * by calling claude-haiku-4-5 on each transmission in demo/js/timeline.js.
 *
 * These are real model outputs, cached so that the live presentation has
 * no network dependency in its critical path. The raw API responses that
 * produced them are kept in tools/classification-log.json.
 *
 * The 'try it live' page calls the same model with the same prompt, so
 * you can demonstrate the classifier working on a phrase typed on the
 * spot without putting the scripted demo at the mercy of the network.
 */

const CLASSIFICATION_MODEL = "claude-haiku-4-5";
const CLASSIFICATION_GENERATED_AT = "2026-07-26T03:37:49Z";

const CLASSIFICATIONS = {
  "e003": {
    "priority": "ROUTINE",
    "category": "TACTICAL_MOVEMENT",
    "distress": false,
    "keywords": [
      "10-97",
      "staging"
    ],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "8M-1104 arrived at north lot, staging with second unit."
  },
  "e006": {
    "priority": "ROUTINE",
    "category": "ACKNOWLEDGEMENT",
    "distress": false,
    "keywords": [],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "Unit 1104 acknowledges arrival at north lot. Command post established at athletic entrance, east side."
  },
  "e009": {
    "priority": "ROUTINE",
    "category": "TACTICAL_MOVEMENT",
    "distress": false,
    "keywords": [
      "county units inbound",
      "ETA four minutes"
    ],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "Two additional county units en route from west, four minutes out."
  },
  "e012": {
    "priority": "ROUTINE",
    "category": "TACTICAL_MOVEMENT",
    "distress": false,
    "keywords": [
      "exterior on camera",
      "no movement on the south side"
    ],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "Air unit reports camera coverage of exterior with no movement observed on south side."
  },
  "e016": {
    "priority": "URGENT",
    "category": "CROWD_CONTROL",
    "distress": false,
    "keywords": [
      "crowd control",
      "coming over the fence"
    ],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "Unit requests crowd control at parent side; people breaching fence perimeter."
  },
  "e020": {
    "priority": "URGENT",
    "category": "MEDICAL",
    "distress": false,
    "keywords": [
      "three walking wounded",
      "triage point",
      "requesting a second bus"
    ],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "Three walking wounded at triage point; requesting additional ambulance."
  },
  "e027": {
    "priority": "ROUTINE",
    "category": "TACTICAL_MOVEMENT",
    "distress": false,
    "keywords": [
      "west corridor cleared",
      "moving to the gym"
    ],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "West corridor cleared, moving to gym."
  },
  "e046": {
    "priority": "URGENT",
    "category": "SYSTEM_ADVISORY",
    "distress": false,
    "keywords": [
      "hold your traffic unless it's emergency",
      "system is saturated"
    ],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "System saturated\u2014all units hold non-emergency traffic."
  },
  "e049": {
    "priority": "ROUTINE",
    "category": "SYSTEM_ADVISORY",
    "distress": false,
    "keywords": [
      "mutual aid from out of the area",
      "can't get on your system"
    ],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "8M-8830 mutual aid unit unable to access system, requesting assignment."
  },
  "e054": {
    "priority": "EMERGENCY",
    "category": "SHOTS_FIRED",
    "distress": true,
    "keywords": [
      "Shots f\u2014"
    ],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "Unit was beginning to report 'Shots fired' but transmission was cut off mid-word.",
    "digest": "Unit 8M-4471 reporting shots fired \u2014 transmission cut off incomplete."
  },
  "e062": {
    "priority": "ROUTINE",
    "category": "ACKNOWLEDGEMENT",
    "distress": false,
    "keywords": [],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "Unit 3077 asking if anyone just transmitted; reports missed a transmission."
  },
  "e065": {
    "priority": "ROUTINE",
    "category": "STATUS_CHECK",
    "distress": false,
    "keywords": [
      "radio check",
      "do you copy"
    ],
    "is_status_check": true,
    "subject_unit": "4471",
    "cut_off_meaning": "",
    "digest": "Dispatch conducting radio check on unit 4471."
  },
  "e069": {
    "priority": "ROUTINE",
    "category": "STATUS_CHECK",
    "distress": false,
    "keywords": [
      "nothing here"
    ],
    "is_status_check": true,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "Campus PD reports all clear at gym doors."
  },
  "e072": {
    "priority": "URGENT",
    "category": "STATUS_CHECK",
    "distress": false,
    "keywords": [
      "Any unit with eyes on 4471"
    ],
    "is_status_check": true,
    "subject_unit": "4471",
    "cut_off_meaning": "",
    "digest": "Dispatch requesting visual confirmation on unit 4471."
  },
  "e075": {
    "priority": "URGENT",
    "category": "TACTICAL_MOVEMENT",
    "distress": false,
    "keywords": [
      "moving toward",
      "last known",
      "two hundred hallway"
    ],
    "is_status_check": false,
    "subject_unit": "8M-4471",
    "cut_off_meaning": "",
    "digest": "3052 moving toward 4471's last known location in the two hundred hallway."
  },
  "e082": {
    "priority": "EMERGENCY",
    "category": "OFFICER_DOWN",
    "distress": true,
    "keywords": [
      "Officer down",
      "two hundred hallway",
      "medics now"
    ],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "Officer down in two hundred hallway, medics requested immediately."
  },
  "e085": {
    "priority": "ROUTINE",
    "category": "TACTICAL_MOVEMENT",
    "distress": false,
    "keywords": [],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "Medic 5010 responding and asking for entrance direction."
  },
  "e088": {
    "priority": "URGENT",
    "category": "MEDICAL",
    "distress": false,
    "keywords": [
      "emergency traffic only",
      "Medics",
      "two hundred hallway, east stairwell"
    ],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "All units placed on emergency traffic only. Medics dispatched to 200-level hallway, east stairwell."
  },
  "e091": {
    "priority": "URGENT",
    "category": "OFFICER_DOWN",
    "distress": true,
    "keywords": [
      "he's hit in the vest",
      "he's talking"
    ],
    "is_status_check": false,
    "subject_unit": "8M-4471",
    "cut_off_meaning": "",
    "digest": "8M-4471 struck in body armor but conscious and communicating. With 8M-1104."
  },
  "e095": {
    "priority": "EMERGENCY",
    "category": "OFFICER_DOWN",
    "distress": true,
    "keywords": [
      "I took one in the plate",
      "2210 is the one that's down",
      "behind me in the two hundred hallway"
    ],
    "is_status_check": false,
    "subject_unit": "8M-2210",
    "cut_off_meaning": "",
    "digest": "8M-4471 reports being struck (stopped by body armor); 8M-2210 down in the 200 hallway behind 4471."
  },
  "e098": {
    "priority": "ROUTINE",
    "category": "MEDICAL",
    "distress": false,
    "keywords": [
      "Medics are en route"
    ],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "Medics dispatched to 2210 two hundred hallway."
  },
  "e099": {
    "priority": "URGENT",
    "category": "MEDICAL",
    "distress": false,
    "keywords": [
      "medics coming through"
    ],
    "is_status_check": false,
    "subject_unit": "",
    "cut_off_meaning": "",
    "digest": "Campus PD reports 200 hallway secured, medics en route."
  },
  "e102": {
    "priority": "ROUTINE",
    "category": "STATUS_CHECK",
    "distress": false,
    "keywords": [],
    "is_status_check": false,
    "subject_unit": "8M-2210",
    "cut_off_meaning": "",
    "digest": "5010 has made contact with unit 2210 and is working with them"
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CLASSIFICATIONS, CLASSIFICATION_MODEL, CLASSIFICATION_GENERATED_AT };
}
