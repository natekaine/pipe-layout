// Pipe + fitting data tables.
// Sources:
//  - Elbow center-to-end (take-out): ASME B16.9-2018, Table 6.1-1,
//    Dimensions of Long Radius Elbows (cross-checked against two published
//    reproductions of that table, Oct 25 2026). B16.9 publishes 90 and 45
//    degree only; other angles are approximations (see pipeMath.takeout).
//  - Short-radius 90 center-to-end (sr90): ASME B16.9 short-radius table
//    (SR elbows also covered by ASME B16.28). A = 1 x NPS exactly for
//    NPS 1 and up (6" SR 90 = 6.00"). Cross-checked against three published
//    reproductions of the table, Oct 26 2026. B16.9 publishes NO SR 90
//    below NPS 1, so sr90 is null for 1/2 and 3/4 — the UI disables SR
//    there rather than inventing a number. B16.9 does not publish an
//    SR 45 center-to-end in this table set, so SR at angles other than
//    90 is an approximation (see pipeMath.takeout).
//  - Pipe OD / wall / ID / weight: ASME B36.10M carbon steel, Sch 40 / Sch 80.
//  - Flange bolt-up (FLANGE150 below): ASME B16.5 Class 150 drilling —
//    flange OD (O), bolt circle (W), bolt count, bolt diameter. These
//    drilling dims are shared by every Class 150 flange type of a size.
//    Every row cross-checked Oct 26 2026 against three published
//    reproductions of the B16.5 table: Engineering ToolBox "ASME/ANSI
//    B16.5 Flanges and Bolt Dimensions", Hydraulic Insight "Pipe Flange
//    Size Chart", and Eastern Steels "Flange Dimensions Chart"; a fourth
//    (cballast, "ASME B16.5 Class 150 Flange Dimensions") agrees on every
//    size it lists.
// Demo data: verify against the fitting in your hand before cutting.
(function (root) {
  'use strict';
  // nps: label, od (in), lr90 A (in), lr45 B (in), sr90 A (in, null = not published),
  // sch40: [wall, id, wt/ft], sch80: [wall, id, wt/ft]
  const PIPE = [
    { nps: '1/2',   od: 0.840,  a90: 1.50, b45: 0.62, sr90: null, sch40: [0.109, 0.622, 0.85],  sch80: [0.147, 0.546, 1.09] },
    { nps: '3/4',   od: 1.050,  a90: 1.50, b45: 0.75, sr90: null, sch40: [0.113, 0.824, 1.13],  sch80: [0.154, 0.742, 1.47] },
    { nps: '1',     od: 1.315,  a90: 1.50, b45: 0.88, sr90: 1.00, sch40: [0.133, 1.049, 1.68],  sch80: [0.179, 0.957, 2.17] },
    { nps: '1-1/4', od: 1.660,  a90: 1.88, b45: 1.00, sr90: 1.25, sch40: [0.140, 1.380, 2.27],  sch80: [0.191, 1.278, 2.99] },
    { nps: '1-1/2', od: 1.900,  a90: 2.25, b45: 1.12, sr90: 1.50, sch40: [0.145, 1.610, 2.72],  sch80: [0.200, 1.500, 3.63] },
    { nps: '2',     od: 2.375,  a90: 3.00, b45: 1.38, sr90: 2.00, sch40: [0.154, 2.067, 3.65],  sch80: [0.218, 1.939, 5.02] },
    { nps: '2-1/2', od: 2.875,  a90: 3.75, b45: 1.75, sr90: 2.50, sch40: [0.203, 2.469, 5.79],  sch80: [0.276, 2.323, 7.66] },
    { nps: '3',     od: 3.500,  a90: 4.50, b45: 2.00, sr90: 3.00, sch40: [0.216, 3.068, 7.58],  sch80: [0.300, 2.900, 10.25] },
    { nps: '3-1/2', od: 4.000,  a90: 5.25, b45: 2.25, sr90: 3.50, sch40: [0.226, 3.548, 9.11],  sch80: [0.318, 3.364, 12.51] },
    { nps: '4',     od: 4.500,  a90: 6.00, b45: 2.50, sr90: 4.00, sch40: [0.237, 4.026, 10.79], sch80: [0.337, 3.826, 14.98] },
    { nps: '5',     od: 5.563,  a90: 7.50, b45: 3.12, sr90: 5.00, sch40: [0.258, 5.047, 14.62], sch80: [0.375, 4.813, 20.78] },
    { nps: '6',     od: 6.625,  a90: 9.00, b45: 3.75, sr90: 6.00, sch40: [0.280, 6.065, 18.97], sch80: [0.432, 5.761, 28.57] },
    { nps: '8',     od: 8.625,  a90: 12.00, b45: 5.00, sr90: 8.00, sch40: [0.322, 7.981, 28.55], sch80: [0.500, 7.625, 43.39] },
    { nps: '10',    od: 10.750, a90: 15.00, b45: 6.25, sr90: 10.00, sch40: [0.365, 10.020, 40.48], sch80: [0.594, 9.562, 64.43] },
    { nps: '12',    od: 12.750, a90: 18.00, b45: 7.50, sr90: 12.00, sch40: [0.406, 11.938, 53.52], sch80: [0.688, 11.374, 88.63] },
  ];
  // ASME B16.5 Class 150 flange drilling: flangeOd (O), boltCircle (W),
  // bolts (count), boltDia — all inches except the count. Rows cover exactly
  // the NPS sizes in PIPE above. Source/verification: file header comment.
  const FLANGE150 = [
    { nps: '1/2',   flangeOd: 3.50,  boltCircle: 2.375,  bolts: 4,  boltDia: 0.50 },
    { nps: '3/4',   flangeOd: 3.875, boltCircle: 2.75,   bolts: 4,  boltDia: 0.50 },
    { nps: '1',     flangeOd: 4.25,  boltCircle: 3.125,  bolts: 4,  boltDia: 0.50 },
    { nps: '1-1/4', flangeOd: 4.625, boltCircle: 3.50,   bolts: 4,  boltDia: 0.50 },
    { nps: '1-1/2', flangeOd: 5.00,  boltCircle: 3.875,  bolts: 4,  boltDia: 0.50 },
    { nps: '2',     flangeOd: 6.00,  boltCircle: 4.75,   bolts: 4,  boltDia: 0.625 },
    { nps: '2-1/2', flangeOd: 7.00,  boltCircle: 5.50,   bolts: 4,  boltDia: 0.625 },
    { nps: '3',     flangeOd: 7.50,  boltCircle: 6.00,   bolts: 4,  boltDia: 0.625 },
    { nps: '3-1/2', flangeOd: 8.50,  boltCircle: 7.00,   bolts: 8,  boltDia: 0.625 },
    { nps: '4',     flangeOd: 9.00,  boltCircle: 7.50,   bolts: 8,  boltDia: 0.625 },
    { nps: '5',     flangeOd: 10.00, boltCircle: 8.50,   bolts: 8,  boltDia: 0.75 },
    { nps: '6',     flangeOd: 11.00, boltCircle: 9.50,   bolts: 8,  boltDia: 0.75 },
    { nps: '8',     flangeOd: 13.50, boltCircle: 11.75,  bolts: 8,  boltDia: 0.75 },
    { nps: '10',    flangeOd: 16.00, boltCircle: 14.25,  bolts: 12, boltDia: 0.875 },
    { nps: '12',    flangeOd: 19.00, boltCircle: 17.00,  bolts: 12, boltDia: 0.875 },
  ];
  function byNps(nps) { return PIPE.find((p) => p.nps === nps) || null; }
  function flange150(nps) { return FLANGE150.find((f) => f.nps === nps) || null; }
  const api = { PIPE, byNps, FLANGE150, flange150 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PipeTables = api;
})(typeof window !== 'undefined' ? window : globalThis);
