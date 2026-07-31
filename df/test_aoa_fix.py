"""
Tests for the angle-of-arrival solver.

    python3 df/test_aoa_fix.py

No test framework, no dependencies. Most of these work by picking a transmitter
position, computing the exact bearings each station would observe, and checking
that the solver recovers the position it was given.
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from aoa_fix import METRES_PER_DEG_LAT, Fix, Observation, describe, solve

passed = 0
failed = 0


def check(description, condition, detail=None):
    global passed, failed
    if condition:
        passed += 1
        print(f"  ok    {description}")
    else:
        failed += 1
        print(f"  FAIL  {description}")
        if detail is not None:
            print(f"        {detail}")


def section(title):
    print(f"\n{title}")


def true_bearing(from_lat, from_lon, to_lat, to_lon):
    """Bearing from one point to another, degrees clockwise from north."""
    metres_per_deg_lon = METRES_PER_DEG_LAT * math.cos(math.radians(from_lat))
    east = (to_lon - from_lon) * metres_per_deg_lon
    north = (to_lat - from_lat) * METRES_PER_DEG_LAT
    return math.degrees(math.atan2(east, north)) % 360.0


def separation_m(lat1, lon1, lat2, lon2):
    metres_per_deg_lon = METRES_PER_DEG_LAT * math.cos(math.radians(lat1))
    east = (lon2 - lon1) * metres_per_deg_lon
    north = (lat2 - lat1) * METRES_PER_DEG_LAT
    return math.hypot(east, north)


# The scene: a school campus, transmitter somewhere inside it.
TX_LAT, TX_LON = 30.26200, -97.74200

STATIONS = [
    (30.26000, -97.74500, "ORB-1"),
    (30.26400, -97.74000, "ORB-2"),
    (30.25900, -97.73900, "ORB-3"),
]


def observation_from(station, sigma=3.0, bearing_error=0.0):
    lat, lon, name = station
    bearing = true_bearing(lat, lon, TX_LAT, TX_LON) + bearing_error
    return Observation(lat, lon, bearing, sigma_deg=sigma, name=name)


# ---------------------------------------------------------------------------

section("Two stations, exact bearings")
fix = solve([observation_from(STATIONS[0]), observation_from(STATIONS[1])])
error = separation_m(TX_LAT, TX_LON, fix.lat, fix.lon)
check("recovers the transmitter position to within a metre", error < 1.0, f"error={error:.3f} m")
check("residuals are essentially zero", fix.rms_residual_m < 1.0, f"rms={fix.rms_residual_m:.3f}")
check("the fix is reported as usable", fix.usable, describe(fix))
check("no warnings on a clean fix", fix.warnings == [], fix.warnings)

section("Three stations, exact bearings")
fix = solve([observation_from(s) for s in STATIONS])
error = separation_m(TX_LAT, TX_LON, fix.lat, fix.lon)
check("still recovers the position", error < 1.0, f"error={error:.3f} m")
check("reports three contributing stations", fix.station_count == 3)

section("Realistic bearing noise")
random.seed(20260803)
errors = []
for _ in range(200):
    observations = [observation_from(s, sigma=3.0, bearing_error=random.gauss(0, 3.0))
                    for s in STATIONS]
    trial = solve(observations)
    errors.append(separation_m(TX_LAT, TX_LON, trial.lat, trial.lon))
median = sorted(errors)[len(errors) // 2]
worst = max(errors)
check("median error stays under 40 m with 3-degree bearing noise",
      median < 40.0, f"median={median:.1f} m")
check("worst case over 200 trials stays under 200 m",
      worst < 200.0, f"worst={worst:.1f} m")
print(f"        (median {median:.1f} m, worst {worst:.1f} m over 200 trials)")

section("Weighting: a unit that admits it is unsure pulls less")
# ORB-1 is 20 degrees off but reports honest uncertainty; the others are exact.
sloppy = [
    observation_from(STATIONS[0], sigma=20.0, bearing_error=20.0),
    observation_from(STATIONS[1], sigma=1.0),
    observation_from(STATIONS[2], sigma=1.0),
]
# The same bad bearing, but claiming to be as accurate as the good ones.
overconfident = [
    observation_from(STATIONS[0], sigma=1.0, bearing_error=20.0),
    observation_from(STATIONS[1], sigma=1.0),
    observation_from(STATIONS[2], sigma=1.0),
]
weighted_error = separation_m(TX_LAT, TX_LON, *((lambda f: (f.lat, f.lon))(solve(sloppy))))
unweighted_error = separation_m(TX_LAT, TX_LON, *((lambda f: (f.lat, f.lon))(solve(overconfident))))
check("declaring higher uncertainty reduces that unit's influence",
      weighted_error < unweighted_error,
      f"weighted={weighted_error:.1f} m vs overconfident={unweighted_error:.1f} m")

section("Poor geometry is reported rather than hidden")
# Two units almost in line with each other and with the transmitter: the
# bearings barely cross, so the fix is very uncertain along one axis.
nearly_parallel = [
    Observation(30.25000, -97.74200, bearing_deg=0.2, sigma_deg=3.0, name="ORB-A"),
    Observation(30.25100, -97.74200, bearing_deg=0.0, sigma_deg=3.0, name="ORB-B"),
]
fix = solve(nearly_parallel)
check("high GDOP is computed", fix.gdop > 10.0, f"gdop={fix.gdop:.1f}")
check("the fix is flagged as not usable as a point", not fix.usable)
check("a warning explains why", any("geometry" in w.lower() for w in fix.warnings), fix.warnings)

section("Exactly parallel bearings are refused outright")
try:
    solve([
        Observation(30.25000, -97.74200, bearing_deg=0.0, name="ORB-A"),
        Observation(30.25100, -97.74200, bearing_deg=0.0, name="ORB-B"),
    ])
    check("raises rather than returning a meaningless fix", False, "no exception raised")
except ValueError as exc:
    check("raises rather than returning a meaningless fix", True)
    check("the message tells the operator what to do about it",
          "reposition" in str(exc).lower(), str(exc))

section("Front-back ambiguity is caught")
# ORB-1's bearing is reversed, the classic failure of a two-element array.
reversed_bearing = [
    observation_from(STATIONS[0], bearing_error=180.0),
    observation_from(STATIONS[1]),
]
fix = solve(reversed_bearing)
check("the fix is detected as falling behind a station", not fix.forward_consistent)
check("it is not offered as a usable position", not fix.usable)
check("the warning names the reversed unit",
      any("ORB-1" in w for w in fix.warnings), fix.warnings)

section("Input validation")
try:
    solve([observation_from(STATIONS[0])])
    check("a single bearing is refused", False, "no exception raised")
except ValueError:
    check("a single bearing is refused", True)

try:
    Observation(30.0, -97.0, 45.0, sigma_deg=0.0)
    check("zero uncertainty is refused", False, "no exception raised")
except ValueError:
    check("zero uncertainty is refused", True)

check("bearings are normalised into 0-360",
      Observation(30.0, -97.0, -90.0).bearing_deg == 270.0)

print(f"\n{passed} passed, {failed} failed\n")
sys.exit(0 if failed == 0 else 1)
