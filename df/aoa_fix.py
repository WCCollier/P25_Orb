"""
Angle-of-arrival position fixing for multiple P25 Orb units.

Takes N observations — each a station position and a bearing to the transmitter —
and returns an estimated transmitter location, with an honest assessment of how
much that estimate is worth.

This is a standalone artifact. It is NOT part of the two-tab proof of concept,
which simulates a single Orb and does no direction finding at all. It exists to
show that the "where is that transmission coming from" roadmap item is real
engineering with a known solution, rather than a hand-wave.

No third-party packages. The linear algebra involved is a 2x2 solve, which does
not justify a numpy dependency.

Conventions
-----------
Bearings are degrees clockwise from true north, which is what a magnetometer
gives you and what an officer reads off a compass. Internally everything is
converted to a local east/north plane in metres.
"""

import math

# Metres per degree, near enough for a scene a few kilometres across. Using a
# proper geodetic library would be the right call for anything wider.
METRES_PER_DEG_LAT = 111132.95


class Observation:
    """One unit's bearing to the transmitter.

    lat, lon        where the observing unit is
    bearing_deg     bearing to the transmitter, degrees clockwise from true north
    sigma_deg       one-sigma uncertainty on that bearing. This is the honest
                    input: a bearing from a small antenna array on a handheld
                    unit is not exact, and pretending otherwise produces a
                    confident wrong answer.
    name            label for reporting
    """

    def __init__(self, lat, lon, bearing_deg, sigma_deg=3.0, name=None):
        if sigma_deg <= 0:
            raise ValueError("sigma_deg must be positive")
        self.lat = lat
        self.lon = lon
        self.bearing_deg = bearing_deg % 360.0
        self.sigma_deg = sigma_deg
        self.name = name or f"{lat:.5f},{lon:.5f}"


class Fix:
    """An estimated transmitter position and how much to trust it."""

    def __init__(self, lat, lon, rms_residual_m, gdop, forward_consistent,
                 station_count, warnings):
        self.lat = lat
        self.lon = lon
        self.rms_residual_m = rms_residual_m
        self.gdop = gdop
        self.forward_consistent = forward_consistent
        self.station_count = station_count
        self.warnings = warnings

    @property
    def usable(self):
        """Whether this fix should be shown to a commander as a location.

        A fix that fails these checks is not necessarily wrong, but it should be
        presented as a direction to search rather than as a point on a map.
        """
        return (
            self.forward_consistent
            and self.gdop is not None
            and self.gdop < 10.0
            and self.rms_residual_m < 500.0
        )

    def __repr__(self):
        return (f"Fix(lat={self.lat:.6f}, lon={self.lon:.6f}, "
                f"rms={self.rms_residual_m:.1f}m, gdop={self.gdop:.2f}, "
                f"usable={self.usable})")


def _to_local(lat, lon, lat0, lon0):
    """Project to a local east/north plane in metres, centred on (lat0, lon0)."""
    metres_per_deg_lon = METRES_PER_DEG_LAT * math.cos(math.radians(lat0))
    return ((lon - lon0) * metres_per_deg_lon, (lat - lat0) * METRES_PER_DEG_LAT)


def _to_geodetic(east, north, lat0, lon0):
    metres_per_deg_lon = METRES_PER_DEG_LAT * math.cos(math.radians(lat0))
    return (lat0 + north / METRES_PER_DEG_LAT, lon0 + east / metres_per_deg_lon)


def _bearing_to_unit_vector(bearing_deg):
    """Bearing clockwise from north -> (east, north) unit vector."""
    theta = math.radians(bearing_deg)
    return (math.sin(theta), math.cos(theta))


def solve(observations):
    """Estimate the transmitter position from N bearing observations.

    The method is weighted least squares on perpendicular distance. Each
    observation defines a line through the station along its bearing. The
    estimate is the point minimising the sum of weighted squared perpendicular
    distances to all those lines.

    For a line through point a with unit direction d, the squared perpendicular
    distance from a point p is

        (p - a)^T (I - d d^T) (p - a)

    because (I - d d^T) projects onto the direction normal to the line. Summing
    that over all observations and setting the derivative to zero gives a 2x2
    linear system

        (sum_i w_i M_i) p = sum_i w_i M_i a_i          where M_i = I - d_i d_i^T

    which is solved directly. Weights are 1/sigma^2, so a unit that reports a
    sloppy bearing pulls the answer around less than one that reports a tight
    one.
    """
    if len(observations) < 2:
        raise ValueError("At least two observations are required for a fix.")

    lat0 = sum(o.lat for o in observations) / len(observations)
    lon0 = sum(o.lon for o in observations) / len(observations)

    # Accumulate the normal equations. The matrix is symmetric, so three terms.
    a11 = a12 = a22 = 0.0
    b1 = b2 = 0.0
    locals_ = []

    for obs in observations:
        ax, ay = _to_local(obs.lat, obs.lon, lat0, lon0)
        dx, dy = _bearing_to_unit_vector(obs.bearing_deg)
        locals_.append((ax, ay, dx, dy))

        weight = 1.0 / (obs.sigma_deg ** 2)

        # M = I - d d^T
        m11 = 1.0 - dx * dx
        m12 = -dx * dy
        m22 = 1.0 - dy * dy

        a11 += weight * m11
        a12 += weight * m12
        a22 += weight * m22
        b1 += weight * (m11 * ax + m12 * ay)
        b2 += weight * (m12 * ax + m22 * ay)

    det = a11 * a22 - a12 * a12
    warnings = []

    # A vanishing determinant means the bearings are parallel: the lines never
    # meaningfully cross and there is no fix to be had, only a direction.
    if abs(det) < 1e-12:
        raise ValueError(
            "Bearings are parallel or nearly so — no position fix is possible. "
            "Reposition one unit so the bearings cross at a wider angle."
        )

    east = (b1 * a22 - b2 * a12) / det
    north = (a11 * b2 - a12 * b1) / det

    # Geometric dilution of precision. Good geometry means bearings crossing
    # near a right angle; poor geometry means a long thin error ellipse even
    # when every individual bearing is accurate. Reporting this is the
    # difference between "somewhere around here" and a false sense of precision.
    trace = a11 + a22
    disc = math.sqrt(max(0.0, trace * trace - 4.0 * det))
    eig_small = (trace - disc) / 2.0
    eig_large = (trace + disc) / 2.0
    gdop = math.sqrt(eig_large / eig_small) if eig_small > 1e-12 else float("inf")

    if gdop > 10.0:
        warnings.append(
            f"Poor crossing geometry (GDOP {gdop:.1f}). The bearings are close to "
            "parallel, so the fix is far more uncertain along one axis than the "
            "other."
        )

    # An AOA bearing is a RAY, not a line: the transmitter is in front of the
    # antenna, not behind it. The least-squares solution above works on infinite
    # lines and can happily place a fix behind a station. That is always wrong,
    # and it usually means a bearing is 180 degrees out — the classic front-back
    # ambiguity of a two-element array.
    forward_consistent = True
    residuals = []
    for (ax, ay, dx, dy), obs in zip(locals_, observations):
        vx, vy = east - ax, north - ay
        if vx * dx + vy * dy <= 0:
            forward_consistent = False
            warnings.append(
                f"Fix falls behind {obs.name}, which is impossible — that unit's "
                "bearing is likely reversed (front-back ambiguity)."
            )
        # Perpendicular distance from the estimate to this bearing line.
        residuals.append(abs(vx * dy - vy * dx))

    rms = math.sqrt(sum(r * r for r in residuals) / len(residuals))
    if rms > 500.0:
        warnings.append(
            f"Bearings disagree badly (RMS residual {rms:.0f} m). At least one "
            "is probably a multipath reflection rather than the direct signal."
        )

    lat, lon = _to_geodetic(east, north, lat0, lon0)
    return Fix(lat, lon, rms, gdop, forward_consistent, len(observations), warnings)


def describe(fix):
    """Plain-language summary, in the register the Command Feed would use."""
    lines = [f"Estimated position: {fix.lat:.6f}, {fix.lon:.6f}"]
    if fix.station_count == 2:
        # Two non-parallel lines always meet at exactly one point, so the
        # residual is zero however wrong the bearings are. Saying "they agree"
        # would be reporting a property of the geometry as if it were evidence.
        lines.append("From 2 units. With only two bearings there is no "
                     "cross-check: any two bearings meet somewhere.")
    else:
        lines.append(f"From {fix.station_count} units. "
                     f"Bearings agree to within {fix.rms_residual_m:.0f} m.")
    if fix.usable:
        lines.append("Geometry is good — treat this as a location.")
    else:
        lines.append("Treat this as a direction to search, not a point.")
    lines.extend("  ! " + w for w in fix.warnings)
    return "\n".join(lines)


if __name__ == "__main__":
    # Two units on a school campus, both hearing the same transmitter.
    observations = [
        Observation(30.26000, -97.74500, bearing_deg=45.0, sigma_deg=3.0, name="ORB-1"),
        Observation(30.26400, -97.74000, bearing_deg=270.0, sigma_deg=3.0, name="ORB-2"),
    ]
    print(describe(solve(observations)))
