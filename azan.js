const AZAN_LEAD_MS = 15 * 60 * 1000;
const AZAN_TEST_MS = 30 * 1000;
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

const azan = {
  armed: false,
  playing: false,
  mode: null,
  fireAt: null,
  prayerAt: null,
  prayerName: null,
  timer: null,
  wakeLock: null,
  lastError: null,
  audio: new Audio("./audio/azan.mp3"),
  keepAlive: new Audio(SILENT_WAV),
};

azan.audio.preload = "auto";
azan.audio.loop = false;
azan.audio.setAttribute("playsinline", "");
azan.keepAlive.loop = true;
azan.keepAlive.setAttribute("playsinline", "");

function azanClock(ms) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ms));
}

function updateAzanUi() {
  const btn = document.getElementById("azan-btn");
  const testBtn = document.getElementById("azan-test");
  const status = document.getElementById("azan-status");
  if (!btn || !status || !testBtn) return;
  const remain = azan.fireAt ? Math.max(0, Math.ceil((azan.fireAt - Date.now()) / 1000)) : 0;
  btn.classList.toggle("armed", azan.armed && !azan.playing && azan.mode !== "test");
  btn.classList.toggle("playing", azan.playing);
  btn.setAttribute("aria-pressed", azan.armed || azan.playing ? "true" : "false");
  testBtn.classList.toggle("armed", azan.armed && azan.mode === "test" && !azan.playing);
  testBtn.classList.toggle("playing", azan.playing && azan.mode === "test");

  if (azan.playing) {
    status.hidden = false;
    status.textContent = azan.mode === "test"
      ? "TEST · playing azan now. Tap Test or the minaret to stop."
      : `Playing azan for ${azan.prayerName} · tap the minaret to stop. This was a one-time play.`;
    btn.setAttribute("aria-label", "Stop azan");
    btn.title = "Stop azan";
    testBtn.textContent = "Stop test";
  } else if (azan.armed && azan.mode === "test") {
    status.hidden = false;
    status.textContent = `TEST armed · azan in ${remain}s. Leave this page open (screen on).`;
    testBtn.textContent = `Cancel test · ${remain}s`;
  } else if (azan.armed) {
    status.hidden = false;
    status.textContent = `Armed once for ${azan.prayerName} at ${azanClock(azan.prayerAt)} · plays at ${azanClock(azan.fireAt)}. Keep this page open.`;
    btn.setAttribute("aria-label", "Cancel armed azan");
    btn.title = "Azan armed — tap to cancel";
    testBtn.textContent = "Test azan · 30 seconds";
  } else if (azan.lastError) {
    status.hidden = false;
    status.textContent = azan.lastError;
    testBtn.textContent = "Test azan · 30 seconds";
  } else {
    status.hidden = true;
    btn.setAttribute("aria-label", "Enable azan once, 15 minutes before the next prayer");
    btn.title = "Azan is off. Tap to play once, 15 minutes before the next prayer.";
    testBtn.textContent = "Test azan · 30 seconds";
  }
}

function stopKeepAlive() {
  azan.keepAlive.pause();
  azan.keepAlive.currentTime = 0;
  if (azan.timer) {
    clearTimeout(azan.timer);
    azan.timer = null;
  }
  if (azan.wakeLock) {
    azan.wakeLock.release?.().catch(() => {});
    azan.wakeLock = null;
  }
}

function disarmAzan() {
  azan.armed = false;
  azan.playing = false;
  azan.mode = null;
  azan.fireAt = null;
  azan.prayerAt = null;
  azan.audio.pause();
  azan.audio.currentTime = 0;
  stopKeepAlive();
  updateAzanUi();
}

function playAzanOnce() {
  if (azan.playing) return;
  azan.armed = false;
  azan.playing = true;
  azan.lastError = null;
  if (azan.timer) {
    clearTimeout(azan.timer);
    azan.timer = null;
  }
  updateAzanUi();
  const a = azan.audio;
  a.loop = false;
  a.muted = false;
  a.volume = 1;
  a.currentTime = 0;
  const finish = () => {
    a.removeEventListener("ended", finish);
    disarmAzan();
  };
  a.addEventListener("ended", finish);
  const visible = document.visibilityState;
  a.play().then(() => {
    azan.lastError = null;
    azan.keepAlive.pause();
    updateAzanUi();
  }).catch((err) => {
    a.removeEventListener("ended", finish);
    azan.playing = false;
    azan.lastError = `Azan did not play (${err.name}). Page was ${visible}. Leave the site open and the screen on, then tap Test again.`;
    updateAzanUi();
  });
}

function startKeepAlive() {
  azan.keepAlive.currentTime = 0;
  azan.keepAlive.play().catch(() => {});
  if (navigator.wakeLock?.request) {
    navigator.wakeLock.request("screen").then((lock) => {
      azan.wakeLock = lock;
    }).catch(() => {});
  }
}

function scheduleFire() {
  const delay = Math.max(0, azan.fireAt - Date.now());
  if (azan.timer) clearTimeout(azan.timer);
  azan.timer = setTimeout(() => tickAzan(new Date()), delay);
}

function armAzan() {
  const now = new Date();
  const state = getScheduleState(now);
  if (state.ramadan || !state.next || !state.nextAt) {
    const status = document.getElementById("azan-status");
    status.hidden = false;
    status.textContent = "No iqamah on this chart to arm azan.";
    return;
  }
  azan.lastError = null;
  azan.mode = "live";
  azan.prayerName = state.next.name;
  azan.prayerAt = state.nextAt;
  azan.fireAt = state.nextAt - AZAN_LEAD_MS;
  azan.playing = false;
  if (now.getTime() >= azan.prayerAt) {
    disarmAzan();
    return;
  }
  startKeepAlive();
  azan.armed = true;
  if (now.getTime() >= azan.fireAt) {
    playAzanOnce();
    return;
  }
  scheduleFire();
  updateAzanUi();
}

function armAzanTest() {
  azan.lastError = null;
  azan.mode = "test";
  azan.prayerName = "Test";
  azan.prayerAt = Date.now() + AZAN_TEST_MS + 60 * 1000;
  azan.fireAt = Date.now() + AZAN_TEST_MS;
  azan.playing = false;
  startKeepAlive();
  azan.armed = true;
  scheduleFire();
  updateAzanUi();
}

function tickAzan(now = new Date()) {
  if (azan.playing) return;
  if (!azan.armed) return;
  const t = now.getTime();
  if (azan.mode === "test") updateAzanUi();
  if (azan.prayerAt && t >= azan.prayerAt && azan.mode !== "test") {
    disarmAzan();
    return;
  }
  if (t >= azan.fireAt) playAzanOnce();
}

document.getElementById("azan-btn").addEventListener("click", () => {
  if (azan.playing || azan.armed) disarmAzan();
  else armAzan();
});

document.getElementById("azan-test").addEventListener("click", () => {
  if (azan.playing || azan.armed) disarmAzan();
  else armAzanTest();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") tickAzan(new Date());
});

updateAzanUi();
