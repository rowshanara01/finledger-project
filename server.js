import crypto from 'crypto';
import dns from 'dns/promises';
import express from 'express';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.VERCEL && fs.existsSync(path.resolve(__dirname, '.env'))) {
  const envLines = fs.readFileSync(path.resolve(__dirname, '.env'), 'utf8').split(/\r?\n/);
  for (const line of envLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

export const app = express();
app.use(express.json({ limit: '1mb' }));

// PostgreSQL pool (automatically active when DATABASE_URL is set, e.g. Neon / Supabase)
let pgPool = null;
if (process.env.DATABASE_URL) {
  const { Pool } = await import('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost')
      ? false
      : { rejectUnauthorized: false },
  });
}

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(err);
    res.status(500).json({ error: err?.message || 'Internal server error' });
  });

const AUTH_SECRET =
  process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const usersStore = [];

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expectedHex] = String(stored || '').split(':');
  if (!salt || !expectedHex) return false;
  const actualBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

function signSessionToken(user) {
  const headerPart = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' })
  ).toString('base64url');
  const payloadPart = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: user.role,
      exp: Date.now() + TOKEN_TTL_MS,
    })
  ).toString('base64url');
  const data = `${headerPart}.${payloadPart}`;
  const sig = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

function verifySessionToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(`${headerPart}.${payloadPart}`)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payloadPart, 'base64url').toString('utf8')
    );
    if (!parsed.sub || !parsed.exp || Date.now() > parsed.exp) return null;
    return { sub: parsed.sub, exp: parsed.exp };
  } catch {
    return null;
  }
}

function sanitizeUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    createdAtMs: Number(u.createdAtMs || u.created_at_ms || Date.now()),
  };
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function ensureUsersTable() {
  if (!pgPool) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at_ms BIGINT NOT NULL
    );
  `);
}

async function findUserById(id) {
  if (pgPool) {
    await ensureUsersTable();
    const res = await pgPool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      passwordHash: r.password_hash,
      role: r.role,
      createdAtMs: Number(r.created_at_ms),
    };
  }
  return usersStore.find((u) => u.id === id) || null;
}

async function findUserByEmail(email) {
  if (pgPool) {
    await ensureUsersTable();
    const res = await pgPool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      passwordHash: r.password_hash,
      role: r.role,
      createdAtMs: Number(r.created_at_ms),
    };
  }
  return usersStore.find((u) => u.email === email) || null;
}

async function countUsers() {
  if (pgPool) {
    await ensureUsersTable();
    const res = await pgPool.query('SELECT COUNT(*)::int AS cnt FROM users');
    return res.rows[0].cnt;
  }
  return usersStore.length;
}

const requireAuth = asyncHandler(async (req, res, next) => {
  const authHeader = String(req.headers.authorization || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const verified = verifySessionToken(match[1]);
  if (!verified) {
    res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
    return;
  }
  const user = await findUserById(verified.sub);
  if (!user) {
    res.status(401).json({ error: 'User account not found.' });
    return;
  }
  req.user = user;
  next();
});

function requireRoles(allowed) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) {
      res.status(403).json({
        error: `Forbidden: role "${role || 'unknown'}" is not permitted to perform this action.`,
      });
      return;
    }
    next();
  };
}

app.get('/api/auth/status', asyncHandler(async (_req, res) => {
  const totalUsers = await countUsers();
  res.json({ needsSetup: totalUsers === 0, totalUsers });
}));

app.post('/api/auth/setup', asyncHandler(async (req, res) => {
  const totalUsers = await countUsers();
  if (totalUsers > 0) {
    res.status(409).json({ error: 'Workspace admin already configured. Please sign in.' });
    return;
  }
  const { name, email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();
  const cleanPass = String(password || '');

  if (!cleanName || !validateEmail(cleanEmail) || cleanPass.length < 6) {
    res.status(400).json({
      error: 'Valid name, email, and password (min 6 characters) are required.',
    });
    return;
  }

  const admin = {
    id: `usr-${crypto.randomUUID()}`,
    name: cleanName,
    email: cleanEmail,
    passwordHash: hashPassword(cleanPass),
    role: 'admin',
    createdAtMs: Date.now(),
  };

  if (pgPool) {
    await ensureUsersTable();
    await pgPool.query(
      'INSERT INTO users (id, name, email, password_hash, role, created_at_ms) VALUES ($1,$2,$3,$4,$5,$6)',
      [admin.id, admin.name, admin.email, admin.passwordHash, admin.role, admin.createdAtMs]
    );
  } else {
    usersStore.push(admin);
  }

  res.status(201).json({ token: signSessionToken(admin), user: sanitizeUser(admin) });
}));

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const { name, email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();
  const cleanPass = String(password || '');

  if (!cleanName || !validateEmail(cleanEmail) || cleanPass.length < 6) {
    res.status(400).json({
      error: 'Valid name, email, and password (min 6 characters) are required.',
    });
    return;
  }
  const existing = await findUserByEmail(cleanEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const totalUsers = await countUsers();
  const created = {
    id: `usr-${crypto.randomUUID()}`,
    name: cleanName,
    email: cleanEmail,
    passwordHash: hashPassword(cleanPass),
    role: totalUsers === 0 ? 'admin' : 'viewer',
    createdAtMs: Date.now(),
  };

  if (pgPool) {
    await ensureUsersTable();
    await pgPool.query(
      'INSERT INTO users (id, name, email, password_hash, role, created_at_ms) VALUES ($1,$2,$3,$4,$5,$6)',
      [created.id, created.name, created.email, created.passwordHash, created.role, created.createdAtMs]
    );
  } else {
    usersStore.push(created);
  }

  res.status(201).json({ token: signSessionToken(created), user: sanitizeUser(created) });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPass = String(password || '');
  const user = await findUserByEmail(cleanEmail);
  if (!user || !verifyPassword(cleanPass, user.passwordHash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  res.json({ token: signSessionToken(user), user: sanitizeUser(user) });
}));

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

const LEDGER_CATEGORIES = ['Cloud Infra', 'SaaS Tools', 'Payroll', 'Marketing', 'Travel'];

const INITIAL_LEDGER_TEMPLATE = [
  { id: 'TX-101', merchant: 'AWS EC2 Production', category: 'Cloud Infra', amount: 420, date: '2026-11-01', paymentMethod: 'Card', notes: 'Monthly compute' },
  { id: 'TX-102', merchant: 'AWS RDS Postgres', category: 'Cloud Infra', amount: 390, date: '2026-11-04', paymentMethod: 'Card', notes: 'Primary DB' },
  { id: 'TX-103', merchant: 'Cloudflare, Inc.', category: 'Cloud Infra', amount: 450, date: '2026-11-08', paymentMethod: 'Card', notes: 'DNS & CDN' },
  { id: 'TX-104', merchant: 'AWS Uncapped Egress Spike', category: 'Cloud Infra', amount: 2480, date: '2026-11-12', paymentMethod: 'Card', notes: 'Unexpected transfer spike' },
  { id: 'TX-105', merchant: 'Figma Organization', category: 'SaaS Tools', amount: 180, date: '2026-11-03', paymentMethod: 'Card', notes: 'Design seats' },
  { id: 'TX-106', merchant: 'GitHub Enterprise', category: 'SaaS Tools', amount: 210, date: '2026-11-06', paymentMethod: 'Card', notes: 'Repo CI/CD' },
  { id: 'TX-107', merchant: 'Linear Workspace', category: 'SaaS Tools', amount: 160, date: '2026-11-11', paymentMethod: 'Card', notes: 'Issue tracker' },
  { id: 'TX-108', merchant: 'Sentry Team Plan', category: 'SaaS Tools', amount: 195, date: '2026-11-15', paymentMethod: 'Card', notes: 'Error monitoring' },
  { id: 'TX-109', merchant: 'Contractor Sprint Payout', category: 'Payroll', amount: 3200, date: '2026-11-05', paymentMethod: 'Bank', notes: 'Sprint 14' },
  { id: 'TX-110', merchant: 'Design Retainer', category: 'Payroll', amount: 2950, date: '2026-11-14', paymentMethod: 'Bank', notes: 'Monthly retainer' },
  { id: 'TX-111', merchant: 'LinkedIn Job Boost', category: 'Marketing', amount: 340, date: '2026-11-09', paymentMethod: 'Card', notes: 'Hiring campaign' },
  { id: 'TX-112', merchant: 'Conference Flight', category: 'Travel', amount: 610, date: '2026-11-16', paymentMethod: 'Card', notes: 'Engineering summit' },
];

const ledgerByUser = new Map();
let dbInitialized = false;

async function ensureDb() {
  if (!pgPool || dbInitialized) return;
  await ensureUsersTable();
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ledger_transactions (
      seq BIGSERIAL PRIMARY KEY,
      id TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT '',
      merchant TEXT NOT NULL,
      category TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      date TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'Card',
      notes TEXT NOT NULL DEFAULT ''
    );
    ALTER TABLE ledger_transactions ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
    ALTER TABLE ledger_transactions ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'Card';
    ALTER TABLE ledger_transactions ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
    ALTER TABLE ledger_transactions ALTER COLUMN amount TYPE DOUBLE PRECISION;
    CREATE TABLE IF NOT EXISTS ledger_user_init (
      user_id TEXT PRIMARY KEY
    );
  `);
  dbInitialized = true;
}

async function ensureUserSeeded(userId) {
  if (!pgPool) {
    if (!ledgerByUser.has(userId)) {
      ledgerByUser.set(userId, INITIAL_LEDGER_TEMPLATE.map((r) => ({ ...r, userId })));
    }
    return;
  }
  await ensureDb();
  const initRes = await pgPool.query('SELECT 1 FROM ledger_user_init WHERE user_id = $1', [userId]);
  if (initRes.rowCount === 0) {
    await pgPool.query('INSERT INTO ledger_user_init (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    for (const r of INITIAL_LEDGER_TEMPLATE) {
      await pgPool.query(
        'INSERT INTO ledger_transactions (id, user_id, merchant, category, amount, date, payment_method, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [r.id, userId, r.merchant, r.category, r.amount, r.date, r.paymentMethod, r.notes]
      );
    }
  }
}

async function loadLedgerRows(userId) {
  await ensureUserSeeded(userId);
  if (!pgPool) return ledgerByUser.get(userId) || [];
  const res = await pgPool.query(
    'SELECT id, user_id AS "userId", merchant, category, amount, date, payment_method AS "paymentMethod", notes FROM ledger_transactions WHERE user_id = $1 ORDER BY seq DESC',
    [userId]
  );
  return res.rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

function analyzeLedger(rows) {
  const sums = {};
  const counts = {};
  for (const row of rows) {
    sums[row.category] = (sums[row.category] ?? 0) + row.amount;
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  }

  const means = {};
  for (const cat of LEDGER_CATEGORIES) {
    means[cat] = counts[cat] ? sums[cat] / counts[cat] : 0;
  }

  const sqDiffs = {};
  for (const row of rows) {
    const diff = row.amount - means[row.category];
    sqDiffs[row.category] = (sqDiffs[row.category] ?? 0) + diff * diff;
  }

  const stdDevs = {};
  for (const cat of LEDGER_CATEGORIES) {
    stdDevs[cat] = counts[cat] > 1 ? Math.sqrt(sqDiffs[cat] / counts[cat]) : 0;
  }

  const enriched = rows.map((row) => {
    const sd = stdDevs[row.category];
    const z = sd > 0 ? (row.amount - means[row.category]) / sd : 0;
    return { ...row, zScore: z, isAnomaly: z >= 1.5 };
  });

  const totalSpend = rows.reduce((acc, r) => acc + r.amount, 0);
  const anomalyCount = enriched.filter((r) => r.isAnomaly).length;
  const categoryTotals = LEDGER_CATEGORIES.map((cat) => ({
    category: cat,
    total: sums[cat] ?? 0,
  }));
  const maxCatTotal = Math.max(1, ...categoryTotals.map((c) => c.total));

  return { enriched, totalSpend, anomalyCount, categoryTotals, maxCatTotal };
}

function escapeCsvField(val) {
  let str = String(val);
  if (/^[=+@\t\r]/.test(str) || /^-(?![0-9])/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function filterLedger(enriched, category, anomaliesOnly, search) {
  const q = search.trim().toLowerCase();
  return enriched.filter((row) => {
    if (category !== 'ALL' && row.category !== category) return false;
    if (anomaliesOnly && !row.isAnomaly) return false;
    if (
      q &&
      !row.merchant.toLowerCase().includes(q) &&
      !row.id.toLowerCase().includes(q) &&
      !String(row.notes || '').toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });
}

app.get('/api/health', asyncHandler(async (_req, res) => {
  if (pgPool) {
    await ensureDb();
    await pgPool.query('SELECT 1');
  }
  res.json({ ok: true, database: pgPool ? 'postgresql' : 'in-memory', auth: 'hmac-scrypt' });
}));

app.get('/api/finledger/transactions', requireAuth, asyncHandler(async (req, res) => {
  const t0 = performance.now();
  const userId = req.user.id;
  const category = String(req.query.category || 'ALL');
  const anomaliesOnly = req.query.anomaliesOnly === 'true';
  const search = String(req.query.search || '');
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 15));

  const rowsAll = await loadLedgerRows(userId);
  const analyzed = analyzeLedger(rowsAll);
  const filtered = filterLedger(analyzed.enriched, category, anomaliesOnly, search);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  res.json({
    rows,
    totalRows: rowsAll.length,
    filteredCount: filtered.length,
    page: safePage,
    totalPages,
    totalSpend: analyzed.totalSpend,
    anomalyCount: analyzed.anomalyCount,
    categoryTotals: analyzed.categoryTotals,
    maxCatTotal: analyzed.maxCatTotal,
    serverLatencyMs: Number((performance.now() - t0).toFixed(2)),
  });
}));

app.post('/api/finledger/transactions', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  await ensureUserSeeded(userId);
  const { merchant, category, amount, date, paymentMethod, notes } = req.body || {};
  const numAmount = Number(amount);
  if (!merchant || !String(merchant).trim() || Number.isNaN(numAmount) || numAmount <= 0) {
    res.status(400).json({ error: 'Valid merchant and positive amount required.' });
    return;
  }

  const cat = LEDGER_CATEGORIES.includes(category) ? category : 'Cloud Infra';
  const cleanDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  const row = {
    id: `TX-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    userId,
    merchant: String(merchant).trim(),
    category: cat,
    amount: Math.round(numAmount * 100) / 100,
    date: cleanDate,
    paymentMethod: String(paymentMethod || 'Card').trim().slice(0, 24),
    notes: String(notes || '').trim().slice(0, 140),
  };

  if (pgPool) {
    await pgPool.query(
      'INSERT INTO ledger_transactions (id, user_id, merchant, category, amount, date, payment_method, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [row.id, userId, row.merchant, row.category, row.amount, row.date, row.paymentMethod, row.notes]
    );
  } else {
    ledgerByUser.set(userId, [row, ...(ledgerByUser.get(userId) || [])]);
  }
  res.status(201).json({ row });
}));

app.put('/api/finledger/transactions/:id', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { merchant, category, amount, date, paymentMethod, notes } = req.body || {};
  const numAmount = Number(amount);
  if (!merchant || !String(merchant).trim() || Number.isNaN(numAmount) || numAmount <= 0) {
    res.status(400).json({ error: 'Valid merchant and positive amount required.' });
    return;
  }
  const cat = LEDGER_CATEGORIES.includes(category) ? category : 'Cloud Infra';
  const rounded = Math.round(numAmount * 100) / 100;
  const pm = String(paymentMethod || 'Card').trim().slice(0, 24);
  const cleanNotes = String(notes || '').trim().slice(0, 140);

  if (pgPool) {
    await ensureDb();
    const upd = await pgPool.query(
      'UPDATE ledger_transactions SET merchant=$1, category=$2, amount=$3, date=COALESCE(NULLIF($4, \'\'), date), payment_method=$5, notes=$6 WHERE id=$7 AND user_id=$8 RETURNING id, user_id AS "userId", merchant, category, amount, date, payment_method AS "paymentMethod", notes',
      [String(merchant).trim(), cat, rounded, date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '', pm, cleanNotes, id, userId]
    );
    if (!upd.rows[0]) {
      res.status(404).json({ error: 'Transaction not found.' });
      return;
    }
    res.json({ row: { ...upd.rows[0], amount: Number(upd.rows[0].amount) } });
    return;
  }

  const current = ledgerByUser.get(userId) || [];
  const idx = current.findIndex((r) => r.id === id && r.userId === userId);
  if (idx === -1) {
    res.status(404).json({ error: 'Transaction not found.' });
    return;
  }
  const updated = {
    ...current[idx],
    merchant: String(merchant).trim(),
    category: cat,
    amount: rounded,
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : current[idx].date,
    paymentMethod: pm,
    notes: cleanNotes,
  };
  const next = [...current];
  next[idx] = updated;
  ledgerByUser.set(userId, next);
  res.json({ row: updated });
}));

app.delete('/api/finledger/transactions/:id', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  if (pgPool) {
    await ensureDb();
    const del = await pgPool.query('DELETE FROM ledger_transactions WHERE id = $1 AND user_id = $2', [id, userId]);
    if (del.rowCount === 0) {
      res.status(404).json({ error: 'Transaction not found.' });
      return;
    }
    res.json({ deleted: id });
    return;
  }
  const current = ledgerByUser.get(userId) || [];
  const next = current.filter((r) => !(r.id === id && r.userId === userId));
  if (next.length === current.length) {
    res.status(404).json({ error: 'Transaction not found.' });
    return;
  }
  ledgerByUser.set(userId, next);
  res.json({ deleted: id });
}));

app.delete('/api/finledger/transactions', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  await ensureUserSeeded(userId);
  if (pgPool) {
    await pgPool.query('DELETE FROM ledger_transactions WHERE user_id = $1', [userId]);
  } else {
    ledgerByUser.set(userId, []);
  }
  res.json({ cleared: true });
}));

app.post('/api/finledger/stress-test', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  await ensureUserSeeded(userId);
  const merchants = [
    'AWS EC2 Worker',
    'Vercel Bandwidth',
    'Datadog Ingestion',
    'Stripe Fee',
    'Cloud Workspace',
    'Cloudflare, Inc.',
  ];
  const generated = Array.from({ length: 2500 }, (_, i) => {
    const cat = LEDGER_CATEGORIES[i % LEDGER_CATEGORIES.length];
    const base = cat === 'Payroll' ? 2800 : 280;
    const isSpike = i % 190 === 0;
    const amount = isSpike ? base * 6 : Math.round(base + ((i * 37) % 240));
    return {
      id: `TX-${1000 + i}`,
      userId,
      merchant: `${merchants[i % merchants.length]} #${i + 1}`,
      category: cat,
      amount,
      date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
      paymentMethod: i % 3 === 0 ? 'Bank' : 'Card',
      notes: 'Benchmark stress record',
    };
  });

  const all = [...INITIAL_LEDGER_TEMPLATE.map((r) => ({ ...r, userId })), ...generated];

  if (pgPool) {
    await pgPool.query('DELETE FROM ledger_transactions WHERE user_id = $1', [userId]);
    await pgPool.query(
      'INSERT INTO ledger_transactions (id, user_id, merchant, category, amount, date, payment_method, notes) SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::double precision[], $6::text[], $7::text[], $8::text[])',
      [
        all.map((r) => r.id),
        all.map((r) => r.userId),
        all.map((r) => r.merchant),
        all.map((r) => r.category),
        all.map((r) => r.amount),
        all.map((r) => r.date),
        all.map((r) => r.paymentMethod),
        all.map((r) => r.notes),
      ]
    );
    res.json({ totalRows: all.length });
    return;
  }

  ledgerByUser.set(userId, all);
  res.json({ totalRows: all.length });
}));

app.get('/api/finledger/export.csv', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const category = String(req.query.category || 'ALL');
  const anomaliesOnly = req.query.anomaliesOnly === 'true';
  const search = String(req.query.search || '');

  const rowsAll = await loadLedgerRows(userId);
  const analyzed = analyzeLedger(rowsAll);
  const filtered = filterLedger(analyzed.enriched, category, anomaliesOnly, search);

  const headerRow = ['ID', 'Merchant', 'Category', 'Amount', 'Date', 'PaymentMethod', 'Notes', 'Z_Score', 'Anomaly'];
  const lines = [
    headerRow.join(','),
    ...filtered.map((r) =>
      [
        escapeCsvField(r.id),
        escapeCsvField(r.merchant),
        escapeCsvField(r.category),
        escapeCsvField(r.amount),
        escapeCsvField(r.date),
        escapeCsvField(r.paymentMethod),
        escapeCsvField(r.notes || ''),
        escapeCsvField(r.zScore.toFixed(2)),
        escapeCsvField(r.isAnomaly ? 'YES' : 'NO'),
      ].join(',')
    ),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="finledger-analytics.csv"');
  res.send(lines.join('\n'));
}));

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  void startServer();
}
