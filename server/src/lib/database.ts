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
  plan TEXT NOT NULL DEFAULT 'monthly_full',
  expires_at TEXT,
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

-- cafe_tables (dedicated café tables)
CREATE TABLE IF NOT EXISTS cafe_tables (
  id           TEXT PRIMARY KEY,
  table_number TEXT NOT NULL,
  name         TEXT NOT NULL,
  capacity     INTEGER NOT NULL DEFAULT 4,
  device_id    TEXT REFERENCES devices(id) ON DELETE SET NULL,
  tenant_id    TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  synced       INTEGER NOT NULL DEFAULT 0,
  synced_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_cafe_tables_tenant ON cafe_tables(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cafe_tables_tenant_number ON cafe_tables(tenant_id, table_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cafe_tables_device ON cafe_tables(device_id) WHERE device_id IS NOT NULL;

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

-- sync_state for tracking incremental sync timestamps per table and tenant
CREATE TABLE IF NOT EXISTS sync_state (
  table_name     TEXT NOT NULL,
  tenant_id      TEXT NOT NULL,
  last_synced_at TEXT NOT NULL,
  PRIMARY KEY (table_name, tenant_id)
);
`;

/**
 * Safely executes a schema script statement-by-statement.
 * If an individual UNIQUE index or constraint fails due to existing historical data conflicts
 * (common in large, long-lived client databases), it logs a warning, falls back to a non-unique
 * index where applicable, and ensures the server continues booting up successfully.
 */
function executeSchemaSafe(db: SqlJsDatabase, schemaSql: string): void {
  const cleanSql = schemaSql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');

  const statements = cleanSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      db.run(stmt);
    } catch (err: any) {
      const isUniqueIndex = /CREATE\s+UNIQUE\s+INDEX/i.test(stmt);
      if (isUniqueIndex) {
        console.warn(`[database] Unique index skipped due to historical data conflict (${err?.message || err}): ${stmt.slice(0, 80)}`);
        try {
          const fallbackStmt = stmt.replace(/CREATE\s+UNIQUE\s+INDEX/i, 'CREATE INDEX');
          db.run(fallbackStmt);
        } catch (fbErr: any) {
          console.warn(`[database] Fallback index also skipped (${fbErr?.message || fbErr}): ${stmt.slice(0, 80)}`);
        }
      } else {
        console.warn(`[database] Schema statement skipped (${err?.message || err}): ${stmt.slice(0, 80)}`);
      }
    }
  }
}

/**
 * Verifies if an in-memory SqlJsDatabase instance is structurally sound and uncorrupted.
 * Catches 'database disk image is malformed' before attempting schema mutations.
 */
function isDatabaseHealthy(db: SqlJsDatabase): boolean {
  try {
    db.exec('PRAGMA schema_version;');
    db.exec('SELECT COUNT(*) FROM sqlite_master;');
    const checkRes = db.exec('PRAGMA quick_check(1);');
    const result = checkRes[0]?.values[0]?.[0];
    return result === 'ok';
  } catch {
    return false;
  }
}

/**
 * Emergency data salvager for SQLite databases damaged by sudden power cuts ('database disk image is malformed').
 * It opens the damaged database buffer, bypasses corrupted b-tree index nodes via sequential table scans,
 * and recovers intact data from every readable table into a clean, newly initialized SQLite database.
 */
function salvageMalformedDatabase(SQL: any, malformedBuf: Buffer): SqlJsDatabase | null {
  try {
    console.log('[database] Starting emergency data salvage from malformed database...');
    const rawDb = new SQL.Database(malformedBuf);
    const salvagedDb = new SQL.Database();

    // Create fresh, pristine schema in the new database
    executeSchemaSafe(salvagedDb, SCHEMA);

    const tablesToSalvage = [
      'tenant_config',
      'users',
      'devices',
      'customers',
      'rooms',
      'cafe_tables',
      'shifts',
      'shift_expenses',
      'products',
      'product_stock_logs',
      'sessions',
      'invoices',
      'session_orders',
      'standalone_orders',
      'session_transfers',
      'session_pauses',
      'reservations',
      'sync_state'
    ];

    let totalRecovered = 0;
    for (const table of tablesToSalvage) {
      try {
        const res = rawDb.exec(`SELECT * FROM ${table};`);
        if (res && res[0] && res[0].values && res[0].values.length > 0) {
          const cols = res[0].columns;
          const rows = res[0].values;
          const placeholders = cols.map(() => '?').join(', ');
          const sql = `INSERT OR IGNORE INTO ${table} (${cols.map((c: string) => `"${c}"`).join(', ')}) VALUES (${placeholders});`;

          let tableCount = 0;
          for (const row of rows) {
            try {
              salvagedDb.run(sql, row);
              tableCount++;
            } catch {
              // Ignore single corrupted or constraint-violating row
            }
          }
          totalRecovered += tableCount;
          console.log(`[database] Salvaged ${tableCount}/${rows.length} records from table '${table}'.`);
        }
      } catch (tblErr: any) {
        console.warn(`[database] Table '${table}' corrupted or skipped (${tblErr?.message || tblErr}).`);
      }
    }

    if (totalRecovered > 0) {
      console.log(`✓ Data salvage successful! Recovered ${totalRecovered} total records from malformed database.`);
      return salvagedDb;
    }
    return null;
  } catch (salvageErr: any) {
    console.error('[database] Emergency data salvage failed:', salvageErr?.message || salvageErr);
    return null;
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initDatabase(): Promise<SqlJsDatabase> {
  if (_db) return _db;

  // Load wasmBinary explicitly so WebAssembly works reliably inside Electron app.asar
  let wasmBinary: Buffer | undefined;
  try {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    if (fs.existsSync(wasmPath)) {
      wasmBinary = fs.readFileSync(wasmPath);
    }
  } catch {
    const candidatePaths = [
      path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm'),
      path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
      path.join(__dirname, '../../../node_modules/sql.js/dist/sql-wasm.wasm'),
      path.join((process as any).resourcesPath || '', 'app.asar.unpacked/electron/server/node_modules/sql.js/dist/sql-wasm.wasm'),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        wasmBinary = fs.readFileSync(p);
        break;
      }
    }
  }

  const SQL = await initSqlJs(wasmBinary ? ({ wasmBinary: new Uint8Array(wasmBinary).buffer } as any) : undefined);
  const dbPath = getDbPath();
  const backupPath = `${dbPath}.bak`;
  let loaded = false;
  let corruptedBufCandidate: Buffer | null = null;

  // 1. Try to load existing ccms.db and verify it is healthy
  if (fs.existsSync(dbPath)) {
    try {
      const stats = fs.statSync(dbPath);
      if (stats.size > 0) {
        const buf = fs.readFileSync(dbPath);
        const candidateDb = new SQL.Database(buf);
        if (isDatabaseHealthy(candidateDb)) {
          _db = candidateDb;
          loaded = true;
          console.log(`[database] Successfully loaded and verified healthy ccms.db (${stats.size} bytes).`);
        } else {
          console.warn(`[database] ccms.db disk image is malformed (power cut damage). Initiating auto-recovery pipeline...`);
          corruptedBufCandidate = buf;
        }
      } else {
        console.warn('[database] ccms.db is 0 bytes (truncated during power cut). Initiating auto-recovery...');
      }
    } catch (dbErr: any) {
      console.error('[database] ccms.db is unreadable:', dbErr?.message || dbErr);
    }
  }

  // 2. If ccms.db was malformed or 0 bytes, execute recovery pipeline:
  if (!loaded) {
    // 2a. Attempt recovery from backup (ccms.db.bak)
    if (fs.existsSync(backupPath)) {
      try {
        console.log('[database] Checking backup: ccms.db.bak...');
        const buf = fs.readFileSync(backupPath);
        if (buf.length > 0) {
          const bakDb = new SQL.Database(buf);
          if (isDatabaseHealthy(bakDb)) {
            _db = bakDb;
            fs.copyFileSync(backupPath, dbPath);
            loaded = true;
            console.log('✓ Successfully recovered database from healthy ccms.db.bak!');
          } else {
            console.warn('[database] ccms.db.bak is also malformed.');
          }
        }
      } catch (bakErr: any) {
        console.warn('[database] Recovery from ccms.db.bak failed:', bakErr?.message || bakErr);
      }
    }

    // 2b. Attempt recovery from recent temporary snapshots (.tmp)
    if (!loaded) {
      try {
        const dataDir = path.dirname(dbPath);
        const tmpFiles = fs.readdirSync(dataDir)
          .filter(f => f.startsWith('ccms.db.tmp'))
          .map(f => path.join(dataDir, f))
          .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

        for (const tmpFile of tmpFiles) {
          try {
            console.log(`[database] Testing tmp candidate: ${path.basename(tmpFile)}...`);
            const buf = fs.readFileSync(tmpFile);
            if (buf.length > 0) {
              const testDb = new SQL.Database(buf);
              if (isDatabaseHealthy(testDb)) {
                _db = testDb;
                fs.copyFileSync(tmpFile, dbPath);
                loaded = true;
                console.log(`✓ Successfully recovered database from healthy candidate ${path.basename(tmpFile)}!`);
                break;
              }
            }
          } catch {
            // continue testing next candidate
          }
        }
      } catch (scanErr: any) {
        console.warn('[database] Scan for recovery candidates failed:', scanErr?.message || scanErr);
      }
    }

    // 2c. Emergency salvage of intact records from the malformed database buffer
    if (!loaded && corruptedBufCandidate) {
      const salvagedDb = salvageMalformedDatabase(SQL, corruptedBufCandidate);
      if (salvagedDb) {
        _db = salvagedDb;
        loaded = true;
        // Quarantine the malformed original for absolute safety
        const quarantinePath = `${dbPath}.corrupt.${Date.now()}`;
        try {
          fs.copyFileSync(dbPath, quarantinePath);
          console.log(`[database] Preserved original malformed database at: ${quarantinePath}`);
        } catch {}
        // Write the clean salvaged database to disk immediately
        saveDatabaseSync();
        console.log('✓ Successfully saved salvaged database to disk!');
      }
    }

    // 2d. If all recovery and salvage failed, quarantine and create fresh
    if (!loaded) {
      if (fs.existsSync(dbPath)) {
        const quarantinePath = `${dbPath}.corrupt.${Date.now()}`;
        try {
          fs.renameSync(dbPath, quarantinePath);
          console.warn(`[database] Unrecoverable database quarantined to: ${quarantinePath}`);
        } catch {}
      }
      console.log('[database] Initializing fresh SQLite database...');
      _db = new SQL.Database();
    }
  }

  if (!_db) {
    _db = new SQL.Database();
  }

  // Turn foreign keys OFF during schema setup and migrations
  try {
    _db.run('PRAGMA foreign_keys = OFF;');
  } catch {}

  // Create all tables safely statement-by-statement
  executeSchemaSafe(_db, SCHEMA);

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

    // Auto-migration for tenant_config plan and expires_at
    try {
      const tcInfo = _db.exec("PRAGMA table_info(tenant_config)");
      const tcCols = tcInfo[0]?.values.map(v => v[1] as string) || [];
      if (!tcCols.includes('plan')) {
        _db.run("ALTER TABLE tenant_config ADD COLUMN plan TEXT NOT NULL DEFAULT 'monthly_full';");
      }
      if (!tcCols.includes('expires_at')) {
        _db.run("ALTER TABLE tenant_config ADD COLUMN expires_at TEXT;");
      }
    } catch (e: any) {
      console.warn('[database] tenant_config column migration check:', e.message);
    }

    // Deduplicate and sanitize tenant_config if multiple rows exist from legacy bugs
    try {
      const checkRes = _db.exec('SELECT COUNT(*) FROM tenant_config');
      const count = (checkRes[0]?.values[0]?.[0] as number) || 0;
      if (count > 1) {
        console.log(`[database] Detected ${count} rows in tenant_config. Resolving authoritative active tenant...`);
        const authoritative = getActiveTenantConfig(_db);
        if (authoritative) {
          _db.run('DELETE FROM tenant_config WHERE tenant_id != ?', [authoritative.tenant_id]);
          console.log(`[database] Sanitized tenant_config: active tenant retained (${authoritative.tenant_id}).`);
        }
      }
    } catch (cleanupErr: any) {
      console.error('[database] tenant_config cleanup check failed:', cleanupErr.message);
    }

    // Auto-assign any records with NULL tenant_id to the authoritative active tenant_id
    const activeTenantId = getActiveTenantId(_db);
    if (activeTenantId) {
      const tenantTables = [
        'users', 'devices', 'customers', 'sessions', 'invoices',
        'reservations', 'products', 'rooms', 'shifts', 'shift_expenses',
        'standalone_orders', 'session_transfers', 'session_pauses',
        'product_stock_logs', 'cafe_tables'
      ];
      for (const t of tenantTables) {
        try {
          _db.run(`UPDATE ${t} SET tenant_id = ? WHERE tenant_id IS NULL;`, [activeTenantId]);
        } catch (tblErr: any) {
          console.warn(`[database] Auto-assign tenant_id skipped for ${t}:`, tblErr?.message || tblErr);
        }
      }
    }
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
    executeSchemaSafe(_db, `
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

  // Auto-migration helper for cafe_tables table
  try {
    executeSchemaSafe(_db, `
      CREATE TABLE IF NOT EXISTS cafe_tables (
        id           TEXT PRIMARY KEY,
        table_number TEXT NOT NULL,
        name         TEXT NOT NULL,
        capacity     INTEGER NOT NULL DEFAULT 4,
        device_id    TEXT REFERENCES devices(id) ON DELETE SET NULL,
        tenant_id    TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
        synced       INTEGER NOT NULL DEFAULT 0,
        synced_at    TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_cafe_tables_tenant ON cafe_tables(tenant_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cafe_tables_tenant_number ON cafe_tables(tenant_id, table_number);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cafe_tables_device ON cafe_tables(device_id) WHERE device_id IS NOT NULL;
    `);

    // Auto-sync table name and backing device name to table_number safely
    try {
      _db.run(`UPDATE cafe_tables SET name = table_number WHERE table_number IS NOT NULL AND name != table_number;`);
    } catch {}
    try {
      _db.run(`UPDATE devices SET name = (SELECT ct.table_number FROM cafe_tables ct WHERE ct.device_id = devices.id)
        WHERE type = 'table' AND id IN (SELECT device_id FROM cafe_tables WHERE device_id IS NOT NULL);`);
    } catch {}
  } catch (tErr: any) {
    console.error('[database] Cafe tables table creation/migration failed:', tErr.message);
  }

  // Auto-migration helper for shifts and shift_expenses
  try {
    executeSchemaSafe(_db, `
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
    executeSchemaSafe(_db, `
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
    try {
      _db.run('CREATE INDEX IF NOT EXISTS idx_standalone_orders_shift ON standalone_orders(shift_id);');
    } catch {}
    
    // Auto-migration for sync_state table
    executeSchemaSafe(_db, `
      CREATE TABLE IF NOT EXISTS sync_state (
        table_name     TEXT NOT NULL,
        tenant_id      TEXT NOT NULL,
        last_synced_at TEXT NOT NULL,
        PRIMARY KEY (table_name, tenant_id)
      );
    `);
  } catch (sErr: any) {
    console.error('[database] Shifts/expenses/transfers migration failed:', sErr.message);
  }

  // Re-enable foreign keys after all schema updates and migrations have safely completed
  try {
    _db.run('PRAGMA foreign_keys = ON;');
  } catch (fkErr: any) {
    console.warn('[database] Failed to re-enable foreign keys:', fkErr?.message || fkErr);
  }

  // Register process exit listeners for safe shutdown
  registerLifecycleHandlers();

  // Initial synchronous save after schema creation and migrations
  saveDatabaseSync();

  console.log(`[database] SQLite initialized → ${dbPath}`);
  return _db;
}

/** Get the database instance (must call initDatabase first). */
export function getDb(): SqlJsDatabase {
  if (!_db) throw new Error('Database not initialized. Call initDatabase() first.');
  return _db;
}

// ─── Persistence & Auto-Save ──────────────────────────────────────────────────

let _isDirty = false;
let _isSaving = false;
let _saveDebounceTimer: NodeJS.Timeout | null = null;
let _lifecycleRegistered = false;

function registerLifecycleHandlers(): void {
  if (_lifecycleRegistered) return;
  _lifecycleRegistered = true;

  const onExit = () => {
    try {
      if (_isDirty && _db && !_suppressSave) {
        saveDatabaseSync();
      }
    } catch {
      // Ignore during exit
    }
  };

  process.on('beforeExit', onExit);
  process.on('exit', onExit);
  process.on('SIGINT', () => {
    onExit();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    onExit();
    process.exit(0);
  });
}

/** Synchronously persist the in-memory database to disk with atomic rename. */
export function saveDatabaseSync(): void {
  if (_suppressSave || !_db) return;
  if (_saveDebounceTimer) {
    clearTimeout(_saveDebounceTimer);
    _saveDebounceTimer = null;
  }
  try {
    const data = _db.export();
    const buffer = Buffer.from(data);
    const dbPath = getDbPath();
    const tmpPath = `${dbPath}.tmp`;
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, dbPath);
    _isDirty = false;
  } catch (err: any) {
    console.error('[database] Synchronous save failed:', err?.message || err);
  }
}

/** Flush any pending changes to disk immediately. */
export function flushDatabaseSync(): void {
  if (_isDirty) {
    saveDatabaseSync();
  }
}

/**
 * Persist the in-memory database to disk.
 * Non-blocking: debounces writes by default to prevent freezing the Node.js event loop.
 * If immediate is true, performs a synchronous write.
 */
export function saveDatabase(immediate = false): void {
  if (_suppressSave || !_db) return;
  _isDirty = true;

  if (immediate) {
    saveDatabaseSync();
    return;
  }

  if (_saveDebounceTimer) return;

  _saveDebounceTimer = setTimeout(async () => {
    _saveDebounceTimer = null;
    if (!_isDirty || _suppressSave || !_db || _isSaving) return;

    _isSaving = true;
    try {
      const data = _db.export();
      const buffer = Buffer.from(data);
      const dbPath = getDbPath();
      const tmpPath = `${dbPath}.tmp.${Date.now()}`;
      await fs.promises.writeFile(tmpPath, buffer);
      await fs.promises.rename(tmpPath, dbPath);
      _isDirty = false;
    } catch (err: any) {
      console.error('[database] Asynchronous debounced save failed:', err?.message || err);
    } finally {
      _isSaving = false;
      if (_isDirty) {
        saveDatabase();
      }
    }
  }, 300);
}

/**
 * Auto-save interval — ensures dirty data is persisted periodically.
 */
let _saveInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSave(intervalMs = 5000): void {
  if (_saveInterval) return;
  _saveInterval = setInterval(() => {
    if (_isDirty) {
      saveDatabase();
    }
  }, intervalMs);
}

export function stopAutoSave(): void {
  if (_saveInterval) {
    clearInterval(_saveInterval);
    _saveInterval = null;
  }
  flushDatabaseSync();
}

// ─── Authoritative Tenant Configuration Helpers ──────────────────────────────

export interface TenantConfig {
  id: number;
  tenant_id: string;
  tenant_name: string;
  owner_email: string;
  status: string;
  plan?: string;
  expires_at?: string | null;
  activated_at: string | null;
  last_checked_at: string | null;
}

export interface TenantConfigInput {
  tenant_id: string;
  tenant_name: string;
  owner_email: string;
  status?: string;
  plan?: string;
  expires_at?: string | null;
}

/**
 * Gets the authoritative active tenant configuration for this local installation.
 * Resolves the single active tenant row. If multiple rows exist (from legacy versions),
 * it resolves the tenant matching the local active admin user or the latest updated row.
 */
export function getActiveTenantConfig(database?: SqlJsDatabase): TenantConfig | null {
  let db: SqlJsDatabase;
  try {
    db = database || getDb();
  } catch {
    return null;
  }

  try {
    const check = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tenant_config'");
    if (!check || !check[0] || !check[0].values || check[0].values.length === 0) {
      return null;
    }

    const rowsRes = db.exec('SELECT * FROM tenant_config');
    if (!rowsRes || !rowsRes[0] || !rowsRes[0].values || rowsRes[0].values.length === 0) {
      return null;
    }

    const cols = rowsRes[0].columns;
    const rows = rowsRes[0].values.map((v: any[]) => {
      const obj: any = {};
      cols.forEach((col: string, i: number) => {
        obj[col] = v[i];
      });
      return obj as TenantConfig;
    });

    if (rows.length === 1) {
      return rows[0];
    }

    // If multiple rows exist from legacy bugs, find the authoritative tenant
    // 1. Look for matching local admin in `users` table
    try {
      const adminRes = db.exec("SELECT tenant_id FROM users WHERE role = 'admin' AND tenant_id IS NOT NULL ORDER BY updated_at DESC, created_at DESC LIMIT 1");
      if (adminRes && adminRes[0] && adminRes[0].values && adminRes[0].values[0]) {
        const adminTenantId = adminRes[0].values[0][0] as string;
        const matchingRow = rows.find(r => r.tenant_id === adminTenantId);
        if (matchingRow) {
          return matchingRow;
        }
      }
    } catch {
      // ignore
    }

    // 2. Fallback to latest checked/activated row
    const sorted = [...rows].sort((a, b) => {
      const timeA = a.last_checked_at || a.activated_at || '';
      const timeB = b.last_checked_at || b.activated_at || '';
      return timeB.localeCompare(timeA);
    });

    return sorted[0] || null;
  } catch (err: any) {
    console.error('[database] Failed to getActiveTenantConfig:', err?.message || err);
    return null;
  }
}

/**
 * Gets the authoritative active tenant ID for this local installation.
 */
export function getActiveTenantId(database?: SqlJsDatabase): string | null {
  const config = getActiveTenantConfig(database);
  return config ? config.tenant_id : null;
}

/**
 * Sets or replaces the single active tenant configuration for this local installation.
 * Ensures that tenant_config holds only one authoritative record.
 */
export function setActiveTenantConfig(config: TenantConfigInput, database?: SqlJsDatabase): void {
  const db = database || getDb();
  const status = config.status || 'active';
  const plan = config.plan || 'monthly_full';
  const expiresAt = config.expires_at || null;

  db.run('DELETE FROM tenant_config');
  db.run(
    `INSERT INTO tenant_config (tenant_id, tenant_name, owner_email, status, plan, expires_at, activated_at, last_checked_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [config.tenant_id, config.tenant_name, config.owner_email, status, plan, expiresAt]
  );
  saveDatabase();
}

/**
 * Updates status, plan, and last_checked_at timestamp for the active tenant.
 */
export function updateActiveTenantStatus(status: string, database?: SqlJsDatabase, plan?: string, expiresAt?: string | null): void {
  const db = database || getDb();
  const activeTenantId = getActiveTenantId(db);
  if (!activeTenantId) return;

  if (plan && expiresAt !== undefined) {
    db.run(
      `UPDATE tenant_config SET status = ?, plan = ?, expires_at = ?, last_checked_at = datetime('now') WHERE tenant_id = ?`,
      [status, plan, expiresAt, activeTenantId]
    );
  } else if (plan) {
    db.run(
      `UPDATE tenant_config SET status = ?, plan = ?, last_checked_at = datetime('now') WHERE tenant_id = ?`,
      [status, plan, activeTenantId]
    );
  } else {
    db.run(
      `UPDATE tenant_config SET status = ?, last_checked_at = datetime('now') WHERE tenant_id = ?`,
      [status, activeTenantId]
    );
  }
  saveDatabase();
}
