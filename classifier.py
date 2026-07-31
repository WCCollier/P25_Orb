"""
P25 Orb — the AI classification layer.

This module is the single definition of how a P25 transmission gets classified.
It is imported by two callers that must behave identically:

  tools/generate_classifications.py   run once at build time, to produce the
                                      cached labels the scripted demo replays
  serve.py                            run at demo time, behind /api/classify,
                                      for the live "try it live" panel

Keeping one definition is what lets the presenter say truthfully that the live
panel and the scripted demo are the same pipeline, not a demo and a mock-up.

No third-party packages. The Anthropic Python SDK is the normal way to call the
API and would be the right choice in a real product, but this demo has to run on
a presenter's laptop with nothing installed, so we speak HTTP with the standard
library instead. The request shape below is the documented Messages API shape.
"""

import json
import os
import urllib.error
import urllib.request

API_URL = "https://api.anthropic.com/v1/messages"

# Haiku 4.5 is deliberately the smallest capable model here. Labelling a single
# short radio transmission is a classification task, not a reasoning task, and
# the production argument for this feature depends on it being cheap enough to
# run on every transmission at a busy scene.
MODEL = "claude-haiku-4-5"

SYSTEM_PROMPT = """\
You classify individual radio transmissions heard on a public safety P25 land \
mobile radio system during an active multi-agency incident. Your output is read \
by an on-scene commander who cannot listen to every channel at once.

You will be given one transmission: the radio's unit ID, its talkgroup, whether \
the transmission was cut off mid-word, and a transcript.

Classify only what is in this one transmission. Do not speculate about the wider \
incident, and do not infer events you were not told about. If a transmission is \
routine, say so plainly — over-flagging routine traffic is a failure, because a \
commander who learns to distrust the alerts will ignore a real one.

Field guidance:

- priority: EMERGENCY if this transmission indicates immediate danger to life. \
URGENT if it needs command attention soon but nobody is described as in danger \
right now. ROUTINE otherwise.
- category: the single best fit.
- distress: true only if this transmission indicates a person is in danger or \
needs help. A unit reporting that a situation is under control is not distress.
- keywords: the exact words in the transcript that drove your assessment. Empty \
list if nothing stood out.
- is_status_check: true if this transmission is dispatch or command calling a \
specific unit and asking it to respond — a radio check, a welfare check, or \
asking whether anyone has eyes on that unit.
- subject_unit: if this transmission is ABOUT a different unit (a status check on \
them, or a report on their condition), give that unit's ID exactly as it appears \
in the transcript, in the form 8M-NNNN. Otherwise the empty string. A unit \
talking about itself is not a subject unit.
- cut_off_meaning: only if the transmission was cut off. State briefly what the \
speaker appeared to be starting to say, and be explicit that it is incomplete. \
Otherwise the empty string.
- digest: one short plain-language line for the commander's feed. Write it the \
way a good dispatcher would relay it: who, what, where. No jargon the commander \
would have to decode, and no restating the unit ID, which is displayed alongside.

A transmission that is cut off mid-word is more concerning than a complete one, \
not less. Say what you actually heard, flag that it is incomplete, and do not \
invent the rest of the sentence.
"""

# Structured outputs guarantee the response parses. Without this we would be
# writing defensive JSON-repair code around a model that is being asked to
# produce machine-readable output — the API can simply enforce the shape.
SCHEMA = {
    "type": "object",
    "properties": {
        "priority": {"type": "string", "enum": ["EMERGENCY", "URGENT", "ROUTINE"]},
        "category": {
            "type": "string",
            "enum": [
                "OFFICER_DOWN",
                "SHOTS_FIRED",
                "MEDICAL",
                "STATUS_CHECK",
                "TACTICAL_MOVEMENT",
                "CROWD_CONTROL",
                "LOGISTICS",
                "SYSTEM_ADVISORY",
                "ACKNOWLEDGEMENT",
                "OTHER",
            ],
        },
        "distress": {"type": "boolean"},
        "keywords": {"type": "array", "items": {"type": "string"}},
        "is_status_check": {"type": "boolean"},
        "subject_unit": {"type": "string"},
        "cut_off_meaning": {"type": "string"},
        "digest": {"type": "string"},
    },
    "required": [
        "priority",
        "category",
        "distress",
        "keywords",
        "is_status_check",
        "subject_unit",
        "cut_off_meaning",
        "digest",
    ],
    "additionalProperties": False,
}


def build_user_message(unit, talkgroup, truncated, transcript):
    """Render one transmission into the exact text the model classifies."""
    return (
        f"Unit ID: {unit}\n"
        f"Talkgroup: {talkgroup}\n"
        f"Cut off mid-word: {'yes' if truncated else 'no'}\n"
        f"Transcript: {transcript}"
    )


def load_api_key(env_path=".env"):
    """Read ANTHROPIC_API_KEY from the environment, falling back to a .env file.

    The key is only ever read server-side. Nothing in this module runs in a
    browser and nothing here is served to the client.
    """
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return key.strip()
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("ANTHROPIC_API_KEY="):
                    return line.split("=", 1)[1].strip().strip("\"'")
    raise RuntimeError(
        "No ANTHROPIC_API_KEY found. Set it in the environment or in .env "
        "next to this script."
    )


def classify(unit, talkgroup, truncated, transcript, api_key, timeout=30):
    """Classify one transmission. Returns (classification_dict, raw_response).

    Raises on transport or API failure; callers decide what to do about it. The
    live panel shows the error and the scripted demo never calls this at all.
    """
    body = {
        "model": MODEL,
        "max_tokens": 500,
        "system": SYSTEM_PROMPT,
        "output_config": {"format": {"type": "json_schema", "schema": SCHEMA}},
        "messages": [
            {
                "role": "user",
                "content": build_user_message(unit, talkgroup, truncated, transcript),
            }
        ],
    }

    request = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))

    # A safety refusal returns HTTP 200 with an empty content array, so check the
    # stop reason before indexing into content.
    if payload.get("stop_reason") == "refusal":
        raise RuntimeError("Model declined to classify this transmission.")

    text = next(b["text"] for b in payload["content"] if b["type"] == "text")
    return json.loads(text), payload
