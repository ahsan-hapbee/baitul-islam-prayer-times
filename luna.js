const LUNA_MAPLE = {
  name: "60 Bashir St, Maple",
  lat: 43.8649,
  lng: -79.5418,
  declination: -10.9,
};

const luna = {
  lat: LUNA_MAPLE.lat,
  lng: LUNA_MAPLE.lng,
  place: LUNA_MAPLE.name,
  heading: 0,
  headingSmooth: 0,
  altView: 15,
  altSmooth: 15,
  followPhone: false,
  hasCompass: false,
  dragging: false,
  lastX: 0,
  lastY: 0,
};

function lunaShortest(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function lunaCardinal(az) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(((az % 360) + 360) % 360 / 22.5) % 16];
}

function azFromNorth(rad) {
  return (rad * 180 / Math.PI + 180 + 360) % 360;
}

function radToDeg(rad) {
  return rad * 180 / Math.PI;
}

function phaseName(phase) {
  if (phase < 0.03 || phase >= 0.97) return "New Moon";
  if (phase < 0.22) return "Waxing Crescent";
  if (phase < 0.28) return "First Quarter";
  if (phase < 0.47) return "Waxing Gibbous";
  if (phase < 0.53) return "Full Moon";
  if (phase < 0.72) return "Waning Gibbous";
  if (phase < 0.78) return "Last Quarter";
  return "Waning Crescent";
}

function fmtSkyTime(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function skyNow() {
  const date = new Date();
  const moonP = SunCalc.getMoonPosition(date, luna.lat, luna.lng);
  const sunP = SunCalc.getPosition(date, luna.lat, luna.lng);
  const illum = SunCalc.getMoonIllumination(date);
  const times = SunCalc.getMoonTimes(date, luna.lat, luna.lng);
  return {
    date,
    moonAz: azFromNorth(moonP.azimuth),
    moonAlt: radToDeg(moonP.altitude),
    moonDist: moonP.distance,
    sunAz: azFromNorth(sunP.azimuth),
    sunAlt: radToDeg(sunP.altitude),
    fraction: illum.fraction,
    phase: illum.phase,
    angle: illum.angle,
    rise: times.rise,
    set: times.set,
    alwaysUp: !!times.alwaysUp,
    alwaysDown: !!times.alwaysDown,
  };
}

function drawMoonDisk(ctx, cx, cy, r, phase) {
  const size = Math.ceil(r * 2) + 2;
  const off = document.createElement("canvas");
  off.width = size;
  off.height = size;
  const octx = off.getContext("2d");
  const img = octx.createImageData(size, size);
  const data = img.data;
  const ox = size / 2;
  const oy = size / 2;
  const p = ((phase % 1) + 1) % 1;
  const alpha = (0.5 - p) * 2 * Math.PI;
  const lx = Math.sin(alpha);
  const lz = Math.cos(alpha);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = px + 0.5 - ox;
      const y = py + 0.5 - oy;
      const d2 = x * x + y * y;
      if (d2 > r * r) continue;
      const z = Math.sqrt(Math.max(0, r * r - d2));
      const i = (py * size + px) * 4;
      const lit = x * lx + z * lz > 0;
      const shade = 0.72 + 0.28 * (z / r);
      if (lit) {
        data[i] = Math.round(244 * shade);
        data[i + 1] = Math.round(230 * shade);
        data[i + 2] = Math.round(184 * shade);
        data[i + 3] = 255;
      } else {
        data[i] = 38;
        data[i + 1] = 35;
        data[i + 2] = 28;
        data[i + 3] = 255;
      }
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.drawImage(off, cx - size / 2, cy - size / 2, size, size);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(240, 220, 170, 0.4)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function project(az, alt, viewAz, viewAlt, w, h, fov) {
  const dAz = lunaShortest(viewAz, az);
  const fovV = fov * (h / w);
  const x = w / 2 + (dAz / (fov / 2)) * (w / 2);
  const y = h / 2 - ((alt - viewAlt) / (fovV / 2)) * (h / 2);
  return { x, y, dAz, dAlt: alt - viewAlt };
}

function drawSky(sky, viewAz, viewAlt) {
  const canvas = document.getElementById("luna-sky");
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const fov = 100;

  const skyTop = sky.sunAlt > 0 ? "#1a2a3a" : "#070b16";
  const skyBot = sky.sunAlt > 0 ? "#6b8aa3" : "#152033";
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, skyTop);
  g.addColorStop(1, skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const horizon = project(viewAz, 0, viewAz, viewAlt, w, h, fov);
  ctx.fillStyle = "#0a1410";
  ctx.fillRect(0, horizon.y, w, h - horizon.y);
  ctx.strokeStyle = "rgba(212, 175, 90, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, horizon.y);
  ctx.lineTo(w, horizon.y);
  ctx.stroke();
  ctx.font = "11px 'DM Sans', sans-serif";
  if (horizon.y > 16 && horizon.y < h - 8) {
    ctx.fillStyle = "rgba(212, 175, 90, 0.85)";
    ctx.textAlign = "left";
    ctx.fillText("HORIZON", 12, horizon.y - 8);
  }

  for (let az = 0; az < 360; az += 45) {
    const p = project(az, 0, viewAz, viewAlt, w, h, fov);
    if (p.x < -20 || p.x > w + 20) continue;
    const label = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" }[az];
    ctx.fillStyle = az % 90 === 0 ? "#f0d48a" : "rgba(154,168,148,0.85)";
    ctx.font = az % 90 === 0 ? "700 13px 'DM Sans', sans-serif" : "11px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, p.x, horizon.y + 18);
    ctx.beginPath();
    ctx.moveTo(p.x, horizon.y);
    ctx.lineTo(p.x, horizon.y + 6);
    ctx.strokeStyle = "rgba(212,175,90,0.4)";
    ctx.stroke();
  }

  const sun = project(sky.sunAz, sky.sunAlt, viewAz, viewAlt, w, h, fov);
  drawBody(ctx, sun, w, h, "#ffd36a", 16, sky.sunAlt < 0);
  const moon = project(sky.moonAz, sky.moonAlt, viewAz, viewAlt, w, h, fov);
  drawMoonOnSky(ctx, moon, w, h, sky, sky.moonAlt < 0);

  ctx.strokeStyle = "rgba(244, 236, 218, 0.7)";
  ctx.lineWidth = 1.4;
  const cx = w / 2;
  const cy = h / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 26);
  ctx.lineTo(cx, cy - 12);
  ctx.moveTo(cx, cy + 12);
  ctx.lineTo(cx, cy + 26);
  ctx.moveTo(cx - 26, cy);
  ctx.lineTo(cx - 12, cy);
  ctx.moveTo(cx + 12, cy);
  ctx.lineTo(cx + 26, cy);
  ctx.stroke();

  const dAz = lunaShortest(viewAz, sky.moonAz);
  const dAlt = sky.moonAlt - viewAlt;
  if (Math.abs(dAz) > 8 || Math.abs(dAlt) > 8) {
    const ang = Math.atan2(-dAlt, dAz);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = "#f0d48a";
    ctx.beginPath();
    ctx.moveTo(42, 0);
    ctx.lineTo(30, -7);
    ctx.lineTo(30, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawBody(ctx, p, w, h, color, r, below) {
  if (p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) return;
  ctx.save();
  ctx.globalAlpha = below ? 0.35 : 1;
  const glow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, r * 2.4);
  glow.addColorStop(0, color);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMoonOnSky(ctx, p, w, h, sky, below) {
  if (p.x < -50 || p.x > w + 50 || p.y < -50 || p.y > h + 50) return;
  ctx.save();
  ctx.globalAlpha = below ? 0.4 : 1;
  drawMoonDisk(ctx, p.x, p.y, 18, sky.phase);
  ctx.restore();
}

function drawPhasePortrait(sky) {
  const canvas = document.getElementById("luna-phase");
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = 108;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  drawMoonDisk(ctx, size / 2, size / 2, 46, sky.phase);
}

function updateLuna() {
  const sky = skyNow();
  if (!luna.followPhone) {
    luna.headingSmooth = sky.moonAz;
    luna.altSmooth = Math.max(-12, Math.min(55, sky.moonAlt));
  } else {
    let d = lunaShortest(luna.headingSmooth, luna.heading);
    luna.headingSmooth = (luna.headingSmooth + d * 0.22 + 360) % 360;
    luna.altSmooth += (luna.altView - luna.altSmooth) * 0.22;
  }
  drawSky(sky, luna.headingSmooth, luna.altSmooth);
  drawPhasePortrait(sky);

  const up = sky.moonAlt >= 0;
  document.getElementById("luna-phase-name").textContent = phaseName(sky.phase);
  document.getElementById("luna-phase-lit").textContent = `${Math.round(sky.fraction * 100)}% illuminated`;
  document.getElementById("luna-moon-alt").textContent = `${sky.moonAlt >= 0 ? "Above" : "Below"} horizon · ${Math.abs(sky.moonAlt).toFixed(0)}°`;
  document.getElementById("luna-moon-az").textContent = `${lunaCardinal(sky.moonAz)} · ${sky.moonAz.toFixed(0)}°`;
  document.getElementById("luna-sun-az").textContent = `Sun ${lunaCardinal(sky.sunAz)} · ${sky.sunAlt >= 0 ? "up" : "down"} ${Math.abs(sky.sunAlt).toFixed(0)}°`;
  document.getElementById("luna-place").textContent = luna.place;

  let riseSet = "";
  if (sky.alwaysUp) riseSet = "Moon stays up today";
  else if (sky.alwaysDown) riseSet = "Moon stays down today";
  else riseSet = `Rise ${fmtSkyTime(sky.rise)} · Set ${fmtSkyTime(sky.set)}`;
  document.getElementById("luna-times").textContent = riseSet;

  const dAz = lunaShortest(luna.headingSmooth, sky.moonAz);
  const dAlt = sky.moonAlt - luna.altSmooth;
  const aligned = Math.abs(dAz) <= 8 && Math.abs(dAlt) <= 8;
  const hint = document.getElementById("luna-hint");
  const stage = document.getElementById("luna-stage");
  stage.classList.toggle("aligned", aligned && up);
  if (luna.followPhone && aligned) {
    hint.textContent = up
      ? "You are pointing at the moon."
      : "This is the moon’s direction — it is below the horizon right now.";
  } else if (!luna.followPhone) {
    hint.textContent = up
      ? "Centered on the moon. Start sky view, then point your phone outdoors until the moon sits in the crosshair."
      : "The moon is below the horizon. The map shows it under the line — look this way after moonrise.";
  } else {
    const turn = dAz > 0 ? "right" : "left";
    const tilt = dAlt > 0 ? "tilt up" : "tilt down";
    hint.textContent = `Turn ${turn} ${Math.abs(Math.round(dAz))}° and ${tilt} ${Math.abs(Math.round(dAlt))}°.`;
  }
}

function lunaCompassHeading(event) {
  if (typeof event.webkitCompassHeading === "number" && !Number.isNaN(event.webkitCompassHeading)) {
    return (event.webkitCompassHeading + LUNA_MAPLE.declination + 360) % 360;
  }
  if (event.absolute === true && typeof event.alpha === "number") {
    return (360 - event.alpha) % 360;
  }
  if (typeof event.alpha === "number") return (360 - event.alpha) % 360;
  return null;
}

function onLunaOrient(event) {
  const heading = lunaCompassHeading(event);
  if (heading == null) return;
  luna.hasCompass = true;
  luna.heading = heading;
  if (typeof event.beta === "number") {
    let alt = event.beta - 90;
    if (alt > 90) alt = 180 - alt;
    if (alt < -90) alt = -180 - alt;
    luna.altView = Math.max(-90, Math.min(90, alt));
  }
  luna.followPhone = true;
  document.getElementById("luna-compass").hidden = true;
}

async function startLunaCompass() {
  const btn = document.getElementById("luna-compass");
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== "granted") {
        btn.textContent = "Compass permission denied";
        return;
      }
    }
    window.addEventListener("deviceorientationabsolute", onLunaOrient, true);
    window.addEventListener("deviceorientation", onLunaOrient, true);
    luna.followPhone = true;
    btn.hidden = true;
  } catch {
    btn.textContent = "Compass not available";
  }
}

function bindLunaDrag() {
  const stage = document.getElementById("luna-stage");
  stage.addEventListener("pointerdown", (e) => {
    luna.dragging = true;
    luna.followPhone = false;
    luna.lastX = e.clientX;
    luna.lastY = e.clientY;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!luna.dragging) return;
    const dx = e.clientX - luna.lastX;
    const dy = e.clientY - luna.lastY;
    luna.lastX = e.clientX;
    luna.lastY = e.clientY;
    luna.heading = (luna.headingSmooth - dx * 0.35 + 360) % 360;
    luna.headingSmooth = luna.heading;
    luna.altView = Math.max(-80, Math.min(80, luna.altSmooth + dy * 0.2));
    luna.altSmooth = luna.altView;
  });
  const stop = () => { luna.dragging = false; };
  stage.addEventListener("pointerup", stop);
  stage.addEventListener("pointercancel", stop);
}

document.getElementById("luna-compass").addEventListener("click", startLunaCompass);
document.getElementById("luna-gps").addEventListener("click", () => {
  const btn = document.getElementById("luna-gps");
  if (btn.dataset.mode === "reset") {
    luna.lat = LUNA_MAPLE.lat;
    luna.lng = LUNA_MAPLE.lng;
    luna.place = LUNA_MAPLE.name;
    btn.textContent = "My location";
    delete btn.dataset.mode;
    luna.followPhone = false;
    updateLuna();
    return;
  }
  if (!navigator.geolocation) {
    btn.textContent = "No GPS";
    return;
  }
  btn.textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      luna.lat = pos.coords.latitude;
      luna.lng = pos.coords.longitude;
      luna.place = "Your location";
      btn.textContent = "Maple";
      btn.dataset.mode = "reset";
      luna.followPhone = false;
      updateLuna();
    },
    () => { btn.textContent = "GPS blocked"; },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
  );
});

bindLunaDrag();
updateLuna();
setInterval(updateLuna, 1000);
window.addEventListener("resize", updateLuna);
