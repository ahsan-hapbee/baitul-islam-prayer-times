const AZAN_LEAD_MS = 15 * 60 * 1000;

const azan = {
  armed: false,
  playing: false,
  fireAt: null,
  prayerAt: null,
  prayerName: null,
  audio: new Audio("./audio/azan.mp3"),
};

azan.audio.preload = "auto";
azan.audio.loop = false;
azan.audio.setAttribute("playsinline", "");

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
  const status = document.getElementById("azan-status");
  if (!btn || !status) return;
  btn.classList.toggle("armed", azan.armed && !azan.playing);
  btn.classList.toggle("playing", azan.playing);
  btn.setAttribute("aria-pressed", azan.armed || azan.playing ? "true" : "false");
  if (azan.playing) {
    status.hidden = false;
    status.textContent = `Playing azan for ${azan.prayerName} · tap the minaret to stop. This was a one-time play.`;
    btn.setAttribute("aria-label", "Stop azan");
    btn.title = "Stop azan";
  } else if (azan.armed) {
    status.hidden = false;
    status.textContent = `Armed once for ${azan.prayerName} at ${azanClock(azan.prayerAt)} · plays at ${azanClock(azan.fireAt)}. Keep this page open.`;
    btn.setAttribute("aria-label", "Cancel armed azan");
    btn.title = "Azan armed — tap to cancel";
  } else {
    status.hidden = true;
    btn.setAttribute("aria-label", "Enable azan once, 15 minutes before the next prayer");
    btn.title = "Azan is off. Tap to play once, 15 minutes before the next prayer.";
  }
}

function disarmAzan() {
  azan.armed = false;
  azan.playing = false;
  azan.fireAt = null;
  azan.prayerAt = null;
  azan.audio.pause();
  azan.audio.currentTime = 0;
  updateAzanUi();
}

function playAzanOnce() {
  if (azan.playing) return;
  azan.armed = false;
  azan.playing = true;
  updateAzanUi();
  const a = azan.audio;
  a.loop = false;
  a.currentTime = 0;
  const finish = () => {
    a.removeEventListener("ended", finish);
    disarmAzan();
  };
  a.addEventListener("ended", finish);
  a.play().catch(() => finish());
}

function unlockAzanAudio() {
  const a = azan.audio;
  a.muted = true;
  const p = a.play();
  if (p && typeof p.then === "function") {
    p.then(() => {
      a.pause();
      a.currentTime = 0;
      a.muted = false;
    }).catch(() => {
      a.muted = false;
    });
  } else {
    a.pause();
    a.currentTime = 0;
    a.muted = false;
  }
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
  unlockAzanAudio();
  azan.prayerName = state.next.name;
  azan.prayerAt = state.nextAt;
  azan.fireAt = state.nextAt - AZAN_LEAD_MS;
  azan.playing = false;
  if (now.getTime() >= azan.prayerAt) {
    disarmAzan();
    return;
  }
  azan.armed = true;
  if (now.getTime() >= azan.fireAt) {
    playAzanOnce();
    return;
  }
  updateAzanUi();
}

function tickAzan(now = new Date()) {
  if (!azan.armed || azan.playing) return;
  const t = now.getTime();
  if (t >= azan.prayerAt) {
    disarmAzan();
    return;
  }
  if (t >= azan.fireAt) playAzanOnce();
}

document.getElementById("azan-btn").addEventListener("click", () => {
  if (azan.playing || azan.armed) disarmAzan();
  else armAzan();
});

updateAzanUi();
