'use strict';
const M = window.PipeMath, T = window.PipeTables;
const $ = (id) => document.getElementById(id);
const fmt = (v) => M.formatFraction(v) + '  <small>(' + M.formatDecimal(v) + ')</small>';

// fill size selects
function fillSizes(id, dflt) {
  const sel = $(id);
  for (const p of T.PIPE) {
    const o = document.createElement('option');
    o.value = p.nps; o.textContent = p.nps + '"';
    if (p.nps === dflt) o.selected = true;
    sel.appendChild(o);
  }
}
fillSizes('s-size', '2'); fillSizes('r-size', '2'); fillSizes('d-size', '2'); fillSizes('p-size', '2');
fillSizes('m-size', '6'); fillSizes('sd-branch', '2'); fillSizes('sd-header', '6');
fillSizes('c-size', '2'); fillSizes('rd-large', '6');

// navigation — home entry screen with one tool open at a time. Opening a
// tool also recomputes it, so its results and diagrams are always fresh the
// moment the panel becomes visible.
const TOOL_TITLES = { simple: 'Simple Offset', rolling: 'Rolling Offset', parallel: 'Parallel', miter: 'Miter', saddle: 'Saddle', centers: 'Fitting Centers', reducers: 'Reducers', data: 'Pipe Data', reference: 'Reference' };
let lastTool = null; // most recent tool, kept for this page session only
function calcFor(t) {
  if (t === 'simple') calcSimple();
  else if (t === 'rolling') calcRolling();
  else if (t === 'parallel') calcParallel();
  else if (t === 'miter') calcMiter();
  else if (t === 'saddle') calcSaddle();
  else if (t === 'centers') calcCenters();
  else if (t === 'reducers') calcReducers();
  else if (t === 'data') calcData();
  else if (t === 'reference') calcReference();
}
function openTool(t) {
  lastTool = t;
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + t));
  $('tool-title').textContent = TOOL_TITLES[t] || '';
  $('view-home').hidden = true;
  $('view-tool').hidden = false;
  window.scrollTo(0, 0);
  calcFor(t);
}
function goHome() {
  $('view-tool').hidden = true;
  $('view-home').hidden = false;
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tile').forEach((b) => b.addEventListener('click', () => openTool(b.dataset.open)));
$('btn-home').addEventListener('click', goHome);

// ---------- 3D diagrams ----------
const viewS = window.Pipe3D.makeView($('s-3d'), $('s-tags'));
const viewR = window.Pipe3D.makeView($('r-3d'), $('r-tags'));
const viewP = window.Pipe3D.makeView($('p-3d'), $('p-tags'));
function pipeRadiusFor(size) {
  const od = T.byNps(size).od;
  return Math.max(od / 2 * 1.25, 0.5);
}
function drawSimple(set, run, size, cutTxt, travelTxt) {
  const scene = window.Pipe3D.offsetScene({ run, offY: set, offZ: 0, pipeRadius: pipeRadiusFor(size) });
  viewS.setScene(scene, [
    { at: scene.anchors.cut, text: 'CUT ' + cutTxt, cls: 'tag-cut', dy: 30 },
    { at: scene.anchors.travel, text: 'TRAVEL ' + travelTxt, dy: -34 },
    { at: scene.anchors.offsetMid, text: 'SET ' + M.formatFraction(set), dx: 26 },
  ]);
}
function drawRolling(rise, roll, run, size, cutTxt, travelTxt, trueTxt) {
  const scene = window.Pipe3D.offsetScene({ run, offY: rise, offZ: roll, pipeRadius: pipeRadiusFor(size) });
  viewR.setScene(scene, [
    { at: scene.anchors.cut, text: 'CUT ' + cutTxt, cls: 'tag-cut', dy: 32 },
    { at: scene.anchors.travel, text: 'TRAVEL ' + travelTxt, dy: -36 },
    { at: scene.anchors.offsetMid, text: 'OFFSET ' + trueTxt, dx: 30 },
  ]);
}

// Short-radius guard: B16.9 publishes no SR 90 below NPS 1, so takeout()
// returns null there. Returns true when the calc can proceed.
function checkCut(cut, warnEl, size) {
  if (cut) return true;
  warnEl.hidden = false;
  warnEl.textContent = 'ASME B16.9 doesn\'t publish a short-radius 90 below NPS 1 — no SR take-out exists for ' + size + '" pipe. Switch to long radius or a larger size.';
  return false;
}

// ---------- calculators ----------
let lastSimple = null, lastRolling = null;
function calcSimple() {
  const set = M.parseMeasurement($('s-set').value);
  const angle = parseFloat($('s-angle').value);
  const size = $('s-size').value;
  const type = $('s-type').value;
  const gap = parseFloat($('s-gap').value);
  const warn = $('s-warn');
  if (isNaN(set) || set <= 0) { warn.hidden = false; warn.textContent = 'Enter a set distance.'; return; }
  const off = M.simpleOffset(set, angle);
  const cut = M.cutLength(off.travel, size, angle, gap, type);
  if (!checkCut(cut, warn, size)) { $('s-cut').textContent = '—'; return; }
  lastSimple = { kind: 'Simple offset', set, angle, size, gap, travel: off.travel, run: off.run, cut: cut.cut };
  $('s-cut').textContent = cut.valid ? M.formatFraction(cut.cut) : '— too short';
  $('s-travel').innerHTML = fmt(off.travel);
  $('s-run').innerHTML = fmt(off.run);
  $('s-takeout').innerHTML = fmt(cut.takeoutEach);
  $('s-tosource').textContent = cut.takeoutSource + (cut.takeoutExact ? '' : ' — verify');
  warn.hidden = cut.valid;
  if (!cut.valid) warn.textContent = 'Travel is shorter than the two take-outs + gaps. Check the set, angle, or pipe size.';
  else if (!cut.takeoutExact) { warn.hidden = false; warn.textContent = 'Heads up: take-out at this angle is an approximation — B16.9 only publishes 45° and 90° (LR) / 90° (SR). Measure the fitting to confirm.'; }
  drawSimple(set, off.run, size, cut.valid ? M.formatFraction(cut.cut) : '—', M.formatFraction(off.travel));
}
function calcRolling() {
  const rise = M.parseMeasurement($('r-rise').value);
  const roll = M.parseMeasurement($('r-roll').value);
  const mode = $('r-mode').value;
  const size = $('r-size').value;
  const type = $('r-type').value;
  const gap = parseFloat($('r-gap').value);
  const warn = $('r-warn');
  $('r-angle-wrap').hidden = mode !== 'angle';
  $('r-advance-wrap').hidden = mode !== 'advance';
  if (isNaN(rise) || isNaN(roll) || (rise <= 0 && roll <= 0)) { warn.hidden = false; warn.textContent = 'Enter a rise and/or roll.'; return; }
  const opts = mode === 'advance'
    ? { advance: M.parseMeasurement($('r-advance').value) }
    : { angleDeg: parseFloat($('r-angle').value) };
  if (mode === 'advance' && !(opts.advance > 0)) { warn.hidden = false; warn.textContent = 'Enter an advance, or solve by fitting angle.'; return; }
  const r = M.rollingOffset(rise, roll, opts);
  // cut uses the actual fitting angle; when solved from advance it is rarely a stock angle
  const stockAngles = [11.25, 22.5, 30, 45, 60, 90];
  const nearest = stockAngles.reduce((a, b) => Math.abs(b - r.angleDeg) < Math.abs(a - r.angleDeg) ? b : a);
  const cutAngle = (mode === 'advance' && Math.abs(nearest - r.angleDeg) > 0.05) ? nearest : r.angleDeg;
  const travelForCut = (mode === 'advance' && cutAngle !== r.angleDeg) ? r.trueOffset / Math.sin(cutAngle * Math.PI / 180) : r.travel;
  const cut = M.cutLength(travelForCut, size, cutAngle, gap, type);
  if (!checkCut(cut, warn, size)) { $('r-cut').textContent = '—'; return; }
  lastRolling = { kind: 'Rolling offset', rise, roll, angle: cutAngle, size, gap, travel: travelForCut, cut: cut.cut };
  $('r-cut').textContent = cut.valid ? M.formatFraction(cut.cut) : '— too short';
  $('r-travel').innerHTML = fmt(travelForCut);
  $('r-true').innerHTML = fmt(r.trueOffset);
  $('r-run').innerHTML = fmt(r.run);
  $('r-fitangle').textContent = r.angleDeg.toFixed(2) + '°' + (mode === 'advance' && cutAngle !== r.angleDeg ? ' → use ' + cutAngle + '° fittings' : '');
  $('r-rollangle').textContent = r.rollAngleDeg.toFixed(1) + '° off the rise plane';
  $('r-takeout').innerHTML = fmt(cut.takeoutEach) + (cut.takeoutExact ? '' : ' <small>(approx)</small>');
  warn.hidden = cut.valid && cut.takeoutExact;
  if (!cut.valid) warn.textContent = 'Travel is shorter than the two take-outs + gaps. Check the inputs.';
  else if (!cut.takeoutExact) warn.textContent = 'Take-out at this angle is an approximation (B16.9 publishes 45°/90° LR, 90° SR only). Measure the fitting to confirm.';
  drawRolling(Math.max(rise, 0.01), Math.max(roll, 0.01), Math.max(r.run, 0.01), size,
    cut.valid ? M.formatFraction(cut.cut) : '—', M.formatFraction(travelForCut), M.formatFraction(r.trueOffset));
}
let lastParallel = null;
function calcParallel() {
  const set = M.parseMeasurement($('p-set').value);
  const spread = M.parseMeasurement($('p-spread').value);
  const angle = parseFloat($('p-angle').value);
  const count = parseInt($('p-count').value, 10);
  const size = $('p-size').value;
  const type = $('p-type').value;
  const gap = parseFloat($('p-gap').value);
  const warn = $('p-warn');
  if (isNaN(set) || set <= 0 || isNaN(spread) || spread <= 0) { warn.hidden = false; warn.textContent = 'Enter a set and a spread (center-to-center).'; return; }
  const par = M.parallelOffset(set, angle, spread, count);
  const cut = M.cutLength(par.travel, size, angle, gap, type);
  if (!checkCut(cut, warn, size)) { $('p-cut').textContent = '—'; return; }
  lastParallel = { kind: 'Parallel offset', set, spread, count, angle, size, gap, travel: par.travel, gain: par.gain, cut: cut.cut };
  $('p-cut').textContent = cut.valid ? M.formatFraction(cut.cut) : '— too short';
  $('p-travel').innerHTML = fmt(par.travel);
  $('p-gain').innerHTML = fmt(par.gain);
  $('p-takeout').innerHTML = fmt(cut.takeoutEach) + (cut.takeoutExact ? '' : ' <small>(approx)</small>');
  $('p-list').innerHTML = par.pipes.map((p) =>
    '<div class="prow"><b>Pipe ' + p.index + '</b><span>cut ' + (cut.valid ? M.formatFraction(cut.cut) : '—') +
    ' · stagger ' + M.formatFraction(p.stagger) + '</span></div>').join('');
  warn.hidden = cut.valid && cut.takeoutExact;
  if (!cut.valid) warn.textContent = 'Travel is shorter than the two take-outs + gaps. Check the set, angle, or pipe size.';
  else if (!cut.takeoutExact) warn.textContent = 'Take-out at this angle is an approximation (B16.9 publishes 45°/90° LR, 90° SR only). Measure the fitting to confirm.';
  // 3D: base scene translated per pipe by (-k*gain, k*spread, 0)
  const base = window.Pipe3D.offsetScene({ run: par.run, offY: set, offZ: 0, pipeRadius: pipeRadiusFor(size) });
  const scenes = par.pipes.map((p, k) => {
    const dx = -p.stagger, dy = k * spread;
    return {
      radius: base.radius,
      centerline: base.centerline.map((s) => ({ zone: s.zone, p: [s.p[0] + dx, s.p[1] + dy, s.p[2]] })),
    };
  });
  const last = par.pipes[par.pipes.length - 1];
  viewP.setScenes(scenes, [
    { at: base.anchors.cut, text: 'CUT ' + (cut.valid ? M.formatFraction(cut.cut) : '—'), cls: 'tag-cut', dy: 32 },
    { at: base.anchors.offsetMid, text: 'SET ' + M.formatFraction(set), dx: 26 },
    { at: [base.anchors.travel[0] - last.stagger, base.anchors.travel[1] + (count - 1) * spread, 0], text: 'STAGGER +' + M.formatFraction(last.stagger), dy: -36 },
  ]);
}

// ---------- miter ----------
let lastMiterSummary = null;
// Schematic side view of the mitered turn: centerline corners come from the
// same tangent construction the math uses (piece axes tangent to the
// centerline arc at each segment midpoint).
function drawMiterSVG(mode, turn, joints, od) {
  const svg = $('m-svg');
  const W = 320, H = 210, cx = 52, cy = 168, R = 118; // arc center bottom-left area
  const rad = (d) => (d * Math.PI) / 180;
  const arcPt = (phi) => [cx + R * Math.sin(rad(phi)), cy - R * Math.cos(rad(phi))];
  const dir = (phi) => [Math.cos(rad(phi)), -Math.sin(rad(phi))];
  const nj = mode === 'single' ? 1 : joints;
  // build centerline: extend inlet/outlet past the tangent points a bit
  const pts = [];
  const p0 = arcPt(0), d0 = dir(0);
  pts.push([p0[0] - d0[0] * 34, p0[1] - d0[1] * 34]);
  pts.push(p0);
  // corners: intersections of consecutive tangent lines
  const lineAt = (phi) => ({ p: arcPt(phi), d: dir(phi) });
  const lines = [];
  for (let k = 0; k <= nj; k++) lines.push(lineAt((turn * k) / nj));
  const corners = [];
  for (let k = 1; k <= nj; k++) {
    const a = lines[k - 1], b = lines[k];
    const det = a.d[0] * b.d[1] - a.d[1] * b.d[0];
    const t = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / det;
    corners.push([a.p[0] + t * a.d[0], a.p[1] + t * a.d[1]]);
  }
  corners.forEach((c) => pts.push(c));
  const pEnd = arcPt(turn), dEnd = dir(turn);
  pts.push(pEnd);
  pts.push([pEnd[0] + dEnd[0] * 34, pEnd[1] + dEnd[1] * 34]);
  const w = Math.max(10, Math.min(34, od * 3.2)); // schematic pipe width
  const line = (a, b, cls, extra) => '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" class="' + cls + '"' + (extra || '') + '/>';
  let s = '';
  s += '<polyline points="' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '" class="svg-pipe" style="stroke-width:' + w.toFixed(0) + '"/>';
  s += '<polyline points="' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '" class="svg-center"/>';
  // miter cut lines across the pipe at each corner, along the bisector plane
  corners.forEach((c, i) => {
    const phi = (turn * (i + 1)) / nj - turn / (2 * nj); // not used; bisector below
    const bis = dir(turn * (i + 0.5) / nj); // direction of travel at mid-segment
    const n = [-bis[1], bis[0]];
    const half = w * 0.72;
    s += line([c[0] - n[0] * half, c[1] - n[1] * half], [c[0] + n[0] * half, c[1] + n[1] * half], 'svg-cut');
    void phi;
  });
  const mid = corners[Math.floor(corners.length / 2)];
  s += '<text x="' + (mid[0] + 8) + '" y="' + (mid[1] - w / 2 - 8) + '" class="svg-label">CUT ' + (turn / (2 * nj)) + '°</text>';
  s += '<text x="14" y="24" class="svg-label dim">TURN ' + turn + '°</text>';
  svg.innerHTML = s;
}
let lastMiter = null;
function calcMiter() {
  const mode = $('m-mode').value;
  const turn = parseFloat($('m-turn').value);
  const size = $('m-size').value;
  const od = T.byNps(size).od;
  const warn = $('m-warn');
  $('m-center-wrap').hidden = mode !== 'single';
  $('m-joints-wrap').hidden = mode !== 'segmented';
  $('m-radius-wrap').hidden = mode !== 'segmented';
  $('m-note-single').hidden = mode !== 'single';
  $('m-note-seg').hidden = mode !== 'segmented';
  const row = (k, v) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>';
  if (mode === 'single') {
    const center = M.parseMeasurement($('m-center').value);
    if (isNaN(center) || center <= 0) { warn.hidden = false; warn.textContent = 'Enter the piece length at the centerline.'; $('m-cutangle').textContent = '—'; return; }
    const r = M.singleMiter(turn, od, center);
    lastMiter = r;
    $('m-cutangle').textContent = r.cutAngleDeg + '°';
    $('m-outs').innerHTML =
      row('Long side', fmt(r.longSide)) +
      row('Short side', fmt(r.shortSide)) +
      row('Centerline length', fmt(r.centerLength)) +
      row('Pipe OD', od.toFixed(3) + '"');
    $('m-pieces').innerHTML = '';
    warn.hidden = r.shortSide > 0;
    if (r.shortSide <= 0) warn.textContent = 'The miter swallows the whole piece — the short side comes out ' + M.formatFraction(r.shortSide) + '. Lengthen the piece or reduce the turn.';
    lastMiterSummary = 'Single miter · ' + size + '" @ ' + turn + '° turn · cut ' + r.cutAngleDeg + '° · long ' + M.formatFraction(r.longSide) + ' · short ' + M.formatFraction(r.shortSide);
    drawMiterSVG('single', turn, 1, od);
  } else {
    const joints = parseInt($('m-joints').value, 10);
    const radius = M.parseMeasurement($('m-radius').value);
    if (isNaN(radius) || radius <= 0) { warn.hidden = false; warn.textContent = 'Enter the bend centerline radius.'; $('m-cutangle').textContent = '—'; return; }
    const r = M.segmentedMiter(turn, joints, radius, od);
    lastMiter = r;
    $('m-cutangle').textContent = r.cutAngleDeg + '°';
    $('m-outs').innerHTML =
      row('Pieces', r.pieceCount + ' (' + joints + ' miter cuts)') +
      row('End tangent (each end piece)', fmt(r.endTangent)) +
      (joints > 1 ? row('Middle tangent (each middle piece)', fmt(r.midTangent)) : '') +
      row('Centerline radius', fmt(radius)) +
      row('Pipe OD', od.toFixed(3) + '"');
    $('m-pieces').innerHTML = r.pieces.map((p) =>
      '<div class="prow"><b>Piece ' + p.index + '</b><span>' + p.kind + ' · center ' + M.formatFraction(p.center) +
      ' · long ' + M.formatFraction(p.longSide) + ' · short ' + M.formatFraction(p.shortSide) + '</span></div>').join('');
    const bad = r.pieces.some((p) => p.shortSide <= 0);
    warn.hidden = !bad;
    if (bad) warn.textContent = 'A piece\'s short side comes out at or below zero — the radius is too tight for this pipe OD. Increase the centerline radius.';
    lastMiterSummary = 'Segmented miter · ' + size + '" @ ' + turn + '° in ' + joints + ' cuts · cut ' + r.cutAngleDeg + '° · R ' + M.formatFraction(radius) + ' · end tan ' + M.formatFraction(r.endTangent) + (joints > 1 ? ' · mid tan ' + M.formatFraction(r.midTangent) : '');
    drawMiterSVG('segmented', turn, joints, od);
  }
}

// ---------- saddle ----------
let lastSaddleSummary = null;
function drawSaddleSVG(s) {
  const svg = $('sd-svg');
  const x0 = 26, x1 = 332, yTop = 26, yBot = 168;
  const X = (arc) => x0 + (arc / s.circumference) * (x1 - x0);
  const Y = (ord) => yTop + (s.depth > 0 ? (ord / s.depth) * (yBot - yTop) : 0);
  let str = '';
  str += '<line x1="' + x0 + '" y1="' + yTop + '" x2="' + x1 + '" y2="' + yTop + '" class="svg-end"/>';
  // faint verticals at each ordinate
  for (const p of s.points) {
    str += '<line x1="' + X(p.arc).toFixed(1) + '" y1="' + yTop + '" x2="' + X(p.arc).toFixed(1) + '" y2="' + yBot + '" class="svg-grid"/>';
  }
  const pts = s.points.map((p) => X(p.arc).toFixed(1) + ',' + Y(p.ordinate).toFixed(1));
  pts.push(x1 + ',' + Y(s.points[0].ordinate).toFixed(1)); // wrap back to #1
  str += '<polyline points="' + pts.join(' ') + '" class="svg-curve"/>';
  for (const p of s.points) {
    str += '<circle cx="' + X(p.arc).toFixed(1) + '" cy="' + Y(p.ordinate).toFixed(1) + '" r="2.6" class="svg-dot"/>';
  }
  const peak = s.points.reduce((a, b) => (b.ordinate > a.ordinate ? b : a), s.points[0]);
  str += '<text x="' + x0 + '" y="14" class="svg-label">#1 — faces along header</text>';
  str += '<text x="' + Math.min(X(peak.arc) - 26, x1 - 92).toFixed(0) + '" y="' + Math.min(Y(peak.ordinate) + 18, 196) + '" class="svg-label">deepest #' + peak.index + '</text>';
  str += '<text x="' + x0 + '" y="196" class="svg-label dim">around branch → · ordinate measured back from the square end</text>';
  svg.innerHTML = str;
}
function calcSaddle() {
  const branch = $('sd-branch').value;
  const header = $('sd-header').value;
  const angle = parseFloat($('sd-angle').value);
  const warn = $('sd-warn');
  const s = M.saddle(branch, header, angle, 16);
  if (!s || !s.valid) {
    warn.hidden = false;
    warn.textContent = s ? s.reason : 'Pick a branch and header size.';
    $('sd-depth').textContent = '—';
    $('sd-table').innerHTML = '';
    $('sd-svg').innerHTML = '';
    return;
  }
  warn.hidden = true;
  $('sd-depth').textContent = M.formatFraction(s.depth);
  $('sd-bod').textContent = s.branchOd.toFixed(3) + '"';
  $('sd-hod').textContent = s.headerOd.toFixed(3) + '"';
  $('sd-circ').innerHTML = fmt(s.circumference);
  $('sd-spacing').innerHTML = fmt(s.spacing);
  $('sd-heel').innerHTML = fmt(s.heelDist);
  $('sd-table').innerHTML =
    '<thead><tr><th>#</th><th>Around</th><th>Ordinate</th><th></th></tr></thead><tbody>' +
    s.points.map((p) =>
      '<tr><td>' + p.index + '</td><td>' + M.formatFraction(p.arc) + '</td><td><strong>' + M.formatFraction(p.ordinate) + '</strong></td><td class="dimcell">' + M.formatDecimal(p.ordinate) + '</td></tr>'
    ).join('') + '</tbody>';
  drawSaddleSVG(s);
  lastSaddleSummary = 'Saddle ' + angle + '° · branch ' + branch + '" on ' + header + '" header · deepest ordinate ' + M.formatFraction(s.depth) + ' · wrap ' + M.formatFraction(s.circumference);
}

// ---------- fitting centers ----------
let lastCentersSummary = '';
const CENTER_NOTES = {
  elbow90: 'The center of a 90 is the point where the two end centerlines cross — it floats in the corner, not on the fitting. To find it: measure the center-to-end (A) back from either face along that leg\'s centerline; both faces land on the same point. On an installed elbow, lay a straightedge across each face and project the centerlines until they meet.',
  elbow90sr: 'Same idea as the long-radius 90, with the short-radius center-to-end (A = the pipe size itself, per B16.9). The center is where the two end centerlines cross.',
  elbow45: 'A 45\'s center is where its two end centerlines cross, out past the heel. Measure the center-to-end (B) back from either face along its centerline — both faces give the same crossing point.',
  tee: 'A tee has one center: where the branch centerline crosses the run centerline. C is measured from a run face to the center, M from the branch face to the center — on an equal tee, B16.9 makes them the same number at every size.',
};
function drawCentersSVG(kind, valTxt) {
  const svg = $('c-svg');
  let str = '';
  if (kind === 'tee') {
    // run pipe horizontal, branch up at center x=170; center at (170,150)
    str += '<path d="M50 130 H290 V170 H50 Z M148 40 H192 V130 H148 Z" class="svg-pipe" stroke-width="2"/>';
    str += '<line x1="30" y1="150" x2="310" y2="150" class="svg-center"/>';
    str += '<line x1="170" y1="22" x2="170" y2="150" class="svg-center"/>';
    str += '<circle cx="170" cy="150" r="4.5" class="svg-dot"/>';
    str += '<line x1="50" y1="196" x2="170" y2="196" class="svg-end"/>';
    str += '<line x1="50" y1="188" x2="50" y2="202" class="svg-end"/><line x1="170" y1="188" x2="170" y2="202" class="svg-end"/>';
    str += '<text x="86" y="214" class="svg-label">C = ' + valTxt + '</text>';
    str += '<line x1="216" y1="40" x2="216" y2="150" class="svg-end"/>';
    str += '<line x1="209" y1="40" x2="223" y2="40" class="svg-end"/><line x1="209" y1="150" x2="223" y2="150" class="svg-end"/>';
    str += '<text x="228" y="99" class="svg-label">M = ' + valTxt + '</text>';
    str += '<text x="182" y="140" class="svg-label">CENTER</text>';
    str += '<text x="30" y="18" class="svg-label dim">dashed lines are the centerlines — where they cross is the center</text>';
  } else if (kind === 'elbow45') {
    str += '<path d="M45 178 H185 L252 111" class="svg-pipe" stroke-width="40"/>';
    str += '<line x1="28" y1="178" x2="196" y2="178" class="svg-center"/>';
    str += '<line x1="196" y1="178" x2="268" y2="106" class="svg-center"/>';
    str += '<line x1="196" y1="178" x2="150" y2="224" class="svg-center"/>';
    str += '<circle cx="196" cy="178" r="4.5" class="svg-dot"/>';
    str += '<text x="60" y="206" class="svg-label">B = ' + valTxt + ' from this face</text>';
    str += '<text x="196" y="92" class="svg-label">B = ' + valTxt + '</text>';
    str += '<text x="206" y="196" class="svg-label">CENTER</text>';
    str += '<text x="28" y="18" class="svg-label dim">extend both centerlines — the crossing point is the center</text>';
  } else {
    // 90 elbow: horizontal leg into a quarter bend up; center at (215,150)
    str += '<path d="M60 172 H193 A44 44 0 0 0 237 128 V35 H193 V128 A0 0 0 0 0 193 128 H60 Z" class="svg-pipe" stroke-width="2"/>';
    str += '<line x1="42" y1="150" x2="215" y2="150" class="svg-center"/>';
    str += '<line x1="215" y1="150" x2="215" y2="18" class="svg-center"/>';
    str += '<circle cx="215" cy="150" r="4.5" class="svg-dot"/>';
    str += '<line x1="60" y1="198" x2="215" y2="198" class="svg-end"/>';
    str += '<line x1="60" y1="190" x2="60" y2="205" class="svg-end"/><line x1="215" y1="190" x2="215" y2="205" class="svg-end"/>';
    str += '<text x="104" y="216" class="svg-label">A = ' + valTxt + '</text>';
    str += '<line x1="262" y1="35" x2="262" y2="150" class="svg-end"/>';
    str += '<line x1="255" y1="35" x2="269" y2="35" class="svg-end"/><line x1="255" y1="150" x2="269" y2="150" class="svg-end"/>';
    str += '<text x="272" y="96" class="svg-label">A</text>';
    str += '<text x="150" y="138" class="svg-label">CENTER →</text>';
    str += '<text x="42" y="18" class="svg-label dim">measure A back from either face — both give the same point</text>';
  }
  svg.innerHTML = str;
}
function calcCenters() {
  const kind = $('c-type').value;
  const size = $('c-size').value;
  const p = T.byNps(size);
  const warn = $('c-warn');
  warn.hidden = true;
  $('c-note').textContent = CENTER_NOTES[kind];
  const row = (k, v) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>';
  if (kind === 'tee') {
    const tc = M.teeCenter(size);
    $('c-hero-label').textContent = 'CENTER-TO-END — RUN (C) AND BRANCH (M)';
    $('c-main').textContent = M.formatFraction(tc.run);
    $('c-outs').innerHTML =
      row('Run center-to-end (C)', fmt(tc.run)) +
      row('Branch center-to-end (M)', fmt(tc.branch)) +
      row('Pipe OD', p.od.toFixed(3) + '"') +
      row('Source', 'ASME B16.9 equal tee');
    drawCentersSVG('tee', M.formatFraction(tc.run));
    lastCentersSummary = 'Tee center ' + size + '" · C = M = ' + M.formatFraction(tc.run);
    return;
  }
  const isSR = kind === 'elbow90sr';
  const angle = kind === 'elbow45' ? 45 : 90;
  const to = M.takeout(size, angle, isSR ? 'SR' : 'LR');
  if (!to) {
    warn.hidden = false;
    warn.textContent = 'ASME B16.9 doesn\'t publish a short-radius 90 below NPS 1 — pick long radius or a larger size.';
    $('c-main').textContent = '—'; $('c-outs').innerHTML = ''; $('c-svg').innerHTML = '';
    lastCentersSummary = '';
    return;
  }
  $('c-hero-label').textContent = angle === 90 ? 'CENTER-TO-END — EACH FACE (A)' : 'CENTER-TO-END — EACH FACE (B)';
  $('c-main').textContent = M.formatFraction(to.value);
  $('c-outs').innerHTML =
    row('Center-to-end, face 1', fmt(to.value)) +
    row('Center-to-end, face 2', fmt(to.value)) +
    row('Pipe OD', p.od.toFixed(3) + '"') +
    row('Source', to.source + (to.exact ? ' (exact)' : ' (approx)'));
  drawCentersSVG(kind, M.formatFraction(to.value));
  lastCentersSummary = 'Fitting center ' + (angle === 90 ? (isSR ? '90° SR' : '90° LR') : '45° LR') + ' ' + size + '" · center-to-end ' + M.formatFraction(to.value);
}

// ---------- reducers ----------
let lastReducersSummary = '';
function fillSmallSizes() {
  const large = $('rd-large').value;
  const idx = T.PIPE.findIndex((p) => p.nps === large);
  const sel = $('rd-small');
  const prev = sel.value;
  sel.innerHTML = '';
  T.PIPE.slice(0, idx).forEach((p) => {
    const o = document.createElement('option');
    o.value = p.nps; o.textContent = p.nps + '"';
    sel.appendChild(o);
  });
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  else if ([...sel.options].some((o) => o.value === '4')) sel.value = '4';
}
function drawReducerSVG(r) {
  const svg = $('rd-svg');
  const x0 = 66, x1 = 254, midY = 104;
  const hL = Math.max(30, Math.min(96, r.largeOd * 13));
  const hS = Math.max(16, Math.min(96, r.smallOd * 13));
  let str = '';
  if (r.type === 'eccentric') {
    const top = midY - hL / 2;
    str += '<path d="M' + x0 + ' ' + top + ' H' + x1 + ' V' + (top + hS) + ' L' + x0 + ' ' + (top + hL) + ' Z" class="svg-pipe" stroke-width="2"/>';
    str += '<line x1="44" y1="' + (top + hL / 2) + '" x2="218" y2="' + (top + hL / 2) + '" class="svg-center"/>';
    str += '<line x1="196" y1="' + (top + hS / 2) + '" x2="282" y2="' + (top + hS / 2) + '" class="svg-center"/>';
    str += '<line x1="296" y1="' + (top + hS / 2) + '" x2="296" y2="' + (top + hL / 2) + '" class="svg-end"/>';
    str += '<text x="248" y="' + (top + hS / 2 + (hL - hS) / 4 + 4) + '" class="svg-label">offset</text>';
    str += '<text x="' + x0 + '" y="' + (top - 10) + '" class="svg-label">FLAT SIDE — the two outside faces line up</text>';
  } else {
    str += '<path d="M' + x0 + ' ' + (midY - hL / 2) + ' L' + x1 + ' ' + (midY - hS / 2) + ' V' + (midY + hS / 2) + ' L' + x0 + ' ' + (midY + hL / 2) + ' Z" class="svg-pipe" stroke-width="2"/>';
    str += '<line x1="44" y1="' + midY + '" x2="282" y2="' + midY + '" class="svg-center"/>';
    str += '<text x="' + x0 + '" y="' + (midY - hL / 2 - 10) + '" class="svg-label">one shared centerline — even all the way around</text>';
  }
  str += '<line x1="' + x0 + '" y1="186" x2="' + x1 + '" y2="186" class="svg-end"/>';
  str += '<line x1="' + x0 + '" y1="179" x2="' + x0 + '" y2="193" class="svg-end"/><line x1="' + x1 + '" y1="179" x2="' + x1 + '" y2="193" class="svg-end"/>';
  str += '<text x="138" y="204" class="svg-label">H = ' + M.formatFraction(r.length) + '</text>';
  str += '<text x="' + (x0 - 6) + '" y="' + (midY + hL / 2 + 18) + '" class="svg-label dim">' + r.largeNps + '" end</text>';
  str += '<text x="' + (x1 - 24) + '" y="' + (midY + hL / 2 + 18) + '" class="svg-label dim">' + r.smallNps + '" end</text>';
  svg.innerHTML = str;
}
function calcReducers() {
  const type = $('rd-type').value;
  const r = M.reducer($('rd-large').value, $('rd-small').value, type);
  if (!r) { $('rd-len').textContent = '—'; $('rd-outs').innerHTML = ''; $('rd-svg').innerHTML = ''; lastReducersSummary = ''; return; }
  $('rd-len').textContent = M.formatFraction(r.length);
  const row = (k, v) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>';
  $('rd-outs').innerHTML =
    row('Large end OD', r.largeOd.toFixed(3) + '"') +
    row('Small end OD', r.smallOd.toFixed(3) + '"') +
    (r.type === 'eccentric'
      ? row('Centerline shift (offset)', fmt(r.offset))
      : row('Centerline shift (offset)', '0 — ends share one centerline')) +
    row('Source', 'ASME B16.9 — H set by the large end');
  $('rd-note').textContent = r.type === 'eccentric'
    ? 'Eccentric: one side is flat (flush), so the centerline shifts by the offset shown. Orientation matters: flat side UP on a horizontal pump suction, so air can\'t pocket at the top and get drawn into the pump; flat side DOWN where the line must drain completely or sit level on a rack (constant bottom-of-pipe). Same overall length as a concentric of the same sizes.'
    : 'Concentric: the reduction is even all the way around and both ends share one centerline — the standard pick for vertical runs and anywhere the centerline has to stay put. Same overall length as an eccentric of the same sizes.';
  drawReducerSVG(r);
  lastReducersSummary = (r.type === 'eccentric' ? 'Eccentric' : 'Concentric') + ' reducer ' + r.largeNps + '" x ' + r.smallNps + '" · H ' + M.formatFraction(r.length) + (r.type === 'eccentric' ? ' · offset ' + M.formatFraction(r.offset) : '');
}

function calcData() {
  const d = M.pipeData($('d-size').value, $('d-sched').value);
  const p = T.byNps($('d-size').value);
  const row = (k, v) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>';
  $('d-outs').innerHTML =
    row('Outside diameter', d.od.toFixed(3) + '"') +
    row('Wall thickness', d.wall.toFixed(3) + '"') +
    row('Inside diameter', d.id.toFixed(3) + '"') +
    row('Weight (empty)', d.weightPerFt.toFixed(2) + ' lb/ft') +
    row('Elbow take-out 90° LR', M.formatFraction(p.a90)) +
    row('Elbow take-out 45° LR', M.formatFraction(p.b45)) +
    row('Elbow take-out 90° SR', p.sr90 == null ? '— not published (NPS < 1)' : M.formatFraction(p.sr90));
}
// Listen on BOTH 'input' and 'change': some browsers (notably iOS Safari)
// fire only 'change' on <select> elements, so input-only listening left
// select-driven recalcs (rolling angle/size, parallel size) looking dead.
const onChange = (ids, fn) => ids.forEach((id) => {
  $(id).addEventListener('input', fn);
  $(id).addEventListener('change', fn);
});
onChange(['s-set', 's-angle', 's-size', 's-type', 's-gap'], calcSimple);
onChange(['r-rise', 'r-roll', 'r-mode', 'r-angle', 'r-advance', 'r-size', 'r-type', 'r-gap'], calcRolling);
onChange(['d-size', 'd-sched'], calcData);
onChange(['p-set', 'p-angle', 'p-spread', 'p-count', 'p-size', 'p-type', 'p-gap'], calcParallel);
onChange(['m-mode', 'm-turn', 'm-center', 'm-joints', 'm-radius'], calcMiter);
onChange(['sd-branch', 'sd-header', 'sd-angle'], calcSaddle);
onChange(['c-type', 'c-size'], calcCenters);
onChange(['rd-type', 'rd-small'], calcReducers);
$('rd-large').addEventListener('input', () => { fillSmallSizes(); calcReducers(); });
$('rd-large').addEventListener('change', () => { fillSmallSizes(); calcReducers(); });
onChange(['ref-in'], calcRefIn);
onChange(['ref-mm'], calcRefMm);
onChange(['ref-slope-inft'], () => calcRefSlope('inft'));
onChange(['ref-slope-deg'], () => calcRefSlope('deg'));
onChange(['ref-slope-pct'], () => calcRefSlope('pct'));
// changing pipe size in segmented mode re-seeds the radius to the LR centerline
$('m-size').addEventListener('change', () => {
  if ($('m-mode').value === 'segmented') {
    const npsVal = M.parseMeasurement($('m-size').value);
    if (!isNaN(npsVal)) $('m-radius').value = String(1.5 * npsVal);
  }
  calcMiter();
});
$('m-size').addEventListener('input', calcMiter);

// ---------- reference (pocket reference, v1.1) ----------
// Static charts are built once from the same core tables the calculators
// use; the converters and slope box are live.
function num(v, dp) { return String(parseFloat(v.toFixed(dp == null ? 3 : dp))); }
function buildReference() {
  const rows = M.fractionChart(16);
  $('ref-frac-table').innerHTML =
    '<thead><tr><th>Fraction</th><th>Decimal (in)</th><th>mm</th></tr></thead><tbody>' +
    rows.map((r) =>
      '<tr><td><strong>' + r.fraction.replace('"', '') + '</strong></td><td>' + r.decimal.toFixed(3) + '</td><td class="dimcell">' + num(r.mm) + '</td></tr>'
    ).join('') + '</tbody>';
  $('ref-pipe-table').innerHTML =
    '<thead><tr><th>NPS</th><th>OD</th><th>Sch 40 wall</th><th>Sch 40 ID</th><th>Sch 80 wall</th><th>Sch 80 ID</th><th>Wt/ft (40)</th><th>Circumf.</th></tr></thead><tbody>' +
    T.PIPE.map((p) =>
      '<tr><td><strong>' + p.nps + '"</strong></td><td>' + p.od.toFixed(3) + '</td><td>' + p.sch40[0].toFixed(3) + '</td><td>' + p.sch40[1].toFixed(3) +
      '</td><td>' + p.sch80[0].toFixed(3) + '</td><td>' + p.sch80[1].toFixed(3) + '</td><td>' + p.sch40[2].toFixed(2) + ' lb</td><td class="dimcell">' + M.formatDecimal(M.circumference(p.od)) + '</td></tr>'
    ).join('') + '</tbody>';
  $('ref-takeout-table').innerHTML =
    '<thead><tr><th>NPS</th><th>LR 90</th><th>LR 45</th><th>SR 90</th></tr></thead><tbody>' +
    T.PIPE.map((p) =>
      '<tr><td><strong>' + p.nps + '"</strong></td><td>' + M.formatFraction(p.a90) + '</td><td>' + M.formatFraction(p.b45) + '</td><td class="dimcell">' +
      (p.sr90 == null ? '—' : M.formatFraction(p.sr90)) + '</td></tr>'
    ).join('') + '</tbody>';
  $('ref-tee-table').innerHTML =
    '<thead><tr><th>NPS</th><th>Run (C)</th><th>Branch (M)</th></tr></thead><tbody>' +
    T.TEE.map((t) =>
      '<tr><td><strong>' + t.nps + '"</strong></td><td>' + M.formatFraction(t.c) + '</td><td class="dimcell">' + M.formatFraction(t.c) + '</td></tr>'
    ).join('') + '</tbody>';
  $('ref-reducer-table').innerHTML =
    '<thead><tr><th>Large end NPS</th><th>Length H</th></tr></thead><tbody>' +
    Object.keys(T.REDUCER_H).map((k) =>
      '<tr><td><strong>' + k + '"</strong></td><td class="dimcell">' + M.formatFraction(T.REDUCER_H[k]) + '</td></tr>'
    ).join('') + '</tbody>';
  $('ref-flange-table').innerHTML =
    '<thead><tr><th>NPS</th><th>Flange OD</th><th>Bolt circle</th><th>Bolts</th><th>Bolt dia</th></tr></thead><tbody>' +
    T.FLANGE150.map((f) =>
      '<tr><td><strong>' + f.nps + '"</strong></td><td>' + M.formatFraction(f.flangeOd) + '</td><td>' + M.formatFraction(f.boltCircle) +
      '</td><td>' + f.bolts + '</td><td class="dimcell">' + M.formatFraction(f.boltDia) + '</td></tr>'
    ).join('') + '</tbody>';
}
function calcRefIn() {
  const v = M.parseMeasurement($('ref-in').value);
  if (isNaN(v)) { $('ref-in-frac').textContent = '—'; $('ref-in-mm').textContent = '—'; return; }
  $('ref-in-frac').textContent = M.formatFraction(v);
  $('ref-in-mm').textContent = num(M.inchesToMm(v)) + ' mm';
}
function calcRefMm() {
  const mm = M.parseMeasurement($('ref-mm').value); // plain number of millimeters
  if (isNaN(mm)) { $('ref-mm-in').textContent = '—'; $('ref-mm-frac').textContent = '—'; return; }
  const inches = M.mmToInches(mm);
  $('ref-mm-in').textContent = num(inches, 4) + '"';
  $('ref-mm-frac').textContent = M.formatFraction(inches);
}
// slope: whichever box was edited drives; the other two are rewritten in
// place. Programmatic .value writes don't fire input events, so no loop.
function calcRefSlope(source) {
  const src = source || 'inft';
  const raw = src === 'deg' ? parseFloat($('ref-slope-deg').value)
    : src === 'pct' ? parseFloat($('ref-slope-pct').value)
    : M.parseMeasurement($('ref-slope-inft').value);
  if (isNaN(raw)) return;
  const s = M.slope(src === 'deg' ? { degrees: raw } : src === 'pct' ? { percent: raw } : { inPerFt: raw });
  if (!s) return;
  if (src !== 'inft') $('ref-slope-inft').value = num(s.inPerFt, 4);
  if (src !== 'deg') $('ref-slope-deg').value = num(s.degrees, 4);
  if (src !== 'pct') $('ref-slope-pct').value = num(s.percent, 4);
}
function calcReference() { calcRefIn(); calcRefMm(); calcRefSlope('inft'); }

// ---------- saved calcs ----------
const KEY = 'pipeDemoSaved';
function saved() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
function renderSaved() {
  const list = saved();
  $('saved-empty').style.display = list.length ? 'none' : 'block';
  $('saved-list').innerHTML = '';
  list.forEach((it, i) => {
    const li = document.createElement('li');
    li.innerHTML = '<span><strong>' + it.name + '</strong><br>' + it.summary + '</span>';
    const del = document.createElement('button');
    del.textContent = '✕'; del.title = 'Delete';
    del.addEventListener('click', () => { const l = saved(); l.splice(i, 1); localStorage.setItem(KEY, JSON.stringify(l)); renderSaved(); });
    li.appendChild(del);
    $('saved-list').appendChild(li);
  });
}
function saveCalc(rec) {
  if (!rec) return;
  const name = prompt('Name this calculation:', rec.kind + ' — cut ' + M.formatFraction(rec.cut)) || (rec.kind + ' — cut ' + M.formatFraction(rec.cut));
  const summary = rec.kind + ' · ' + rec.size + '" @ ' + rec.angle + '° · cut ' + M.formatFraction(rec.cut) + ' · travel ' + M.formatFraction(rec.travel);
  const l = saved(); l.unshift({ name, summary }); localStorage.setItem(KEY, JSON.stringify(l.slice(0, 50))); renderSaved();
}
function saveText(summary) {
  if (!summary) return;
  const name = prompt('Name this calculation:', summary) || summary;
  const l = saved(); l.unshift({ name, summary }); localStorage.setItem(KEY, JSON.stringify(l.slice(0, 50))); renderSaved();
}
$('s-save').addEventListener('click', () => saveCalc(lastSimple));
$('r-save').addEventListener('click', () => saveCalc(lastRolling));
$('p-save').addEventListener('click', () => saveCalc(lastParallel));
$('m-save').addEventListener('click', () => saveText(lastMiterSummary));
$('sd-save').addEventListener('click', () => saveText(lastSaddleSummary));
$('c-save').addEventListener('click', () => saveText(lastCentersSummary));
$('rd-save').addEventListener('click', () => saveText(lastReducersSummary));

// ---------- PWA: offline shell for field dead zones ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is a bonus, never a blocker */ });
  });
}

fillSmallSizes(); calcSimple(); calcRolling(); calcParallel(); calcMiter(); calcSaddle(); calcCenters(); calcReducers(); calcData(); buildReference(); calcReference(); renderSaved();

// Brand splash: the wordmark is drawn on by an electric arc (per-path stroke
// draw with staggered timing), the fill floods in, then PIPE LAYOUT strikes
// on like a neon sign. Tap dismisses; hard fallbacks so it can never sit on
// top of the tools. Reduced-motion users get the static mark, briefly.
(() => {
  const s = document.getElementById('splash');
  if (!s) return;
  let gone = false;
  const kill = () => {
    if (gone) return;
    gone = true;
    s.classList.add('splash-hide');
    setTimeout(() => s.remove(), 500);
  };
  s.addEventListener('click', kill);
  const svg = document.getElementById('splash-svg');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (svg && !reduced) {
    const paths = svg.querySelectorAll('path');
    paths.forEach((p) => {
      const L = p.getTotalLength();
      p.style.strokeDasharray = L;
      p.style.strokeDashoffset = L;
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      s.classList.add('play');
      paths.forEach((p, i) => {
        const d = i * 35;
        p.style.transition = `stroke-dashoffset .75s ${d}ms ease-in-out, fill-opacity .5s ${d + 550}ms ease, stroke-opacity .4s 2000ms ease`;
        p.style.strokeDashoffset = '0';
        p.style.fillOpacity = '1';
        p.style.strokeOpacity = '0';
      });
    }));
    window.addEventListener('load', () => setTimeout(kill, 2500));
    setTimeout(kill, 4200);
  } else {
    if (svg) svg.querySelectorAll('path').forEach((p) => { p.style.fillOpacity = '1'; p.style.stroke = 'none'; });
    const app = s.querySelector('.splash-app');
    if (app) app.style.opacity = '1';
    window.addEventListener('load', () => setTimeout(kill, 900));
    setTimeout(kill, 3000);
  }
})();
