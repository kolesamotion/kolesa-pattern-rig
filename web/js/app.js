import { DEFAULTS, VARIANTS, LIMITS, buildSVG, buildGhostSVG, scaleFactor } from './pattern.js?v=__V__';
import { T, LANGS } from './i18n.js?v=__V__';
import { ICONS } from './icons.js?v=__V__';

const $ = (id) => document.getElementById(id);

// Aspect-ratio stops of the format slider (Figma Temp 21:8904), portrait → landscape.
const RATIOS = [[9, 16], [2, 3], [4, 5], [1, 1], [4, 3], [3, 2], [16, 9]];
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
const NUM_KEYS = ['rings', 'shift', 'step', 'thickness', 'gap', 'twist', 'r0', 'skip', 'draw', 'dropout', 'seed', 'gradAngle', 'width', 'height', 'cx', 'cy', 'scale', 'rotX', 'rotY', 'rotZ', 'camDist', 'panX', 'panY', 'tsRatio', 'ringOpacity', 'bgOpacity'];
// Geometry section (incl. «Дополнительно»); 3D mode and camera are kept.
const GEOM_KEYS = ['rings', 'shift', 'step', 'thickness', 'linkTS', 'tsRatio', 'gap', 'twist', 'variation', 'r0', 'skip', 'draw', 'dropout', 'seed', 'core'];
const BOOL_KEYS = ['core', 'variation', 'threeD', 'gradient', 'bgOn', 'linkTS'];
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
  if (s.gradOpacity.some((a) => a !== 100)) p.set('gradA', s.gradOpacity.join(','));
  return p.toString();
}
function fromQuery(q) {
  const p = new URLSearchParams(q);
  const s = structuredClone(DEFAULTS);
  for (const k of NUM_KEYS) if (p.has(k) && !isNaN(+p.get(k))) s[k] = +p.get(k);
  for (const k of BOOL_KEYS) if (p.has(k)) s[k] = p.get(k) === '1';
  for (const k of STR_KEYS) if (p.has(k)) s[k] = p.get(k);
  if (p.has('grad')) { const g = p.get('grad').split(','); if (g.length === 3) s.grad = g; }
  if (p.has('gradA')) { const g = p.get('gradA').split(',').map(Number); if (g.length === 3 && g.every((v) => v >= 0 && v <= 100)) s.gradOpacity = g; }
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
// Linked mode: thickness = step × tsRatio. Moving either slider moves the other.
function linkThickness(key) {
  if (!state.linkTS) return;
  const [tl, th] = LIMITS.thickness, [sl, sh] = LIMITS.step;
  if (key === 'step') state.thickness = Math.min(th, Math.max(tl, Math.round(state.step * state.tsRatio)));
  if (key === 'thickness') state.step = Math.min(sh, Math.max(sl, Math.round(state.thickness / state.tsRatio)));
}

// Slider range shorter than the field's: the field accepts up to LIMITS max.
const SLIDER_MAX = { rings: 20 };
function makeSlider(parent, key, labelKey) {
  const [min, max, step] = LIMITS[key], smax = SLIDER_MAX[key] ?? max;
  const el = document.createElement('div');
  el.className = 'slider';
  // Scrub bar (Figma Temp 36:339): label inside on the left, value on the right, fill + thin handle;
  // an invisible native range on top does the dragging/keyboard, the value is an inline number field.
  const u = UNITS[key] ? `<span class="scrubUnit">${UNITS[key]}</span>` : '';
  el.innerHTML = `<div class="scrub"><span class="scrubFill"></span><span class="scrubTicks"></span><span class="scrubThumb"></span>` +
    `<label class="name" data-t="${labelKey}"></label>` +
    `<input type="range" min="${min}" max="${smax}" step="${step}">` +
    `<span class="scrubVal"><input class="scrubNum" type="number" min="${min}" max="${max}" step="${step}">${u}</span></div>`;
  parent.appendChild(el);
  const [range, num] = el.querySelectorAll('input');
  const onInput = (v) => { state[key] = Math.min(max, Math.max(min, +v)); linkThickness(key); update(); };
  range.addEventListener('input', () => onInput(range.value));
  num.addEventListener('change', () => { onInput(num.value); num.value = +(+state[key]).toFixed(2); placeUnit(num); });   // show the clamped value
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
    const o = document.createElement('option');
    o.value = l; o.textContent = (l === 'kk' ? 'kz' : l).toUpperCase();
    $('langs').appendChild(o);
  }
  $('langs').addEventListener('change', (e) => { lang = e.target.value; store.set('kp.lang', lang); applyLang(); e.target.blur(); });
  // variants
  // presets: cards with a live thumbnail of each brand variant in the current format
  for (const v of Object.keys(VARIANTS)) {
    const b = document.createElement('button');
    b.className = 'presetCard'; b.dataset.v = v; b.type = 'button';
    b.innerHTML = `<span class="thumb"></span><span class="name" data-t="v_${v}"></span>`;
    b.addEventListener('click', () => { Object.assign(state, VARIANTS[v], { variant: v }); update(); });
    $('variants').appendChild(b);
  }
  // format: aspect-ratio slider keeps the long side; width/height fields update live both ways
  // Dragging is free: the size follows the thumb continuously (ratio interpolated between the stops in log space).
  // On release, keyboard or wheel it snaps to the nearest stop with the 150 ms ease-in-out animation.
  const rr = $('ratio');
  let ratioDrag = null;   // { L } while the pointer is down
  const sizeAt = (x, L) => {
    const i = Math.min(RATIOS.length - 2, Math.floor(x)), f = x - i;
    const la = Math.log(RATIOS[i][0] / RATIOS[i][1]), lb = Math.log(RATIOS[i + 1][0] / RATIOS[i + 1][1]);
    const r = Math.exp(la + (lb - la) * f);
    return r >= 1 ? [L, Math.max(16, Math.round(L / r))] : [Math.max(16, Math.round(L * r)), L];
  };
  const longSide = () => Math.max(...(sizeTarget || [state.width, state.height]));
  const snapRatio = () => {
    const from = +rr.value, to = Math.round(from);
    const [a, b] = RATIOS[to], L = ratioDrag ? ratioDrag.L : longSide();
    ratioDrag = null;
    const target = a >= b ? [L, Math.round(L * b / a)] : [Math.round(L * a / b), L];
    if (from === to && target[0] === state.width && target[1] === state.height) { sizeTarget = null; update(); return; }
    animateSize(target, [from, to]);
  };
  rr.addEventListener('pointerdown', () => { const L = longSide(); cancelAnimationFrame(sizeRaf); sizeRaf = 0; sizeTarget = null; ratioDrag = { L }; });
  rr.addEventListener('input', () => {
    if (ratioDrag) { [state.width, state.height] = sizeAt(+rr.value, ratioDrag.L); sizeTarget = [state.width, state.height]; paintRange(rr); update(); }   // sizeTarget set = thumbnails wait until release
    else snapRatio();   // wheel / programmatic
  });
  rr.addEventListener('change', () => { if (ratioDrag) snapRatio(); });
  addEventListener('pointerup', () => { if (ratioDrag) snapRatio(); });
  addEventListener('pointercancel', () => { if (ratioDrag) snapRatio(); });
  rr.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (d == null && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const cur = Math.round(+rr.value);
    rr.value = e.key === 'Home' ? 0 : e.key === 'End' ? RATIOS.length - 1 : Math.min(RATIOS.length - 1, Math.max(0, cur + d));
    snapRatio();
  });
  for (const k of ['width', 'height']) {
    $(k).addEventListener('input', (e) => {
      const v = Math.round(+e.target.value);
      if (v >= 16 && v <= 20000) { state[k] = v; syncFormat(); update(); }
    });
    $(k).addEventListener('change', (e) => { state[k] = +e.target.value || state[k]; clampAll(state); update(); });
  }

  for (const k of ['rings', 'r0', 'step', 'thickness']) makeSlider($('geomSliders'), k, k);
  // Shift is a switch (0 ↔ 1); the change is animated, ease-in-out 150 ms.
  $('shiftOn').addEventListener('change', (e) => animateShift(e.target.checked ? 1 : 0));
  for (const k of ['gap', 'twist', 'skip', 'draw', 'dropout', 'seed']) makeSlider($('advSliders'), k, k);
  // 'Vary gaps per ring' only matters with a gap: keep it right under the Gap / Twist sliders.
  sliders.twist.range.closest('.slider').after($('variation').closest('label'));
  // No camera-distance slider: it fought with Scale (both 'zoom'), and the rings are flat anyway. camDist stays fixed
  // at the default (reset by 'Reset camera' / H); size is always Scale, in 2D and 3D alike.
  for (const k of ['rotX', 'rotY']) makeSlider($('camSliders'), k, k);
  makeSlider($('scaleSlider'), 'scale', 'scale');
  { const sl = sliders.scale.range.closest('.slider'); sl.classList.add('withAside'); sl.appendChild($('scaleMode')); }   // small mode switch right of «Масштаб»
  makeSlider($('scaleSlider'), 'rotZ', 'rotZ');
  makeSlider($('angleSlider'), 'gradAngle', 'angle');

  for (const k of BOOL_KEYS) $(k)?.addEventListener('change', (e) => { state[k] = e.target.checked; update(); });   // threeD has no checkbox: floating 2D/3D switch over the canvas
  $('viewMode').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { state.threeD = b.dataset.v === '1'; update(); }));
  $('linkTS').addEventListener('change', (e) => { if (e.target.checked) state.tsRatio = state.thickness / state.step; update(); });
  $('scaleMode').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => switchScaleMode(b.dataset.v)));
  $('addPreset').addEventListener('click', addUserPreset);
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

  $('copyBtn').addEventListener('click', copySVG);
  $('downloadBtn').addEventListener('click', downloadSVG);
  $('shareBtn').addEventListener('click', shareLink);
  // Reset everything except the chosen preset and the format.
  $('resetTop').addEventListener('click', () => {
    const { variant, width, height } = state;
    const up = userPreset(variant);
    state = Object.assign(up ? fromQuery(up.q) : Object.assign(structuredClone(DEFAULTS), VARIANTS[variant] || {}), { variant, width, height });
    update(); toast(t('resetDone'));
  });

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
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  $('copyHint').innerHTML = `<kbd>${mod} + C</kbd> ${t('k_copyAny')}`;
  document.title = t('title');
  $('langs').value = lang;
  // Shortcut lists live in the "?" tooltips next to the Camera and Size & position titles.
  const mb = lang === 'en' ? { 'ЛКМ': 'LMB', 'СКМ': 'MMB', 'ПКМ': 'RMB', 'Колесо': 'Wheel' } : lang === 'kk' ? { 'ЛКМ': 'СТБ', 'СКМ': 'ОТБ', 'ПКМ': 'ОңТБ', 'Колесо': 'Дөңгелек' } : {};
  const tr = (x) => x.replace(/ЛКМ|СКМ|ПКМ|Колесо/g, (m) => mb[m] || m);
  const keyList = (rows) => rows.map(([k, ...alts]) =>
    `<li><span>${t(k)}</span><span>${alts.map((a) => `<kbd>${tr(a)}</kbd>`).join(` ${t('k_or')} `)}</span></li>`).join('');
  // Common controls (both modes) in "Size & position"; Camera lists only what is 3D-specific.
  $('posKeys').innerHTML = keyList([
    ['k_move', 'СКМ'], ['k_move2d', 'ЛКМ'], ['k_zoom', 'Колесо', 'ПКМ'],
    ['k_roll', `${mod} + ЛКМ ↔`, `${mod} + Колесо`], ['k_rings', `${mod} + ЛКМ ↕`], ['k_frame', 'H'],
  ]) + keyList([['k_orbit', 'ЛКМ']]).replace('<li>', '<li class="cam3d">');   // orbit row only in 3D
  renderUserPresets();
}

// ---------- render ----------
// Aspect-ratio change is animated like Shift (ease-in-out 150 ms). Preset thumbnails are skipped
// while it runs (they're the expensive part of a size change) and rebuilt once at the end.
let sizeRaf = 0, sizeTarget = null;
function animateSize([tw, th], slide) {
  cancelAnimationFrame(sizeRaf);
  const fw = state.width, fh = state.height, t0 = performance.now(), D = 150;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  sizeTarget = [tw, th];
  let lw = fw, lh = fh;
  const step = (now) => {
    if (state.width !== lw || state.height !== lh) { sizeRaf = 0; sizeTarget = null; update(); return; }   // changed elsewhere
    const t = Math.min(1, (now - t0) / D), k = ease(t);
    state.width = lw = Math.round(fw + (tw - fw) * k);
    state.height = lh = Math.round(fh + (th - fh) * k);
    if (slide) { $('ratio').value = slide[0] + (slide[1] - slide[0]) * k; }
    if (t < 1) { sizeRaf = requestAnimationFrame(step); render(); }
    else { sizeRaf = 0; sizeTarget = null; update(); }
  };
  sizeRaf = requestAnimationFrame(step);
}

let shiftRaf = 0, shiftTarget = null;
function animateShift(to) {
  cancelAnimationFrame(shiftRaf);
  const from = state.shift, t0 = performance.now(), D = 150;
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
    if (document.activeElement !== num) { num.value = v; placeUnit(num); }
    range.value = v; paintRange(range);
  }
  for (const k of BOOL_KEYS) if ($(k)) $(k).checked = !!s[k];
  $('viewMode').classList.toggle('is-second', !!s.threeD);
  $('scaleMode').classList.toggle('is-second', s.scaleMode === 'abs');
  $('viewMode').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', (b.dataset.v === '1') === !!s.threeD));
  $('tsRatioText').textContent = s.linkTS ? `${Math.round(s.tsRatio * 100)} %` : '';
  $('shiftOn').checked = shiftTarget != null ? shiftTarget === 1 : s.shift > 0;
  syncFormat();
  $('variants').querySelectorAll('.presetCard').forEach((b) => b.classList.toggle('is-active', b.dataset.v === s.variant));
  renderThumbs();
  $('scaleMode').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.v === s.scaleMode));
  $('ringSw').querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.c === s.ringColor.toUpperCase()));
  $('bgSw').querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.c === s.bgColor.toUpperCase()));
  $('ringColor').value = s.ringColor; $('bgColor').value = s.bgColor;
  ['g0', 'g1', 'g2'].forEach((id, i) => { $(id).value = s.grad[i]; });
  syncHex();
  $('gradBox').classList.toggle('show', s.gradient);
  $('camSec').classList.toggle('is3d', !!s.threeD);
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

// Preset thumbnails: brand defaults + variant, in the current format and colours. Rebuilt only when those change.
let thumbKey = '';
function renderThumbs() {
  if (sizeTarget) return;   // aspect-ratio animation in progress
  const s = state, key = [s.width, s.height, s.ringColor, s.bgColor, s.bgOn, s.grad.join(), s.ringOpacity, s.bgOpacity, s.gradOpacity.join()].join('|');
  if (key === thumbKey) return;
  thumbKey = key;
  $('variants').querySelectorAll('.presetCard').forEach((b) => {
    const up = userPreset(b.dataset.v);
    const ts = up ? Object.assign(fromQuery(up.q), { width: s.width, height: s.height })   // user preset: its own look, current format
      : Object.assign(structuredClone(DEFAULTS), VARIANTS[b.dataset.v],
        { width: s.width, height: s.height, ringColor: s.ringColor, bgColor: s.bgColor, bgOn: s.bgOn, grad: s.grad, ringOpacity: s.ringOpacity, bgOpacity: s.bgOpacity, gradOpacity: s.gradOpacity });
    b.querySelector('.thumb').innerHTML = buildSVG(ts)
      .replace('<svg ', '<svg preserveAspectRatio="xMidYMid slice" ')
      .replace(/kp-(grad|clip)/g, `kpt-${b.dataset.v.replace(':', '-')}-$1`)          // unique ids per thumbnail
      .replace(/ id="(?!kpt-)[^"]*"/g, '');
  });
}

// Format controls from state: fields (unless being typed in), slider stop, proportion icon, ratio text.
// Filled part of a range track (custom-styled, see style.css).
function paintRange(r) {
  const f = Math.min(1, Math.max(0, (r.value - r.min) / (r.max - r.min || 1)));
  r.style.setProperty('--p', f * 100 + '%');
  r.parentNode?.style?.setProperty('--f', f);   // scrub bar draws fill + handle from this
}
document.addEventListener('input', (e) => { if (e.target.type === 'range') paintRange(e.target); });

function syncFormat() {
  const s = state, ae = document.activeElement;
  if (ae !== $('width')) { $('width').value = s.width; placeUnit($('width')); }
  if (ae !== $('height')) { $('height').value = s.height; placeUnit($('height')); }
  // During the aspect-ratio animation the slider and label show the target, not the in-between sizes.
  const [fw, fh] = sizeTarget || [s.width, s.height];
  const r = fw / fh;
  let best = 0;
  RATIOS.forEach(([a, b], i) => { if (Math.abs(Math.log(a / b / r)) < Math.abs(Math.log(RATIOS[best][0] / RATIOS[best][1] / r))) best = i; });
  if (ae !== $('ratio') && !sizeRaf) $('ratio').value = best;
  paintRange($('ratio'));
  const g = gcd(fw, fh), a = fw / g, b = fh / g;
  $('ratioText').textContent = a <= 20 && b <= 20 ? `${a}:${b}` : r >= 1 ? `${+r.toFixed(2)}:1` : `1:${+(1 / r).toFixed(2)}`;
  const i = $('ratioIcon').firstElementChild, ri = s.width / s.height;   // icon follows the live size
  i.style.width = (ri >= 1 ? 22 : Math.max(5, 22 * ri)) + 'px';
  i.style.height = (ri >= 1 ? Math.max(5, 22 / ri) : 22) + 'px';
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

// Navigation. Both modes: Ctrl/Cmd+LMB drag — the first ~4 px pick the axis: horizontal = rotation Z, vertical = rings
// (up = more); Ctrl/Cmd+wheel = rotation Z; MMB move; RMB drag / wheel zoom (3D dolly, 2D scale); H = frame (2D: centre).
// Mode-specific: LMB = orbit in 3D, move in 2D.
function setupDrag() {
  const fr = $('frame');
  let start = null;
  const typing = () => { const a = document.activeElement; return !!a && (/SELECT|TEXTAREA/.test(a.tagName) || (a.tagName === 'INPUT' && /^(text|number|search|email|url)$/.test(a.type)) || a.isContentEditable); };   // switches / sliders don't block H
  window.addEventListener('keydown', (e) => {
    if (typing() || e.metaKey || e.ctrlKey) return;
    if (e.key === 'h' || e.key === 'H' || e.code === 'KeyH') { frameAll(); e.preventDefault(); }   // both modes
  });
  fr.addEventListener('contextmenu', (e) => e.preventDefault());   // RMB drag is used in both modes
  fr.addEventListener('auxclick', (e) => e.preventDefault());
  fr.addEventListener('pointerdown', (e) => {
    // Same in both modes: MMB move, RMB drag zoom (3D dolly / 2D scale), Ctrl+LMB rotation/rings.
    // Mode-specific: LMB = orbit in 3D, move in 2D.
    let mode;
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) mode = 'ctrl';   // both modes: axis decided on first move
    else if (state.threeD) mode = ['orbit', 'pan', 'zoom'][e.button];
    else mode = ['move', 'move', 'zoom'][e.button];
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
    if (start.mode === 'ctrl') {
      if (Math.hypot(dx, dy) < 4) return;
      start.mode = Math.abs(dx) >= Math.abs(dy) ? 'roll' : 'rings';
      start.x = e.clientX; start.y = e.clientY;                 // count from the lock point, no jump
      fr.classList.remove('c4d-ctrl'); fr.classList.add('c4d-' + start.mode);
      return;
    }
    if (start.mode === 'rings') {
      const n = Math.round(s0.rings - dy / 16);                 // 16 px per ring, up = more
      if (n === state.rings) return;
      state.rings = n;
    } else if (start.mode === 'roll') {
      state.rotZ = wrap(s0.rotZ + dx * 0.4);
    } else if (start.mode === 'orbit') {
      state.rotY = wrap(s0.rotY - dx * 0.4);                    // inverted orbit (user preference)
      state.rotX = wrap(s0.rotX + dy * 0.4);
    } else if (start.mode === 'pan') {
      state.panX = s0.panX + dx * toLocal;
      state.panY = s0.panY + dy * toLocal;
    } else if (start.mode === 'dolly') {
      state.camDist = s0.camDist * Math.exp(-(dx - dy) * 0.004);
    } else if (start.mode === 'zoom') {                        // 2D twin of dolly: right / up = bigger
      state.scale = s0.scale * Math.exp((dx - dy) * 0.004);
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
    else state.scale = state.scale * Math.exp(-e.deltaY * 0.0015);                   // both modes: scale
    clampAll(state); update();
  }, { passive: false });
}

// H: keep the angle, reset pan and dolly so the pattern sits in frame as at the start.
// 2D: centre the pattern (same as the "Centre" button).
function frameAll() {
  if (!state.threeD) { state.cx = 0.5; state.cy = 0.5; update(); return; }
  state.panX = 0; state.panY = 0; state.camDist = DEFAULTS.camDist;
  update();
}

// ---------- export ----------
function toast(msg, actionLabel, onAction) {
  const el = $('toast'); el.textContent = msg;
  el.classList.toggle('hasAction', !!actionLabel);
  if (actionLabel) {
    const b = document.createElement('button'); b.className = 'act'; b.type = 'button'; b.textContent = actionLabel;
    b.addEventListener('click', () => { el.classList.remove('show'); onAction(); });
    el.appendChild(b);
  }
  el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), actionLabel ? 5000 : 2600);
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

// ---------- colour fields ----------
// Each <input type=color> becomes a Figma-like field: swatch (click = system picker) + HEX that is always shown and editable.
// Typing a valid 3- or 6-digit hex applies it live; Enter/blur normalises it, Esc or an invalid value reverts.
function setupColorFields() {
  document.querySelectorAll('.panel input[type=color]').forEach((col) => {
    const f = document.createElement('div'); f.className = 'colorField';
    col.replaceWith(f); f.appendChild(col);
    const hex = document.createElement('input');
    hex.className = 'hex'; hex.type = 'text'; hex.maxLength = 7; hex.spellcheck = false; hex.autocomplete = 'off';
    hex.setAttribute('aria-label', 'HEX');
    f.appendChild(hex); col._hex = hex;
    const ak = col.dataset.alpha;   // 'ringOpacity' | 'bgOpacity' | 'gradOpacity.N'
    if (ak) {
      const box = document.createElement('span'); box.className = 'swBox'; col.replaceWith(box); box.appendChild(col);
      const sep = document.createElement('span'); sep.className = 'sep';
      const al = document.createElement('input');
      al.className = 'alpha'; al.type = 'number'; al.min = 0; al.max = 100; al.step = 1; al.setAttribute('aria-label', t('opacity'));
      const pc = document.createElement('span'); pc.className = 'pct'; pc.textContent = '%';
      f.append(sep, al, pc); col._alpha = al;
      const set = (v) => { const [k, i] = ak.split('.'); if (i == null) state[k] = v; else state[k][+i] = v; update(); };
      al.addEventListener('input', () => { const v = Math.round(+al.value); if (al.value !== '' && v >= 0 && v <= 100) set(v); });
      al.addEventListener('change', () => { const v = Math.min(100, Math.max(0, Math.round(+al.value) || 0)); al.value = v; set(v); });
      al.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') al.blur(); });
      al.addEventListener('focus', () => al.select());
    }
    const parse = (v) => { v = v.trim().replace(/^#/, ''); if (/^[0-9a-f]{3}$/i.test(v)) v = v.replace(/./g, '$&$&'); return /^[0-9a-f]{6}$/i.test(v) ? '#' + v.toUpperCase() : null; };
    const apply = (c) => { col.value = c; col.dispatchEvent(new Event('input', { bubbles: true })); };
    hex.addEventListener('input', () => { const c = parse(hex.value); if (c && hex.value.replace('#', '').length === 6) apply(c); });
    const commit = () => { const c = parse(hex.value); if (c && c !== col.value.toUpperCase()) apply(c); hex.value = col.value.slice(1).toUpperCase(); };
    hex.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { commit(); hex.blur(); }
      if (e.key === 'Escape') { hex.value = col.value.slice(1).toUpperCase(); hex.blur(); }
    });
    hex.addEventListener('blur', commit);
    hex.addEventListener('focus', () => hex.select());
    hex.addEventListener('copy', (e) => e.stopPropagation());
    col.addEventListener('input', () => { if (document.activeElement !== hex) hex.value = col.value.slice(1).toUpperCase(); });
  });
  syncHex();
}
function syncHex() {
  document.querySelectorAll('.panel input[type=color]').forEach((col) => {
    if (col._hex && document.activeElement !== col._hex) col._hex.value = col.value.slice(1).toUpperCase();
    if (col._alpha) {
      const [k, i] = col.dataset.alpha.split('.'), a = i == null ? state[k] : state[k][+i];
      if (document.activeElement !== col._alpha) col._alpha.value = a;
      col.style.opacity = a / 100;
    }
  });
}

// ---------- mouse wheel on sliders and number fields ----------
// Hovering a slider or number field in the panel and turning the wheel changes the value (up = more, Shift = ×10).
// If the panel itself was scrolling a moment ago, the wheel keeps scrolling, so passing over a control mid-scroll doesn't grab it.
// Value and unit sit together, centred: the input's text is centred in a box whose right padding leaves room
// for the unit, and the unit label is placed right after the measured text.
const UNIT_GAP = 3, FIELD_PAD = 14;
let measureCtx;
function textW(el, str) {
  measureCtx ||= document.createElement('canvas').getContext('2d');
  const cs = getComputedStyle(el); measureCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return measureCtx.measureText(str).width;
}
function placeUnit(inp) {
  const u = inp.parentNode?.querySelector?.('.unitIn');
  if (!u) return;
  if (inp._uv === inp.value && !placeUnit.force) return;
  inp._uv = inp.value;
  if (!u._f) { const cs = getComputedStyle(inp); u.style.fontSize = cs.fontSize; u.style.fontFamily = cs.fontFamily; u.style.fontWeight = cs.fontWeight; u._f = 1; }
  const uw = textW(u, u.textContent), tw = textW(inp, inp.value);
  inp.style.paddingLeft = FIELD_PAD + 'px';
  inp.style.paddingRight = FIELD_PAD + uw + UNIT_GAP + 'px';
  u.style.left = `calc(50% + ${(tw + UNIT_GAP - uw) / 2}px)`;
}
function nudge(el, n, big) {
  const min = el.min === '' ? -Infinity : +el.min, max = el.max === '' ? Infinity : +el.max;
  const st = +el.step || 1;
  let unit = st;
  if (el.id === 'width' || el.id === 'height') unit = 10;
  else if (isFinite(max - min) && (max - min) / st > 200) unit = Math.max(st, Math.round((max - min) / 200 / st) * st);
  if (big) unit *= 10;
  const dec = (String(st).split('.')[1] || '').length;
  const v = Math.min(max, Math.max(min, +(+el.value + n * unit).toFixed(dec)));
  if (v === +el.value) return;
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (el.type === 'number') el.dispatchEvent(new Event('change', { bubbles: true }));
}
function setupWheel() {
  const panel = document.querySelector('.panel');
  // custom steppers instead of the native spin box
  const chev = (d) => `<svg viewBox="0 0 8 5"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  panel.querySelectorAll('input[type=number]:not(.alpha):not(.scrubNum)').forEach((inp) => {
    const w = document.createElement('span'); w.className = 'numWrap';
    inp.replaceWith(w); w.appendChild(inp);
    const sp = document.createElement('span'); sp.className = 'spin';
    sp.innerHTML = `<button type="button" tabindex="-1" data-d="1">${chev('M1 4l3-3 3 3')}</button><button type="button" tabindex="-1" data-d="-1">${chev('M1 1l3 3 3-3')}</button>`;
    w.appendChild(sp);
    if (inp.dataset.unit) { const u = document.createElement('span'); u.className = 'unitIn'; u.textContent = inp.dataset.unit; w.appendChild(u); }
    inp.addEventListener('input', () => placeUnit(inp));
    placeUnit(inp);
    sp.addEventListener('mousedown', (e) => e.preventDefault());
    sp.addEventListener('click', (e) => { const btn = e.target.closest('button'); if (btn) nudge(inp, +btn.dataset.d, e.shiftKey); });
  });
  let lastScroll = 0, lastWheelTarget = null, acc = 0;
  panel.addEventListener('scroll', () => { lastScroll = performance.now(); }, { passive: true });
  panel.addEventListener('wheel', (e) => {
    const el = e.target.closest('input[type=range], input[type=number]') || e.target.closest('.numWrap')?.querySelector('input');
    if (!el || el.disabled || e.ctrlKey) { lastWheelTarget = null; return; }
    if (el !== lastWheelTarget && performance.now() - lastScroll < 300) return;
    e.preventDefault();
    if (el !== lastWheelTarget) acc = 0;
    lastWheelTarget = el;
    const d = e.deltaY || e.deltaX;
    let n;
    if (e.deltaMode !== 0 || Math.abs(d) >= 50) n = -Math.sign(d);
    else { acc += d; n = -Math.trunc(acc / 50); acc -= -n * 50; }
    if (!n) return;
    nudge(el, n, e.shiftKey);
  }, { passive: false });
}

// ---------- user presets ----------
// Flow: "+" in the Presets header saves the current look as a card at the end of the grid and opens its name
// for editing (Enter/blur = keep, Esc = default name). Click a card = apply (format is kept, like brand presets).
// Double-click the name = rename. × on hover = delete, with Undo in the toast. Stored per browser (localStorage).
const UP_KEY = 'kp.presets';
function userPresets() {
  const ps = store.get(UP_KEY, []);
  let dirty = false;
  ps.forEach((p) => { if (!p.id) { p.id = Math.random().toString(36).slice(2, 9); dirty = true; } });   // migrate old entries
  if (dirty) store.set(UP_KEY, ps);
  return ps;
}
function userPreset(v) { return typeof v === 'string' && v.startsWith('u:') ? userPresets().find((p) => 'u:' + p.id === v) : null; }

function renderUserPresets() {
  const grid = $('variants');
  grid.querySelectorAll('.presetCard.user').forEach((c) => c.remove());
  for (const p of userPresets()) {
    const b = document.createElement('div');
    b.className = 'presetCard user'; b.dataset.v = 'u:' + p.id; b.tabIndex = 0; b.setAttribute('role', 'button');
    b.innerHTML = `<span class="thumb"></span><span class="name"></span><button class="del" type="button"></button>`;
    b.querySelector('.name').textContent = p.name; b.querySelector('.name').title = t('rename');
    const del = b.querySelector('.del'); del.innerHTML = ICONS.close; del.setAttribute('aria-label', t('del')); del.title = t('del');
    const apply = () => { const { width, height } = state; state = Object.assign(fromQuery(p.q), { variant: 'u:' + p.id, width, height }); update(); };
    b.addEventListener('click', (e) => { if (!e.target.closest('.del, .nameEdit')) apply(); });
    b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === b) { e.preventDefault(); apply(); } });
    b.querySelector('.name').addEventListener('dblclick', (e) => { e.stopPropagation(); renameUserPreset(b, p.id); });
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteUserPreset(p.id); });
    grid.appendChild(b);
  }
  thumbKey = ''; renderThumbs();
  grid.querySelectorAll('.presetCard').forEach((c) => c.classList.toggle('is-active', c.dataset.v === state.variant));
}

function addUserPreset() {
  const ps = userPresets();
  const id = Math.random().toString(36).slice(2, 9);
  let n = ps.length + 1; while (ps.some((p) => p.name === `${t('myPreset')} ${n}`)) n++;
  state.variant = 'u:' + id;
  ps.push({ id, name: `${t('myPreset')} ${n}`, q: toQuery(state) });
  store.set(UP_KEY, ps.slice(-50));
  renderUserPresets(); update();
  const card = $('variants').querySelector(`[data-v="u:${id}"]`);
  if (card) { card.classList.add('fresh'); card.scrollIntoView({ block: 'nearest' }); renameUserPreset(card, id); }
  toast(t('saved'));
}

function renameUserPreset(card, id) {
  const name = card.querySelector('.name'), old = name.textContent;
  const inp = document.createElement('input');
  inp.className = 'kds-input nameEdit'; inp.value = old; inp.maxLength = 40;
  name.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const finish = (keep) => {
    if (done) return; done = true;
    const v = keep ? inp.value.trim() || old : old;
    const ps = userPresets(), p = ps.find((x) => x.id === id);
    if (p) { p.name = v; store.set(UP_KEY, ps); }
    name.textContent = v; inp.replaceWith(name);
  };
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
  inp.addEventListener('click', (e) => e.stopPropagation());
}

function deleteUserPreset(id) {
  const ps = userPresets(), i = ps.findIndex((p) => p.id === id);
  if (i < 0) return;
  const [gone] = ps.splice(i, 1);
  store.set(UP_KEY, ps); renderUserPresets(); update();
  toast(t('deleted'), t('undo'), () => {
    const cur = userPresets(); cur.splice(Math.min(i, cur.length), 0, gone);
    store.set(UP_KEY, cur); renderUserPresets(); update();
  });
}

// ---------- init ----------
applyTheme(store.get('kp.theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
lang = store.get('kp.lang', 'ru');
if (!LANGS.includes(lang)) lang = 'ru';
if (location.hash.length > 1) state = fromQuery(location.hash.slice(1));
buildUI();
setupColorFields();
setupWheel();
document.fonts?.ready.then(() => { placeUnit.force = true; document.querySelectorAll('.panel input[type=number]:not(.alpha)').forEach(placeUnit); placeUnit.force = false; });
applyLang();
update();
