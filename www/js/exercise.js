// Exercise tab: strength plan (A/B/C), abs routines, yoga routines.
import { S, update, dstr, pdate, uid, fmtTime } from './store.js';
import { WORKOUTS, PROGRESSION, ROUTINES, workoutKeyToday } from './content.js';
import { $, esc, toast, beep, buzz, speak, openOv, closeOv, keepAwake } from './ui.js';

let sub = 'slim'; // slim | abs | yoga
let onChange = () => {};
export const setOnChange = (fn) => (onChange = fn);

const lastSession = (key) => [...S().sessions].reverse().find((s) => s.key === key);
const lastLabel = (key) => {
  const s = lastSession(key);
  return s ? `Last done ${pdate(s.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Not done yet';
};

// =============== Tab view ===============
export function renderExercise(root) {
  const seg = `<div class="seg">${[['slim', 'Slim plan'], ['abs', 'Abs'], ['yoga', 'Yoga']]
    .map(([k, l]) => `<button class="${sub === k ? 'on' : ''}" data-act="ex-sub" data-v="${k}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (sub === 'slim') {
    const today = workoutKeyToday();
    body = `<p class="muted">3 days a week with just a backpack. Rest 30–60 s between sets.</p>` +
      Object.entries(WORKOUTS).map(([k, w]) => `<div class="card">
        <div class="row between"><div><div class="eyebrow">${esc(w.focus)}</div><h2>${esc(w.name)}</h2></div>${k === today ? '<span class="badge">Today</span>' : ''}</div>
        <ul class="plain">${w.ex.map((e) => `<li>${esc(e.name)} <span class="muted">${e.sets} × ${e.reps}${e.unit || ''}</span></li>`).join('')}</ul>
        <div class="row between"><span class="muted small">${lastLabel(k)}</span></div>
        <button class="btn primary big" data-act="wk-open" data-v="${k}">Start ${esc(w.name)}</button></div>`).join('') +
      `<div class="card"><div class="eyebrow">How to progress</div><ol>${PROGRESSION.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></div>`;
  } else {
    body = ROUTINES[sub].map((r) => `<div class="card"><div class="eyebrow">≈ ${r.mins} min · ${r.steps.length} poses/moves</div><h2>${esc(r.name)}</h2>
      <p class="muted">${esc(r.blurb)}</p><div class="row between"><span class="muted small">${lastLabel(r.id)}</span></div>
      <button class="btn primary big" data-act="rt-open" data-v="${sub}:${r.id}">Start</button></div>`).join('');
  }
  root.innerHTML = `<h1>Exercise</h1>${seg}${body}`;
}

// =============== Strength workout ===============
let W = null; // { key, w, sets:{id:[bool]}, reps:{id:number} }
let rest = null; // { end, total }
let restTimer = null;

function openWorkout(key) {
  const w = WORKOUTS[key];
  const last = lastSession(key);
  W = { key, w, sets: {}, reps: {}, last: last?.ex || {} };
  w.ex.forEach((e) => { W.sets[e.id] = Array(e.sets).fill(false); W.reps[e.id] = W.last[e.id]?.[0] || e.reps; });
  renderWorkout();
  keepAwake(true);
}

function renderWorkout() {
  const { w, sets, reps, last } = W;
  const total = w.ex.reduce((a, e) => a + e.sets, 0);
  const done = Object.values(sets).flat().filter(Boolean).length;
  openOv('wk', `<div class="run"><div class="run-body scroll">
    <div class="row between"><h1>${esc(w.name)}</h1><button class="btn ghost small-btn" data-act="wk-close">Close</button></div>
    <div class="bar-track"><div class="bar-fill" style="width:${(done / total) * 100}%"></div></div>
    <p class="muted small">${done}/${total} sets done. Tap a set when you finish it; the rest timer starts automatically.</p>
    ${w.ex.map((e) => {
      const all = sets[e.id].every(Boolean);
      const lastTxt = last[e.id]?.length ? `Last time: ${last[e.id].join(', ')}${e.unit || ''}` : '';
      return `<div class="card ex ${all ? 'done' : ''}">
        <div class="row between"><h3>${esc(e.name)}</h3><button class="cbx ${all ? 'on' : ''}" data-act="wk-all" data-v="${e.id}" aria-label="Mark all sets done">${all ? '✓' : ''}</button></div>
        <div class="muted small">${e.sets} × ${e.reps}${e.unit || ''} · rest ${e.rest}s ${lastTxt ? '· ' + lastTxt : ''}</div>
        <div class="sets">${sets[e.id].map((d, i) => `<button class="setb ${d ? 'on' : ''}" data-act="wk-set" data-ex="${e.id}" data-i="${i}">${i + 1}</button>`).join('')}
          <label class="repbox">${e.unit === 's' ? 'secs' : 'reps'}<input type="number" inputmode="numeric" min="0" value="${reps[e.id]}" data-in="wk-reps" data-ex="${e.id}"></label></div>
        <details><summary>How to</summary><p>${esc(e.how)}</p></details></div>`;
    }).join('')}
    <button class="btn primary big" data-act="wk-finish">Finish workout</button><div class="spacer"></div></div>
    <div id="rest" class="restbar" hidden><span id="rest-t">0:00</span><span>rest</span><button class="btn ghost small-btn" data-act="rest-add">+15s</button><button class="btn ghost small-btn" data-act="rest-skip">Skip</button></div></div>`);
  updateRest();
}

function startRest(sec) {
  rest = { end: Date.now() + sec * 1000 };
  clearInterval(restTimer);
  restTimer = setInterval(updateRest, 250);
  updateRest();
}
function updateRest() {
  const bar = $('#rest');
  if (!bar) return;
  if (!rest) { bar.hidden = true; return; }
  const left = (rest.end - Date.now()) / 1000;
  if (left <= 0) { rest = null; clearInterval(restTimer); bar.hidden = true; beep(1000, 200, 2); buzz([200, 100, 200]); return; }
  bar.hidden = false;
  $('#rest-t').textContent = fmtTime(Math.ceil(left));
}
function endWorkout() {
  rest = null; clearInterval(restTimer); W = null; keepAwake(false); closeOv('wk');
}

// =============== Timed routines (abs, yoga) ===============
let P = null; // { kind, r, idx, phase, endAt, left, running, done:{} }
let pTimer = null;

function openRoutine(v) {
  const [kind, id] = v.split(':');
  const r = ROUTINES[kind].find((x) => x.id === id);
  P = { kind, r, idx: 0, phase: 'idle', endAt: 0, left: 0, running: false, done: {} };
  renderRoutine();
}

function setPhase(phase, sec) {
  P.phase = phase; P.left = sec; P.endAt = Date.now() + sec * 1000; P.running = true;
}
function startStep(i) {
  P.idx = i;
  const st = P.r.steps[i];
  setPhase('work', st.sec);
  beep(900, 150, 2); buzz(150);
  if (S().settings.voice) speak(st.name);
}
function renderRoutine() {
  const { r, idx, phase, done } = P;
  const st = r.steps[idx];
  const finished = phase === 'finished';
  const count = Object.values(done).filter(Boolean).length;
  const main = finished
    ? `<div class="coach done"><b>All done 🎉</b><span>Save the session to count it toward your streak.</span></div>`
    : `<div class="coach ${phase === 'rest' || phase === 'ready' ? 'walk' : 'go'}"><b>${phase === 'idle' ? 'Ready?' : phase === 'ready' ? 'Get ready' : phase === 'rest' ? 'Rest' : esc(st.name)}</b>
        <span class="big" id="rt-time">${phase === 'idle' ? fmtTime(st.sec) : fmtTime(Math.ceil(P.left))}</span>
        <span>${phase === 'rest' ? 'Next: ' + esc(r.steps[idx + 1]?.name || '') : esc(st.how)}</span></div>
      <div class="row gap">
        ${phase === 'idle' ? '<button class="btn primary huge grow" data-act="rt-go">START</button>'
          : `<button class="btn ${P.running ? 'warnb' : 'primary'} big grow" data-act="rt-toggle">${P.running ? 'Pause' : 'Resume'}</button><button class="btn ghost big grow" data-act="rt-skip">Skip ▶</button>`}
      </div>`;
  openOv('rt', `<div class="run"><div class="run-body scroll">
    <div class="row between"><h1>${esc(r.name)}</h1><button class="btn ghost small-btn" data-act="rt-close">Close</button></div>
    ${main}
    <div class="card"><div class="eyebrow">Steps · ${count}/${r.steps.length} done</div>
      ${r.steps.map((s, i) => `<div class="row between step ${i === idx && !finished && phase !== 'idle' ? 'cur' : ''}">
        <div><b>${esc(s.name)}</b> <span class="muted">${s.sec}s</span></div>
        <button class="cbx ${done[s.id] ? 'on' : ''}" data-act="rt-check" data-v="${s.id}" aria-label="Done">${done[s.id] ? '✓' : ''}</button></div>`).join('')}</div>
    <button class="btn primary big" data-act="rt-finish">Save session</button><div class="spacer"></div></div></div>`);
  clearInterval(pTimer);
  if (P.running) pTimer = setInterval(rtTick, 250);
}
function rtTick() {
  if (!P || !P.running) return;
  const left = (P.endAt - Date.now()) / 1000;
  if (left > 0) { const e = $('#rt-time'); if (e) e.textContent = fmtTime(Math.ceil(left)); return; }
  const st = P.r.steps[P.idx];
  if (P.phase === 'ready') { startStep(0); renderRoutine(); return; }
  if (P.phase === 'work') {
    P.done[st.id] = true;
    if (st.rest && P.idx < P.r.steps.length - 1) { setPhase('rest', st.rest); beep(600, 150); }
    else if (P.idx < P.r.steps.length - 1) startStep(P.idx + 1);
    else finishRoutine();
  } else if (P.phase === 'rest') startStep(P.idx + 1);
  renderRoutine();
}
function finishRoutine() {
  P.phase = 'finished'; P.running = false; clearInterval(pTimer);
  beep(1200, 200, 3); buzz([300, 100, 300]);
  if (S().settings.voice) speak('Session complete');
}
function endRoutine() { clearInterval(pTimer); P = null; closeOv('rt'); keepAwake(false); }

// =============== Actions ===============
export const act = {
  'ex-sub': (el) => { sub = el.dataset.v; onChange(); },
  'wk-open': (el) => openWorkout(el.dataset.v),
  'wk-close': () => { if (!W || !Object.values(W.sets).flat().some(Boolean) || confirm('Leave without saving this workout?')) endWorkout(); },
  'wk-set': (el) => {
    const { ex, i } = el.dataset, on = !W.sets[ex][+i];
    W.sets[ex][+i] = on;
    if (on) { const e = W.w.ex.find((x) => x.id === ex); const last = W.sets[ex].every(Boolean) && W.w.ex[W.w.ex.length - 1].id === ex && Object.values(W.sets).flat().every(Boolean); if (!last) startRest(e.rest); }
    renderWorkout();
  },
  'wk-all': (el) => { const id = el.dataset.v, on = !W.sets[id].every(Boolean); W.sets[id] = W.sets[id].map(() => on); renderWorkout(); },
  'rest-add': () => { if (rest) rest.end += 15000; updateRest(); },
  'rest-skip': () => { rest = null; updateRest(); },
  'wk-finish': () => {
    const logged = {};
    W.w.ex.forEach((e) => { const n = W.sets[e.id].filter(Boolean).length; if (n) logged[e.id] = Array(n).fill(+W.reps[e.id] || e.reps); });
    if (!Object.keys(logged).length) { toast('Tick at least one set first'); return; }
    update((s) => s.sessions.push({ id: uid(), date: dstr(), kind: 'strength', key: W.key, name: W.w.name, ex: logged }));
    toast('Workout saved ✓'); endWorkout(); onChange();
  },
  'rt-open': (el) => openRoutine(el.dataset.v),
  'rt-close': () => { if (!P || !Object.values(P.done).some(Boolean) || confirm('Leave without saving?')) endRoutine(); },
  'rt-go': () => { setPhase('ready', 5); keepAwake(true); renderRoutine(); },
  'rt-toggle': () => {
    if (P.running) { P.left = Math.max(0, (P.endAt - Date.now()) / 1000); P.running = false; }
    else { P.endAt = Date.now() + P.left * 1000; P.running = true; }
    renderRoutine();
  },
  'rt-skip': () => {
    const st = P.r.steps[P.idx];
    if (P.phase === 'ready') startStep(0);
    else {
      if (P.phase === 'work') P.done[st.id] = true;
      if (P.idx < P.r.steps.length - 1) startStep(P.idx + 1); else finishRoutine();
    }
    renderRoutine();
  },
  'rt-check': (el) => { P.done[el.dataset.v] = !P.done[el.dataset.v]; renderRoutine(); },
  'rt-finish': () => {
    if (!Object.values(P.done).some(Boolean)) { toast('Tick at least one exercise first'); return; }
    update((s) => s.sessions.push({ id: uid(), date: dstr(), kind: P.kind, key: P.r.id, name: P.r.name, ex: { ...P.done } }));
    toast('Session saved ✓'); endRoutine(); onChange();
  },
};

export function onInput(el) {
  if (el.dataset.in === 'wk-reps' && W) W.reps[el.dataset.ex] = +el.value;
}
