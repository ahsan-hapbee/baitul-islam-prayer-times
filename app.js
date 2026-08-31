const TZ = PRAYER_DATA.mosque.timezone;

function tzParts(date, options) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", ...options }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second") || 0),
    weekday: get("weekday"),
  };
}

function isoDate(date) {
  const p = tzParts(date, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function parseHourMinute(time12) {
  const [clock, mer] = time12.split(" ");
  let [h, m] = clock.split(":").map(Number);
  if (mer === "PM" && h !== 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return { h, m };
}

function tzOffsetMs(instant) {
  const shown = tzParts(new Date(instant), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const asUTC = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
  return asUTC - instant;
}

function zonedTimeToUtc(iso, time12) {
  const [y, mo, d] = iso.split("-").map(Number);
  const { h, m } = parseHourMinute(time12);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, m, 0);
  let t = wallAsUtc - tzOffsetMs(wallAsUtc);
  t = wallAsUtc - tzOffsetMs(t);
  return t;
}

function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function formatPretty(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function inRamadan(iso) {
  return iso >= PRAYER_DATA.ramadan.start && iso <= PRAYER_DATA.ramadan.end;
}

function periodIndexFor(iso) {
  const weeks = PRAYER_DATA.weeks;
  if (inRamadan(iso)) return -1;
  let idx = -1;
  for (let i = 0; i < weeks.length; i++) {
    if (weeks[i].start <= iso) idx = i;
    else break;
  }
  return idx;
}

function periodEnd(idx) {
  const weeks = PRAYER_DATA.weeks;
  if (idx < 0) return PRAYER_DATA.ramadan.end;
  const next = weeks[idx + 1];
  if (!next) return "2026-12-31";
  return addDays(next.start, -1);
}

function iqamahSlots(week) {
  const slots = [];
  slots.push({ key: "fajr", name: "Fajr", time: week.fajr });
  slots.push({ key: "zuhr", name: "Zuhr", time: week.zuhr, combined: week.asr ? null : "Asr combined" });
  if (week.asr) slots.push({ key: "asr", name: "Asr", time: week.asr });
  slots.push({
    key: "maghrib",
    name: "Maghrib",
    time: week.maghrib,
    combined: week.isha ? null : "Isha combined",
  });
  if (week.isha) slots.push({ key: "isha", name: "Isha", time: week.isha });
  return slots;
}

function pad(n) { return String(n).padStart(2, "0"); }

function countdown(ms) {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  return `${m}m ${pad(s)}s`;
}

function changedKeys(week, prev) {
  if (!prev) return [];
  return ["fajr", "zuhr", "asr", "maghrib", "isha"].filter((k) => week[k] !== prev[k]);
}

let browseIndex = null;

function getScheduleState(now = new Date()) {
  const todayIso = isoDate(now);
  const todayIdx = periodIndexFor(todayIso);
  if (todayIdx < 0 && inRamadan(todayIso)) {
    return { ramadan: true, todayIso, todayIdx, week: null, slots: [], current: null, next: null, nextAt: null };
  }
  const week = PRAYER_DATA.weeks[Math.max(todayIdx, 0)] || PRAYER_DATA.weeks[0];
  const slots = iqamahSlots(week).map((s) => ({
    ...s,
    at: zonedTimeToUtc(todayIso, s.time),
  }));
  let current = null;
  let next = slots[0];
  let nextAt = slots[0].at;
  if (now.getTime() >= slots[0].at) {
    current = slots[0];
    next = null;
    nextAt = null;
    for (let i = 0; i < slots.length; i++) {
      if (now.getTime() >= slots[i].at) current = slots[i];
      else {
        next = slots[i];
        nextAt = slots[i].at;
        break;
      }
    }
    if (!next) {
      const tomorrow = addDays(todayIso, 1);
      const tIdx = periodIndexFor(tomorrow);
      const tWeek = tIdx >= 0 ? PRAYER_DATA.weeks[tIdx] : week;
      next = { ...iqamahSlots(tWeek)[0], tomorrow: true };
      nextAt = zonedTimeToUtc(tomorrow, next.time);
    }
  }
  return { ramadan: false, todayIso, todayIdx, week, slots, current, next, nextAt };
}

function render(now = new Date()) {
  const todayIso = isoDate(now);
  const weekday = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, weekday: "long" }).format(now);
  const hijri = new Intl.DateTimeFormat("en-u-ca-islamic", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(now);

  document.getElementById("live-time").textContent = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  document.getElementById("live-date").textContent = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now);
  document.getElementById("live-hijri").textContent = hijri;

  const state = getScheduleState(now);
  const todayIdx = state.todayIdx;
  const ramadan = state.ramadan;
  const banner = document.getElementById("banner");

  if (ramadan) {
    banner.hidden = false;
    banner.className = "banner ramadan";
    banner.innerHTML = `<b>Ramadan timings</b> are issued separately (${formatPretty(PRAYER_DATA.ramadan.start)} – ${formatPretty(PRAYER_DATA.ramadan.end)}). Eidul Fitr is ${formatPretty(PRAYER_DATA.ramadan.eid)}.`;
    document.getElementById("hero").innerHTML = `
      <div class="label">Baitul Islam · 2026</div>
      <div class="prayer-name" style="font-size:42px;margin-top:12px">Ramadan</div>
      <p class="status">Use the mosque’s Ramadan timetable until Eidul Fitr.</p>`;
    document.getElementById("today-list").innerHTML = `<p class="notes" style="padding:8px 12px 16px">The annual chart does not list daily iqamah for this window.</p>`;
  } else {
    const week = state.week;
    const slots = state.slots;
    const current = state.current;
    const next = state.next;
    const nextAt = state.nextAt;

    const remaining = nextAt - now.getTime();
    const isNow = current && now.getTime() - current.at < 20 * 60 * 1000;
    const prevAt = current ? current.at : zonedTimeToUtc(addDays(todayIso, -1), "11:00 PM");
    const span = Math.max(nextAt - prevAt, 1);
    const pct = Math.min(100, Math.max(0, ((now.getTime() - prevAt) / span) * 100));

    let combo = "";
    if (next.combined) combo = `<div class="combo">${next.combined} at the mosque</div>`;
    else if (current?.combined && isNow) combo = `<div class="combo">${current.combined} at the mosque</div>`;

    let status;
    if (isNow) status = `Iqamah is now · ${current.name}`;
    else if (!current) status = `Before Fajr · ${hijri}`;
    else status = `Now: ${current.name}${current.combined ? " (+ combined)" : ""}`;

    document.getElementById("hero").innerHTML = `
      <div class="label">${isNow ? "Iqamah now" : "Next prayer"}</div>
      <div class="prayer-name">${isNow ? current.name : next.name}</div>
      <div class="prayer-time">${isNow ? current.time : next.time}</div>
      ${combo}
      <div class="countdown">${isNow ? "started" : `${next.tomorrow ? "tomorrow in" : "in"} <b>${countdown(remaining)}</b>`}</div>
      <p class="status">${status}${next.tomorrow ? " · then Fajr tomorrow" : ""}</p>
      ${isNow ? "" : `<div class="progress" aria-hidden="true"><span style="width:${pct.toFixed(1)}%"></span></div>`}`;

    const displayRows = [
      { key: "fajr", name: "Fajr", time: week.fajr },
      { key: "sunrise", name: "Sunrise", time: week.sunrise, info: true },
      { key: "zuhr", name: "Zuhr", time: week.zuhr, jumuah: weekday === "Friday" },
      { key: "asr", name: "Asr", time: week.asr, combined: week.asr ? null : "Combined with Zuhr" },
      { key: "sunset", name: "Sunset", time: week.sunset, info: true },
      { key: "maghrib", name: "Maghrib", time: week.maghrib },
      { key: "isha", name: "Isha", time: week.isha, combined: week.isha ? null : "Combined with Maghrib" },
    ];

    document.getElementById("today-list").innerHTML = displayRows.map((row) => {
      const slot = slots.find((s) => s.key === row.key);
      const classes = ["row"];
      if (row.info) classes.push("info");
      if (row.combined) classes.push("info");
      if (!row.info && current && current.key === row.key) classes.push("current");
      if (!row.info && next && next.key === row.key && !next.tomorrow) classes.push("next");
      if (!row.info && slot && now.getTime() >= slot.at && current?.key !== row.key) classes.push("passed");
      const meta = row.jumuah
        ? "Jumu'ah"
        : row.combined
          ? row.combined
          : (current?.key === row.key ? "Now" : next?.key === row.key && !next.tomorrow ? "Next" : "");
      return `<div class="${classes.join(" ")}">
        <span class="dot"></span>
        <div><span class="name">${row.name}</span>${meta ? `<span class="meta">${meta}</span>` : ""}</div>
        <div class="time">${row.time ? row.time : `<small>${row.combined}</small>`}</div>
      </div>`;
    }).join("");

    if (weekday === "Friday") {
      banner.hidden = false;
      banner.className = "banner jumuah";
      banner.innerHTML = `<b>Jumu'ah</b> today at the mosque · Zuhr iqamah <b>${week.zuhr}</b>`;
    } else if (week.flag === "dst-end") {
      banner.hidden = false;
      banner.className = "banner";
      banner.innerHTML = `<b>Daylight Saving Time ended</b> · clocks fell back. Times below are the new local times.`;
    } else {
      banner.hidden = true;
    }
  }

  const idx = browseIndex == null ? Math.max(todayIdx, 0) : browseIndex;
  const view = PRAYER_DATA.weeks[idx];
  const prev = PRAYER_DATA.weeks[idx - 1];
  const end = periodEnd(idx);
  const changed = changedKeys(view, prev).filter((k) => k === "fajr" || k === "asr" || k === "isha");
  document.getElementById("week-range").textContent = `${formatPretty(view.start)} – ${formatPretty(end)}`;
  document.getElementById("week-caption").textContent = idx === todayIdx ? "This week" : "Week";
  document.getElementById("prev-week").disabled = idx <= 0;
  document.getElementById("next-week").disabled = idx >= PRAYER_DATA.weeks.length - 1;
  document.getElementById("jump-today").hidden = browseIndex == null || browseIndex === todayIdx;

  const weekKeys = [
    { key: "fajr", name: "Fajr" },
    { key: "zuhr", name: "Zuhr" },
    { key: "asr", name: "Asr" },
    { key: "maghrib", name: "Maghrib" },
    { key: "isha", name: "Isha" },
  ];
  document.getElementById("week-grid").innerHTML = weekKeys.map((k) => {
    const combined = !view[k.key];
    const raw = combined ? (k.key === "asr" ? view.zuhr : view.maghrib) : view[k.key];
    const [clock, mer] = raw.split(" ");
    const label = combined ? (k.key === "asr" ? "w/ Zuhr" : "w/ Maghrib") : (mer || "");
    const short = k.key === "maghrib" ? "Magh" : k.name;
    return `<div class="slot${changed.includes(k.key) ? " changed" : ""}">
      <span class="n">${short}</span>
      <span class="t">${clock}</span>
      <span class="sub">${label}</span>
    </div>`;
  }).join("");
  document.getElementById("sunrow").innerHTML =
    `<span>Sunrise ${view.sunrise}</span><span>Sunset ${view.sunset}</span>`;

  if (!document.getElementById("year-list").dataset.built) {
    buildYear(todayIso, todayIdx);
  } else {
    document.querySelectorAll(".yrow").forEach((el, i) => {
      el.classList.toggle("this", i === todayIdx);
    });
  }
}

function buildYear(todayIso, todayIdx) {
  const root = document.getElementById("year-list");
  const months = {};
  PRAYER_DATA.weeks.forEach((w, i) => {
    const month = w.start.slice(0, 7);
    (months[month] ||= []).push({ w, i });
  });
  const names = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  root.innerHTML = Object.entries(months).map(([ym, rows]) => {
    const monthName = names[Number(ym.slice(5)) - 1];
    const body = rows.map(({ w, i }) => {
      const asr = w.asr || "w/ Zuhr";
      const isha = w.isha || "w/ Magh";
      return `<div class="yrow${i === todayIdx ? " this" : ""}">
        <span class="d">${formatPretty(w.start).replace(",", "")}</span>
        <span>${w.fajr.replace(" AM","").replace(" PM","")}</span>
        <span>${w.zuhr.replace(" AM","").replace(" PM","")}</span>
        <span>${typeof asr === "string" && asr.startsWith("w/") ? asr : asr.replace(" AM","").replace(" PM","")}</span>
        <span>${w.maghrib.replace(" AM","").replace(" PM","")}</span>
        <span>${typeof isha === "string" && isha.startsWith("w/") ? isha : isha.replace(" AM","").replace(" PM","")}</span>
      </div>`;
    }).join("");
    return `<section class="month"><h3>${monthName} 2026</h3>
      <div class="yrow yhead"><span class="d">From</span><span>Fajr</span><span>Zuhr</span><span>Asr</span><span>Magh</span><span>Isha</span></div>
      ${body}</section>`;
  }).join("") + `<p class="notes" style="padding:8px 12px 4px">Feb 19 – Mar 19: Ramadan timetable (not on this chart). Highlighted row is the current period.</p>`;
  root.dataset.built = "1";
}

document.getElementById("prev-week").addEventListener("click", () => {
  const todayIdx = Math.max(periodIndexFor(isoDate(new Date())), 0);
  if (browseIndex == null) browseIndex = todayIdx;
  browseIndex = Math.max(0, browseIndex - 1);
  render();
});
document.getElementById("next-week").addEventListener("click", () => {
  const todayIdx = Math.max(periodIndexFor(isoDate(new Date())), 0);
  if (browseIndex == null) browseIndex = todayIdx;
  browseIndex = Math.min(PRAYER_DATA.weeks.length - 1, browseIndex + 1);
  render();
});
document.getElementById("jump-today").addEventListener("click", () => {
  browseIndex = null;
  render();
});

render();
setInterval(render, 1000);
