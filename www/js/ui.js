import { isNative, nativeSpeak, nativeBuzz } from './native.js';
// Small UI helpers: DOM, feedback (beep/vibrate/speech), SVG charts, overlays.
export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastT;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---- feedback ----
let actx;
export function beep(freq = 880, ms = 160, times = 1) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq;
      o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime + i * (ms + 90) / 1000;
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
      o.start(t); o.stop(t + ms / 1000);
    }
  } catch {}
}
export const buzz = (p = 200) => { if (nativeBuzz(p)) return; try { navigator.vibrate?.(p); } catch {} };
export function speak(text) {
  if (nativeSpeak(text)) return;
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch {}
}

// ---- wake lock (keeps the screen on so GPS keeps flowing) ----
let wl = null, wlWanted = false;
export async function keepAwake(on) {
  if (isNative) return; // the Android app tracks with the screen off
  wlWanted = on;
  try {
    if (on && 'wakeLock' in navigator && !wl) {
      wl = await navigator.wakeLock.request('screen');
      wl.addEventListener('release', () => (wl = null));
    } else if (!on && wl) {
      await wl.release();
      wl = null;
    }
  } catch { wl = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wlWanted && !wl) keepAwake(true);
});

// ---- overlays (full-screen sheets) ----
export function openOv(id, html) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'ov';
    document.body.appendChild(el);
  }
  el.innerHTML = html;
  el.hidden = false;
  document.body.classList.add('noscroll');
  return el;
}
export function closeOv(id) {
  const el = document.getElementById(id);
  if (el) { el.hidden = true; el.innerHTML = ''; }
  if (![...document.querySelectorAll('.ov')].some((o) => !o.hidden)) document.body.classList.remove('noscroll');
}

// ---- charts (inline SVG, colours come from CSS variables) ----
export function barChart(items, { unit = 'km', height = 150 } = {}) {
  // items: [{label, value, current?}]
  const w = 320, pl = 4, pb = 22, pt = 18, h = height;
  const max = Math.max(1, ...items.map((i) => i.value));
  const bw = (w - pl * 2) / items.length;
  const bars = items.map((it, i) => {
    const bh = ((h - pb - pt) * it.value) / max;
    const x = pl + i * bw + bw * 0.18, y = h - pb - bh;
    return `<rect class="bar${it.current ? ' cur' : ''}" x="${x}" y="${y}" width="${bw * 0.64}" height="${Math.max(bh, it.value ? 2 : 0)}" rx="4"/>` +
      `<text class="cl" x="${x + bw * 0.32}" y="${h - 6}" text-anchor="middle">${esc(it.label)}</text>` +
      (it.value ? `<text class="cv" x="${x + bw * 0.32}" y="${y - 4}" text-anchor="middle">${it.value.toFixed(1)}</text>` : '');
  });
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="Weekly ${unit}">${bars.join('')}</svg>`;
}

export function lineChart(points, { unit = '', height = 140 } = {}) {
  // points: [{label, value}]
  if (points.length < 2) return `<p class="muted center pad">Add at least 2 entries to see a trend.</p>`;
  const w = 320, h = height, pl = 8, pr = 8, pt = 16, pb = 22;
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 1) { max += 0.5; min -= 0.5; }
  const x = (i) => pl + ((w - pl - pr) * i) / (points.length - 1);
  const y = (v) => pt + ((h - pt - pb) * (max - v)) / (max - min);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const dots = points.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="3.5"/>`).join('');
  const first = points[0], last = points[points.length - 1];
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="Trend in ${unit}">
    <path class="line" d="${path}"/>${dots}
    <text class="cv" x="${x(0)}" y="${y(first.value) - 8}" text-anchor="start">${first.value}</text>
    <text class="cv" x="${x(points.length - 1)}" y="${y(last.value) - 8}" text-anchor="end">${last.value} ${unit}</text>
    <text class="cl" x="${pl}" y="${h - 6}" text-anchor="start">${esc(first.label)}</text>
    <text class="cl" x="${w - pr}" y="${h - 6}" text-anchor="end">${esc(last.label)}</text></svg>`;
}

export function routeSVG(pts, { size = 260 } = {}) {
  if (!pts || pts.length < 2) return '';
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLn = Math.min(...lngs), maxLn = Math.max(...lngs);
  const k = Math.cos(((minLa + maxLa) / 2) * Math.PI / 180);
  const spanX = Math.max((maxLn - minLn) * k, 1e-5), spanY = Math.max(maxLa - minLa, 1e-5);
  const pad = 14, s = (size - pad * 2) / Math.max(spanX, spanY);
  const ox = pad + (size - pad * 2 - spanX * s) / 2, oy = pad + (size - pad * 2 - spanY * s) / 2;
  const P = (p) => [ox + (p[1] - minLn) * k * s, oy + (maxLa - p[0]) * s];
  const d = pts.map((p, i) => { const [x, y] = P(p); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
  const a = P(pts[0]), b = P(pts[pts.length - 1]);
  return `<svg viewBox="0 0 ${size} ${size}" class="route" role="img" aria-label="Route map"><path class="rline" d="${d}"/>
    <circle class="rs" cx="${a[0]}" cy="${a[1]}" r="6"/><circle class="re" cx="${b[0]}" cy="${b[1]}" r="6"/></svg>`;
}
