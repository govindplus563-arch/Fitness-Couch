import assert from 'node:assert/strict';
import { RunTracker, haversine } from '../www/js/tracker.js';

// Deterministic RNG + gaussian noise
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const M = 111320; // metres per degree latitude
const toLL = (x, y) => ({ lat: 12.9 + y / M, lng: 77.6 + x / (M * Math.cos((12.9 * Math.PI) / 180)) });

// A winding route (not a straight line), 3 m/s, 1 fix/second.
function simulate({ metres, sigma, glitches = 0, standStill = 0 }) {
  const t = new RunTracker();
  const t0 = 1_700_000_000_000;
  t.start(t0);
  let naive = 0, prev = null, truth = 0, ts = t0;
  let s = 0;
  const fixes = [];
  while (s < metres) {
    ts += 1000; s += 3;
    const x = s, y = 80 * Math.sin(s / 150);   // gentle curves
    fixes.push({ x, y, ts });
  }
  // stand at a traffic light at the end
  for (let i = 0; i < standStill; i++) { ts += 1000; fixes.push({ ...fixes[fixes.length - 1], ts }); }
  let prevTrue = null;
  fixes.forEach((f, i) => {
    if (prevTrue) truth += Math.hypot(f.x - prevTrue.x, f.y - prevTrue.y);
    prevTrue = f;
    let nx = f.x + gauss() * sigma, ny = f.y + gauss() * sigma;
    if (glitches && i % Math.floor(fixes.length / glitches) === 50) { nx += 400; ny -= 300; }
    const ll = toLL(nx, ny);
    const p = { ...ll, acc: Math.max(3, sigma * 1.5), ts: f.ts, speed: null };
    if (prev) naive += haversine(prev, p);
    prev = p;
    t.addFix(p);
  });
  return { t, truth, naive, end: ts };
}

const fails = [];
for (const [label, opts] of [
  ['good GPS  (σ=3m)', { metres: 5000, sigma: 3 }],
  ['typical   (σ=6m)', { metres: 5000, sigma: 6 }],
  ['noisy     (σ=10m) + glitches + standing', { metres: 5000, sigma: 10, glitches: 4, standStill: 90 }],
]) {
  const { t, truth, naive, end } = simulate(opts);
  t.pause(end); // finishing flushes the filter lag
  const err = ((t.dist - truth) / truth) * 100;
  const nerr = ((naive - truth) / truth) * 100;
  console.log(`${label}: true ${truth.toFixed(0)} m | tracker ${t.dist.toFixed(0)} m (${err.toFixed(1)}%) | naive point-sum ${naive.toFixed(0)} m (${nerr.toFixed(1)}%) | km splits ${t.splitSecs.length} | glitches rejected ${t.rejected.glitch}`);
  if (!(Math.abs(err) < 3)) fails.push(`${label}: error ${err.toFixed(2)}% too large`);
  assert.equal(t.splitSecs.length, Math.floor(t.dist / 1000));
  assert.equal(Math.round(t.elapsed(end)), Math.round((end - 1_700_000_000_000) / 1000));
}

assert.deepEqual(fails, []);

// Pause: distance and time must not accumulate while paused, and no jump on resume.
{
  const t = new RunTracker(); const t0 = 1e12; t.start(t0);
  const pt = (i, x) => ({ ...toLL(x, 0), acc: 4, ts: t0 + i * 1000, speed: null });
  for (let i = 1; i <= 60; i++) t.addFix(pt(i, i * 3));
  const d1 = t.dist; t.pause(t0 + 60_000);
  for (let i = 61; i <= 120; i++) t.addFix(pt(i, i * 3)); // moving while paused: ignored
  t.resume(t0 + 120_000);
  for (let i = 121; i <= 180; i++) t.addFix(pt(i, i * 3));
  assert.ok(Math.abs(d1 - 180) < 25, `pre-pause ${d1}`);
  assert.ok(Math.abs(t.dist - 2 * d1) < 25, `total ${t.dist}`);
  assert.equal(Math.round(t.elapsed(t0 + 180_000)), 120);
}

// Persist / restore comes back paused.
{
  const t = new RunTracker(); t.start(1000);
  const r = RunTracker.restore(JSON.parse(JSON.stringify(t.toJSON(5000))));
  assert.ok(r.paused && r.elapsed(99999) === 4);
}
// Poor accuracy is ignored.
{
  const t = new RunTracker(); t.start(0);
  assert.equal(t.addFix({ lat: 1, lng: 1, acc: 80, ts: 1000 }), 'poor');
}
console.log('OK');
