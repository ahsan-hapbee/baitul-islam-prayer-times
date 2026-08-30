const AZAN_LEAD_MS = 15 * 60 * 1000;
const AZAN_TEST_MS = 10 * 1000;
const AZAN_SRC = "./audio/azan.mp3?v=14";
const AZAN_TEST_SRC = "./audio/azan-test10.mp3?v=14";
const KEEP_SRC = "./audio/keepalive.mp3?v=14";

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
  loading: false,
  player: null,
};

function azanPlayer() {
  if (azan.player) return azan.player;
  const el = document.createElement("audio");
  el.setAttribute("playsinline", "");
  el.setAttribute("webkit-playsinline", "");
  el.preload = "auto";
  document.body.appendChild(el);
  azan.player = el;
  return el;
}

function azanClock(ms) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ms));
}

function setMediaSession(title) {
  if (!navigator.mediaSession) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: "Baitul Islam",
      album: "Azan",
    });
    navigator.mediaSession.playbackState = "playing";
    navigator.mediaSession.setActionHandler("pause", () => {});
    navigator.mediaSession.setActionHandler("stop", () => disarmAzan());
  } catch {}
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

  if (azan.loading) {
    status.hidden = false;
    status.textContent = "Starting hold tone…";
    testBtn.textContent = "Cancel";
  } else if (azan.playing) {
    status.hidden = false;
    status.textContent = azan.mode === "test"
      ? "TEST · playing azan now. Tap Test or the minaret to stop."
      : `Playing azan for ${azan.prayerName} · tap the minaret to stop. This was a one-time play.`;
    btn.setAttribute("aria-label", "Stop azan");
    btn.title = "Stop azan";
    testBtn.textContent = "Stop test";
  } else if (azan.armed && azan.mode === "test") {
    status.hidden = false;
    status.textContent = `TEST armed · azan in ${remain}s. You can leave the app — a quiet hold tone keeps it alive.`;
    testBtn.textContent = `Cancel test · ${remain}s`;
  } else if (azan.armed) {
    status.hidden = false;
    status.textContent = `Armed once for ${azan.prayerName} at ${azanClock(azan.prayerAt)} · plays at ${azanClock(azan.fireAt)}. A quiet hold tone stays playing so backgrounding can work.`;
    btn.setAttribute("aria-label", "Cancel armed azan");
    btn.title = "Azan armed — tap to cancel";
    testBtn.textContent = "Test azan · 10 seconds";
  } else if (azan.lastError) {
    status.hidden = false;
    status.textContent = azan.lastError;
    testBtn.textContent = "Test azan · 10 seconds";
  } else {
    status.hidden = true;
    btn.setAttribute("aria-label", "Enable azan once, 15 minutes before the next prayer");
    btn.title = "Azan is off. Tap to play once, 15 minutes before the next prayer.";
    testBtn.textContent = "Test azan · 10 seconds";
  }
}

function stopPlayer() {
  if (azan.timer) {
    clearTimeout(azan.timer);
    azan.timer = null;
  }
  if (azan.wakeLock) {
    azan.wakeLock.release?.().catch(() => {});
    azan.wakeLock = null;
  }
  const el = azan.player;
  if (el) {
    el.onended = null;
    el.onerror = null;
    el.pause();
    el.removeAttribute("src");
    el.load();
  }
  if (navigator.mediaSession) {
    try { navigator.mediaSession.playbackState = "none"; } catch {}
  }
}

function disarmAzan() {
  azan.armed = false;
  azan.playing = false;
  azan.loading = false;
  azan.mode = null;
  azan.fireAt = null;
  azan.prayerAt = null;
  stopPlayer();
  updateAzanUi();
}

function markPlaying() {
  if (azan.playing) return;
  azan.armed = false;
  azan.playing = true;
  azan.lastError = null;
  setMediaSession(azan.mode === "test" ? "Azan test" : `Azan · ${azan.prayerName}`);
  updateAzanUi();
}

async function playSrc(src, loop) {
  const el = azanPlayer();
  el.loop = !!loop;
  el.src = src;
  el.currentTime = 0;
  await el.play();
}

async function fireAzanClip() {
  const el = azanPlayer();
  el.onended = () => disarmAzan();
  try {
    await playSrc(AZAN_SRC, false);
    markPlaying();
  } catch (err) {
    azan.playing = false;
    azan.lastError = `Azan did not play (${err.name}). Page was ${document.visibilityState}.`;
    updateAzanUi();
  }
}

async function armAzan() {
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
  try {
    azan.armed = true;
    azan.loading = true;
    updateAzanUi();
    const el = azanPlayer();
    el.onended = null;
    await playSrc(KEEP_SRC, true);
    setMediaSession(`Azan armed · ${azan.prayerName}`);
    if (navigator.wakeLock?.request) {
      navigator.wakeLock.request("screen").then((lock) => { azan.wakeLock = lock; }).catch(() => {});
    }
    azan.loading = false;
    const wait = Math.max(0, azan.fireAt - Date.now());
    if (wait === 0) {
      await fireAzanClip();
      return;
    }
    if (azan.timer) clearTimeout(azan.timer);
    azan.timer = setTimeout(() => { fireAzanClip(); }, wait);
    updateAzanUi();
  } catch (err) {
    azan.armed = false;
    azan.loading = false;
    azan.lastError = `Could not arm azan (${err.name}). Tap Test again.`;
    updateAzanUi();
  }
}

async function armAzanTest() {
  azan.lastError = null;
  azan.mode = "test";
  azan.prayerName = "Test";
  azan.fireAt = Date.now() + AZAN_TEST_MS;
  azan.prayerAt = azan.fireAt + 5 * 60 * 1000;
  azan.playing = false;
  azan.armed = true;
  azan.loading = true;
  updateAzanUi();
  try {
    const el = azanPlayer();
    el.onended = () => disarmAzan();
    el.ontimeupdate = () => {
      if (!azan.playing && el.currentTime >= 10) markPlaying();
    };
    await playSrc(AZAN_TEST_SRC, false);
    setMediaSession("Azan test armed");
    if (navigator.wakeLock?.request) {
      navigator.wakeLock.request("screen").then((lock) => { azan.wakeLock = lock; }).catch(() => {});
    }
    azan.loading = false;
    if (azan.timer) clearTimeout(azan.timer);
    azan.timer = setTimeout(() => markPlaying(), AZAN_TEST_MS);
    updateAzanUi();
  } catch (err) {
    azan.armed = false;
    azan.loading = false;
    azan.lastError = `Could not arm test (${err.name}: ${err.message}). Tap Test again.`;
    updateAzanUi();
  }
}

function tickAzan() {
  if (azan.playing) return;
  if (!azan.armed) return;
  if (azan.mode === "test") updateAzanUi();
  if (azan.mode === "live" && Date.now() >= azan.fireAt) fireAzanClip();
  if (azan.mode === "test" && Date.now() >= azan.fireAt) markPlaying();
}

document.getElementById("azan-btn").addEventListener("click", () => {
  if (azan.playing || azan.armed) disarmAzan();
  else armAzan();
});

document.getElementById("azan-test").addEventListener("click", () => {
  if (azan.playing || azan.armed) disarmAzan();
  else armAzanTest();
});

document.addEventListener("visibilitychange", () => tickAzan());

updateAzanUi();
