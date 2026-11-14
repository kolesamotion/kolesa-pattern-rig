// Tooltips, as in Kolesa Design `Tooltip`: replace the browser `title` (slow, unthemed).
//  - [data-tip] elements share one floating bubble; [data-kbd] adds a shortcut ("mod+C" → ⌘C on Mac, Ctrl+C elsewhere).
//  - .helpTip («?») keep their own inline .tip with rich content; they get the same open logic.
// The first tooltip opens after 300 ms; while one is open and for 500 ms after it closed, neighbours open at once
// (sweep along a toolbar). Opens on hover and keyboard focus; closes on leave, press, Escape, scroll.
// At the window edges the bubble flips to the other side and shifts inside, 8 px from the edge.

export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const GLYPH = { mod: IS_MAC ? '⌘' : 'Ctrl', alt: IS_MAC ? '⌥' : 'Alt', shift: IS_MAC ? '⇧' : 'Shift', ctrl: 'Ctrl', cmd: '⌘', esc: 'Esc', space: 'Space' };
export function fmtKeys(s) {
  return String(s).split('+').map((k) => { k = k.trim(); return GLYPH[k.toLowerCase()] || (k.length === 1 ? k.toUpperCase() : k); }).join(IS_MAC ? '' : '+');
}

const DELAY = 300, GROUP = 500, EDGE = 8, GAP = 8;
let bubble = null, cur = null, pend = null, timer = 0, lastClose = 0;

const targetOf = (el) => el?.closest?.('[data-tip], .helpTip') || null;

function placeFloating(el) {
  const r = el.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
  bubble.style.left = '0px'; bubble.style.top = '0px';
  const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
  let side = el.dataset.tipSide === 'bottom' ? 'bottom' : 'top';
  if (side === 'top' && r.top - GAP - bh < EDGE) side = 'bottom';
  else if (side === 'bottom' && r.bottom + GAP + bh > vh - EDGE) side = 'top';
  const top = side === 'top' ? r.top - GAP - bh : r.bottom + GAP;
  const left = Math.min(vw - EDGE - bw, Math.max(EDGE, r.left + r.width / 2 - bw / 2));
  bubble.style.left = Math.round(left) + 'px'; bubble.style.top = Math.round(top) + 'px';
  bubble.dataset.side = side;
}
// Inline «?» tooltip: CSS places it; here only flip (no room above / below) and shift inside the window.
function placeInline(el) {
  const tip = el.querySelector('.tip'); if (!tip) return;
  el.classList.remove('tipFlip'); tip.style.setProperty('--dx', '0px');
  let r = tip.getBoundingClientRect();
  if (r.top < EDGE || r.bottom > innerHeight - EDGE) { el.classList.add('tipFlip'); r = tip.getBoundingClientRect(); }
  const dx = r.left < EDGE ? EDGE - r.left : r.right > innerWidth - EDGE ? innerWidth - EDGE - r.right : 0;
  tip.style.setProperty('--dx', Math.round(dx) + 'px');
}

function open(el) {
  clearTimeout(timer); pend = null;
  if (cur === el) return;
  close();
  cur = el;
  if (el.classList.contains('helpTip')) { placeInline(el); el.classList.add('is-open'); return; }
  bubble.textContent = el.dataset.tip || '';
  if (el.dataset.kbd) { const k = document.createElement('kbd'); k.textContent = fmtKeys(el.dataset.kbd); bubble.appendChild(k); }
  if (!bubble.textContent) { cur = null; return; }
  el.setAttribute('aria-describedby', 'tipLayer');
  placeFloating(el);
  bubble.classList.add('is-open');
}
function close() {
  clearTimeout(timer); pend = null;
  if (!cur) return;
  if (cur.classList.contains('helpTip')) cur.classList.remove('is-open');
  else { bubble.classList.remove('is-open'); cur.removeAttribute('aria-describedby'); }
  cur = null; lastClose = Date.now();
}
function want(el) {
  if (cur === el || pend === el) return;
  clearTimeout(timer); pend = null;
  if (cur || Date.now() - lastClose < GROUP) open(el);
  else { pend = el; timer = setTimeout(() => open(el), DELAY); }
}

export function setupTips() {
  bubble = document.createElement('div');
  bubble.className = 'tipLayer'; bubble.id = 'tipLayer'; bubble.setAttribute('role', 'tooltip');
  document.body.appendChild(bubble);
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch' || e.buttons) return;          // no tooltips on touch or while dragging
    const el = targetOf(e.target);
    if (el) want(el); else close();
  });
  document.addEventListener('pointerleave', close);
  document.addEventListener('pointerdown', () => close(), true);
  document.addEventListener('focusin', (e) => { const el = targetOf(e.target); if (el && e.target.matches(':focus-visible')) want(el); });
  document.addEventListener('focusout', (e) => { if (cur && cur.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('scroll', close, true);
  addEventListener('blur', close);
}
