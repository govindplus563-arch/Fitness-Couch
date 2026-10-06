// Bridge to the Android app (Capacitor). In a normal browser every call falls back to web APIs.
const cap = window.Capacitor;
export const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());

const cache = {};
const plugin = (name) => (cache[name] ||= cap.registerPlugin(name));

/**
 * Start streaming GPS fixes. Native: a foreground service keeps delivering fixes with the screen off.
 * Calls onFix({coords:{latitude,longitude,accuracy,speed},timestamp}) and onErr({code}). Returns a stop function.
 */
export function watchGPS(onFix, onErr) {
  if (isNative) {
    let id = null, stopped = false;
    plugin('BackgroundGeolocation').addWatcher(
      { backgroundTitle: 'Fitness Couch', backgroundMessage: 'Recording your run…', requestPermissions: true, stale: false, distanceFilter: 0 },
      (loc, err) => {
        if (err) return onErr({ code: err.code === 'NOT_AUTHORIZED' ? 1 : 2 });
        if (loc) onFix({ coords: { latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy, speed: loc.speed }, timestamp: loc.time || Date.now() });
      }
    ).then((wid) => { id = wid; if (stopped) plugin('BackgroundGeolocation').removeWatcher({ id }); }).catch(() => onErr({ code: 2 }));
    return () => { stopped = true; if (id) plugin('BackgroundGeolocation').removeWatcher({ id }); };
  }
  if (!('geolocation' in navigator)) { onErr({ code: 2 }); return () => {}; }
  const wid = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  return () => navigator.geolocation.clearWatch(wid);
}

export function nativeSpeak(text) {
  if (!isNative) return false;
  plugin('TextToSpeech').speak({ text, lang: 'en-US', rate: 1.0, queueStrategy: 1 }).catch(() => {});
  return true;
}
export function nativeBuzz(ms) {
  if (!isNative) return false;
  plugin('Haptics').vibrate({ duration: Array.isArray(ms) ? ms.reduce((a, b) => a + b, 0) : ms }).catch(() => {});
  return true;
}
export const openAppSettings = () => isNative && plugin('BackgroundGeolocation').openSettings();

/** Native daily reminders on run days (works with the app closed). */
export async function setNativeReminders(on, days, time) {
  if (!isNative) return false;
  const LN = plugin('LocalNotifications');
  try {
    await LN.cancel({ notifications: [101, 102, 103, 104, 105, 106, 107].map((id) => ({ id })) });
    if (!on) return true;
    const perm = await LN.requestPermissions();
    if (perm.display !== 'granted') return false;
    const [hour, minute] = time.split(':').map(Number);
    await LN.schedule({
      notifications: days.map((wd, i) => ({
        id: 101 + i, title: 'Time for your run 🏃', body: 'Open Fitness Couch and tap Start run.',
        schedule: { on: { weekday: wd + 1, hour, minute }, allowWhileIdle: true },
      })),
    });
    return true;
  } catch { return false; }
}
export async function askNotificationPermission() {
  if (!isNative) return;
  try { await plugin('LocalNotifications').requestPermissions(); } catch {}
}
