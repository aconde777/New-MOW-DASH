// ===================== State =====================
let state = {
  reps: [],
  products: [],
  closerPeriod: 'week',
  setterPeriod: 'week',
  calendarView: 'month',
  calendarAnchor: new Date(),
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtPct(n) {
  return Math.round((n || 0) * 100) + '%';
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ===================== API helper =====================
async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error('Not authenticated');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }
  return res.status === 204 ? null : res.json();
}

// ===================== Auth =====================
function showLogin() {
  $('#login-screen').classList.remove('hidden');
  $('#app-shell').classList.add('hidden');
}
function showApp() {
  $('#login-screen').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
}

async function checkSession() {
  try {
    await api('/session');
    showApp();
    initApp();
  } catch {
    showLogin();
  }
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = $('#password-input').value;
  $('#login-error').textContent = '';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Login failed');
    }
    showApp();
    initApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  showLogin();
});

// ===================== Tabs =====================
$$('.nav-link').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.nav-link').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $$('.tab-panel').forEach((p) => p.classList.add('hidden'));
    $('#tab-' + tab).classList.remove('hidden');
    if (tab === 'calendar') renderCalendar();
    if (tab === 'targets') renderTargets();
    if (tab === 'team') { renderRoster(); renderProductsList(); }
  });
});

// ===================== Init =====================
async function initApp() {
  const [reps, products] = await Promise.all([api('/reps'), api('/products')]);
  state.reps = reps;
  state.products = products;
  populateSelects();
  setDefaultDates();
  await refreshTodayStrip();
  await renderCloserLeaderboard();
  await renderSetterLeaderboard();
  await renderRecentCloses();
  await renderRecentSetterLogs();
  await renderTrendChart();
  await loadEodSettings();
}

function setDefaultDates() {
  $('#close-form [name="date"]').value = todayISO();
  $('#setter-form [name="date"]').value = todayISO();
}

function populateSelects() {
  const closers = state.reps.filter((r) => r.role === 'closer' && r.active !== false);
  const setters = state.reps.filter((r) => r.role === 'setter' && r.active !== false);

  fillSelect($('#close-form [name="repId"]'), closers, 'Select rep');
  fillSelect($('#close-form [name="setterId"]'), setters, '— (none)', true);
  fillSelect($('#setter-form [name="setterId"]'), setters, 'Select setter');

  const productSelect = $('#close-form [name="productId"]');
  productSelect.innerHTML = '<option value="">— No program selected</option>' +
    state.products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

  const targetProductSelect = $('#target-form [name="productId"]');
  targetProductSelect.innerHTML = '<option value="">All programs</option>' +
    state.products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

function fillSelect(select, items, placeholder, includeBlank) {
  const blank = includeBlank ? `<option value="">${placeholder}</option>` : `<option value="" disabled selected>${placeholder}</option>`;
  select.innerHTML = blank + items.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function repName(id) {
  return state.reps.find((r) => r.id === id)?.name || '—';
}
function productName(id) {
  return state.products.find((p) => p.id === id)?.name || '—';
}

// ===================== Today strip =====================
async function refreshTodayStrip() {
  const s = await api('/summary/today');
  $('#today-closes').textContent = s.closes;
  $('#today-revenue').textContent = fmtMoney(s.revenue);
  $('#today-calls').textContent = s.callsMade;
  $('#today-appts').textContent = s.appointmentsBooked;
  $('#today-shows').textContent = s.showUps;
}

// ===================== Sales tab =====================
$('#close-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    date: fd.get('date'),
    repId: fd.get('repId'),
    productId: fd.get('productId') || null,
    amount: Number(fd.get('amount')),
    setterId: fd.get('setterId') || null,
    notes: fd.get('notes') || '',
  };
  await api('/closes', { method: 'POST', body: JSON.stringify(payload) });
  e.target.reset();
  setDefaultDates();
  await Promise.all([refreshTodayStrip(), renderCloserLeaderboard(), renderSetterLeaderboard(), renderRecentCloses(), renderTrendChart()]);
});

$('.period-toggle[data-target="closer-leaderboard"]').addEventListener('click', (e) => {
  if (!e.target.dataset.period) return;
  state.closerPeriod = e.target.dataset.period;
  $$('.period-toggle[data-target="closer-leaderboard"] button').forEach((b) => b.classList.toggle('active', b === e.target));
  renderCloserLeaderboard();
});

$('.period-toggle[data-target="setter-leaderboard"]').addEventListener('click', (e) => {
  if (!e.target.dataset.period) return;
  state.setterPeriod = e.target.dataset.period;
  $$('.period-toggle[data-target="setter-leaderboard"] button').forEach((b) => b.classList.toggle('active', b === e.target));
  renderSetterLeaderboard();
});

async function renderCloserLeaderboard() {
  const data = await api(`/leaderboard/closers?period=${state.closerPeriod}`);
  const el = $('#closer-leaderboard');
  if (!data.rows.length) {
    el.innerHTML = '<div class="empty-state">No closers added yet. Add your team in the Team tab.</div>';
    return;
  }
  el.innerHTML = data.rows
    .map(
      (r) => `
    <div class="lb-row ${r.rank === 1 ? 'rank-1' : ''}">
      <span class="lb-rank">#${r.rank}</span>
      <span class="lb-name">${escapeHtml(r.name)}</span>
      <span class="lb-stats">
        <span>${fmtMoney(r.revenue)}<span class="sub">Revenue</span></span>
        <span>${r.closes}<span class="sub">Closes</span></span>
      </span>
    </div>`
    )
    .join('');
}

async function renderSetterLeaderboard() {
  const data = await api(`/leaderboard/setters?period=${state.setterPeriod}`);
  const el = $('#setter-leaderboard');
  if (!data.rows.length) {
    el.innerHTML = '<div class="empty-state">No setters added yet. Add your team in the Team tab.</div>';
    return;
  }
  el.innerHTML = data.rows
    .map(
      (r) => `
    <div class="lb-row ${r.rank === 1 ? 'rank-1' : ''}">
      <span class="lb-rank">#${r.rank}</span>
      <span class="lb-name">${escapeHtml(r.name)}</span>
      <span class="lb-stats">
        <span>${r.callsMade}<span class="sub">Calls</span></span>
        <span>${r.appointmentsBooked}<span class="sub">Booked</span></span>
        <span>${r.showUps}<span class="sub">Showed</span></span>
        <span>${r.closes}<span class="sub">Closed</span></span>
        <span>${fmtPct(r.apptToShowRate)}<span class="sub">Show rate</span></span>
      </span>
    </div>`
    )
    .join('');
}

async function renderRecentCloses() {
  const closes = await api('/closes');
  const el = $('#recent-closes');
  const recent = closes.slice(0, 15);
  if (!recent.length) {
    el.innerHTML = '<div class="empty-state">No closes logged yet.</div>';
    return;
  }
  el.innerHTML = `<table>
    <tr><th>Date</th><th>Rep</th><th>Program</th><th>Setter</th><th>Amount</th><th></th></tr>
    ${recent
      .map(
        (c) => `<tr>
        <td>${c.date}</td>
        <td>${escapeHtml(repName(c.repId))}</td>
        <td>${escapeHtml(productName(c.productId))}</td>
        <td>${c.setterId ? escapeHtml(repName(c.setterId)) : '—'}</td>
        <td class="amount">${fmtMoney(c.amount)}</td>
        <td><button class="row-delete" data-id="${c.id}" data-kind="closes">Delete</button></td>
      </tr>`
      )
      .join('')}
  </table>`;
  attachRowDeletes(el);
}

async function renderRecentSetterLogs() {
  const logs = await api('/setter-logs');
  const el = $('#recent-setter-logs');
  const recent = logs.slice(0, 15);
  if (!recent.length) {
    el.innerHTML = '<div class="empty-state">No setter activity logged yet.</div>';
    return;
  }
  el.innerHTML = `<table>
    <tr><th>Date</th><th>Setter</th><th>Calls</th><th>Booked</th><th>Showed</th><th></th></tr>
    ${recent
      .map(
        (l) => `<tr>
        <td>${l.date}</td>
        <td>${escapeHtml(repName(l.setterId))}</td>
        <td>${l.callsMade}</td>
        <td>${l.appointmentsBooked}</td>
        <td>${l.showUps}</td>
        <td><button class="row-delete" data-id="${l.id}" data-kind="setter-logs">Delete</button></td>
      </tr>`
      )
      .join('')}
  </table>`;
  attachRowDeletes(el);
}

function attachRowDeletes(container) {
  $$('.row-delete', container).forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this entry?')) return;
      await api(`/${btn.dataset.kind}/${btn.dataset.id}`, { method: 'DELETE' });
      await Promise.all([
        refreshTodayStrip(),
        renderCloserLeaderboard(),
        renderSetterLeaderboard(),
        renderRecentCloses(),
        renderRecentSetterLogs(),
        renderTrendChart(),
      ]);
    });
  });
}

async function renderTrendChart() {
  const { days } = await api('/trend?days=14');
  const el = $('#trend-chart');
  const max = Math.max(1, ...days.map((d) => d.revenue));
  const w = 700, h = 160, padBottom = 22, barGap = 4;
  const barW = (w / days.length) - barGap;
  const bars = days
    .map((d, i) => {
      const barH = (d.revenue / max) * (h - padBottom - 10);
      const x = i * (barW + barGap);
      const y = h - padBottom - barH;
      const label = d.date.slice(5).replace('-', '/');
      const barFill = d.revenue > 0 ? 'var(--accent)' : 'var(--border)';
      return `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(barH, 1)}" style="fill:${barFill}" rx="2"></rect>
              <text x="${x + barW / 2}" y="${h - 6}" font-size="9" text-anchor="middle" style="fill:var(--text-muted); font-family:var(--font-mono)">${label}</text>`;
    })
    .join('');
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${bars}</svg>`;
}

// ===================== Setters tab =====================
$('#setter-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    date: fd.get('date'),
    setterId: fd.get('setterId'),
    callsMade: Number(fd.get('callsMade') || 0),
    appointmentsBooked: Number(fd.get('appointmentsBooked') || 0),
    showUps: Number(fd.get('showUps') || 0),
    notes: fd.get('notes') || '',
  };
  await api('/setter-logs', { method: 'POST', body: JSON.stringify(payload) });
  e.target.reset();
  setDefaultDates();
  await Promise.all([refreshTodayStrip(), renderSetterLeaderboard(), renderRecentSetterLogs(), renderTrendChart()]);
});

// ===================== Calendar tab =====================
$('#calendar-view-toggle').addEventListener('click', (e) => {
  if (!e.target.dataset.view) return;
  state.calendarView = e.target.dataset.view;
  $$('#calendar-view-toggle button').forEach((b) => b.classList.toggle('active', b === e.target));
  renderCalendar();
});
$('#cal-prev').addEventListener('click', () => shiftCalendar(-1));
$('#cal-next').addEventListener('click', () => shiftCalendar(1));
$('#cal-today').addEventListener('click', () => { state.calendarAnchor = new Date(); renderCalendar(); });

function shiftCalendar(dir) {
  const d = new Date(state.calendarAnchor);
  if (state.calendarView === 'month') d.setMonth(d.getMonth() + dir);
  else d.setDate(d.getDate() + dir * 7);
  state.calendarAnchor = d;
  renderCalendar();
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function renderCalendar() {
  if (state.calendarView === 'month') {
    $('#calendar-month-view').classList.remove('hidden');
    $('#calendar-week-view').classList.add('hidden');
    await renderMonthView();
  } else {
    $('#calendar-month-view').classList.add('hidden');
    $('#calendar-week-view').classList.remove('hidden');
    await renderWeekView();
  }
}

async function renderMonthView() {
  const anchor = state.calendarAnchor;
  const year = anchor.getFullYear();
  const month = anchor.getMonth() + 1;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  $('#calendar-title').textContent = anchor.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const data = await api(`/calendar/month?month=${monthStr}`);
  const firstDay = new Date(year, month - 1, 1);
  const startOffset = firstDay.getDay(); // 0=Sun
  const today = todayISO();

  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = dows.map((d) => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < startOffset; i++) html += '<div class="day-cell empty"></div>';

  data.days.forEach((d) => {
    const dayNum = Number(d.date.slice(8));
    const isToday = d.date === today;
    html += `<div class="day-cell ${isToday ? 'today' : ''}" data-date="${d.date}">
      <span class="day-num">${dayNum}</span>
      ${d.closes ? `<span class="day-badge rev">${d.closes} · ${fmtMoney(d.revenue)}</span>` : ''}
      ${d.callsMade || d.appointmentsBooked ? `<span class="day-badge act">${d.appointmentsBooked} appt</span>` : ''}
    </div>`;
  });

  $('#calendar-month-view').innerHTML = `<div class="month-grid">${html}</div>`;
  $$('.day-cell[data-date]', $('#calendar-month-view')).forEach((cell) => {
    cell.addEventListener('click', () => openDayModal(cell.dataset.date));
  });
}

async function renderWeekView() {
  const anchor = ymd(state.calendarAnchor);
  const data = await api(`/calendar/week?date=${anchor}`);
  $('#calendar-title').textContent = `Week of ${data.start} – ${data.end}`;
  const today = todayISO();
  const dowFmt = (dateStr) => new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });

  const cards = data.days
    .map(
      (d) => `
    <div class="week-day-card ${d.date === today ? 'today' : ''}" data-date="${d.date}">
      <div class="wd-label">${dowFmt(d.date)}</div>
      <div class="wd-date">${d.date.slice(5)}</div>
      <div class="day-badge rev">${d.closes} closes</div>
      <div class="day-badge rev">${fmtMoney(d.revenue)}</div>
      <div class="day-badge act">${d.callsMade} calls</div>
      <div class="day-badge act">${d.appointmentsBooked} appt</div>
    </div>`
    )
    .join('');

  $('#calendar-week-view').innerHTML = `
    <div class="week-row">${cards}</div>
    <div class="week-totals">
      <div>${data.totals.closes}<span>Closes</span></div>
      <div>${fmtMoney(data.totals.revenue)}<span>Revenue</span></div>
      <div>${data.totals.callsMade}<span>Calls</span></div>
      <div>${data.totals.appointmentsBooked}<span>Appts</span></div>
      <div>${data.totals.showUps}<span>Shows</span></div>
    </div>`;

  $$('.week-day-card', $('#calendar-week-view')).forEach((card) => {
    card.addEventListener('click', () => openDayModal(card.dataset.date));
  });
}

async function openDayModal(date) {
  const data = await api(`/calendar/day?date=${date}`);
  $('#day-modal-title').textContent = date;
  const closesRows = data.closes
    .map((c) => `<tr><td>${escapeHtml(c.repName)}</td><td>${escapeHtml(c.productName)}</td><td class="amount">${fmtMoney(c.amount)}</td><td>${c.setterName ? escapeHtml(c.setterName) : '—'}</td></tr>`)
    .join('');
  const logRows = data.setterLogs
    .map((l) => `<tr><td>${escapeHtml(l.setterName)}</td><td>${l.callsMade}</td><td>${l.appointmentsBooked}</td><td>${l.showUps}</td></tr>`)
    .join('');

  $('#day-modal-body').innerHTML = `
    <h4 style="margin:0 0 8px; font-size:13px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.04em;">Closes</h4>
    <div class="data-table"><table>
      <tr><th>Rep</th><th>Program</th><th>Amount</th><th>Setter</th></tr>
      ${closesRows || '<tr><td colspan="4" style="color:var(--text-muted);">None logged</td></tr>'}
    </table></div>
    <h4 style="margin:16px 0 8px; font-size:13px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.04em;">Setter activity</h4>
    <div class="data-table"><table>
      <tr><th>Setter</th><th>Calls</th><th>Booked</th><th>Showed</th></tr>
      ${logRows || '<tr><td colspan="4" style="color:var(--text-muted);">None logged</td></tr>'}
    </table></div>`;
  $('#day-modal').classList.remove('hidden');
}
$('#day-modal-close').addEventListener('click', () => $('#day-modal').classList.add('hidden'));
$('#day-modal').addEventListener('click', (e) => { if (e.target.id === 'day-modal') $('#day-modal').classList.add('hidden'); });

// ===================== Targets tab =====================
$('#target-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    label: fd.get('label'),
    scope: fd.get('scope'),
    metric: fd.get('metric'),
    period: fd.get('period'),
    value: Number(fd.get('value')),
    productId: fd.get('productId') || null,
  };
  await api('/targets', { method: 'POST', body: JSON.stringify(payload) });
  e.target.reset();
  renderTargets();
});

async function renderTargets() {
  const targets = await api('/targets');
  const el = $('#targets-list');
  if (!targets.length) {
    el.innerHTML = '<div class="empty-state">No targets set yet. Add one to track progress for the week or month.</div>';
    return;
  }
  el.innerHTML = targets
    .map((t) => {
      const pct = Math.min(1, t.pct);
      const barClass = pct >= 1 ? '' : pct >= 0.5 ? 'warn' : 'danger';
      const metricLabel = { revenue: 'Revenue', closes: 'Closes', calls: 'Calls', appointments: 'Appointments', shows: 'Shows' }[t.metric];
      const actualDisplay = t.metric === 'revenue' ? fmtMoney(t.actual) : t.actual;
      const targetDisplay = t.metric === 'revenue' ? fmtMoney(t.value) : t.value;
      return `
      <div class="target-row" data-id="${t.id}">
        <div class="target-top">
          <span class="target-label">${escapeHtml(t.label)}</span>
          <span class="target-meta">${t.scope} · ${metricLabel} · ${t.period === 'week' ? 'This week' : 'This month'}</span>
        </div>
        <div class="target-bar-track"><div class="target-bar-fill ${barClass}" style="width:${pct * 100}%"></div></div>
        <div class="target-numbers">
          <span>${actualDisplay} of ${targetDisplay} (${fmtPct(t.pct)})</span>
          <button class="row-delete" data-id="${t.id}" data-kind="targets">Delete</button>
        </div>
      </div>`;
    })
    .join('');

  $$('.row-delete', el).forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this target?')) return;
      await api(`/targets/${btn.dataset.id}`, { method: 'DELETE' });
      renderTargets();
    });
  });
}

// ===================== Team tab =====================
$('#rep-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await api('/reps', { method: 'POST', body: JSON.stringify({ name: fd.get('name'), role: fd.get('role') }) });
  e.target.reset();
  const reps = await api('/reps');
  state.reps = reps;
  populateSelects();
  renderRoster();
});

$('#product-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await api('/products', { method: 'POST', body: JSON.stringify({ name: fd.get('name') }) });
  e.target.reset();
  const products = await api('/products');
  state.products = products;
  populateSelects();
  renderProductsList();
});

async function renderRoster() {
  const reps = await api('/reps');
  state.reps = reps;
  const el = $('#roster-list');
  if (!reps.length) {
    el.innerHTML = '<div class="empty-state">No team members yet.</div>';
    return;
  }
  el.innerHTML = `<table>
    <tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr>
    ${reps
      .map(
        (r) => `<tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${r.role === 'closer' ? 'Closer' : 'Setter'}</td>
        <td>${r.active === false ? 'Inactive' : 'Active'}</td>
        <td>
          <button class="row-delete toggle-active" data-id="${r.id}" data-active="${r.active !== false}">${r.active === false ? 'Reactivate' : 'Deactivate'}</button>
          <button class="row-delete" data-id="${r.id}" data-kind="reps">Delete</button>
        </td>
      </tr>`
      )
      .join('')}
  </table>`;

  $$('.toggle-active', el).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nowActive = btn.dataset.active === 'true';
      await api(`/reps/${btn.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ active: !nowActive }) });
      const reps = await api('/reps');
      state.reps = reps;
      populateSelects();
      renderRoster();
    });
  });
  $$('.row-delete[data-kind="reps"]', el).forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this team member? Past logs stay on record.')) return;
      await api(`/reps/${btn.dataset.id}`, { method: 'DELETE' });
      const reps = await api('/reps');
      state.reps = reps;
      populateSelects();
      renderRoster();
    });
  });
}

async function renderProductsList() {
  const products = await api('/products');
  state.products = products;
  const el = $('#products-list');
  if (!products.length) {
    el.innerHTML = '<div class="empty-state">No programs added yet.</div>';
    return;
  }
  el.innerHTML = `<table>
    <tr><th>Program</th><th></th></tr>
    ${products
      .map(
        (p) => `<tr><td>${escapeHtml(p.name)}</td><td><button class="row-delete" data-id="${p.id}" data-kind="products">Delete</button></td></tr>`
      )
      .join('')}
  </table>`;
  $$('.row-delete', el).forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this program?')) return;
      await api(`/products/${btn.dataset.id}`, { method: 'DELETE' });
      const products = await api('/products');
      state.products = products;
      populateSelects();
      renderProductsList();
    });
  });
}

async function loadEodSettings() {
  const settings = await api('/settings');
  const form = $('#eod-form');
  form.enabled.checked = !!settings.eod?.enabled;
  form.time.value = settings.eod?.time || '20:00';
  form.timezone.value = settings.eod?.timezone || 'America/New_York';
  form.recipientEmail.value = settings.eod?.recipientEmail || '';
}

$('#eod-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await api('/settings', {
    method: 'PATCH',
    body: JSON.stringify({
      eod: {
        enabled: fd.get('enabled') === 'on',
        time: fd.get('time'),
        timezone: fd.get('timezone'),
        recipientEmail: fd.get('recipientEmail'),
      },
    }),
  });
  $('#eod-status').textContent = 'Saved.';
  setTimeout(() => ($('#eod-status').textContent = ''), 2500);
});

$('#send-eod-now').addEventListener('click', async () => {
  $('#eod-status').textContent = 'Sending…';
  try {
    await api('/eod/send-now', { method: 'POST', body: JSON.stringify({}) });
    $('#eod-status').textContent = 'Sent — check the inbox.';
  } catch (err) {
    $('#eod-status').textContent = 'Failed: ' + err.message;
  }
});

// ===================== Boot =====================
checkSession();
