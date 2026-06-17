const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');

// DATA_DIR points at a Railway persistent volume in production (e.g. /data).
// Defaults to a local ./data folder for development.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

const FILES = {
  reps: 'reps.json',
  products: 'products.json',
  closes: 'closes.json',
  setterLogs: 'setterLogs.json',
  targets: 'targets.json',
  settings: 'settings.json',
};

const DEFAULTS = {
  reps: [],
  products: [],
  closes: [],
  setterLogs: [],
  targets: [],
  settings: {
    businessName: 'Man of War',
    eod: { enabled: false, time: '20:00', timezone: 'America/New_York', recipientEmail: '' },
  },
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePathFor(collection) {
  return path.join(DATA_DIR, FILES[collection]);
}

function readCollection(collection) {
  ensureDataDir();
  const fp = filePathFor(collection);
  if (!fs.existsSync(fp)) {
    const initial = DEFAULTS[collection];
    fs.writeFileSync(fp, JSON.stringify(initial, null, 2));
    return JSON.parse(JSON.stringify(initial));
  }
  const raw = fs.readFileSync(fp, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    // Corrupt file fallback - never crash the server over a bad write
    return JSON.parse(JSON.stringify(DEFAULTS[collection]));
  }
}

function writeCollection(collection, data) {
  ensureDataDir();
  const fp = filePathFor(collection);
  const tmp = fp + '.tmp';
  // Write to a temp file then rename, so a crash mid-write can't corrupt the real file.
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, fp);
}

function all(collection) {
  return readCollection(collection);
}

function getById(collection, id) {
  return readCollection(collection).find((item) => item.id === id) || null;
}

function insert(collection, record) {
  const list = readCollection(collection);
  const withId = { id: nanoid(10), createdAt: new Date().toISOString(), ...record };
  list.push(withId);
  writeCollection(collection, list);
  return withId;
}

function update(collection, id, patch) {
  const list = readCollection(collection);
  const idx = list.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch, id: list[idx].id };
  writeCollection(collection, list);
  return list[idx];
}

function remove(collection, id) {
  const list = readCollection(collection);
  const next = list.filter((item) => item.id !== id);
  writeCollection(collection, next);
  return next.length !== list.length;
}

function getSettings() {
  ensureDataDir();
  const fp = filePathFor('settings');
  if (!fs.existsSync(fp)) {
    fs.writeFileSync(fp, JSON.stringify(DEFAULTS.settings, null, 2));
    return JSON.parse(JSON.stringify(DEFAULTS.settings));
  }
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function updateSettings(patch) {
  const current = getSettings();
  const next = { ...current, ...patch };
  writeCollection('settings', next);
  return next;
}

module.exports = { all, getById, insert, update, remove, getSettings, updateSettings, DATA_DIR };
