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

function renderHolidays(list) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const all = list || [];
  const holidays = all.filter(isPublicHoliday);
  const events = all.filter(h => !isPublicHoliday(h)); // Observance / Optional / School / etc.
  renderInto(elHolidays, holidays, today, 2, 5);
  renderInto(elEvents, events, today, 2, 5);
}

if (window.info && window.info.onData) {
  window.info.onData((data) => {
    const p = (data && data.profile) || {};
    _tz = p.timezone || null;
    const loc = [p.city, p.country].filter(Boolean).join(', ');
    elLoc.textContent = loc || (p.name || 'Local');
    elTz.textContent = _tz || '';
    tickClock();
    renderWeather(data && data.weather);
    renderHolidays(data && data.holidays);
  });
}

const closeBtn = document.getElementById('infoClose');
const refreshBtn = document.getElementById('infoRefresh');
if (closeBtn) closeBtn.addEventListener('click', () => window.info && window.info.close && window.info.close());
if (refreshBtn) refreshBtn.addEventListener('click', () => {
  elWeather.innerHTML = '<span class="info-dim">Loading…</span>';
  elHolidays.innerHTML = '<span class="info-dim">Loading…</span>';
  window.info && window.info.refresh && window.info.refresh();
});
