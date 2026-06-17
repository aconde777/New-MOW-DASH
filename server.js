require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const path = require('path');

const { checkPassword, issueToken, setAuthCookie, clearAuthCookie, requireAuth } = require('./auth');
const apiRouter = require('./api');
const store = require('./store');
const { sendEodSummary } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

// ---------- Auth routes (outside the protected /api router) ----------
app.post('/api/login', async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });
  const ok = await checkPassword(password);
  if (!ok) return res.status(401).json({ error: 'Incorrect password' });
  setAuthCookie(res, issueToken());
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/session', requireAuth, (req, res) => {
  res.json({ authenticated: true });
});

// ---------- Protected API ----------
app.use('/api', apiRouter);

// ---------- Static frontend ----------
app.use(express.static(path.join(__dirname, 'public')));

// Express 5 catch-all syntax: '*' must be a named wildcard or regex, not a bare string.
app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- Scheduled EOD email ----------
// Re-reads settings every minute window via cron schedule string built from settings.
let currentCronJob = null;

function scheduleEodJob() {
  if (currentCronJob) {
    currentCronJob.stop();
    currentCronJob = null;
  }
  const settings = store.getSettings();
  if (!settings.eod?.enabled || !settings.eod?.time) return;

  const [hour, minute] = settings.eod.time.split(':').map(Number);
  const cronExpr = `${minute} ${hour} * * *`;
  const timezone = settings.eod.timezone || 'America/New_York';

  currentCronJob = cron.schedule(
    cronExpr,
    () => {
      sendEodSummary().catch((err) => console.error('EOD email failed:', err.message));
    },
    { timezone }
  );
  console.log(`EOD email scheduled for ${settings.eod.time} (${timezone})`);
}

scheduleEodJob();
// Re-check the schedule every 5 minutes in case settings changed via the Team tab.
setInterval(scheduleEodJob, 5 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`MOW dashboard running on port ${PORT}`);
  console.log(`Data directory: ${store.DATA_DIR}`);
});
