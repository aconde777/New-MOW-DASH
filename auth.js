const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE_NAME = 'mow_token';

function getPasswordHash() {
  return process.env.DASHBOARD_PASSWORD_HASH || null;
}

async function checkPassword(candidate) {
  const hash = getPasswordHash();
  if (hash) return bcrypt.compare(candidate, hash);
  // Fallback for quick local/dev setup: plain env var, no hash required.
  const plain = process.env.DASHBOARD_PASSWORD;
  if (plain) return candidate === plain;
  return false;
}

function issueToken() {
  return jwt.sign({ ok: true }, JWT_SECRET, { expiresIn: '30d' });
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

module.exports = { checkPassword, issueToken, requireAuth, setAuthCookie, clearAuthCookie, COOKIE_NAME };
