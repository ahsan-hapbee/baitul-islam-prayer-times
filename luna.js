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
  lastFrame: 0,
  sky: null,
  skyAt: 0,
  moonSprite: null,
  moonSpritePhase: -1,
  lastHint: "",
  showPaths: true,
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

function skyPath(kind, date, hours, stepMin) {
  const pts = [];
  const steps = Math.round((hours * 60) / stepMin);
  for (let i = 0; i <= steps; i++) {
    const t = new Date(date.getTime() + i * stepMin * 60000);
    const pos = kind === "moon"
      ? SunCalc.getMoonPosition(t, luna.lat, luna.lng)
      : SunCalc.getPosition(t, luna.lat, luna.lng);
    pts.push({ az: azFromNorth(pos.azimuth), alt: radToDeg(pos.altitude) });
  }
  return pts;
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
    moonPath: skyPath("moon", date, 2, 5),
    sunPath: skyPath("sun", date, 2, 5),
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

  if (luna.showPaths) {
    drawPath(ctx, sky.moonPath, viewAz, viewAlt, w, h, fov, "rgba(244, 241, 234, 0.85)");
    drawPath(ctx, sky.sunPath, viewAz, viewAlt, w, h, fov, "rgba(255, 210, 74, 0.85)");
  }

  const sun = project(sky.sunAz, sky.sunAlt, viewAz, viewAlt, w, h, fov);
  drawSun(ctx, sun, w, h, sky.sunAlt < 0);
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

  const moonDist = skyAngDist(viewAz, viewAlt, sky.moonAz, sky.moonAlt);
  const sunDist = skyAngDist(viewAz, viewAlt, sky.sunAz, sky.sunAlt);
  const moonNear = clamp01(1 - moonDist / 42);
  const sunNear = clamp01(1 - sunDist / 42);
  const onMoon = moonDist < 10;
  const onSun = sunDist < 10;
  let moonAlpha;
  let sunAlpha;
  if (onMoon) {
    moonAlpha = 0;
    sunAlpha = 0.42;
  } else if (onSun) {
    sunAlpha = 0;
    moonAlpha = 0.42;
  } else {
    moonAlpha = 0.42 + 0.58 * (1 - sunNear);
    sunAlpha = 0.42 + 0.58 * (1 - moonNear);
  }

  drawAimArrow(ctx, cx, cy, 44, moon.x, moon.y, "#f4f1ea", moonAlpha);
  drawAimArrow(ctx, cx, cy, 58, sun.x, sun.y, "#ffd24a", sunAlpha);
}

function drawPath(ctx, points, viewAz, viewAlt, w, h, fov, color) {
  if (!points || points.length < 2) return;
  ctx.save();
  ctx.setLineDash([5, 7]);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = color;
  let drawing = false;
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = project(points[i].az, points[i].alt, viewAz, viewAlt, w, h, fov);
    const prev = i > 0
      ? project(points[i - 1].az, points[i - 1].alt, viewAz, viewAlt, w, h, fov)
      : null;
    const off = p.x < -90 || p.x > w + 90 || p.y < -90 || p.y > h + 90;
    const jump = prev && Math.hypot(p.x - prev.x, p.y - prev.y) > Math.min(w, h) * 0.65;
    if (off || jump) {
      if (drawing) {
        ctx.stroke();
        ctx.beginPath();
        drawing = false;
      }
      continue;
    }
    if (!drawing) {
      ctx.moveTo(p.x, p.y);
      drawing = true;
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  if (drawing) ctx.stroke();

  const end = project(points[points.length - 1].az, points[points.length - 1].alt, viewAz, viewAlt, w, h, fov);
  const before = project(points[points.length - 2].az, points[points.length - 2].alt, viewAz, viewAlt, w, h, fov);
  if (end.x > -20 && end.x < w + 20 && end.y > -20 && end.y < h + 20) {
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    const ang = Math.atan2(end.y - before.y, end.x - before.x);
    ctx.translate(end.x, end.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-4, -5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function skyAngDist(az1, alt1, az2, alt2) {
  const dAz = lunaShortest(az1, az2) * Math.PI / 180;
  const a1 = alt1 * Math.PI / 180;
  const a2 = alt2 * Math.PI / 180;
  const c = Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(dAz);
  return Math.acos(Math.min(1, Math.max(-1, c))) * 180 / Math.PI;
}

function drawAimArrow(ctx, cx, cy, radius, px, py, color, alpha) {
  if (alpha < 0.02) return;
  const dx = px - cx;
  const dy = py - cy;
  if (dx * dx + dy * dy < 16) return;
  const ang = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(radius + 14, 0);
  ctx.lineTo(radius - 2, -8);
  ctx.lineTo(radius - 2, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSun(ctx, p, w, h, below) {
  if (p.x < -70 || p.x > w + 70 || p.y < -70 || p.y > h + 70) return;
  const r = 28;
  ctx.save();
  ctx.globalAlpha = below ? 0.38 : 1;
  const glow = ctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r * 2.8);
  glow.addColorStop(0, "rgba(255, 230, 120, 0.95)");
  glow.addColorStop(0.45, "rgba(255, 196, 64, 0.45)");
  glow.addColorStop(1, "rgba(255, 180, 40, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 2.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(p.x, p.y);
  ctx.strokeStyle = "rgba(255, 210, 80, 0.85)";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const inner = r + 5;
    const outer = r + (i % 2 === 0 ? 18 : 12);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.stroke();
  }
  const disk = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r);
  disk.addColorStop(0, "#fff6c8");
  disk.addColorStop(0.55, "#ffd24a");
  disk.addColorStop(1, "#f0a020");
  ctx.fillStyle = disk;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function moonSprite(phase) {
  if (luna.moonSprite && Math.abs(luna.moonSpritePhase - phase) < 0.004) return luna.moonSprite;
  const size = 40;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  drawMoonDisk(ctx, size / 2, size / 2, 18, phase);
  luna.moonSprite = c;
  luna.moonSpritePhase = phase;
  return c;
}

function drawMoonOnSky(ctx, p, w, h, sky, below) {
  if (p.x < -50 || p.x > w + 50 || p.y < -50 || p.y > h + 50) return;
  ctx.save();
  ctx.globalAlpha = below ? 0.4 : 1;
  const spr = moonSprite(sky.phase);
  ctx.drawImage(spr, p.x - spr.width / 2, p.y - spr.height / 2);
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

function skyCached() {
  const now = Date.now();
  if (!luna.sky || now - luna.skyAt > 2000) {
    luna.sky = skyNow();
    luna.skyAt = now;
    drawPhasePortrait(luna.sky);
    const sky = luna.sky;
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
  }
  return luna.sky;
}

function stepCamera(dt) {
  const sky = luna.sky;
  if (!luna.followPhone && !luna.dragging) {
    luna.headingSmooth = sky.moonAz;
    luna.altSmooth = Math.max(-12, Math.min(55, sky.moonAlt));
    return;
  }
  if (luna.dragging) return;
  const dAz = lunaShortest(luna.headingSmooth, luna.heading);
  const dAlt = luna.altView - luna.altSmooth;
  if (Math.abs(dAz) > 6) luna.headingSmooth = luna.heading;
  else {
    const k = 1 - Math.exp(-dt / 0.028);
    luna.headingSmooth = (luna.headingSmooth + dAz * k + 360) % 360;
  }
  if (Math.abs(dAlt) > 6) luna.altSmooth = luna.altView;
  else {
    const k = 1 - Math.exp(-dt / 0.028);
    luna.altSmooth += dAlt * k;
  }
}

function updateHint(sky) {
  const up = sky.moonAlt >= 0;
  const dAz = lunaShortest(luna.headingSmooth, sky.moonAz);
  const dAlt = sky.moonAlt - luna.altSmooth;
  const aligned = Math.abs(dAz) <= 8 && Math.abs(dAlt) <= 8;
  const stage = document.getElementById("luna-stage");
  stage.classList.toggle("aligned", aligned && up && luna.followPhone);
  let text;
  if (luna.followPhone && aligned) {
    text = up
      ? "You are pointing at the moon."
      : "This is the moon’s direction — it is below the horizon right now.";
  } else if (!luna.followPhone) {
    text = up
      ? "Centered on the moon. Start sky view, then point your phone outdoors until the moon sits in the crosshair."
      : "The moon is below the horizon. The map shows it under the line — look this way after moonrise.";
  } else {
    const turn = dAz > 0 ? "right" : "left";
    const tilt = dAlt > 0 ? "tilt up" : "tilt down";
    text = `Turn ${turn} ${Math.abs(Math.round(dAz))}° and ${tilt} ${Math.abs(Math.round(dAlt))}°.`;
  }
  if (text !== luna.lastHint) {
    luna.lastHint = text;
    document.getElementById("luna-hint").textContent = text;
  }
}

function lunaFrame(ts) {
  const sky = skyCached();
  const dt = luna.lastFrame ? Math.min(0.05, (ts - luna.lastFrame) / 1000) : 0.016;
  luna.lastFrame = ts;
  stepCamera(dt);
  drawSky(sky, luna.headingSmooth, luna.altSmooth);
  updateHint(sky);
  requestAnimationFrame(lunaFrame);
}

function updateLuna() {
  luna.sky = null;
  skyCached();
}

function lunaLook(event) {
  let alphaDeg = null;
  let magDecl = 0;
  if (typeof event.webkitCompassHeading === "number" && !Number.isNaN(event.webkitCompassHeading)) {
    alphaDeg = (360 - event.webkitCompassHeading) % 360;
    magDecl = LUNA_MAPLE.declination;
  } else if (typeof event.alpha === "number") {
    alphaDeg = event.alpha;
  }
  if (alphaDeg == null || typeof event.beta !== "number") return null;

  const toRad = Math.PI / 180;
  const alpha = alphaDeg * toRad;
  const beta = event.beta * toRad;
  const gamma = (event.gamma || 0) * toRad;
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const cb = Math.cos(beta);
  const sb = Math.sin(beta);
  const cg = Math.cos(gamma);
  const sg = Math.sin(gamma);

  const vx = -ca * sg - sa * sb * cg;
  const vy = -sa * sg + ca * sb * cg;
  const heading = (Math.atan2(vx, vy) * 180 / Math.PI + magDecl + 360) % 360;
  const alt = Math.asin(Math.max(-1, Math.min(1, -cb * cg))) * 180 / Math.PI;
  return { heading, alt };
}

function onLunaOrient(event) {
  const look = lunaLook(event);
  if (!look) return;
  if (!luna.hasCompass) {
    luna.headingSmooth = look.heading;
    luna.altSmooth = look.alt;
  }
  luna.hasCompass = true;
  luna.heading = look.heading;
  luna.altView = Math.max(-90, Math.min(90, look.alt));
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
    window.addEventListener("deviceorientationabsolute", onLunaOrient, { capture: true, passive: true });
    window.addEventListener("deviceorientation", onLunaOrient, { capture: true, passive: true });
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
document.getElementById("luna-paths").addEventListener("click", () => {
  luna.showPaths = !luna.showPaths;
  const btn = document.getElementById("luna-paths");
  btn.setAttribute("aria-pressed", String(luna.showPaths));
  btn.textContent = luna.showPaths ? "Hide paths" : "Show paths";
});
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

function bumpLunaSize() {
  luna.skyAt = 0;
}

bindLunaDrag();
updateLuna();
requestAnimationFrame(lunaFrame);
window.addEventListener("resize", bumpLunaSize);
window.addEventListener("orientationchange", () => {
  setTimeout(bumpLunaSize, 200);
});
screen.orientation?.addEventListener("change", bumpLunaSize);
