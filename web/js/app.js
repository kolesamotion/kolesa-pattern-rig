import { DEFAULTS, VARIANTS, LIMITS, buildSVG, buildGhostSVG, scaleFactor } from './pattern.js?v=__V__';
import { T, LANGS } from './i18n.js?v=__V__';
import { ICONS } from './icons.js?v=__V__';

const $ = (id) => document.getElementById(id);

// Aspect-ratio stops of the format slider (Figma Temp 21:8904), portrait → landscape.
const RATIOS = [[9, 16], [2, 3], [3, 4], [1, 1], [4, 3], [3, 2], [16, 9]];
// Brand colours (Brand guidelines 14:65). #005EFF = #0065DB hard-light over #0077FF, flattened.
const RING_COLORS = ['#005EFF', '#0065DB', '#0077FF', '#004799', '#001833', '#C2DEFF', '#FFFFFF'];
const BG_COLORS = ['#0077FF', '#FFFFFF', '#001833', '#1D2129', '#C2DEFF'];
const GRADS = [
  { c: ['#0023A6', '#0042FF', '#0023A6'], a: 45 },   // Figma 20:2276, state A
  { c: ['#004FFF', '#0042FF', '#0023A6'], a: 90 },   // Figma 20:2255, state B
  { c: ['#1F89FF', '#0077FF', '#0065DB'], a: 90 },   // brand gradient 1 (14:118)
  { c: ['#85BEFF', '#0077FF', '#0056B8'], a: 90 },   // brand gradient 2
  { c: ['#C2DEFF', '#61ACFF', '#0077FF'], a: 90 },   // brand gradient 3
];
const UNITS = { shift: '', step: 'px', thickness: 'px', gap: '°', twist: '°', r0: 'px', draw: '%', dropout: '%', scale: '%', gradAngle: '°', rotX: '°', rotY: '°', rotZ: '°', camDist: 'px' };
const NUM_KEYS = ['rings', 'shift', 'step', 'thickness', 'gap', 'twist', 'r0', 'skip', 'draw', 'dropout', 'seed', 'gradAngle', 'width', 'height', 'cx', 'cy', 'scale', 'rotX', 'rotY', 'rotZ', 'camDist', 'panX', 'panY'];
// Geometry section (incl. «Дополнительно»); 3D mode and camera are kept.
const GEOM_KEYS = ['rings', 'shift', 'step', 'thickness', 'gap', 'twist', 'variation', 'r0', 'skip', 'draw', 'dropout', 'seed', 'core'];
const BOOL_KEYS = ['core', 'variation', 'threeD', 'gradient', 'bgOn'];
const STR_KEYS = ['variant', 'ringColor', 'bgColor', 'scaleMode'];

let state = structuredClone(DEFAULTS);
let lang = 'ru';
const CAM_KEYS = ['rotX', 'rotY', 'camDist'];
const sliders = {};

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const t = (k) => (T[lang] && T[lang][k]) || T.ru[k] || k;

// ---------- state <-> URL ----------
function toQuery(s) {
  const p = new URLSearchParams();
  for (const k of NUM_KEYS) p.set(k, String(+(+s[k]).toFixed(4)));
  for (const k of BOOL_KEYS) p.set(k, s[k] ? '1' : '0');
  for (const k of STR_KEYS) p.set(k, s[k]);
  p.set('grad', s.grad.join(','));
  return p.toString();
}
function fromQuery(q) {
  const p = new URLSearchParams(q);
  const s = structuredClone(DEFAULTS);
  for (const k of NUM_KEYS) if (p.has(k) && !isNaN(+p.get(k))) s[k] = +p.get(k);
  for (const k of BOOL_KEYS) if (p.has(k)) s[k] = p.get(k) === '1';
  for (const k of STR_KEYS) if (p.has(k)) s[k] = p.get(k);
  if (p.has('grad')) { const g = p.get('grad').split(','); if (g.length === 3) s.grad = g; }
  return clampAll(s);
}
function clampAll(s) {
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) if (k in s) s[k] = Math.min(hi, Math.max(lo, s[k]));
  s.width = Math.min(20000, Math.max(16, Math.round(s.width)));
  s.height = Math.min(20000, Math.max(16, Math.round(s.height)));
  s.cx = Math.min(2, Math.max(-1, s.cx)); s.cy = Math.min(2, Math.max(-1, s.cy));
  return s;
}

// ---------- UI builders ----------
function makeSlider(parent, key, labelKey) {
  const [min, max, step] = LIMITS[key];
  const el = document.createElement('div');
  el.className = 'slider';
  el.innerHTML = `<div class="name"><label class="kds-label" data-t="${labelKey}"></label><span class="unit">${UNITS[key] || ''}</span></div>` +
    `<input type="range" min="${min}" max="${max}" step="${step}"><input class="kds-input" type="number" min="${min}" max="${max}" step="${step}">`;
  parent.appendChild(el);
  const [range, num] = el.querySelectorAll('input');
  const onInput = (v) => { state[key] = Math.min(max, Math.max(min, +v)); update(); };
  range.addEventListener('input', () => onInput(range.value));
  num.addEventListener('change', () => onInput(num.value));
  sliders[key] = { range, num };
}

function swatches(parent, colors, key, cls = '') {
  parent.innerHTML = '';
  for (const c of colors) {
    const b = document.createElement('button');
    b.className = 'sw ' + cls; b.style.background = c; b.title = c; b.dataset.c = c;
    b.addEventListener('click', () => { state[key] = c; update(); });
    parent.appendChild(b);
  }
}

function buildUI() {
  document.querySelectorAll('i[data-icon]').forEach((i) => { i.outerHTML = ICONS[i.dataset.icon] || ''; });
  $('themeBtn').addEventListener('click', toggleTheme);
  // Ctrl/Cmd + C anywhere copies the SVG, like "Copy for Figma" — unless text is selected in a field or on the page.
  document.addEventListener('copy', (e) => {
    const a = document.activeElement;
    const fieldSel = a && /INPUT|TEXTAREA/.test(a.tagName) && a.selectionStart !== a.selectionEnd && a.type !== 'number';
    const pageSel = String(window.getSelection() || '').length > 0;
    if (fieldSel || pageSel) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', buildSVG(state));
    toast(t('copied'));
  });
  window.addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'd' || e.key === 'в' || e.code === 'KeyD') toggleTheme();
  });
  // languages
  for (const l of LANGS) {
    const b = document.createElement('button');
    b.className = 'kds-tabs__trigger'; b.textContent = l === 'kk' ? 'kz' : l; b.dataset.l = l;
    b.addEventListener('click', () => { lang = l; store.set('kp.lang', l); applyLang(); });
    $('langs').appendChild(b);
  }
  // variants
  for (const v of Object.keys(VARIANTS)) {
    const b = document.createElement('button');
    b.className = 'kds-tabs__trigger'; b.dataset.v = v; b.dataset.t = 'v_' + v;
    b.addEventListener('click', () => { Object.assign(state, VARIANTS[v], { variant: v }); update(); });
    $('variants').appendChild(b);
  }
  // format: aspect-ratio slider keeps the long side; width/height fields update live both ways
  $('ratio').addEventListener('input', (e) => {
    const [a, b] = RATIOS[+e.target.value], L = Math.max(state.width, state.height);
    if (a >= b) { state.width = L; state.height = Math.round(L * b / a); }
    else { state.height = L; state.width = Math.round(L * a / b); }
    syncFormat(); update();
  });
  for (const k of ['width', 'height']) {
    $(k).addEventListener('input', (e) => {
      const v = Math.round(+e.target.value);
      if (v >= 16 && v <= 20000) { state[k] = v; syncFormat(); update(); }
    });
    $(k).addEventListener('change', (e) => { state[k] = +e.target.value || state[k]; clampAll(state); update(); });
  }

  for (const k of ['rings', 'step', 'thickness', 'gap', 'twist']) makeSlider($('geomSliders'), k, k);
  // Shift is a switch (0 ↔ 1); the change is animated, ease-in-out 300 ms.
  $('shiftOn').addEventListener('change', (e) => animateShift(e.target.checked ? 1 : 0));
  for (const k of ['r0', 'skip', 'draw', 'dropout', 'seed']) makeSlider($('advSliders'), k, k);
  for (const k of CAM_KEYS) makeSlider($('camSliders'), k, k);
  makeSlider($('scaleSlider'), 'scale', 'scale');
  makeSlider($('scaleSlider'), 'rotZ', 'rotZ');
  makeSlider($('angleSlider'), 'gradAngle', 'angle');

  for (const k of BOOL_KEYS) $(k).addEventListener('change', (e) => { state[k] = e.target.checked; update(); });
  $('scaleMode').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => switchScaleMode(b.dataset.v)));
  $('resetGeom').addEventListener('click', () => {
    for (const k of GEOM_KEYS) state[k] = DEFAULTS[k];
    update(); toast(t('resetGeomDone'));
  });
  $('resetCam').addEventListener('click', () => { for (const k of [...CAM_KEYS, 'rotZ', 'panX', 'panY']) state[k] = DEFAULTS[k]; update(); });
  $('centerBtn').addEventListener('click', () => { state.cx = 0.5; state.cy = 0.5; update(); });

  swatches($('ringSw'), RING_COLORS, 'ringColor');
  swatches($('bgSw'), BG_COLORS, 'bgColor');
  $('ringColor').addEventListener('input', (e) => { state.ringColor = e.target.value.toUpperCase(); update(); });
  $('bgColor').addEventListener('input', (e) => { state.bgColor = e.target.value.toUpperCase(); update(); });
  const gs = $('gradSw');
  GRADS.forEach((g) => {
    const b = document.createElement('button');
    b.className = 'sw'; b.style.background = `linear-gradient(${g.a + 90}deg, ${g.c.join(',')})`;
    b.addEventListener('click', () => { state.grad = [...g.c]; state.gradAngle = g.a; state.gradient = true; update(); });
    gs.appendChild(b);
  });
  ['g0', 'g1', 'g2'].forEach((id, i) => $(id).addEventListener('input', (e) => { state.grad[i] = e.target.value.toUpperCase(); update(); }));

  $('savePreset').addEventListener('click', savePreset);
  $('copyBtn').addEventListener('click', copySVG);
  $('downloadBtn').addEventListener('click', downloadSVG);
  $('shareBtn').addEventListener('click', shareLink);
  for (const id of ['resetTop']) $(id).addEventListener('click', () => { state = structuredClone(DEFAULTS); update(); toast(t('resetDone')); });

  setupDrag();
  setupResizer();
  new ResizeObserver(fitFrame).observe($('stage'));
}

// Design system: light / dark via data-theme on <html>; key D toggles (as in Kolesa services).
function applyTheme(th) { document.documentElement.dataset.theme = th; }
function toggleTheme() {
  const th = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(th); store.set('kp.theme', th);
}

// Keep the on-screen size of the pattern when switching scale modes.
function switchScaleMode(mode) {
  if (mode === state.scaleMode) return;
  const rel = state.width * 0.116 / 72;
  state.scale = mode === 'abs' ? state.scale * rel : state.scale / rel;
  state.scaleMode = mode;
  clampAll(state); update();
}

function applyLang() {
  document.documentElement.lang = lang === 'kk' ? 'kk' : lang;
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('[data-t-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.tAria)); el.title = t(el.dataset.tAria); });
  $('presetName').placeholder = t('presetName');
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  $('copyHint').innerHTML = `<kbd>${mod} + C</kbd> ${t('k_copyAny')}`;
  document.title = t('title');
  $('langs').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.l === lang));
  const rows = [
    ['k_orbit', 'ЛКМ'], ['k_roll', `${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'} + ЛКМ`], ['k_pan', 'СКМ'], ['k_dolly', 'ПКМ'],
    ['k_dolly', lang === 'en' ? 'Wheel' : lang === 'kk' ? 'Дөңгелек' : 'Колесо'], ['k_frame', 'H'],
  ];
  const mb = lang === 'en' ? { 'ЛКМ': 'LMB', 'СКМ': 'MMB', 'ПКМ': 'RMB' } : lang === 'kk' ? { 'ЛКМ': 'СТБ', 'СКМ': 'ОТБ', 'ПКМ': 'ОңТБ' } : {};
  const tr = (x) => x.replace(/ЛКМ|СКМ|ПКМ/g, (m) => mb[m] || m);
  $('camKeys').innerHTML = rows.map(([k, a, b]) =>
    `<li><span>${t(k)}</span><span><kbd>${tr(a)}</kbd>${b ? ` ${t('k_or')} <kbd>${tr(b)}</kbd>` : ''}</span></li>`).join('');
  renderPresets();
}

// ---------- render ----------
let shiftRaf = 0, shiftTarget = null;
function animateShift(to) {
  cancelAnimationFrame(shiftRaf);
  const from = state.shift, t0 = performance.now(), D = 300;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);   // ease-in-out
  shiftTarget = to;
  let last = from;
  const step = (now) => {
    if (state.shift !== last) { shiftRaf = 0; shiftTarget = null; update(); return; }   // changed elsewhere (reset, variant)
    const t = Math.min(1, (now - t0) / D);
    state.shift = last = from + (to - from) * ease(t);
    if (t < 1) { shiftRaf = requestAnimationFrame(step); render(); }
    else { state.shift = to; shiftRaf = 0; shiftTarget = null; update(); }
  };
  shiftRaf = requestAnimationFrame(step);
}

let hashTimer, renderRaf = 0, fitKey = '';
// Batches all changes into one render per animation frame (high-rate mice fire many events per frame).
function update() { if (!renderRaf) renderRaf = requestAnimationFrame(render); }
function render() {
  cancelAnimationFrame(renderRaf); renderRaf = 0;
  const s = state;
  $('frame').innerHTML = buildSVG(s);
  for (const [k, { range, num }] of Object.entries(sliders)) {
    const v = +(+s[k]).toFixed(2);
    if (document.activeElement !== num) num.value = v;
    range.value = v;
  }
  for (const k of BOOL_KEYS) $(k).checked = !!s[k];
  $('shiftOn').checked = shiftTarget != null ? shiftTarget === 1 : s.shift > 0;
  syncFormat();
  $('variants').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.v === s.variant));
  $('scaleMode').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.v === s.scaleMode));
  $('ringSw').querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.c === s.ringColor.toUpperCase()));
  $('bgSw').querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.c === s.bgColor.toUpperCase()));
  $('ringColor').value = s.ringColor; $('bgColor').value = s.bgColor;
  ['g0', 'g1', 'g2'].forEach((id, i) => { $(id).value = s.grad[i]; });
  $('gradBox').classList.toggle('show', s.gradient);
  $('cameraSec').classList.toggle('show', s.threeD);
  $('sizeLabel').textContent = `${s.width} × ${s.height}`;
  if (fitKey !== s.width + 'x' + s.height) fitFrame();   // stage resizes are handled by the ResizeObserver
  else renderGhost();
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => history.replaceState(null, '', '#' + toQuery(state)), 250);
}

// Panel width: drag the panel's left edge (double-click = default), arrows when focused. Saved per viewer.
// While dragging, updates are batched to one per animation frame, and the frame is only
// CSS-scaled (no SVG re-render / re-layout); the real fit happens on release.
const PANEL_W = [300, 720, 380];
let resizing = null;   // { k0, w0, h0 } while the handle is dragged
function clampPanelW(w) {
  return Math.round(Math.max(PANEL_W[0], Math.min(Math.min(PANEL_W[1], window.innerWidth - 320), w)));
}
function setPanelW(w, save = true) {
  w = clampPanelW(w);
  document.querySelector('.app').style.setProperty('--panel-w', w + 'px');
  if (save) store.set('kp.panelW', w);
  return w;
}
function setupResizer() {
  const el = $('resizer');
  let w = setPanelW(store.get('kp.panelW', PANEL_W[2]), false);
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    el.classList.add('on'); document.body.classList.add('resizing');
    const fr = $('frame');
    resizing = { w0: fr.offsetWidth, h0: fr.offsetHeight };
    const x0 = e.clientX, wStart = w;
    let raf = 0, target = w;
    const apply = () => {
      raf = 0; w = setPanelW(target, false);
      const k = fitScale();
      fr.style.transform = `scale(${Math.min(k * state.width / resizing.w0, 999)})`;
    };
    const move = (ev) => { target = wStart + (x0 - ev.clientX); if (!raf) raf = requestAnimationFrame(apply); };
    const up = () => {
      if (raf) { cancelAnimationFrame(raf); apply(); }
      el.classList.remove('on'); document.body.classList.remove('resizing');
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      resizing = null; fr.style.transform = ''; store.set('kp.panelW', w); fitFrame();
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
  el.addEventListener('dblclick', () => { w = setPanelW(PANEL_W[2]); });
  el.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowLeft' ? 20 : e.key === 'ArrowRight' ? -20 : 0;
    if (d) { e.preventDefault(); w = setPanelW(w + d); }
  });
  window.addEventListener('resize', () => { w = setPanelW(w, false); });
}

// Format controls from state: fields (unless being typed in), slider stop, proportion icon, ratio text.
function syncFormat() {
  const s = state, ae = document.activeElement;
  if (ae !== $('width')) $('width').value = s.width;
  if (ae !== $('height')) $('height').value = s.height;
  const r = s.width / s.height;
  let best = 0;
  RATIOS.forEach(([a, b], i) => { if (Math.abs(Math.log(a / b / r)) < Math.abs(Math.log(RATIOS[best][0] / RATIOS[best][1] / r))) best = i; });
  if (ae !== $('ratio')) $('ratio').value = best;
  const g = gcd(s.width, s.height), a = s.width / g, b = s.height / g;
  $('ratioText').textContent = a <= 99 && b <= 99 ? `${a}:${b}` : r >= 1 ? `${+r.toFixed(2)}:1` : `1:${+(1 / r).toFixed(2)}`;
  const i = $('ratioIcon').firstElementChild;
  i.style.width = (r >= 1 ? 22 : Math.max(5, 22 * r)) + 'px';
  i.style.height = (r >= 1 ? Math.max(5, 22 / r) : 22) + 'px';
}
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }

function fitScale() {
  const st = $('stage');
  const pad = window.innerWidth <= 760 ? 32 : 80;
  const aw = st.clientWidth - pad, ah = st.clientHeight - pad - 20;
  return Math.min(aw / state.width, ah / state.height);
}

function fitFrame() {
  if (resizing) return;   // panel drag in progress: frame is CSS-scaled until release
  const fr = $('frame');
  fitKey = state.width + 'x' + state.height;
  const k = fitScale();
  fr.style.width = Math.max(1, state.width * k) + 'px';
  fr.style.height = Math.max(1, state.height * k) + 'px';
  const st = $('stage');
  ghostGeo = { k, sw: st.clientWidth, sh: st.clientHeight };
  renderGhost();
}

// Preview only: the pattern continued outside the format in a neutral, low-contrast colour.
// Lies under the frame and covers the whole stage; never part of the export.
let ghostGeo = null;
function renderGhost() {
  if (!ghostGeo) return;
  const { k, sw, sh } = ghostGeo;
  const left = (sw - state.width * k) / 2, top = (sh - state.height * k) / 2;
  $('ghost').innerHTML = buildGhostSVG(state, -left / k, -top / k, sw / k, sh / k);
}

// Navigation. Both modes: Ctrl/Cmd+LMB (or +wheel) rotation Z. 3D: LMB orbit, MMB pan, RMB drag / wheel dolly, H = frame. 2D: LMB / MMB move the pattern.
function setupDrag() {
  const fr = $('frame');
  let start = null;
  const typing = () => /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '');
  window.addEventListener('keydown', (e) => {
    if (typing() || e.metaKey || e.ctrlKey) return;
    if ((e.key === 'h' || e.key === 'H' || e.code === 'KeyH') && state.threeD) { frameAll(); e.preventDefault(); }
  });
  fr.addEventListener('contextmenu', (e) => { if (state.threeD || e.ctrlKey) e.preventDefault(); });
  fr.addEventListener('auxclick', (e) => e.preventDefault());
  fr.addEventListener('pointerdown', (e) => {
    // 3D: LMB orbit, MMB pan, RMB dolly. 2D: LMB and MMB move the pattern.
    let mode;
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) mode = 'roll';   // both modes: rotation Z
    else if (state.threeD) mode = ['orbit', 'pan', 'dolly'][e.button];
    else mode = e.button === 0 || e.button === 1 ? 'move' : null;
    if (!mode) return;
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY, mode, s: { ...state } };
    fr.setPointerCapture(e.pointerId); fr.classList.add('drag', 'c4d-' + mode);
  });
  fr.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y, s0 = start.s;
    const px = state.width / fr.clientWidth;               // screen px -> frame px
    const toLocal = px / scaleFactor(state);               // screen px -> pattern units
    const wrap = (a) => ((a + 540) % 360) - 180;
    if (start.mode === 'roll') {
      state.rotZ = wrap(s0.rotZ + dx * 0.4);
    } else if (start.mode === 'orbit') {
      state.rotY = wrap(s0.rotY + dx * 0.4);
      state.rotX = wrap(s0.rotX - dy * 0.4);
    } else if (start.mode === 'pan') {
      state.panX = s0.panX + dx * toLocal;
      state.panY = s0.panY + dy * toLocal;
    } else if (start.mode === 'dolly') {
      state.camDist = s0.camDist * Math.exp(-(dx - dy) * 0.004);
    } else {
      state.cx = s0.cx + dx / fr.clientWidth;
      state.cy = s0.cy + dy / fr.clientHeight;
    }
    clampAll(state); update();
  });
  const end = () => { start = null; fr.className = 'frame'; };
  fr.addEventListener('pointerup', end); fr.addEventListener('pointercancel', end);
  fr.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) state.rotZ = ((state.rotZ - e.deltaY * 0.1 + 540) % 360) - 180;   // 3D + Ctrl/Cmd: roll
    else if (state.threeD) state.camDist = state.camDist * Math.exp(e.deltaY * 0.0015);   // 3D: dolly
    else state.scale = state.scale * Math.exp(-e.deltaY * 0.0015);                   // 2D: scale
    clampAll(state); update();
  }, { passive: false });
}

// H: keep the angle, reset pan and dolly so the pattern sits in frame as at the start.
function frameAll() {
  state.panX = 0; state.panY = 0; state.camDist = DEFAULTS.camDist;
  update();
}

// ---------- export ----------
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}
async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove(); return ok;
  }
}
async function copySVG() { toast((await copyText(buildSVG(state))) ? t('copied') : t('copyFail')); }
async function shareLink() {
  const url = location.href.split('#')[0] + '#' + toQuery(state);
  toast((await copyText(url)) ? t('linkCopied') : t('copyFail'));
}
function downloadSVG() {
  const blob = new Blob([buildSVG(state)], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kolesa-pattern-${state.variant}-${state.width}x${state.height}.svg`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- presets ----------
function renderPresets() {
  const list = $('presetList'); list.innerHTML = '';
  const presets = store.get('kp.presets', []);
  if (!presets.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = t('noPresets'); list.appendChild(li); return; }
  presets.forEach((p, i) => {
    const li = document.createElement('li');
    const a = document.createElement('button'); a.className = 'kds-btn kds-btn--ghost kds-btn--size-sm apply'; a.textContent = p.name;
    a.addEventListener('click', () => { state = fromQuery(p.q); update(); });
    const d = document.createElement('button'); d.className = 'kds-btn kds-btn--ghost kds-btn--size-icon-sm';
    d.innerHTML = ICONS.trash; d.setAttribute('aria-label', t('del')); d.title = t('del');
    d.addEventListener('click', () => { const ps = store.get('kp.presets', []); ps.splice(i, 1); store.set('kp.presets', ps); renderPresets(); });
    li.append(a, d); list.appendChild(li);
  });
}
function savePreset() {
  const name = $('presetName').value.trim() || `${t('v_' + state.variant)} ${state.width}×${state.height}`;
  const ps = store.get('kp.presets', []);
  ps.unshift({ name, q: toQuery(state) });
  store.set('kp.presets', ps.slice(0, 50));
  $('presetName').value = '';
  renderPresets(); toast(t('saved'));
}

// ---------- init ----------
applyTheme(store.get('kp.theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
lang = store.get('kp.lang', 'ru');
if (!LANGS.includes(lang)) lang = 'ru';
if (location.hash.length > 1) state = fromQuery(location.hash.slice(1));
buildUI();
applyLang();
update();
