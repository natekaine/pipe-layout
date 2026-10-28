'use strict';
/* Pipe3D — tiny dependency-free 3D pipe renderer (canvas 2D).
 * Builds a spool run (stub -> elbow -> diagonal -> elbow -> stub) from real
 * dimensions, sweeps a shaded tube along the centerline, painter-sorts the
 * faces, and fills a measurement bar pinned to the top of the stage (labels
 * never float over the pipe). Drag to orbit; gentle auto-rotate until the
 * first drag. Geometry helpers are exported for Node tests. */
(function (global) {
  // ---------- vector helpers ----------
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  };

  /* Arc through a corner: incoming unit dir d1, outgoing unit dir d2, corner C,
   * bend radius R. Returns {t1, t2, points} with points sampled along the arc. */
  function elbowArc(C, d1, d2, R, steps) {
    const cos = Math.max(-1, Math.min(1, V.dot(d1, d2)));
    const theta = Math.acos(cos);
    if (theta < 1e-6) return { t1: C, t2: C, points: [C] };
    const t = R * Math.tan(theta / 2);              // corner -> tangent point distance
    const t1 = V.sub(C, V.mul(d1, t));
    const t2 = V.add(C, V.mul(d2, t));
    // turn direction (in the bend plane, perpendicular to d1, toward d2)
    const n = V.norm(V.sub(d2, V.mul(d1, cos)));
    const O = V.add(t1, V.mul(n, R));               // arc center
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const phi = (i / steps) * theta;
      // radial dir rotates from -n (at t1) toward d2's radial; p = O + R*(-n cosφ + d1 sinφ)
      const radial = V.add(V.mul(n, -Math.cos(phi)), V.mul(d1, Math.sin(phi)));
      pts.push(V.add(O, V.mul(radial, R)));
    }
    return { t1, t2, points: pts };
  }

  /* Sampled centerline with zone tags: 'stub' | 'elbow' | 'cut'.
   * corners: [P0(start), C1, C2, P3(end)] with unit dirs derived from geometry.
   * R is a cap; the actual radius shrinks so tangent points never overrun
   * the adjacent straight segments. */
  function buildCenterline(P0, C1, C2, P3, Rcap) {
    const dIn = V.norm(V.sub(C1, P0));
    const dMid = V.norm(V.sub(C2, C1));
    const dOut = V.norm(V.sub(P3, C2));
    const L1 = V.len(V.sub(C1, P0)), L2 = V.len(V.sub(C2, C1)), L3 = V.len(V.sub(P3, C2));
    const th1 = Math.acos(Math.max(-1, Math.min(1, V.dot(dIn, dMid))));
    const th2 = Math.acos(Math.max(-1, Math.min(1, V.dot(dMid, dOut))));
    let R = Rcap;
    if (th1 > 1e-6) R = Math.min(R, 0.38 * Math.min(L1, L2) / Math.tan(th1 / 2));
    if (th2 > 1e-6) R = Math.min(R, 0.38 * Math.min(L2, L3) / Math.tan(th2 / 2));
    R = Math.max(R, 0.05);
    const a1 = elbowArc(C1, dIn, dMid, R, 10);
    const a2 = elbowArc(C2, dMid, dOut, R, 10);
    const seg = (from, to, zone, n) => {
      const out = [];
      for (let i = 0; i <= n; i++) out.push({ p: V.add(from, V.mul(V.sub(to, from), i / n)), zone });
      return out;
    };
    let pts = [];
    pts = pts.concat(seg(P0, a1.t1, 'stub', 3));
    pts = pts.concat(a1.points.map((p) => ({ p, zone: 'elbow' })));
    pts = pts.concat(seg(a1.t2, a2.t1, 'cut', 8));
    pts = pts.concat(a2.points.map((p) => ({ p, zone: 'elbow' })));
    pts = pts.concat(seg(a2.t2, P3, 'stub', 3));
    // drop consecutive duplicates
    return pts.filter((s, i) => i === 0 || V.len(V.sub(s.p, pts[i - 1].p)) > 1e-9);
  }

  /* Scene for an offset: advance along +X, offset in the Y/Z plane.
   * offY = rise/set (up), offZ = roll (sideways). */
  function offsetScene(o) {
    const run = Math.max(o.run, 0.01), ty = o.offY || 0, tz = o.offZ || 0;
    const travel = Math.hypot(run, ty, tz);
    const stub = Math.max(5, travel * 0.32);
    const P0 = [-stub, 0, 0], C1 = [0, 0, 0], C2 = [run, ty, tz], P3 = [run + stub, ty, tz];
    const R = Math.min(travel * 0.24, Math.max(run, Math.hypot(ty, tz)) * 0.45 + 1);
    const centerline = buildCenterline(P0, C1, C2, P3, R);
    const mid = [run / 2, ty / 2, tz / 2];
    return {
      centerline,
      radius: o.pipeRadius,
      anchors: {
        cut: V.add(mid, [0, 0, 0]),
        travel: mid,
        offsetStart: [-stub * 0.45, 0, 0],
        offsetEnd: [run + stub * 0.45, ty, tz],
        offsetMid: [run + stub * 0.45, ty / 2, tz / 2],
      },
    };
  }

  // ---------- shading ----------
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r * f)));
    g = Math.max(0, Math.min(255, Math.round(g * f)));
    b = Math.max(0, Math.min(255, Math.round(b * f)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  const ZONE_COLORS = { stub: '#7e93a8', elbow: '#93a9bf', cut: '#f5a623' };

  // ---------- view ----------
  function makeView(canvas, labelLayer) {
    const ctx = canvas.getContext('2d');
    let az = -0.65, el = 0.42, auto = true, raf = null, scenes = [], labels = [], labelRadius = 1;
    let dragging = false, lastX = 0, lastY = 0;

    function projectFactory(w, h, center, scale) {
      const ce = Math.cos(el), se = Math.sin(el), ca = Math.cos(az), sa = Math.sin(az);
      return (p) => {
        const x = p[0] - center[0], y = p[1] - center[1], z = p[2] - center[2];
        const xr = x * ca - z * sa, zr = x * sa + z * ca;      // yaw around Y
        const yr = y * ce - zr * se, z2 = y * se + zr * ce;    // pitch around X
        return { x: w / 2 + xr * scale, y: h / 2 - yr * scale, depth: z2 };
      };
    }

    function render() {
      if (!scenes.length) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // bounds across all scenes
      let cx = 0, cy = 0, cz = 0, nPts = 0;
      scenes.forEach((sc) => sc.centerline.forEach((s) => { cx += s.p[0]; cy += s.p[1]; cz += s.p[2]; nPts++; }));
      const center = [cx / nPts, cy / nPts, cz / nPts];
      let ext = 1;
      scenes.forEach((sc) => sc.centerline.forEach((s) => {
        ext = Math.max(ext, Math.abs(s.p[0] - center[0]), Math.abs(s.p[1] - center[1]), Math.abs(s.p[2] - center[2]));
      }));
      const scale = (Math.min(w, h) * 0.40) / (ext + labelRadius * 2);
      const project = projectFactory(w, h, center, scale);

      const SIDES = 12;
      const faces = [];
      const bores = [];
      for (const sc of scenes) {
        const pts = sc.centerline;
        const rings = [];
        let normal = null;
        for (let i = 0; i < pts.length; i++) {
          const prev = pts[Math.max(0, i - 1)].p, next = pts[Math.min(pts.length - 1, i + 1)].p;
          const tan = V.norm(V.sub(next, prev));
          if (!normal) {
            const ref = Math.abs(tan[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
            normal = V.norm(V.sub(ref, V.mul(tan, V.dot(ref, tan))));
          } else {
            normal = V.norm(V.sub(normal, V.mul(tan, V.dot(normal, tan))));
          }
          const bin = V.cross(tan, normal);
          const ring = [];
          for (let k = 0; k < SIDES; k++) {
            const a = (k / SIDES) * Math.PI * 2;
            const dir = V.add(V.mul(normal, Math.cos(a)), V.mul(bin, Math.sin(a)));
            ring.push({ v: project(V.add(pts[i].p, V.mul(dir, sc.radius))), n: dir });
          }
          rings.push(ring);
        }
        for (let i = 0; i < rings.length - 1; i++) {
          const zone = pts[i + 1].zone === 'cut' || pts[i].zone === 'cut' ? 'cut'
            : (pts[i + 1].zone === 'elbow' || pts[i].zone === 'elbow' ? 'elbow' : 'stub');
          for (let k = 0; k < SIDES; k++) {
            const k2 = (k + 1) % SIDES;
            const quad = [rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]];
            const depth = quad.reduce((s2, q) => s2 + q.v.depth, 0) / 4;
            const nrm = V.mul(V.add(quad[0].n, quad[2].n), 0.5);
            faces.push({ quad, depth, zone, light: 0.62 + 0.5 * Math.max(0, nrm[1] * 0.7 + nrm[0] * -0.4 + 0.35) });
          }
        }
        bores.push({ ring: rings[0], c: pts[0].p, r: sc.radius });
        bores.push({ ring: rings[rings.length - 1], c: pts[pts.length - 1].p, r: sc.radius });
      }
      faces.sort((a, b) => a.depth - b.depth);
      for (const f of faces) {
        ctx.beginPath();
        f.quad.forEach((q, j) => j ? ctx.lineTo(q.v.x, q.v.y) : ctx.moveTo(q.v.x, q.v.y));
        ctx.closePath();
        ctx.fillStyle = shade(ZONE_COLORS[f.zone], f.light);
        ctx.fill();
      }
      // open-end bores
      for (const b of bores) {
        ctx.beginPath();
        b.ring.forEach((q, j) => j ? ctx.lineTo(q.v.x, q.v.y) : ctx.moveTo(q.v.x, q.v.y));
        ctx.closePath();
        ctx.fillStyle = '#39434e'; ctx.fill();
        ctx.beginPath();
        const c = project(b.c);
        const rr = b.r * scale * 0.62;
        ctx.ellipse(c.x, c.y, rr, rr * 0.82, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0c0e'; ctx.fill();
      }
      // Labels are NOT drawn here: they live in the pinned bar at the top of
      // the stage (see setLabels), so rotating the pipe can never drag them
      // across the view or park them on top of the pipe.
    }

    function loop() {
      if (auto && !dragging) { az += 0.005; render(); }
      raf = requestAnimationFrame(loop);
    }
    canvas.addEventListener('pointerdown', (e) => { dragging = true; auto = false; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      az += (e.clientX - lastX) * 0.008;
      el = Math.max(-1.2, Math.min(1.2, el + (e.clientY - lastY) * 0.006));
      lastX = e.clientX; lastY = e.clientY; render();
    });
    let resumeTimer = null;
    canvas.addEventListener('pointerup', () => {
      dragging = false;
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { auto = true; }, 4000); // gentle resume after idle
    });
    canvas.addEventListener('pointercancel', () => { dragging = false; });

    function setLabels(lbls) {
      // Pinned bar: chips are plain flow content at the top of the stage.
      // They are set once per calculation and never move with the 3D view.
      labels = lbls || [];
      if (labelLayer) {
        labelLayer.innerHTML = '';
        labels.forEach((L) => {
          const d = document.createElement('div');
          d.className = 'tag3d' + (L.cls ? ' ' + L.cls : '');
          d.textContent = L.text;
          labelLayer.appendChild(d);
        });
      }
    }
    return {
      setScene(s, lbls) {
        scenes = [s]; labelRadius = s.radius;
        setLabels(lbls);
        render();
        if (!raf) loop();
      },
      setScenes(list, lbls) {
        scenes = list; labelRadius = list.length ? list[0].radius : 1;
        setLabels(lbls);
        render();
        if (!raf) loop();
      },
      render,
      stop() { if (raf) cancelAnimationFrame(raf); raf = null; },
    };
  }

  const api = { V, elbowArc, buildCenterline, offsetScene, makeView };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Pipe3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
