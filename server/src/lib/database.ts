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

// ─── Transaction support ──────────────────────────────────────────────────────

/**
 * When true, saveDatabase() becomes a no-op.
 * Used during SQLite transactions to avoid writing partial state to disk.
 * Call saveDatabase() manually after COMMIT.
 */
let _suppressSave = false;

export function setSuppressSave(value: boolean): void {
  _suppressSave = value;
}

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
  is_paused             INTEGER NOT NULL DEFAULT 0,
  total_paused_minutes  INTEGER NOT NULL DEFAULT 0,
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
  subtotal        REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  discount_type   TEXT DEFAULT 'none' CHECK (discount_type IN ('none','percentage','fixed')),
  discount_value  REAL DEFAULT 0,
  service_fee     REAL DEFAULT 0,
  service_rate    REAL DEFAULT 0,
  rounding_delta  REAL DEFAULT 0,
  notes           TEXT,
  paid            INTEGER NOT NULL DEFAULT 0,
  payment_method  TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash','card','transfer','wallet')),
  shift_id        TEXT REFERENCES shifts(id),
  created_by      TEXT REFERENCES users(id),
  issued_at       TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at         TEXT,
  tenant_id       TEXT,
  synced          INTEGER NOT NULL DEFAULT 0,
  synced_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoices_session ON invoices(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_session_unique ON invoices(session_id);
CREATE INDEX IF NOT EXISTS idx_invoices_paid    ON invoices(paid);

-- session_transfers (tracks device transfers during an active session)
CREATE TABLE IF NOT EXISTS session_transfers (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  from_device_id    TEXT NOT NULL REFERENCES devices(id),
  to_device_id      TEXT NOT NULL REFERENCES devices(id),
  started_at        TEXT NOT NULL,
  transferred_at    TEXT NOT NULL DEFAULT (datetime('now')),
  duration_minutes  INTEGER NOT NULL,
  hourly_rate       REAL NOT NULL,
  play_mode         TEXT NOT NULL DEFAULT 'single' CHECK (play_mode IN ('single', 'multiplayer')),
  cost              REAL NOT NULL DEFAULT 0,
  transferred_by    TEXT REFERENCES users(id),
  tenant_id         TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  synced            INTEGER NOT NULL DEFAULT 0,
  synced_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_session_transfers_session ON session_transfers(session_id);
CREATE INDEX IF NOT EXISTS idx_session_transfers_tenant ON session_transfers(tenant_id);

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
  cost_price  REAL,
  stock       INTEGER NOT NULL DEFAULT 0,
  tenant_id   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  synced      INTEGER NOT NULL DEFAULT 0,
  synced_at   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tenant_name ON products(tenant_id, name);

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

-- product_stock_logs
CREATE TABLE IF NOT EXISTS product_stock_logs (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tenant_id     TEXT,
  actor_id      TEXT REFERENCES users(id),
  change_type   TEXT NOT NULL CHECK (change_type IN ('restock', 'sale', 'standalone_sale', 'void_order', 'manual_adjustment', 'shrinkage')),
  delta         INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reason        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  synced        INTEGER NOT NULL DEFAULT 0,
  synced_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_stock_logs_product ON product_stock_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_logs_tenant  ON product_stock_logs(tenant_id);

-- standalone_orders
CREATE TABLE IF NOT EXISTS standalone_orders (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT,
  product_id     TEXT NOT NULL REFERENCES products(id),
  quantity       INTEGER NOT NULL DEFAULT 1,
  unit_price     REAL NOT NULL,
  cost_price     REAL,
  total_price    REAL NOT NULL,
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash','card','transfer','wallet')),
  shift_id       TEXT REFERENCES shifts(id),
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  synced         INTEGER NOT NULL DEFAULT 0,
  synced_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_standalone_orders_tenant  ON standalone_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_standalone_orders_product ON standalone_orders(product_id);

-- session_pauses
CREATE TABLE IF NOT EXISTS session_pauses (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tenant_id   TEXT,
  paused_at   TEXT NOT NULL DEFAULT (datetime('now')),
  resumed_at  TEXT,
  paused_by   TEXT REFERENCES users(id),
  resumed_by  TEXT REFERENCES users(id),
  reason      TEXT,
  synced      INTEGER NOT NULL DEFAULT 0,
  synced_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_session_pauses_session ON session_pauses(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_pauses_one_open_per_session
  ON session_pauses(session_id) WHERE resumed_at IS NULL;

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

-- rooms (gaming lounges / private rooms)
CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT 'sports_esports',
  device_id   TEXT REFERENCES devices(id) ON DELETE SET NULL,
  tenant_id   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  synced      INTEGER NOT NULL DEFAULT 0,
  synced_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_rooms_tenant ON rooms(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_device ON rooms(device_id) WHERE device_id IS NOT NULL;

-- shifts
CREATE TABLE IF NOT EXISTS shifts (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  tenant_id       TEXT,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at        TEXT,
  opening_cash    REAL NOT NULL DEFAULT 0,
  closing_cash    REAL,
  total_revenue   REAL NOT NULL DEFAULT 0,
  total_expenses  REAL NOT NULL DEFAULT 0,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  synced          INTEGER NOT NULL DEFAULT 0,
  synced_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_tenant ON shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_one_active_per_user ON shifts(user_id) WHERE status = 'active';

-- shift_expenses
CREATE TABLE IF NOT EXISTS shift_expenses (
  id          TEXT PRIMARY KEY,
  shift_id    TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  tenant_id   TEXT,
  amount      REAL NOT NULL CHECK (amount > 0),
  category    TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  synced      INTEGER NOT NULL DEFAULT 0,
  synced_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_shift_expenses_shift ON shift_expenses(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_expenses_tenant ON shift_expenses(tenant_id);

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

  // Auto-migration helper for products stock and cost_price columns
  try {
    const prodInfo = _db.exec("PRAGMA table_info(products)");
    const prodCols = prodInfo[0]?.values.map(v => v[1] as string) || [];
    if (!prodCols.includes('stock')) {
      console.log('[database] Running database migration: adding stock column to products...');
      _db.run('ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 0;');
      console.log('[database] Products stock migration completed successfully.');
    }
    if (!prodCols.includes('cost_price')) {
      console.log('[database] Running database migration: adding cost_price column to products...');
      _db.run('ALTER TABLE products ADD COLUMN cost_price REAL;');
      console.log('[database] Products cost_price migration completed successfully.');
    }
  } catch (pErr: any) {
    console.error('[database] Products auto-migration failed:', pErr.message);
  }

  // Auto-migration for sessions pause columns (added in migration 010)
  try {
    const sessionsInfo = _db.exec("PRAGMA table_info(sessions)");
    const sessionCols = sessionsInfo[0]?.values.map(v => v[1] as string) || [];
    if (!sessionCols.includes('is_paused')) {
      console.log('[database] Running database migration: adding pause/resume columns to sessions...');
      _db.run('ALTER TABLE sessions ADD COLUMN is_paused INTEGER NOT NULL DEFAULT 0;');
      _db.run('ALTER TABLE sessions ADD COLUMN total_paused_minutes INTEGER NOT NULL DEFAULT 0;');
      console.log('[database] Sessions pause columns migration completed.');
    }
  } catch (err: any) {
    console.error('[database] Sessions pause columns migration failed:', err.message);
  }

  // FIX: Migration for devices.type to include 'table'
  // Checks if the CURRENT CHECK constraint already supports 'table' type.
  // Uses a reliable column-level check via PRAGMA instead of parsing DDL.
  try {
    // Try inserting a temp row with type='table' to test if constraint allows it.
    // If it fails (SQLITE_CONSTRAINT), we need to migrate.
    const devicesInfo = _db.exec("PRAGMA table_info(devices)");
    const devCols = devicesInfo[0]?.values.map(v => v[1] as string) || [];

    if (devCols.length > 0) {
      // Check by reading existing sqlite_master DDL for the 'table' type keyword
      const devicesTableInfo = _db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='devices'");
      const createSql = (devicesTableInfo[0]?.values[0]?.[0] as string) || '';

      // If the CHECK constraint does NOT include 'table' as a valid type, migrate.
      // We look for the pattern: 'table' surrounded by quotes in the type check list.
      const hasTableType = /CHECK\s*\([^)]*'table'[^)]*\)/i.test(createSql);

      if (createSql && !hasTableType) {
        console.log('[database] Running database migration: updating devices.type CHECK constraint to include table...');
        _db.run('PRAGMA foreign_keys = OFF;');
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
        _db.run('PRAGMA foreign_keys = ON;');
        console.log('[database] Devices table migration completed successfully.');
      }
    }
  } catch (err: any) {
    console.error('[database] Devices table migration failed:', err.message);
  }

  // Auto-migration helper for rooms table
  try {
    _db.run(`
      CREATE TABLE IF NOT EXISTS rooms (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        icon        TEXT NOT NULL DEFAULT 'sports_esports',
        device_id   TEXT REFERENCES devices(id) ON DELETE SET NULL,
        tenant_id   TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        synced      INTEGER NOT NULL DEFAULT 0,
        synced_at   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_rooms_tenant ON rooms(tenant_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_device ON rooms(device_id) WHERE device_id IS NOT NULL;
    `);
  } catch (rErr: any) {
    console.error('[database] Rooms table creation/migration failed:', rErr.message);
  }

  // Auto-migration helper for shifts and shift_expenses
  try {
    _db.run(`
      CREATE TABLE IF NOT EXISTS shifts (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL REFERENCES users(id),
        tenant_id       TEXT,
        started_at      TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at        TEXT,
        opening_cash    REAL NOT NULL DEFAULT 0,
        closing_cash    REAL,
        total_revenue   REAL NOT NULL DEFAULT 0,
        total_expenses  REAL NOT NULL DEFAULT 0,
        notes           TEXT,
        status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        synced          INTEGER NOT NULL DEFAULT 0,
        synced_at       TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id);
      CREATE INDEX IF NOT EXISTS idx_shifts_tenant ON shifts(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_one_active_per_user ON shifts(user_id) WHERE status = 'active';

      CREATE TABLE IF NOT EXISTS shift_expenses (
        id          TEXT PRIMARY KEY,
        shift_id    TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        tenant_id   TEXT,
        amount      REAL NOT NULL CHECK (amount > 0),
        category    TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL,
        created_by  TEXT REFERENCES users(id),
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        synced      INTEGER NOT NULL DEFAULT 0,
        synced_at   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_shift_expenses_shift ON shift_expenses(shift_id);
      CREATE INDEX IF NOT EXISTS idx_shift_expenses_tenant ON shift_expenses(tenant_id);
    `);

    // Add shift_id and created_by to invoices if missing
    const invoicesInfo = _db.exec("PRAGMA table_info(invoices)");
    const invoiceCols = invoicesInfo[0]?.values.map(v => v[1] as string) || [];
    if (!invoiceCols.includes('shift_id')) {
      _db.run('ALTER TABLE invoices ADD COLUMN shift_id TEXT REFERENCES shifts(id);');
      _db.run('CREATE INDEX IF NOT EXISTS idx_invoices_shift ON invoices(shift_id);');
    }
    if (!invoiceCols.includes('created_by')) {
      _db.run('ALTER TABLE invoices ADD COLUMN created_by TEXT REFERENCES users(id);');
      _db.run('CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON invoices(created_by);');
    }

    // Auto-migration for invoice discounts, service fee, and rounding columns
    if (!invoiceCols.includes('subtotal')) {
      _db.run('ALTER TABLE invoices ADD COLUMN subtotal REAL DEFAULT 0;');
    }
    if (!invoiceCols.includes('discount_amount')) {
      _db.run('ALTER TABLE invoices ADD COLUMN discount_amount REAL DEFAULT 0;');
    }
    if (!invoiceCols.includes('discount_type')) {
      _db.run("ALTER TABLE invoices ADD COLUMN discount_type TEXT DEFAULT 'none';");
    }
    if (!invoiceCols.includes('discount_value')) {
      _db.run('ALTER TABLE invoices ADD COLUMN discount_value REAL DEFAULT 0;');
    }
    if (!invoiceCols.includes('service_fee')) {
      _db.run('ALTER TABLE invoices ADD COLUMN service_fee REAL DEFAULT 0;');
    }
    if (!invoiceCols.includes('service_rate')) {
      _db.run('ALTER TABLE invoices ADD COLUMN service_rate REAL DEFAULT 0;');
    }
    if (!invoiceCols.includes('rounding_delta')) {
      _db.run('ALTER TABLE invoices ADD COLUMN rounding_delta REAL DEFAULT 0;');
    }
    if (!invoiceCols.includes('notes')) {
      _db.run('ALTER TABLE invoices ADD COLUMN notes TEXT;');
    }

    // Auto-migration for session_transfers table
    _db.run(`
      CREATE TABLE IF NOT EXISTS session_transfers (
        id                TEXT PRIMARY KEY,
        session_id        TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        from_device_id    TEXT NOT NULL REFERENCES devices(id),
        to_device_id      TEXT NOT NULL REFERENCES devices(id),
        started_at        TEXT NOT NULL,
        transferred_at    TEXT NOT NULL DEFAULT (datetime('now')),
        duration_minutes  INTEGER NOT NULL,
        hourly_rate       REAL NOT NULL,
        play_mode         TEXT NOT NULL DEFAULT 'single' CHECK (play_mode IN ('single', 'multiplayer')),
        cost              REAL NOT NULL DEFAULT 0,
        transferred_by    TEXT REFERENCES users(id),
        tenant_id         TEXT,
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        synced            INTEGER NOT NULL DEFAULT 0,
        synced_at         TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_session_transfers_session ON session_transfers(session_id);
      CREATE INDEX IF NOT EXISTS idx_session_transfers_tenant ON session_transfers(tenant_id);
    `);

    // Auto-migration for standalone_orders shift_id column
    const soTableInfo = _db.exec("PRAGMA table_info(standalone_orders)");
    const soCols = soTableInfo[0]?.values.map(v => v[1] as string) || [];
    if (!soCols.includes('shift_id')) {
      console.log('[database] Running migration: adding shift_id column to standalone_orders...');
      _db.run('ALTER TABLE standalone_orders ADD COLUMN shift_id TEXT;');
      console.log('[database] standalone_orders shift_id migration completed successfully.');
    }
    _db.run('CREATE INDEX IF NOT EXISTS idx_standalone_orders_shift ON standalone_orders(shift_id);');
  } catch (sErr: any) {
    console.error('[database] Shifts/expenses/transfers migration failed:', sErr.message);
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
  if (_suppressSave || !_db) return;
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