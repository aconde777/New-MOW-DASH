const express = require('express');
const store = require('./store');
const { requireAuth } = require('./auth');
const { rangeForPeriod, inRange, todayStr, weekRange, monthRange, daysInMonth, parseDate, toDateStr } = require('./dateUtils');
const metrics = require('./metrics');
const { sendEodSummary } = require('./email');

const router = express.Router();
router.use(requireAuth);

// ---------- Reps (closers + setters) ----------
router.get('/reps', (req, res) => {
  let reps = store.all('reps');
  if (req.query.role) reps = reps.filter((r) => r.role === req.query.role);
  res.json(reps.sort((a, b) => a.name.localeCompare(b.name)));
});

router.post('/reps', (req, res) => {
  const { name, role } = req.body;
  if (!name || !['closer', 'setter'].includes(role)) {
    return res.status(400).json({ error: 'name and role ("closer" or "setter") are required' });
  }
  const rep = store.insert('reps', { name: name.trim(), role, active: true });
  res.status(201).json(rep);
});

router.patch('/reps/:id', (req, res) => {
  const updated = store.update('reps', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Rep not found' });
  res.json(updated);
});

router.delete('/reps/:id', (req, res) => {
  store.remove('reps', req.params.id);
  res.json({ ok: true });
});

// ---------- Products / Programs ----------
router.get('/products', (req, res) => {
  res.json(store.all('products').sort((a, b) => a.name.localeCompare(b.name)));
});

router.post('/products', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const product = store.insert('products', { name: name.trim(), active: true });
  res.status(201).json(product);
});

router.patch('/products/:id', (req, res) => {
  const updated = store.update('products', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Product not found' });
  res.json(updated);
});

router.delete('/products/:id', (req, res) => {
  store.remove('products', req.params.id);
  res.json({ ok: true });
});

// ---------- Closes (sales log) ----------
router.get('/closes', (req, res) => {
  let closes = store.all('closes');
  const { start, end, repId, productId } = req.query;
  if (start && end) closes = closes.filter((c) => inRange(c.date, start, end));
  if (repId) closes = closes.filter((c) => c.repId === repId);
  if (productId) closes = closes.filter((c) => c.productId === productId);
  closes.sort((a, b) => (a.date < b.date ? 1 : -1));
  res.json(closes);
});

router.post('/closes', (req, res) => {
  const { date, repId, productId, amount, setterId, notes } = req.body;
  if (!date || !repId || amount === undefined) {
    return res.status(400).json({ error: 'date, repId, and amount are required' });
  }
  const close = store.insert('closes', {
    date,
    repId,
    productId: productId || null,
    amount: Number(amount),
    setterId: setterId || null,
    notes: notes || '',
  });
  res.status(201).json(close);
});

router.patch('/closes/:id', (req, res) => {
  const updated = store.update('closes', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Close not found' });
  res.json(updated);
});

router.delete('/closes/:id', (req, res) => {
  store.remove('closes', req.params.id);
  res.json({ ok: true });
});

// ---------- Setter activity log ----------
router.get('/setter-logs', (req, res) => {
  let logs = store.all('setterLogs');
  const { start, end, setterId } = req.query;
  if (start && end) logs = logs.filter((l) => inRange(l.date, start, end));
  if (setterId) logs = logs.filter((l) => l.setterId === setterId);
  logs.sort((a, b) => (a.date < b.date ? 1 : -1));
  res.json(logs);
});

router.post('/setter-logs', (req, res) => {
  const { date, setterId, callsMade, appointmentsBooked, showUps, notes } = req.body;
  if (!date || !setterId) return res.status(400).json({ error: 'date and setterId are required' });
  const log = store.insert('setterLogs', {
    date,
    setterId,
    callsMade: Number(callsMade || 0),
    appointmentsBooked: Number(appointmentsBooked || 0),
    showUps: Number(showUps || 0),
    notes: notes || '',
  });
  res.status(201).json(log);
});

router.patch('/setter-logs/:id', (req, res) => {
  const updated = store.update('setterLogs', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Log not found' });
  res.json(updated);
});

router.delete('/setter-logs/:id', (req, res) => {
  store.remove('setterLogs', req.params.id);
  res.json({ ok: true });
});

// ---------- Leaderboards ----------
router.get('/leaderboard/closers', (req, res) => {
  res.json(metrics.closerLeaderboard(req.query.period || 'week', req.query.date));
});

router.get('/leaderboard/setters', (req, res) => {
  res.json(metrics.setterLeaderboard(req.query.period || 'week', req.query.date));
});

// ---------- Summary (top bar "today") ----------
router.get('/summary/today', (req, res) => {
  const today = todayStr();
  const closes = metrics.closesInRange(today, today);
  const logs = metrics.setterLogsInRange(today, today);
  res.json({
    date: today,
    closes: closes.length,
    revenue: closes.reduce((s, c) => s + Number(c.amount || 0), 0),
    callsMade: logs.reduce((s, l) => s + Number(l.callsMade || 0), 0),
    appointmentsBooked: logs.reduce((s, l) => s + Number(l.appointmentsBooked || 0), 0),
    showUps: logs.reduce((s, l) => s + Number(l.showUps || 0), 0),
  });
});

// ---------- Calendar ----------
function dayAggregate(dateStr) {
  const closes = metrics.closesInRange(dateStr, dateStr);
  const logs = metrics.setterLogsInRange(dateStr, dateStr);
  return {
    date: dateStr,
    closes: closes.length,
    revenue: closes.reduce((s, c) => s + Number(c.amount || 0), 0),
    callsMade: logs.reduce((s, l) => s + Number(l.callsMade || 0), 0),
    appointmentsBooked: logs.reduce((s, l) => s + Number(l.appointmentsBooked || 0), 0),
    showUps: logs.reduce((s, l) => s + Number(l.showUps || 0), 0),
  };
}

router.get('/trend', (req, res) => {
  const days = Math.min(Number(req.query.days) || 14, 90);
  const today = parseDate(todayStr());
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(dayAggregate(toDateStr(d)));
  }
  res.json({ days: out });
});

router.get('/calendar/month', (req, res) => {
  const month = req.query.month || todayStr().slice(0, 7); // YYYY-MM
  const [year, m] = month.split('-').map(Number);
  const numDays = daysInMonth(year, m);
  const days = [];
  for (let d = 1; d <= numDays; d++) {
    const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push(dayAggregate(dateStr));
  }
  res.json({ month, days });
});

router.get('/calendar/week', (req, res) => {
  const anchor = req.query.date || todayStr();
  const { start, end } = weekRange(anchor);
  const days = [];
  let cursor = parseDate(start);
  const endDate = parseDate(end);
  while (cursor <= endDate) {
    days.push(dayAggregate(toDateStr(cursor)));
    cursor.setDate(cursor.getDate() + 1);
  }
  const totals = days.reduce(
    (acc, d) => ({
      closes: acc.closes + d.closes,
      revenue: acc.revenue + d.revenue,
      callsMade: acc.callsMade + d.callsMade,
      appointmentsBooked: acc.appointmentsBooked + d.appointmentsBooked,
      showUps: acc.showUps + d.showUps,
    }),
    { closes: 0, revenue: 0, callsMade: 0, appointmentsBooked: 0, showUps: 0 }
  );
  res.json({ start, end, days, totals });
});

router.get('/calendar/day', (req, res) => {
  const date = req.query.date || todayStr();
  const reps = store.all('reps');
  const products = store.all('products');
  const repName = (id) => reps.find((r) => r.id === id)?.name || 'Unknown';
  const productName = (id) => products.find((p) => p.id === id)?.name || '—';

  const closes = metrics
    .closesInRange(date, date)
    .map((c) => ({ ...c, repName: repName(c.repId), productName: productName(c.productId), setterName: c.setterId ? repName(c.setterId) : null }));
  const setterLogs = metrics.setterLogsInRange(date, date).map((l) => ({ ...l, setterName: repName(l.setterId) }));

  res.json({ date, closes, setterLogs, aggregate: dayAggregate(date) });
});

// ---------- Targets & Goals ----------
router.get('/targets', (req, res) => {
  const targets = store.all('targets').filter((t) => t.active !== false);
  res.json(targets.map(metrics.computeTargetProgress));
});

router.post('/targets', (req, res) => {
  const { label, scope, metric, period, value, productId } = req.body;
  if (!label || !metric || !period || value === undefined) {
    return res.status(400).json({ error: 'label, metric, period, and value are required' });
  }
  const target = store.insert('targets', {
    label,
    scope: scope || 'team',
    metric,
    period,
    value: Number(value),
    productId: productId || null,
    active: true,
  });
  res.status(201).json(metrics.computeTargetProgress(target));
});

router.patch('/targets/:id', (req, res) => {
  const updated = store.update('targets', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Target not found' });
  res.json(metrics.computeTargetProgress(updated));
});

router.delete('/targets/:id', (req, res) => {
  store.remove('targets', req.params.id);
  res.json({ ok: true });
});

// ---------- Settings ----------
router.get('/settings', (req, res) => {
  res.json(store.getSettings());
});

router.patch('/settings', (req, res) => {
  res.json(store.updateSettings(req.body));
});

// ---------- EOD email ----------
router.post('/eod/send-now', async (req, res) => {
  try {
    const result = await sendEodSummary(req.body?.date);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
