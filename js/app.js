import { load, S, dstr } from './store.js';
import { $ } from './ui.js';
import { renderHome, act as homeAct, setOnChange as homeCb, goTab, onSettingChange } from './home.js';
import { renderRunning, act as runAct, setOnChange as runCb, recoverRun } from './running.js';
import { renderExercise, act as exAct, setOnChange as exCb, onInput } from './exercise.js';
import { RUN_DAYS } from './content.js';
import { runDone } from './store.js';

const acts = { ...homeAct, ...runAct, ...exAct };
const views = { home: renderHome, running: renderRunning, exercise: renderExercise };
let tab = 'home';

function applyTheme() {
  const t = S().settings.theme;
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name=theme-color]').setAttribute('content', dark ? '#0f1412' : '#f6f8f7');
}

function render(opts) {
  if (opts?.settings) applyTheme();
  const v = $('#view');
  const y = v.scrollTop;
  views[tab](v);
  v.scrollTop = y;
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.v === tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on);
  });
}
function setTab(t) { tab = t; render(); $('#view').scrollTop = 0; }

[homeCb, runCb, exCb].forEach((f) => f(render));
goTab.fn = setTab;

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.tagName === 'A') e.preventDefault();
  const fn = acts[el.dataset.act];
  if (fn) fn(el, e);
});
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.v)));
document.addEventListener('input', (e) => onInput(e.target));
document.addEventListener('change', (e) => { if (e.target.dataset.set) onSettingChange(e.target); });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

// ---- best-effort in-app reminder (calendar alarm is the reliable one) ----
let remindT;
function scheduleReminder() {
  clearTimeout(remindT);
  const s = S().settings;
  if (!s.remindOn || !('Notification' in window) || Notification.permission !== 'granted') return;
  const [h, m] = s.remindTime.split(':').map(Number);
  const at = new Date(); at.setHours(h, m, 0, 0);
  const ms = at - Date.now();
  if (ms > 0 && ms < 864e5 && RUN_DAYS.includes(new Date().getDay())) {
    remindT = setTimeout(() => {
      if (runDone(dstr())) return;
      navigator.serviceWorker?.ready.then((r) => r.showNotification('Time for your run 🏃', { body: 'Open Fitness Couch and tap Start run.', tag: 'run', icon: 'icons/icon-192.png' }));
    }, ms);
  }
}

// ---- boot ----
load();
applyTheme();
render();
recoverRun();
scheduleReminder();
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleReminder(); });
navigator.storage?.persist?.();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
