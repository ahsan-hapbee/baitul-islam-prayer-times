const AZAN_LEAD_MS = 15 * 60 * 1000;
const AZAN_TEST_MS = 10 * 1000;

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
  ctx: null,
  buffer: null,
  raw: null,
  source: null,
  keepGain: null,
  keepOsc: null,
};

fetch("./audio/azan.mp3")
  .then((r) => r.arrayBuffer())
  .then((buf) => { azan.raw = buf; })
  .catch(() => {});

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

  if (azan.loading) {
    status.hidden = false;
    status.textContent = azan.mode === "test"
      ? "TEST · loading azan, then it will fire in 10s…"
      : "Loading azan…";
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
    status.textContent = `TEST armed · azan in ${remain}s. Leave this page open (screen on).`;
    testBtn.textContent = `Cancel test · ${remain}s`;
  } else if (azan.armed) {
    status.hidden = false;
    status.textContent = `Armed once for ${azan.prayerName} at ${azanClock(azan.prayerAt)} · plays at ${azanClock(azan.fireAt)}. Keep this page open.`;
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

function stopKeepAlive() {
  if (azan.keepOsc) {
    try { azan.keepOsc.stop(); } catch {}
    azan.keepOsc = null;
    azan.keepGain = null;
  }
  if (azan.timer) {
    clearTimeout(azan.timer);
    azan.timer = null;
  }
  if (azan.wakeLock) {
    azan.wakeLock.release?.().catch(() => {});
    azan.wakeLock = null;
  }
}

function stopSource() {
  if (!azan.source) return;
  const source = azan.source;
  azan.source = null;
  source.onended = null;
  try { source.stop(); } catch {}
}

function disarmAzan() {
  azan.armed = false;
  azan.playing = false;
  azan.loading = false;
  azan.mode = null;
  azan.fireAt = null;
  azan.prayerAt = null;
  stopSource();
  stopKeepAlive();
  updateAzanUi();
}

function audioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!azan.ctx) azan.ctx = new AC();
  return azan.ctx;
}

async function azanBuffer() {
  const ctx = audioCtx();
  if (azan.buffer) return azan.buffer;
  const raw = azan.raw
    ? azan.raw.slice(0)
    : await (await fetch("./audio/azan.mp3")).arrayBuffer();
  azan.buffer = await ctx.decodeAudioData(raw);
  return azan.buffer;
}

function startKeepAlive(ctx) {
  stopKeepAlive();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0.00008;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  azan.keepOsc = osc;
  azan.keepGain = gain;
  if (navigator.wakeLock?.request) {
    navigator.wakeLock.request("screen").then((lock) => {
      azan.wakeLock = lock;
    }).catch(() => {});
  }
}

function markPlaying() {
  if (azan.playing) return;
  azan.armed = false;
  azan.playing = true;
  azan.lastError = null;
  updateAzanUi();
}

async function scheduleAzan(delayMs) {
  const ctx = audioCtx();
  if (ctx.state === "suspended") await ctx.resume();
  startKeepAlive(ctx);
  const buf = await azanBuffer();
  if (ctx.state === "suspended") await ctx.resume();
  stopSource();
  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.connect(ctx.destination);
  const delaySec = Math.max(0, delayMs / 1000);
  source.onended = () => {
    if (azan.source === source) {
      azan.source = null;
      disarmAzan();
    }
  };
  source.start(ctx.currentTime + delaySec);
  azan.source = source;
  if (azan.timer) clearTimeout(azan.timer);
  azan.timer = setTimeout(() => {
    markPlaying();
    if (azan.keepOsc) {
      try { azan.keepOsc.stop(); } catch {}
      azan.keepOsc = null;
    }
  }, Math.max(0, delayMs));
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
    await scheduleAzan(Math.max(0, azan.fireAt - Date.now()));
    azan.loading = false;
    if (Date.now() >= azan.fireAt) markPlaying();
    else updateAzanUi();
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
    await scheduleAzan(Math.max(0, azan.fireAt - Date.now()));
    azan.loading = false;
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
  if (azan.ctx && azan.ctx.state === "suspended") azan.ctx.resume().catch(() => {});
  if (Date.now() >= azan.fireAt) markPlaying();
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
  if (document.visibilityState === "visible" && azan.ctx?.state === "suspended") {
    azan.ctx.resume().catch(() => {});
  }
  tickAzan();
});

updateAzanUi();
