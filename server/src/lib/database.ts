/**
 * SQLite database initializer for offline Desktop mode.
 *
 * Uses sql.js (pure-JS SQLite compiled from C via Emscripten) so no native
 * build tools are needed.  The DB file lives at %APPDATA%/ccms/ccms.db on
 * Windows and is created automatically on first launch.
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

let _db: SqlJsDatabase | null = null;

/** Resolve the data directory.  On Windows → %APPDATA%/ccms */
function getDataDir(): string {
  const base =
    process.env.APPDATA ||
    (process.platform === 'win32'
      ? path.join(os.homedir(), 'AppData', 'Roaming')
      : path.join(os.homedir(), '.config'));
  const dir = path.join(base, 'ccms');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Full path to the SQLite file. */
export function getDbPath(): string {
  return path.join(getDataDir(), 'ccms.db');
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const SCHEMA = `
-- tenant_config
CREATE TABLE IF NOT EXISTS tenant_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  activated_at TEXT,
  last_checked_at TEXT
);

-- users (mirrors auth.users in Supabase)
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  full_name     TEXT,
  role          TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  password_hash TEXT,                       -- bcrypt hash for local auth
  tenant_id     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  synced        INTEGER NOT NULL DEFAULT 0,
  synced_at     TEXT
);

-- devices
CREATE TABLE IF NOT EXISTS devices (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'pc' CHECK (type IN ('pc','console','vr','table')),
  status          TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','in_use','reserved','offline')),
  specs           TEXT,
  hourly_rate     REAL NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  hourly_rate_multi REAL NOT NULL DEFAULT 0 CHECK (hourly_rate_multi >= 0),
  archived        INTEGER NOT NULL DEFAULT 0,
  tenant_id       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  synced          INTEGER NOT NULL DEFAULT 0,
  synced_at       TEXT
);

-- customers
CREATE TABLE IF NOT EXISTS customers (
  id          TEXT PRIMARY KEY,
  username    TEXT UNIQUE,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  tenant_id   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  synced      INTEGER NOT NULL DEFAULT 0,
  synced_at   TEXT
);

-- sessions
CREATE TABLE IF NOT EXISTS sessions (
  id                    TEXT PRIMARY KEY,
  device_id             TEXT NOT NULL REFERENCES devices(id),
  customer_id           TEXT REFERENCES customers(id),
  started_at            TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at              TEXT,
  duration_minutes      INTEGER,
  total_cost            REAL,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  session_type          TEXT NOT NULL DEFAULT 'open' CHECK (session_type IN ('open','fixed')),
  play_mode             TEXT NOT NULL DEFAULT 'single' CHECK (play_mode IN ('single','multiplayer')),
  scheduled_end         TEXT,
  hourly_rate_override  REAL,
  grace_period_minutes  INTEGER NOT NULL DEFAULT 0,
  is_overtime           INTEGER NOT NULL DEFAULT 0,
  overtime_minutes      INTEGER,
  edited_start_at       INTEGER NOT NULL DEFAULT 0,
  created_by            TEXT REFERENCES users(id),
  tenant_id             TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  synced                INTEGER NOT NULL DEFAULT 0,
  synced_at             TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_device   ON sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_customer ON sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status   ON sessions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_one_active_per_device ON sessions(device_id) WHERE status = 'active';

-- invoices
CREATE TABLE IF NOT EXISTS invoices (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  amount          REAL NOT NULL CHECK (amount >= 0),
  paid            INTEGER NOT NULL DEFAULT 0,
  payment_method  TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash','card','transfer','wallet')),
  issued_at       TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at         TEXT,
  tenant_id       TEXT,
  synced          INTEGER NOT NULL DEFAULT 0,
  synced_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoices_session ON invoices(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_session_unique ON invoices(session_id);
CREATE INDEX IF NOT EXISTS idx_invoices_paid    ON invoices(paid);

-- reservations
CREATE TABLE IF NOT EXISTS reservations (
  id              TEXT PRIMARY KEY,
  device_id       TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  customer_id     TEXT REFERENCES customers(id),
  reserved_from   TEXT NOT NULL,
  reserved_until  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','cancelled','completed')),
  notes           TEXT,
  created_by      TEXT REFERENCES users(id),
  tenant_id       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  synced          INTEGER NOT NULL DEFAULT 0,
  synced_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_reservations_device ON reservations(device_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);

-- products (café menu items)
CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  price       REAL NOT NULL DEFAULT 0,
  tenant_id   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  synced      INTEGER NOT NULL DEFAULT 0,
  synced_at   TEXT
);

-- session_orders
CREATE TABLE IF NOT EXISTS session_orders (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES products(id),
  quantity    INTEGER NOT NULL DEFAULT 1,
  unit_price  REAL NOT NULL,
  total_price REAL NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  synced      INTEGER NOT NULL DEFAULT 0,
  synced_at   TEXT
);

-- session_audit_log
CREATE TABLE IF NOT EXISTS session_audit_log (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  edited_by     TEXT REFERENCES users(id),
  field_changed TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  edited_at     TEXT NOT NULL DEFAULT (datetime('now')),
  synced        INTEGER NOT NULL DEFAULT 0,
  synced_at     TEXT
);

-- sync_queue for tracking what needs to be pushed to Supabase
CREATE TABLE IF NOT EXISTS sync_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  operation   TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  payload     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  synced      INTEGER NOT NULL DEFAULT 0,
  error       TEXT
);
`;

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initDatabase(): Promise<SqlJsDatabase> {
  if (_db) return _db;

  const SQL = await initSqlJs();
  const dbPath = getDbPath();

  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
  }

  // WAL mode equivalent for sql.js (no-op but we enable foreign keys)
  _db.run('PRAGMA foreign_keys = ON;');
  _db.run('PRAGMA journal_mode = DELETE;');

  // Create all tables
  _db.run(SCHEMA);

  // Auto-migration helper for existing databases
  try {
    const usersInfo = _db.exec("PRAGMA table_info(users)");
    const columns = usersInfo[0]?.values.map(v => v[1] as string) || [];
    
    if (!columns.includes('tenant_id')) {
      console.log('[database] Running database migration: adding tenant_id columns...');
      _db.run('ALTER TABLE users ADD COLUMN tenant_id TEXT;');
      _db.run('ALTER TABLE devices ADD COLUMN tenant_id TEXT;');
      _db.run('ALTER TABLE customers ADD COLUMN tenant_id TEXT;');
      _db.run('ALTER TABLE sessions ADD COLUMN tenant_id TEXT;');
      _db.run('ALTER TABLE invoices ADD COLUMN tenant_id TEXT;');
      _db.run('ALTER TABLE reservations ADD COLUMN tenant_id TEXT;');
      _db.run('ALTER TABLE products ADD COLUMN tenant_id TEXT;');
      console.log('[database] Migration completed successfully.');
    }

    // Auto-assign any records with NULL tenant_id to the activated tenant_id
    const tenantStmt = _db.prepare('SELECT tenant_id FROM tenant_config LIMIT 1');
    if (tenantStmt.step()) {
      const activeTenantId = tenantStmt.getAsObject().tenant_id as string;
      if (activeTenantId) {
        _db.run('UPDATE users SET tenant_id = ? WHERE tenant_id IS NULL;', [activeTenantId]);
        _db.run('UPDATE devices SET tenant_id = ? WHERE tenant_id IS NULL;', [activeTenantId]);
        _db.run('UPDATE customers SET tenant_id = ? WHERE tenant_id IS NULL;', [activeTenantId]);
        _db.run('UPDATE sessions SET tenant_id = ? WHERE tenant_id IS NULL;', [activeTenantId]);
        _db.run('UPDATE invoices SET tenant_id = ? WHERE tenant_id IS NULL;', [activeTenantId]);
        _db.run('UPDATE reservations SET tenant_id = ? WHERE tenant_id IS NULL;', [activeTenantId]);
        _db.run('UPDATE products SET tenant_id = ? WHERE tenant_id IS NULL;', [activeTenantId]);
      }
    }
    tenantStmt.free();
  } catch (err: any) {
    console.error('[database] Auto-migration check failed:', err.message);
  }

  try {
    const devicesTableInfo = _db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='devices'");
    const createSql = (devicesTableInfo[0]?.values[0]?.[0] as string) || '';

    if (createSql && !createSql.includes("'table'")) {
      console.log('[database] Running database migration: updating devices.type CHECK constraint to include table...');
      _db.run(`
        CREATE TABLE devices_new (
          id              TEXT PRIMARY KEY,
          name            TEXT NOT NULL,
          type            TEXT NOT NULL DEFAULT 'pc' CHECK (type IN ('pc','console','vr','table')),
          status          TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','in_use','reserved','offline')),
          specs           TEXT,
          hourly_rate     REAL NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
          hourly_rate_multi REAL NOT NULL DEFAULT 0 CHECK (hourly_rate_multi >= 0),
          archived        INTEGER NOT NULL DEFAULT 0,
          tenant_id       TEXT,
          created_at      TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
          synced          INTEGER NOT NULL DEFAULT 0,
          synced_at       TEXT
        );
      `);
      _db.run('INSERT INTO devices_new SELECT * FROM devices;');
      _db.run('DROP TABLE devices;');
      _db.run('ALTER TABLE devices_new RENAME TO devices;');
      console.log('[database] Devices table migration completed successfully.');
    }
  } catch (err: any) {
    console.error('[database] Devices table migration failed:', err.message);
  }

  // Persist after schema creation and migrations
  saveDatabase();

  console.log(`[database] SQLite initialized → ${dbPath}`);
  return _db;
}

/** Get the database instance (must call initDatabase first). */
export function getDb(): SqlJsDatabase {
  if (!_db) throw new Error('Database not initialized. Call initDatabase() first.');
  return _db;
}

/** Persist the in-memory database to disk. */
export function saveDatabase(): void {
  if (!_db) return;
  const data = _db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(getDbPath(), buffer);
}

/**
 * Auto-save interval — writes the DB to disk every N ms.
 * sql.js works in-memory, so we need periodic saves.
 */
let _saveInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSave(intervalMs = 5000): void {
  if (_saveInterval) return;
  _saveInterval = setInterval(() => {
    saveDatabase();
  }, intervalMs);
}

export function stopAutoSave(): void {
  if (_saveInterval) {
    clearInterval(_saveInterval);
    _saveInterval = null;
  }
}
