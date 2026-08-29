const KAABA = { lat: 21.422487, lng: 39.826206 };
const MAPLE = {
  name: "60 Bashir St, Maple",
  lat: 43.8649,
  lng: -79.5418,
  declination: -10.9,
};

function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }

function qiblaBearing(lat, lng) {
  const lat1 = toRad(lat);
  const lat2 = toRad(KAABA.lat);
  const dLon = toRad(KAABA.lng - lng);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function qiblaDistanceKm(lat, lng) {
  const lat1 = toRad(lat);
  const lat2 = toRad(KAABA.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(KAABA.lng - lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function cardinal16(bearing) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(bearing / 22.5) % 16];
}

function shortestDiff(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function declinationFor(lat, lng) {
  if (lat > 42.5 && lat < 45.5 && lng > -81.5 && lng < -77.5) return MAPLE.declination;
  return MAPLE.declination;
}

const qiblaState = {
  lat: MAPLE.lat,
  lng: MAPLE.lng,
  place: MAPLE.name,
  qibla: qiblaBearing(MAPLE.lat, MAPLE.lng),
  km: qiblaDistanceKm(MAPLE.lat, MAPLE.lng),
  heading: 0,
  headingSmooth: 0,
  hasCompass: false,
  dragging: false,
  lastX: 0,
};

function applyQiblaView() {
  const stage = document.getElementById("qibla-stage");
  const degEl = document.getElementById("qibla-deg");
  const cardEl = document.getElementById("qibla-cardinal");
  const hintEl = document.getElementById("qibla-hint");
  const placeEl = document.getElementById("qibla-place");
  const distEl = document.getElementById("qibla-dist");
  if (!stage) return;

  const q = qiblaState.qibla;
  const h = qiblaState.headingSmooth;
  const diff = shortestDiff(h, q);
  const aligned = Math.abs(diff) <= 8;

  stage.style.setProperty("--head", h.toFixed(2));
  stage.style.setProperty("--qibla", q.toFixed(2));
  stage.classList.toggle("aligned", aligned);

  degEl.textContent = `${q.toFixed(1)}°`;
  cardEl.textContent = cardinal16(q) === "NE" || cardinal16(q) === "ENE"
    ? "Northeast"
    : cardinal16(q);

  placeEl.textContent = qiblaState.place;
  distEl.textContent = `${Math.round(qiblaState.km).toLocaleString("en-CA")} km to the Kaaba`;

  if (aligned) {
    hintEl.textContent = "You are facing Qibla";
    if (qiblaState.hasCompass && !qiblaState._buzzed) {
      qiblaState._buzzed = true;
      navigator.vibrate?.(20);
    }
  } else {
    qiblaState._buzzed = false;
    const turn = diff > 0 ? "right" : "left";
    const amount = Math.abs(Math.round(diff));
    if (qiblaState.hasCompass) {
      hintEl.textContent = `Turn ${turn} ${amount}° · hold the phone upright`;
    } else {
      hintEl.textContent = `From here, face ${cardEl.textContent.toLowerCase()} (${q.toFixed(0)}° from true north). Drag to look around, or start the compass on a phone.`;
    }
  }
}

function setLocation(lat, lng, place) {
  qiblaState.lat = lat;
  qiblaState.lng = lng;
  qiblaState.place = place;
  qiblaState.qibla = qiblaBearing(lat, lng);
  qiblaState.km = qiblaDistanceKm(lat, lng);
  applyQiblaView();
}

function compassHeading(event) {
  if (typeof event.webkitCompassHeading === "number" && !Number.isNaN(event.webkitCompassHeading)) {
    return (event.webkitCompassHeading + declinationFor(qiblaState.lat, qiblaState.lng) + 360) % 360;
  }
  if (event.absolute === true && typeof event.alpha === "number") {
    return (360 - event.alpha) % 360;
  }
  if (typeof event.alpha === "number") {
    return (360 - event.alpha) % 360;
  }
  return null;
}

function onOrientation(event) {
  const heading = compassHeading(event);
  if (heading == null) return;
  qiblaState.hasCompass = true;
  qiblaState.heading = heading;
  document.getElementById("qibla-compass").hidden = true;
}

function animateQibla() {
  const target = qiblaState.heading;
  let d = shortestDiff(qiblaState.headingSmooth, target);
  qiblaState.headingSmooth = (qiblaState.headingSmooth + d * 0.2 + 360) % 360;
  applyQiblaView();
  requestAnimationFrame(animateQibla);
}

async function startCompass() {
  const btn = document.getElementById("qibla-compass");
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== "granted") {
        btn.textContent = "Compass permission denied";
        return;
      }
    }
    window.addEventListener("deviceorientationabsolute", onOrientation, true);
    window.addEventListener("deviceorientation", onOrientation, true);
    btn.hidden = true;
  } catch (err) {
    btn.textContent = "Compass not available";
  }
}

function startGps() {
  const btn = document.getElementById("qibla-gps");
  if (!navigator.geolocation) {
    btn.textContent = "No GPS";
    return;
  }
  btn.textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setLocation(pos.coords.latitude, pos.coords.longitude, "Your location");
      btn.textContent = "Maple";
      btn.dataset.mode = "reset";
    },
    () => {
      btn.textContent = "GPS blocked";
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
  );
}

function bindQiblaDrag() {
  const stage = document.getElementById("qibla-stage");
  stage.addEventListener("pointerdown", (e) => {
    qiblaState.dragging = true;
    qiblaState.lastX = e.clientX;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!qiblaState.dragging) return;
    const dx = e.clientX - qiblaState.lastX;
    qiblaState.lastX = e.clientX;
    qiblaState.heading = (qiblaState.heading - dx * 0.45 + 360) % 360;
  });
  const stop = () => { qiblaState.dragging = false; };
  stage.addEventListener("pointerup", stop);
  stage.addEventListener("pointercancel", stop);
}

document.getElementById("qibla-compass").addEventListener("click", startCompass);
document.getElementById("qibla-gps").addEventListener("click", () => {
  const btn = document.getElementById("qibla-gps");
  if (btn.dataset.mode === "reset") {
    setLocation(MAPLE.lat, MAPLE.lng, MAPLE.name);
    btn.textContent = "My location";
    delete btn.dataset.mode;
    return;
  }
  startGps();
});

bindQiblaDrag();
if (new URLSearchParams(location.search).has("aligned")) {
  qiblaState.heading = qiblaState.qibla;
  qiblaState.headingSmooth = qiblaState.qibla;
}
applyQiblaView();
requestAnimationFrame(animateQibla);
