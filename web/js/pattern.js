// Kolesa.kz 2026 brand pattern — pure geometry + SVG builder.
// No DOM access: the same module is meant to be reused by the future Figma plugin
// (figma.createNodeFromSvg(buildSVG(state))).
//
// Geometry (brand book, Figma 20:1716; Cavalry rig Build/pattern_rig/rig.js):
//   ring n (1..N) = upper half-arc + lower half-arc around one centre.
//   upper centre-line radius  r0 + (n-1)*step
//   lower centre-line radius  r0 + (n-1)*step + shift*step/2   (signature "сдвиг")
//   core = filled lower half-disc, radius (r0 - step + shift*step/2) + thickness/2
//   Arcs grow from 9 o'clock (Draw). The pattern is never deformed.

export const LIMITS = {
  rings: [1, 20, 1],
  shift: [0, 1, 0.01],
  step: [8, 300, 1],
  thickness: [1, 200, 1],
  gap: [0, 360, 1],
  twist: [-90, 90, 1],
  r0: [0, 400, 1],
  skip: [0, 19, 1],
  draw: [0, 100, 1],
  dropout: [0, 100, 1],
  seed: [1, 999, 1],
  scale: [5, 1000, 1],
  gradAngle: [0, 360, 1],
};

// Brand defaults (Figma 20:1716).
export const DEFAULTS = {
  variant: 'main',
  rings: 8, shift: 1, step: 72, thickness: 40, gap: 0, twist: 0,
  r0: 60, core: true, skip: 0, draw: 100, dropout: 0, seed: 1,
  variation: false,       // per-ring gap/angle variation (broken C-rings)
  perspective: false,     // rotate(-20) scaleY(0.77) skewX(40)
  gradient: false,
  ringColor: '#005EFF',
  bgColor: '#0077FF',
  bgOn: true,
  grad: ['#0023A6', '#0042FF', '#0023A6'],
  gradAngle: 45,
  width: 1920, height: 1080,
  cx: 0.5, cy: 0.5,       // centre as a fraction of the frame
  scaleMode: 'rel',       // 'rel' = relative to frame width, 'abs' = % of brand px
  scale: 100,
};

// Variants = parameter presets on top of the current state.
export const VARIANTS = {
  main:        { shift: 1, gap: 0, twist: 0, variation: false, perspective: false, gradient: false, skip: 0, core: true, rings: 8, scaleMode: 'rel', scale: 100 },
  cropped:     { shift: 1, gap: 0, twist: 0, variation: false, perspective: false, gradient: false, skip: 3, core: false, rings: 9, scaleMode: 'rel', scale: 45 },
  perspective: { shift: 1, gap: 0, twist: 0, variation: false, perspective: true,  gradient: false, skip: 0, core: true, rings: 8 },
  broken:      { shift: 0, gap: 120, twist: 0, variation: true, perspective: false, gradient: false, skip: 0, core: false, rings: 5, scaleMode: 'rel', scale: 60 },
  gradient:    { shift: 1, gap: 0, twist: 0, variation: false, perspective: false, gradient: true,  skip: 0, core: true, rings: 8 },
};

// Per-ring coefficients used by the Cavalry rig for open C-rings (Figma 20:1767).
const GAP_K = [0.4, 0.8, 0.55, 0.3, 1, 0.65, 0.45, 0.9];
const ANGLE0 = [0, 135, 45, 270, 180, 90, 225, 315];

// Brand reference: in Figma 20:3150 the ring step is 11.6 % of the frame width.
const REL_STEP_OF_WIDTH = 0.116;

export function scaleFactor(s) {
  if (s.scaleMode === 'abs') return s.scale / 100;
  return (s.scale / 100) * (s.width * REL_STEP_OF_WIDTH) / 72;
}

function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (v) => (Math.round(v * 100) / 100).toString();
const rad = (d) => (d * Math.PI) / 180;

// Arc on screen coords (y down). Angles in degrees, 0 = 3 o'clock, 90 = 6 o'clock,
// 180 = 9 o'clock, 270 = 12 o'clock. Draws from a0 to a1 (either direction, |a1-a0| <= 360).
function arcPath(r, a0, a1) {
  const span = a1 - a0;
  if (Math.abs(span) < 0.01 || r <= 0) return '';
  const sweep = span > 0 ? 1 : 0;
  if (Math.abs(span) >= 359.99) {   // full circle = two halves
    const m = a0 + span / 2;
    return arcPath(r, a0, m) + ' ' + arcPath(r, m, a1).replace(/^M[^A]+/, '');
  }
  const large = Math.abs(span) > 180 ? 1 : 0;
  const x0 = r * Math.cos(rad(a0)), y0 = r * Math.sin(rad(a0));
  const x1 = r * Math.cos(rad(a1)), y1 = r * Math.sin(rad(a1));
  return `M${f(x0)} ${f(y0)}A${f(r)} ${f(r)} 0 ${large} ${sweep} ${f(x1)} ${f(y1)}`;
}

// Returns ring geometry in pattern-local units (centre at 0,0, before scale).
export function buildRings(s) {
  const rand = rng(s.seed * 9973);
  const d = Math.max(0, Math.min(100, s.draw)) / 100;
  const out = [];
  for (let n = 1; n <= s.rings; n++) {
    const hidden = rand() < s.dropout / 100;
    if (n <= s.skip || hidden) continue;
    const ru = s.r0 + (n - 1) * s.step;
    const rl = ru + (s.shift * s.step) / 2;
    const g = Math.max(0, Math.min(360, s.variation ? s.gap * GAP_K[n % 8] : s.gap));
    const rot = n * s.twist + (s.variation ? ANGLE0[n % 8] : 0);
    // Gap sits at 3 o'clock: half is cut from the upper arc, half from the lower one.
    const half = Math.max(0, 180 - g / 2) * d;
    const upper = arcPath(ru, 180 + rot, 180 + rot + half);
    const lower = arcPath(rl, 180 + rot, 180 + rot - half);
    out.push({ n, ru, rl, path: [upper, lower].filter(Boolean).join(' ') });
  }
  let core = null;
  if (s.core && s.skip === 0 && s.shift > 0) {
    const R = s.r0 - s.step + (s.shift * s.step) / 2 + s.thickness / 2;
    if (R > 0) core = `M${f(-R)} 0A${f(R)} ${f(R)} 0 0 0 ${f(R)} 0Z`;
  }
  return { rings: out, core };
}

const esc = (c) => String(c).replace(/[^#0-9a-fA-F]/g, '');

export function buildSVG(s, { forExport = true } = {}) {
  const W = s.width, H = s.height;
  const k = scaleFactor(s);
  const cx = s.cx * W, cy = s.cy * H;
  const { rings, core } = buildRings(s);
  const outerR = (s.r0 + (s.rings - 1) * s.step + s.step / 2 + s.thickness / 2);

  let defs = '';
  let stroke = esc(s.ringColor);
  if (s.gradient) {
    const a = rad(s.gradAngle);
    const dx = Math.cos(a) * outerR, dy = Math.sin(a) * outerR;
    defs = `<defs><linearGradient id="kp-grad" gradientUnits="userSpaceOnUse" x1="${f(-dx)}" y1="${f(-dy)}" x2="${f(dx)}" y2="${f(dy)}">` +
      `<stop offset="0" stop-color="${esc(s.grad[0])}"/><stop offset="0.5" stop-color="${esc(s.grad[1])}"/>` +
      `<stop offset="1" stop-color="${esc(s.grad[2])}"/></linearGradient></defs>`;
    stroke = 'url(#kp-grad)';
  }

  const persp = s.perspective ? ' rotate(-20) scale(1 0.77) skewX(40)' : '';
  const tf = `translate(${f(cx)} ${f(cy)})${persp} scale(${f(k)})`;
  const sw = f(s.thickness);
  const ringEls = rings.map((r) =>
    `<path id="ring-${r.n}" d="${r.path}" stroke="${stroke}" stroke-width="${sw}" fill="none"/>`).join('');
  const coreEl = core ? `<path id="core" d="${core}" fill="${stroke}"/>` : '';
  const bg = s.bgOn ? `<rect id="background" width="${W}" height="${H}" fill="${esc(s.bgColor)}"/>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">` +
    `${defs}<g id="Kolesa pattern">${bg}<g clip-path="url(#kp-clip)"><g id="rings" transform="${tf}">${coreEl}${ringEls}</g></g></g>` +
    `<clipPath id="kp-clip"><rect width="${W}" height="${H}"/></clipPath></svg>`;
}
