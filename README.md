# Fitness Couch

A simple PWA for a beginner home-fitness + running routine. Vanilla JS, no build step, all data stays on the phone.

- **Home**: day count, streak, today's tasks, totals, weekly progress, weight/waist trend
- **Running**: automatic GPS run tracking (timer, distance, pace, km splits, route), ongoing walk/run → distance plan, run log, PBs
- **Exercise**: backpack workouts A/B/C with set tracking and rest timer, abs routines, yoga routines (guided timers)

## Install on your phone (Chrome / Android)

GPS needs **HTTPS**, so host the folder somewhere secure. Easiest is GitHub Pages:
repo **Settings → Pages → Deploy from a branch → `main` / root**. Open the `https://<you>.github.io/<repo>/` link in Chrome, then ⋮ → **Add to Home screen / Install app**.

## GPS accuracy

`js/tracker.js` rejects low-accuracy fixes and impossible jumps, smooths with a Kalman filter, ignores drift while standing still, and measures time from timestamps. In simulated 5 km runs with 3–10 m GPS noise it stays within ~1% of true distance (`npm test`). Real-world accuracy depends on the phone's GPS and sky view (open roads are best, tall buildings and trees are worst).

Browser limits: Chrome stops delivering GPS to a web page when the screen is off, so the app keeps the screen awake and offers a **Lock** button. If the app is killed mid-run it restores in a paused state.

## Develop

```
npm run serve   # web version at http://localhost:8000
npm test                      # tracker accuracy tests
```

## Android app (tracks with the screen off)

The same code is wrapped with [Capacitor](https://capacitorjs.com) and uses a native foreground location service
(`@capacitor-community/background-geolocation`), so GPS keeps recording with the screen locked.
`www/js/native.js` is the only place that knows the difference between the app and the browser.

- Build: push to GitHub; the **Build Android APK** workflow produces `fitness-couch-apk` (Actions → run → Artifacts).
- Install: download the APK to your phone, open it, allow "install unknown apps". Grant **precise** location, **Allow all the time**, notifications, and set battery to **Unrestricted** for the app.
- Local build (needs Android SDK + JDK 21): `npx cap sync android && cd android && ./gradlew assembleDebug`
