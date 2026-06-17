// All dates are handled as plain YYYY-MM-DD strings (no timezone math needed
// since reps log "today's" date as seen on their own clock).

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Monday-start week containing the given date string.
function weekRange(dateStr) {
  const d = parseDate(dateStr || todayStr());
  const dow = d.getDay(); // 0 = Sunday
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toDateStr(monday), end: toDateStr(sunday) };
}

function monthRange(dateStr) {
  const d = parseDate(dateStr || todayStr());
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: toDateStr(first), end: toDateStr(last) };
}

function inRange(dateStr, start, end) {
  return dateStr >= start && dateStr <= end;
}

function rangeForPeriod(period, anchorDate) {
  const anchor = anchorDate || todayStr();
  if (period === 'today') return { start: anchor, end: anchor };
  if (period === 'week') return weekRange(anchor);
  if (period === 'month') return monthRange(anchor);
  return { start: '0000-01-01', end: '9999-12-31' }; // 'all'
}

function daysInMonth(year, month) {
  // month is 1-indexed here
  return new Date(year, month, 0).getDate();
}

module.exports = { todayStr, parseDate, toDateStr, weekRange, monthRange, inRange, rangeForPeriod, daysInMonth };
