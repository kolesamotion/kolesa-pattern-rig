import { DEFAULTS, VARIANTS, LIMITS, buildSVG, scaleFactor } from './pattern.js?v=__V__';
import { T, LANGS } from './i18n.js?v=__V__';

const $ = (id) => document.getElementById(id);

const FORMATS = [
  { k: 'p_landscape', w: 1920, h: 1080 },
  { k: 'p_story', w: 1080, h: 1920 },
  { k: 'p_square', w: 1080, h: 1080 },
  { k: 'p_billboard', w: 6000, h: 3000 },
  { k: 'p_phone', w: 390, h: 844 },
];
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
const BOOL_KEYS = ['core', 'variation', 'threeD', 'gradient', 'bgOn'];
const STR_KEYS = ['variant', 'ringColor', 'bgColor', 'scaleMode'];

let state = structuredClone(DEFAULTS);
let lang = 'ru';
const CAM_KEYS = ['rotX', 'rotY', 'rotZ', 'camDist'];
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
  el.innerHTML = `<div class="name"><span data-t="${labelKey}"></span><span class="unit">${UNITS[key] || ''}</span></div>` +
    `<input type="range" min="${min}" max="${max}" step="${step}"><input type="number" min="${min}" max="${max}" step="${step}">`;
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
  // languages
  for (const l of LANGS) {
    const b = document.createElement('button');
    b.textContent = l === 'kk' ? 'kz' : l; b.dataset.l = l;
    b.addEventListener('click', () => { lang = l; store.set('kp.lang', l); applyLang(); });
    $('langs').appendChild(b);
  }
  // variants
  for (const v of Object.keys(VARIANTS)) {
    const b = document.createElement('button');
    b.dataset.v = v; b.dataset.t = 'v_' + v;
    b.addEventListener('click', () => { Object.assign(state, VARIANTS[v], { variant: v }); update(); });
    $('variants').appendChild(b);
  }
  // formats
  const sel = $('formatPreset');
  FORMATS.forEach((fm, i) => { const o = document.createElement('option'); o.value = i; o.dataset.t = fm.k; sel.appendChild(o); });
  const oc = document.createElement('option'); oc.value = 'custom'; oc.dataset.t = 'custom'; sel.appendChild(oc);
  sel.addEventListener('change', () => {
    if (sel.value === 'custom') return;
    const fm = FORMATS[+sel.value]; state.width = fm.w; state.height = fm.h; update();
  });
  for (const k of ['width', 'height']) $(k).addEventListener('change', (e) => { state[k] = +e.target.value || state[k]; clampAll(state); update(); });

  for (const k of ['rings', 'shift', 'step', 'thickness', 'gap', 'twist']) makeSlider($('geomSliders'), k, k);
  for (const k of ['r0', 'skip', 'draw', 'dropout', 'seed']) makeSlider($('advSliders'), k, k);
  for (const k of CAM_KEYS) makeSlider($('camSliders'), k, k);
  makeSlider($('scaleSlider'), 'scale', 'scale');
  makeSlider($('angleSlider'), 'gradAngle', 'angle');

  for (const k of BOOL_KEYS) $(k).addEventListener('change', (e) => { state[k] = e.target.checked; update(); });
  $('scaleMode').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => switchScaleMode(b.dataset.v)));
  $('resetCam').addEventListener('click', () => { for (const k of [...CAM_KEYS, 'panX', 'panY']) state[k] = DEFAULTS[k]; update(); });
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
  $('resetBtn').addEventListener('click', () => { state = structuredClone(DEFAULTS); update(); });

  setupDrag();
  new ResizeObserver(fitFrame).observe($('stage'));
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
  $('presetName').placeholder = t('presetName');
  document.title = t('title');
  $('langs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.l === lang));
  const rows = [
    ['k_orbit', 'ЛКМ'], ['k_pan', 'СКМ'], ['k_dolly', 'ПКМ'],
    ['k_dolly', lang === 'en' ? 'Wheel' : lang === 'kk' ? 'Дөңгелек' : 'Колесо'], ['k_frame', 'H'],
  ];
  const mb = lang === 'en' ? { 'ЛКМ': 'LMB', 'СКМ': 'MMB', 'ПКМ': 'RMB' } : lang === 'kk' ? { 'ЛКМ': 'СТБ', 'СКМ': 'ОТБ', 'ПКМ': 'ОңТБ' } : {};
  const tr = (x) => x.replace(/ЛКМ|СКМ|ПКМ/g, (m) => mb[m] || m);
  $('camKeys').innerHTML = rows.map(([k, a, b]) =>
    `<li><span>${t(k)}</span><span><kbd>${tr(a)}</kbd>${b ? ` ${t('k_or')} <kbd>${tr(b)}</kbd>` : ''}</span></li>`).join('');
  renderPresets();
}

// ---------- render ----------
let hashTimer;
function update() {
  const s = state;
  $('frame').innerHTML = buildSVG(s);
  for (const [k, { range, num }] of Object.entries(sliders)) {
    const v = +(+s[k]).toFixed(2);
    if (document.activeElement !== num) num.value = v;
    range.value = v;
  }
  for (const k of BOOL_KEYS) $(k).checked = !!s[k];
  $('width').value = s.width; $('height').value = s.height;
  const fi = FORMATS.findIndex((fm) => fm.w === s.width && fm.h === s.height);
  $('formatPreset').value = fi >= 0 ? String(fi) : 'custom';
  $('variants').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.variant));
  $('scaleMode').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.scaleMode));
  $('ringSw').querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.c === s.ringColor.toUpperCase()));
  $('bgSw').querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.c === s.bgColor.toUpperCase()));
  $('ringColor').value = s.ringColor; $('bgColor').value = s.bgColor;
  ['g0', 'g1', 'g2'].forEach((id, i) => { $(id).value = s.grad[i]; });
  $('gradBox').classList.toggle('show', s.gradient);
  $('cameraSec').classList.toggle('show', s.threeD);
  $('sizeLabel').textContent = `${s.width} × ${s.height}`;
  fitFrame();
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => history.replaceState(null, '', '#' + toQuery(state)), 250);
}

function fitFrame() {
  const st = $('stage'), fr = $('frame');
  const pad = window.innerWidth <= 760 ? 32 : 80;
  const aw = st.clientWidth - pad, ah = st.clientHeight - pad - 20;
  const k = Math.min(aw / state.width, ah / state.height);
  fr.style.width = Math.max(1, state.width * k) + 'px';
  fr.style.height = Math.max(1, state.height * k) + 'px';
}

// Navigation. 3D: LMB orbit, MMB pan, RMB drag / wheel dolly, H = frame. 2D: LMB / MMB move the pattern.
function setupDrag() {
  const fr = $('frame');
  let start = null;
  const typing = () => /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '');
  window.addEventListener('keydown', (e) => {
    if (typing() || e.metaKey || e.ctrlKey) return;
    if ((e.key === 'h' || e.key === 'H' || e.code === 'KeyH') && state.threeD) { frameAll(); e.preventDefault(); }
  });
  fr.addEventListener('contextmenu', (e) => { if (state.threeD) e.preventDefault(); });
  fr.addEventListener('auxclick', (e) => e.preventDefault());
  fr.addEventListener('pointerdown', (e) => {
    // 3D: LMB orbit, MMB pan, RMB dolly. 2D: LMB and MMB move the pattern.
    let mode;
    if (state.threeD) mode = ['orbit', 'pan', 'dolly'][e.button];
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
    if (start.mode === 'orbit') {
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
    if (!state.threeD) return;
    e.preventDefault();
    state.camDist = state.camDist * Math.exp(e.deltaY * 0.0015);
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
    const a = document.createElement('button'); a.className = 'apply'; a.textContent = p.name;
    a.addEventListener('click', () => { state = fromQuery(p.q); update(); });
    const d = document.createElement('button'); d.className = 'small'; d.textContent = t('del');
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
lang = store.get('kp.lang', 'ru');
if (!LANGS.includes(lang)) lang = 'ru';
if (location.hash.length > 1) state = fromQuery(location.hash.slice(1));
buildUI();
applyLang();
update();
