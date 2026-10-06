// Local-only storage + derived stats. Everything lives in localStorage on the device.
const KEY = 'fitnesscouch.v1';
const ACTIVE = 'fitnesscouch.activeRun';
const ROUTE = (id) => `fitnesscouch.route.${id}`;

export const pad = (n) => String(n).padStart(2, '0');
export const dstr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const pdate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d, n) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};
export const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
export const daysBetween = (a, b) => Math.round((b - a) / 864e5);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
export const fmtPace = (spk) => (spk && isFinite(spk) && spk < 3600 ? fmtTime(spk) : '--:--');
export const fmtKm = (m, dp = 2) => (m / 1000).toFixed(dp);

const fresh = () => ({
  v: 1,
  startDate: dstr(),
  settings: { theme: 'auto', voice: true, remindOn: false, remindTime: '06:30', planOffset: 0 },
  manual: {}, // { 'YYYY-MM-DD': { run: true, workout: true } }
  runs: [], // { id, date, start, dur(s), dist(m), felt, splits[], gaps, src }
  sessions: [], // { id, date, kind, name, ex: { exId: [reps...] } }
  body: [], // { date, weight, waist }
});

let state;
export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    const f = fresh();
    state = raw ? { ...f, ...raw, settings: { ...f.settings, ...raw.settings } } : f;
  } catch {
    state = fresh();
  }
  if (!localStorage.getItem(KEY)) persist();
  return state;
}
export const S = () => state;
export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('save failed', e);
  }
}
export function update(fn) {
  fn(state);
  persist();
}

export const saveRoute = (id, pts) => {
  try { localStorage.setItem(ROUTE(id), JSON.stringify(pts)); } catch {}
};
export const loadRoute = (id) => {
  try { return JSON.parse(localStorage.getItem(ROUTE(id))) || []; } catch { return []; }
};
export const dropRoute = (id) => localStorage.removeItem(ROUTE(id));

export const saveActive = (o) => { try { localStorage.setItem(ACTIVE, JSON.stringify(o)); } catch {} };
export const loadActive = () => { try { return JSON.parse(localStorage.getItem(ACTIVE)); } catch { return null; } };
export const clearActive = () => localStorage.removeItem(ACTIVE);

// ---- derived stats ----
export const runDone = (date) => state.runs.some((r) => r.date === date) || !!state.manual[date]?.run;
export const workoutDone = (date) => state.sessions.some((s) => s.date === date) || !!state.manual[date]?.workout;

export function activeDates() {
  const s = new Set();
  state.runs.forEach((r) => s.add(r.date));
  state.sessions.forEach((x) => s.add(x.date));
  for (const [d, v] of Object.entries(state.manual)) if (v.run || v.workout) s.add(d);
  return s;
}
export function streak() {
  const set = activeDates();
  let d = new Date();
  if (!set.has(dstr(d))) d = addDays(d, -1); // today not done yet doesn't break the streak
  let n = 0;
  while (set.has(dstr(d))) { n++; d = addDays(d, -1); }
  return n;
}
export function bestStreak() {
  const days = [...activeDates()].sort();
  let best = 0, cur = 0, prev = null;
  for (const s of days) {
    const d = pdate(s);
    cur = prev && daysBetween(prev, d) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}
export const dayNumber = () => Math.max(1, daysBetween(pdate(state.startDate), pdate(dstr())) + 1);

export function totals() {
  const manualWorkouts = Object.entries(state.manual).filter(([d, v]) => v.workout && !state.sessions.some((s) => s.date === d)).length;
  return {
    workouts: state.sessions.length + manualWorkouts,
    km: state.runs.reduce((a, r) => a + r.dist, 0) / 1000,
    runs: state.runs.length,
  };
}
export function weekKm(monday) {
  const a = dstr(monday), b = dstr(addDays(monday, 6));
  return state.runs.filter((r) => r.date >= a && r.date <= b).reduce((t, r) => t + r.dist, 0) / 1000;
}
export function personalBests() {
  const runs = state.runs;
  const longest = runs.reduce((b, r) => (!b || r.dist > b.dist ? r : b), null);
  const fastest = runs.filter((r) => r.dist >= 1000).reduce((b, r) => (!b || r.dur / r.dist < b.dur / b.dist ? r : b), null);
  let bestWeek = 0;
  const mons = new Set(runs.map((r) => dstr(mondayOf(pdate(r.date)))));
  mons.forEach((m) => (bestWeek = Math.max(bestWeek, weekKm(pdate(m)))));
  return { longest, fastest, bestWeek };
}

export function exportJSON() {
  const routes = {};
  state.runs.forEach((r) => (routes[r.id] = loadRoute(r.id)));
  return JSON.stringify({ app: 'fitness-couch', exportedAt: new Date().toISOString(), data: state, routes });
}
export function importJSON(text) {
  const o = JSON.parse(text);
  if (o.app !== 'fitness-couch' || !o.data) throw new Error('Not a Fitness Couch backup');
  const f = fresh();
  state = { ...f, ...o.data, settings: { ...f.settings, ...o.data.settings } };
  Object.entries(o.routes || {}).forEach(([id, pts]) => saveRoute(id, pts));
  persist();
}
