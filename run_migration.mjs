/**
 * Attempts to execute the 002 migration SQL script against the remote Supabase project.
 * Tries multiple API endpoints to find one that works.
 */

import { readFileSync } from 'fs';
import 'dotenv/config';

// Read credentials from .env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate environment variables
if (!SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL in .env');
}

if (!SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in .env');
}

// Read the migration SQL
const migrationSql = readFileSync(
  './server/migrations/002_session_upgrades.sql',
  'utf-8'
);

const endpoints = [
  { name: 'pg/query', url: `${SUPABASE_URL}/pg/query` },
  { name: 'pg-meta/default/query', url: `${SUPABASE_URL}/pg-meta/default/query` },
  { name: 'rest/v1/rpc/exec_sql', url: `${SUPABASE_URL}/rest/v1/rpc/exec_sql` },
  { name: 'sql', url: `${SUPABASE_URL}/sql` },
  { name: 'query', url: `${SUPABASE_URL}/query` },
  {
    name: 'api.supabase.com/v1 (mgmt)',
    url: 'https://api.supabase.com/v1/projects/nluqmfghcpgpmqnyzgwr/database/query',
  },
];

async function tryEndpoint(ep, sql) {
  try {
    const res = await fetch(ep.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });

    const text = await res.text();

    return {
      name: ep.name,
      status: res.status,
      ok: res.ok,
      body: text.slice(0, 500),
    };
  } catch (err) {
    return {
      name: ep.name,
      status: 'ERROR',
      ok: false,
      body: err.message,
    };
  }
}

console.log('=== Executing 002 Migration on Supabase endpoints ===\n');

for (const ep of endpoints) {
  const result = await tryEndpoint(ep, migrationSql);

  console.log(`[${result.ok ? 'OK' : result.status}] ${result.name}`);
  console.log(`     ${result.body}\n`);

  if (result.ok) {
    console.log(
      `>>> Migration successfully applied via endpoint: ${result.name} <<<`
    );
    break;
  }
}