// Pipe layout math core. Pure functions, no UI / Node / browser dependencies,
// so this same file is unit-tested in Node and loaded by the web page, and can
// later drop into a mobile build unchanged.
(function (root) {
  'use strict';
  const Tables = (typeof require !== 'undefined') ? require('./tables') : root.PipeTables;

  // ---- input parsing -------------------------------------------------------
  // Accepts: 6.375 | 6-3/8 | 6 3/8 | 3/8 | 4' 6-1/2" | 12'6-3/8 | 12'
  function parseMeasurement(input) {
    if (typeof input === 'number') return input;
    if (!input) return NaN;
    let s = String(input).trim().replace(/["\u2033]/g, '').trim();
    if (!s) return NaN;
    let feet = 0;
    const apos = s.indexOf("'");
    if (apos >= 0) {
      feet = parseFloat(s.slice(0, apos));
      if (isNaN(feet)) return NaN;
      s = s.slice(apos + 1).trim();
      if (!s) return feet * 12;
    }
    return feet * 12 + parseInchPart(s);
  }
  function parseInchPart(s) {
    let m = s.match(/^(\d+(?:\.\d+)?)\s*[-\u2013 ]\s*(\d+)\s*\/\s*(\d+)$/); // 6-3/8 or 6 3/8
    if (m) { const d = parseFloat(m[3]); return d ? parseFloat(m[1]) + parseFloat(m[2]) / d : NaN; }
    m = s.match(/^(\d+)\s*\/\s*(\d+)$/); // 3/8
    if (m) { const d = parseFloat(m[2]); return d ? parseFloat(m[1]) / d : NaN; }
    const v = parseFloat(s);
    return (String(v) === s || /^\d+\.\d+$/.test(s) || /^\d+$/.test(s)) ? v : NaN;
  }

  // ---- output formatting ---------------------------------------------------
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  // Inches -> tape-measure string to the nearest 1/16, e.g. 28.284 -> 2' 4-5/16"
  function formatFraction(value, denom) {
    denom = denom || 16;
    if (value == null || isNaN(value)) return '—';
    const neg = value < 0;
    let total = Math.round(Math.abs(value) * denom);
    const feet = Math.floor(total / (12 * denom)); total -= feet * 12 * denom;
    const whole = Math.floor(total / denom);
    const num = total % denom;
    let inch;
    if (num) {
      const g = gcd(num, denom);
      const f = (num / g) + '/' + (denom / g);
      inch = (whole || feet) ? whole + '-' + f : f;
    } else {
      inch = String(whole);
    }
    return (neg ? '-' : '') + (feet ? feet + "' " : '') + inch + '"';
  }
  function formatDecimal(value) {
    if (value == null || isNaN(value)) return '—';
    return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0') + '"';
  }

  // ---- geometry ------------------------------------------------------------
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;

  // Simple (single-plane) offset: set + fitting angle -> travel & run (center-to-center).
  function simpleOffset(set, angleDeg) {
    const a = rad(angleDeg);
    return { set, angleDeg, travel: set / Math.sin(a), run: set / Math.tan(a) };
  }

  // Rolling offset: rise (vertical) + roll (horizontal).
  // Give a fitting angle, OR an advance (run along the line) and the angle is solved.
  function rollingOffset(rise, roll, opts) {
    opts = opts || {};
    const trueOffset = Math.hypot(rise, roll);
    let angleDeg, run;
    if (opts.advance && opts.advance > 0) {
      run = opts.advance;
      angleDeg = deg(Math.atan2(trueOffset, run));
    } else {
      angleDeg = opts.angleDeg || 45;
      run = trueOffset / Math.tan(rad(angleDeg));
    }
    return {
      rise, roll, trueOffset, angleDeg, run,
      travel: trueOffset / Math.sin(rad(angleDeg)),
      rollAngleDeg: deg(Math.atan2(roll, rise)), // clock the fitting this far off the rise plane
    };
  }

  // Elbow take-out (center-to-end) for a butt-weld elbow.
  // radiusType: 'LR' (default) or 'SR'.
  // LR: exact table values for 45 and 90 (ASME B16.9). Other angles:
  // approximated from the centerline radius (R = A90) as R*tan(angle/2) +
  // the end extension implied by the 45-degree table value, FLAGGED approx.
  // SR: exact at 90 only (ASME B16.9 SR A = 1 x NPS, NPS >= 1; returns null
  // below NPS 1, where B16.9 publishes no SR 90). Other angles approximated
  // as R_SR * tan(angle/2) with R_SR = the SR 90 center-to-end (the SR
  // centerline radius), FLAGGED approximate — B16.9 publishes no SR 45
  // center-to-end in this table set, so there is no second published point
  // to derive an end extension from; treat SR non-90 as a starting number
  // and measure the fitting.
  function takeout(nps, angleDeg, radiusType) {
    const p = Tables.byNps(nps);
    if (!p) return null;
    if (radiusType === 'SR') {
      if (p.sr90 == null) return null;
      if (angleDeg === 90) return { value: p.sr90, exact: true, source: 'ASME B16.9 SR 90' };
      return { value: p.sr90 * Math.tan(rad(angleDeg / 2)), exact: false, source: 'approx (B16.9 publishes SR 90 only)' };
    }
    if (angleDeg === 90) return { value: p.a90, exact: true, source: 'ASME B16.9 LR 90' };
    if (angleDeg === 45) return { value: p.b45, exact: true, source: 'ASME B16.9 LR 45' };
    const ext = p.b45 - p.a90 * Math.tan(rad(22.5));
    return { value: p.a90 * Math.tan(rad(angleDeg / 2)) + ext, exact: false, source: 'approx (B16.9 publishes 45/90 only)' };
  }

  // Cut length of the diagonal (travel) piece between two identical elbows.
  // travel (center-to-center) = takeout + gap + cut + gap + takeout
  function cutLength(travel, nps, angleDeg, gapPerJoint, radiusType) {
    const to = takeout(nps, angleDeg, radiusType);
    if (!to) return null;
    const gap = gapPerJoint || 0;
    const cut = travel - 2 * to.value - 2 * gap;
    return { cut, takeoutEach: to.value, takeoutExact: to.exact, takeoutSource: to.source, gapEach: gap, valid: cut > 0 };
  }

  // ---- mitered turns -------------------------------------------------------
  // Single miter: two pieces meet at one mitered joint to make a turn.
  // The cut on each piece is HALF the turn angle, measured from square
  // (from the plane perpendicular to the pipe axis) — the number you set on
  // the saw / read off the bevel. Across the cut face the pipe's long side
  // and short side differ from the centerline length by (OD/2)*tan(cut)
  // each way, because the tilted cut plane crosses the OD.
  //   long  = center + (OD/2) * tan(cutAngle)
  //   short = center - (OD/2) * tan(cutAngle)
  // centerLength is the piece length at the centerline, measured from the
  // square (un-cut) end or reference line to the center of the miter face.
  function singleMiter(turnDeg, od, centerLength) {
    const cutAngleDeg = turnDeg / 2;
    const swing = (od / 2) * Math.tan(rad(cutAngleDeg));
    return {
      turnDeg, od, centerLength, cutAngleDeg, swing,
      longSide: centerLength + swing,
      shortSide: centerLength - swing,
    };
  }

  // Segmented (lobster-back) bend: `joints` miter joints share the turn
  // equally, giving joints+1 pieces: 2 end pieces (one square end, one
  // mitered end) and joints-1 middle pieces (mitered both ends).
  //   cut angle per cut  beta = turn / (2 * joints)
  //   end tangent        T_end = R * tan(beta)     (tangent point -> joint)
  //   middle tangent     T_mid = 2 * R * tan(beta) (joint -> joint)
  // where R is the bend's centerline radius and tangents are measured along
  // the piece centerline between the bend tangent point / joint centers
  // (the standard miter-bend construction: piece axes are tangent to the
  // centerline arc at each segment midpoint, miter planes pass through the
  // bend center — derived and verified numerically in the tests).
  // Long/short side of a piece = its tangent length +/- (OD/2)*tan(beta)
  // for EACH mitered end (end pieces swing once, middle pieces twice).
  // Example: 90 deg in 2 joints (3 pieces) -> 22.5 deg cuts.
  function segmentedMiter(turnDeg, joints, radius, od) {
    const cutAngleDeg = turnDeg / (2 * joints);
    const t = Math.tan(rad(cutAngleDeg));
    const swing = (od / 2) * t;
    const endTangent = radius * t;
    const midTangent = 2 * radius * t;
    const pieces = [];
    for (let i = 0; i < joints + 1; i++) {
      const isEnd = (i === 0 || i === joints);
      const center = isEnd ? endTangent : midTangent;
      const s = isEnd ? swing : 2 * swing;
      pieces.push({
        index: i + 1, kind: isEnd ? 'end' : 'middle', cuts: isEnd ? 1 : 2,
        center, longSide: center + s, shortSide: center - s,
      });
    }
    return {
      turnDeg, joints, radius, od, cutAngleDeg, swing, endTangent, midTangent,
      pieceCount: joints + 1, pieces,
      bendLength: 2 * endTangent + Math.max(0, joints - 1) * midTangent,
    };
  }

  // ---- saddle / branch template -------------------------------------------
  // Wrap-around paper template for cutting the end of a branch pipe that
  // lands on a header (run) pipe, branch axis meeting the header axis at
  // angleDeg (90 = straight saddle/tee, 45 = lateral). Layout assumes the
  // branch centerline, extended, hits the header centerline, and works off
  // the two OUTSIDE diameters (wall thickness ignored — the standard
  // paper-template convention; dry-fit before the final cut).
  //
  // Geometry: put the header axis on x, its center at the origin, radius
  // Rh. The branch axis lies in the x-z plane at angle g to the header
  // axis. A point on the branch surface at wrap angle theta (measured from
  // e1 = the direction in the bend plane perpendicular to the branch axis)
  // sits at distance t along the branch axis from the centerline crossing,
  // where solving (point on header cylinder) y^2 + z^2 = Rh^2 gives
  //   t(theta) = [ sqrt(Rh^2 - (Rb sin theta)^2) - Rb cos(theta) cos(g) ] / sin(g)
  // At g = 90 deg this reduces to the textbook saddle t = sqrt(Rh^2 -
  // (Rb sin theta)^2). The template ordinate at theta is measured back
  // from the branch's square end, with the end squared at the LONGEST
  // point of the cut (tMax):  ordinate = tMax - t(theta)  (>= 0).
  // Ordinate #1 (theta = 0) faces along the header axis; the ordinates
  // peak a quarter turn away, where the branch wraps down the header's
  // flanks. 16 divisions around the branch (22.5 deg apart) is the usual
  // chart density; arc = distance around the branch OD from ordinate #1.
  function saddle(branchNps, headerNps, angleDeg, divisions) {
    const b = Tables.byNps(branchNps);
    const h = Tables.byNps(headerNps);
    if (!b || !h) return null;
    const Rb = b.od / 2, Rh = h.od / 2;
    if (Rb > Rh) return { valid: false, reason: 'Branch is larger than the header — this layout needs branch <= header.' };
    const g = rad(angleDeg == null ? 90 : angleDeg);
    const div = divisions || 16;
    const ts = [];
    let tMax = -Infinity, tMin = Infinity;
    for (let i = 0; i < div; i++) {
      const th = (i / div) * 2 * Math.PI;
      const t = (Math.sqrt(Rh * Rh - Math.pow(Rb * Math.sin(th), 2)) - Rb * Math.cos(th) * Math.cos(g)) / Math.sin(g);
      ts.push(t);
      if (t > tMax) tMax = t;
      if (t < tMin) tMin = t;
    }
    const circumference = Math.PI * b.od;
    const points = ts.map((t, i) => ({
      index: i + 1,
      angleDeg: (i / div) * 360,
      arc: (i / div) * circumference,
      ordinate: tMax - t,
      axisDist: t,
    }));
    return {
      valid: true, branchNps, headerNps, angleDeg: angleDeg == null ? 90 : angleDeg,
      branchOd: b.od, headerOd: h.od, circumference, spacing: circumference / div,
      depth: tMax - tMin, heelDist: tMax, points,
    };
  }

  // Parallel (equal-spread) offset: a bank of pipes, all making the same offset,
  // centerlines spaced `spread` apart in the bend plane, spacing held through
  // the offset. Travel is identical for every pipe; each successive pipe's
  // fittings stagger along the run by the "gain" = spread * tan(angle/2) so the
  // spacing stays constant through the diagonal (trade formula; verified
  // analytically: with stagger g = spread*tan(a/2), the perpendicular distance
  // between adjacent diagonals is exactly `spread`).
  function parallelOffset(set, angleDeg, spread, count) {
    const base = simpleOffset(set, angleDeg);
    const gain = spread * Math.tan(rad(angleDeg / 2));
    const pipes = [];
    for (let i = 0; i < count; i++) {
      pipes.push({ index: i + 1, travel: base.travel, run: base.run, stagger: i * gain });
    }
    return { set, angleDeg, spread, count, travel: base.travel, run: base.run, gain, pipes };
  }

  // Fitting centers: the center of a fitting is where its end centerlines
  // cross. For elbows that distance (face to center) is the take-out above;
  // for an equal tee, B16.9 gives run center-to-end C and branch M, equal
  // at every size in this range.
  function teeCenter(nps) {
    const t = Tables.tee(nps);
    if (!t) return null;
    return { nps, run: t.c, branch: t.c };
  }

  // Butt-weld reducer (ASME B16.9): overall length H is set by the larger
  // end and is the same for concentric and eccentric. A concentric keeps
  // one shared centerline; an eccentric has one flush (flat) side, so its
  // centerline shifts by half the OD difference: (OD_large - OD_small) / 2.
  function reducer(largeNps, smallNps, type) {
    const L = Tables.byNps(largeNps);
    const S = Tables.byNps(smallNps);
    if (!L || !S) return null;
    const H = Tables.reducerH(largeNps);
    if (H == null) return null;
    const eccentric = type === 'eccentric';
    return {
      largeNps, smallNps, type: eccentric ? 'eccentric' : 'concentric',
      length: H, largeOd: L.od, smallOd: S.od,
      offset: eccentric ? (L.od - S.od) / 2 : 0,
    };
  }

  function pipeData(nps, schedule) {
    const p = Tables.byNps(nps);
    if (!p) return null;
    const s = (schedule === '80') ? p.sch80 : p.sch40;
    return { nps, od: p.od, schedule: schedule || '40', wall: s[0], id: s[1], weightPerFt: s[2] };
  }

  // ---- reference conversions (pocket reference) ---------------------------
  // 1 inch = 25.4 mm is the exact international definition, so inch <-> mm
  // carries no approximation at all. Slope is pure trig on a 12-inch run.
  const MM_PER_INCH = 25.4;
  function inchesToMm(inches) { return inches * MM_PER_INCH; }
  function mmToInches(mm) { return mm / MM_PER_INCH; }

  // Fraction chart rows for 0..1 inch in 1/denom steps (16ths by default),
  // every value computed from the exact step — the chart is generated,
  // never hand-typed, so a row can be checked as step/denom by hand.
  function fractionChart(denom) {
    const d = denom || 16;
    const rows = [];
    for (let i = 0; i <= d; i++) {
      const decimal = i / d;
      rows.push({ step: i, denom: d, decimal, mm: inchesToMm(decimal), fraction: formatFraction(decimal, d) });
    }
    return rows;
  }

  // Outside circumference from OD — the wrap length of a paper template.
  function circumference(od) { return Math.PI * od; }

  // Slope / pitch in the three field units, all from the same triangle:
  // a pitch of x inches per foot rises x over a 12-inch run, so
  //   tan(angle) = inPerFt / 12 = percent / 100.
  // Give exactly one of { inPerFt, degrees, percent }; get all three back.
  // (1/8 in/ft -> 0.597 deg -> 1.042%: the classic drainage pitch.)
  function slope(input) {
    if (!input) return null;
    let tan;
    if (input.inPerFt != null) tan = input.inPerFt / 12;
    else if (input.degrees != null) tan = Math.tan(rad(input.degrees));
    else if (input.percent != null) tan = input.percent / 100;
    else return null;
    if (typeof tan !== 'number' || isNaN(tan)) return null;
    return { inPerFt: 12 * tan, degrees: deg(Math.atan(tan)), percent: 100 * tan };
  }

  const api = { parseMeasurement, formatFraction, formatDecimal, simpleOffset, rollingOffset, parallelOffset, takeout, cutLength, teeCenter, reducer, pipeData, singleMiter, segmentedMiter, saddle, MM_PER_INCH, inchesToMm, mmToInches, fractionChart, circumference, slope };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PipeMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
