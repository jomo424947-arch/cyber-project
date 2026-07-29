/**
 * Supabase-compatible query builder for SQLite.
 *
 * Provides a chainable API that mirrors Supabase's PostgREST interface:
 *   localDb.from('devices').select('*').eq('status','available').order('name')
 *
 * This lets us swap Supabase for SQLite with MINIMAL changes to controllers.
 */

import crypto from 'crypto';
import { getDb, saveDatabase } from './database';

// ─── Types ───────────────────────────────────────────────────────────────────

interface QueryResult<T = any> {
  data: T | null;
  error: QueryError | null;
  count?: number;
}

interface QueryError {
  message: string;
  code?: string;
  details?: string;
}

// Mapping for foreign-key join relations used in Supabase select strings
// e.g.  "device:devices(id,name,type)"  →  JOIN devices AS device ON ...
interface JoinDef {
  alias: string;        // e.g. "device"
  table: string;        // e.g. "devices"
  columns: string[];    // e.g. ["id","name","type"]
}

// FK map: child_table.column → parent_table
const FK_MAP: Record<string, Record<string, string>> = {
  sessions: {
    device_id: 'devices',
    customer_id: 'customers',
    created_by: 'users',
  },
  invoices: {
    session_id: 'sessions',
  },
  reservations: {
    device_id: 'devices',
    customer_id: 'customers',
    created_by: 'users',
  },
  session_orders: {
    session_id: 'sessions',
    product_id: 'products',
  },
  session_audit_log: {
    session_id: 'sessions',
    edited_by: 'users',
  },
};

// Nested join map for two-level joins  e.g.  session:sessions(… device:devices(…))
const NESTED_FK_MAP: Record<string, Record<string, string>> = {
  sessions: {
    device_id: 'devices',
    customer_id: 'customers',
  },
};

// ─── Query Builder ───────────────────────────────────────────────────────────

class QueryBuilder {
  private _table: string;
  private _selectCols: string = '*';
  private _joins: JoinDef[] = [];
  private _nestedJoins: Map<string, JoinDef[]> = new Map();
  private _where: Array<{ col: string; op: string; val: any; table?: string }> = [];
  private _orClauses: string[] = [];
  private _orderBy: Array<{ col: string; asc: boolean }> = [];
  private _limitVal: number | null = null;
  private _insertData: Record<string, any> | null = null;
  private _updateData: Record<string, any> | null = null;
  private _deleteMode = false;
  private _countMode: 'exact' | null = null;
  private _headMode = false;
  private _returning = false;
  private _returnCols: string = '*';
  private _returnJoins: JoinDef[] = [];
  private _returnNestedJoins: Map<string, JoinDef[]> = new Map();
  private _singleRow = false;
  private _maybeSingle = false;

  constructor(table: string) {
    this._table = table;
  }

  // ─── SELECT ──────────────────────────────────────────────────────────────

  /**
   * Parse Supabase-style select string.
   *
   * Examples:
   *   '*'
   *   'id, name, type'
   *   '*, device:devices(id,name,type,hourly_rate)'
   *   '*, device:devices(id,name,type,hourly_rate), customer:customers(id,name,phone)'
   *   '*, session:sessions(id, started_at, device:devices(id,name))'
   */
  select(cols: string = '*', opts?: { count?: 'exact'; head?: boolean }): this {
    if (opts?.count) this._countMode = opts.count;
    if (opts?.head) this._headMode = true;

    const { baseCols, joins, nestedJoins } = this._parseSelect(cols);
    this._selectCols = baseCols;
    this._joins = joins;
    this._nestedJoins = nestedJoins;
    return this;
  }

  private _parseSelect(cols: string): { baseCols: string; joins: JoinDef[]; nestedJoins: Map<string, JoinDef[]> } {
    const joins: JoinDef[] = [];
    const nestedJoins = new Map<string, JoinDef[]>();

    // Match top-level join patterns:  alias:table(columns_or_nested)
    // We need to handle nested parentheses for nested joins
    const parts: string[] = [];
    let depth = 0;
    let current = '';

    for (const ch of cols) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());

    const baseParts: string[] = [];

    for (const part of parts) {
      // Match alias:table(inner)
      const joinMatch = part.match(/^(\w+):(\w+)\((.+)\)$/s);
      if (joinMatch) {
        const [, alias, table, inner] = joinMatch;
        // Check if inner contains nested joins
        const { baseCols: innerCols, joins: innerJoins } = this._parseSelect(inner);
        joins.push({ alias, table, columns: innerCols.split(',').map(c => c.trim()).filter(Boolean) });
        if (innerJoins.length > 0) {
          nestedJoins.set(alias, innerJoins);
        }
      } else {
        baseParts.push(part);
      }
    }

    return { baseCols: baseParts.join(', ') || '*', joins, nestedJoins };
  }

  // ─── Filters ─────────────────────────────────────────────────────────────

  eq(col: string, val: any): this {
    this._where.push({ col, op: '=', val });
    return this;
  }

  neq(col: string, val: any): this {
    this._where.push({ col, op: '!=', val });
    return this;
  }

  gt(col: string, val: any): this {
    this._where.push({ col, op: '>', val });
    return this;
  }

  gte(col: string, val: any): this {
    this._where.push({ col, op: '>=', val });
    return this;
  }

  lt(col: string, val: any): this {
    this._where.push({ col, op: '<', val });
    return this;
  }

  lte(col: string, val: any): this {
    this._where.push({ col, op: '<=', val });
    return this;
  }

  in(col: string, vals: any[]): this {
    this._where.push({ col, op: 'IN', val: vals });
    return this;
  }

  not(col: string, op: string, val: any): this {
    if (op === 'is' && val === null) {
      this._where.push({ col, op: 'IS NOT', val: null });
    } else {
      this._where.push({ col, op: `NOT ${op}`, val });
    }
    return this;
  }

  is(col: string, val: null): this {
    this._where.push({ col, op: 'IS', val: null });
    return this;
  }

  like(col: string, val: string): this {
    this._where.push({ col, op: 'LIKE', val });
    return this;
  }

  or(clause: string): this {
    this._orClauses.push(clause);
    return this;
  }

  // ─── ORDER / LIMIT ──────────────────────────────────────────────────────

  order(col: string, opts?: { ascending?: boolean }): this {
    this._orderBy.push({ col, asc: opts?.ascending ?? true });
    return this;
  }

  limit(n: number): this {
    this._limitVal = n;
    return this;
  }

  // ─── DML ─────────────────────────────────────────────────────────────────

  insert(data: Record<string, any> | Record<string, any>[]): QueryBuilder {
    if (Array.isArray(data)) {
      // For array inserts, insert each row
      const results: any[] = [];
      let lastError: QueryError | null = null;
      for (const row of data) {
        const builder = new QueryBuilder(this._table);
        builder._insertData = { ...row };
        const res = builder._execInsert();
        if (res.error) { lastError = res.error; break; }
        if (res.data) results.push(res.data);
      }
      // Return a builder that when executed returns all results
      this._insertData = data[0] || {};
      // Store batch results for retrieval
      (this as any)._batchResults = results;
      (this as any)._batchError = lastError;
      return this;
    }
    this._insertData = data;
    return this;
  }

  update(data: Record<string, any>): this {
    this._updateData = data;
    return this;
  }

  delete(opts?: { count?: 'exact' }): this {
    this._deleteMode = true;
    if (opts?.count) this._countMode = opts.count;
    return this;
  }

  // ─── Return shape ────────────────────────────────────────────────────────

  /** Return matched row(s) after INSERT/UPDATE/DELETE. */
  private _enableReturning(cols: string): this {
    this._returning = true;
    const { baseCols, joins, nestedJoins } = this._parseSelect(cols);
    this._returnCols = baseCols;
    this._returnJoins = joins;
    this._returnNestedJoins = nestedJoins;
    return this;
  }

  /** Expect exactly one row. */
  single(): Promise<QueryResult> {
    this._singleRow = true;
    return this._exec();
  }

  /** Expect zero or one row. */
  maybeSingle(): Promise<QueryResult> {
    this._maybeSingle = true;
    return this._exec();
  }

  /** Allow chaining .select() after insert/update/delete — just returns matching data. */
  // Supabase pattern: .insert({...}).select('*').single()
  // We override select on mutating builders to enable returning
  private _isMutating(): boolean {
    return !!(this._insertData || this._updateData || this._deleteMode);
  }

  // ─── Execution ───────────────────────────────────────────────────────────

  /** Thenable — allows `const { data, error } = await builder;` */
  then<TResult = QueryResult>(
    onfulfilled?: (value: QueryResult) => TResult | PromiseLike<TResult>,
    onrejected?: (reason: any) => TResult | PromiseLike<TResult>
  ): Promise<TResult> {
    return this._exec().then(onfulfilled, onrejected);
  }

  private _exec(): Promise<QueryResult> {
    try {
      if (this._insertData) return Promise.resolve(this._execInsert());
      if (this._updateData) return Promise.resolve(this._execUpdate());
      if (this._deleteMode) return Promise.resolve(this._execDelete());
      return Promise.resolve(this._execSelect());
    } catch (e: any) {
      return Promise.resolve({ data: null, error: { message: e.message, code: e.code } });
    }
  }

  // ─── SELECT execution ───────────────────────────────────────────────────

  private _execSelect(): QueryResult {
    const db = getDb();

    if (this._headMode && this._countMode) {
      // Count-only query
      const { sql, params } = this._buildCountSql();
      try {
        const row = db.exec(sql, params);
        const count = row[0]?.values[0]?.[0] as number ?? 0;
        return { data: null, error: null, count };
      } catch (e: any) {
        return { data: null, error: { message: e.message, code: e.code } };
      }
    }

    const { sql, params } = this._buildSelectSql();
    try {
      const stmt = db.prepare(sql);
      stmt.bind(params);

      const rows: any[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();

      // Post-process: resolve joins
      const processed = rows.map(row => this._resolveJoins(row));

      // Convert SQLite integers to booleans for known boolean columns
      const result = processed.map(row => this._convertTypes(row));

      if (this._singleRow) {
        if (result.length === 0) {
          return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
        }
        return { data: result[0], error: null };
      }
      if (this._maybeSingle) {
        return { data: result[0] ?? null, error: null };
      }
      return { data: result, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e.message, code: e.code } };
    }
  }

  private _buildSelectSql(): { sql: string; params: any[] } {
    const cols = this._selectCols === '*' ? `"${this._table}".*` : this._selectCols.split(',').map(c => {
      const ct = c.trim();
      if (ct === '*') return `"${this._table}".*`;
      return `"${this._table}"."${ct}"`;
    }).join(', ');

    let sql = `SELECT ${cols} FROM "${this._table}"`;
    const params: any[] = [];

    const { whereClause, whereParams } = this._buildWhere();
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
      params.push(...whereParams);
    }

    if (this._orderBy.length) {
      const orders = this._orderBy.map(o => `"${this._table}"."${o.col}" ${o.asc ? 'ASC' : 'DESC'}`);
      sql += ` ORDER BY ${orders.join(', ')}`;
    }

    if (this._limitVal !== null) {
      sql += ` LIMIT ?`;
      params.push(this._limitVal);
    }

    return { sql, params };
  }

  private _buildCountSql(): { sql: string; params: any[] } {
    let sql = `SELECT COUNT(*) FROM "${this._table}"`;
    const params: any[] = [];

    const { whereClause, whereParams } = this._buildWhere();
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
      params.push(...whereParams);
    }

    return { sql, params };
  }

  private _buildWhere(): { whereClause: string; whereParams: any[] } {
    const clauses: string[] = [];
    const params: any[] = [];

    for (const w of this._where) {
      const qualifiedCol = `"${this._table}"."${w.col}"`;
      if (w.op === 'IN') {
        const placeholders = (w.val as any[]).map(() => '?').join(',');
        clauses.push(`${qualifiedCol} IN (${placeholders})`);
        params.push(...w.val);
      } else if (w.op === 'IS' || w.op === 'IS NOT') {
        clauses.push(`${qualifiedCol} ${w.op} NULL`);
      } else {
        clauses.push(`${qualifiedCol} ${w.op} ?`);
        params.push(w.val);
      }
    }

    return { whereClause: clauses.join(' AND '), whereParams: params };
  }

  /** Resolve join data by fetching related rows. */
  private _resolveJoins(row: Record<string, any>): Record<string, any> {
    const db = getDb();
    const result = { ...row };

    for (const join of this._joins) {
      const fkMap = FK_MAP[this._table];
      if (!fkMap) continue;

      // Find the FK column that points to the join table
      let fkCol: string | null = null;
      for (const [col, tbl] of Object.entries(fkMap)) {
        if (tbl === join.table) {
          fkCol = col;
          break;
        }
      }

      if (!fkCol || row[fkCol] === null || row[fkCol] === undefined) {
        result[join.alias] = null;
        continue;
      }

      const cols = join.columns.map(c => `"${c}"`).join(', ');
      const stmt = db.prepare(`SELECT ${cols} FROM "${join.table}" WHERE "id" = ?`);
      stmt.bind([row[fkCol]]);

      if (stmt.step()) {
        const joinRow = stmt.getAsObject();
        // Resolve nested joins if any
        const nestedJoins = this._nestedJoins.get(join.alias);
        if (nestedJoins) {
          for (const nested of nestedJoins) {
            const nestedFkMap = FK_MAP[join.table] || NESTED_FK_MAP[join.table];
            if (!nestedFkMap) continue;
            let nestedFkCol: string | null = null;
            for (const [col, tbl] of Object.entries(nestedFkMap)) {
              if (tbl === nested.table) { nestedFkCol = col; break; }
            }
            if (nestedFkCol && joinRow[nestedFkCol]) {
              const nestedCols = nested.columns.map(c => `"${c}"`).join(', ');
              const nestedStmt = db.prepare(`SELECT ${nestedCols} FROM "${nested.table}" WHERE "id" = ?`);
              nestedStmt.bind([joinRow[nestedFkCol]]);
              if (nestedStmt.step()) {
                (joinRow as any)[nested.alias] = this._convertTypes(nestedStmt.getAsObject());
              } else {
                (joinRow as any)[nested.alias] = null;
              }
              nestedStmt.free();
            } else {
              (joinRow as any)[nested.alias] = null;
            }
          }
        }
        result[join.alias] = this._convertTypes(joinRow);
      } else {
        result[join.alias] = null;
      }
      stmt.free();
    }

    return result;
  }

  /** Convert SQLite types to JS types matching Supabase output. */
  private _convertTypes(row: Record<string, any>): Record<string, any> {
    const boolCols = ['paid', 'archived', 'is_overtime', 'edited_start_at', 'synced'];
    const jsonCols = ['specs'];
    const numericCols = ['hourly_rate', 'hourly_rate_multi', 'hourly_rate_override', 'amount', 'total_cost', 'price', 'unit_price', 'total_price'];

    for (const key of Object.keys(row)) {
      if (boolCols.includes(key)) {
        row[key] = !!row[key];
      }
      if (jsonCols.includes(key) && typeof row[key] === 'string') {
        try { row[key] = JSON.parse(row[key]); } catch { /* keep as string */ }
      }
      if (numericCols.includes(key) && row[key] !== null && row[key] !== undefined) {
        row[key] = Number(row[key]);
      }
    }
    return row;
  }

  // ─── INSERT execution ──────────────────────────────────────────────────

  private _execInsert(): QueryResult {
    const db = getDb();
    const data = this._insertData!;

    // Auto-generate UUID if id not provided
    if (!data.id) data.id = crypto.randomUUID();

    // Auto-inject tenant_id for multi-tenant tables
    const multiTenantTables = ['users', 'devices', 'customers', 'sessions', 'invoices', 'reservations', 'products'];
    if (multiTenantTables.includes(this._table) && !data.tenant_id) {
      try {
        const stmt = db.prepare('SELECT tenant_id FROM tenant_config LIMIT 1');
        if (stmt.step()) {
          data.tenant_id = stmt.getAsObject().tenant_id;
        }
        stmt.free();
      } catch (err) {
        // Table may not exist yet during initial migrations
      }
    }

    // Convert JS types for SQLite
    const prepared = this._prepareForSqlite(data);

    const cols = Object.keys(prepared);
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT INTO "${this._table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

    try {
      db.run(sql, cols.map(c => prepared[c]));
      // Queue for sync
      this._queueSync('INSERT', data.id, data);
      saveDatabase();

      if (this._returning || this._singleRow || this._maybeSingle) {
        // Fetch the inserted row with joins
        const fetchBuilder = new QueryBuilder(this._table);
        fetchBuilder._selectCols = this._returnCols || this._selectCols || '*';
        fetchBuilder._joins = this._returnJoins.length ? this._returnJoins : this._joins;
        fetchBuilder._nestedJoins = this._returnNestedJoins.size ? this._returnNestedJoins : this._nestedJoins;
        fetchBuilder._where = [{ col: 'id', op: '=', val: data.id }];
        fetchBuilder._singleRow = this._singleRow;
        fetchBuilder._maybeSingle = this._maybeSingle;
        return fetchBuilder._execSelect();
      }

      return { data: { id: data.id, ...data }, error: null };
    } catch (e: any) {
      // Map SQLite constraint errors to Supabase-like error codes
      if (e.message?.includes('UNIQUE constraint failed') || e.message?.includes('SQLITE_CONSTRAINT_UNIQUE')) {
        return { data: null, error: { message: e.message, code: '23505' } };
      }
      return { data: null, error: { message: e.message, code: e.code } };
    }
  }

  // ─── UPDATE execution ──────────────────────────────────────────────────

  private _execUpdate(): QueryResult {
    const db = getDb();
    const data = this._updateData!;
    const prepared = this._prepareForSqlite(data);

    const setClauses = Object.keys(prepared).map(c => `"${c}" = ?`);
    const setValues = Object.values(prepared);

    let sql = `UPDATE "${this._table}" SET ${setClauses.join(', ')}`;
    const params = [...setValues];

    const { whereClause, whereParams } = this._buildWhere();
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
      params.push(...whereParams);
    }

    try {
      db.run(sql, params);

      // Queue for sync — find the id from where clause
      const idWhere = this._where.find(w => w.col === 'id');
      if (idWhere) {
        this._queueSync('UPDATE', idWhere.val, data);
      }
      saveDatabase();

      if (this._returning || this._singleRow || this._maybeSingle) {
        const fetchBuilder = new QueryBuilder(this._table);
        fetchBuilder._selectCols = this._returnCols || this._selectCols || '*';
        fetchBuilder._joins = this._returnJoins.length ? this._returnJoins : this._joins;
        fetchBuilder._nestedJoins = this._returnNestedJoins.size ? this._returnNestedJoins : this._nestedJoins;
        fetchBuilder._where = [...this._where];
        fetchBuilder._singleRow = this._singleRow;
        fetchBuilder._maybeSingle = this._maybeSingle;
        return fetchBuilder._execSelect();
      }

      return { data: null, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e.message, code: e.code } };
    }
  }

  // ─── DELETE execution ──────────────────────────────────────────────────

  private _execDelete(): QueryResult {
    const db = getDb();

    // Get count before delete if needed
    let count = 0;
    if (this._countMode) {
      const { sql: countSql, params: countParams } = this._buildCountSql();
      const res = db.exec(countSql, countParams);
      count = (res[0]?.values[0]?.[0] as number) ?? 0;
    }

    // Queue for sync before deleting
    const idWhere = this._where.find(w => w.col === 'id');
    if (idWhere) {
      this._queueSync('DELETE', idWhere.val, null);
    }

    let sql = `DELETE FROM "${this._table}"`;
    const params: any[] = [];

    const { whereClause, whereParams } = this._buildWhere();
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
      params.push(...whereParams);
    }

    try {
      db.run(sql, params);
      saveDatabase();
      return { data: null, error: null, count: count || undefined };
    } catch (e: any) {
      return { data: null, error: { message: e.message, code: e.code } };
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private _prepareForSqlite(data: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      if (val === undefined) continue;
      if (typeof val === 'boolean') {
        result[key] = val ? 1 : 0;
      } else if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
        result[key] = JSON.stringify(val);
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  private _queueSync(operation: string, recordId: string, payload: any): void {
    try {
      const db = getDb();
      db.run(
        `INSERT INTO sync_queue (table_name, record_id, operation, payload) VALUES (?, ?, ?, ?)`,
        [this._table, recordId, operation, payload ? JSON.stringify(payload) : null]
      );
    } catch {
      // Non-critical — sync will catch up on next online check
    }
  }
}

// ─── Supabase-compatible wrapper ─────────────────────────────────────────────

/**
 * Drop-in replacement for `supabase` — provides `.from(table)` with
 * the same chainable API that the controllers already use.
 */
class LocalSupabase {
  from(table: string): QueryBuilder {
    return new QueryBuilder(table);
  }

  // Stub for supabase.auth — not used in local mode
  auth = {
    getUser: async (_token: string) => ({ data: { user: null }, error: { message: 'Use local auth' } }),
    signInWithPassword: async (_creds: any) => ({ data: { session: null, user: null }, error: { message: 'Use local auth' } }),
    signUp: async (_creds: any) => ({ data: { session: null, user: null }, error: { message: 'Use local auth' } }),
    refreshSession: async (_opts: any) => ({ data: { session: null, user: null }, error: { message: 'Use local auth' } }),
    signInWithOAuth: async (_opts: any) => ({ data: { url: null }, error: { message: 'Not available in desktop mode' } }),
    exchangeCodeForSession: async (_code: string) => ({ data: { session: null, user: null as any }, error: { message: 'Not available' } }),
    resetPasswordForEmail: async (_email: string, _opts?: any) => ({ error: null }),
    verifyOtp: async (_opts: any) => ({ data: { session: null, user: null as any }, error: { message: 'Use local auth' } }),
    updateUser: async (_data: any) => ({ error: null }),
    admin: {
      signOut: async (_token: string) => ({ error: null }),
    },
    persistSession: false,
    autoRefreshToken: false,
  };
}

export const localDb = new LocalSupabase();
export type { QueryBuilder, QueryResult, QueryError };
