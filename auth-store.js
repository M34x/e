const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const STORE_PATH = process.env.MARGIN_DATA_PATH || path.join(__dirname, '.data', 'accounts.json');
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
let store;

function loadStore() {
  if (store) return store;
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    store = parsed && Array.isArray(parsed.users) && Array.isArray(parsed.sessions) && parsed.notebooks ? parsed : { users: [], sessions: [], notebooks: {} };
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    store = { users: [], sessions: [], notebooks: {} };
  }
  return store;
}

function saveStore() {
  const data = loadStore();
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true, mode: 0o700 });
  const temporary = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(temporary, STORE_PATH);
  try { fs.chmodSync(STORE_PATH, 0o600); } catch {}
}

function publicUser(user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

async function makePasswordHash(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, n, r, p, saltHex, digestHex] = String(encoded).split('$');
  if (algorithm !== 'scrypt' || !/^\d+$/.test(n) || !/^\d+$/.test(r) || !/^\d+$/.test(p) || !/^[a-f0-9]{32}$/.test(saltHex) || !/^[a-f0-9]{128}$/.test(digestHex)) return false;
  try {
    const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), 64, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    return crypto.timingSafeEqual(derived, Buffer.from(digestHex, 'hex'));
  } catch { return false; }
}

function newSession(userId) {
  const data = loadStore();
  const token = crypto.randomBytes(32).toString('base64url');
  const createdAt = Date.now();
  data.sessions = data.sessions.filter(session => session.expiresAt > createdAt);
  data.sessions.push({ tokenHash: crypto.createHash('sha256').update(token).digest('hex'), userId, createdAt, expiresAt: createdAt + SESSION_MS });
  saveStore();
  return { token, user: publicUser(data.users.find(user => user.id === userId)), expiresAt: createdAt + SESSION_MS };
}

function userForToken(token) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 100) return null;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const data = loadStore();
  const session = data.sessions.find(item => item.tokenHash === hash && item.expiresAt > Date.now());
  if (!session) return null;
  const user = data.users.find(item => item.id === session.userId);
  return user ? { user: publicUser(user), session } : null;
}

function logoutToken(token) {
  if (!token) return;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const data = loadStore();
  const before = data.sessions.length;
  data.sessions = data.sessions.filter(session => session.tokenHash !== hash);
  if (data.sessions.length !== before) saveStore();
}

async function signUp(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw Object.assign(new Error('Enter a valid email address.'), { statusCode: 400 });
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw Object.assign(new Error('Use a password between 12 and 128 characters.'), { statusCode: 400 });
  const data = loadStore();
  if (data.users.some(user => user.email === normalizedEmail)) throw Object.assign(new Error('An account with that email already exists. Try signing in.'), { statusCode: 409 });
  const user = { id: crypto.randomUUID(), email: normalizedEmail, passwordHash: await makePasswordHash(password), createdAt: new Date().toISOString() };
  data.users.push(user);
  data.notebooks[user.id] = [];
  saveStore();
  return newSession(user.id);
}

async function signIn(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = loadStore().users.find(item => item.email === normalizedEmail);
  const valid = user && typeof password === 'string' && password.length <= 128 && await verifyPassword(password, user.passwordHash);
  if (!valid) throw Object.assign(new Error('Email or password is incorrect.'), { statusCode: 401 });
  return newSession(user.id);
}

function getNotebooks(userId) {
  return loadStore().notebooks[userId] || [];
}

function putNotebooks(userId, notebooks) {
  if (!Array.isArray(notebooks) || notebooks.length > 200) throw Object.assign(new Error('Send up to 200 notebooks.'), { statusCode: 400 });
  const serialized = JSON.stringify(notebooks);
  if (Buffer.byteLength(serialized, 'utf8') > 24_000_000) throw Object.assign(new Error('Notebook sync is limited to 24 MB.'), { statusCode: 413 });
  if (notebooks.some(book => !book || typeof book !== 'object' || typeof book.id !== 'string' || !Array.isArray(book.nodes))) throw Object.assign(new Error('Notebook data is invalid.'), { statusCode: 400 });
  const data = loadStore();
  if (!data.users.some(user => user.id === userId)) throw Object.assign(new Error('Account not found.'), { statusCode: 401 });
  data.notebooks[userId] = notebooks;
  saveStore();
  return { count: notebooks.length, updatedAt: new Date().toISOString() };
}

module.exports = { loadStore, signUp, signIn, userForToken, logoutToken, getNotebooks, putNotebooks };
