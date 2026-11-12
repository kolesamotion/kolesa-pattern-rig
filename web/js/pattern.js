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
  rotX: [-180, 180, 1],
  rotY: [-180, 180, 1],
  rotZ: [-180, 180, 1],
  camDist: [300, 20000, 10],
  panX: [-20000, 20000, 1],
  panY: [-20000, 20000, 1],
};

// Brand defaults (Figma 20:1716).
export const DEFAULTS = {
  variant: 'main',
  rings: 8, shift: 1, step: 72, thickness: 40, gap: 0, twist: 0,
  r0: 60, core: true, skip: 0, draw: 100, dropout: 0, seed: 1,
  variation: false,       // per-ring gap/angle variation (broken C-rings)
  threeD: false,          // real 3D: rings rotated in space, perspective camera
  rotX: 55, rotY: -25, rotZ: 0,   // degrees
  camDist: 2400,          // camera distance from the pattern centre, brand px (dolly)
  panX: 0, panY: 0,       // camera pan, brand px in the image plane
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
  main:     { shift: 1, gap: 0, twist: 0, variation: false, threeD: false, gradient: false, skip: 0, core: true, rings: 8, scaleMode: 'rel', scale: 100 },
  cropped:  { shift: 1, gap: 0, twist: 0, variation: false, threeD: false, gradient: false, skip: 3, core: false, rings: 9, scaleMode: 'rel', scale: 45 },
  '3d':     { shift: 1, gap: 0, twist: 0, variation: false, threeD: true,  gradient: false, skip: 0, core: true, rings: 8, rotX: 55, rotY: -25, rotZ: 0, camDist: 2400, panX: 0, panY: 0 },
  broken:   { shift: 0, gap: 120, twist: 0, variation: true, threeD: false, gradient: false, skip: 0, core: false, rings: 5, scaleMode: 'rel', scale: 60 },
  gradient: { shift: 1, gap: 0, twist: 0, variation: false, threeD: false, gradient: true,  skip: 0, core: true, rings: 8 },
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


// Ring geometry in pattern-local units (centre 0,0, before scale): a list of arcs {r, a0, a1}
// per ring (angles as in arcPath) plus the core half-disc radius.
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
    const arcs = [];
    if (half > 0.01) {
      arcs.push({ r: ru, a0: 180 + rot, a1: 180 + rot + half });
      arcs.push({ r: rl, a0: 180 + rot, a1: 180 + rot - half });
    }
    if (arcs.length) out.push({ n, arcs });
  }
  let coreR = 0;
  if (s.core && s.skip === 0 && s.shift > 0) coreR = Math.max(0, s.r0 - s.step + (s.shift * s.step) / 2 + s.thickness / 2);
  return { rings: out, coreR };
}

// 3D: the pattern lies in the plane z = 0; it is turned by rotZ (in its plane), tilted by rotX,
// turned by rotY, then seen by a perspective camera at distance camDist looking at the centre.
// The focal length is fixed (FOCAL), so moving the camera closer (dolly) both enlarges the pattern
// and strengthens perspective, like a real camera in Cinema 4D. Pan shifts the image plane.
export const FOCAL = 2400;
export function makeProjector(s) {
  const cz = Math.cos(rad(s.rotZ)), sz = Math.sin(rad(s.rotZ));
  const cx = Math.cos(rad(s.rotX)), sx = Math.sin(rad(s.rotX));
  const cy = Math.cos(rad(s.rotY)), sy = Math.sin(rad(s.rotY));
  const D = s.camDist, px = s.panX || 0, py = s.panY || 0;
  return (x, y) => {
    const x1 = x * cz - y * sz, y1 = x * sz + y * cz;
    const y2 = y1 * cx, z2 = y1 * sx;
    const x3 = x1 * cy + z2 * sy, z3 = -x1 * sy + z2 * cy;
    const w = FOCAL / Math.max(D * 0.05, D + z3);
    return [x3 * w + px, y2 * w + py];
  };
}

function sampleArc(r, a0, a1) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 2.5));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n);
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}
const poly = (pts, P) => 'M' + pts.map(([x, y]) => { const [X, Y] = P(x, y); return `${f(X)} ${f(Y)}`; }).join('L') + 'Z';

// Band of an arc as a closed outline (outer edge forward, inner edge back), projected.
function bandPath(arc, t, P) {
  const outer = sampleArc(arc.r + t / 2, arc.a0, arc.a1);
  const inner = sampleArc(Math.max(0, arc.r - t / 2), arc.a1, arc.a0);
  return poly(outer.concat(inner), P);
}

const esc = (c) => String(c).replace(/[^#0-9a-fA-F]/g, '');

export function buildSVG(s) {
  const W = s.width, H = s.height;
  const outerR = s.r0 + (s.rings - 1) * s.step + s.step / 2 + s.thickness / 2;

  let defs = '';
  let paint = esc(s.ringColor);
  if (s.gradient) {
    const a = rad(s.gradAngle);
    const dx = Math.cos(a) * outerR, dy = Math.sin(a) * outerR;
    defs = `<defs><linearGradient id="kp-grad" gradientUnits="userSpaceOnUse" x1="${f(-dx)}" y1="${f(-dy)}" x2="${f(dx)}" y2="${f(dy)}">` +
      `<stop offset="0" stop-color="${esc(s.grad[0])}"/><stop offset="0.5" stop-color="${esc(s.grad[1])}"/>` +
      `<stop offset="1" stop-color="${esc(s.grad[2])}"/></linearGradient></defs>`;
    paint = 'url(#kp-grad)';
  }

  const { body, tf } = ringsGroup(s, paint);
  const bg = s.bgOn ? `<rect id="background" width="${W}" height="${H}" fill="${esc(s.bgColor)}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">` +
    `${defs}<clipPath id="kp-clip"><rect width="${W}" height="${H}"/></clipPath>` +
    `<g id="Kolesa pattern">${bg}<g clip-path="url(#kp-clip)"><g id="rings" transform="${tf}">${body}</g></g></g></svg>`;
}

// Rings (and core) in pattern-local units plus the transform that places them in the format.
function ringsGroup(s, paint) {
  const W = s.width, H = s.height;
  const k = scaleFactor(s);
  const cx = s.cx * W, cy = s.cy * H;
  const { rings, coreR } = buildRings(s);
  let body = '';
  if (s.threeD) {
    // Projected rings are filled outlines: a stroke can't follow perspective foreshortening.
    const P = makeProjector(s);
    if (coreR > 0) body += `<path id="core" d="${poly(sampleArc(coreR, 180, 0), P)}" fill="${paint}"/>`;
    for (const r of rings) {
      body += `<path id="ring-${r.n}" d="${r.arcs.map((a) => bandPath(a, s.thickness, P)).join('')}" fill="${paint}"/>`;
    }
  } else {
    if (coreR > 0) body += `<path id="core" d="M${f(-coreR)} 0A${f(coreR)} ${f(coreR)} 0 0 0 ${f(coreR)} 0Z" fill="${paint}"/>`;
    const sw = f(s.thickness);
    for (const r of rings) {
      body += `<path id="ring-${r.n}" d="${r.arcs.map((a) => arcPath(a.r, a.a0, a.a1)).join(' ')}" stroke="${paint}" stroke-width="${sw}" fill="none"/>`;
    }
  }

  // In 2D the pattern turns in its plane by rotZ (in 3D rotZ is part of the projection).
  const rot2d = !s.threeD && s.rotZ ? ` rotate(${f(s.rotZ)})` : '';
  const tf = `translate(${f(cx)} ${f(cy)}) scale(${f(k)})${rot2d}`;
  return { body, tf };
}

// Preview-only: the same rings drawn across a larger viewport (format px; x/y may be negative),
// in one flat colour, no background, no clipping. Shows how the pattern continues past the format.
export function buildGhostSVG(s, x, y, w, h, color = 'currentColor') {
  const { body, tf } = ringsGroup(s, color);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}" preserveAspectRatio="none" fill="none">` +
    `<g transform="${tf}">${body.replace(/ id="[^"]*"/g, '')}</g></svg>`;
}
