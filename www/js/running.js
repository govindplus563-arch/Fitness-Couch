// Running tab: live GPS tracking, run plan, run log.
import { RunTracker } from './tracker.js';
import {
  S, update, dstr, pdate, addDays, mondayOf, uid, fmtTime, fmtPace, fmtKm,
  saveRoute, loadRoute, dropRoute, saveActive, loadActive, clearActive,
  runDone, weekKm, personalBests,
} from './store.js';
import { currentWeek, runFor, weekPlan, weeklyKmTarget, plannedRunToday, DAY_NAMES } from './content.js';
import { watchGPS, isNative, openAppSettings } from './native.js';
import { $, esc, toast, beep, buzz, speak, keepAwake, openOv, closeOv, barChart, routeSVG } from './ui.js';

const FELT = [['😫', 'Very hard'], ['😕', 'Hard'], ['🙂', 'OK'], ['😀', 'Good'], ['🔥', 'Great']];
let sub = 'run'; // run | plan | log
let R = null; // active run session
let onChange = () => {};
export const setOnChange = (fn) => (onChange = fn);

// =============== Tab view ===============
export function renderRunning(root) {
  const seg = `<div class="seg">${[['run', 'Run'], ['plan', 'Plan'], ['log', 'Log']]
    .map(([k, l]) => `<button class="${sub === k ? 'on' : ''}" data-act="run-sub" data-v="${k}">${l}</button>`).join('')}</div>`;
  root.innerHTML = `<h1>Running</h1>${seg}${sub === 'run' ? viewRun() : sub === 'plan' ? viewPlan() : viewLog()}`;
}

function viewRun() {
  const plan = plannedRunToday();
  const done = runDone(dstr());
  const wk = currentWeek();
  const target = weeklyKmTarget(wk);
  const km = weekKm(mondayOf(new Date()));
  const todayCard = plan
    ? `<div class="card"><div class="eyebrow">Today · Week ${wk}</div><h2>${esc(plan.title)}</h2><p class="muted">${esc(plan.sub)}</p>
       ${done ? '<p class="ok">✓ Run done today. Nice work!</p>' : ''}
       <button class="btn primary big" data-act="run-open" data-v="plan">${done ? 'Run again' : 'Start run'}</button>
       <button class="btn ghost" data-act="run-open" data-v="free">Free run (no plan)</button></div>`
    : `<div class="card"><div class="eyebrow">Today · Week ${wk}</div><h2>Rest day from running</h2>
       <p class="muted">Your legs grow stronger on rest days. Do today's workout, abs or yoga instead.</p>
       <button class="btn primary big" data-act="run-open" data-v="free">Free run anyway</button></div>`;
  return `${todayCard}
    ${target ? `<div class="card"><div class="eyebrow">This week</div><div class="row between"><b>${km.toFixed(1)} km</b><span class="muted">target ${target.toFixed(1)} km</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, (km / target) * 100)}%"></div></div></div>` : ''}
    <div class="card tips"><div class="eyebrow">For the most accurate distance</div>
      ${isNative ? `<ul><li>Allow location <b>precise</b> and <b>"Allow all the time"</b> when asked, so tracking survives the screen turning off.</li>
      <li>Go outside and wait for <b>GPS ±10 m</b> or better before you press Start.</li>
      <li>Set battery to <b>Unrestricted</b> for this app (Android Settings → Apps → Fitness Couch → Battery). Some phones kill background apps otherwise.</li>
      <li>You'll see a "Recording your run" notification while tracking. That's what keeps it alive.</li></ul>`
      : `<ul><li>Allow location (precise) when asked.</li><li>Go outside and wait for <b>GPS ±10 m</b> or better before you press Start.</li>
      <li>Keep the screen on. Browsers pause GPS when the screen turns off. Install the Android app for screen-off tracking.</li></ul>`}</div>
    <button class="btn ghost" data-act="manual-run">+ Add a run manually</button>`;
}

function viewPlan() {
  const wk = currentWeek();
  const monday = mondayOf(new Date());
  const rows = weekPlan(wk, monday).map((d) => {
    const isToday = d.date === dstr();
    const done = runDone(d.date);
    const label = d.run ? esc(d.run.title) : 'Rest from running';
    return `<div class="plan-row ${isToday ? 'today' : ''}"><div class="dn"><b>${DAY_NAMES[d.wd]}</b><span>${pdate(d.date).getDate()}</span></div>
      <div class="grow"><div>${label}</div>${d.workout ? `<div class="muted small">Workout ${d.workout}</div>` : ''}</div>
      <div class="chk ${done ? 'on' : ''}">${d.run ? (done ? '✓' : '') : '·'}</div></div>`;
  }).join('');
  const upcoming = [1, 2, 3].map((i) => {
    const w = wk + i;
    const t = weeklyKmTarget(w);
    const r = runFor(w, 1);
    return `<div class="row between"><span>Week ${w}</span><span class="muted">${t ? `${t.toFixed(1)} km total` : esc(r.title)}</span></div>`;
  }).join('');
  const off = S().settings.planOffset || 0;
  return `<div class="card"><div class="row between"><div><div class="eyebrow">Week ${wk}</div><h2>${weeklyKmTarget(wk) ? `${weeklyKmTarget(wk).toFixed(1)} km this week` : 'Walk / run intervals'}</h2></div></div>
    ${rows}</div>
    <div class="card"><div class="eyebrow">Coming up</div>${upcoming}
      <p class="muted small">Distance never grows by more than about 8 % a week, with an easier week every 4th week.</p></div>
    <div class="card"><div class="eyebrow">Too hard or too easy?</div>
      <div class="row gap"><button class="btn ghost grow" data-act="plan-shift" data-v="-1" ${wk <= 1 ? 'disabled' : ''}>◀ Repeat easier week</button>
      <button class="btn ghost grow" data-act="plan-shift" data-v="1">Next week ▶</button></div>
      ${off ? `<p class="muted small center">Plan shifted by ${off > 0 ? '+' : ''}${off} week(s) · <a href="#" data-act="plan-reset">reset</a></p>` : ''}</div>`;
}

function viewLog() {
  const mon = mondayOf(new Date());
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const m = addDays(mon, -7 * i);
    weeks.push({ label: `${m.getDate()}/${m.getMonth() + 1}`, value: weekKm(m), current: i === 0 });
  }
  const pb = personalBests();
  const runs = [...S().runs].sort((a, b) => b.start - a.start);
  const list = runs.length
    ? runs.map((r) => `<button class="run-item" data-act="run-view" data-v="${r.id}">
        <div><b>${fmtKm(r.dist)} km</b><span class="muted"> · ${fmtTime(r.dur)}</span></div>
        <div class="muted small">${pdate(r.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtPace(r.dur / (r.dist / 1000))} /km ${r.src === 'manual' ? '· manual' : ''}</div>
        <span class="felt">${r.felt ? FELT[r.felt - 1][0] : ''}</span></button>`).join('')
    : '<p class="muted center pad">No runs yet. Your first run will show up here.</p>';
  return `<div class="card"><div class="eyebrow">Weekly distance (km)</div>${barChart(weeks)}</div>
    <div class="card"><div class="eyebrow">Personal bests</div><div class="stats3">
      <div><b>${pb.longest ? fmtKm(pb.longest.dist) : '–'}</b><span>longest km</span></div>
      <div><b>${pb.fastest ? fmtPace(pb.fastest.dur / (pb.fastest.dist / 1000)) : '–'}</b><span>best pace /km</span></div>
      <div><b>${pb.bestWeek ? pb.bestWeek.toFixed(1) : '–'}</b><span>best week km</span></div></div></div>
    <div class="card"><div class="eyebrow">All runs</div>${list}</div>
    <button class="btn ghost" data-act="manual-run">+ Add a run manually</button>`;
}

// =============== Live run ===============
export function openRun(mode, restored) {
  if (R) return;
  const plan = mode === 'plan' ? plannedRunToday() : null;
  R = {
    mode, plan, phase: 'ready', tracker: new RunTracker(), acc: null, lastFix: 0, err: null,
    stopWatch: null, timer: null, saveT: 0, announced: 0, coachIdx: -1, targetHit: false, felt: 3, locked: false, view: null,
  };
  if (restored) {
    R.tracker = RunTracker.restore(restored.tracker);
    R.mode = restored.mode; R.plan = restored.mode === 'plan' ? plannedRunToday() : null;
    R.phase = 'run'; R.announced = R.tracker.splitSecs.length;
  }
  startWatch();
  render();
  R.timer = setInterval(tick, 250);
  if (restored) keepAwake(true);
}

function startWatch() {
  R.stopWatch = watchGPS(onFix, onGeoErr);
}
function stopWatch() {
  if (R?.stopWatch) R.stopWatch();
  if (R) R.stopWatch = null;
}
function onGeoErr(e) {
  R.err = e.code === 1
    ? (isNative ? 'Location is blocked. Tap here to open settings and allow location "All the time" / precise.' : 'Location is blocked. In Chrome tap ⋮ → Settings → Site settings → Location → Allow, then reopen.')
    : e.code === 2 ? 'GPS position unavailable. Move outside and try again.' : 'Waiting for GPS…';
  if (R.phase !== 'sum') setText('#gps-text', R.err);
}
function onFix(pos) {
  if (!R) return;
  const c = pos.coords;
  R.err = null; R.acc = c.accuracy; R.lastFix = Date.now();
  const t = R.tracker;
  if (R.phase !== 'run' || pos.timestamp < t.startTs) return;
  t.addFix({ lat: c.latitude, lng: c.longitude, acc: c.accuracy, ts: pos.timestamp, speed: c.speed });
  while (t.splitSecs.length > R.announced) {
    R.announced++;
    announceKm(R.announced);
  }
}
function announceKm(n) {
  const t = R.tracker, secs = t.splitSecs[n - 1] - (t.splitSecs[n - 2] || 0);
  beep(1000, 120, 2); buzz([120, 80, 120]);
  if (S().settings.voice) {
    const m = Math.floor(secs / 60), s = Math.round(secs % 60);
    speak(`${n} kilometre${n > 1 ? 's' : ''}. Last kilometre ${m} minutes ${s} seconds.`);
  }
}

function setText(sel, txt) { const e = $(sel); if (e && e.textContent !== txt) e.textContent = txt; }

function tick() {
  if (!R) return;
  const now = Date.now(), t = R.tracker;
  // GPS badge
  const age = (now - R.lastFix) / 1000;
  let cls = 'weak', txt = 'Searching for GPS…';
  if (R.err) txt = R.err;
  else if (R.lastFix && age < 15) {
    cls = R.acc <= 10 ? 'good' : R.acc <= 20 ? 'ok' : 'weak';
    txt = `GPS ±${Math.round(R.acc)} m` + (R.acc <= 10 ? ' · great' : R.acc <= 20 ? ' · good' : ' · weak');
  } else if (R.lastFix) txt = 'GPS signal lost…';
  const g = $('#gps');
  if (g && !g.dataset.b) { g.dataset.b = 1; g.addEventListener('click', () => { if (R?.err && isNative) openAppSettings(); }); }
  if (g) { g.className = `gps ${cls}`; setText('#gps-text', txt); }
  const startBtn = $('#btn-start');
  if (startBtn && R.phase === 'ready') startBtn.classList.toggle('warn', !(R.lastFix && R.acc <= 20));

  if (R.phase !== 'run') return;
  setText('#t-time', fmtTime(t.elapsed(now)));
  setText('#t-dist', fmtKm(t.dist));
  setText('#t-avg', fmtPace(t.avgPace(now)));
  setText('#t-now', t.paused ? 'paused' : fmtPace(t.currentPace()));
  setText('#lk-time', fmtTime(t.elapsed(now)));
  setText('#lk-dist', fmtKm(t.dist) + ' km');
  coach(now);
  if (now - R.saveT > 5000) persistActive(now);
}
function persistActive(now = Date.now()) {
  if (!R || R.phase !== 'run') return;
  R.saveT = now;
  saveActive({ tracker: R.tracker.toJSON(now), mode: R.mode });
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persistActive(); });
window.addEventListener('pagehide', () => persistActive());

function coach(now) {
  const c = $('#coach');
  if (!c || !R.plan) return;
  const t = R.tracker, el = t.elapsed(now);
  if (R.plan.kind === 'interval') {
    let acc = 0, i = 0;
    for (; i < R.plan.segs.length; i++) { if (el < acc + R.plan.segs[i].s) break; acc += R.plan.segs[i].s; }
    if (i >= R.plan.segs.length) {
      c.className = 'coach done'; c.innerHTML = '<b>Plan complete 🎉</b><span>Keep walking to cool down, then finish.</span>';
      if (!R.targetHit) { R.targetHit = true; beep(1200, 200, 3); buzz([300, 100, 300]); if (S().settings.voice) speak('Plan complete. Great work.'); }
      return;
    }
    const seg = R.plan.segs[i];
    if (R.coachIdx !== i) {
      if (R.coachIdx !== -1) { beep(seg.t === 'run' ? 1100 : 700, 200, 2); buzz(seg.t === 'run' ? [250, 100, 250] : 400); if (S().settings.voice) speak(seg.t === 'run' ? 'Run' : 'Walk'); }
      R.coachIdx = i;
    }
    c.className = `coach ${seg.t === 'run' ? 'go' : 'walk'}`;
    c.innerHTML = `<b>${seg.t === 'run' ? 'RUN' : 'WALK'}</b><span class="big">${fmtTime(acc + seg.s - el)}</span><span>${esc(seg.label)} · step ${i + 1}/${R.plan.segs.length}</span>`;
  } else {
    const left = R.plan.km - t.dist / 1000;
    c.className = `coach ${left <= 0 ? 'done' : 'go'}`;
    c.innerHTML = left > 0 ? `<b>Target ${R.plan.km.toFixed(1)} km</b><span>${left.toFixed(2)} km to go</span>` : '<b>Target reached 🎉</b><span>Keep going or finish when ready.</span>';
    if (left <= 0 && !R.targetHit) { R.targetHit = true; beep(1200, 200, 3); buzz([300, 100, 300]); if (S().settings.voice) speak('Target distance reached. Great work.'); }
  }
}

// =============== Run overlay rendering ===============
function render() {
  if (!R) return;
  const t = R.tracker;
  let body;
  if (R.phase === 'ready') {
    body = `<div class="run-body">
      <div id="gps" class="gps weak"><i></i><span id="gps-text">Searching for GPS…</span></div>
      ${R.plan ? `<div class="card"><div class="eyebrow">Plan</div><h2>${esc(R.plan.title)}</h2><p class="muted">${esc(R.plan.sub)}</p></div>` : '<div class="card"><h2>Free run</h2><p class="muted">Distance and pace are recorded automatically.</p></div>'}
      <p class="muted center">Wait for <b>±10 m</b> or better, then start. ${isNative ? 'Then lock your phone and put it in your pocket. Tracking continues with the screen off.' : 'Keep this screen open while you run.'}</p>
      <div class="grow"></div>
      <button id="btn-start" class="btn primary huge" data-act="run-start">START</button>
      <button class="btn ghost" data-act="run-back">Back</button></div>`;
  } else if (R.phase === 'run') {
    body = `<div class="run-body">
      <div id="gps" class="gps weak"><i></i><span id="gps-text">…</span></div>
      <div id="coach" class="coach" ${R.plan ? '' : 'hidden'}></div>
      <div class="big-dist"><span id="t-dist">0.00</span><small>km</small></div>
      <div class="run-stats"><div><b id="t-time">0:00</b><span>time</span></div><div><b id="t-avg">--:--</b><span>avg pace /km</span></div><div><b id="t-now">--:--</b><span>pace now</span></div></div>
      <div class="grow"></div>
      <div class="row gap">${t.paused
        ? '<button class="btn primary huge grow" data-act="run-resume">RESUME</button>'
        : '<button class="btn warnb huge grow" data-act="run-pause">PAUSE</button>'}</div>
      <div class="row gap">${isNative ? '' : '<button class="btn ghost grow" data-act="run-lock">🔒 Lock screen</button>'}<button class="btn danger grow" data-act="run-finish">Finish</button></div>
      <div id="fin" class="sheet" hidden><div class="sheet-in"><h2>Finish this run?</h2><p class="muted">You can't resume once you finish.</p>
        <button class="btn primary big" data-act="run-finish-yes">Yes, finish</button><button class="btn ghost" data-act="run-finish-no">Keep running</button></div></div>
      <div id="lock" class="lock" hidden><div class="lk-time" id="lk-time">0:00</div><div class="lk-dist" id="lk-dist">0.00 km</div>
        <button id="unlock" class="btn ghost big">Hold to unlock</button></div></div>`;
  } else {
    body = summaryHTML();
  }
  const el = openOv('run', `<div class="run">${body}</div>`);
  const ul = $('#unlock', el);
  if (ul) bindHold(ul);
  if (R.phase === 'run' && R.locked) $('#lock').hidden = false;
  tick();
}

function bindHold(btn) {
  let to;
  const cancel = () => { clearTimeout(to); btn.classList.remove('holding'); };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.classList.add('holding'); to = setTimeout(() => { R.locked = false; $('#lock').hidden = true; cancel(); buzz(60); }, 1200); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, cancel));
}

function summaryHTML() {
  const rec = R.view, t = R.tracker;
  const dist = rec ? rec.dist : t.dist, dur = rec ? rec.dur : R.finalDur;
  const pts = rec ? loadRoute(rec.id) : t.route();
  const splits = rec ? rec.splits || [] : t.splits(R.endTs).map((s) => ({ km: s.km, sec: Math.round(s.sec), full: s.full, d: Math.round(s.dist || 1000) }));
  const gaps = rec ? rec.gaps : t.gaps;
  const pace = dist >= 20 ? fmtPace(dur / (dist / 1000)) : '--:--';
  const felt = FELT.map(([e, l], i) => `<button class="felt-btn ${R.felt === i + 1 ? 'on' : ''}" data-act="run-felt" data-v="${i + 1}" ${rec ? 'disabled' : ''}><span>${e}</span><small>${l}</small></button>`).join('');
  return `<div class="run-body scroll">
    <h1>${rec ? pdate(rec.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Run complete 🎉'}</h1>
    <div class="big-dist"><span>${fmtKm(dist)}</span><small>km</small></div>
    <div class="run-stats"><div><b>${fmtTime(dur)}</b><span>time</span></div><div><b>${pace}</b><span>avg pace /km</span></div></div>
    ${pts.length > 1 ? `<div class="card center">${routeSVG(pts)}</div>` : ''}
    ${splits.length ? `<div class="card"><div class="eyebrow">Kilometre splits</div>${splits.map((s) => s.full
      ? `<div class="row between"><span>km ${s.km}</span><b>${fmtTime(s.sec)}</b></div>`
      : `<div class="row between"><span>last ${(s.d / 1000).toFixed(2)} km</span><b>${fmtPace(s.sec / (s.d / 1000))} /km</b></div>`).join('')}</div>` : ''}
    ${gaps ? `<p class="muted small center">GPS dropped out ${gaps}× during this run, so distance may be slightly low.</p>` : ''}
    ${rec ? '' : `<div class="card"><div class="eyebrow">How did it feel?</div><div class="felts">${felt}</div></div>
      <div class="card"><label class="eyebrow" for="sum-dist">Distance (km), edit only if you know it's wrong</label>
      <input id="sum-dist" class="input" type="number" inputmode="decimal" step="0.01" min="0" value="${fmtKm(dist)}"></div>`}
    ${rec ? `<button class="btn ghost big" data-act="run-close">Close</button><button class="btn danger" data-act="run-delete" data-v="${rec.id}">Delete this run</button>`
      : `<button class="btn primary big" data-act="run-save">Save run</button><button class="btn ghost" data-act="run-discard">Discard</button>`}</div>`;
}

function cleanup() {
  stopWatch();
  clearInterval(R?.timer);
  keepAwake(false);
  R = null;
  closeOv('run');
  onChange();
}

export function runView(id) {
  const rec = S().runs.find((r) => r.id === id);
  if (!rec) return;
  R = { phase: 'sum', view: rec, felt: rec.felt, tracker: new RunTracker(), timer: null, stopWatch: null };
  render();
}

// =============== Actions ===============
export const act = {
  'run-sub': (el) => { sub = el.dataset.v; onChange(); },
  'run-open': (el) => openRun(el.dataset.v),
  'run-back': () => cleanup(),
  'run-start': () => {
    const now = Date.now();
    R.tracker.start(now);
    R.phase = 'run'; R.saveT = 0;
    keepAwake(true);
    beep(900, 150, 2); buzz(150);
    if (S().settings.voice) speak('Run started');
    render();
  },
  'run-pause': () => { R.tracker.pause(Date.now()); persistActive(); render(); },
  'run-resume': () => { R.tracker.resume(Date.now()); render(); keepAwake(true); },
  'run-lock': () => { R.locked = true; $('#lock').hidden = false; },
  'run-finish': () => { $('#fin').hidden = false; },
  'run-finish-no': () => { $('#fin').hidden = true; },
  'run-finish-yes': () => {
    const now = Date.now();
    R.endTs = now;
    R.finalDur = R.tracker.elapsed(now);
    R.tracker.pause(now);
    stopWatch(); clearInterval(R.timer); keepAwake(false); clearActive();
    R.phase = 'sum';
    if (S().settings.voice) speak('Run finished');
    render();
  },
  'run-felt': (el) => { R.felt = +el.dataset.v; document.querySelectorAll('.felt-btn').forEach((b, i) => b.classList.toggle('on', i + 1 === R.felt)); },
  'run-save': () => {
    const t = R.tracker;
    const typed = parseFloat($('#sum-dist').value);
    const gpsKm = t.dist / 1000;
    const km = isFinite(typed) && typed >= 0 ? typed : gpsKm;
    const edited = Math.abs(km - gpsKm) > 0.005;
    if (km < 0.05) { toast('Too short to save. Discard instead.'); return; }
    const id = uid();
    const rec = {
      id, date: dstr(new Date(t.startTs)), start: t.startTs, dur: Math.round(R.finalDur), dist: Math.round(km * 1000), felt: R.felt,
      splits: edited ? [] : t.splits(R.endTs).map((s) => ({ km: s.km, sec: Math.round(s.sec), full: s.full, d: Math.round(s.dist || 1000) })),
      gaps: t.gaps, src: 'gps', week: currentWeek(), edited,
    };
    saveRoute(id, t.route());
    update((s) => s.runs.push(rec));
    toast('Run saved ✓');
    cleanup();
  },
  'run-discard': () => { if (confirm('Discard this run?')) { clearActive(); cleanup(); } },
  'run-close': () => cleanup(),
  'run-view': (el) => runView(el.dataset.v),
  'run-delete': (el) => {
    if (!confirm('Delete this run?')) return;
    dropRoute(el.dataset.v);
    update((s) => (s.runs = s.runs.filter((r) => r.id !== el.dataset.v)));
    cleanup();
  },
  'plan-shift': (el) => { update((s) => (s.settings.planOffset = (s.settings.planOffset || 0) + +el.dataset.v)); onChange(); },
  'plan-reset': () => { update((s) => (s.settings.planOffset = 0)); onChange(); },
  'manual-run': () => {
    openOv('manual', `<div class="run"><div class="run-body scroll"><h1>Add a run</h1>
      <div class="card"><label class="eyebrow" for="m-date">Date</label><input id="m-date" class="input" type="date" value="${dstr()}" max="${dstr()}">
      <label class="eyebrow" for="m-km">Distance (km)</label><input id="m-km" class="input" type="number" inputmode="decimal" step="0.01" min="0">
      <label class="eyebrow" for="m-min">Time (minutes)</label><input id="m-min" class="input" type="number" inputmode="decimal" step="0.1" min="0"></div>
      <button class="btn primary big" data-act="manual-save">Save</button><button class="btn ghost" data-act="manual-cancel">Cancel</button></div></div>`);
  },
  'manual-cancel': () => closeOv('manual'),
  'manual-save': () => {
    const km = parseFloat($('#m-km').value), min = parseFloat($('#m-min').value), date = $('#m-date').value;
    if (!(km > 0) || !(min > 0) || !date) { toast('Enter distance and time'); return; }
    update((s) => s.runs.push({ id: uid(), date, start: pdate(date).getTime() + 7 * 36e5, dur: Math.round(min * 60), dist: Math.round(km * 1000), felt: 3, splits: [], gaps: 0, src: 'manual', week: currentWeek() }));
    closeOv('manual'); toast('Run added ✓'); onChange();
  },
};

/** If the app was closed mid-run, offer to pick it back up. */
export function recoverRun() {
  const a = loadActive();
  if (!a || R) return;
  if (Date.now() - a.tracker.savedAt > 12 * 3600e3) { clearActive(); return; }
  openRun(a.mode, a);
  toast('Run restored. Tap Resume to continue.');
}
