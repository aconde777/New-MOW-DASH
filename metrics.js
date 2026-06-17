const store = require('./store');
const { rangeForPeriod, inRange } = require('./dateUtils');

function closesInRange(start, end) {
  return store.all('closes').filter((c) => inRange(c.date, start, end));
}

function setterLogsInRange(start, end) {
  return store.all('setterLogs').filter((s) => inRange(s.date, start, end));
}

function closerLeaderboard(period, anchorDate) {
  const { start, end } = rangeForPeriod(period, anchorDate);
  const reps = store.all('reps').filter((r) => r.role === 'closer' && r.active !== false);
  const closes = closesInRange(start, end);

  const rows = reps.map((rep) => {
    const repCloses = closes.filter((c) => c.repId === rep.id);
    const revenue = repCloses.reduce((sum, c) => sum + Number(c.amount || 0), 0);
    return {
      repId: rep.id,
      name: rep.name,
      closes: repCloses.length,
      revenue,
    };
  });

  rows.sort((a, b) => b.revenue - a.revenue || b.closes - a.closes);
  rows.forEach((r, i) => (r.rank = i + 1));
  return { period, start, end, rows };
}

function setterLeaderboard(period, anchorDate) {
  const { start, end } = rangeForPeriod(period, anchorDate);
  const setters = store.all('reps').filter((r) => r.role === 'setter' && r.active !== false);
  const logs = setterLogsInRange(start, end);
  const closes = closesInRange(start, end).filter((c) => c.setterId);

  const rows = setters.map((setter) => {
    const setterLogsForRep = logs.filter((l) => l.setterId === setter.id);
    const callsMade = setterLogsForRep.reduce((sum, l) => sum + Number(l.callsMade || 0), 0);
    const appointmentsBooked = setterLogsForRep.reduce((sum, l) => sum + Number(l.appointmentsBooked || 0), 0);
    const showUps = setterLogsForRep.reduce((sum, l) => sum + Number(l.showUps || 0), 0);
    const repCloses = closes.filter((c) => c.setterId === setter.id);
    const closesCount = repCloses.length;
    const revenue = repCloses.reduce((sum, c) => sum + Number(c.amount || 0), 0);

    return {
      setterId: setter.id,
      name: setter.name,
      callsMade,
      appointmentsBooked,
      showUps,
      closes: closesCount,
      revenue,
      callToApptRate: callsMade ? appointmentsBooked / callsMade : 0,
      apptToShowRate: appointmentsBooked ? showUps / appointmentsBooked : 0,
      showToCloseRate: showUps ? closesCount / showUps : 0,
    };
  });

  rows.sort((a, b) => b.closes - a.closes || b.appointmentsBooked - a.appointmentsBooked);
  rows.forEach((r, i) => (r.rank = i + 1));
  return { period, start, end, rows };
}

function actualForMetric(metric, start, end, productId) {
  if (metric === 'revenue' || metric === 'closes') {
    let closes = closesInRange(start, end);
    if (productId) closes = closes.filter((c) => c.productId === productId);
    return metric === 'revenue'
      ? closes.reduce((sum, c) => sum + Number(c.amount || 0), 0)
      : closes.length;
  }
  const logs = setterLogsInRange(start, end);
  if (metric === 'calls') return logs.reduce((sum, l) => sum + Number(l.callsMade || 0), 0);
  if (metric === 'appointments') return logs.reduce((sum, l) => sum + Number(l.appointmentsBooked || 0), 0);
  if (metric === 'shows') return logs.reduce((sum, l) => sum + Number(l.showUps || 0), 0);
  return 0;
}

function computeTargetProgress(target) {
  const { start, end } = rangeForPeriod(target.period);
  const actual = actualForMetric(target.metric, start, end, target.productId);
  const pct = target.value ? Math.min(1, actual / target.value) : 0;
  return { ...target, start, end, actual, pct };
}

module.exports = {
  closesInRange,
  setterLogsInRange,
  closerLeaderboard,
  setterLeaderboard,
  computeTargetProgress,
  actualForMetric,
};
