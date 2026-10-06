// GPS run tracker core: pure logic, no DOM. Runs in the browser and in Node (tests).
//
// Accuracy strategy:
//  1. Reject fixes with poor reported accuracy.
//  2. Reject physically impossible jumps (GPS glitches) before they reach the filter.
//  3. Smooth the remaining fixes with a Kalman filter weighted by each fix's accuracy.
//  4. Only add distance once we've moved further than the GPS noise floor, measured
//     from the last accepted point, so standing still never "creeps" forward.
//  5. Time is wall-clock based (timestamps), never counted by a ticking interval.

const R = 6371008.8; // mean Earth radius, metres
const rad = (d) => (d * Math.PI) / 180;

export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export class Kalman {
  constructor(q = 4) {
    this.q = q; // assumed max change in position per second (m/s)
    this.reset();
  }
  reset() {
    this.variance = -1;
  }
  process(lat, lng, acc, ts) {
    acc = Math.max(acc, 1);
    if (this.variance < 0) {
      this.ts = ts;
      this.lat = lat;
      this.lng = lng;
      this.variance = acc * acc;
    } else {
      const dt = ts - this.ts;
      if (dt > 0) {
        this.variance += (dt * this.q * this.q) / 1000;
        this.ts = ts;
      }
      const k = this.variance / (this.variance + acc * acc);
      this.lat += k * (lat - this.lat);
      this.lng += k * (lng - this.lng);
      this.variance = (1 - k) * this.variance;
    }
    return { lat: this.lat, lng: this.lng };
  }
}

export const DEFAULTS = {
  maxAcc: 30, // metres; fixes worse than this are ignored
  maxSpeed: 9, // m/s (~32 km/h); faster than any runner => glitch
  minStep: 6, // metres; floor for the movement threshold
  gapSec: 20, // longer than this between accepted points counts as a signal gap
  kalmanQ: 1,
};

export class RunTracker {
  constructor(cfg = {}) {
    this.cfg = { ...DEFAULTS, ...cfg };
    this.kal = new Kalman(this.cfg.kalmanQ);
    this.startTs = null;
    this.endTs = null;
    this.pausedMs = 0;
    this.pauseAt = null;
    this.dist = 0;
    this.pts = []; // [lat, lng, ts, cumulativeDistance]
    this.anchor = null; // last accepted (filtered) point
    this.lastRaw = null; // last non-glitch raw fix
    this.splitSecs = []; // cumulative active seconds at each completed km
    this.gaps = 0;
    this.rejected = { poor: 0, glitch: 0 };
    this.lastAcc = null;
  }

  get started() {
    return this.startTs !== null;
  }
  get paused() {
    return this.pauseAt !== null;
  }

  start(now) {
    this.startTs = now;
  }
  pause(now) {
    if (this.started && !this.paused) {
      this._flushTail();
      this.pauseAt = now;
    }
  }

  // The Kalman filter lags slightly behind the runner. Before pausing/finishing, add the
  // short distance between the last smoothed point and the latest raw fix.
  _flushTail() {
    const a = this.anchor, r = this.lastRaw;
    if (!a || !r || r.ts <= a.ts) return;
    const tail = haversine(a, r);
    if (tail < 3 || tail > 40) return;
    const before = this.dist;
    this.dist += tail;
    this.anchor = { lat: r.lat, lng: r.lng, ts: r.ts };
    this.pts.push([r.lat, r.lng, r.ts, this.dist]);
    this._splits(before, r.ts);
  }

  // Record each completed kilometre with interpolated time.
  _splits(before, ts) {
    const n = this.pts.length;
    const secNow = this.elapsed(ts);
    const tPrev = n > 1 ? this.elapsed(this.pts[n - 2][2]) : 0;
    let next = (this.splitSecs.length + 1) * 1000;
    while (this.dist >= next) {
      const frac = (next - before) / (this.dist - before);
      this.splitSecs.push(tPrev + frac * (secNow - tPrev));
      next += 1000;
    }
  }
  resume(now) {
    if (!this.paused) return;
    this.pausedMs += now - this.pauseAt;
    this.pauseAt = null;
    // Don't count whatever happened while paused.
    this.anchor = null;
    this.lastRaw = null;
    this.kal.reset();
  }

  /** Active (non-paused) seconds at wall-clock time `at`. */
  elapsed(at) {
    if (!this.started) return 0;
    const end = this.paused ? this.pauseAt : at;
    return Math.max(0, (end - this.startTs - this.pausedMs) / 1000);
  }

  /** Feed one geolocation fix. Returns a status string. */
  addFix({ lat, lng, acc, ts, speed }) {
    if (!this.started) return 'idle';
    this.lastAcc = acc;
    if (this.paused) return 'paused';
    const c = this.cfg;
    if (!(acc <= c.maxAcc)) {
      this.rejected.poor++;
      return 'poor';
    }
    const raw = { lat, lng, ts, acc };
    if (this.lastRaw) {
      const dt = (ts - this.lastRaw.ts) / 1000;
      if (dt <= 0) return 'dup';
      const jump = haversine(this.lastRaw, raw);
      // Allow max running speed plus both fixes' error radii, so a noisy-but-honest fix isn't flagged.
      if (jump > c.maxSpeed * dt + 2 * (acc + this.lastRaw.acc)) {
        this.rejected.glitch++;
        return 'glitch';
      }
    }
    this.lastRaw = raw;
    const f = this.kal.process(lat, lng, acc, ts);
    const cur = { lat: f.lat, lng: f.lng, ts };

    if (!this.anchor) {
      this.anchor = cur;
      this.pts.push([cur.lat, cur.lng, ts, this.dist]);
      return 'ok';
    }
    const d = haversine(this.anchor, cur);
    const minStep = Math.min(12, Math.max(c.minStep, acc * 0.6));
    if (d < minStep) return 'still';
    if (speed != null && speed < 0.3 && d < minStep * 2) return 'still';

    const dt = (ts - this.anchor.ts) / 1000;
    if (dt > c.gapSec) this.gaps++;
    const before = this.dist;
    this.dist += d;
    this.anchor = cur;
    this.pts.push([cur.lat, cur.lng, ts, this.dist]);

    this._splits(before, ts);
    return 'ok';
  }

  /** Pace over roughly the last 25 s, in seconds per km (null if not enough data). */
  currentPace() {
    const n = this.pts.length;
    if (n < 2 || this.paused) return null;
    const last = this.pts[n - 1];
    let i = n - 2;
    while (i > 0 && last[2] - this.pts[i][2] < 25000) i--;
    const dd = last[3] - this.pts[i][3];
    const dtSec = (last[2] - this.pts[i][2]) / 1000;
    if (dd < 15 || dtSec < 8) return null;
    return dtSec / (dd / 1000);
  }

  avgPace(at) {
    return this.dist >= 20 ? this.elapsed(at) / (this.dist / 1000) : null;
  }

  /** Per-km split durations in seconds (last entry may be a partial km). */
  splits(at) {
    const out = [];
    let prev = 0;
    for (const s of this.splitSecs) {
      out.push({ km: out.length + 1, sec: s - prev, full: true });
      prev = s;
    }
    const rest = this.dist - this.splitSecs.length * 1000;
    if (rest >= 100) out.push({ km: out.length + 1, sec: this.elapsed(at) - prev, full: false, dist: rest });
    return out;
  }

  /** Compact route for storage: lat/lng rounded to ~1 m. */
  route() {
    return this.pts.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5)]);
  }

  toJSON(savedAt) {
    return {
      startTs: this.startTs,
      pausedMs: this.pausedMs,
      pauseAt: this.pauseAt,
      dist: this.dist,
      pts: this.pts,
      splitSecs: this.splitSecs,
      gaps: this.gaps,
      rejected: this.rejected,
      savedAt,
    };
  }

  /** Restore after a reload. Comes back paused so dead time isn't counted. */
  static restore(o, cfg) {
    const t = new RunTracker(cfg);
    Object.assign(t, {
      startTs: o.startTs,
      pausedMs: o.pausedMs,
      pauseAt: o.pauseAt ?? o.savedAt,
      dist: o.dist,
      pts: o.pts,
      splitSecs: o.splitSecs,
      gaps: o.gaps,
      rejected: o.rejected,
    });
    return t;
  }
}
