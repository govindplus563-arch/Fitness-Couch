// Home tab: streak, day count, today's tasks, progress, body trend, settings.
import {
  S, update, dstr, pdate, addDays, mondayOf, dayNumber, streak, bestStreak, totals, weekKm,
  runDone, workoutDone, exportJSON, importJSON, load,
} from './store.js';
import { plannedRunToday, workoutKeyToday, weekPlan, currentWeek, QUOTES, RUN_DAYS, DAY_NAMES } from './content.js';
import { $, esc, toast, lineChart, openOv, closeOv } from './ui.js';

let bodyMetric = 'weight';
let onChange = () => {};
export const setOnChange = (fn) => (onChange = fn);
export const goTab = { fn: () => {} };

export function renderHome(root) {
  const st = S(), today = dstr();
  const n = dayNumber(), sk = streak(), best = bestStreak(), tot = totals();
  const plan = plannedRunToday(), wk = workoutKeyToday();
  const rDone = runDone(today), wDone = workoutDone(today);
  const days = weekPlan(currentWeek(), mondayOf(new Date())).filter((d) => d.date >= st.startDate);
  const planned = days.reduce((a, d) => a + (d.run ? 1 : 0) + (d.workout ? 1 : 0), 0);
  const done = days.reduce((a, d) => a + (d.run && runDone(d.date) ? 1 : 0) + (d.workout && workoutDone(d.date) ? 1 : 0), 0);
  const km = weekKm(mondayOf(new Date()));
  const quote = QUOTES[(n - 1) % QUOTES.length];

  const task = (icon, title, sub, isDone, buttons) => `<div class="task ${isDone ? 'done' : ''}">
    <div class="ti">${isDone ? '✓' : icon}</div><div class="grow"><b>${title}</b><div class="muted small">${sub}</div></div></div>${isDone ? '' : `<div class="row gap">${buttons}</div>`}`;

  const runTask = plan
    ? task('🏃', 'Morning run', esc(plan.title), rDone,
      `<button class="btn primary grow" data-act="run-open" data-v="plan">Start run</button><button class="btn ghost grow" data-act="mark" data-v="run">Mark done</button>`)
    : task('😴', 'Run: rest day', 'Recover. Your legs get stronger today.', true, '');
  const wkTask = wk
    ? task('💪', `Workout ${wk}`, 'Backpack workout · about 25 min', wDone,
      `<button class="btn primary grow" data-act="wk-open" data-v="${wk}">Start</button><button class="btn ghost grow" data-act="mark" data-v="workout">Mark done</button>`)
    : task('🧘', 'Optional: abs or yoga', 'Easy day. Stretch or do a short abs routine.', wDone,
      `<button class="btn primary grow" data-act="go-tab" data-v="exercise">Open Exercise</button><button class="btn ghost grow" data-act="mark" data-v="workout">Mark done</button>`);

  const bodyPts = st.body.filter((b) => b[bodyMetric] != null).sort((a, b) => a.date.localeCompare(b.date))
    .map((b) => ({ label: pdate(b.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), value: b[bodyMetric] }));
  const lastBody = [...st.body].sort((a, b) => b.date.localeCompare(a.date))[0];
  const stale = !lastBody || (pdate(today) - pdate(lastBody.date)) / 864e5 >= 7;

  root.innerHTML = `
    <div class="row between"><div><div class="eyebrow">Fitness Couch</div><h1>Day ${n}</h1><div class="muted">since you started</div></div>
      <button class="icon-btn" data-act="settings" aria-label="Settings">⚙️</button></div>
    <div class="card streak"><div class="flame">🔥</div><div><div class="streak-n">${sk}</div><div class="muted">day streak${sk === 1 ? '' : 's'} · best ${best}</div></div></div>
    <p class="quote">“${esc(quote)}”</p>
    <div class="card"><div class="eyebrow">Today</div>${runTask}${wkTask}</div>
    <div class="card"><div class="eyebrow">Progress</div>
      <div class="stats3"><div><b>${tot.workouts}</b><span>workouts</span></div><div><b>${tot.km.toFixed(1)}</b><span>km run</span></div><div><b>${tot.runs}</b><span>runs</span></div></div>
      <div class="row between top"><span>This week</span><b>${done} of ${planned} sessions</b></div>
      <div class="bar-track"><div class="bar-fill" style="width:${planned ? (done / planned) * 100 : 0}%"></div></div>
      <div class="row between top"><span class="muted">Distance this week</span><span class="muted">${km.toFixed(1)} km</span></div></div>
    <div class="card"><div class="row between"><div class="eyebrow">Body trend</div>
      <div class="chips"><button class="${bodyMetric === 'weight' ? 'on' : ''}" data-act="body-metric" data-v="weight">Weight</button><button class="${bodyMetric === 'waist' ? 'on' : ''}" data-act="body-metric" data-v="waist">Waist</button></div></div>
      ${lineChart(bodyPts, { unit: bodyMetric === 'weight' ? 'kg' : 'cm' })}
      ${stale ? '<p class="muted small">Weekly check-in time: measure first thing in the morning.</p>' : ''}
      <button class="btn ${stale ? 'primary' : 'ghost'}" data-act="body-add">+ Add weight / waist</button></div>`;
}

function reminderICS() {
  const [h, m] = S().settings.remindTime.split(':').map(Number);
  let d = new Date();
  while (!RUN_DAYS.includes(d.getDay())) d = addDays(d, 1);
  const p = (n) => String(n).padStart(2, '0');
  const dt = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(h)}${p(m)}00`;
  const by = RUN_DAYS.map((x) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][x]).join(',');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FitnessCouch//EN', 'BEGIN:VEVENT', `UID:fitness-couch-run@local`, `DTSTAMP:${dt}`,
    `DTSTART:${dt}`, 'DURATION:PT45M', `RRULE:FREQ=WEEKLY;BYDAY=${by}`, 'SUMMARY:Morning run 🏃', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Time for your run', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export const act = {
  'go-tab': (el) => goTab.fn(el.dataset.v),
  mark: (el) => { update((s) => { s.manual[dstr()] = { ...(s.manual[dstr()] || {}), [el.dataset.v]: true }; }); toast('Marked done ✓'); onChange(); },
  'body-metric': (el) => { bodyMetric = el.dataset.v; onChange(); },
  'body-add': () => {
    const last = [...S().body].sort((a, b) => b.date.localeCompare(a.date))[0];
    openOv('body', `<div class="run"><div class="run-body scroll"><h1>Add measurement</h1><div class="card">
      <label class="eyebrow" for="b-date">Date</label><input id="b-date" class="input" type="date" value="${dstr()}" max="${dstr()}">
      <label class="eyebrow" for="b-w">Weight (kg)</label><input id="b-w" class="input" type="number" inputmode="decimal" step="0.1" min="0" placeholder="${last?.weight ?? 63}">
      <label class="eyebrow" for="b-c">Waist (cm)</label><input id="b-c" class="input" type="number" inputmode="decimal" step="0.1" min="0" placeholder="${last?.waist ?? ''}"></div>
      <button class="btn primary big" data-act="body-save">Save</button><button class="btn ghost" data-act="body-cancel">Cancel</button></div></div>`);
  },
  'body-cancel': () => closeOv('body'),
  'body-save': () => {
    const w = parseFloat($('#b-w').value), c = parseFloat($('#b-c').value), date = $('#b-date').value;
    if (!date || (!(w > 0) && !(c > 0))) { toast('Enter weight and/or waist'); return; }
    update((s) => {
      const e = s.body.find((b) => b.date === date) || (s.body.push({ date }), s.body[s.body.length - 1]);
      if (w > 0) e.weight = w;
      if (c > 0) e.waist = c;
    });
    closeOv('body'); toast('Saved ✓'); onChange();
  },
  settings: () => openSettings(),
  'set-close': () => { closeOv('settings'); onChange(); },
  'set-ics': () => { download('morning-run-reminder.ics', reminderICS(), 'text/calendar'); toast('Open the file to add it to your calendar'); },
  'set-export': () => download(`fitness-couch-backup-${dstr()}.json`, exportJSON(), 'application/json'),
  'set-import': () => $('#imp-file').click(),
  'set-reset': () => {
    if (!confirm('Delete ALL data on this device? This cannot be undone.')) return;
    if (!confirm('Really delete everything?')) return;
    Object.keys(localStorage).filter((k) => k.startsWith('fitnesscouch.')).forEach((k) => localStorage.removeItem(k));
    load(); closeOv('settings'); onChange();
  },
};

export function onSettingChange(el) {
  const k = el.dataset.set;
  if (k === 'imp') {
    const f = el.files[0];
    if (!f) return;
    f.text().then((t) => { try { importJSON(t); toast('Backup restored ✓'); closeOv('settings'); onChange(); } catch (e) { toast(e.message); } });
    return;
  }
  update((s) => {
    if (k === 'start') s.startDate = el.value || s.startDate;
    if (k === 'theme') s.settings.theme = el.value;
    if (k === 'voice') s.settings.voice = el.checked;
    if (k === 'remindOn') s.settings.remindOn = el.checked;
    if (k === 'remindTime') s.settings.remindTime = el.value || '06:30';
  });
  if (k === 'remindOn' && el.checked && 'Notification' in window) Notification.requestPermission().then((p) => { if (p !== 'granted') toast('Notifications are blocked in browser settings'); });
  onChange({ settings: true });
}

function openSettings() {
  const s = S().settings;
  openOv('settings', `<div class="run"><div class="run-body scroll"><div class="row between"><h1>Settings</h1><button class="btn ghost small-btn" data-act="set-close">Done</button></div>
    <div class="card"><label class="eyebrow" for="s-start">Start date</label><input id="s-start" class="input" type="date" data-set="start" value="${S().startDate}" max="${dstr()}">
      <label class="eyebrow" for="s-theme">Theme</label><select id="s-theme" class="input" data-set="theme">${[['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="switch"><input type="checkbox" data-set="voice" ${s.voice ? 'checked' : ''}><span>Voice and sound cues during runs</span></label></div>
    <div class="card"><div class="eyebrow">Morning reminder</div>
      <label class="eyebrow" for="s-time">Run time</label><input id="s-time" class="input" type="time" data-set="remindTime" value="${s.remindTime}">
      <button class="btn primary" data-act="set-ics">Add repeating alarm to my calendar</button>
      <p class="muted small">Most reliable: the calendar alarm rings even when the app is closed (Mon, Wed, Fri, Sat).</p>
      <label class="switch"><input type="checkbox" data-set="remindOn" ${s.remindOn ? 'checked' : ''}><span>Also notify me when the app is open (best effort)</span></label></div>
    <div class="card"><div class="eyebrow">Your data</div><p class="muted small">Everything is stored only on this phone. Export a backup now and then, especially before changing phones or clearing Chrome data.</p>
      <button class="btn ghost" data-act="set-export">Export backup</button><button class="btn ghost" data-act="set-import">Restore from backup</button>
      <input id="imp-file" type="file" accept="application/json,.json" hidden data-set="imp"><button class="btn danger" data-act="set-reset">Delete all data</button></div></div></div>`);
}
