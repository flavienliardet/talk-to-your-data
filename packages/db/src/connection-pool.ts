/**
 * Database connection pooling using centralized Databricks authentication
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';
import * as schema from './schema';
import { getConnectionUrl, getSchemaName } from './connection';
import { getDatabricksToken } from '@chat-template/auth';

// Connection pool management
let sqlConnection: postgres.Sql | null = null;
let currentToken: string | null = null;

// Caching to avoid redundant work on every request
let searchPathSet = false;
let cachedDrizzleDb: PostgresJsDatabase<typeof schema> | null = null;
let lastTokenCheck = 0;
const TOKEN_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

function resetCaches() {
  searchPathSet = false;
  cachedDrizzleDb = null;
  lastTokenCheck = 0;
}

async function getConnection(): Promise<postgres.Sql> {
  const { default: postgres } = await import('postgres');

  const now = Date.now();
  if (sqlConnection && now - lastTokenCheck < TOKEN_CHECK_INTERVAL) {
    return sqlConnection;
  }

  const freshToken = await getDatabricksToken();

  if (sqlConnection && currentToken !== freshToken) {
    console.log('[DB Pool] Token changed, closing existing connection pool');
    await sqlConnection.end();
    sqlConnection = null;
    currentToken = null;
    resetCaches();
  }

  if (!sqlConnection) {
    const connectionUrl = await getConnectionUrl();
    sqlConnection = postgres(connectionUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      max_lifetime: 60 * 10,
    });

    currentToken = freshToken;
    resetCaches();
    console.log('[DB Pool] Created new connection pool with fresh OAuth token');
  }

  lastTokenCheck = now;
  return sqlConnection;
}

export async function warmupDb(): Promise<void> {
  try {
    await getDb();
    console.log('[DB Pool] Database connection warmed up successfully');
  } catch (error) {
    console.error('[DB Pool] Failed to warm up database connection:', error);
  }
}

export async function getDb() {
  const sql = await getConnection();

  if (!searchPathSet) {
    const schemaName = getSchemaName();
    if (schemaName !== 'public') {
      try {
        await sql`SET search_path TO ${sql(schemaName)}, public`;
        console.log(
          `[DB Pool] Set search_path to include schema '${schemaName}'`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[DB Pool] Failed to set search_path for '${schemaName}':`,
          errorMessage,
        );
      }
    }
    searchPathSet = true;
  }

  if (!cachedDrizzleDb) {
    cachedDrizzleDb = drizzle(sql, { schema });
  }

  return cachedDrizzleDb;
}
