// Kolesa Pattern Rig — perimeter interface (perimeter.html). A second front end next to index.html + app.js:
// same pattern.js, same URL-hash state, same localStorage (theme, language, user presets).
// No side panel: the canvas is the window and every parameter sits on the edge it belongs to.
//   top    — what we make: presets, format (ratio stops, W × H)
//   left   — the pattern itself: ring structure, gap, colour (the arcs grow from 9 o'clock, i.e. from the left)
//   right  — how we look at it and where it goes: 2D / 3D, axis gizmo, scale, rotation, export
//   bottom — how much of it is drawn (progress lives at the bottom, like a timeline)
// Keyboard first: hold a parameter key and move the mouse to scrub it, tap the key to select it for arrows / wheel /
// typed values. Every control shows its key.
import { DEFAULTS, VARIANTS, LIMITS, buildSVG, buildGhostSVG, scaleFactor } from './pattern.js?v=__V__';
import { T, LANGS } from './i18n.js?v=__V__';
import { ICONS } from './icons.js?v=__V__';
import { setupTips, fmtKeys } from './tips.js?v=__V__';

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap180 = (a) => ((a % 360) + 540) % 360 - 180;
const rad = (d) => (d * Math.PI) / 180;
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const RATIOS = [[9, 16], [2, 3], [4, 5], [1, 1], [4, 3], [3, 2], [16, 9]];
// Brand colours (Brand guidelines 14:65). #005EFF = #0065DB hard-light over #0077FF, flattened.
const RING_COLORS = ['#005EFF', '#0065DB', '#0077FF', '#004799', '#001833', '#C2DEFF', '#FFFFFF'];
const BG_COLORS = ['#0077FF', '#FFFFFF', '#001833', '#1D2129', '#C2DEFF'];
const GRADS = [
  { c: ['#0023A6', '#0042FF', '#0023A6'], a: 45 },
  { c: ['#004FFF', '#0042FF', '#0023A6'], a: 90 },
  { c: ['#1F89FF', '#0077FF', '#0065DB'], a: 90 },
  { c: ['#85BEFF', '#0077FF', '#0056B8'], a: 90 },
  { c: ['#C2DEFF', '#61ACFF', '#0077FF'], a: 90 },
];
const DS_NAMES = { '#0065DB': 'blue-600', '#0077FF': 'brand-blue · blue-500', '#004799': 'blue-800', '#001833': 'blue-990',
  '#C2DEFF': 'blue-30', '#FFFFFF': 'white', '#1D2129': 'brand-neutral · neutral-990', '#1F89FF': 'blue-400', '#85BEFF': 'blue-100',
  '#0056B8': 'blue-700', '#61ACFF': 'blue-200' };
const swTitle = (c) => (DS_NAMES[c] ? `${DS_NAMES[c]}  ${c}` : c);
const UNITS = { step: 'px', thickness: 'px', gap: '°', twist: '°', r0: 'px', draw: '%', dropout: '%', scale: '%', gradAngle: '°', rotX: '°', rotY: '°', rotZ: '°' };
const NUM_KEYS = ['rings', 'shift', 'step', 'thickness', 'gap', 'twist', 'r0', 'skip', 'draw', 'dropout', 'seed', 'gradAngle', 'width', 'height', 'cx', 'cy', 'scale', 'rotX', 'rotY', 'rotZ', 'camDist', 'panX', 'panY', 'tsRatio', 'ringOpacity', 'bgOpacity'];
const GEOM_KEYS = ['rings', 'shift', 'step', 'thickness', 'linkTS', 'tsRatio', 'gap', 'twist', 'variation', 'r0', 'skip', 'draw', 'dropout', 'seed', 'core'];
const BOOL_KEYS = ['core', 'variation', 'threeD', 'gradient', 'bgOn', 'linkTS'];
const STR_KEYS = ['variant', 'ringColor', 'bgColor', 'scaleMode'];
const ANGLE_KEYS = ['rotZ', 'gap', 'twist', 'gradAngle'];   // whole degrees
const SMOOTH = ['scale', 'rotX', 'rotY', 'shift'];           // not rounded to the slider step
const ROT = ['rotX', 'rotY', 'rotZ'];
const SLIDER_MAX = { rings: 20 };
const SWITCHES = { swCore: 'core', swVariation: 'variation', swGradient: 'gradient' };
const CAM_HOME = { rotX: -30, rotY: 30, rotZ: 0, panX: 0, panY: 0, cx: 0.5, cy: 0.5, camDist: DEFAULTS.camDist };

// Parameter keys (physical keys, so they work in any layout). Hold + move the mouse = scrub, tap = select.
const KEY_OF = { rings: 'R', r0: 'E', step: 'S', thickness: 'T', gap: 'U', twist: 'W', skip: 'K', draw: 'P', dropout: 'O', seed: 'N',
  scale: 'M', rotX: 'X', rotY: 'Y', rotZ: 'Z', gradAngle: 'A' };
const SCRUB = Object.fromEntries(Object.entries(KEY_OF).map(([k, l]) => ['Key' + l, k]));
// Units per pixel of mouse travel while the key is held (Shift ×10, Alt ×0.1). Scale is multiplicative.
const RATE = { rings: 0.05, r0: 0.5, step: 0.4, thickness: 0.3, gap: 0.75, twist: 0.4, skip: 0.05, draw: 0.25, dropout: 0.25, seed: 0.08,
  rotX: 0.5, rotY: 0.5, rotZ: 0.5, gradAngle: 0.75 };
const DEC = { rotX: 0, rotY: 0, scale: 0 };   // decimals shown in a dial (the state keeps the exact value)

// Strings this interface adds on top of js/i18n.js.
const X = {
  ru: {
    copyS: 'Копировать SVG', p_title: 'Паттерн Kolesa.kz', g_rings: 'Кольца', g_gap: 'Разрыв', g_view: 'Вид',
    s_r0: 'Радиус', s_twist: 'Закрутка', s_skip: 'Пропуск', s_dropout: 'Скрыть', s_core: 'Полудиск', s_variation: 'Вариация',
    wS: 'Ш', hS: 'В', linkS: 'Ссылка', undo: 'Отменить', redo: 'Повторить', shortcuts: 'Горячие клавиши',
    swapWH: 'Поменять ширину и высоту местами', swapColors: 'Поменять цвета колец и фона местами',
    solid: 'Сплошной', gradTab: 'Градиент', eyedropper: 'Пипетка', brand: 'Бренд', brandGrads: 'Градиенты бренда', inDoc: 'В макете', recent: 'Недавние',
    reverse: 'Развернуть градиент', rot90: 'Повернуть на 90°', on: 'вкл', off: 'выкл', none: 'нет',
    hideUI: 'Скрыть / показать интерфейс', bareHint: 'Интерфейс скрыт. Вернуть:',
    only3d: 'Вращение X и Y работает в 3D — нажмите V', needGrad: 'Угол нужен градиенту — включите его клавишей G', noDrop: 'Пипетка недоступна в этом браузере',
    gizmoTip: 'Оси паттерна. Тяните — вращение камеры, за шарик — одна ось, двойной клик — сброс',
    hudHint: '← → · колесо · цифры и Enter · Esc',
    holdHint: 'Удерживайте клавишу параметра и ведите мышью: значение меняется без слайдера. Короткое нажатие выбирает параметр — дальше стрелки, колесо или цифры и Enter. Shift — крупный шаг, Alt — точный, Esc — отмена.',
    c_geom: 'Геометрия', c_view: 'Вид и положение', c_color: 'Цвет', c_format: 'Пресеты и формат', c_general: 'Общее', c_mouse: 'Мышь на холсте',
    h_ringPick: 'Палитра колец', h_bgPick: 'Палитра фона', h_cycleRing: 'Цвет колец из бренда: назад / вперёд', h_cycleBg: 'Цвет фона из бренда: назад / вперёд',
    h_nudge: 'Сдвинуть паттерн на 1 px (Shift — 10)', h_zoom: 'Крупнее / мельче / 100 %', h_dbl: 'Значение по умолчанию', h_dblK: '2× клик по параметру',
    h_ratio: 'Пропорции: назад / вперёд', h_preset: 'Пресет по номеру',
  },
  en: {
    copyS: 'Copy SVG', p_title: 'Kolesa.kz pattern', g_rings: 'Rings', g_gap: 'Gap', g_view: 'View',
    s_r0: 'Radius', s_twist: 'Twist', s_skip: 'Skip', s_dropout: 'Dropout', s_core: 'Half-disc', s_variation: 'Variation',
    wS: 'W', hS: 'H', linkS: 'Link', undo: 'Undo', redo: 'Redo', shortcuts: 'Keyboard shortcuts',
    swapWH: 'Swap width and height', swapColors: 'Swap ring and background colours',
    solid: 'Solid', gradTab: 'Gradient', eyedropper: 'Eyedropper', brand: 'Brand', brandGrads: 'Brand gradients', inDoc: 'In this design', recent: 'Recent',
    reverse: 'Reverse gradient', rot90: 'Rotate 90°', on: 'on', off: 'off', none: 'none',
    hideUI: 'Hide / show the interface', bareHint: 'Interface hidden. Bring it back:',
    only3d: 'Rotation X and Y work in 3D — press V', needGrad: 'The angle needs a gradient — turn it on with G', noDrop: 'The eyedropper is not available in this browser',
    gizmoTip: 'Pattern axes. Drag to orbit, drag a ball for one axis, double-click to reset',
    hudHint: '← → · wheel · digits and Enter · Esc',
    holdHint: 'Hold a parameter key and move the mouse: the value changes without a slider. A short press selects the parameter — then arrows, the wheel, or digits and Enter. Shift is a large step, Alt a fine one, Esc cancels.',
    c_geom: 'Geometry', c_view: 'View and position', c_color: 'Colour', c_format: 'Presets and format', c_general: 'General', c_mouse: 'Mouse on the canvas',
    h_ringPick: 'Ring colour picker', h_bgPick: 'Background colour picker', h_cycleRing: 'Brand ring colour: previous / next', h_cycleBg: 'Brand background colour: previous / next',
    h_nudge: 'Nudge the pattern by 1 px (Shift — 10)', h_zoom: 'Bigger / smaller / 100 %', h_dbl: 'Default value', h_dblK: 'double-click a parameter',
    h_ratio: 'Aspect ratio: previous / next', h_preset: 'Preset by number',
  },
  kk: {
    copyS: 'SVG көшіру', p_title: 'Kolesa.kz паттерні', g_rings: 'Сақиналар', g_gap: 'Үзік', g_view: 'Көрініс',
    s_r0: 'Радиус', s_twist: 'Бұралу', s_skip: 'Өткізу', s_dropout: 'Жасыру', s_core: 'Жарты диск', s_variation: 'Вариация',
    wS: 'Е', hS: 'Б', linkS: 'Сілтеме', undo: 'Болдырмау', redo: 'Қайталау', shortcuts: 'Жылдам пернелер',
    swapWH: 'Ені мен биіктігін ауыстыру', swapColors: 'Сақина мен фон түстерін ауыстыру',
    solid: 'Тұтас', gradTab: 'Градиент', eyedropper: 'Тамызғыш', brand: 'Бренд', brandGrads: 'Бренд градиенттері', inDoc: 'Макетте', recent: 'Соңғылар',
    reverse: 'Градиентті аудару', rot90: '90° бұру', on: 'қосулы', off: 'өшірулі', none: 'жоқ',
    hideUI: 'Интерфейсті жасыру / көрсету', bareHint: 'Интерфейс жасырылды. Қайтару:',
    only3d: 'X және Y айналуы 3D режимінде жұмыс істейді — V басыңыз', needGrad: 'Бұрыш градиентке керек — G пернесімен қосыңыз', noDrop: 'Бұл браузерде тамызғыш қолжетімсіз',
    gizmoTip: 'Паттерн осьтері. Сүйреңіз — камераны айналдыру, шарды сүйреу — бір ось, екі рет басу — қалпына келтіру',
    hudHint: '← → · дөңгелек · сандар және Enter · Esc',
    holdHint: 'Параметр пернесін басып тұрып, тінтуірді жылжытыңыз: мән слайдерсіз өзгереді. Қысқа басу параметрді таңдайды — әрі қарай көрсеткілер, дөңгелек немесе сандар мен Enter. Shift — үлкен қадам, Alt — дәл қадам, Esc — болдырмау.',
    c_geom: 'Геометрия', c_view: 'Көрініс және орын', c_color: 'Түс', c_format: 'Пресеттер мен формат', c_general: 'Жалпы', c_mouse: 'Кенептегі тінтуір',
    h_ringPick: 'Сақина түсі', h_bgPick: 'Фон түсі', h_cycleRing: 'Сақинаның бренд түсі: алдыңғы / келесі', h_cycleBg: 'Фонның бренд түсі: алдыңғы / келесі',
    h_nudge: 'Паттернді 1 px жылжыту (Shift — 10)', h_zoom: 'Үлкейту / кішірейту / 100 %', h_dbl: 'Әдепкі мән', h_dblK: 'параметрді екі рет басу',
    h_ratio: 'Пропорциялар: алдыңғы / келесі', h_preset: 'Нөмір бойынша пресет',
  },
};

// Icons the Core Icons export doesn't have (16 px, stroke).
const ic = (d) => `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;
const IC = {
  undo: ic('<path d="M5.5 3.5l-3 3 3 3"/><path d="M2.75 6.5H9.5a3.5 3.5 0 0 1 0 7h-3"/>'),
  redo: ic('<path d="M10.5 3.5l3 3-3 3"/><path d="M13.25 6.5H6.5a3.5 3.5 0 0 0 0 7h3"/>'),
  swap: ic('<path d="M2.5 5.5h11M11 3l2.5 2.5L11 8"/><path d="M13.5 10.5h-11M5 8l-2.5 2.5L5 13"/>'),
  chain: ic('<path d="M8 6.25v3.5"/><path d="M5.5 6.75V5.5a2.5 2.5 0 0 1 5 0v1.25"/><path d="M5.5 9.25v1.25a2.5 2.5 0 0 0 5 0V9.25"/>'),
  drop: ic('<path d="M9.4 6.6l-5.9 5.9-.5 1.5 1.5-.5 5.9-5.9"/><path d="M8.2 4.6l3.2 3.2"/><path d="M9.9 6.1l2.2-2.2a1.45 1.45 0 0 0-2-2L7.9 4.1"/>'),
  keys: ic('<rect x="1.75" y="3.75" width="12.5" height="8.5" rx="2"/><path d="M4.5 6.75h.01M7 6.75h.01M9.5 6.75h.01M11.75 6.75h.01M5 9.5h6"/>'),
};

let state = structuredClone(DEFAULTS);
let lang = 'ru';
const dials = {};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const t = (k) => (X[lang] && X[lang][k]) || (T[lang] && T[lang][k]) || X.ru[k] || T.ru[k] || k;
const pname = (key) => t(key === 'gradAngle' ? 'angle' : key);
const fmtVal = (key) => String(+(+state[key]).toFixed(DEC[key] ?? 2));
const capText = (s) => s.split('+').map((k) => (k === 'shift' ? '⇧' : k.toUpperCase())).join('');

// ---------- state <-> URL (same format as app.js, links are interchangeable) ----------
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
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) if (k in s) s[k] = clamp(s[k], lo, hi);
  for (const k of ANGLE_KEYS) if (k in s) s[k] = Math.round(s[k]) || 0;
  s.width = clamp(Math.round(s.width), 16, 20000);
  s.height = clamp(Math.round(s.height), 16, 20000);
  s.cx = clamp(s.cx, -1, 2); s.cy = clamp(s.cy, -1, 2);
  return s;
}

// ---------- parameters ----------
// Linked mode: thickness = step × tsRatio. Moving either moves the other.
function linkThickness(key) {
  if (!state.linkTS) return;
  const [tl, th] = LIMITS.thickness, [sl, sh] = LIMITS.step;
  if (key === 'step') state.thickness = clamp(Math.round(state.step * state.tsRatio), tl, th);
  if (key === 'thickness') state.step = clamp(Math.round(state.thickness / state.tsRatio), sl, sh);
}
function setParam(key, v) {
  const [lo, hi, st] = LIMITS[key];
  v = +v;
  if (!isFinite(v)) return;
  if (!SMOOTH.includes(key)) v = Math.round(v / st) * st;
  state[key] = clamp(v, lo, hi) || 0;
  linkThickness(key); update();
}
// One step up / down. `coarse` (wheel) uses a bigger unit on long ranges, `big` (Shift) is ×10.
function nudgeParam(key, n, big, coarse) {
  const [lo, hi, st] = LIMITS[key];
  let unit = st;
  if (coarse && (hi - lo) / st > 200) unit = Math.max(st, Math.round((hi - lo) / 200 / st) * st);
  if (big) unit *= 10;
  let v = (SMOOTH.includes(key) ? Math.round(state[key]) : state[key]) + n * unit;
  if (ROT.includes(key)) v = wrap180(v);
  if (key === 'gradAngle') v = ((v % 360) + 360) % 360;
  setParam(key, v);
}

// ---------- UI builders ----------
function makeDial(parent, key, label, cls = '') {
  const [min, max, step] = LIMITS[key], smax = SLIDER_MAX[key] ?? max, kbd = KEY_OF[key];
  const el = document.createElement('div');
  el.className = 'dial'; el.dataset.key = key; el.dataset.label = label;
  const u = UNITS[key] ? `<span class="dialUnit">${UNITS[key]}</span>` : '';
  el.innerHTML = `<span class="dialFill"></span><kbd class="cap ${cls}">${kbd}</kbd><span class="dialName" data-x="${label}"></span>` +
    `<input type="range" min="${min}" max="${smax}" step="${SMOOTH.includes(key) ? 'any' : step}">` +
    `<span class="dialVal"><input class="dialNum" type="number" min="${min}" max="${max}" step="${step}">${u}</span>`;
  parent.appendChild(el);
  const [range, num] = el.querySelectorAll('input');
  range.addEventListener('input', () => setParam(key, SMOOTH.includes(key) ? Math.round(+range.value) : +range.value));
  range.addEventListener('keydown', (e) => {   // Shift + arrows, PageUp / PageDown = large step
    const d = { ArrowRight: 1, ArrowUp: 1, PageUp: 1, ArrowLeft: -1, ArrowDown: -1, PageDown: -1 }[e.key];
    if (!d || !(e.shiftKey || e.key.startsWith('Page'))) return;
    e.preventDefault(); e.stopPropagation(); nudgeParam(key, d, true);
  });
  range.addEventListener('dblclick', () => setParam(key, DEFAULTS[key]));   // double-click = default value
  num.addEventListener('change', () => { setParam(key, num.value); num.value = fmtVal(key); });
  num.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.stopPropagation(); num.blur(); } });
  // A drag that starts on the value must scrub, not select text; a plain click opens it for typing.
  num.addEventListener('pointerdown', (e) => {
    if (document.activeElement === num) return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY;
    addEventListener('pointerup', (u2) => { if (Math.hypot(u2.clientX - x0, u2.clientY - y0) < 4) { num.focus(); num.select(); } }, { once: true });
  });
  dials[key] = { el, range, num };
}
function makeToggle(parent, id, label, kbd, tipKey) {
  const el = document.createElement('label');
  el.className = 'tog';
  if (tipKey) el.dataset.xTip = tipKey;
  el.innerHTML = `<kbd class="cap">${capText(kbd)}</kbd><span class="togName" data-x="${label}"></span><input type="checkbox" role="switch" class="switch" id="${id}">`;
  parent.appendChild(el);
  return el;
}

function buildUI() {
  document.querySelectorAll('i[data-icon]').forEach((i) => { i.outerHTML = ICONS[i.dataset.icon] || IC[i.dataset.icon] || ''; });
  document.querySelectorAll('kbd[data-k]').forEach((k) => { k.textContent = fmtKeys(k.dataset.k); });

  // left: ring structure, gap
  const rb = $('ringDials');
  makeDial(rb, 'rings', 'rings');
  makeDial(rb, 'r0', 's_r0');
  const pair = document.createElement('div'); pair.className = 'linkPair';
  pair.innerHTML = `<div class="linkBars"></div><button class="linkBtn" type="button" id="linkBtn" data-kbd="L">${IC.chain}</button>`;
  rb.appendChild(pair);
  makeDial(pair.firstChild, 'step', 'step');
  makeDial(pair.firstChild, 'thickness', 'thickness');
  makeToggle(rb, 'swShift', 'shift', 'F');
  makeToggle(rb, 'swCore', 's_core', 'C', 'core');
  const gb = $('gapDials');
  makeDial(gb, 'gap', 'gap');
  makeDial(gb, 'twist', 's_twist');
  makeToggle(gb, 'swVariation', 's_variation', 'shift+U', 'variation');
  // right: view
  makeDial($('scaleDial'), 'scale', 'scale');
  makeDial($('rotDials'), 'rotX', 'rotX', 'axX');
  makeDial($('rotDials'), 'rotY', 'rotY', 'axY');
  makeDial($('rotDials'), 'rotZ', 'rotZ', 'axZ');
  // bottom: draw
  const ds = $('drawStrip');
  makeDial(ds, 'skip', 's_skip');
  makeDial(ds, 'draw', 'draw');
  makeDial(ds, 'dropout', 's_dropout');
  makeDial(ds, 'seed', 'seed');

  // top: tools, presets, format
  $('themeBtn').addEventListener('click', toggleTheme);
  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);
  $('cheatsBtn').addEventListener('click', () => toggleCheats());
  for (const l of LANGS) {
    const o = document.createElement('option');
    o.value = l; o.textContent = (l === 'kk' ? 'kz' : l).toUpperCase();
    $('langs').appendChild(o);
  }
  $('langs').addEventListener('change', (e) => { lang = e.target.value; store.set('kp.lang', lang); applyLang(); update(); e.target.blur(); });
  for (const v of Object.keys(VARIANTS)) {
    const b = document.createElement('button');
    b.className = 'presetCard'; b.dataset.v = v; b.type = 'button'; b.dataset.xTip = 'v_' + v;
    b.innerHTML = '<span class="thumb"></span><span class="num"></span>';
    b.addEventListener('click', () => { Object.assign(state, VARIANTS[v], { variant: v }); update(); });
    $('variants').appendChild(b);
  }
  $('addPreset').addEventListener('click', addUserPreset);
  $('resetTop').addEventListener('click', () => {   // everything except the chosen preset and the format
    const { variant, width, height } = state;
    const up = userPreset(variant);
    state = Object.assign(up ? fromQuery(up.q) : Object.assign(structuredClone(DEFAULTS), VARIANTS[variant] || {}), { variant, width, height });
    update(); toast(t('resetDone'));
  });
  RATIOS.forEach(([a, b], i) => {
    const btn = document.createElement('button');
    btn.className = 'ratioBtn'; btn.type = 'button';
    btn.innerHTML = `<i style="width:${a >= b ? 15 : Math.max(5, Math.round(15 * a / b))}px;height:${a >= b ? Math.max(5, Math.round(15 * b / a)) : 15}px"></i>`;
    btn.dataset.tip = `${a}:${b}`; btn.setAttribute('aria-label', `${a}:${b}`);
    btn.addEventListener('click', () => setRatio(i));
    $('ratios').appendChild(btn);
  });
  for (const k of ['width', 'height']) {
    $(k).addEventListener('input', (e) => {
      const v = Math.round(+e.target.value);
      if (v >= 16 && v <= 20000) { state[k] = v; update(); }
    });
    $(k).addEventListener('change', (e) => { state[k] = +e.target.value || state[k]; clampAll(state); update(); });
    $(k).addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.stopPropagation(); e.target.blur(); } });
    $(k).addEventListener('focus', (e) => e.target.select());
    scrubLabel($(k === 'width' ? 'wL' : 'hL'), $(k), 10);
  }
  $('swapWH').addEventListener('click', () => animateSize([state.height, state.width]));

  // switches and buttons
  // switch ids are prefixed: the exported SVG inside the frame has its own #core
  $('swShift').addEventListener('change', (e) => animateShift(e.target.checked ? 1 : 0));
  for (const [id, k] of Object.entries(SWITCHES)) $(id).addEventListener('change', (e) => { state[k] = e.target.checked; update(); });
  $('linkBtn').addEventListener('click', () => toggle('linkTS'));
  $('bgEye').addEventListener('click', () => toggle('bgOn'));
  $('viewMode').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { state.threeD = b.dataset.v === '1'; update(); }));
  $('scaleMode').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => switchScaleMode(b.dataset.v)));
  $('resetGeom').addEventListener('click', () => { for (const k of GEOM_KEYS) state[k] = DEFAULTS[k]; update(); toast(t('resetGeomDone')); });
  $('resetCam').addEventListener('click', () => resetView());
  $('centerBtn').addEventListener('click', frameAll);
  $('swapColors').addEventListener('click', () => swapColors());
  $('ringChip').addEventListener('click', () => togglePicker('ring'));
  $('bgChip').addEventListener('click', () => togglePicker('bg'));
  $('copyBtn').addEventListener('click', copySVG);
  $('downloadBtn').addEventListener('click', downloadSVG);
  $('shareBtn').addEventListener('click', shareLink);

  // Ctrl/Cmd + C anywhere copies the SVG — unless text is selected in a field or on the page.
  document.addEventListener('copy', (e) => {
    const a = document.activeElement;
    const fieldSel = a && /INPUT|TEXTAREA/.test(a.tagName) && a.type !== 'number' && a.selectionStart !== a.selectionEnd;
    if (fieldSel || String(window.getSelection() || '').length > 0) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', buildSVG(state));
    toast(t('copied'));
  });
  // Mouse clicks must not leave focus on a control: Space (pan) or arrows (nudge) would then act on it.
  document.addEventListener('click', (e) => {
    const a = document.activeElement;
    if (e.detail > 0 && a && (a.tagName === 'BUTTON' || (a.tagName === 'INPUT' && /^(range|checkbox)$/.test(a.type)))) a.blur();
  });
  // Wheel over a dial or a size field changes it (up = more, Shift = ×10).
  document.addEventListener('wheel', (e) => {
    const d = e.target.closest?.('.dial'), f = e.target.closest?.('.dim')?.querySelector('input');
    if (!d && !f) return;
    e.preventDefault();
    const n = wheelSteps(e, d || f);
    if (!n) return;
    if (d) nudgeParam(d.dataset.key, n, e.shiftKey, true);
    else { f.value = clamp(+f.value + n * (e.shiftKey ? 100 : 10), 16, 20000); f.dispatchEvent(new Event('input', { bubbles: true })); }
  }, { passive: false });

  buildPicker();
  setupTips();
  setupStage();
  setupGizmo();
  setupKeys();
  $('cheats').addEventListener('pointerdown', (e) => { if (e.target === $('cheats')) toggleCheats(false); });
  const ro = new ResizeObserver(() => fitFrame());
  for (const id of ['formatBar', 'colL', 'colR', 'drawStrip']) ro.observe($(id));
  addEventListener('resize', () => { setUiScale(); fitFrame(); if (pk.open) placePicker(); });
}

let wAcc = 0, wEl = null;
function wheelSteps(e, el) {
  const d = e.deltaY || e.deltaX;
  if (el !== wEl) { wAcc = 0; wEl = el; }
  if (e.deltaMode !== 0 || Math.abs(d) >= 50) return -Math.sign(d);
  wAcc += d;
  const n = -Math.trunc(wAcc / 50);
  wAcc += n * 50;
  return n;
}

// Size label = scrub handle: drag left / right, Shift ×10, Alt ×0.1; a plain click focuses the field.
function scrubLabel(label, inp, step, pps = 2) {
  let dragged = false;
  label.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX, v0 = +inp.value, min = +inp.min, max = +inp.max;
    let acc = 0, last = x0; dragged = false;
    label.setPointerCapture(e.pointerId); document.body.classList.add('scrubbing');
    const move = (m) => {
      acc += (m.clientX - last) / pps * (m.shiftKey ? 10 : m.altKey ? 0.1 : 1); last = m.clientX;
      if (Math.abs(m.clientX - x0) > 2) dragged = true;
      if (!dragged) return;
      const q = m.altKey ? step / 10 : step;
      const v = clamp(Math.round((v0 + acc * step) / q) * q, min, max);
      if (v !== +inp.value) { inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    const up = () => {
      label.removeEventListener('pointermove', move); label.removeEventListener('pointerup', up); label.removeEventListener('pointercancel', up);
      document.body.classList.remove('scrubbing');
      if (!dragged) { inp.focus(); inp.select(); }
    };
    label.addEventListener('pointermove', move); label.addEventListener('pointerup', up); label.addEventListener('pointercancel', up);
  });
  label.addEventListener('click', (e) => e.preventDefault());
}

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

const onOff = (v) => t(v ? 'on' : 'off');
// Switches by name, shared by the controls and the keys. `say` shows the result in the HUD (keyboard use).
function toggle(key, say) {
  if (key === 'shift') {
    const to = (shiftTarget != null ? shiftTarget : state.shift) > 0 ? 0 : 1;
    animateShift(to); if (say) flash(t('shift'), onOff(to));
    return;
  }
  state[key] = !state[key];
  if (key === 'linkTS' && state.linkTS) state.tsRatio = clamp(state.thickness / state.step, ...LIMITS.tsRatio.slice(0, 2));
  update();
  if (say) flash(t({ core: 'core', variation: 'variation', gradient: 'gradientOn', bgOn: 'bgOn', linkTS: 'linkTS' }[key]), onOff(state[key]));
}
function swapColors(say) {
  const s = state;
  [s.ringColor, s.bgColor] = [s.bgColor, s.ringColor];
  [s.ringOpacity, s.bgOpacity] = [s.bgOpacity, s.ringOpacity];
  s.bgOn = true; update();
  if (say) flash(t('colors'), `${s.ringColor} ⇄ ${s.bgColor}`);
}
// Next / previous brand colour (brand gradient when the gradient is on).
function cycleColor(target, dir) {
  const s = state;
  if (target === 'ring' && s.gradient) {
    const i = GRADS.findIndex((g) => g.c.join() === s.grad.join().toUpperCase()), n = GRADS.length;
    const g = GRADS[i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n];
    s.grad = [...g.c]; s.gradAngle = g.a; update();
    flash(t('gradTab'), `${GRADS.indexOf(g) + 1} / ${n}`);
    return;
  }
  const list = target === 'ring' ? RING_COLORS : BG_COLORS, key = target === 'ring' ? 'ringColor' : 'bgColor', n = list.length;
  const i = list.indexOf(s[key].toUpperCase());
  s[key] = list[i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n];
  if (target === 'bg') s.bgOn = true;
  update();
  flash(t(target === 'ring' ? 'ring' : 'bg'), DS_NAMES[s[key]] ? DS_NAMES[s[key]].split(' · ').pop() : s[key]);
}

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-x]').forEach((el) => { el.textContent = t(el.dataset.x); });
  document.querySelectorAll('[data-x-tip]').forEach((el) => { el.dataset.tip = t(el.dataset.xTip); if (el.tagName === 'BUTTON') el.setAttribute('aria-label', t(el.dataset.xTip)); });
  document.querySelectorAll('[data-x-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.xAria)));
  for (const [key, d] of Object.entries(dials)) {
    d.range.setAttribute('aria-label', pname(key));
    d.el.dataset.kbd = KEY_OF[key];
    if (d.el.dataset.label !== key && pname(key) !== t(d.el.dataset.label)) d.el.dataset.tip = pname(key);   // short label: the tooltip gives the full name
    else delete d.el.dataset.tip;
  }
  $('gizmo').dataset.tip = t('gizmoTip'); $('gizmo').setAttribute('aria-label', t('gizmoTip'));
  $('langs').value = lang;
  document.title = t('title');
  buildCheats();
  renderUserPresets();
  if (pk.open) { pk.swKey = ''; renderPicker(); }
}

function buildCheats() {
  const mod = fmtKeys('mod'), alt = fmtKeys('alt');
  const mb = lang === 'en' ? { 'ЛКМ': 'LMB', 'СКМ': 'MMB', 'ПКМ': 'RMB', 'Колесо': 'Wheel' } : lang === 'kk' ? { 'ЛКМ': 'СТБ', 'СКМ': 'ОТБ', 'ПКМ': 'ОңТБ', 'Колесо': 'Дөңгелек' } : {};
  const tr = (x) => x.replace(/ЛКМ|СКМ|ПКМ|Колесо/g, (m) => mb[m] || m);
  // a key is either a combo for fmtKeys ('shift+U') or literal text prefixed with '='
  const K = (k) => `<kbd>${escHtml(k[0] === '=' ? tr(k.slice(1)) : fmtKeys(k))}</kbd>`;
  const P = (key) => [pname(key), KEY_OF[key]];
  const groups = [
    ['c_geom', [P('rings'), P('r0'), P('step'), P('thickness'), [t('linkTS'), 'L'], [t('shift'), 'F'], [t('core'), 'C'], P('gap'), P('twist'), [t('variation'), 'shift+U'],
      P('skip'), P('draw'), P('dropout'), P('seed')]],
    ['c_view', [[t('viewMode'), 'V'], P('scale'), [t('h_zoom'), '=+', '=−', '0'], P('rotX'), P('rotY'), P('rotZ'), [t('k_frame'), 'H'], [t('resetCam'), 'shift+H'], [t('h_nudge'), '=← ↑ → ↓']]],
    ['c_color', [[t('h_ringPick'), 'Q'], [t('h_bgPick'), 'B'], [t('bgOn'), 'shift+B'], [t('gradientOn'), 'G'], P('gradAngle'), [t('swapColors'), 'shift+Q'],
      [t('h_cycleRing'), '=[', '=]'], [t('h_cycleBg'), 'shift+[', 'shift+]'], [t('eyedropper'), 'I']]],
    ['c_format', [[t('h_preset'), '=1 … 9'], [t('h_ratio'), '=,', '=.']]],
    ['c_general', [[t('undo'), 'mod+Z'], [t('redo'), 'shift+mod+Z'], [t('copy'), 'mod+C'], [t('download'), 'mod+S'], [t('hideUI'), 'mod+.'], [t('theme'), 'D'], [t('shortcuts'), '=?'], [t('h_dbl'), '=' + t('h_dblK')]]],
    ['c_mouse', [[t('k_orbit') + ' (3D)', '=ЛКМ'], [t('k_move2d'), '=ЛКМ'], [t('k_move'), '=СКМ', `=${alt} + ЛКМ`, `=${t('k_space')} + ЛКМ`], [t('k_zoom'), '=Колесо', '=ПКМ'],
      [t('k_roll'), `=${mod} + ЛКМ ↔`, `=${mod} + Колесо`], [t('k_rings'), `=${mod} + ЛКМ ↕`]]],
  ];
  $('cheatsBox').innerHTML = `<div class="cheatsTop"><h1>${t('shortcuts')}</h1><button class="ibtn" type="button" id="cheatsClose" aria-label="Esc">${ICONS.close}</button></div>` +
    `<p class="cheatsLead">${t('holdHint')}</p><div class="cheatsGrid">` +
    groups.map(([title, rows]) => `<section><h2>${t(title)}</h2><ul>${rows.map(([name, ...keys]) =>
      `<li><span>${escHtml(name)}</span><span>${keys.map(K).join('')}</span></li>`).join('')}</ul></section>`).join('') + '</div>';
  $('cheatsClose').addEventListener('click', () => toggleCheats(false));
}
function toggleCheats(on = $('cheats').hidden) { $('cheats').hidden = !on; }

// ---------- render ----------
let sizeRaf = 0, sizeTarget = null;
// Format change (ratio stop, swap) eases over 150 ms; thumbnails wait until it ends.
function animateSize([tw, th]) {
  cancelAnimationFrame(sizeRaf);
  const fw = state.width, fh = state.height, t0 = performance.now(), D = 150;
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
  sizeTarget = [tw, th];
  let lw = fw, lh = fh;
  const step = (now) => {
    if (state.width !== lw || state.height !== lh) { sizeRaf = 0; sizeTarget = null; update(); return; }   // changed elsewhere
    const x = Math.min(1, (now - t0) / D), k = ease(x);
    state.width = lw = Math.round(fw + (tw - fw) * k);
    state.height = lh = Math.round(fh + (th - fh) * k);
    if (x < 1) { sizeRaf = requestAnimationFrame(step); render(); }
    else { sizeRaf = 0; sizeTarget = null; update(); }
  };
  sizeRaf = requestAnimationFrame(step);
}
const curSize = () => sizeTarget || [state.width, state.height];
function setRatio(i) {
  const [a, b] = RATIOS[i], L = Math.max(...curSize());
  animateSize(a >= b ? [L, Math.round(L * b / a)] : [Math.round(L * a / b), L]);
}
// Next stop towards landscape (dir 1) or portrait (dir -1) from wherever the current ratio is.
function stepRatio(dir) {
  const [w, h] = curSize(), r = Math.log(w / h), logs = RATIOS.map(([a, b]) => Math.log(a / b));
  const i = dir > 0 ? logs.findIndex((l) => l > r + 0.004) : logs.findLastIndex((l) => l < r - 0.004);
  if (i < 0) return;
  setRatio(i);
  flash(t('format'), RATIOS[i].join(':'));
}

let shiftRaf = 0, shiftTarget = null;
function animateShift(to) {
  cancelAnimationFrame(shiftRaf);
  const from = state.shift, t0 = performance.now(), D = 150;
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
  shiftTarget = to;
  let last = from;
  const step = (now) => {
    if (state.shift !== last) { shiftRaf = 0; shiftTarget = null; update(); return; }
    const x = Math.min(1, (now - t0) / D);
    state.shift = last = from + (to - from) * ease(x);
    if (x < 1) { shiftRaf = requestAnimationFrame(step); render(); }
    else { state.shift = to; shiftRaf = 0; shiftTarget = null; update(); }
  };
  shiftRaf = requestAnimationFrame(step);
}

let hashTimer, histTimer, renderRaf = 0, fitKey = '';
function update() { if (!renderRaf) renderRaf = requestAnimationFrame(render); }
function render() {
  cancelAnimationFrame(renderRaf); renderRaf = 0;
  const s = state, act = activeKey();
  $('frame').innerHTML = buildSVG(s);
  for (const [k, d] of Object.entries(dials)) {
    const v = fmtVal(k);
    if (document.activeElement !== d.num) { d.num.value = v; d.num.style.width = v.length + 'ch'; }
    d.range.value = s[k];
    d.el.style.setProperty('--f', clamp((s[k] - d.range.min) / ((d.range.max - d.range.min) || 1), 0, 1));
    d.el.classList.toggle('is-active', k === act);
  }
  for (const [id, k] of Object.entries(SWITCHES)) $(id).checked = !!s[k];
  $('swShift').checked = shiftTarget != null ? shiftTarget === 1 : s.shift > 0;
  $('linkBtn').classList.toggle('is-on', !!s.linkTS);
  $('linkBtn').dataset.tip = t('linkTS') + (s.linkTS ? ` · ${Math.round(s.tsRatio * 100)} %` : '');
  $('linkBtn').setAttribute('aria-label', t('linkTS')); $('linkBtn').setAttribute('aria-pressed', !!s.linkTS);
  $('viewMode').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', (b.dataset.v === '1') === !!s.threeD));
  $('scaleMode').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.v === s.scaleMode));
  dials.rotX.el.hidden = dials.rotY.el.hidden = !s.threeD;
  dials.gradAngle?.el.classList.toggle('is-off', !s.gradient);
  syncFormat();
  $('variants').querySelectorAll('.presetCard').forEach((b) => b.classList.toggle('is-active', b.dataset.v === s.variant));
  renderThumbs();
  syncColors();
  renderGizmo();
  renderPicker();
  renderHud();
  // Opaque background: paint the frame itself in that colour, so an anti-aliased SVG edge never shows the checkerboard.
  $('frame').style.background = s.bgOn && (s.bgOpacity ?? 100) >= 100 ? s.bgColor : '';
  if (fitKey !== s.width + 'x' + s.height) fitFrame(); else renderGhost();
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => history.replaceState(null, '', '#' + toQuery(state)), 250);
  clearTimeout(histTimer);
  histTimer = setTimeout(pushHistory, 400);
}

function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
function syncFormat() {
  const s = state, ae = document.activeElement;
  if (ae !== $('width')) $('width').value = s.width;
  if (ae !== $('height')) $('height').value = s.height;
  const [fw, fh] = curSize(), r = fw / fh;   // during the animation the stops and the label show the target
  let best = 0;
  const off = RATIOS.map(([a, b]) => Math.abs(Math.log(a / b / r)));
  off.forEach((o, i) => { if (o < off[best]) best = i; });
  $('ratios').querySelectorAll('.ratioBtn').forEach((b, i) => {
    b.classList.toggle('is-active', i === best && off[i] < 0.004);
    b.classList.toggle('is-near', i === best && off[i] >= 0.004);
  });
  const g = gcd(fw, fh), a = fw / g, b = fh / g;
  $('ratioText').textContent = a <= 20 && b <= 20 ? `${a}:${b}` : r >= 1 ? `${+r.toFixed(2)}:1` : `1:${+(1 / r).toFixed(2)}`;
}

// The edge controls need about 1240 × 700; in a smaller window their layer scales down as a whole.
let uiK = 1;
function setUiScale() {
  uiK = Math.min(1, innerWidth / 1240, innerHeight / 700);
  $('ui').style.setProperty('--k', uiK);
}
// The frame sits in the middle of what the edge controls leave free.
function safeRect() {
  const vw = innerWidth, vh = innerHeight;
  if (document.body.classList.contains('bare')) return { l: 24, t: 24, r: vw - 24, b: vh - 24 };
  const L = $('colL').getBoundingClientRect(), R = $('colR').getBoundingClientRect(), F = $('formatBar').getBoundingClientRect(), S = $('drawStrip').getBoundingClientRect();
  return { l: L.right + 24 * uiK, r: R.left - 24 * uiK, t: F.bottom + 18 * uiK, b: S.top - 18 * uiK };
}
let ghostGeo = null;
function fitFrame() {
  const fr = $('frame'), r = safeRect();
  fitKey = state.width + 'x' + state.height;
  const aw = Math.max(120, r.r - r.l), ah = Math.max(120, r.b - r.t);
  const k = Math.min(aw / state.width, ah / state.height);
  // whole device pixels: a fractional edge lets the checkerboard bleed through as a hairline
  const dpr = devicePixelRatio || 1, snap = (v) => Math.max(1, Math.round(v * dpr)) / dpr;
  const w = snap(state.width * k), h = snap(state.height * k);
  const left = snap(r.l + (aw - w) / 2), top = snap(r.t + (ah - h) / 2);
  fr.style.width = w + 'px'; fr.style.height = h + 'px'; fr.style.left = left + 'px'; fr.style.top = top + 'px';
  ghostGeo = { k, left, top };
  renderGhost();
}
// Preview only: the pattern continued outside the format in a low-contrast colour, under the whole window.
function renderGhost() {
  if (!ghostGeo) return;
  const { k, left, top } = ghostGeo;
  $('ghost').innerHTML = buildGhostSVG(state, -left / k, -top / k, innerWidth / k, innerHeight / k);
}
function toggleBare() {
  const on = document.body.classList.toggle('bare');
  closePicker(); fitFrame();
  if (on) toast(`${t('bareHint')} ${fmtKeys('mod+.')}`);
}

// Preset thumbnails: brand defaults + variant in the current format and colours. Rebuilt only when those change.
let thumbKey = '', thumbsHold = false;
function renderThumbs() {
  if (sizeTarget || thumbsHold) return;
  const s = state, key = [s.width, s.height, s.ringColor, s.bgColor, s.bgOn, s.grad.join(), s.ringOpacity, s.bgOpacity, s.gradOpacity.join()].join('|');
  if (key === thumbKey) return;
  thumbKey = key;
  $('variants').querySelectorAll('.presetCard').forEach((b) => {
    const up = userPreset(b.dataset.v);
    const ts = up ? Object.assign(fromQuery(up.q), { width: s.width, height: s.height })
      : Object.assign(structuredClone(DEFAULTS), VARIANTS[b.dataset.v],
        { width: s.width, height: s.height, ringColor: s.ringColor, bgColor: s.bgColor, bgOn: s.bgOn, grad: s.grad, ringOpacity: s.ringOpacity, bgOpacity: s.bgOpacity, gradOpacity: s.gradOpacity });
    b.querySelector('.thumb').innerHTML = buildSVG(ts)
      .replace('<svg ', '<svg preserveAspectRatio="xMidYMid slice" ')
      .replace(/kp-(grad|clip)/g, `kpt-${b.dataset.v.replace(':', '-')}-$1`)
      .replace(/ id="(?!kpt-)[^"]*"/g, '');
  });
}

// ---------- colour rows ----------
const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
const rgba = (hex, a = 100) => { const [r, g, b] = hex2rgb(hex); return `rgba(${r},${g},${b},${a / 100})`; };
function hue(r, g, b, mx, d) {
  if (!d) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
}
function rgb2hsv(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); return [hue(r, g, b, mx, d), mx ? d / mx : 0, mx]; }
function hsv2rgb(h, s, v) { const f = (n) => { const k = (n + h / 60) % 6; return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255; }; return [f(5), f(3), f(1)]; }
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; return [hue(r, g, b, mx, d), d ? d / (1 - Math.abs(2 * l - 1)) : 0, l]; }
function hsl2rgb(h, s, l) { const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255; }; return [f(0), f(8), f(4)]; }
// SVG gradient angle a (0 = left → right, 90 = top → bottom) is CSS angle a + 90.
const ringPaint = (s) => (s.gradient ? `linear-gradient(${s.gradAngle + 90}deg, ${s.grad.map((c, i) => rgba(c, s.gradOpacity[i])).join(',')})` : rgba(s.ringColor, s.ringOpacity));
const hexA = (hex, a) => hex.slice(1).toUpperCase() + (a < 100 ? ` ${a}%` : '');
function syncColors() {
  const s = state;
  $('ringChip').querySelector('.chipSw i').style.background = ringPaint(s);
  $('ringVal').textContent = s.gradient ? `${s.gradAngle}°` : hexA(s.ringColor, s.ringOpacity);
  $('bgChip').querySelector('.chipSw i').style.background = s.bgOn ? rgba(s.bgColor, s.bgOpacity) : 'none';
  $('bgVal').textContent = s.bgOn ? hexA(s.bgColor, s.bgOpacity) : t('none');
  $('bgEye').classList.toggle('is-off', !s.bgOn); $('bgEye').setAttribute('aria-pressed', !!s.bgOn);
  $('ringChip').classList.toggle('is-open', pk.open && pk.target === 'ring');
  $('bgChip').classList.toggle('is-open', pk.open && pk.target === 'bg');
}

// ---------- colour picker ----------
// Figma-style: saturation / brightness field, hue and opacity tracks, eyedropper, HEX / RGB / HSL / HSB fields,
// brand swatches, colours used in this design, recent colours. For rings it also switches solid ↔ gradient and
// edits the three gradient stops (select a stop, then pick its colour), with reverse / rotate / angle.
// HSV is kept here so the hue survives black, white and greys.
const pk = { open: false, target: 'ring', stop: 0, h: 215, s: 1, v: 1, model: 'hex', pos: null, swKey: '' };
function pkGet() {
  const s = state;
  if (pk.target === 'bg') return { hex: s.bgColor.toUpperCase(), a: s.bgOpacity };
  if (s.gradient) return { hex: s.grad[pk.stop].toUpperCase(), a: s.gradOpacity[pk.stop] };
  return { hex: s.ringColor.toUpperCase(), a: s.ringOpacity };
}
function pkSet(hex, a) {
  const s = state;
  if (a != null) a = clamp(Math.round(a), 0, 100);
  if (pk.target === 'bg') { if (hex) { s.bgColor = hex; s.bgOn = true; } if (a != null) s.bgOpacity = a; }
  else if (s.gradient) { if (hex) s.grad[pk.stop] = hex; if (a != null) s.gradOpacity[pk.stop] = a; }
  else { if (hex) s.ringColor = hex; if (a != null) s.ringOpacity = a; }
  update();
}
const pkFromHsv = () => pkSet(rgb2hex(...hsv2rgb(pk.h, pk.s, pk.v)));
function parseHex(v) {
  v = v.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(v)) v = v.replace(/./g, '$&$&');
  if (/^[0-9a-f]{8}$/i.test(v)) return { hex: '#' + v.slice(0, 6).toUpperCase(), a: Math.round(parseInt(v.slice(6), 16) / 2.55) };
  return /^[0-9a-f]{6}$/i.test(v) ? { hex: '#' + v.toUpperCase() } : null;
}
// Drag inside a box: fn(x 0…1, y 0…1). Thumbnails wait until the drag ends.
function dragArea(el, fn) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId); el.focus({ preventScroll: true });
    const r = el.getBoundingClientRect();
    const at = (m) => fn(clamp((m.clientX - r.left) / r.width, 0, 1), clamp((m.clientY - r.top) / r.height, 0, 1));
    thumbsHold = true; at(e);
    const up = () => { el.removeEventListener('pointermove', at); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); thumbsHold = false; update(); };
    el.addEventListener('pointermove', at); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
}
function buildPicker() {
  const p = $('picker');
  p.innerHTML = `<div class="pkHead" id="pkHead"><span class="pkTitle" id="pkTitle"></span>
      <button class="ibtn sm" type="button" id="pkEye" data-x-tip="bgOn" data-kbd="shift+B">${ICONS.eye}</button>
      <button class="ibtn sm" type="button" id="pkClose" aria-label="Esc">${ICONS.close}</button></div>
    <div class="seg" id="pkMode"><button type="button" data-v="0" data-x="solid"></button><button type="button" data-v="1" data-x="gradTab"></button></div>
    <div class="pkGrad" id="pkGrad">
      <div class="pkGradBar"><span class="pkGradFill" id="pkGradFill"></span>${[0, 1, 2].map((i) => `<button type="button" class="pkStop" data-i="${i}" style="left:${i * 50}%"><i></i></button>`).join('')}</div>
      <div class="pkGradTools"><div id="pkAngle"></div>
        <button class="ibtn sm" type="button" id="pkFlip" data-x-tip="reverse">${IC.swap}</button>
        <button class="ibtn sm" type="button" id="pkRot" data-x-tip="rot90">${ICONS.rotate}</button></div>
    </div>
    <div class="pkSV" id="pkSV" tabindex="0"><span class="pkDot" id="pkDot"></span></div>
    <div class="pkBars" id="pkBars"><button class="ibtn" type="button" id="pkDrop" data-x-tip="eyedropper" data-kbd="I">${IC.drop}</button>
      <div class="pkTracks"><div class="pkTrack pkHue" id="pkHue" tabindex="0"><span class="pkKnob"></span></div>
        <div class="pkTrack pkAlpha" id="pkAlpha" tabindex="0"><i id="pkAlphaFill"></i><span class="pkKnob"></span></div></div></div>
    <div class="pkFields"><select id="pkModel" aria-label="HEX / RGB / HSL / HSB"><option value="hex">HEX</option><option value="rgb">RGB</option><option value="hsl">HSL</option><option value="hsb">HSB</option></select>
      <div class="pkIn" id="pkIn"></div><label class="pkA"><input id="pkAin" type="number" min="0" max="100" step="1" data-x-aria="opacity"><span>%</span></label></div>
    <div class="pkSwT" data-x="brand"></div><div class="pkSw" id="pkBrand"></div>
    <div class="pkSwT" id="pkGradsT" data-x="brandGrads"></div><div class="pkSw grads" id="pkGrads"></div>
    <div class="pkSwT" data-x="inDoc"></div><div class="pkSw" id="pkDoc"></div>
    <div class="pkSwT" id="pkRecentT" data-x="recent"></div><div class="pkSw" id="pkRecent"></div>`;
  makeDial($('pkAngle'), 'gradAngle', 'angle');
  pk.model = store.get('kp.pickModel', 'hex');
  $('pkModel').value = pk.model;
  if (!('EyeDropper' in window)) $('pkBars').classList.add('noDrop');

  dragArea($('pkSV'), (x, y) => { pk.s = x; pk.v = 1 - y; pkFromHsv(); });
  dragArea($('pkHue'), (x) => { pk.h = x * 360; pkFromHsv(); });
  dragArea($('pkAlpha'), (x) => pkSet(null, x * 100));
  // arrows on the focused field / tracks (Shift = ×10)
  $('pkSV').addEventListener('keydown', (e) => {
    const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    const k = e.shiftKey ? 0.1 : 0.01;
    pk.s = clamp(pk.s + d[0] * k, 0, 1); pk.v = clamp(pk.v + d[1] * k, 0, 1); pkFromHsv();
  });
  const trackKeys = (el, fn) => el.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!d) return;
    e.preventDefault(); e.stopPropagation(); fn(d * (e.shiftKey ? 10 : 1));
  });
  trackKeys($('pkHue'), (d) => { pk.h = clamp(pk.h + d * 3.6, 0, 360); pkFromHsv(); });
  trackKeys($('pkAlpha'), (d) => pkSet(null, pkGet().a + d));

  $('pkModel').addEventListener('change', (e) => { pk.model = e.target.value; store.set('kp.pickModel', pk.model); $('pkIn').dataset.model = ''; renderPicker(); e.target.blur(); });
  $('pkIn').addEventListener('input', (e) => pkField(e.target, false));
  $('pkIn').addEventListener('change', (e) => { pkField(e.target, true); renderPicker(); });
  $('pkIn').addEventListener('focusin', (e) => e.target.select?.());
  $('pkAin').addEventListener('input', (e) => { const v = +e.target.value; if (e.target.value !== '' && v >= 0 && v <= 100) pkSet(null, v); });
  $('pkAin').addEventListener('change', (e) => { pkSet(null, +e.target.value || 0); e.target.value = pkGet().a; });
  $('pkAin').addEventListener('focus', (e) => e.target.select());
  p.addEventListener('keydown', (e) => {   // Enter / Esc leave a field (Esc drops what was typed); the next Esc closes the picker
    if (e.target.tagName !== 'INPUT' || (e.key !== 'Enter' && e.key !== 'Escape')) return;
    e.stopPropagation();
    if (e.key === 'Escape') e.target.value = '';
    e.target.blur(); renderPicker();
  });

  $('pkMode').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { state.gradient = b.dataset.v === '1'; update(); }));
  $('pkEye').addEventListener('click', () => toggle('bgOn'));
  $('pkClose').addEventListener('click', closePicker);
  p.querySelectorAll('.pkStop').forEach((b) => b.addEventListener('click', () => { pk.stop = +b.dataset.i; renderPicker(); }));
  $('pkFlip').addEventListener('click', () => { state.grad.reverse(); state.gradOpacity.reverse(); pk.stop = 2 - pk.stop; update(); });
  $('pkRot').addEventListener('click', () => { state.gradAngle = (state.gradAngle + 90) % 360; update(); });
  $('pkDrop').addEventListener('click', () => eyedrop());
  for (const id of ['pkBrand', 'pkDoc', 'pkRecent']) $(id).addEventListener('click', (e) => { const b = e.target.closest('.sw'); if (b) pkSet(b.dataset.c); });
  $('pkGrads').addEventListener('click', (e) => {
    const b = e.target.closest('.sw'); if (!b) return;
    const g = GRADS[+b.dataset.i];
    state.grad = [...g.c]; state.gradOpacity = [100, 100, 100]; state.gradAngle = g.a; state.gradient = true; update();
  });

  // drag the picker by its header
  $('pkHead').addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    const r = p.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top, h = $('pkHead');
    h.setPointerCapture(e.pointerId);
    const move = (m) => { pk.pos = { x: (m.clientX - dx) / uiK, y: (m.clientY - dy) / uiK }; placePicker(); };
    const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  });
  // a press outside closes it — except on the canvas, so the pattern can be turned while choosing a colour
  document.addEventListener('pointerdown', (e) => {
    if (!pk.open || e.target.closest('#picker, #colorIsle, #stage, .tipLayer')) return;
    closePicker();
  });
}
// A value typed into a HEX / RGB / HSL / HSB field. `final` (blur / Enter) also accepts short hex.
function pkField(inp, final) {
  if (pk.model === 'hex') {
    const c = parseHex(inp.value);
    if (c && (final || inp.value.replace('#', '').trim().length >= 6)) pkSet(c.hex, c.a);
    return;
  }
  const v = [...$('pkIn').querySelectorAll('input')].map((i) => +i.value);
  if (v.some((x) => !isFinite(x))) return;
  if (pk.model === 'rgb') pkSet(rgb2hex(...v));
  else if (pk.model === 'hsb') { pk.h = clamp(v[0], 0, 360); pk.s = clamp(v[1], 0, 100) / 100; pk.v = clamp(v[2], 0, 100) / 100; pkFromHsv(); }
  else { const rgb = hsl2rgb(clamp(v[0], 0, 360), clamp(v[1], 0, 100) / 100, clamp(v[2], 0, 100) / 100); [pk.h, pk.s, pk.v] = rgb2hsv(...rgb); pk.h = clamp(v[0], 0, 360); pkSet(rgb2hex(...rgb)); }
}
function renderPicker() {
  if (!pk.open) return;
  const s = state, isBg = pk.target === 'bg', grad = !isBg && s.gradient, { hex, a } = pkGet();
  if (rgb2hex(...hsv2rgb(pk.h, pk.s, pk.v)) !== hex) {   // changed from outside: re-derive, but keep the hue of greys
    const [h, sat, v] = rgb2hsv(...hex2rgb(hex));
    if (sat > 0 && v > 0) pk.h = h;
    pk.s = sat; pk.v = v;
  }
  $('pkTitle').textContent = t(isBg ? 'bg' : 'ring');
  $('pkMode').hidden = isBg; $('pkEye').hidden = !isBg; $('pkGrad').hidden = !grad;
  $('pkEye').classList.toggle('is-off', !s.bgOn);
  $('pkMode').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', (b.dataset.v === '1') === !!s.gradient));
  if (grad) {
    $('pkGradFill').style.backgroundImage = `linear-gradient(to right, ${s.grad.map((c, i) => rgba(c, s.gradOpacity[i])).join(',')})`;
    $('picker').querySelectorAll('.pkStop').forEach((b, i) => { b.firstChild.style.background = rgba(s.grad[i], s.gradOpacity[i]); b.classList.toggle('is-active', i === pk.stop); });
  }
  $('pkSV').style.setProperty('--h', pk.h);
  const dot = $('pkDot'); dot.style.left = pk.s * 100 + '%'; dot.style.top = (1 - pk.v) * 100 + '%'; dot.style.background = hex;
  $('pkHue').style.setProperty('--p', pk.h / 360);
  $('pkAlpha').style.setProperty('--p', a / 100);
  $('pkAlphaFill').style.background = `linear-gradient(to right, ${rgba(hex, 0)}, ${hex})`;
  // fields
  const box = $('pkIn');
  if (box.dataset.model !== pk.model) {
    box.dataset.model = pk.model;
    box.innerHTML = pk.model === 'hex' ? '<input class="pkHex" type="text" maxlength="9" spellcheck="false" autocomplete="off" aria-label="HEX">'
      : [...pk.model.toUpperCase()].map((c, i) => `<input type="number" min="0" max="${pk.model === 'rgb' ? 255 : i ? 100 : 360}" step="1" aria-label="${c}">`).join('');
  }
  const vals = pk.model === 'hex' ? [hex.slice(1)] : pk.model === 'rgb' ? hex2rgb(hex)
    : pk.model === 'hsb' ? [pk.h, pk.s * 100, pk.v * 100] : (() => { const [, sl, l] = rgb2hsl(...hex2rgb(hex)); return [pk.h, sl * 100, l * 100]; })();
  box.querySelectorAll('input').forEach((inp, i) => { if (document.activeElement !== inp) inp.value = pk.model === 'hex' ? vals[i] : Math.round(vals[i]); });
  if (document.activeElement !== $('pkAin')) $('pkAin').value = a;
  // swatches: rebuilt only when their content changes, so hover and tooltips survive a drag
  const doc = [...new Set([...(s.gradient ? s.grad : [s.ringColor]), ...(s.bgOn ? [s.bgColor] : [])].map((c) => c.toUpperCase()))];   // only what is painted now
  const recent = store.get('kp.recent', []);
  const key = [pk.target, grad, doc.join(), recent.join(), lang].join('|');
  if (key !== pk.swKey) {
    pk.swKey = key;
    const sw = (c) => `<button type="button" class="sw" data-c="${c}" data-tip="${swTitle(c)}" aria-label="${swTitle(c)}"><i style="background:${c}"></i></button>`;
    $('pkBrand').innerHTML = (isBg ? BG_COLORS : RING_COLORS).map(sw).join('');
    $('pkDoc').innerHTML = doc.map(sw).join('');
    $('pkRecent').innerHTML = recent.map(sw).join('');
    $('pkRecentT').hidden = $('pkRecent').hidden = !recent.length;
    $('pkGradsT').hidden = $('pkGrads').hidden = isBg;
    $('pkGrads').innerHTML = GRADS.map((g, i) => { const tip = g.c.map((c) => (DS_NAMES[c] ? DS_NAMES[c].split(' · ').pop() : c)).join(' → ');
      return `<button type="button" class="sw" data-i="${i}" data-tip="${tip}" aria-label="${tip}"><i style="background:linear-gradient(${g.a + 90}deg, ${g.c.join(',')})"></i></button>`; }).join('');
  }
  $('picker').querySelectorAll('#pkBrand .sw, #pkDoc .sw, #pkRecent .sw').forEach((b) => b.classList.toggle('on', b.dataset.c === hex));
  $('pkGrads').querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', s.gradient && GRADS[+b.dataset.i].c.join() === s.grad.join().toUpperCase()));
  if ($('picker').offsetHeight !== pk.h0) { pk.h0 = $('picker').offsetHeight; placePicker(); }   // solid ↔ gradient changes the height
}
// Default place: above the colour rows, over the left column — never over the canvas. Dragged position is kept.
function placePicker() {
  const p = $('picker'), w = p.offsetWidth, h = p.offsetHeight, a = $('colorIsle').getBoundingClientRect();   // layer px = screen px / uiK
  const x = pk.pos ? pk.pos.x : 8, y = pk.pos ? pk.pos.y : a.top / uiK - h - 8;
  p.style.left = clamp(x, 8, Math.max(8, innerWidth / uiK - w - 8)) + 'px';
  p.style.top = clamp(y, 8, Math.max(8, innerHeight / uiK - h - 8)) + 'px';
}
function openPicker(target) {
  pk.target = target; pk.open = true; pk.swKey = '';
  $('picker').hidden = false;
  render(); placePicker();
}
function closePicker() {
  if (!pk.open) return;
  rememberColor(pkGet().hex);
  pk.open = false; $('picker').hidden = true;
  syncColors();
}
function togglePicker(target) { if (pk.open && pk.target === target) closePicker(); else { if (pk.open) rememberColor(pkGet().hex); openPicker(target); } }
function rememberColor(hex) {
  if (RING_COLORS.includes(hex) || BG_COLORS.includes(hex)) return;
  const r = store.get('kp.recent', []).filter((c) => c !== hex);
  r.unshift(hex); store.set('kp.recent', r.slice(0, 14));
}
async function eyedrop() {
  if (!('EyeDropper' in window)) { toast(t('noDrop')); return; }
  try {
    const { sRGBHex } = await new window.EyeDropper().open();
    const c = parseHex(sRGBHex); if (!c) return;
    if (!pk.open) pk.target = 'ring';
    pkSet(c.hex); rememberColor(c.hex); pk.swKey = ''; update();
  } catch { /* cancelled */ }
}

// ---------- axis gizmo ----------
// Shows where the pattern's own axes point: X (red) towards 3 o'clock, Y (green) towards 6 o'clock — Y grows downwards,
// as in Figma — and Z (blue), the normal of the ring plane, towards the viewer. Same rotation order as pattern.js
// makeProjector (Z in the plane, then X, then Y), orthographic. In 2D only the in-plane turn is left.
// Drag = orbit (Shift snaps to 15°); drag a ball = that rotation only; click a ball = select that rotation for the
// keyboard; double-click = reset the camera.
function rotator() {
  const s = state, z = rad(s.rotZ), x = rad(s.threeD ? s.rotX : 0), y = rad(s.threeD ? s.rotY : 0);
  const cz = Math.cos(z), sz = Math.sin(z), cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y);
  return ([vx, vy, vz]) => {
    const x1 = vx * cz - vy * sz, y1 = vx * sz + vy * cz;
    const y2 = y1 * cx - vz * sx, z2 = y1 * sx + vz * cx;
    return [x1 * cy + z2 * sy, y2, -x1 * sy + z2 * cy];   // screen x, screen y (down), depth (+ = away)
  };
}
function renderGizmo() {
  const R = rotator(), L = 34, n2 = (v) => +v.toFixed(2), act = activeKey();
  const AX = [['x', [1, 0, 0], 'var(--ax-x)', 'rotX'], ['y', [0, 1, 0], 'var(--ax-y)', 'rotY'], ['z', [0, 0, -1], 'var(--ax-z)', 'rotZ']];
  const items = [];
  for (const [k, v, col, key] of AX) {
    const p = R(v).map((c) => c * L), q = p.map((c) => -c);
    const usable = state.threeD || k === 'z';
    items.push({ z: p[2], html: `<g class="gzBall${p[2] > 6 ? ' far' : ''}${act === key ? ' is-active' : ''}" data-ax="${usable ? k : 'z'}">` +
      `<line x1="0" y1="0" x2="${n2(p[0])}" y2="${n2(p[1])}" stroke="${col}"/><circle cx="${n2(p[0])}" cy="${n2(p[1])}" r="8.5" fill="${col}"/>` +
      `<text x="${n2(p[0])}" y="${n2(p[1])}">${k.toUpperCase()}</text></g>` });
    items.push({ z: q[2], html: `<circle class="gzNeg" cx="${n2(q[0])}" cy="${n2(q[1])}" r="4" fill="${col}"/>` });
  }
  items.sort((a, b) => b.z - a.z);   // far first
  // the ring plane: a disc and two arcs, so the tilt reads at a glance
  const circle = (r, a0, a1) => { const pts = []; for (let i = 0; i <= 40; i++) { const a = rad(a0 + (a1 - a0) * i / 40), p = R([Math.cos(a) * r, Math.sin(a) * r, 0]); pts.push(`${n2(p[0])} ${n2(p[1])}`); } return 'M' + pts.join('L'); };
  const ring = state.gradient ? state.grad[1] : state.ringColor;
  const plane = `<path class="gzDisc" d="${circle(26, 0, 360)}Z" fill="${ring}" fill-opacity=".14"/>` +
    `<path class="gzArc" d="${circle(17, 180, 360)}" stroke="${ring}" stroke-width="3.5" stroke-opacity=".7"/><path class="gzArc" d="${circle(20, 180, 0)}" stroke="${ring}" stroke-width="3.5" stroke-opacity=".7"/>`;
  $('gizmo').innerHTML = `<circle class="gzRim" r="50"/>${plane}${items.map((i) => i.html).join('')}`;
}
function setupGizmo() {
  const gz = $('gizmo');
  let g = null;
  gz.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); gz.setPointerCapture(e.pointerId);
    const r = gz.getBoundingClientRect(), ax = e.target.closest?.('.gzBall')?.dataset.ax || null;
    g = { x: e.clientX, y: e.clientY, cx: r.left + r.width / 2, cy: r.top + r.height / 2, ax, s: { ...state }, moved: false };
    g.a0 = Math.atan2(e.clientY - g.cy, e.clientX - g.cx);
  });
  gz.addEventListener('pointermove', (e) => {
    if (!g) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < 3) return;
    g.moved = true;
    const snap = (v) => (e.shiftKey ? Math.round(v / 15) * 15 : v), mode = !state.threeD || g.ax === 'z' ? 'z' : g.ax || 'orbit';
    if (mode === 'z') state.rotZ = wrap180(snap(g.s.rotZ + (Math.atan2(e.clientY - g.cy, e.clientX - g.cx) - g.a0) * 180 / Math.PI));
    if (mode === 'orbit' || mode === 'y') state.rotY = wrap180(snap(g.s.rotY - dx * 0.8));   // same directions as the orbit on the canvas
    if (mode === 'orbit' || mode === 'x') state.rotX = wrap180(snap(g.s.rotX + dy * 0.8));
    clampAll(state); update();
  });
  const end = () => {
    if (!g) return;
    const { moved, ax } = g; g = null;
    if (!moved && ax) { const key = 'rot' + ax.toUpperCase(); if (armed === key) disarm(); else arm(key); }
  };
  gz.addEventListener('pointerup', end); gz.addEventListener('pointercancel', end);
  gz.addEventListener('dblclick', () => resetView());
  gz.addEventListener('keydown', (e) => {   // focused gizmo: arrows orbit (2D: turn), Shift = 15°
    const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    const k = e.shiftKey ? 15 : 1;
    if (!state.threeD) state.rotZ = wrap180(state.rotZ + (d[0] - d[1]) * k);
    else { state.rotY = wrap180(Math.round(state.rotY) - d[0] * k); state.rotX = wrap180(Math.round(state.rotX) + d[1] * k); }
    update();
  });
}

// H: keep the angle, bring the pattern back into the frame (2D: centre it).
function frameAll() {
  if (!state.threeD) { state.cx = 0.5; state.cy = 0.5; update(); return; }
  state.panX = 0; state.panY = 0; state.camDist = DEFAULTS.camDist; update();
}
// Shift + H: the whole view back to its start (3D: centre, X -30 / Y 30 / Z 0; 2D: centre, no turn).
function resetView(say) {
  if (state.threeD) Object.assign(state, CAM_HOME);
  else Object.assign(state, { cx: 0.5, cy: 0.5, rotZ: 0 });
  update(); if (say) flash(t('resetCam'));
}

// ---------- canvas navigation (the whole window is the canvas) ----------
// 3D: LMB orbit, MMB / Alt + LMB / Space + LMB pan; 2D: LMB or MMB move. Both: RMB drag or wheel = scale,
// Ctrl/Cmd + LMB — horizontal = rotation Z, vertical = rings; Ctrl/Cmd + wheel = rotation Z.
// While a parameter is selected from the keyboard, the wheel changes that parameter instead of the scale.
let dragging = false, space = false;
const MODES = ['drag', 'c4d-orbit', 'c4d-pan', 'c4d-zoom', 'c4d-roll', 'c4d-rings', 'c4d-ctrl', 'c4d-move'];
function setupStage() {
  const st = $('stage'), fr = $('frame');
  let start = null;
  st.addEventListener('contextmenu', (e) => e.preventDefault());
  st.addEventListener('auxclick', (e) => e.preventDefault());
  st.addEventListener('pointerdown', (e) => {
    let mode;
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) mode = 'ctrl';
    else if (e.button === 0 && (e.altKey || space)) mode = state.threeD ? 'pan' : 'move';
    else if (state.threeD) mode = ['orbit', 'pan', 'zoom'][e.button];
    else mode = ['move', 'move', 'zoom'][e.button];
    if (!mode) return;
    e.preventDefault();
    document.activeElement?.blur?.();
    start = { x: e.clientX, y: e.clientY, mode, s: { ...state } };
    dragging = true;
    st.setPointerCapture(e.pointerId); st.classList.add('drag', 'c4d-' + mode);
  });
  st.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y, s0 = start.s;
    const toLocal = state.width / fr.clientWidth / scaleFactor(state);   // screen px -> pattern units
    if (start.mode === 'ctrl') {
      if (Math.hypot(dx, dy) < 4) return;
      start.mode = Math.abs(dx) >= Math.abs(dy) ? 'roll' : 'rings';
      start.x = e.clientX; start.y = e.clientY;
      st.classList.remove('c4d-ctrl'); st.classList.add('c4d-' + start.mode);
      return;
    }
    if (start.mode === 'rings') {
      const n = Math.round(s0.rings - dy / 16);
      if (n === state.rings) return;
      state.rings = n;
    } else if (start.mode === 'roll') state.rotZ = wrap180(s0.rotZ + dx * 0.4);
    else if (start.mode === 'orbit') { state.rotY = wrap180(s0.rotY - dx * 0.4); state.rotX = wrap180(s0.rotX + dy * 0.4); }
    else if (start.mode === 'pan') { state.panX = s0.panX + dx * toLocal; state.panY = s0.panY + dy * toLocal; }
    else if (start.mode === 'zoom') state.scale = s0.scale * Math.exp((dx - dy) * 0.004);
    else { state.cx = s0.cx + dx / fr.clientWidth; state.cy = s0.cy + dy / fr.clientHeight; }
    clampAll(state); update();
  });
  const end = () => { if (!start) return; start = null; dragging = false; st.classList.remove(...MODES); };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  st.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (armed && !(e.ctrlKey || e.metaKey)) { const n = wheelSteps(e, st); if (n) nudgeParam(armed, n, e.shiftKey); return; }
    if (e.ctrlKey || e.metaKey) {   // roll in whole degrees, at least 1° per tick
      const d = -e.deltaY * 0.1;
      state.rotZ = wrap180(state.rotZ + Math.sign(d) * Math.max(1, Math.round(Math.abs(d))));
    } else state.scale *= Math.exp(-e.deltaY * 0.0015);
    clampAll(state); update();
  }, { passive: false });
}

// ---------- keyboard ----------
// hold  — a parameter key is down; moving the mouse scrubs it (no button needed), releasing the key ends it.
// armed — the key was tapped: the parameter is selected; arrows / wheel step it, digits + Enter type a value.
let hold = null, armed = null, buf = '', flashMsg = null;
const mouse = { x: null, y: null };
const activeKey = () => (hold && hold.moved ? hold.key : armed);
const typing = () => { const a = document.activeElement; return !!a && (/SELECT|TEXTAREA/.test(a.tagName) || (a.tagName === 'INPUT' && /^(text|number|search|email|url)$/.test(a.type)) || a.isContentEditable); };
function arm(key) { armed = key; buf = ''; flashMsg = null; update(); }
function disarm() { if (!armed) return; armed = null; buf = ''; update(); }
function available(key) {
  if ((key === 'rotX' || key === 'rotY') && !state.threeD) { toast(t('only3d')); return false; }
  if (key === 'gradAngle' && !state.gradient) { toast(t('needGrad')); return false; }
  return true;
}
function endHold(cancel) {
  if (!hold) return;
  const h = hold; hold = null;
  document.body.classList.remove('scrubbing');
  if (cancel && h.moved) setParam(h.key, h.v0);
  update();
  return h;
}
function setupKeys() {
  addEventListener('pointermove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (!hold || e.buttons) return;
    if (hold.x0 == null) { hold.x0 = e.clientX; return; }
    if (!hold.moved) {
      if (Math.abs(e.clientX - hold.x0) < 3) return;
      hold.moved = true; hold.last = e.clientX; armed = null; buf = '';
      document.body.classList.add('scrubbing');
    }
    hold.acc += (e.clientX - hold.last) * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1); hold.last = e.clientX;
    const k = hold.key;
    let v = k === 'scale' ? hold.v0 * Math.exp(hold.acc * 0.004) : hold.v0 + hold.acc * RATE[k];
    if (ROT.includes(k)) v = wrap180(v);
    if (k === 'gradAngle') v = ((v % 360) + 360) % 360;
    setParam(k, v);
  }, true);
  addEventListener('blur', () => { endHold(); space = false; $('stage').classList.remove('space'); });
  addEventListener('keyup', (e) => {
    if (e.code === 'Space') { space = false; $('stage').classList.remove('space'); }
    if (!hold || e.code !== hold.code) return;
    const h = endHold();
    if (h.moved) return;
    if (h.shift && h.key === 'gap') { toggle('variation', true); return; }   // Shift + U
    if (armed === h.key) disarm(); else arm(h.key);
  });
  addEventListener('keydown', (e) => {
    const c = e.code, mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
      if (!$('cheats').hidden) toggleCheats(false);
      else if (hold) endHold(true);
      else if (typing()) return;
      else if (buf) { buf = ''; renderHud(); }
      else if (armed) disarm();
      else if (pk.open) closePicker();
      else if (document.body.classList.contains('bare')) toggleBare();
      return;
    }
    if (!$('cheats').hidden) { if (c === 'Slash' && !typing()) { toggleCheats(false); e.preventDefault(); } return; }
    if (mod) {
      if (typing()) return;
      if (c === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (c === 'KeyY') { e.preventDefault(); redo(); }
      else if (c === 'KeyS') { e.preventDefault(); downloadSVG(); }
      else if (c === 'Period' || c === 'Backslash') { e.preventDefault(); toggleBare(); }
      return;
    }
    if (typing()) return;
    const focusTag = document.activeElement?.tagName || '', onRange = document.activeElement?.type === 'range';
    if (c === 'Space') {   // hold Space + LMB = middle button
      space = true; $('stage').classList.add('space');
      if (!/BUTTON|INPUT|SELECT|SUMMARY|A/.test(focusTag)) e.preventDefault();
      return;
    }
    const arrow = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (armed) {
      const digit = /^(?:Digit|Numpad)(\d)$/.exec(c);
      if (digit && !e.shiftKey) { buf += digit[1]; flashMsg = null; e.preventDefault(); renderHud(); return; }
      if ((c === 'Period' || c === 'Comma' || c === 'NumpadDecimal') && buf && !buf.includes('.')) { buf += '.'; e.preventDefault(); renderHud(); return; }
      if ((c === 'Minus' || c === 'NumpadSubtract') && !buf && LIMITS[armed][0] < 0) { buf = '-'; e.preventDefault(); renderHud(); return; }
      if (c === 'Backspace' && buf) { buf = buf.slice(0, -1); e.preventDefault(); renderHud(); return; }
      if (c === 'Enter' || c === 'NumpadEnter') { e.preventDefault(); if (buf && buf !== '-') setParam(armed, parseFloat(buf)); buf = ''; update(); return; }
      if (arrow) { e.preventDefault(); buf = ''; flashMsg = null; nudgeParam(armed, arrow[0] - arrow[1], e.shiftKey); return; }
    }
    if (SCRUB[c]) {
      e.preventDefault();
      if (e.repeat || hold || dragging) return;
      const key = SCRUB[c];
      if (!(e.shiftKey && key === 'gap') && !available(key)) return;
      hold = { code: c, key, v0: state[key], x0: mouse.x, acc: 0, moved: false, shift: e.shiftKey };
      return;
    }
    if (arrow) {   // nothing selected: nudge the pattern by one format pixel (Shift = 10); a focused slider keeps its arrows
      if (onRange) return;
      e.preventDefault();
      const k = e.shiftKey ? 10 : 1;
      if (state.threeD) { const u = k / scaleFactor(state); state.panX += arrow[0] * u; state.panY += arrow[1] * u; }
      else { state.cx += arrow[0] * k / state.width; state.cy += arrow[1] * k / state.height; }
      clampAll(state); update();
      return;
    }
    const zoom = { Equal: 1.1, NumpadAdd: 1.1, Minus: 1 / 1.1, NumpadSubtract: 1 / 1.1 }[c];
    if (zoom) { e.preventDefault(); setParam('scale', state.scale * zoom); flash(t('scale'), fmtVal('scale') + '%'); return; }
    if (e.repeat) return;
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(c);
    if (digit && !e.shiftKey) {
      e.preventDefault();
      if (digit[1] === '0') { setParam('scale', 100); flash(t('scale'), '100%'); return; }
      const card = $('variants').querySelectorAll('.presetCard')[+digit[1] - 1];
      if (card) { card.click(); flash(t('variant'), card.dataset.tip || ''); }
      return;
    }
    const sh = e.shiftKey;
    const act = {
      KeyV: () => { state.threeD = !state.threeD; update(); flash(t('g_view'), state.threeD ? '3D' : '2D'); },
      KeyF: () => toggle('shift', true),
      KeyC: () => toggle('core', true),
      KeyL: () => toggle('linkTS', true),
      KeyG: () => toggle('gradient', true),
      KeyB: () => (sh ? toggle('bgOn', true) : togglePicker('bg')),
      KeyQ: () => (sh ? swapColors(true) : togglePicker('ring')),
      KeyI: () => eyedrop(),
      KeyH: () => { if (sh) resetView(true); else { frameAll(); flash(t('center')); } },
      KeyD: () => toggleTheme(),
      Slash: () => toggleCheats(),
      BracketLeft: () => cycleColor(sh ? 'bg' : 'ring', -1),
      BracketRight: () => cycleColor(sh ? 'bg' : 'ring', 1),
      Comma: () => stepRatio(-1),
      Period: () => stepRatio(1),
    }[c];
    if (act) { e.preventDefault(); act(); }
  });
}

// ---------- HUD ----------
let flashTimer = 0;
function flash(name, val = '') {
  flashMsg = { name, val, until: performance.now() + 1100 };
  clearTimeout(flashTimer); flashTimer = setTimeout(renderHud, 1150);
  renderHud();
}
function hudParam(key, hint) {
  const val = buf && armed === key ? `<span class="hudVal typing">${escHtml(buf)}</span>` : `<span class="hudVal">${fmtVal(key)}${UNITS[key] || ''}</span>`;
  return `<kbd class="cap">${KEY_OF[key]}</kbd><span>${escHtml(pname(key))}</span>${val}` + (hint ? `<span class="hudHint">${t('hudHint')}</span>` : '');
}
function renderHud() {
  const hud = $('hud');
  let html = '', mode = 'dock';
  if (hold && hold.moved) { html = hudParam(hold.key); mode = 'follow'; }
  else if (flashMsg && performance.now() < flashMsg.until) html = `<span>${escHtml(flashMsg.name)}</span>` + (flashMsg.val ? `<span class="hudVal">${escHtml(flashMsg.val)}</span>` : '');
  else if (armed) html = hudParam(armed, true);
  if (!html) { hud.classList.remove('show'); return; }
  hud.innerHTML = html; hud.className = 'hud show ' + mode;
  if (mode === 'follow') {   // next to the cursor: the eyes are on the canvas
    hud.style.left = clamp(mouse.x + 18, 8, innerWidth - hud.offsetWidth - 8) + 'px';
    hud.style.top = clamp(mouse.y + 22, 8, innerHeight - 42) + 'px'; hud.style.bottom = '';
  } else {
    const bare = document.body.classList.contains('bare');
    hud.style.left = ''; hud.style.top = ''; hud.style.bottom = (bare ? 24 : innerHeight - $('drawStrip').getBoundingClientRect().top + 10) + 'px';
  }
}

// ---------- undo / redo ----------
// A snapshot (the URL query) is taken 400 ms after the last change, so a drag or a scrub is one step.
let hist = [], hi = -1;
function pushHistory() {
  const q = toQuery(state);
  if (q !== hist[hi]) { hist.length = hi + 1; hist.push(q); if (hist.length > 200) hist.shift(); hi = hist.length - 1; }
  $('undoBtn').disabled = hi <= 0; $('redoBtn').disabled = hi >= hist.length - 1;
}
function undo() { clearTimeout(histTimer); pushHistory(); if (hi <= 0) return; hi--; state = fromQuery(hist[hi]); update(); flash(t('undo')); }
function redo() { clearTimeout(histTimer); pushHistory(); if (hi >= hist.length - 1) return; hi++; state = fromQuery(hist[hi]); update(); flash(t('redo')); }

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
  a.download = `kolesa-pattern-${state.variant.replace(':', '-')}-${state.width}x${state.height}.svg`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- user presets (shared with the main interface: localStorage kp.presets) ----------
const UP_KEY = 'kp.presets';
function userPresets() {
  const ps = store.get(UP_KEY, []);
  let dirty = false;
  ps.forEach((p) => { if (!p.id) { p.id = Math.random().toString(36).slice(2, 9); dirty = true; } });
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
    b.innerHTML = `<span class="thumb"></span><span class="num"></span><button class="del" type="button">${ICONS.close}</button>`;
    b.dataset.tip = p.name; b.setAttribute('aria-label', p.name);
    const del = b.querySelector('.del'); del.setAttribute('aria-label', t('del')); del.dataset.tip = t('del');
    const apply = () => { const { width, height } = state; state = Object.assign(fromQuery(p.q), { variant: 'u:' + p.id, width, height }); update(); };
    b.addEventListener('click', (e) => { if (!e.target.closest('.del')) apply(); });
    b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === b) { e.preventDefault(); e.stopPropagation(); apply(); } });
    b.addEventListener('dblclick', (e) => { if (!e.target.closest('.del')) renameUserPreset(b, p.id); });
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteUserPreset(p.id); });
    grid.appendChild(b);
  }
  // number keys 1 … 9 pick presets in this order; the tooltip shows the key
  grid.querySelectorAll('.presetCard').forEach((c, i) => { const n = i < 9 ? String(i + 1) : ''; c.querySelector('.num').textContent = n; if (n) c.dataset.kbd = n; else delete c.dataset.kbd; });
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
  if (card) { card.classList.add('fresh'); card.scrollIntoView({ block: 'nearest', inline: 'nearest' }); renameUserPreset(card, id); }
  toast(t('saved'));
}
// The strip has no room for names: the name field opens under the card (Enter / blur = keep, Esc = old name).
function renameUserPreset(card, id) {
  const p = userPresets().find((x) => x.id === id);
  if (!p) return;
  const r = card.getBoundingClientRect(), inp = document.createElement('input');
  inp.className = 'nameEdit'; inp.value = p.name; inp.maxLength = 40;
  inp.style.left = clamp(r.left + r.width / 2 - 80, 8, innerWidth - 168) + 'px'; inp.style.top = r.bottom + 8 + 'px';
  document.body.appendChild(inp); inp.focus(); inp.select();
  let done = false;
  const finish = (keep) => {
    if (done) return; done = true;
    const v = keep ? inp.value.trim() || p.name : p.name, cur = userPresets(), q = cur.find((x) => x.id === id);
    if (q) { q.name = v; store.set(UP_KEY, cur); }
    inp.remove(); card.dataset.tip = v; card.setAttribute('aria-label', v);
  };
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
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
setUiScale();
buildUI();
applyLang();
hist = [toQuery(state)]; hi = 0;
render();
document.fonts?.ready.then(() => fitFrame());
