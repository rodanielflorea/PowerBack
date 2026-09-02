// Info widget: live local time (offline via Intl), plus weather + holidays
// pushed from the main process (keyless wttr.in + date.nager.at).

const elLoc      = document.getElementById('infoLoc');
const elTime     = document.getElementById('infoTime');
const elDate     = document.getElementById('infoDate');
const elTz       = document.getElementById('infoTz');
const elWeather  = document.getElementById('infoWeather');
const elHolidays = document.getElementById('infoHolidays');
const elEvents   = document.getElementById('infoEvents');

let _tz = null; // IANA timezone for the clock

function tickClock() {
  const now = new Date();
  const optsT = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  const optsD = { weekday: 'short', month: 'short', day: 'numeric' };
  try {
    if (_tz) { optsT.timeZone = _tz; optsD.timeZone = _tz; }
    elTime.textContent = new Intl.DateTimeFormat('en-GB', optsT).format(now);
    elDate.textContent = new Intl.DateTimeFormat('en-US', optsD).format(now);
  } catch {
    // Invalid timezone → fall back to local machine time.
    elTime.textContent = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
    elDate.textContent = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(now);
  }
}
setInterval(tickClock, 1000);
tickClock();

// Map wttr.in weatherCode / description to a simple emoji.
function weatherEmoji(desc) {
  const d = (desc || '').toLowerCase();
  if (/(thunder|storm)/.test(d)) return '⛈️';
  if (/(snow|sleet|blizzard|ice)/.test(d)) return '❄️';
  if (/(rain|drizzle|shower)/.test(d)) return '🌧️';
  if (/(fog|mist|haze)/.test(d)) return '🌫️';
  if (/(overcast|cloud)/.test(d)) return '☁️';
  if (/(partly|sun.*cloud|cloud.*sun)/.test(d)) return '⛅';
  if (/(clear|sunny)/.test(d)) return '☀️';
  return '🌡️';
}

function renderWeather(w) {
  if (w === undefined) { elWeather.innerHTML = '<span class="info-dim">Loading…</span>'; return; }
  if (!w) { elWeather.innerHTML = '<span class="info-dim">Unavailable</span>'; return; }
  const emoji = weatherEmoji(w.desc);
  elWeather.innerHTML =
    '<span class="info-weather-emoji">' + emoji + '</span>' +
    '<div><div class="info-weather-temp">' + (w.tempC != null ? w.tempC + '°C' : '—') + '</div>' +
    '<div class="info-weather-desc">' + (w.desc || '') +
    (w.feelsC != null ? ' · feels ' + w.feelsC + '°' : '') +
    (w.humidity != null ? ' · ' + w.humidity + '% RH' : '') + '</div></div>';
}

// Render one line per entry, with date, English name, and past/soon styling.
function holidayLine(h, today) {
  const d = new Date(h.date + 'T00:00:00');
  const dateStr = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
  const days = Math.round((d - today) / 86400000);
  const past = days < 0;
  const soon = days >= 0 && days <= 14;
  const cls = past ? ' info-holiday--past' : (soon ? ' info-holiday--soon' : '');
  return '<div class="info-holiday' + cls + '">' +
    '<span class="info-holiday-date">' + dateStr + '</span>' +
    '<span class="info-holiday-name">' + (h.name || h.localName || '') + '</span></div>';
}

// Pick a few recent-past + upcoming entries from a date-sorted list.
function recentAndUpcoming(list, today, pastN, upN) {
  const past = list.filter(h => new Date(h.date + 'T00:00:00') < today);
  const up = list.filter(h => new Date(h.date + 'T00:00:00') >= today);
  return past.slice(-pastN).concat(up.slice(0, upN));
}

function renderInto(el, list, today, pastN, upN) {
  if (!el) return;
  if (!list || !list.length) { el.innerHTML = '<span class="info-dim">None found</span>'; return; }
  const picks = recentAndUpcoming(list, today, pastN, upN);
  el.innerHTML = picks.length
    ? picks.map(h => holidayLine(h, today)).join('')
    : '<span class="info-dim">None found</span>';
}

function isPublicHoliday(h) {
  const t = h.types || [];
  return t.length === 0 || t.includes('Public') || t.includes('Bank');
}

// Wikimedia "on this day" events: { date, text }. Free-text, upcoming-only.
function eventLine(e, today) {
  const d = new Date(e.date + 'T00:00:00');
  const dateStr = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
  const days = Math.round((d - today) / 86400000);
  const soon = days >= 0 && days <= 14;
  return '<div class="info-holiday' + (soon ? ' info-holiday--soon' : '') + '">' +
    '<span class="info-holiday-date">' + dateStr + '</span>' +
    '<span class="info-holiday-name">' + (e.text || '') + '</span></div>';
}

const LOADING = '<span class="info-dim">Loading…</span>';
function renderHolidaysAndEvents(data) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const holidays = data ? data.holidays : undefined; // undefined = loading
  const events = data ? data.events : undefined;

  if (holidays === undefined) { elHolidays.innerHTML = LOADING; }
  else { renderInto(elHolidays, (holidays || []).filter(isPublicHoliday), today, 2, 5); }

  // Special events: prefer the richer Wikimedia events; fall back to Nager's
  // non-public observances if the scrape found nothing for this country.
  if (events === undefined) {
    elEvents.innerHTML = LOADING;
  } else if (events && events.length) {
    elEvents.innerHTML = events.slice(0, 8).map(e => eventLine(e, today)).join('');
  } else {
    renderInto(elEvents, (holidays || []).filter(h => !isPublicHoliday(h)), today, 2, 5);
  }
}

// CV summary pushed by main: { work: [{company, location, period, role, mode}], education: [{school, degree, period}] }
const elWork = document.getElementById('infoWork');
const elEdu = document.getElementById('infoEdu');
function esc(t) { return String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function renderCv(cv) {
  if (!elWork || !elEdu) return;
  if (cv === undefined) { elWork.innerHTML = LOADING; elEdu.innerHTML = LOADING; return; }
  if (!cv) {
    elWork.innerHTML = '<span class="info-dim">Upload a CV in the Materials step to see it here</span>';
    elEdu.innerHTML = '<span class="info-dim">—</span>';
    return;
  }
  const work = Array.isArray(cv.work) ? cv.work : [];
  const edu = Array.isArray(cv.education) ? cv.education : [];
  elWork.innerHTML = work.length ? work.map((w) => {
    const mode = String(w.mode || '').toLowerCase();
    const modeCls = mode === 'onsite' ? ' cv-mode--onsite' : (mode === 'hybrid' ? ' cv-mode--hybrid' : '');
    return '<div class="cv-item">' +
      '<div class="cv-head"><span class="cv-company">' + esc(w.company) + '</span><span class="cv-period">' + esc(w.period) + '</span></div>' +
      (w.role ? '<div class="cv-role">' + esc(w.role) + '</div>' : '') +
      '<div class="cv-meta">' + (w.location ? '<span>' + esc(w.location) + '</span>' : '') +
      (mode ? '<span class="cv-mode' + modeCls + '">' + esc(mode) + '</span>' : '') + '</div></div>';
  }).join('') : '<span class="info-dim">No work history found in the CV</span>';
  elEdu.innerHTML = edu.length ? edu.map((e) =>
    '<div class="cv-item"><div class="cv-head"><span class="cv-company">' + esc(e.school) + '</span><span class="cv-period">' + esc(e.period) + '</span></div>' +
    (e.degree ? '<div class="cv-role">' + esc(e.degree) + '</div>' : '') + '</div>').join('')
    : '<span class="info-dim">No education found in the CV</span>';
}

if (window.info && window.info.onData) {
  // Tell main we're listening so it (re)sends data + fetches — avoids any race
  // where main pushed before this listener was attached.
  if (window.info.ready) window.info.ready();
  window.info.onData((data) => {
    const p = (data && data.profile) || {};
    _tz = p.timezone || null;
    const loc = [p.city, p.country].filter(Boolean).join(', ');
    elLoc.textContent = loc || (p.name || 'Local');
    elTz.textContent = _tz || '';
    tickClock();
    renderWeather(data && data.weather);
    renderHolidaysAndEvents(data);
    renderCv(data ? data.cv : undefined);
  });
}

const closeBtn = document.getElementById('infoClose');
const refreshBtn = document.getElementById('infoRefresh');
if (closeBtn) closeBtn.addEventListener('click', () => window.info && window.info.close && window.info.close());
if (refreshBtn) refreshBtn.addEventListener('click', () => {
  elWeather.innerHTML = '<span class="info-dim">Loading…</span>';
  elHolidays.innerHTML = '<span class="info-dim">Loading…</span>';
  if (elEvents) elEvents.innerHTML = '<span class="info-dim">Loading…</span>';
  window.info && window.info.refresh && window.info.refresh();
});
