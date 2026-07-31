"""
Build-time job: classify every voice transmission in the scripted timeline by
actually calling the Claude Haiku API, and cache the results.

Run this once, from the project root:

    python3 tools/generate_classifications.py

It writes two files:

  demo/js/classifications.js    the cached labels the demo replays. This is what
                                removes every network dependency from the live
                                presentation's critical path.
  tools/classification-log.json the full raw API responses, kept as evidence
                                that these labels were produced by the model and
                                not written by hand.

The timeline is read by shelling out to Node so that demo/js/timeline.js stays
the single source of truth for the scripted events, rather than being duplicated
into a Python copy that could silently drift out of sync.
"""

import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from classifier import MODEL, SYSTEM_PROMPT, classify, load_api_key  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TIMELINE_JS = os.path.join(ROOT, "demo", "js", "timeline.js")
OUT_JS = os.path.join(ROOT, "demo", "js", "classifications.js")
OUT_LOG = os.path.join(ROOT, "tools", "classification-log.json")

VOICE_TYPES = {"VOICE", "FALLBACK_VOICE"}


def load_timeline():
    script = (
        f"const t = require({json.dumps(TIMELINE_JS)});"
        "process.stdout.write(JSON.stringify({timeline: t.TIMELINE, talkgroups: t.TALKGROUPS}));"
    )
    out = subprocess.run(
        ["node", "-e", script], capture_output=True, text=True, check=True
    ).stdout
    return json.loads(out)


def main():
    api_key = load_api_key(os.path.join(ROOT, ".env"))
    data = load_timeline()
    talkgroups = data["talkgroups"]

    events = [e for e in data["timeline"] if e["type"] in VOICE_TYPES]
    print(f"Classifying {len(events)} transmissions with {MODEL}...\n")

    classifications = {}
    log = []

    for i, event in enumerate(events, 1):
        tg = event.get("tg")
        tg_label = (
            f"{tg} ({talkgroups[str(tg)]})"
            if tg is not None and str(tg) in talkgroups
            else "8TAC95D (analog talkaround, off-trunk)"
        )
        truncated = bool(event.get("truncated"))

        result, raw = classify(
            unit=event["unit"],
            talkgroup=tg_label,
            truncated=truncated,
            transcript=event["transcript"],
            api_key=api_key,
        )

        classifications[event["id"]] = result
        log.append(
            {
                "event_id": event["id"],
                "input": {
                    "unit": event["unit"],
                    "talkgroup": tg_label,
                    "truncated": truncated,
                    "transcript": event["transcript"],
                },
                "output": result,
                "api_response": raw,
            }
        )

        print(f"  [{i:>2}/{len(events)}] {event['id']}  {result['priority']:<9} "
              f"{result['category']:<18} distress={str(result['distress']):<5} "
              f"{result['digest'][:52]}")

        # The API is not rate limited at this volume, but a short pause keeps the
        # run polite and the output readable while it scrolls.
        time.sleep(0.2)

    generated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    with open(OUT_LOG, "w") as f:
        json.dump(
            {
                "generated_at": generated_at,
                "model": MODEL,
                "system_prompt": SYSTEM_PROMPT,
                "runs": log,
            },
            f,
            indent=2,
        )

    header = (
        "/*\n"
        " * P25 Orb — cached AI classifications for the scripted demo timeline.\n"
        " *\n"
        " * GENERATED FILE. Do not edit by hand.\n"
        f" * Produced by tools/generate_classifications.py on {generated_at}\n"
        f" * by calling {MODEL} on each transmission in demo/js/timeline.js.\n"
        " *\n"
        " * These are real model outputs, cached so that the live presentation has\n"
        " * no network dependency in its critical path. The raw API responses that\n"
        " * produced them are kept in tools/classification-log.json.\n"
        " *\n"
        " * The 'try it live' page calls the same model with the same prompt, so\n"
        " * you can demonstrate the classifier working on a phrase typed on the\n"
        " * spot without putting the scripted demo at the mercy of the network.\n"
        " */\n\n"
    )

    with open(OUT_JS, "w") as f:
        f.write(header)
        f.write(f"const CLASSIFICATION_MODEL = {json.dumps(MODEL)};\n")
        f.write(f"const CLASSIFICATION_GENERATED_AT = {json.dumps(generated_at)};\n\n")
        f.write("const CLASSIFICATIONS = ")
        f.write(json.dumps(classifications, indent=2))
        f.write(";\n\n")
        f.write(
            "if (typeof module !== 'undefined' && module.exports) {\n"
            "  module.exports = { CLASSIFICATIONS, CLASSIFICATION_MODEL, CLASSIFICATION_GENERATED_AT };\n"
            "}\n"
        )

    print(f"\nWrote {OUT_JS}")
    print(f"Wrote {OUT_LOG}")


if __name__ == "__main__":
    main()
